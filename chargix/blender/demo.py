# CHARGIX · product photos and a 3D model for the made-up "Sweet & Co." demo storefronts.
# usage: python demo.py <outdir> [spp]   → demo-hero, demo-p1..p4, demo-kitchen (.png) and demo-box.glb
import bpy, bmesh, math, os, sys, random
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); PH = os.path.join(HERE, "..", "assets", "ph"); FONT = os.path.join(HERE, "fonts", "Manrope-Medium.ttf")
OUT = sys.argv[1]; SPP = int(sys.argv[2]) if len(sys.argv) > 2 else 64; os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True); scene = bpy.context.scene; col = scene.collection
def hexc(h):
    h = h.lstrip("#"); s = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in s) + (1,)
def mat(name, color, rough=0.6, noise=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = hexc(color); b.inputs["Roughness"].default_value = rough
    if noise:
        n = nt.nodes.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = noise[0]; n.inputs["Detail"].default_value = 8
        r = nt.nodes.new("ShaderNodeValToRGB"); r.color_ramp.elements[0].color = hexc(noise[1]); r.color_ramp.elements[1].color = hexc(noise[2])
        nt.links.new(n.outputs["Fac"], r.inputs["Fac"]); nt.links.new(r.outputs["Color"], b.inputs["Base Color"])
        bp = nt.nodes.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = noise[3]; nt.links.new(n.outputs["Fac"], bp.inputs["Height"]); nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m
def tex_mat(name, folder, scale, tint=None):
    d = os.path.join(PH, "tex", folder); m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (scale,) * 3; nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(os.path.join(d, "Diffuse.jpg")); t.projection = "BOX"; nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
    if tint:
        mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs[0].default_value = 1; nt.links.new(t.outputs["Color"], mx.inputs[6]); mx.inputs[7].default_value = hexc(tint); nt.links.new(mx.outputs[2], b.inputs["Base Color"])
    else: nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.9; return m
def link(o): col.objects.link(o); return o
def box(name, size, loc, m, bevel=0.003):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); o = link(bpy.data.objects.new(name, me)); me.materials.append(m); o.location = loc
    if bevel: bv = o.modifiers.new("b", "BEVEL"); bv.width = bevel; bv.segments = 3
    return o
KRAFT = mat("kraft", "#9c6e44", 0.85, (220, "#8f633b", "#ad7f52", 0.15))
DOUGH = mat("cookie", "#c98b4c", 0.72, (28, "#8e4f1e", "#d99a52", 0.9)); CHIP = mat("chip", "#2a160b", 0.35)
PIST = mat("pist", "#cbb38a", 0.72, (28, "#b08a55", "#e3c992", 0.8)); GREEN = mat("pgreen", "#7d8f3e", 0.6)
SHORT = mat("short", "#e6c48c", 0.7, (40, "#c99350", "#ecc88a", 0.6)); SALT = mat("salt", "#ffffff", 0.2)
RIB = mat("ribbon", "#b5532d", 0.45); PAPERM = mat("tissue", "#f3ece2", 0.9)
def label_img():
    from PIL import Image, ImageDraw, ImageFont
    p = os.path.join(OUT, "_label.png"); im = Image.new("RGB", (600, 360), (246, 238, 225)); d = ImageDraw.Draw(im)
    d.text((300, 160), "Sweet & Co.", font=ImageFont.truetype(FONT, 80), fill=(59, 35, 20), anchor="mm"); d.text((300, 250), "small-batch cookies", font=ImageFont.truetype(FONT, 30), fill=(120, 80, 50), anchor="mm")
    im.save(p); return p
LAB = bpy.data.materials.new("label"); LAB.use_nodes = True; t = LAB.node_tree.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(label_img())
LAB.node_tree.links.new(t.outputs["Color"], LAB.node_tree.nodes["Principled BSDF"].inputs["Base Color"]); LAB.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.6
def plane(name, size, loc, m, rot=0.0):
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5); me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    uv = me.uv_layers.new()
    for li, l in enumerate(me.loops): v = me.vertices[l.vertex_index].co; uv.data[li].uv = (v.x + 0.5, v.y + 0.5)
    o = link(bpy.data.objects.new(name, me)); me.materials.append(m); o.scale = (size[0], size[1], 1); o.location = loc; o.rotation_euler = (0, 0, rot); return o
def cookie(name, m, top, loc, r=0.04, seed=1):
    rnd = random.Random(seed); bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=14, radius=r)
    for v in bm.verts:
        v.co.z *= 0.24; v.co.x *= 1 + (rnd.random() - 0.5) * 0.05; v.co.y *= 1 + (rnd.random() - 0.5) * 0.05
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); o = link(bpy.data.objects.new(name, me)); me.materials.append(m); o.location = loc
    for p in me.polygons: p.use_smooth = True
    d = o.modifiers.new("d", "DISPLACE"); tx = bpy.data.textures.new(name + "n", "CLOUDS"); tx.noise_scale = r * 0.3; d.texture = tx; d.strength = r * 0.22
    for k in range(9 if top != SALT else 14):
        a = rnd.random() * 6.28; rr = rnd.random() * r * 0.7
        bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r * (0.17 if top != SALT else 0.05)); me2 = bpy.data.meshes.new("t"); bm.to_mesh(me2); bm.free()
        c = link(bpy.data.objects.new(name + f"t{k}", me2)); me2.materials.append(top); c.parent = o; c.location = (math.cos(a) * rr, math.sin(a) * rr, r * 0.2); c.scale = (1, 1, 0.6)
    return o
def gift(name, loc, size=(0.3, 0.3, 0.09), kind=DOUGH, top=CHIP, open_=True, n=9, rot=0.0):
    root = bpy.data.objects.new(name, None); link(root); root.location = loc; root.rotation_euler = (0, 0, rot)
    sx, sy, sz = size
    parts = [box(name + "b", (sx, sy, 0.006), (0, 0, 0.003), KRAFT)]
    for (x, y, w, d) in ((0, sy / 2, sx, 0.006), (0, -sy / 2, sx, 0.006), (sx / 2, 0, 0.006, sy), (-sx / 2, 0, 0.006, sy)): parts.append(box(name + "w", (w, d, sz), (x, y, sz / 2), KRAFT, 0.002))
    parts.append(box(name + "tp", (sx - 0.02, sy - 0.02, 0.004), (0, 0, 0.01), PAPERM, 0.001))
    g = int(round(math.sqrt(n)))
    for i in range(n):
        c = cookie(name + f"c{i}", kind, top, ((i % g - (g - 1) / 2) * sx / g * 0.95, (i // g - (g - 1) / 2) * sy / g * 0.95, 0.03), r=min(sx, sy) / g * 0.46, seed=i + len(name)); parts.append(c)
    if open_:
        lid = box(name + "lid", (sx + 0.008, sy + 0.008, 0.006), (0, sy / 2 + sy / 2 + 0.01, 0.003), KRAFT, 0.002); lid.rotation_euler = (0, 0, 0); lid.location = (0, sy + 0.02, 0.003); parts.append(lid)
        lab = plane(name + "lab", (sx * 0.6, sy * 0.36), (0, sy + 0.02, 0.0072), LAB); parts.append(lab)
        rb = box(name + "rb", (0.03, sy + 0.01, 0.002), (sx * 0.32, sy + 0.02, 0.007), RIB, 0); parts.append(rb)
    else:
        parts.append(box(name + "lid", (sx + 0.008, sy + 0.008, 0.02), (0, 0, sz + 0.004), KRAFT, 0.002))
        parts.append(plane(name + "lab", (sx * 0.6, sy * 0.36), (0, 0, sz + 0.0145), LAB))
        parts.append(box(name + "rb", (0.03, sy + 0.012, 0.024), (sx * 0.32, 0, sz + 0.004), RIB, 0))
    for p in parts: p.parent = root
    return root
# studio: linen tabletop, warm window light from the left, soft fill
LIN = tex_mat("oak", "oak_veneer_01", 1.6, "#d9b48e")
box("table", (3, 3, 0.04), (0, 0, -0.02), LIN, 0)
box("wall", (3, 0.04, 2), (0, 1.0, 1), mat("wall", "#e9d9c3", 0.9), 0)

world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True; world.node_tree.nodes["Background"].inputs["Color"].default_value = hexc("#f4ece0"); world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.2
L = bpy.data.lights.new("key", "AREA"); L.size = 0.9; L.energy = 150; L.color = (1.0, 0.92, 0.82); k = link(bpy.data.objects.new("key", L)); k.location = (-1.3, -0.4, 1.3); k.rotation_euler = (0, -math.radians(48), math.radians(-15))
L2 = bpy.data.lights.new("fill", "AREA"); L2.size = 2; L2.energy = 35; L2.color = (1.0, 0.95, 0.88); f = link(bpy.data.objects.new("fill", L2)); f.location = (1.2, -1.2, 1.0); f.rotation_euler = (math.radians(55), 0, math.radians(40))
cam_d = bpy.data.cameras.new("c"); cam = link(bpy.data.objects.new("c", cam_d)); scene.camera = cam; cam_d.lens = 70; cam_d.dof.use_dof = True; cam_d.dof.aperture_fstop = 2.8
r = scene.render; r.engine = "CYCLES"; scene.cycles.samples = SPP; scene.cycles.use_denoising = True; r.resolution_x = r.resolution_y = 1200; scene.view_settings.view_transform = "AgX"
try: scene.view_settings.look = "AgX - High Contrast"
except Exception: pass
def shot(name, target, dist, elev, az, res=(1200, 1200)):
    r.resolution_x, r.resolution_y = res
    d = Vector((math.cos(math.radians(elev)) * math.sin(math.radians(az)), -math.cos(math.radians(elev)) * math.cos(math.radians(az)), math.sin(math.radians(elev))))
    cam.location = Vector(target) + d * dist; cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler(); cam_d.dof.focus_distance = dist
    r.filepath = os.path.join(OUT, name + ".png"); bpy.ops.render.render(write_still=True); print("rendered", name, flush=True)
def clear(keep=("table", "wall", "key", "fill", "c")):
    for o in list(bpy.data.objects):
        if o.name not in keep: bpy.data.objects.remove(o, do_unlink=True)
# products
gift("p1", (0, 0, 0), (0.3, 0.3, 0.07), DOUGH, CHIP, True, 9); shot("demo-p1", (0, 0.1, 0.04), 1.05, 42, 18); clear()
gift("p2", (0, 0, 0), (0.24, 0.16, 0.06), PIST, GREEN, True, 6 if False else 4); shot("demo-p2", (0, 0.06, 0.03), 0.85, 45, -15); clear()
gift("p3", (0, 0, 0), (0.24, 0.24, 0.06), SHORT, SALT, True, 9); shot("demo-p3", (0, 0.1, 0.03), 0.9, 40, 22); clear()
gift("p4a", (-0.08, 0, 0), (0.34, 0.34, 0.08), DOUGH, CHIP, False, 0, 0.2); gift("p4b", (0.2, -0.16, 0), (0.22, 0.22, 0.06), PIST, GREEN, True, 4, -0.3)
for i in range(3): cookie(f"loose{i}", DOUGH, CHIP, (-0.3 + i * 0.1, -0.28 + (i % 2) * 0.05, 0.012), 0.04, i + 20)
shot("demo-p4", (0, -0.05, 0.05), 1.25, 38, 12); shot("demo-hero", (0, -0.05, 0.05), 1.15, 30, -24); clear()
# kitchen: a tray of cookies with an open box and a bowl, wider shot
gift("k1", (0.25, 0.15, 0), (0.3, 0.3, 0.07), DOUGH, CHIP, True, 9, 0.3)
tray = box("tray", (0.5, 0.36, 0.012), (-0.25, -0.1, 0.006), mat("tray", "#a2a6ab", 0.3), 0.004); tray.data.materials[0].node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 1
for i in range(12): cookie(f"tk{i}", DOUGH, CHIP, (-0.41 + (i % 4) * 0.105, -0.2 + (i // 4) * 0.1, 0.022), 0.04, i + 40)
shot("demo-kitchen", (0, -0.02, 0.03), 1.5, 36, -10, (1200, 900)); clear()
# the 3D model: one closed gift box beside an open one, exported for <model-viewer>
gift("m1", (0, 0, 0), (0.3, 0.3, 0.07), DOUGH, CHIP, True, 9)
for o in bpy.data.objects:
    o.select_set(o.name.startswith("m1"))
print("ok")
