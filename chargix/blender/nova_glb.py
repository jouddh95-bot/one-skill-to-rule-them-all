# CHARGIX · nova-box.glb for the Business Launch package card: a folded bone NOVA tee (the design picked in the story) on an open black
# poly mailer, with a second sealed mailer behind it. Plain glTF materials (colour + one print texture),
# so it loads fast in <model-viewer>.
# usage: python nova_glb.py <out.glb>
import bpy, bmesh, math, os, sys
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = sys.argv[-1]
FONT = os.path.join(HERE, "fonts", "Manrope-Medium.ttf"); FONT_B = os.path.join(HERE, "fonts", "ArchivoBlack-Regular.ttf")
TMP = os.path.join(os.path.dirname(os.path.abspath(OUT)), "_glbtmp"); os.makedirs(TMP, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True); col = bpy.context.scene.collection

def hexc(h):
    h = h.lstrip("#"); s = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in s) + (1,)
def mat(name, h, rough=0.6, img=None, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = hexc(h); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    if img:
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(img); nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    return m
def block(name, size, loc, m, bevel=0.0, rot=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new(name, me); col.objects.link(ob); me.materials.append(m)
    ob.location = loc; ob.rotation_euler = rot
    if bevel:
        bv = ob.modifiers.new("bv", "BEVEL"); bv.width = bevel; bv.segments = 4
        for p in me.polygons: p.use_smooth = True
    return ob
def plane(name, w, h, loc, m, rot=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5); me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    uv = me.uv_layers.new()
    for li, l in enumerate(me.loops): v = me.vertices[l.vertex_index].co; uv.data[li].uv = (v.x + 0.5, v.y + 0.5)
    ob = bpy.data.objects.new(name, me); col.objects.link(ob); me.materials.append(m); ob.scale = (w, h, 1); ob.location = loc; ob.rotation_euler = rot; return ob

from PIL import Image, ImageDraw, ImageFont
def png(path, size, bg, draw):
    im = Image.new("RGBA" if len(bg) == 4 else "RGB", size, bg); draw(ImageDraw.Draw(im), size); im.save(path); return path
def tee_print(d, s):
    w, h = s; acc = (184, 143, 88)
    d.ellipse((int(w * .15), int(h * .30), int(w * .85), int(h * .58)), outline=acc + (255,), width=14)
    d.text((w / 2, h * .45), "NOVA", font=ImageFont.truetype(FONT_B, int(w * .22)), fill=(22, 22, 26, 255), anchor="mm")
    d.text((w / 2, h * .68), "STUDIO · EST. 2026", font=ImageFont.truetype(FONT, int(w * .05)), fill=(22, 22, 26, 255), anchor="mm")
def label(d, s):
    w, h = s
    d.text((w / 2, h * .42), "NOVA", font=ImageFont.truetype(FONT_B, int(h * .38)), fill=(18, 18, 22), anchor="mm")
    d.text((w / 2, h * .78), "nova.example · demo", font=ImageFont.truetype(FONT, int(h * .1)), fill=(18, 18, 22), anchor="mm")
P = png(os.path.join(TMP, "print.png"), (1024, 1024), (236, 231, 222, 0), tee_print)
Lb = png(os.path.join(TMP, "label.png"), (768, 384), (244, 241, 234), label)

def jersey(path_out, tint):
    from PIL import ImageOps
    d = os.path.join(HERE, "..", "assets", "ph", "tex", "cotton_jersey")
    im = Image.open(os.path.join(d, "Diffuse.jpg")).convert("L").resize((512, 512))
    im = ImageOps.autocontrast(im); t = Image.new("RGB", im.size, tint)
    im = Image.blend(t, Image.merge("RGB", [im] * 3), 0.0)
    from PIL import ImageChops
    g = Image.open(os.path.join(d, "Diffuse.jpg")).convert("L").resize((512, 512)).point(lambda v: int(200 + v * 55 / 255))
    out = ImageChops.multiply(Image.new("RGB", (512, 512), tint), Image.merge("RGB", [g] * 3)); out.save(path_out); return path_out
def fabric(name, tint, rough=0.95):
    m = mat(name, "#ffffff", rough, jersey(os.path.join(TMP, "fab_" + name + ".png"), tint)); nt = m.node_tree
    n = nt.nodes.new("ShaderNodeTexImage"); n.image = bpy.data.images.load(os.path.join(HERE, "..", "assets", "ph", "tex", "cotton_jersey", "nor_gl.jpg")); n.image.colorspace_settings.name = "Non-Color"
    nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = 0.8
    nt.links.new(n.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], nt.nodes["Principled BSDF"].inputs["Normal"]); return m
def uvs(ob, rep):
    bpy.context.view_layer.objects.active = ob
    for o in col.objects: o.select_set(o == ob)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.uv.cube_project(cube_size=1.0 / rep); bpy.ops.object.mode_set(mode="OBJECT")
M_mail = mat("mailer", "#141416", 0.38); M_in = mat("mailerIn", "#e9e6e0", 0.8); M_tee = fabric("tee", (236, 231, 222))
M_print = mat("print", "#ffffff", 0.9, P); _nt = M_print.node_tree
_nt.links.new([n for n in _nt.nodes if n.type == "TEX_IMAGE"][0].outputs["Alpha"], _nt.nodes["Principled BSDF"].inputs["Alpha"])
if hasattr(M_print, "surface_render_method"): M_print.surface_render_method = "BLENDED"; M_lab = mat("label", "#ffffff", 0.7, Lb)
# sealed mailer behind, tilted
block("mailer2", (0.34, 0.27, 0.022), (0.09, 0.1, 0.011), M_mail, 0.009, (0, 0, 0.32))
plane("label2", 0.15, 0.075, (0.12, 0.08, 0.0225), M_lab, (0, 0, 0.32))
# open mailer in front: body, white inside, flap folded back
block("mailer1", (0.36, 0.28, 0.02), (-0.05, -0.06, 0.035), M_mail, 0.008, (0, 0, -0.12))
plane("inside", 0.33, 0.25, (-0.05, -0.06, 0.0452), M_in, (0, 0, -0.12))
flap = block("flap", (0.36, 0.09, 0.004), (-0.04, 0.125, 0.027), M_mail, 0.002, (0, 0, -0.12))
# folded tee on it, print up
tf = block("teeFold", (0.27, 0.22, 0.032), (-0.05, -0.07, 0.062), M_tee, 0.012, (0, 0, -0.12)); uvs(tf, 6)
plane("teePrint", 0.2, 0.2, (-0.05, -0.065, 0.0786), M_print, (0, 0, -0.12))
for o in col.objects: o.select_set(True)
bpy.context.view_layer.objects.active = col.objects[0]
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_image_format="WEBP" if False else "AUTO")
print("wrote", OUT, os.path.getsize(OUT))
