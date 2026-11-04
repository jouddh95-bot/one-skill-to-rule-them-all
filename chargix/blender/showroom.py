# CHARGIX · CASA OCRE — the house, built for a ray-traced walk-through film.
#
# The same house as the browser scene (demos-casa.js), in metres: an ochre
# entry court with a cobalt door frame, a lime-plaster sala with oak beams, a
# deep east window, a console with the Cántaro range, and the real furniture
# models (Khronos glTF sample assets by Wayfair, CC BY 4.0 / CC0). Lit by a low
# sun and the Venice Sunset sky (Poly Haven, CC0), rendered with Cycles.
#
# usage: python showroom.py <outdir> <frames "0,5,9" | "still"> [W H spp]
import bpy, bmesh, math, os, sys, random
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "theme-v5", "assets")
OUT = sys.argv[1]
FRAMES = sys.argv[2]
W, H, SPP = (int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (1600, 900, 128)
N = int(os.environ.get("CX_N", "200"))
os.makedirs(OUT, exist_ok=True)
TEX = os.path.join(OUT, "_tex"); os.makedirs(TEX, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection


def V(x, y, z):
    """three.js (Y up, -Z forward) to Blender (Z up)."""
    return Vector((x, -z, y))


def hexc(h, a=1.0):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, a)


# ------------------------------------------------------------------ materials
def principled(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    return m, nt, nt.nodes["Principled BSDF"]


def plaster(name, base, scale=1.0, rough=0.9):
    """Lime plaster: trowel clouds in colour and bump, fine grain."""
    m, nt, b = principled(name)
    N_, L = nt.nodes, nt.links
    tc = N_.new("ShaderNodeTexCoord")
    big = N_.new("ShaderNodeTexNoise"); big.inputs["Scale"].default_value = 0.9 * scale; big.inputs["Detail"].default_value = 6; big.inputs["Roughness"].default_value = 0.6
    fine = N_.new("ShaderNodeTexNoise"); fine.inputs["Scale"].default_value = 140 * scale; fine.inputs["Detail"].default_value = 4
    L.new(tc.outputs["Object"], big.inputs["Vector"]); L.new(tc.outputs["Object"], fine.inputs["Vector"])
    ramp = N_.new("ShaderNodeValToRGB")
    c0, c1 = hexc(base), hexc(base)
    ramp.color_ramp.elements[0].color = tuple(min(1, c * 0.82) for c in c0[:3]) + (1,)
    ramp.color_ramp.elements[1].color = tuple(min(1, c * 1.14) for c in c1[:3]) + (1,)
    ramp.color_ramp.elements[0].position = 0.3; ramp.color_ramp.elements[1].position = 0.7
    L.new(big.outputs["Fac"], ramp.inputs["Fac"])
    L.new(ramp.outputs["Color"], b.inputs["Base Color"])
    mix = N_.new("ShaderNodeMath"); mix.operation = "MULTIPLY_ADD"; mix.inputs[1].default_value = 0.25
    L.new(fine.outputs["Fac"], mix.inputs[0]); L.new(big.outputs["Fac"], mix.inputs[2])
    bump = N_.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.22; bump.inputs["Distance"].default_value = 0.01
    L.new(mix.outputs[0], bump.inputs["Height"]); L.new(bump.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = rough
    return m


def concrete():
    """Polished concrete: soft wear clouds, small aggregate, varying gloss."""
    m, nt, b = principled("concrete")
    N_, L = nt.nodes, nt.links
    tc = N_.new("ShaderNodeTexCoord")
    cl = N_.new("ShaderNodeTexNoise"); cl.inputs["Scale"].default_value = 0.35; cl.inputs["Detail"].default_value = 5
    ag = N_.new("ShaderNodeTexVoronoi"); ag.inputs["Scale"].default_value = 140; ag.feature = "F1"
    for t in (cl, ag):
        L.new(tc.outputs["Object"], t.inputs["Vector"])
    ramp = N_.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = hexc("#7a6552"); ramp.color_ramp.elements[1].color = hexc("#a08872")
    L.new(cl.outputs["Fac"], ramp.inputs["Fac"])
    agr = N_.new("ShaderNodeMapRange"); agr.inputs["From Min"].default_value = 0.0; agr.inputs["From Max"].default_value = 0.18
    agr.inputs["To Min"].default_value = 0.6; agr.inputs["To Max"].default_value = 1.0
    L.new(ag.outputs["Distance"], agr.inputs["Value"])
    mul = N_.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs["Factor"].default_value = 1.0
    L.new(ramp.outputs["Color"], mul.inputs[6])
    L.new(agr.outputs["Result"], mul.inputs[7])
    # saw-cut joints every 4 m
    br = N_.new("ShaderNodeTexBrick"); br.offset = 0.0; br.inputs["Scale"].default_value = 1.0
    br.inputs["Brick Width"].default_value = 4.0; br.inputs["Row Height"].default_value = 4.0; br.inputs["Mortar Size"].default_value = 0.006
    br.inputs["Mortar Smooth"].default_value = 0.4
    br.inputs["Color1"].default_value = (1, 1, 1, 1); br.inputs["Color2"].default_value = (1, 1, 1, 1); br.inputs["Mortar"].default_value = (0.55, 0.52, 0.5, 1)
    L.new(tc.outputs["Object"], br.inputs["Vector"])
    mj = N_.new("ShaderNodeMix"); mj.data_type = "RGBA"; mj.blend_type = "MULTIPLY"; mj.inputs["Factor"].default_value = 1.0
    L.new(mul.outputs[2], mj.inputs[6]); L.new(br.outputs["Color"], mj.inputs[7])
    L.new(mj.outputs[2], b.inputs["Base Color"])
    rr = N_.new("ShaderNodeMapRange"); rr.inputs["To Min"].default_value = 0.38; rr.inputs["To Max"].default_value = 0.7
    L.new(cl.outputs["Fac"], rr.inputs["Value"]); L.new(rr.outputs["Result"], b.inputs["Roughness"])
    b.inputs["Coat Weight"].default_value = 0.12; b.inputs["Coat Roughness"].default_value = 0.25
    return m


def oak():
    """Oak with the grain running along Y (beams and the console top run that way)."""
    m, nt, b = principled("oak")
    N_, L = nt.nodes, nt.links
    tc = N_.new("ShaderNodeTexCoord")
    mp = N_.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (38, 1.2, 38)
    L.new(tc.outputs["Object"], mp.inputs["Vector"])
    g1 = N_.new("ShaderNodeTexNoise"); g1.inputs["Scale"].default_value = 1.0; g1.inputs["Detail"].default_value = 8; g1.inputs["Distortion"].default_value = 0.6
    L.new(mp.outputs["Vector"], g1.inputs["Vector"])
    ramp = N_.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = hexc("#4f331b"); ramp.color_ramp.elements[1].color = hexc("#9a6d43")
    ramp.color_ramp.elements[0].position = 0.35; ramp.color_ramp.elements[1].position = 0.62
    L.new(g1.outputs["Fac"], ramp.inputs["Fac"]); L.new(ramp.outputs["Color"], b.inputs["Base Color"])
    bump = N_.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.05
    L.new(g1.outputs["Fac"], bump.inputs["Height"]); L.new(bump.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = 0.5
    b.inputs["Coat Weight"].default_value = 0.25; b.inputs["Coat Roughness"].default_value = 0.35
    return m


def glaze(h, rough=0.22):
    m, nt, b = principled("glaze" + h)
    b.inputs["Base Color"].default_value = hexc(h)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = 1.0; b.inputs["Coat Roughness"].default_value = 0.06
    # glaze pools darker where the body curves: a little noise in colour
    N_, L = nt.nodes, nt.links
    nz = N_.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 18
    hsv = N_.new("ShaderNodeHueSaturation"); hsv.inputs["Color"].default_value = hexc(h)
    mr = N_.new("ShaderNodeMapRange"); mr.inputs["To Min"].default_value = 0.88; mr.inputs["To Max"].default_value = 1.08
    L.new(nz.outputs["Fac"], mr.inputs["Value"]); L.new(mr.outputs["Result"], hsv.inputs["Value"])
    L.new(hsv.outputs["Color"], b.inputs["Base Color"])
    return m


def flat(name, h, rough=0.9, **kw):
    m, nt, b = principled(name)
    b.inputs["Base Color"].default_value = hexc(h)
    b.inputs["Roughness"].default_value = rough
    for k, v in kw.items():
        b.inputs[k].default_value = v
    return m


def image_mat(name, path, rough=0.95, alpha=False, bump=0.0):
    m, nt, b = principled(name)
    N_, L = nt.nodes, nt.links
    t = N_.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(path)
    L.new(t.outputs["Color"], b.inputs["Base Color"])
    if alpha:
        L.new(t.outputs["Alpha"], b.inputs["Alpha"])
    if bump:
        bn = N_.new("ShaderNodeBump"); bn.inputs["Strength"].default_value = bump
        L.new(t.outputs["Color"], bn.inputs["Height"]); L.new(bn.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = rough
    return m


OCHRE = plaster("ochre", "#b97a3e")
PINK = plaster("pink", "#c06a63")
LIME = plaster("lime", "#e6ddcf")
COBALT = plaster("cobalt", "#22408a", rough=0.7)
TRAV = plaster("travertine", "#d9cab0", scale=3, rough=0.6)
FLOOR = concrete()
OAK = oak()
CLAY = flat("clay", "#b98a63", 0.92)


# ------------------------------------------------------------------ geometry helpers
def slab(w, h, d, mat, x, y, z, bevel=0.012):
    """Box sized in three.js axes (w along x, h along y, d along z) centred at three.js (x, y, z)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * w, v.co.y * d, v.co.z * h))
    me = bpy.data.meshes.new("slab"); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new("slab", me); me.materials.append(mat); col.objects.link(ob)
    ob.location = V(x, y, z)
    if bevel:
        bv = ob.modifiers.new("bv", "BEVEL"); bv.width = min(bevel, w / 3, h / 3, d / 3); bv.segments = 2; bv.limit_method = "NONE"
    return ob


def lathe(name, prof, mat, seg=96, sub=6):
    # Catmull-Rom smooth the profile like THREE.SplineCurve
    pts = [Vector(p) for p in prof]
    sm = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = pts[max(0, i - 1)], pts[i], pts[i + 1], pts[min(len(pts) - 1, i + 2)]
        for k in range(sub):
            t = k / sub
            t2, t3 = t * t, t * t * t
            sm.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    sm.append(pts[-1])
    bm = bmesh.new()
    rings = []
    for k in range(seg):
        a = 2 * math.pi * k / seg
        rings.append([bm.verts.new((p.x * math.cos(a), p.x * math.sin(a), p.y)) for p in sm])
    for k in range(seg):
        r0, r1 = rings[k], rings[(k + 1) % seg]
        for i in range(len(sm) - 1):
            bm.faces.new((r0[i], r0[i + 1], r1[i + 1], r1[i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me); me.materials.append(mat); col.objects.link(ob)
    sol = ob.modifiers.new("sol", "SOLIDIFY"); sol.thickness = 0.006
    return ob


VESSELS = {
    "cantaro": [(0, 0), (0.07, 0), (0.085, 0.01), (0.11, 0.06), (0.15, 0.16), (0.16, 0.22), (0.145, 0.3), (0.1, 0.37), (0.055, 0.41), (0.048, 0.46), (0.062, 0.5), (0.058, 0.505), (0.04, 0.47), (0, 0.47)],
    "jarra": [(0, 0), (0.06, 0), (0.07, 0.015), (0.09, 0.08), (0.1, 0.16), (0.085, 0.23), (0.06, 0.27), (0.065, 0.3), (0.06, 0.302), (0.05, 0.28), (0, 0.28)],
    "cuenco": [(0, 0), (0.05, 0), (0.055, 0.012), (0.11, 0.05), (0.14, 0.09), (0.145, 0.1), (0.135, 0.098), (0.1, 0.06), (0.04, 0.03), (0, 0.03)],
}


def vessel(kind, mat, x, y, z, sc, rot):
    root = bpy.data.objects.new(kind, None); col.objects.link(root)
    body = lathe(kind, VESSELS[kind], mat); body.parent = root
    r0 = VESSELS[kind][1][0]
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=r0 + 0.003, depth=0.012, location=(0, 0, 0.006))
    foot = bpy.context.active_object; foot.data.materials.append(CLAY); foot.parent = root
    if kind == "cantaro":
        for s in (-1, 1):
            bpy.ops.mesh.primitive_torus_add(major_radius=0.055, minor_radius=0.011, major_segments=40, minor_segments=12,
                                             location=(s * 0.1, 0, 0.36), rotation=(math.pi / 2, 0.5 * s, 0))
            h = bpy.context.active_object; h.data.materials.append(mat); h.parent = root
            for p in h.data.polygons:
                p.use_smooth = True
    root.location = V(x, y, z); root.scale = (sc, sc, sc); root.rotation_euler = (0, 0, rot)
    return root


# ------------------------------------------------------------------ the house (three.js coordinates, metres)
floor = slab(400, 0.1, 400, FLOOR, 0, -0.05, -2, bevel=0)

HT, DX0, DX1, DH = 5.6, -3.3, -1.1, 3.0
slab(DX0 + 9.5, HT, 0.5, OCHRE, (-9.5 + DX0) / 2, HT / 2, 0)
slab(9.5 - DX1, HT, 0.5, OCHRE, (DX1 + 9.5) / 2, HT / 2, 0)
slab(DX1 - DX0, HT - DH, 0.5, OCHRE, (DX0 + DX1) / 2, DH + (HT - DH) / 2, 0)
slab(0.1, DH, 0.56, COBALT, DX0 + 0.05, DH / 2, 0); slab(0.1, DH, 0.56, COBALT, DX1 - 0.05, DH / 2, 0)
slab(DX1 - DX0, 0.1, 0.56, COBALT, (DX0 + DX1) / 2, DH - 0.05, 0)
slab(0.45, 3.6, 8, PINK, 6.4, 1.8, 5.0); slab(0.45, 2.2, 5, OCHRE, -8.6, 1.1, 6.5)
slab(1.3, 0.36, 6.6, LIME, 4.6, 0.17, 5.2)
slab(0.9, 0.02, 6.2, flat("water", "#0c1517", 0.03, **{"Coat Weight": 1.0}), 4.6, 0.36, 5.2, bevel=0)

# the sign: CASA OCRE in dark letters on the ochre wall
try:
    from PIL import Image, ImageDraw, ImageFont
    im = Image.new("RGBA", (2048, 256), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(os.path.join(HERE, "fonts", "Manrope-Medium.ttf"), 132)
    text = "CASA OCRE"; x = 0
    widths = [d.textlength(ch, font=f) for ch in text]; track = 46
    total = sum(widths) + track * (len(text) - 1); x = (2048 - total) / 2
    for ch, w in zip(text, widths):
        d.text((x, 128), ch, font=f, fill=(48, 28, 12, 235), anchor="lm"); x += w + track
    sp = os.path.join(TEX, "sign.png"); im.save(sp)
    sm = image_mat("sign", sp, 0.9, alpha=True)
    bpy.ops.mesh.primitive_plane_add(size=1, location=V(2.6, 4.2, 0.252), rotation=(math.pi / 2, 0, 0))
    sg = bpy.context.active_object; sg.scale = (4.4, 0.55, 1); sg.data.materials.append(sm)
except Exception as e:
    print("sign skipped", e)

RH, X0, X1, Z1 = 3.5, -5.2, 4.6, -8
slab(0.35, RH, -Z1, LIME, X0, RH / 2, Z1 / 2)
slab(X1 - X0 + 0.35, RH, 0.35, OCHRE, (X0 + X1) / 2, RH / 2, Z1)
slab(0.35, RH, 2, LIME, X1, RH / 2, -1); slab(0.35, RH, 2, LIME, X1, RH / 2, -7)
slab(0.35, 0.55, 4, LIME, X1, 0.275, -4); slab(0.35, 0.5, 4, LIME, X1, RH - 0.25, -4)
slab(0.8, 0.06, 4, LIME, X1 - 0.1, 0.58, -4)
slab(X1 - X0 + 0.35, 0.25, -Z1 + 0.35, LIME, (X0 + X1) / 2, RH + 0.125, Z1 / 2)
x = X0 + 0.7
while x < X1 - 0.3:
    slab(0.12, 0.18, -Z1, OAK, x, RH - 0.09, Z1 / 2, bevel=0.008); x += 0.95
# console
slab(0.5, 0.05, 3.6, OAK, X0 + 0.45, 0.86, -4, bevel=0.008)
for zz in (-2.35, -5.65):
    slab(0.4, 0.835, 0.06, OAK, X0 + 0.45, 0.4175, zz, bevel=0.008)
# travertine coffee table on a wool rug
slab(1.3, 0.34, 0.7, TRAV, -0.4, 0.17, -5.2)
try:
    from PIL import Image, ImageDraw
    rnd = random.Random(77)
    im = Image.new("RGB", (1024, 512), (216, 204, 182)); d = ImageDraw.Draw(im, "RGBA")
    for y0 in (60, 426): d.rectangle((0, y0, 1024, y0 + 26), fill=(176, 112, 50, 140))
    for y0 in (98, 408): d.rectangle((0, y0, 1024, y0 + 6), fill=(42, 66, 130, 90))
    for y in range(0, 512, 2):
        t = (255, 255, 255) if rnd.random() > 0.5 else (60, 45, 30)
        d.rectangle((0, y, 1024, y), fill=(*t, int(255 * (0.03 + rnd.random() * 0.05))))
    for i in range(9000):
        xx, yy = rnd.random() * 1024, rnd.random() * 512
        d.rectangle((xx, yy, xx + 2, yy), fill=(80, 60, 40, int(rnd.random() * 30)))
    rp = os.path.join(TEX, "rug.png"); im.save(rp)
    rm = image_mat("rug", rp, 1.0, bump=0.4)
    rm.node_tree.nodes["Principled BSDF"].inputs["Sheen Weight"].default_value = 0.4
    bpy.ops.mesh.primitive_plane_add(size=1, location=V(-0.4, 0.008, -5.5))
    rg = bpy.context.active_object; rg.scale = (3.4, 2.3, 1); rg.data.materials.append(rm)
    sol = rg.modifiers.new("sol", "SOLIDIFY"); sol.thickness = 0.012
except Exception as e:
    print("rug skipped", e)

# the Cántaro range on the console
for kind, colr, zz, sc, in [("cantaro", "#c6862c", -2.75, 1.0), ("jarra", "#e6dfcf", -3.35, 1.0), ("cantaro", "#25428e", -3.95, 0.9),
                            ("cuenco", "#a54a2d", -4.6, 1.1), ("cantaro", "#e6dfcf", -5.2, 0.8)]:
    vessel(kind, glaze(colr), X0 + 0.45, 0.885, zz, sc, zz * 5)
vessel("cantaro", glaze("#25428e", 0.3), 3.7, 0, -7.2, 1.9, 0.4)

# ------------------------------------------------------------------ furniture (glTF, real-world scale)
def gltf(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, f"casa-{name}.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.type == "LIGHT":
            bpy.data.objects.remove(o, do_unlink=True)
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    root = bpy.data.objects.new(name + "-root", None); col.objects.link(root)
    for o in roots:
        o.parent = root
    return root


def place(root, x, y, z, ry=0.0, s=1.0):
    root.location = V(x, y, z); root.rotation_euler = (0, 0, ry); root.scale = (s, s, s)


try:
    place(gltf("sofa"), -0.6, 0, -7.0)
    ch = gltf("chair"); place(ch, 1.9, 0, -5.9, -1.2)
    ch2 = gltf("chair"); place(ch2, 1.8, 0, -4.3, -1.95)
    place(gltf("pouf"), -2.5, 0, -4.6)
    place(gltf("cup"), -0.1, 0.34, -5.15, 0.6)
    place(gltf("lamp"), X0 + 0.2, 1.9, -4, math.pi / 2, 1.7)
except Exception as e:
    print("furniture import failed", e)

# ------------------------------------------------------------------ light
world = bpy.data.worlds.new("sky"); scene.world = world; world.use_nodes = True
wn, wl = world.node_tree.nodes, world.node_tree.links
env = wn.new("ShaderNodeTexEnvironment"); env.image = bpy.data.images.load(os.path.join(ASSETS, "casa-sky.hdr"))
mp = wn.new("ShaderNodeMapping"); tcw = wn.new("ShaderNodeTexCoord")
mp.inputs["Rotation"].default_value = (0, 0, math.radians(200))
wl.new(tcw.outputs["Generated"], mp.inputs["Vector"]); wl.new(mp.outputs["Vector"], env.inputs["Vector"])
wl.new(env.outputs["Color"], wn["Background"].inputs["Color"]); wn["Background"].inputs["Strength"].default_value = 0.9

sun_d = bpy.data.lights.new("sun", "SUN"); sun_d.energy = 4.2; sun_d.angle = math.radians(1.2); sun_d.color = (1.0, 0.86, 0.7)
sun = bpy.data.objects.new("sun", sun_d); col.objects.link(sun)
sp_, st_ = V(14, 9, 8), V(0, 0, -3)
sun.rotation_euler = (st_ - sp_).to_track_quat("-Z", "Y").to_euler()

# portals in the door and the window help Cycles find the sky indoors
for loc, size, rot in [(V((DX0 + DX1) / 2, DH / 2, 0.3), (DX1 - DX0, DH), (math.pi / 2, 0, 0)),
                       (V(X1 + 0.2, 1.8, -4), (4, 2.4), (0, math.pi / 2, 0))]:
    ld = bpy.data.lights.new("portal", "AREA"); ld.shape = "RECTANGLE"; ld.size, ld.size_y = size
    ld.cycles.is_portal = True
    o = bpy.data.objects.new("portal", ld); col.objects.link(o); o.location = loc; o.rotation_euler = rot
# the wall light over the console
ld = bpy.data.lights.new("glow", "SPOT"); ld.energy = 60; ld.color = (1.0, 0.82, 0.6); ld.spot_size = math.radians(110); ld.spot_blend = 0.8; ld.shadow_soft_size = 0.08
o = bpy.data.objects.new("glow", ld); col.objects.link(o); o.location = V(X0 + 0.5, 1.75, -4); o.rotation_euler = (0, 0, 0)
# warm bounce off the floor in the sala (stand-in for indirect light the low sample count would miss)
ld = bpy.data.lights.new("bounce", "AREA"); ld.energy = 120; ld.size = 3; ld.color = (1.0, 0.8, 0.6)
o = bpy.data.objects.new("bounce", ld); col.objects.link(o); o.location = V(0, 3.3, -4.5)
o.visible_camera = False; o.visible_glossy = False

# ------------------------------------------------------------------ camera
KEYS = [
    (0.00, (-2.2, 1.6, 13), (-2.2, 2.3, 0)),
    (0.14, (-2.2, 1.6, 5), (-2.2, 1.6, 0)),
    (0.26, (-2.0, 1.6, -0.9), (-0.8, 1.0, -6)),
    (0.40, (1.0, 1.5, -1.2), (-1, 0.7, -6)),
    (0.55, (3.2, 1.35, -2.0), (-1.0, 0.6, -6.2)),
    (0.68, (3.3, 1.45, -7.2), (-2.0, 0.8, -3.2)),
    (0.80, (-1.6, 1.4, -2.4), (-4.8, 1.0, -4)),
    (0.92, (-3.0, 1.3, -3.6), (-4.8, 1, -4)),
    (1.00, (-3.4, 1.25, -4.0), (-4.85, 0.95, -4)),
]
cam_d = bpy.data.cameras.new("cam"); cam_d.sensor_fit = "VERTICAL"; cam_d.angle_y = math.radians(50)
cam_d.clip_start = 0.05; cam_d.dof.use_dof = True; cam_d.dof.aperture_fstop = 4.0
cam = bpy.data.objects.new("cam", cam_d); col.objects.link(cam); scene.camera = cam
focus = bpy.data.objects.new("focus", None); col.objects.link(focus); cam_d.dof.focus_object = focus


def cr(pts, i, t):
    p0, p1, p2, p3 = pts[max(0, i - 1)], pts[i], pts[i + 1], pts[min(len(pts) - 1, i + 2)]
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


PP = [V(*k[1]) for k in KEYS]; TT = [V(*k[2]) for k in KEYS]


def set_pose(p):
    for i in range(len(KEYS) - 1):
        a, b = KEYS[i][0], KEYS[i + 1][0]
        if p <= b or i == len(KEYS) - 2:
            t = min(1, max(0, (p - a) / (b - a)))
            pos, tgt = cr(PP, i, t), cr(TT, i, t)
            break
    inside = min(1, max(0, (p - 0.14) / 0.12))
    scene.view_settings.exposure = EXP0 + 0.75 * inside * inside * (3 - 2 * inside)
    cam.location = pos
    cam.rotation_euler = (tgt - pos).to_track_quat("-Z", "Y").to_euler()
    focus.location = tgt


# ------------------------------------------------------------------ render
r = scene.render
r.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = SPP
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 8
scene.cycles.diffuse_bounces = 4
scene.cycles.glossy_bounces = 4
scene.cycles.transmission_bounces = 8
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False
scene.cycles.blur_glossy = 1.0
scene.cycles.sample_clamp_indirect = 8
r.resolution_x, r.resolution_y = W, H
r.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "AgX"
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass
EXP0 = float(os.environ.get("CX_EXP", "0.0"))

if FRAMES == "still":
    frames = [int(N * 0.0), int(N * 0.3), int(N * 0.6), int(N * 0.95)]
else:
    frames = [int(x) for x in FRAMES.split(",") if x != ""]
for f in frames:
    set_pose(f / (N - 1))
    r.filepath = os.path.join(OUT, f"s-{f:03d}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", f, flush=True)
