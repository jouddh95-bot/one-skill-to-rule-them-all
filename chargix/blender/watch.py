# CHARGIX · SOLENNE LIGNE 39 — the watch, built for a ray-traced product film.
#
# Models the watch procedurally at real proportions (1 unit = 10 mm, 39 mm case):
# brushed flanks with polished chamfers, coin-edge bezel, faceted lugs, knurled
# crown, a sunburst dial (true anisotropic brushing), applied bevelled indices,
# faceted dauphine hands, a domed sapphire crystal with refraction and a padded,
# stitched leather strap. Lit like a studio product shoot (softbox, strip lights,
# reflection cards) and rendered with Cycles.
#
# usage: python watch.py <outdir> <frames "0,5,9" | "still"> [W H spp cw]
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
FRAMES = sys.argv[2]
W, H, SPP = (int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (1600, 900, 96)
CW = sys.argv[6] if len(sys.argv) > 6 else "steel"
N = int(os.environ.get("CX_N", "180"))  # frames in the film
os.makedirs(OUT, exist_ok=True)

COLOURWAYS = {
    "steel": dict(metal=(0.80, 0.81, 0.82), dial="#132a5c", dial2="#4a74c8", ink="#ece8de", idx=(0.92, 0.92, 0.93), sec=(0.86, 0.30, 0.16), strap=(0.035, 0.035, 0.045), stitch=(0.80, 0.76, 0.68)),
    "gold": dict(metal=(0.95, 0.74, 0.42), dial="#0d2619", dial2="#2f6a48", ink="#f2e6c4", idx=(0.95, 0.78, 0.45), sec=(0.95, 0.78, 0.45), strap=(0.12, 0.06, 0.03), stitch=(0.75, 0.6, 0.4)),
    "titanium": dict(metal=(0.62, 0.63, 0.65), dial="#c98468", dial2="#f4c7b2", ink="#2a272a", idx=(0.2, 0.2, 0.22), sec=(0.1, 0.22, 0.45), strap=(0.55, 0.48, 0.42), stitch=(0.93, 0.9, 0.85)),
}
C = COLOURWAYS[CW]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection


# ------------------------------------------------------------------ helpers
def link(name, me, mats=()):
    ob = bpy.data.objects.new(name, me)
    for m in mats:
        me.materials.append(m)
    col.objects.link(ob)
    return ob


def smooth(ob, angle=35):
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.data.set_sharp_from_angle(angle=math.radians(angle)) if hasattr(ob.data, "set_sharp_from_angle") else None


def lathe(name, prof, mats, seg=256, mat_of=None, closed=False):
    """Spin a (r, z) profile around Z. mat_of(i) gives the material index of profile segment i."""
    bm = bmesh.new()
    rings = []
    for k in range(seg):
        a = 2 * math.pi * k / seg
        ca, sa = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((r * ca, r * sa, z)) for r, z in prof])
    n = len(prof)
    nseg = n if closed else n - 1
    for k in range(seg):
        r0, r1 = rings[k], rings[(k + 1) % seg]
        for i in range(nseg):
            j = (i + 1) % n
            f = bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
            f.material_index = mat_of(i) if mat_of else 0
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(name, me, mats)
    smooth(ob, 30)
    return ob


def box(bm, cx, cy, cz, sx, sy, sz, rot=0.0):
    r = bmesh.ops.create_cube(bm, size=1.0)
    vs = r["verts"]
    M = Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(rot, 4, "Z") @ Matrix.Diagonal((sx, sy, sz, 1))
    bmesh.ops.transform(bm, matrix=M, verts=vs)
    return vs


def bevel(ob, w, seg=3):
    m = ob.modifiers.new("bevel", "BEVEL")
    m.width = w
    m.segments = seg
    m.limit_method = "ANGLE"
    m.harden_normals = False
    return m


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


# ------------------------------------------------------------------ materials
def principled(name, base, metal=0.0, rough=0.5, **kw):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    for k, v in kw.items():
        b.inputs[k].default_value = v
    return m, nt, b


def brushed_circular(name, base, rough=0.22, aniso=0.85, rot=0.0):
    """Metal brushed along circles around the watch axis (or radially with rot=0.25)."""
    m, nt, b = principled(name, base, 1.0, rough)
    b.inputs["Anisotropic"].default_value = aniso
    b.inputs["Anisotropic Rotation"].default_value = rot
    t = nt.nodes.new("ShaderNodeTangent")
    t.direction_type = "RADIAL"
    t.axis = "Z"
    nt.links.new(t.outputs[0], b.inputs["Tangent"])
    # fine brushing streaks in the roughness
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 900.0
    nz.inputs["Detail"].default_value = 2.0
    mp = nt.nodes.new("ShaderNodeMapRange")
    mp.inputs["To Min"].default_value = rough * 0.8
    mp.inputs["To Max"].default_value = rough * 1.25
    nt.links.new(nz.outputs[0], mp.inputs[0])
    nt.links.new(mp.outputs[0], b.inputs["Roughness"])
    return m


def mat_polish(name, base, rough=0.035):
    return principled(name, base, 1.0, rough)[0]


def mat_dial(img_path):
    m, nt, b = principled("dial", (1, 1, 1), 0.45, 0.30)
    tx = nt.nodes.new("ShaderNodeTexImage")
    tx.image = bpy.data.images.load(img_path)
    tx.interpolation = "Cubic"
    nt.links.new(tx.outputs[0], b.inputs["Base Color"])
    # printing is not metallic: drive metallic down where the print is light
    sep = nt.nodes.new("ShaderNodeTexImage")
    sep.image = bpy.data.images.load(img_path.replace(".png", "-mask.png"))
    sep.image.colorspace_settings.name = "Non-Color"
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = "MULTIPLY_ADD"
    inv.inputs[1].default_value = -0.45
    inv.inputs[2].default_value = 0.45
    nt.links.new(sep.outputs[0], inv.inputs[0])
    nt.links.new(inv.outputs[0], b.inputs["Metallic"])
    rr = nt.nodes.new("ShaderNodeMath")
    rr.operation = "MULTIPLY_ADD"
    rr.inputs[1].default_value = 0.25
    rr.inputs[2].default_value = 0.30
    nt.links.new(sep.outputs[0], rr.inputs[0])
    nt.links.new(rr.outputs[0], b.inputs["Roughness"])
    # sunburst: brushing runs radially from the centre
    b.inputs["Anisotropic"].default_value = 0.9
    b.inputs["Anisotropic Rotation"].default_value = 0.25
    t = nt.nodes.new("ShaderNodeTangent")
    t.direction_type = "RADIAL"
    t.axis = "Z"
    nt.links.new(t.outputs[0], b.inputs["Tangent"])
    # printed ink reads as crisp, slightly raised white: a touch of emission keeps it legible under the lacquer
    b.inputs["Emission Color"].default_value = (*[c / 255 for c in hexrgb_int(C["ink"])], 1)
    em = nt.nodes.new("ShaderNodeMath")
    em.operation = "MULTIPLY"
    em.inputs[1].default_value = 0.35
    nt.links.new(sep.outputs[0], em.inputs[0])
    nt.links.new(em.outputs[0], b.inputs["Emission Strength"])
    # lacquer
    b.inputs["Coat Weight"].default_value = 0.6
    b.inputs["Coat Roughness"].default_value = 0.04
    return m


def mat_glass():
    m, nt, b = principled("sapphire", (1, 1, 1), 0.0, 0.0)
    b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["IOR"].default_value = 1.77
    # anti-reflective coating keeps the dial visible: weaken specular a touch
    b.inputs["Specular IOR Level"].default_value = 0.12
    return m


def mat_leather(base):
    m, nt, b = principled("leather", base, 0.0, 0.7)
    b.inputs["Sheen Weight"].default_value = 0.04
    b.inputs["Specular IOR Level"].default_value = 0.25
    b.inputs["Sheen Roughness"].default_value = 0.5
    b.inputs["Coat Weight"].default_value = 0.05
    b.inputs["Coat Roughness"].default_value = 0.45
    tc = nt.nodes.new("ShaderNodeTexCoord")
    vo = nt.nodes.new("ShaderNodeTexVoronoi")
    vo.inputs["Scale"].default_value = 140.0
    vo.feature = "DISTANCE_TO_EDGE"
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 60.0
    nz.inputs["Detail"].default_value = 6.0
    nt.links.new(tc.outputs["Object"], vo.inputs["Vector"])
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    add = nt.nodes.new("ShaderNodeMath")
    add.operation = "ADD"
    nt.links.new(vo.outputs["Distance"], add.inputs[0])
    sc = nt.nodes.new("ShaderNodeMath")
    sc.operation = "MULTIPLY"
    sc.inputs[1].default_value = 0.15
    nt.links.new(nz.outputs[0], sc.inputs[0])
    nt.links.new(sc.outputs[0], add.inputs[1])
    bu = nt.nodes.new("ShaderNodeBump")
    bu.inputs["Strength"].default_value = 0.35
    bu.inputs["Distance"].default_value = 0.004
    nt.links.new(add.outputs[0], bu.inputs["Height"])
    nt.links.new(bu.outputs[0], b.inputs["Normal"])
    # slight tonal variation
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs["A"].default_value = (*base, 1)
    mix.inputs["B"].default_value = (base[0] * 1.6 + 0.01, base[1] * 1.6 + 0.01, base[2] * 1.6 + 0.01, 1)
    nz2 = nt.nodes.new("ShaderNodeTexNoise")
    nz2.inputs["Scale"].default_value = 8.0
    nt.links.new(tc.outputs["Object"], nz2.inputs["Vector"])
    nt.links.new(nz2.outputs[0], mix.inputs["Factor"])
    nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
    return m


M_FLANK = brushed_circular("flank", tuple(c * 0.86 for c in C["metal"]), rough=0.20)
M_POLISH = mat_polish("polish", C["metal"])
M_IDX = mat_polish("index", C["idx"], 0.03)
M_LUME, _, _b = principled("lume", (0.93, 0.92, 0.86), 0.0, 0.45)
M_SEC, _, _b = principled("second", C["sec"], 0.3, 0.25, **{"Coat Weight": 1.0})
M_GLASS = mat_glass()
M_LEATHER = mat_leather(tuple(c * 0.55 for c in C["strap"]))
M_STITCH, _, _b = principled("stitch", C["stitch"], 0.0, 0.7, **{"Sheen Weight": 0.5})
M_DATE, ntd, bd = principled("date", (1, 1, 1), 0.0, 0.5)
M_RHOD = mat_polish("rhodium", (0.78, 0.79, 0.80), 0.06)


# ------------------------------------------------------------------ dial artwork (PIL)
def build_dial(path, size=4096):
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
    o = size / 2
    k = size / 1024
    img = Image.new("RGB", (size, size), hexrgb_int(C["dial"]))
    # soft radial falloff: lighter centre, darker edge (the lacquer pools at the rim)
    grad = Image.radial_gradient("L").resize((size, size))
    c1, c2 = hexrgb_int(C["dial2"]), hexrgb_int(C["dial"])
    light = Image.new("RGB", (size, size), c1)
    img = Image.composite(img, light, grad.point(lambda v: min(255, int(v * 1.25))))
    edge = Image.radial_gradient("L").resize((size, size)).point(lambda v: 255 if v > 205 else int(v / 205 * 60))
    img = Image.composite(Image.new("RGB", (size, size), tuple(int(c * 0.55) for c in c2)), img, edge.point(lambda v: int(v * 0.6)))
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(img)
    dm = ImageDraw.Draw(mask)
    ink = hexrgb_int(C["ink"])

    def both(fn, *a, **kw):
        fn(d)(*a, fill=ink, **kw)
        fn(dm)(*a, fill=255, **kw)

    # minute track
    for i in range(60):
        if i % 5 == 0:
            continue
        a = i / 60 * 2 * math.pi
        x0, y0 = o + math.sin(a) * o * 0.955, o - math.cos(a) * o * 0.955
        x1, y1 = o + math.sin(a) * o * 0.915, o - math.cos(a) * o * 0.915
        both(lambda dd: dd.line, [(x0, y0), (x1, y1)], width=int(2.6 * k))
    for i in range(240):
        if i % 4 == 0:
            continue
        a = i / 240 * 2 * math.pi
        x0, y0 = o + math.sin(a) * o * 0.955, o - math.cos(a) * o * 0.955
        x1, y1 = o + math.sin(a) * o * 0.940, o - math.cos(a) * o * 0.940
        both(lambda dd: dd.line, [(x0, y0), (x1, y1)], width=max(1, int(1.0 * k)))
    for rr in (0.958, 0.912):
        d.ellipse([o - o * rr, o - o * rr, o + o * rr, o + o * rr], outline=ink, width=int(1.4 * k))
        dm.ellipse([o - o * rr, o - o * rr, o + o * rr, o + o * rr], outline=255, width=int(1.4 * k))

    def text(s, font, size_px, y, spacing):
        f = ImageFont.truetype(os.path.join(HERE, "fonts", font), int(size_px * k))
        widths = [f.getlength(ch) for ch in s]
        total = sum(widths) + spacing * k * (len(s) - 1)
        x = o - total / 2
        for ch, w in zip(s, widths):
            d.text((x, y), ch, font=f, fill=ink, anchor="lm")
            dm.text((x, y), ch, font=f, fill=255, anchor="lm")
            x += w + spacing * k

    text("SOLENNE", "Italiana.ttf", 70, o - o * 0.36, 16)
    text("AUTOMATIQUE", "Manrope-Medium.ttf", 19, o - o * 0.245, 7)
    text("LIGNE 39", "Manrope-Medium.ttf", 19, o + o * 0.40, 7)
    text("GENÈVE", "Manrope-Medium.ttf", 14, o + o * 0.47, 6)
    img.save(path)
    mask.save(path.replace(".png", "-mask.png"))


def hexrgb_int(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def build_date(path):
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("RGB", (256, 192), (244, 241, 233))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(os.path.join(HERE, "fonts", "Manrope-Medium.ttf"), 120)
    d.text((128, 100), "14", font=f, fill=(25, 25, 28), anchor="mm")
    img.save(path)


TEX = os.path.join(OUT, "_tex")
os.makedirs(TEX, exist_ok=True)
DIAL_PNG = os.path.join(TEX, f"dial-{CW}.png")
if not os.path.exists(DIAL_PNG):
    build_dial(DIAL_PNG)
DATE_PNG = os.path.join(TEX, "date.png")
if not os.path.exists(DATE_PNG):
    build_date(DATE_PNG)
M_DIAL = mat_dial(DIAL_PNG)
tx = ntd.nodes.new("ShaderNodeTexImage")
tx.image = bpy.data.images.load(DATE_PNG)
ntd.links.new(tx.outputs[0], bd.inputs["Base Color"])

# ------------------------------------------------------------------ the watch
watch = bpy.data.objects.new("watch", None)
col.objects.link(watch)


def parent(ob):
    ob.parent = watch
    return ob


# case: polished lower chamfer, brushed flank, polished upper chamfer
case_prof = [
    (0.0, -0.50), (1.20, -0.50), (1.52, -0.47), (1.70, -0.42),     # case back
    (1.80, -0.36), (1.88, -0.27),                                   # lower chamfer (polished)
    (1.93, -0.16), (1.95, 0.00), (1.95, 0.14), (1.935, 0.24),       # flank (brushed)
    (1.90, 0.30), (1.80, 0.345),                                    # upper chamfer (polished)
    (1.60, 0.35), (1.60, 0.12), (0.0, 0.12),
]
flank_segs = {5, 6, 7, 8}
parent(lathe("case", case_prof, [M_POLISH, M_FLANK], mat_of=lambda i: 1 if i in flank_segs else 0))

# bezel: concave, polished, with a coin edge
bez_prof = [(1.58, 0.35), (1.965, 0.35), (1.975, 0.40), (1.965, 0.47), (1.90, 0.53), (1.80, 0.565), (1.68, 0.57), (1.60, 0.555), (1.565, 0.52), (1.565, 0.35)]
parent(lathe("bezel", bez_prof, [M_POLISH], closed=True))
bm = bmesh.new()
NK = 300
for i in range(NK):
    a = 2 * math.pi * i / NK
    vs = box(bm, 0, 0, 0, 0.016, 0.009, 0.08)
    bmesh.ops.transform(bm, matrix=Matrix.Rotation(a, 4, "Z") @ Matrix.Translation((1.975, 0, 0.415)), verts=vs)
me = bpy.data.meshes.new("coin")
bm.to_mesh(me)
bm.free()
ob = parent(link("coin", me, [M_POLISH]))
bevel(ob, 0.004, 2)

# crystal: domed sapphire with real thickness
cry = [(0.0, 0.655), (0.7, 0.648), (1.2, 0.628), (1.5, 0.600), (1.585, 0.575), (1.585, 0.53), (1.5, 0.552), (1.2, 0.578), (0.7, 0.596), (0.0, 0.602)]
c = parent(lathe("crystal", cry, [M_GLASS], closed=True))

# dial + rehaut
bm = bmesh.new()
bmesh.ops.create_circle(bm, cap_ends=True, segments=256, radius=1.56)
for v in bm.verts:
    v.co.z = 0.16
me = bpy.data.meshes.new("dial")
bm.to_mesh(me)
bm.free()
uv = me.uv_layers.new()
for loop in me.loops:
    co = me.vertices[loop.vertex_index].co
    uv.data[loop.index].uv = (co.x / 3.12 + 0.5, co.y / 3.12 + 0.5)
parent(link("dial", me, [M_DIAL]))
rehaut = parent(lathe("rehaut", [(1.50, 0.16), (1.60, 0.30), (1.60, 0.16)], [M_POLISH], closed=True))

# applied indices (bevelled, polished) with lume inserts
bm = bmesh.new()
bl = bmesh.new()
for h in range(12):
    if h == 3:
        continue
    a = math.pi / 2 - h / 12 * 2 * math.pi
    rot = a - math.pi / 2
    offs = [-0.055, 0.055] if h == 0 else [0.0]
    for e in offs:
        cx = math.cos(a) * 1.24 + math.cos(a - math.pi / 2) * e
        cy = math.sin(a) * 1.24 + math.sin(a - math.pi / 2) * e
        L = 0.34 if h % 3 == 0 else 0.28
        box(bm, cx, cy, 0.19, 0.075, L, 0.05, rot)
        box(bl, cx, cy, 0.217, 0.03, L * 0.72, 0.006, rot)
me = bpy.data.meshes.new("indices")
bm.to_mesh(me)
bm.free()
ob = parent(link("indices", me, [M_IDX]))
bevel(ob, 0.012, 2)
me = bpy.data.meshes.new("lume")
bl.to_mesh(me)
bl.free()
parent(link("lume", me, [M_LUME]))

# date window at 3 o'clock: polished frame + printed disc
bm = bmesh.new()
for sx, sy, x, y in [(0.38, 0.04, 1.18, 0.135), (0.38, 0.04, 1.18, -0.135), (0.04, 0.31, 1.0, 0), (0.04, 0.31, 1.36, 0)]:
    box(bm, x, y, 0.185, sx, sy, 0.05)
me = bpy.data.meshes.new("dateframe")
bm.to_mesh(me)
bm.free()
ob = parent(link("dateframe", me, [M_IDX]))
bevel(ob, 0.01, 2)
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
for v in bm.verts:
    v.co.x *= 0.32 / 1.0
    v.co.y *= 0.23 / 1.0
    v.co += Vector((1.18, 0, 0.162))
me = bpy.data.meshes.new("date")
bm.to_mesh(me)
bm.free()
me.uv_layers.new()
for poly in me.polygons:
    for li in poly.loop_indices:
        co = me.vertices[me.loops[li].vertex_index].co
        me.uv_layers[0].data[li].uv = ((co.x - 1.02) / 0.32, (co.y + 0.115) / 0.23)
parent(link("date", me, [M_DATE]))


# hands: faceted dauphine (ridge down the middle)
def dauphine(name, L, w, tail, h, z):
    bm = bmesh.new()
    A = bm.verts.new((0, -tail, z))
    B = bm.verts.new((-w, 0.12 * L, z))
    Cc = bm.verts.new((w, 0.12 * L, z))
    D = bm.verts.new((0, L, z))
    R1 = bm.verts.new((0, -tail * 0.7, z + h * 0.6))
    R2 = bm.verts.new((0, 0.12 * L, z + h))
    for f in [(B, D, R2), (D, Cc, R2), (A, R1, R2, B), (Cc, R2, R1, A), (A, B, D, Cc)]:
        bm.faces.new(f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return link(name, me, [M_IDX])


hour = parent(dauphine("hour", 0.92, 0.085, 0.16, 0.035, 0.25))
minute = parent(dauphine("minute", 1.40, 0.065, 0.20, 0.03, 0.29))
hour.rotation_euler.z = -((10 + 10 / 60) / 12) * 2 * math.pi
minute.rotation_euler.z = -(10 / 60) * 2 * math.pi
bm = bmesh.new()
box(bm, 0, 0.55, 0.335, 0.016, 1.75, 0.01)
r = bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.06, radius2=0.06, depth=0.012)
bmesh.ops.translate(bm, verts=r["verts"], vec=(0, -0.42, 0.335))
r = bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.07, radius2=0.07, depth=0.07)
bmesh.ops.translate(bm, verts=r["verts"], vec=(0, 0, 0.32))
me = bpy.data.meshes.new("seconds")
bm.to_mesh(me)
bm.free()
sec = parent(link("seconds", me, [M_SEC]))
smooth(sec)
sec.rotation_euler.z = -(32 / 60) * 2 * math.pi

# lugs: side profile extruded, bevelled
def lug(name, sx, sy):
    prof = [(1.50, -0.38), (2.42, -0.28), (2.60, -0.20), (2.64, -0.06), (2.58, 0.10), (2.40, 0.22), (2.10, 0.29), (1.50, 0.34)]
    bm = bmesh.new()
    left = [bm.verts.new((-0.15, y, z)) for y, z in prof]
    right = [bm.verts.new((0.15, y, z)) for y, z in prof]
    bm.faces.new(left[::-1])
    bm.faces.new(right)
    n = len(prof)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((left[i], left[j], right[j], right[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = parent(link(name, me, [M_FLANK]))
    ob.location = (sx * 0.86, 0, 0)
    ob.scale = (1, sy, 1)
    bevel(ob, 0.05, 3)
    sub = ob.modifiers.new("sub", "SUBSURF")
    sub.levels = sub.render_levels = 2
    for p in me.polygons:
        p.use_smooth = True
    return ob


for sx in (-1, 1):
    for sy in (-1, 1):
        lug(f"lug{sx}{sy}", sx, sy)

# crown: knurled, with a tube
bm = bmesh.new()
r = bmesh.ops.create_cone(bm, cap_ends=True, segments=96, radius1=0.27, radius2=0.27, depth=0.30)
bmesh.ops.rotate(bm, verts=r["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
bmesh.ops.translate(bm, verts=r["verts"], vec=(2.20, 0, 0))
for i in range(40):
    a = 2 * math.pi * i / 40
    vs = box(bm, 0, 0, 0, 0.26, 0.03, 0.035)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((2.20, 0, 0)) @ Matrix.Rotation(a, 4, "X") @ Matrix.Translation((0, 0, 0.27)), verts=vs)
r = bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=0.12, radius2=0.12, depth=0.16)
bmesh.ops.rotate(bm, verts=r["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
bmesh.ops.translate(bm, verts=r["verts"], vec=(2.0, 0, 0))
me = bpy.data.meshes.new("crown")
bm.to_mesh(me)
bm.free()
ob = parent(link("crown", me, [M_POLISH]))
bevel(ob, 0.008, 2)
smooth(ob, 40)


# strap: padded leather curving away under the wrist, stitched along both edges
def strap(name, sy):
    R, L, Wd, T = 3.2, 6.2, 1.70, 0.16
    y0, z0 = 2.45, -0.06
    nu, nv = 80, 12
    bm = bmesh.new()
    grid = []
    for i in range(nu + 1):
        s = L * i / nu
        ang = s / R
        y = y0 + R * math.sin(ang)
        z = z0 - R * (1 - math.cos(ang))
        ny, nz = -math.sin(ang), math.cos(ang)  # outward normal of the bend
        taper = 1 - 0.18 * (s / L)
        row = []
        for j in range(nv + 1):
            u = j / nv * 2 - 1
            x = u * Wd / 2 * taper
            pad = T * (0.55 + 0.45 * math.sqrt(max(0, 1 - u ** 4)))  # thicker in the middle
            top = bm.verts.new((x, y + ny * pad / 2, z + nz * pad / 2))
            bot = bm.verts.new((x, y - ny * pad / 2, z - nz * pad / 2))
            row.append((top, bot))
        grid.append(row)
    for i in range(nu):
        for j in range(nv):
            a, b = grid[i][j], grid[i][j + 1]
            c2, d2 = grid[i + 1][j + 1], grid[i + 1][j]
            bm.faces.new((a[0], b[0], c2[0], d2[0]))
            bm.faces.new((d2[1], c2[1], b[1], a[1]))
    for i in range(nu):
        for j in (0, nv):
            a, d2 = grid[i][j], grid[i + 1][j]
            bm.faces.new((a[0], d2[0], d2[1], a[1]))
    for i in (0, nu):
        for j in range(nv):
            a, b = grid[i][j], grid[i][j + 1]
            bm.faces.new((a[0], a[1], b[1], b[0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = parent(link(name, me, [M_LEATHER]))
    ob.scale = (1, sy, 1)
    for p in me.polygons:
        p.use_smooth = True
    # stitches
    bm = bmesh.new()
    for i in range(6, nu - 1, 1):
        s = L * (i + 0.5) / nu
        ang = s / R
        y = y0 + R * math.sin(ang)
        z = z0 - R * (1 - math.cos(ang))
        ny, nz = -math.sin(ang), math.cos(ang)
        taper = 1 - 0.18 * (s / L)
        for x in (-Wd / 2 * taper + 0.09, Wd / 2 * taper - 0.09):
            vs = box(bm, 0, 0, 0, 0.022, 0.05, 0.02)
            M = Matrix.Translation((x, y + ny * T * 0.33, z + nz * T * 0.33)) @ Matrix.Rotation(-ang, 4, "X")
            bmesh.ops.transform(bm, matrix=M, verts=vs)
    me = bpy.data.meshes.new(name + "-st")
    bm.to_mesh(me)
    bm.free()
    st = parent(link(name + "-st", me, [M_STITCH]))
    st.scale = (1, sy, 1)
    bevel(st, 0.008, 2)


strap("strap12", 1)
strap("strap6", -1)

# spring bars visible between the lugs
for sy in (-1, 1):
    bm = bmesh.new()
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.035, radius2=0.035, depth=1.72)
    bmesh.ops.rotate(bm, verts=r["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
    bmesh.ops.translate(bm, verts=r["verts"], vec=(0, sy * 2.38, -0.04))
    me = bpy.data.meshes.new("bar")
    bm.to_mesh(me)
    bm.free()
    parent(link("bar", me, [M_RHOD]))

# ------------------------------------------------------------------ studio
world = bpy.data.worlds.new("studio")
scene.world = world
world.use_nodes = True
wn = world.node_tree
bg = wn.nodes["Background"]
env = wn.nodes.new("ShaderNodeTexEnvironment")
hdr = os.path.join(HERE, "..", "theme-v5", "assets", "casa-sky.hdr")
env.image = bpy.data.images.load(os.path.abspath(hdr))
lp = wn.nodes.new("ShaderNodeLightPath")
mix = wn.nodes.new("ShaderNodeMixShader")
bgcam = wn.nodes.new("ShaderNodeBackground")
bgcam.inputs[0].default_value = (0.012, 0.011, 0.010, 1)
wn.links.new(env.outputs[0], bg.inputs[0])
bg.inputs[1].default_value = 0.25
wn.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
wn.links.new(bg.outputs[0], mix.inputs[1])
wn.links.new(bgcam.outputs[0], mix.inputs[2])
wn.links.new(mix.outputs[0], wn.nodes["World Output"].inputs[0])


def area(name, loc, rot, size, energy, color=(1, 0.97, 0.93), shape="RECTANGLE", size_y=None, cam_visible=False):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy
    ld.color = color
    ld.shape = shape
    ld.size = size
    if size_y:
        ld.size_y = size_y
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    ob.rotation_euler = rot
    ob.visible_camera = cam_visible
    col.objects.link(ob)
    return ob


def card(name, loc, rot, sx, sy, strength, color=(1, 1, 1)):
    """Emission card: invisible to the camera, but seen in the reflections of the polished steel."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[0].default_value = (*color, 1)
    em.inputs[1].default_value = strength
    # soft falloff to the edges like a real softbox
    tc = nt.nodes.new("ShaderNodeTexCoord")
    gr = nt.nodes.new("ShaderNodeTexGradient")
    gr.gradient_type = "QUADRATIC_SPHERE"
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Location"].default_value = (0, 0, 0)
    mp.inputs["Scale"].default_value = (0.75, 0.75, 1)
    nt.links.new(tc.outputs["Object"], mp.inputs[0])
    nt.links.new(mp.outputs[0], gr.inputs[0])
    ramp = nt.nodes.new("ShaderNodeMath")
    ramp.operation = "POWER"
    ramp.inputs[1].default_value = 2.2
    nt.links.new(gr.outputs[1], ramp.inputs[0])
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = strength
    nt.links.new(ramp.outputs[0], mul.inputs[0])
    nt.links.new(mul.outputs[0], em.inputs[1])
    nt.links.new(em.outputs[0], nt.nodes["Material Output"].inputs[0])
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(name, me, [m])
    ob.location = loc
    ob.rotation_euler = rot
    ob.scale = (sx, sy, 1)
    ob.visible_camera = False
    ob.visible_shadow = False
    return ob


# key: large softbox overhead and slightly behind; rim strips left/right; fill card in front
area("key", (0.0, 3.5, 9.0), (math.radians(-20), 0, 0), 7.0, 2200, size_y=5.0)
area("rimL", (-7.5, 1.0, 2.5), (0, math.radians(-72), math.radians(8)), 0.6, 900, color=(0.92, 0.95, 1.0), size_y=8.0)
area("rimR", (7.5, -1.0, 3.0), (0, math.radians(72), math.radians(-8)), 0.6, 1100, size_y=8.0)
card("cardTop", (0, 2.0, 7.0), (math.radians(-12), 0, 0), 9.0, 6.0, 2.0)
card("cardFront", (0, -9.0, 2.0), (math.radians(80), 0, 0), 12.0, 1.6, 5.0)
card("cardBack", (0, 9.0, 4.0), (math.radians(-70), 0, 0), 12.0, 2.5, 4.0, (1.0, 0.92, 0.82))

# floor: dark stone with a soft reflection, seen only near the watch
fm, fnt, fb = principled("floor", (0.022, 0.021, 0.020), 0.0, 0.32)
fb.inputs["Coat Weight"].default_value = 0.3
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60)
me = bpy.data.meshes.new("floor")
bm.to_mesh(me)
bm.free()
floor = link("floor", me, [fm])
floor.location = (0, 0, -1.6)

# ------------------------------------------------------------------ camera
cam_d = bpy.data.cameras.new("cam")
cam_d.lens = 85
cam_d.sensor_width = 36
cam_d.dof.use_dof = True
cam_d.dof.aperture_fstop = 5.6
cam = bpy.data.objects.new("cam", cam_d)
col.objects.link(cam)
scene.camera = cam
focus = bpy.data.objects.new("focus", None)
col.objects.link(focus)
cam_d.dof.focus_object = focus


def ease(t):
    return t * t * (3 - 2 * t)


# keyed shots (frame fraction -> camera position, look-at, watch rotation)
SHOTS = [
    # f     cam pos                 target             watch tilt (x, z)
    (0.00, (0.0, -24.0, 15.0), (0.0, 0.3, -0.2), (math.radians(0), math.radians(-28))),   # hero 3/4, whole watch on strap
    (0.30, (0.0, -9.5, 9.0), (0.15, 0.0, 0.2), (math.radians(0), math.radians(-12))),     # push in to the dial
    (0.52, (2.0, -4.4, 5.2), (0.5, -0.1, 0.25), (math.radians(0), math.radians(8))),      # macro: date, hands, sunburst
    (0.74, (11.0, -6.5, 3.4), (1.2, 0.0, 0.0), (math.radians(0), math.radians(30))),      # orbit to the crown and case profile
    (1.00, (5.5, -21.0, 12.0), (0.2, 0.2, -0.2), (math.radians(0), math.radians(-20))),   # pull out: hero again
]


def pose(p):
    for i in range(len(SHOTS) - 1):
        a, b = SHOTS[i], SHOTS[i + 1]
        if p <= b[0] or i == len(SHOTS) - 2:
            t = ease(min(1, max(0, (p - a[0]) / (b[0] - a[0]))))
            lerp = lambda u, v: tuple(x + (y - x) * t for x, y in zip(u, v))
            return lerp(a[1], b[1]), lerp(a[2], b[2]), lerp(a[3], b[3])


def set_pose(p):
    pos, tgt, (tx, tz) = pose(p)
    cam.location = pos
    d = Vector(tgt) - Vector(pos)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    focus.location = tgt
    watch.rotation_euler = (tx, 0, tz)


# ------------------------------------------------------------------ render
r = scene.render
r.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = SPP
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 12
scene.cycles.transmission_bounces = 12
scene.cycles.glossy_bounces = 8
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False
scene.cycles.blur_glossy = 0.5
r.resolution_x, r.resolution_y = W, H
r.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "AgX"
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass
scene.view_settings.exposure = 0.0

if FRAMES == "still":
    frames = [int(N * 0.0), int(N * 0.52), int(N * 0.74)]
else:
    frames = [int(x) for x in FRAMES.split(",") if x != ""]
for f in frames:
    set_pose(f / (N - 1))
    r.filepath = os.path.join(OUT, f"w-{f:03d}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", f, flush=True)
