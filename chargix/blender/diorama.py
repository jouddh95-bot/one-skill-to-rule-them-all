# CHARGIX · The living miniature — one open-front room on a plinth, path-traced in Cycles.
#
# A fixed elevated three-quarter camera looks into a single apartment box. Scroll
# progress p∈[0,1] drives a day in the life of a new business (cookie bakery or
# clothing label): the sun crosses the window and sets, practical lamps come on,
# furniture and props change, and one figure works through the story. Everything is
# computed from p (no keyframes), so any frame can be rendered alone (sharded CI).
#
# Assets: Poly Haven CC0 models / textures / HDRIs (chargix/assets/ph), the CC0
# MakeHuman figure from character.py (theme-v5/assets/diorama-man.glb), fonts in ./fonts.
#
# usage: python diorama.py <outdir> <frames "0,5,9" | "p:0.1,0.5"> [W H spp story]
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix, Quaternion, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
PH = os.path.join(HERE, "..", "assets", "ph")
FIG = os.environ.get("CX_FIG", os.path.join(HERE, "..", "theme-v5", "assets", "diorama-man.glb"))
FONT = os.path.join(HERE, "fonts", "Manrope-Medium.ttf")
OUT = sys.argv[1]; FRAMES = sys.argv[2]
W, H, SPP = (int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (1600, 1000, 96)
STORY = sys.argv[6] if len(sys.argv) > 6 else "cookie"
if STORY not in ("cookie", "clothing"): STORY = "cookie"
N = int(os.environ.get("CX_N", "240"))
os.makedirs(OUT, exist_ok=True)
TMP = os.path.join(OUT, "_tex"); os.makedirs(TMP, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene; col = scene.collection
RX, RY, WH, WT = 3.5, 2.5, 2.7, 0.15        # floor x∈[-RX,RX], y∈[-FY,RY]; walls at x=-RX (window) and y=+RY
FY = 1.95                                     # the open front edge sits closer than the back wall (a tighter, fuller box)
YC, YS = (RY - FY) / 2, RY + FY               # floor centre / depth along y
DEG = math.pi / 180
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def smooth(a, b, x): t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t)
def lerp(a, b, t): return a + (b - a) * t
def V(x, y, z=0.0): return Vector((x, y, z))

def hexc(h, a=1.0):
    h = h.lstrip("#"); s = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in s) + (a,)

# ------------------------------------------------------------------ materials
def principled(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    return m, nt, nt.nodes["Principled BSDF"]

def flat(name, h, rough=0.5, metal=0.0, **kw):
    m, nt, b = principled(name)
    b.inputs["Base Color"].default_value = hexc(h); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    for k, v in kw.items(): b.inputs[k].default_value = v
    return m

def pbr(name, tex, scale=1.0, tint=None, rough_mul=1.0, bump=0.0, box=False, normal=1.0, sat=1.0):
    """Poly Haven PBR set; world-scaled object coordinates (scale = repeats per metre), box projection for UV-less meshes."""
    d = os.path.join(PH, "tex", tex); m, nt, b = principled(name); N_, L = nt.nodes, nt.links
    tc = N_.new("ShaderNodeTexCoord"); mp = N_.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (scale, scale, scale)
    L.new(tc.outputs["Object"], mp.inputs["Vector"])
    def img(file, non_color=False):
        p = os.path.join(d, file)
        if not os.path.exists(p): return None
        t = N_.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(p, check_existing=True)
        if non_color: t.image.colorspace_settings.name = "Non-Color"
        t.projection = "BOX"; t.projection_blend = 0.25
        L.new(mp.outputs["Vector"], t.inputs["Vector"]); return t
    dif = img("Diffuse.jpg")
    if dif and sat != 1.0:
        hs = N_.new("ShaderNodeHueSaturation"); hs.inputs["Saturation"].default_value = sat
        L.new(dif.outputs["Color"], hs.inputs["Color"]); dif = hs
    if dif:
        if tint:
            mix = N_.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"; mix.inputs["Factor"].default_value = 1.0
            L.new(dif.outputs["Color"], mix.inputs[6]); mix.inputs[7].default_value = hexc(tint); L.new(mix.outputs[2], b.inputs["Base Color"])
        else: L.new(dif.outputs["Color"], b.inputs["Base Color"])
    elif tint: b.inputs["Base Color"].default_value = hexc(tint)
    r = img("Rough.jpg", True)
    if r:
        mt = N_.new("ShaderNodeMath"); mt.operation = "MULTIPLY"; mt.inputs[1].default_value = rough_mul
        L.new(r.outputs["Color"], mt.inputs[0]); L.new(mt.outputs[0], b.inputs["Roughness"])
    # relief from the height map through a bump node: tangent-space normal maps need UVs, and the
    # procedural blocks / skinned garments here are box-projected without them
    n = img("Displacement.jpg", True)
    if n:
        bp = N_.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.35 * normal; bp.inputs["Distance"].default_value = 0.004 / max(scale, 0.2)
        L.new(n.outputs["Color"], bp.inputs["Height"]); L.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m

def plaster_wall(name, tint):
    return pbr(name, "plastered_wall_04", scale=0.45, tint=tint, normal=0.6)

def emission(name, h, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N_ = nt.nodes
    for n in list(N_): N_.remove(n)
    e = N_.new("ShaderNodeEmission"); o = N_.new("ShaderNodeOutputMaterial")
    e.inputs["Color"].default_value = hexc(h); e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs[0], o.inputs[0]); return m

def glass_mat():
    m, nt, b = principled("glass"); b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["Roughness"].default_value = 0.02; b.inputs["IOR"].default_value = 1.45; b.inputs["Base Color"].default_value = (0.95, 0.97, 0.98, 1)
    return m

def image_mat(name, path, rough=0.6, emit=0.0, alpha=False):
    m, nt, b = principled(name); N_, L = nt.nodes, nt.links
    t = N_.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(path, check_existing=False); t.name = "IMG"
    L.new(t.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = rough
    if emit:
        L.new(t.outputs["Color"], b.inputs["Emission Color"]); b.inputs["Emission Strength"].default_value = emit
    if alpha:
        L.new(t.outputs["Alpha"], b.inputs["Alpha"])
    return m

# ------------------------------------------------------------------ geometry helpers
def link(ob): col.objects.link(ob); return ob

def block(name, size, loc, mat, bevel=0.006, rot=0.0, seg=3):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); me.materials.append(mat)
    ob.location = loc; ob.rotation_euler = (0, 0, rot)
    if bevel:
        bv = ob.modifiers.new("bv", "BEVEL"); bv.width = min(bevel, min(size) / 2.5); bv.segments = seg; bv.limit_method = "NONE"; bv.harden_normals = False
    for p in me.polygons: p.use_smooth = bool(bevel)          # a smooth-shaded unbevelled box bends its face normals
    return ob

def cyl(name, r, h, loc, mat, seg=48, r2=None, bevel=0.0):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); me.materials.append(mat); ob.location = loc
    for p in me.polygons: p.use_smooth = True
    if bevel: bv = ob.modifiers.new("bv", "BEVEL"); bv.width = bevel; bv.segments = 2; bv.limit_method = "ANGLE"
    return ob

def empty(name, loc=(0, 0, 0)):
    e = link(bpy.data.objects.new(name, None)); e.location = loc; return e

def parent(children, p):
    for c in children: c.parent = p
    return p

def gltf(name, loc=(0, 0, 0), rot=0.0, scale=1.0):
    path = os.path.join(PH, name, name + ".gltf")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.type == "LIGHT": bpy.data.objects.remove(o, do_unlink=True)
    new = [o for o in bpy.data.objects if o not in before]
    root = empty(name + "_root")
    for o in new:
        if o.parent is None: o.parent = root
    root.location = loc; root.rotation_euler = (0, 0, rot); root.scale = (scale, scale, scale)
    return root

def retint(root, sat=1.0, val=1.0, screen=None, amt=0.0):
    """Re-grade every material under an imported asset: saturation/value, optionally lifted toward a colour (screen)."""
    done = set()
    for o in [root] + list(root.children_recursive):
        if o.type != "MESH": continue
        for i, m in enumerate(o.data.materials):
            if not m or m.name in done: continue
            m = m.copy(); o.data.materials[i] = m; done.add(m.name)
            nt = m.node_tree; b = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if not b or not b.inputs["Base Color"].is_linked: continue
            src = b.inputs["Base Color"].links[0].from_socket
            hs = nt.nodes.new("ShaderNodeHueSaturation"); hs.inputs["Saturation"].default_value = sat; hs.inputs["Value"].default_value = val
            nt.links.new(src, hs.inputs["Color"]); out = hs.outputs["Color"]
            if screen:
                mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "SCREEN"; mx.inputs["Factor"].default_value = amt
                nt.links.new(out, mx.inputs[6]); mx.inputs[7].default_value = hexc(screen); out = mx.outputs[2]
            nt.links.new(out, b.inputs["Base Color"])
    return root

# ------------------------------------------------------------------ materials library
M = {}
M["floor"] = pbr("parquet", "herringbone_parquet", scale=0.8, tint="#f4ece4", rough_mul=0.85, sat=0.72)
M["wallL"] = plaster_wall("wallL", "#d8c4b4"); M["wallB"] = plaster_wall("wallB", "#d4c2b4")
M["cap"] = flat("cap", "#e9e4ef", 0.65)
M["plinth"] = flat("plinth", "#1c1b22", 0.38)
M["plinthDark"] = flat("plinthDark", "#16151c", 0.5)
M["neon"] = emission("neon", "#a46bff", 6.0)
M["ground"] = flat("ground", "#060609", 0.4); M["ground"].node_tree.nodes["Principled BSDF"].inputs["Specular IOR Level"].default_value = 0.3
M["cab"] = flat("cabinet", "#33353a", 0.48, coat=0.0) if False else flat("cabinet", "#34363b", 0.5)
M["cabFront"] = pbr("cabFront", "kitchen_wood", scale=0.6, tint="#5b5e66", rough_mul=0.9)
M["top"] = pbr("worktop", "oak_veneer_01", scale=0.8, tint="#e8c9a6", rough_mul=0.75)
M["tiles"] = pbr("tiles", "long_white_tiles", scale=1.6, tint="#f2ece4", rough_mul=0.6)
M["steel"] = flat("steel", "#b6b9bd", 0.28, 1.0)
M["black"] = flat("blackMetal", "#151517", 0.38, 0.6)
M["glass"] = glass_mat()
M["ceramic"] = flat("ceramic", "#efebe5", 0.25)
M["linen"] = pbr("linen", "rough_linen", scale=3, tint="#e6ddd3", sat=0.0)
M["rug"] = pbr("rug", "knitted_fleece", scale=2.0, tint="#a8a2a6", normal=1.4)
M["trug"] = pbr("trug", "fabric_pattern_07", scale=1.2, tint="#7f766f", normal=0.8)
M["krug"] = pbr("krug", "rough_linen", scale=2.5, tint="#77706a", sat=0.0)
M["curtain"] = pbr("curtain", "rough_linen", scale=2.2, tint="#efe2d4", sat=0.0)
M["oak"] = pbr("oak", "oak_veneer_01", scale=0.9, tint="#c89a74", rough_mul=0.8)
M["screen"] = emission("screenOff", "#0b0c10", 0.0)
M["blackGloss"] = flat("tvBlack", "#08080a", 0.12, 0.2)
M["paper"] = flat("paper", "#f3efe8", 0.85)

# ------------------------------------------------------------------ room shell
def room():
    # plinth: pale slab with a dark base band and one thin violet line along the two visible edges
    block("plinth", (RX * 2 + 0.36, YS + 0.36, 0.22), V(0, YC, -0.11), M["plinth"], 0.012)
    block("plinthBase", (RX * 2 + 0.3, YS + 0.3, 0.1), V(0, YC, -0.27), M["plinthDark"], 0.01)
    block("neonY", (RX * 2 + 0.31, 0.012, 0.012), V(0, -FY - 0.152, -0.225), M["neon"], 0)
    block("neonX", (0.012, YS + 0.31, 0.012), V(RX + 0.152, YC, -0.225), M["neon"], 0)
    g = block("ground", (60, 60, 0.02), V(0, 0, -0.33), M["ground"], 0)
    g.visible_transmission = False          # through the window glass the view continues to the city sky, not the studio floor
    fl = block("floor", (RX * 2, YS, 0.02), V(0, YC, -0.007), M["floor"], 0.002)   # top 3 mm above the plinth (no z-fighting)
    # back wall (kitchen + desk) and window wall with an opening
    block("wallB", (RX * 2 + WT, WT, WH), V(-WT / 2, RY + WT / 2, WH / 2), M["wallB"], 0.004)
    y0, y1, z0, z1 = -1.05, 1.45, 0.62, 2.38
    segs = [(-FY, y0, 0, WH), (y1, RY + WT, 0, WH), (y0, y1, 0, z0), (y0, y1, z1, WH)]
    for i, (a, b, c, d) in enumerate(segs):
        block(f"wallL{i}", (WT, b - a, d - c), V(-RX - WT / 2, (a + b) / 2, (c + d) / 2), M["wallL"], 0.003)
    block("capB", (RX * 2 + WT, WT + 0.004, 0.01), V(-WT / 2, RY + WT / 2, WH + 0.005), M["cap"], 0)
    block("capL", (WT + 0.004, YS + WT, 0.01), V(-RX - WT / 2, YC + WT / 2, WH + 0.005), M["cap"], 0)
    # skirting boards
    block("skB", (RX * 2, 0.018, 0.09), V(0, RY - 0.009, 0.045), M["cap"], 0.002)
    block("skL", (0.018, YS, 0.09), V(-RX + 0.009, YC, 0.045), M["cap"], 0.002)
    # window: black steel frame, mullion + transom, glass, deep sill
    wx = -RX - WT / 2
    for yy in (y0 + 0.025, y1 - 0.025, (y0 + y1) / 2): block("mull", (WT + 0.03, 0.05, z1 - z0), V(wx, yy, (z0 + z1) / 2), M["black"], 0.004)
    for zz in (z0 + 0.025, z1 - 0.025, 1.7): block("tran", (WT + 0.03, y1 - y0, 0.05), V(wx, (y0 + y1) / 2, zz), M["black"], 0.004)
    gl = block("glass", (0.008, y1 - y0, z1 - z0), V(wx, (y0 + y1) / 2, (z0 + z1) / 2), M["glass"], 0)
    gl.visible_shadow = False
    block("sill", (0.26, y1 - y0 + 0.2, 0.04), V(-RX + 0.06, (y0 + y1) / 2, z0 - 0.02), M["cap"], 0.008)
    # curtains: pleated linen either side, on a black rod
    for (yy, w) in ((y0 - 0.32, 0.62), (y1 + 0.3, 0.6)):
        bm = bmesh.new(); nx, nz = 40, 2
        verts = []
        for i in range(nx + 1):
            for j in range(nz + 1):
                u = i / nx; verts.append(bm.verts.new((math.sin(u * 30) * 0.035 + 0.035, (u - 0.5) * w, j / nz * 2.35)))
        for i in range(nx):
            for j in range(nz):
                a = i * (nz + 1) + j; bm.faces.new((verts[a], verts[a + nz + 1], verts[a + nz + 2], verts[a + 1]))
        me = bpy.data.meshes.new("curtain"); bm.to_mesh(me); bm.free()
        c = link(bpy.data.objects.new("curtain", me)); me.materials.append(M["curtain"]); c.location = V(-RX + 0.1, yy, 0.18)
        for p in me.polygons: p.use_smooth = True
        s = c.modifiers.new("sol", "SOLIDIFY"); s.thickness = 0.006
    rod = cyl("rod", 0.012, y1 - y0 + 1.5, V(-RX + 0.12, (y0 + y1) / 2, 2.56), M["black"], 16); rod.rotation_euler = (math.pi / 2, 0, 0)
room()

# ------------------------------------------------------------------ kitchen along the back wall (x from the corner to ≈0)
def kitchen():
    x0, x1, d = -RX + 0.8, -0.15, 0.62; yc = RY - d / 2
    block("base", (x1 - x0, d - 0.06, 0.8), V((x0 + x1) / 2, yc + 0.03, 0.46), M["cab"], 0.004)
    block("plinthK", (x1 - x0, d - 0.12, 0.08), V((x0 + x1) / 2, yc + 0.06, 0.04), M["black"], 0.002)
    n = 5; w = (x1 - x0) / n
    for i in range(n):
        cx = x0 + w * (i + 0.5)
        block(f"door{i}", (w - 0.006, 0.02, 0.76), V(cx, RY - d + 0.01, 0.46), M["cabFront"], 0.003)
        if i != 2: block(f"pull{i}", (0.16, 0.022, 0.012), V(cx, RY - d - 0.008, 0.8), M["steel"], 0.004)
    # oven (third bay): black glass door with a glow plane behind it
    ox = x0 + w * 2.5
    block("ovenDoor", (w - 0.04, 0.024, 0.56), V(ox, RY - d - 0.004, 0.4), M["blackGloss"], 0.006)
    block("ovenBar", (w - 0.12, 0.03, 0.02), V(ox, RY - d - 0.03, 0.66), M["steel"], 0.006)
    glow = block("ovenGlow", (w - 0.12, 0.004, 0.36), V(ox, RY - d + 0.002, 0.38), emission("ovenGlow", "#ff8a3c", 0.0), 0)
    block("worktop", (x1 - x0 + 0.04, d + 0.03, 0.04), V((x0 + x1) / 2, yc - 0.01, 0.88), M["top"], 0.004)
    block("hob", (0.56, 0.48, 0.006), V(ox, yc, 0.903), M["blackGloss"], 0.003)
    block("sink", (0.5, 0.4, 0.004), V(x0 + w * 4.0, yc, 0.902), M["steel"], 0.002)
    tap = cyl("tap", 0.012, 0.32, V(x0 + w * 4.0, RY - 0.08, 1.06), M["steel"], 16)
    spout = cyl("spout", 0.01, 0.2, V(x0 + w * 4.0, RY - 0.17, 1.21), M["steel"], 16); spout.rotation_euler = (math.pi / 2, 0, 0)
    # tiled splashback, upper cabinets over the hob, warm LED strip under them, open oak shelf to the right
    block("splash", (x1 - x0, 0.012, 0.62), V((x0 + x1) / 2, RY - 0.006, 1.21), M["tiles"], 0.001)
    block("upper", (w * 2.2, 0.36, 0.72), V(x0 + w * 1.6, RY - 0.18, 1.97), M["cab"], 0.006)
    for i in range(3): block(f"udoor{i}", (w * 2.2 / 3 - 0.006, 0.02, 0.7), V(x0 + w * 1.6 + (i - 1) * w * 2.2 / 3, RY - 0.37, 1.97), M["cabFront"], 0.003)
    led = block("led", (w * 2.1, 0.02, 0.006), V(x0 + w * 1.6, RY - 0.3, 1.605), emission("led", "#ffd7a0", 0.0), 0)
    shelf = block("shelf", (w * 2.4, 0.26, 0.035), V(x0 + w * 3.9, RY - 0.13, 1.72), M["oak"], 0.004)
    block("shelf2", (w * 2.4, 0.26, 0.035), V(x0 + w * 3.9, RY - 0.13, 2.12), M["oak"], 0.004)
    # fridge in the corner: brushed steel
    fx = -RX + 0.42
    block("fridge", (0.76, 0.68, 1.96), V(fx, RY - 0.36, 0.98), M["steel"], 0.02)
    block("fridgeGap", (0.765, 0.01, 0.006), V(fx, RY - 0.705, 1.25), M["black"], 0)
    for z in (0.75, 1.55): block("fh", (0.02, 0.03, 0.42), V(fx + 0.3, RY - 0.72, z), M["black"], 0.006)
    return glow, led, (x0, x1, w)
OVEN_GLOW, KLED, KX = kitchen()

# kitchen dressing (Poly Haven CC0)
gltf("vintage_electric_kettle", V(-0.75, RY - 0.3, 0.9), 0.4, 0.75)
gltf("wooden_cutting_board", V(-1.45, RY - 0.12, 0.92), 0, 1.0).rotation_euler = (math.pi / 2 - 0.12, 0, 0)
gltf("jug_01", V(-0.4, RY - 0.13, 1.738), 0.3, 0.8)
gltf("ceramic_vase_02", V(-0.9, RY - 0.13, 1.738), 0, 0.55)
gltf("ceramic_vase_03", V(-0.62, RY - 0.13, 2.138), 0, 0.55)
gltf("potted_plant_04", V(-1.15, RY - 0.13, 2.138), 0.6, 1.0)
gltf("potted_plant_04", V(-0.3, RY - 0.13, 2.138), 2.2, 0.9)
gltf("tea_set_01", V(-1.15, RY - 0.13, 1.738), 0, 0.42)
gltf("potted_plant_02", V(-2.95, RY - 0.25, 1.965), 0.8, 0.55)   # on top of the fridge

# ------------------------------------------------------------------ living area
sofa = retint(gltf("sofa_02", V(-2.95, 0.25, 0), 90 * DEG, 1.12), 0.55, 1.0, "#b9aea4", 0.85)   # dark leather → warm greige
retint(gltf("throw_pillows_01", V(-2.98, 0.25, 0.38), 90 * DEG, 1.0), 0.18, 0.95)   # quieter, oatmeal
rug = block("rug", (2.0, 2.6, 0.012), V(-1.95, 0.25, 0.006), M["rug"], 0.006)
gltf("modern_coffee_table_01", V(-1.85, 0.25, 0), 0, 1.0)
gltf("ceramic_vase_01", V(-1.85, -0.08, 0.39), 0, 0.4)
book = gltf("book_encyclopedia_set_01", V(-1.95, 0.3, 0.39), 90 * DEG, 0.6)
armchair = gltf("modern_arm_chair_01", V(-0.75, -1.45, 0), 150 * DEG, 0.95)
tvcab = gltf("modern_wooden_cabinet", V(-1.6, -1.64, 0), 180 * DEG, 0.85)
tv = block("tv", (1.25, 0.05, 0.72), V(-1.6, -1.59, 0.98), M["blackGloss"], 0.008)
block("tvStand", (0.3, 0.18, 0.03), V(-1.6, -1.59, 0.595), M["black"], 0.006)
gltf("potted_plant_02", V(-2.65, -1.64, 0.58), 0, 0.5)
gltf("potted_plant_01", V(-3.1, 1.75, 0), 0.3, 1.05)
gltf("potted_plant_01", V(3.1, -0.2, 0), 2.0, 0.85)
gltf("planter_box_01", V(-RX + 0.13, -0.5, 0.64), 90 * DEG, 0.35)
block("tableRug", (2.4, 1.8, 0.008), V(1.4, -0.45, 0.004), M["trug"], 0.004)
block("krug", (1.6, 0.62, 0.008), V(-1.5, RY - 0.98, 0.004), M["krug"], 0.004)
# floor lamp by the window: black stem, linen drum shade with a warm emitter inside
lampX, lampY = -3.12, -1.55
cyl("lampBase", 0.14, 0.025, V(lampX, lampY, 0.0125), M["black"], 48, bevel=0.006)
cyl("lampStem", 0.011, 1.45, V(lampX, lampY, 0.75), M["black"], 16)
shade = cyl("lampShade", 0.2, 0.3, V(lampX, lampY, 1.55), M["linen"], 64, r2=0.17); shade.modifiers.new("s", "SOLIDIFY").thickness = 0.004
bpy.data.meshes[shade.data.name].polygons.foreach_set("hide", [False] * len(shade.data.polygons))
bm = bmesh.new(); bm.from_mesh(shade.data)
for f in [f for f in bm.faces if abs(f.normal.z) > 0.9]: bm.faces.remove(f)
bm.to_mesh(shade.data); bm.free()
# desk zone at the right of the back wall
desk = gltf("wooden_table_02", V(1.75, RY - 0.4, 0), 0, 1.0)
chair = gltf("dining_chair_02", V(1.75, RY - 0.98, 0), 180 * DEG, 1.0)
mon = block("monitor", (0.62, 0.03, 0.38), V(1.8, RY - 0.18, 1.12), M["black"], 0.008)
monScreen = block("monScreen", (0.585, 0.004, 0.345), V(1.8, RY - 0.197, 1.12), M["screen"], 0)
block("monNeck", (0.05, 0.03, 0.26), V(1.8, RY - 0.15, 0.92), M["black"], 0.006)
block("monFoot", (0.24, 0.16, 0.012), V(1.8, RY - 0.15, 0.806), M["black"], 0.004)
block("keyboard", (0.42, 0.13, 0.014), V(1.8, RY - 0.48, 0.807), flat("kb", "#d8d6d2", 0.6), 0.004)
gltf("stationery_supplies", V(1.3, RY - 0.25, 0.8), 0.2, 1.0)
# desk lamp
dl = (1.22, RY - 0.18)
cyl("dlBase", 0.07, 0.018, V(*dl, 0.809), M["black"], 32, bevel=0.004)
arm1 = cyl("dlArm", 0.008, 0.42, V(dl[0], dl[1], 1.0), M["black"], 12); arm1.rotation_euler = (0.25, 0, 0)
dsh = cyl("dlShade", 0.03, 0.12, V(dl[0], dl[1] - 0.1, 1.18), M["black"], 32, r2=0.07); dsh.rotation_euler = (-0.9, 0, 0)
shelves = gltf("wooden_display_shelves_01", V(3.05, RY - 0.22, 0), 90 * DEG, 1.0)
gltf("book_encyclopedia_set_01", V(2.8, RY - 0.25, 0.86), 0, 0.85)
gltf("ceramic_vase_01", V(3.2, RY - 0.22, 1.25), 0, 0.45)
gltf("potted_plant_04", V(2.9, RY - 0.22, 1.56), 0, 1.0)
gltf("standing_picture_frame_01", V(3.3, RY - 0.25, 0.48), -0.3, 1.0)
gltf("hanging_picture_frame_02", V(1.75, RY - 0.005, 1.9), 0, 0.9)
gltf("hanging_picture_frame_03", V(0.75, RY - 0.005, 1.75), 0, 1.0)
gltf("wall_clock", V(-0.55, RY - 0.005, 2.35), 0, 0.8)
gltf("hanging_picture_frame_01", V(-RX + 0.005, 1.95, 1.6), -90 * DEG, 0.7)

# ------------------------------------------------------------------ story props
def label_png(path, brand, sub, kind, w=512, h=320):
    from PIL import Image, ImageDraw, ImageFont
    bg, fg = ((20, 20, 24), (245, 243, 238)) if kind == "tee" else ((244, 234, 217), (59, 35, 20))
    im = Image.new("RGB", (w, h), bg); d = ImageDraw.Draw(im)
    f1 = ImageFont.truetype(FONT, 92 if kind == "tee" else 66); f2 = ImageFont.truetype(FONT, 26)
    d.text((w / 2, h / 2 - 16), brand, font=f1, fill=fg, anchor="mm"); d.text((w / 2, h / 2 + 62), sub, font=f2, fill=fg, anchor="mm")
    im.save(path); return path

def cardboard():
    m, nt, b = principled("kraft"); N_, L = nt.nodes, nt.links
    n = N_.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = 180; n.inputs["Detail"].default_value = 8
    ramp = N_.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].color = hexc("#a9784a"); ramp.color_ramp.elements[1].color = hexc("#c69a6a")
    L.new(n.outputs["Fac"], ramp.inputs["Fac"]); L.new(ramp.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.85
    bp = N_.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.15; L.new(n.outputs["Fac"], bp.inputs["Height"]); L.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m
M["kraft"] = cardboard()

def product_box(name, brand, kind, size=(0.3, 0.3, 0.12)):
    sx, sy, sz = size
    b = block(name, size, V(0, 0, sz / 2), M["kraft"] if kind != "tee" else flat("mailer", "#18181c", 0.45), 0.004)
    lab = label_png(os.path.join(TMP, f"label-{kind}.png"), brand, "est. 2026" if kind != "tee" else "NOVA STUDIO", kind)
    lm = M.get("lab-" + kind) or image_mat("lab-" + kind, lab, 0.7); M["lab-" + kind] = lm
    l = block(name + "L", (sx * 0.62, sy * 0.4, 0.002), V(0, -0.02, sz + 0.001), lm, 0)
    if kind != "tee": block(name + "T", (sx + 0.002, 0.05, 0.003), V(0, 0, sz + 0.0005), flat("tape", "#d9c9a8", 0.35), 0)
    root = empty(name + "_root"); parent([b, l] + ([bpy.data.objects[name + "T"]] if kind != "tee" else []), root)
    return root

def cookie(name, mat_dough, mat_chip, rnd):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=10, radius=0.04)
    for v in bm.verts: v.co.z *= 0.22; v.co.x *= 1 + (rnd.random() - 0.5) * 0.06
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); me.materials.append(mat_dough)
    for p in me.polygons: p.use_smooth = True
    d = ob.modifiers.new("disp", "DISPLACE"); t = bpy.data.textures.get("cookieNoise") or bpy.data.textures.new("cookieNoise", "CLOUDS"); t.noise_scale = 0.012; d.texture = t; d.strength = 0.004
    chips = []
    for k in range(6):
        a = rnd.random() * 6.28; r = rnd.random() * 0.028
        c = cyl(name + f"c{k}", 0.006, 0.006, V(math.cos(a) * r, math.sin(a) * r, 0.008), mat_chip, 8); chips.append(c)
    parent(chips, ob); return ob

def dough_mat():
    m, nt, b = principled("dough"); N_, L = nt.nodes, nt.links
    tc = N_.new("ShaderNodeTexCoord"); n = N_.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = 40
    L.new(tc.outputs["Object"], n.inputs["Vector"])
    ramp = N_.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].color = hexc("#b9793f"); ramp.color_ramp.elements[1].color = hexc("#e3b47a")
    L.new(n.outputs["Fac"], ramp.inputs["Fac"]); L.new(ramp.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.75
    b.inputs["Subsurface Weight"].default_value = 0.1
    return m

PROPS = {}   # name -> (root, kind)
def prop(name, ob, kind="pop"):
    PROPS[name] = (ob, kind, ob.location.copy(), ob.scale.copy()); return ob

rnd = random.Random(4)
work = gltf("wooden_table_02", V(1.4, -0.55, 0), 0, 1.0); prop("worktable", work, "slide")
if STORY == "cookie":
    DOUGH, CHIP = dough_mat(), flat("chip", "#2a160b", 0.4)
    tray_m = flat("tray", "#9fa3a8", 0.3, 1.0)
    for t in range(3):
        tr = block(f"tray{t}", (0.46, 0.32, 0.015), V(0, 0, 0.0075), tray_m, 0.004); root = empty(f"tray{t}_root"); tr.parent = root
        for i in range(12):
            c = cookie(f"ck{t}_{i}", DOUGH, CHIP, rnd); c.parent = root; c.location = V(-0.17 + (i % 4) * 0.113, -0.1 + (i // 4) * 0.1, 0.022)
        prop(f"tray{t}", root)
    PROPS["tray0"][0].location = V(-1.25, RY - 0.32, 0.902); PROPS["tray1"][0].location = V(-0.65, RY - 0.4, 0.902); PROPS["tray2"][0].location = V(1.15, -0.5, 0.8)
    for k in ("tray0", "tray1", "tray2"): PROPS[k] = (PROPS[k][0], "pop", PROPS[k][0].location.copy(), PROPS[k][0].scale.copy())
    bowl = gltf("wooden_bowl_01", V(-1.85, RY - 0.36, 0.9), 0, 1.2); prop("bowl", bowl)
    spoon = gltf("wooden_spoon", V(-1.7, RY - 0.42, 0.91), 0.6, 1.0); prop("spoon", spoon)
    flour = block("flour", (0.16, 0.1, 0.26), V(-2.2, RY - 0.25, 1.03), flat("flourbag", "#efe6d6", 0.9), 0.02); prop("flour", flour)
    for i in range(16):
        b = product_box(f"box{i}", "Sweet & Co.", "cookie", (0.26, 0.26, 0.1)); prop(f"box{i}", b)
    BRAND = "Sweet & Co."
else:
    BRAND = "NOVA"
    # clothing rail with hanging tees and hoodies
    rail_m = M["black"]
    rail = empty("rail_root"); parts = []
    for x in (-0.65, 0.65): parts.append(cyl("railPost", 0.014, 1.6, V(x, 0, 0.8), rail_m, 16))
    bar = cyl("railBar", 0.012, 1.34, V(0, 0, 1.6), rail_m, 16); bar.rotation_euler = (0, math.pi / 2, 0); parts.append(bar)
    for x in (-0.65, 0.65):
        f = block("railFoot", (0.04, 0.5, 0.03), V(x, 0, 0.015), rail_m, 0.006); parts.append(f)
    parent(parts, rail)
    jersey = {c: pbr("jersey" + c, "cotton_jersey", scale=6, tint=c, normal=0.8) for c in ("#18181c", "#f1eee9", "#2b3a55", "#6c6b70")}
    cols = ["#18181c", "#f1eee9", "#18181c", "#2b3a55", "#f1eee9", "#18181c", "#6c6b70", "#f1eee9", "#18181c"]
    for i, c in enumerate(cols):
        bm = bmesh.new()
        pts = [(-0.12, 0.16), (-0.25, 0.09), (-0.21, 0.0), (-0.14, 0.04), (-0.14, -0.28), (0.14, -0.28), (0.14, 0.04), (0.21, 0.0), (0.25, 0.09), (0.12, 0.16), (0.0, 0.12)]
        vs = [bm.verts.new((x, 0, z)) for x, z in pts]; f = bm.faces.new(vs)
        me = bpy.data.meshes.new("tee"); bm.to_mesh(me); bm.free()
        t = link(bpy.data.objects.new(f"tee{i}", me)); me.materials.append(jersey[c])
        s = t.modifiers.new("s", "SOLIDIFY"); s.thickness = 0.025; s.offset = 0
        sub = t.modifiers.new("sub", "SUBSURF"); sub.levels = 2; sub.render_levels = 2
        t.location = V(-0.56 + i * 0.14, 0, 1.3); t.rotation_euler = (0, 0, math.pi / 2 + (0.08 if i % 2 else -0.06)); t.parent = rail
        hg = cyl("hanger", 0.004, 0.06, V(-0.56 + i * 0.14, 0, 1.56), M["steel"], 8); hg.parent = rail
    rail.location = V(0.0, RY - 0.5, 0); prop("rail", rail, "slide")
    # heat press on the work table
    hp = empty("press_root")
    parent([block("hpBase", (0.42, 0.5, 0.06), V(0, 0, 0.03), M["black"], 0.01), block("hpPlaten", (0.4, 0.46, 0.05), V(0, 0.02, 0.13), M["steel"], 0.01),
            block("hpArm", (0.05, 0.05, 0.22), V(0, -0.26, 0.15), M["black"], 0.01), block("hpHandle", (0.3, 0.03, 0.03), V(0, -0.3, 0.27), M["black"], 0.01)], hp)
    hp.location = V(1.15, -0.55, 0.8); prop("press", hp)
    for i in range(12):
        c = "#18181c" if i % 3 else "#f1eee9"
        f = block(f"fold{i}", (0.3, 0.24, 0.035), V(0, 0, 0.0175), jersey[c], 0.012); r = empty(f"fold{i}_root"); f.parent = r; prop(f"fold{i}", r)
    for i in range(16):
        b = product_box(f"box{i}", "NOVA", "tee" if i % 2 else "cookie", (0.3, 0.24, 0.05) if i % 2 else (0.3, 0.3, 0.12)); prop(f"box{i}", b)
# a phone the figure holds
phone = empty("phone_root")
parent([block("phoneBody", (0.075, 0.009, 0.155), V(0, 0, 0), M["black"], 0.008), block("phoneScreen", (0.068, 0.002, 0.145), V(0, -0.005, 0), emission("phoneScr", "#cfd8ff", 2.5), 0)], phone)
prop("phone", phone, "hand")

def stack_spot(i, kind):
    if kind == "fold": return V(1.1 + (i % 2) * 0.33, -0.65, 0.8 + (i // 2) * 0.036)
    if i < 4: return V(1.6 + (i % 2) * 0.3, -0.6, 0.8 + (i // 2) * 0.105)
    j = i - 4; return V(2.4 + (j % 3) * 0.32, -1.25 - (j // 9) * 0.34, ((j // 3) % 3) * 0.105)
for k, (ob, kind, loc, sc) in list(PROPS.items()):
    if k.startswith("box"): i = int(k[3:]); PROPS[k] = (ob, "pop", stack_spot(i, "box"), sc)
    if k.startswith("fold"): i = int(k[4:]); PROPS[k] = (ob, "pop", stack_spot(i, "fold"), sc)

# ------------------------------------------------------------------ holograms (glass UI panels drawn with PIL, rendered as emissive cards)
def panel_png(key, t, path):
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
    sizes = {"thought": (720, 600), "search": (900, 720), "packages": (1800, 820), "brand": (1000, 680), "store": (1600, 1000), "orders": (900, 900), "sales": (1100, 700)}
    w, h = sizes[key]; im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    F = lambda s: ImageFont.truetype(FONT, s)
    def glass(x0, y0, x1, y1, hue=(150, 130, 255), a=70):
        d.rounded_rectangle((x0, y0, x1, y1), radius=36, fill=(hue[0] // 3, hue[1] // 3, hue[2] // 2, a), outline=hue + (235,), width=6)
    if key == "thought":
        d.ellipse((60, 40, w - 60, h - 160), outline=(255, 175, 220, 235), width=10)
        d.ellipse((150, h - 150, 210, h - 90), outline=(255, 175, 220, 235), width=8); d.ellipse((90, h - 80, 120, h - 50), outline=(255, 175, 220, 235), width=6)
        cx, cy, R = w // 2, (h - 120) // 2, int(120 + 20 * t)
        if STORY == "cookie":
            d.ellipse((cx - R, cy - R, cx + R, cy + R), fill=(214, 156, 92, 255)); rr = random.Random(2)
            for _ in range(10):
                a, r_ = rr.random() * 6.28, rr.random() * R * 0.7; x, y = cx + math.cos(a) * r_, cy + math.sin(a) * r_
                d.ellipse((x - 14, y - 10, x + 14, y + 10), fill=(60, 34, 18, 255))
        else:
            s = R * 1.6; pts = [(-0.3, -0.5), (-0.6, -0.3), (-0.5, -0.05), (-0.36, -0.12), (-0.36, 0.5), (0.36, 0.5), (0.36, -0.12), (0.5, -0.05), (0.6, -0.3), (0.3, -0.5), (0, -0.36)]
            d.polygon([(cx + x * s, cy + y * s) for x, y in pts], fill=(240, 236, 245, 255)); d.text((cx, cy + 10), "NOVA", font=F(48), fill=(20, 20, 26, 255), anchor="mm")
    elif key == "search":
        glass(10, 10, w - 10, h - 10, (130, 150, 255))
        d.rounded_rectangle((50, 50, w - 50, 160), radius=28, fill=(255, 255, 255, 40))
        q = "CHARGIX"[: max(0, min(7, round(t * 1.6 * 7)))]
        d.text((90, 105), "⌕", font=F(56), fill=(255, 255, 255, 255), anchor="lm"); d.text((170, 105), q, font=F(64), fill=(255, 255, 255, 255), anchor="lm")
        for i, s in enumerate(["Website design", "Online store", "3D website"]):
            k = clamp((t - 0.55 - i * 0.12) * 5)
            if k <= 0: continue
            y = 200 + i * 160; d.rounded_rectangle((50, y, w - 50, y + 130), radius=24, fill=(255, 255, 255, int(28 * k)))
            d.text((90, y + 65), s, font=F(52), fill=(235, 238, 255, int(255 * k)), anchor="lm")
    elif key == "packages":
        P = [("$750", "Essential Website", (110, 225, 205), "Professional site · no immersive 3D"), ("$1,650", "3D Experience", (140, 150, 255), "Premium interactive 3D"),
             ("$2,750", "Business Launch", (230, 110, 220), "Premium 3D + business launch")]
        for i, (price, name, hue, note) in enumerate(P):
            on = smooth(0.45, 0.8, t) if i == 2 else 0.0
            x = 20 + i * 600; y = 40 - int(on * 30)
            d.rounded_rectangle((x, y, x + 560, y + 740), radius=44, fill=(hue[0] // 3, hue[1] // 3, hue[2] // 2, int(80 + 70 * on)), outline=hue + (255,), width=int(7 + 6 * on))
            d.text((x + 280, y + 200), price, font=F(130), fill=(255, 255, 255, 255), anchor="mm")
            d.text((x + 280, y + 310), name, font=F(54), fill=(240, 238, 255, 255), anchor="mm")
            for k in range(4): d.rounded_rectangle((x + 100, y + 400 + k * 56, x + 460 - k * 40, y + 414 + k * 56), radius=7, fill=(255, 255, 255, 60))
            d.text((x + 280, y + 680), note, font=F(32), fill=(255, 255, 255, 220), anchor="mm")
            if on > 0.5: d.text((x + 280, y + 625), "Selected", font=F(44), fill=(255, 255, 255, 255), anchor="mm")
    elif key == "brand":
        glass(10, 10, w - 10, h - 10, (255, 190, 130) if STORY == "cookie" else (190, 190, 255))
        d.text((w / 2, 160), BRAND, font=F(120 if STORY == "cookie" else 170), fill=(255, 246, 232, 255), anchor="mm")
        d.text((w / 2, h - 80), "logo · labels · packaging" if STORY == "cookie" else "logo · tags · mailers", font=F(40), fill=(255, 240, 225, 210), anchor="mm")
        k = smooth(0.15, 0.6, t)
        if STORY == "cookie":
            cx, cy, R = w / 2, 380, 120; d.ellipse((cx - R, cy - R, cx + R, cy + R), fill=(214, 156, 92, int(255 * k)))
        else:
            d.rounded_rectangle((w / 2 - 150, 290, w / 2 + 150, 480), radius=20, outline=(255, 255, 255, int(255 * k)), width=6); d.text((w / 2, 385), "N", font=F(130), fill=(255, 255, 255, int(255 * k)), anchor="mm")
    elif key == "store":
        d.rounded_rectangle((10, 10, w - 10, h - 10), radius=40, fill=(248, 244, 238, 250), outline=(175, 155, 255, 255), width=10)
        d.rectangle((20, 20, w - 20, 100), fill=(234, 228, 220, 255))
        for i, c in enumerate([(230, 100, 100), (235, 185, 70), (90, 195, 110)]): d.ellipse((50 + i * 44, 45, 80 + i * 44, 75), fill=c + (255,))
        ink = (59, 35, 20, 255) if STORY == "cookie" else (18, 18, 24, 255)
        d.text((80, 210), BRAND, font=F(110), fill=ink, anchor="lm")
        d.text((84, 300), "Baked fresh, delivered today." if STORY == "cookie" else "Essentials, made to last.", font=F(44), fill=(105, 90, 80, 255), anchor="lm")
        d.rounded_rectangle((80, 350, 360, 430), radius=40, fill=ink); d.text((220, 390), "Shop now", font=F(38), fill=(255, 255, 255, 255), anchor="mm")
        for i in range(4):
            k = smooth(0.2 + i * 0.1, 0.4 + i * 0.1, t)
            if k <= 0: continue
            x = 80 + i * 370; y = 500
            d.rounded_rectangle((x, y, x + 340, y + 420), radius=24, fill=(255, 255, 255, int(255 * k)))
            if STORY == "cookie": d.ellipse((x + 90, y + 50, x + 250, y + 210), fill=(214, 156, 92, int(255 * k)))
            else: d.rounded_rectangle((x + 100, y + 50, x + 240, y + 230), radius=16, fill=((20, 20, 26) if i % 2 == 0 else (225, 222, 216)) + (int(255 * k),))
            names = ["Classic chip", "Gift box", "Party tray", "Oat & raisin"] if STORY == "cookie" else ["Core tee", "Heavy hoodie", "Core tee", "Cap"]
            prices = ["$4.50", "$18.00", "$32.00", "$12.00"] if STORY == "cookie" else ["$32", "$78", "$32", "$28"]
            d.text((x + 30, y + 300), names[i], font=F(40), fill=(40, 40, 40, int(255 * k)), anchor="lm"); d.text((x + 30, y + 360), prices[i], font=F(40), fill=(40, 40, 40, int(255 * k)), anchor="lm")
    elif key == "orders":
        glass(10, 10, w - 10, h - 10, (150, 160, 255))
        d.text((60, 90), "Demo orders", font=F(64), fill=(255, 255, 255, 255), anchor="lm")
        rows = ["Box of 12 · Classic chip", "Gift box · Mixed", "Box of 6 · Oat", "Party tray · 24", "Box of 12 · Classic chip"] if STORY == "cookie" else \
               ["Core tee · Black · M", "Heavy hoodie · L", "Core tee · White · S", "Cap · Sand", "Core tee · Black · XL"]
        for i, s in enumerate(rows):
            k = clamp((t - 0.05 - i * 0.16) * 6)
            if k <= 0: continue
            y = 170 + i * 140; d.rounded_rectangle((40, y, w - 40, y + 116), radius=22, fill=(255, 255, 255, int(30 * k)))
            d.text((80, y + 58), f"#10{21 + i}", font=F(40), fill=(215, 220, 255, int(220 * k)), anchor="lm"); d.text((240, y + 58), s, font=F(42), fill=(255, 255, 255, int(255 * k)), anchor="lm")
            d.ellipse((w - 110, y + 42, w - 78, y + 74), fill=(126, 240, 176, int(255 * k)))
    elif key == "sales":
        glass(10, 10, w - 10, h - 10, (165, 135, 255))
        d.text((60, 90), "Sample sales · demo data", font=F(42), fill=(238, 232, 255, 230), anchor="lm")
        v = int(round(lerp(0, 4250 if STORY == "cookie" else 6890, smooth(0, 0.9, t))))
        d.text((60, 200), f"${v:,}", font=F(110), fill=(255, 255, 255, 255), anchor="lm")
        for i in range(16):
            k = smooth(i / 20, i / 20 + 0.3, t); hh = int((60 + i * 22 + math.sin(i * 1.7) * 30) * k)
            d.rounded_rectangle((70 + i * 62, h - 50 - hh, 110 + i * 62, h - 50), radius=8, fill=(175, 150, 255, 240))
    im.save(path); return path

HOLO = {}
def holo(key, size):
    path = panel_png(key, 1.0, os.path.join(TMP, f"holo-{key}.png"))
    m = bpy.data.materials.new("holo-" + key); m.use_nodes = True; nt = m.node_tree; N_, L = nt.nodes, nt.links
    for n in list(N_): N_.remove(n)
    t = N_.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(path); t.name = "IMG"
    e = N_.new("ShaderNodeEmission"); e.inputs["Strength"].default_value = 0.5 if key == "store" else 1.25   # the light browser page would bloom out at the dark panels' level
    tr = N_.new("ShaderNodeBsdfTransparent"); mix = N_.new("ShaderNodeMixShader"); o = N_.new("ShaderNodeOutputMaterial")
    fade = N_.new("ShaderNodeValue"); fade.name = "FADE"; fade.outputs[0].default_value = 1.0
    mul = N_.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.use_clamp = True
    L.new(t.outputs["Color"], e.inputs["Color"]); L.new(t.outputs["Alpha"], mul.inputs[0]); L.new(fade.outputs[0], mul.inputs[1])
    L.new(mul.outputs[0], mix.inputs[0]); L.new(tr.outputs[0], mix.inputs[1]); L.new(e.outputs[0], mix.inputs[2]); L.new(mix.outputs[0], o.inputs[0])
    aspect = t.image.size[1] / t.image.size[0]
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    me = bpy.data.meshes.new("holo"); bm.to_mesh(me); bm.free()
    uv = me.uv_layers.new()
    for li, l in enumerate(me.loops): v = me.vertices[l.vertex_index].co; uv.data[li].uv = (v.x + 0.5, v.y + 0.5)
    ob = link(bpy.data.objects.new("holo-" + key, me)); me.materials.append(m); ob.scale = (size, size * aspect, 1)
    ob.visible_shadow = False; ob.visible_diffuse = True; ob.visible_glossy = True
    HOLO[key] = (ob, m, t, -1.0); return ob
for k, s in (("thought", 0.75), ("search", 0.95), ("packages", 2.5), ("brand", 0.95), ("store", 1.9), ("orders", 1.05), ("sales", 1.3)): holo(k, s)

# ------------------------------------------------------------------ the figure
def figure():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=FIG)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == "ARMATURE")
    holder = empty("figure"); arm.parent = holder
    for o in [o for o in new if o.type == "MESH" and o.name.startswith("Icosphere")]: bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.find_armature() == arm]
    fades = []
    def fabric_mat(name, tex, scale, tint, rough=1.0, sheen=0.4):
        m = pbr(name, tex, scale=scale, tint=tint, rough_mul=rough, normal=0.9); b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Specular IOR Level"].default_value = 0.15
        for l in list(b.inputs["Roughness"].links): m.node_tree.links.remove(l)
        b.inputs["Roughness"].default_value = 0.95
        b.inputs["Sheen Weight"].default_value = sheen * 0.15; b.inputs["Sheen Roughness"].default_value = 0.5; b.inputs["Sheen Tint"].default_value = hexc(tint)
        # garments carry their colour as vertex colour (from character.py); multiply it in
        return m
    for o in meshes:
        n = o.name
        if n == "skin":
            m, nt, b = principled("skin"); a = nt.nodes.new("ShaderNodeVertexColor"); a.layer_name = "Color"
            nt.links.new(a.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.48
            b.inputs["Subsurface Weight"].default_value = 0.25; b.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.2); b.inputs["Subsurface Scale"].default_value = 0.008
            nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 900; bp = nt.nodes.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.05
            nt.links.new(nz.outputs["Fac"], bp.inputs["Height"]); nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
        elif n == "top": m = fabric_mat("hoodie", "knitted_fleece", 9, "#3a4560", 1.0, 0.5)
        elif n == "trousers": m = fabric_mat("trousers", "rough_linen", 7, "#2a2a30", 1.0, 0.3)
        elif n == "shoes": m = pbr("shoes", "leather_white", scale=12, tint="#f1efe9", rough_mul=0.9)
        elif n == "hair":
            m, nt, b = principled("hair"); b.inputs["Base Color"].default_value = hexc("#1a120d"); b.inputs["Roughness"].default_value = 0.55
            wv = nt.nodes.new("ShaderNodeTexWave"); wv.inputs["Scale"].default_value = 60; wv.inputs["Distortion"].default_value = 6; wv.wave_type = "BANDS"
            bp = nt.nodes.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.4; nt.links.new(wv.outputs["Fac"], bp.inputs["Height"]); nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
        elif n == "eyes":
            m, nt, b = principled("eyes"); a = nt.nodes.new("ShaderNodeVertexColor"); a.layer_name = "Color"; nt.links.new(a.outputs["Color"], b.inputs["Base Color"])
            b.inputs["Roughness"].default_value = 0.05; b.inputs["Coat Weight"].default_value = 1.0
        else:
            m, nt, b = principled(n); a = nt.nodes.new("ShaderNodeVertexColor"); a.layer_name = "Color"; nt.links.new(a.outputs["Color"], b.inputs["Base Color"])
        # dissolve control for time-lapse moves
        nt = m.node_tree; out = next(x for x in nt.nodes if x.type == "OUTPUT_MATERIAL"); src = out.inputs[0].links[0].from_socket
        tr = nt.nodes.new("ShaderNodeBsdfTransparent"); mix = nt.nodes.new("ShaderNodeMixShader"); fv = nt.nodes.new("ShaderNodeValue"); fv.name = "FADE"; fv.outputs[0].default_value = 1
        nt.links.new(fv.outputs[0], mix.inputs[0]); nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(src, mix.inputs[2]); nt.links.new(mix.outputs[0], out.inputs[0])
        fades.append(fv); o.data.materials.clear(); o.data.materials.append(m)
        for p in o.data.polygons: p.use_smooth = True
    return holder, arm, meshes, fades
FIGH, ARM, FIGMESH, FADES = figure()
SKIN = next(o for o in FIGMESH if o.name == "skin")
PB = ARM.pose.bones
for pb in PB: pb.rotation_mode = "QUATERNION"
bpy.context.view_layer.update()
FEET = min((ARM.matrix_world @ pb.head).z for pb in PB if pb.name.startswith("ball_"))
ARM.location.z = -FEET + 0.012                       # feet on the floor of the holder
bpy.context.view_layer.update()

def upd(): bpy.context.view_layer.update()
def bw(name): return ARM.matrix_world @ PB[name].head          # world head of a posed bone
def aim(name, child, target):
    pb = PB[name]; Ai = ARM.matrix_world.inverted(); t = Ai @ target
    h = pb.head.copy(); c = PB[child].head.copy()
    q = (c - h).normalized().rotation_difference((t - h).normalized())
    pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix; upd()
def rotW(name, axis, ang):
    if abs(ang) < 1e-5: return
    pb = PB[name]; a = (ARM.matrix_world.inverted().to_3x3() @ axis).normalized(); h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(ang, 4, a) @ Matrix.Translation(-h) @ pb.matrix; upd()
def ik2(a, b, c, target, pole):
    la = (PB[b].head - PB[a].head).length; lb = (PB[c].head - PB[b].head).length
    S = bw(a); dv = target - S; d = clamp(dv.length, abs(la - lb) + 1e-3, (la + lb) * 0.999); dr = dv.normalized()
    cA = clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1); sA = math.sqrt(1 - cA * cA)
    pv = pole - S; pv = (pv - dr * pv.dot(dr)).normalized()
    E = S + dr * (la * cA) + pv * (la * sA)
    aim(a, b, E); aim(b, c, S + dr * d)

# pose library — character space, three.js convention (x = figure's left, y up, z forward), metres, feet on floor
STAND = dict(hip=(0, 0, 0), lean=0, twist=0, side=0, lf=(0.11, 0.06, 0.02), rf=(-0.11, 0.06, 0.02), lk=(0.12, 0.5, 1), rk=(-0.12, 0.5, 1),
             lh=(0.24, 0.84, 0.03), rh=(-0.24, 0.84, 0.03), le=(0.6, 1.1, -0.6), re=(-0.6, 1.1, -0.6), look=(0, 1.62, 2), cl=0.35, cr=0.35, face={})
SIT = dict(STAND, hip=(0, -0.45, -0.06), lean=-6, lf=(0.13, 0.06, 0.5), rf=(-0.13, 0.06, 0.48), lk=(0.15, 0.6, 2), rk=(-0.15, 0.6, 2))
def pose(base, **o):
    p = dict(base); f = dict(base.get("face", {})); f.update(o.pop("face", {})); p.update(o); p["face"] = f; return p
POSES = {
    "sitThink": pose(SIT, lean=16, rh=(-0.05, 1.08, 0.3), re=(-0.3, 0.6, 0.6), cr=0.75, lh=(0.18, 0.6, 0.4), le=(0.6, 0.8, 0), look=(0.5, 1.4, 2), face=dict(worry=0.35, lid=0.25, press=0.3)),
    "sitPhone": pose(SIT, lean=14, lh=(0.07, 0.8, 0.36), rh=(-0.03, 0.83, 0.38), le=(0.5, 0.5, 0), re=(-0.5, 0.5, 0), look=(-0.03, 0.85, 0.38), cl=0.6, cr=0.6, face=dict(brow=0.25, lid=0.3, smile=0.2)),
    "standReach": pose(STAND, rh=(-0.3, 1.5, 0.62), re=(-0.8, 1.2, 0), cr=0.15, lh=(0.22, 0.86, 0.06), look=(-0.25, 1.7, 2), face=dict(smile=0.5, brow=0.2)),
    "counter": pose(STAND, lean=16, lh=(0.16, 0.98, 0.44), rh=(-0.14, 1.0, 0.46), le=(0.6, 0.9, -0.3), re=(-0.6, 0.9, -0.3), look=(0, 0.92, 0.9), cl=0.6, cr=0.8, face=dict(focus=0.3, smile=0.3)),
    "deskType": pose(SIT, lean=8, lh=(0.15, 0.82, 0.48), rh=(-0.15, 0.82, 0.48), le=(0.6, 0.5, 0), re=(-0.6, 0.5, 0), look=(0, 1.2, 2), cl=0.4, cr=0.4, face=dict(focus=0.35, press=0.2)),
    "standPresent": pose(STAND, lh=(0.1, 1.05, 0.3), le=(0.6, 0.7, -0.2), cl=0.6, rh=(-0.42, 1.25, 0.32), re=(-0.6, 0.8, -0.3), cr=0.1, look=(-0.7, 1.65, 2), face=dict(smile=0.75, brow=0.25)),
    "pack": pose(STAND, lean=22, lh=(0.2, 0.92, 0.44), rh=(-0.2, 0.92, 0.44), le=(0.7, 0.9, -0.2), re=(-0.7, 0.9, -0.2), look=(0, 0.8, 0.8), cl=0.5, cr=0.5, face=dict(smile=0.35, focus=0.1)),
    "sitRelax": pose(SIT, lean=-20, hip=(0, -0.45, 0.02), lh=(0.44, 0.97, -0.22), rh=(-0.44, 0.97, -0.22), le=(0.8, 0.9, -0.2), re=(-0.8, 0.9, -0.2), lf=(0.22, 0.06, 0.64), rf=(-0.12, 0.06, 0.6), look=(0.3, 1.6, 2), face=dict(smile=0.8, lid=0.3)),
    "window": pose(STAND, lh=(0.2, 0.96, 0.08), rh=(-0.2, 0.96, 0.08), le=(0.6, 0.9, -0.4), re=(-0.6, 0.9, -0.4), look=(0, 1.9, 2), cl=0.8, cr=0.8, face=dict(smile=0.35, brow=0.15, lid=0.15)),
}
def mixpose(a, b, t):
    o = {}
    for k, x in a.items():
        if k == "face": continue
        y = b.get(k, x)
        o[k] = tuple(lerp(u, v, t) for u, v in zip(x, y)) if isinstance(x, tuple) else lerp(x, y, t) if isinstance(x, (int, float)) else x
    fk = set(a["face"]) | set(b["face"]); o["face"] = {k: lerp(a["face"].get(k, 0), b["face"].get(k, 0), t) for k in fk}
    return o

def T(v):  # character-space (three.js axes) → world through the holder
    return FIGH.matrix_world @ Vector((v[0], -v[2], v[1]))
def apply_pose(p, clock):
    for pb in PB: pb.matrix_basis = Matrix.Identity(4)
    ARM.location = Vector((p["hip"][0], -p["hip"][2], -FEET + 0.012 + p["hip"][1])); upd()
    mw = FIGH.matrix_world.to_3x3()
    right = (mw @ Vector((1, 0, 0))).normalized(); up = Vector((0, 0, 1)); fwd = (mw @ Vector((0, -1, 0))).normalized()
    breath = math.sin(clock * 1.6) * 0.012
    for s in ("spine_01", "spine_02", "spine_03"):
        rotW(s, right, p["lean"] * DEG / 3 + (breath if s == "spine_03" else 0)); rotW(s, up, p["twist"] * DEG / 3)
    for s, foot, knee in (("l", p["lf"], p["lk"]), ("r", p["rf"], p["rk"])):
        ik2("thigh_" + s, "calf_" + s, "foot_" + s, T(foot), T(knee))
        fp = bw("foot_" + s); tgt = fp + fwd * 0.12; tgt.z = min(bw("ball_" + s).z, fp.z - 0.06); aim("foot_" + s, "ball_" + s, tgt)
    for s, hand, el in (("l", p["lh"], p["le"]), ("r", p["rh"], p["re"])):
        ik2("upperarm_" + s, "lowerarm_" + s, "hand_" + s, T(hand), T(el))
        across = (bw("index_01_" + s) - bw("pinky_01_" + s)).normalized(); sg = 1 if s == "l" else -1; k = p["c" + s]
        for f in ("index", "middle", "ring", "pinky"):
            for j in (1, 2, 3): rotW(f"{f}_0{j}_{s}", across, sg * k * (0.9 if j == 1 else 1.1))
        rotW("thumb_02_" + s, across, sg * k * 0.4)
    hl = FIGH.matrix_world.inverted() @ bw("head"); lk = Vector((p["look"][0], -p["look"][2], p["look"][1])); dl = lk - hl
    yaw = clamp(math.atan2(dl.x, -dl.y), -1.2, 1.2) - p["twist"] * DEG
    pitch = clamp(-math.atan2(dl.z, math.hypot(dl.x, dl.y)), -0.6, 0.9) - p["lean"] * DEG
    for bn, k in (("neck_01", 0.45), ("head", 0.55)): rotW(bn, up, yaw * k); rotW(bn, right, pitch * k)
    F = p["face"]; kb = SKIN.data.shape_keys.key_blocks
    blink = max(0.0, math.sin(clock * 0.9 + 1.3) - 0.985) / 0.015
    def sk(n, v):
        if n in kb: kb[n].value = clamp(v)
    for side in ("left", "right"):
        sk(f"eye-{side}-closure", F.get("lid", 0.1) + blink); sk(f"eyebrows-{side}-inner-up", F.get("worry", 0)); sk(f"eyebrows-{side}-up", F.get("brow", 0)); sk(f"eyebrows-{side}-down", F.get("focus", 0))
    sk("mouth-corner-puller", F.get("smile", 0)); sk("mouth-open", F.get("open", 0)); sk("mouth-depression", F.get("sad", 0)); sk("mouth-compression", F.get("press", 0))

# ------------------------------------------------------------------ story: beats (hour, figure spot (x, y, yaw°), pose, holograms {key: (x, y, z, yaw°)}, props on, phone hand)
def face(dx, dy): return math.degrees(math.atan2(dx, -dy))
SOFA = (-2.66, 0.25, 90); WINDOW = (-3.02, -0.82, -90); COUNTER = (-1.62, 1.42, 180); DESK = (1.75, 1.5, 180); TABLE = (0.65, 0.92, 180 + 180)
PICK = (-0.45, 0.35, face(-0.8, 1.0)); REVEAL = (0.05, -0.95, face(-1.0, 0.6))
TABLE = (1.4, 0.05, 0.0)    # behind the work table, facing the camera side (-y)
if STORY == "cookie":
    BOX_A = [f"box{i}" for i in range(4)]; BOX_B = [f"box{i}" for i in range(11)]; BOX_C = [f"box{i}" for i in range(16)]
    BEATS = [
        dict(h=7.2, at=SOFA, pose="sitThink", holo={"thought": (-2.45, 0.25, 1.95, 90)}, props=[]),
        dict(h=9.0, at=SOFA, pose="sitPhone", holo={"search": (-1.95, 0.95, 1.75, 60)}, props=[], phone="r"),
        dict(h=10.8, at=PICK, pose="standReach", holo={"packages": (-0.55, 0.3, 1.75, 35)}, props=[]),
        dict(h=13.2, at=COUNTER, pose="counter", props=["bowl", "spoon", "flour", "worktable"], oven=0.2),
        dict(h=16.2, at=COUNTER, pose="counter", props=["worktable", "tray0", "tray1", "spoon"], oven=1.0),
        dict(h=18.6, at=DESK, pose="deskType", holo={"brand": (1.75, 1.4, 1.95, 0)}, props=["worktable", "tray1", "tray2"] + BOX_A, screen="brand"),
        dict(h=19.8, at=REVEAL, pose="standPresent", holo={"store": (0.2, 0.9, 1.65, 25)}, props=["worktable", "tray2"] + BOX_A, phone="l", screen="store"),
        dict(h=21.2, at=TABLE, pose="pack", holo={"orders": (2.5, -0.4, 1.6, 20)}, props=["worktable"] + BOX_B, screen="orders"),
        dict(h=23.0, at=SOFA, pose="sitRelax", holo={"sales": (-1.9, 0.3, 1.85, 75)}, props=["worktable"] + BOX_C),
        dict(h=23.9, at=WINDOW, pose="window", holo={"thought": (-3.0, -0.75, 2.25, 90)}, props=["worktable"] + BOX_C),
    ]
else:
    F_A = [f"fold{i}" for i in range(6)]; F_B = [f"fold{i}" for i in range(12)]
    BOX_A = [f"box{i}" for i in range(4)]; BOX_B = [f"box{i}" for i in range(11)]; BOX_C = [f"box{i}" for i in range(16)]
    BEATS = [
        dict(h=7.2, at=SOFA, pose="sitThink", holo={"thought": (-2.45, 0.25, 1.95, 90)}, props=[]),
        dict(h=9.0, at=SOFA, pose="sitPhone", holo={"search": (-1.95, 0.95, 1.75, 60)}, props=[], phone="r"),
        dict(h=10.8, at=PICK, pose="standReach", holo={"packages": (-0.55, 0.3, 1.75, 35)}, props=[]),
        dict(h=13.2, at=TABLE, pose="pack", props=["worktable", "press", "rail"]),
        dict(h=16.2, at=TABLE, pose="pack", props=["worktable", "press", "rail"] + F_A),
        dict(h=18.6, at=DESK, pose="deskType", holo={"brand": (1.75, 1.4, 1.95, 0)}, props=["worktable", "press", "rail"] + F_A, screen="brand"),
        dict(h=19.8, at=REVEAL, pose="standPresent", holo={"store": (0.2, 0.9, 1.65, 25)}, props=["worktable", "rail"] + F_B + BOX_A, phone="l", screen="store"),
        dict(h=21.2, at=TABLE, pose="pack", holo={"orders": (2.5, -0.4, 1.6, 20)}, props=["worktable", "rail"] + F_A + BOX_B, screen="orders"),
        dict(h=23.0, at=SOFA, pose="sitRelax", holo={"sales": (-1.9, 0.3, 1.85, 75)}, props=["worktable", "rail"] + BOX_C),
        dict(h=23.9, at=WINDOW, pose="window", holo={"thought": (-3.0, -0.75, 2.25, 90)}, props=["worktable", "rail"] + BOX_C),
    ]

for o in bpy.data.objects:
    if o.name.startswith("Icosphere") and o.parent is None: print("helper mesh", o.name, [m.name for m in o.data.materials])

# ------------------------------------------------------------------ light: sun + sky + city behind the glass + practical lamps
world = bpy.data.worlds.new("world"); scene.world = world; world.use_nodes = True
world.cycles.sampling_method = "NONE"   # no world light sampling: the light-path tricks below (dark studio for glossy rays) only hold for BSDF-sampled rays
wn = world.node_tree.nodes; wl = world.node_tree.links
for n in list(wn): wn.remove(n)
wo = wn.new("ShaderNodeOutputWorld")
sky = wn.new("ShaderNodeTexSky"); sky.sky_type = "NISHITA" if hasattr(sky, "sky_type") and "NISHITA" in [i.identifier for i in sky.bl_rna.properties["sky_type"].enum_items] else sky.sky_type
skyB = wn.new("ShaderNodeBackground"); skyB.inputs["Strength"].default_value = 0.25; wl.new(sky.outputs["Color"], skyB.inputs["Color"])
city = {}
tcw = wn.new("ShaderNodeTexCoord"); mpw = wn.new("ShaderNodeMapping")
sep = wn.new("ShaderNodeSeparateXYZ"); wl.new(tcw.outputs["Generated"], sep.inputs[0])
zq = wn.new("ShaderNodeMath"); zq.operation = "MULTIPLY_ADD"; zq.inputs[1].default_value = 0.3; zq.inputs[2].default_value = 0.2; wl.new(sep.outputs[2], zq.inputs[0])
cmb = wn.new("ShaderNodeCombineXYZ"); wl.new(sep.outputs[0], cmb.inputs[0]); wl.new(sep.outputs[1], cmb.inputs[1]); wl.new(zq.outputs[0], cmb.inputs[2])
wl.new(cmb.outputs[0], mpw.inputs["Vector"])
for k, f in (("day", "shanghai_riverside.hdr"), ("night", "shanghai_bund.hdr")):
    e = wn.new("ShaderNodeTexEnvironment"); e.image = bpy.data.images.load(os.path.join(PH, "hdri", f)); wl.new(mpw.outputs["Vector"], e.inputs["Vector"]); city[k] = e
mixC = wn.new("ShaderNodeMix"); mixC.data_type = "RGBA"; wl.new(city["day"].outputs["Color"], mixC.inputs[6]); wl.new(city["night"].outputs["Color"], mixC.inputs[7])
gradeC = wn.new("ShaderNodeMix"); gradeC.data_type = "RGBA"; gradeC.blend_type = "MULTIPLY"; gradeC.inputs["Factor"].default_value = 1.0
wl.new(mixC.outputs[2], gradeC.inputs[6])
cityB = wn.new("ShaderNodeBackground"); wl.new(gradeC.outputs[2], cityB.inputs["Color"])
lp = wn.new("ShaderNodeLightPath")
bg = wn.new("ShaderNodeBackground"); bg.inputs["Color"].default_value = hexc("#06060a"); bg.inputs["Strength"].default_value = 1.0
# camera rays straight to the world see the dark studio; anything through the glass (transmission) sees the city; other bounces get sky light + a little city
viewMix = wn.new("ShaderNodeMixShader"); wl.new(lp.outputs["Is Camera Ray"], viewMix.inputs[0]);
throughMix = wn.new("ShaderNodeMixShader"); wl.new(lp.outputs["Is Transmission Ray"], throughMix.inputs[0])
glossMix = wn.new("ShaderNodeMixShader"); wl.new(lp.outputs["Is Glossy Ray"], glossMix.inputs[0])
lightMix = wn.new("ShaderNodeAddShader"); wl.new(skyB.outputs[0], lightMix.inputs[0])
cityL = wn.new("ShaderNodeBackground"); wl.new(gradeC.outputs[2], cityL.inputs["Color"]); cityL.inputs["Strength"].default_value = 0.35; wl.new(cityL.outputs[0], lightMix.inputs[1])
wl.new(lightMix.outputs[0], glossMix.inputs[1]); wl.new(bg.outputs[0], glossMix.inputs[2])
wl.new(glossMix.outputs[0], throughMix.inputs[1]); wl.new(cityB.outputs[0], throughMix.inputs[2])
wl.new(throughMix.outputs[0], viewMix.inputs[1]); wl.new(bg.outputs[0], viewMix.inputs[2])
wl.new(viewMix.outputs[0], wo.inputs["Surface"])
mpw.inputs["Rotation"].default_value = (0, 0, 205 * DEG)

sunL = bpy.data.lights.new("sun", "SUN"); sunL.angle = 1.2 * DEG; sun = link(bpy.data.objects.new("sun", sunL))
def area(name, loc, size, energy, color, rot=(0, 0, 0), shape="RECTANGLE", sy=None, spread=180):
    L = bpy.data.lights.new(name, "AREA"); L.shape = shape; L.size = size; L.size_y = sy or size; L.energy = energy; L.color = color
    try: L.spread = spread * DEG
    except Exception: pass
    o = link(bpy.data.objects.new(name, L)); o.location = loc; o.rotation_euler = rot; o.visible_camera = False; return o
def point(name, loc, energy, color, r=0.05):
    L = bpy.data.lights.new(name, "POINT"); L.energy = energy; L.color = color; L.shadow_soft_size = r
    o = link(bpy.data.objects.new(name, L)); o.location = loc; return o
WARM = (1.0, 0.72, 0.45)
LAMP = point("floorLamp", V(lampX, lampY, 1.52), 0, WARM, 0.12)
KLED_L = area("kitchenLED", V(KX[0] + KX[2] * 1.6, RY - 0.3, 1.59), 1.4, 0, (1.0, 0.78, 0.55), (0, 0, 0), sy=0.06)
DESK_L = area("deskLamp", V(dl[0] + 0.05, dl[1] - 0.18, 1.12), 0.08, 0, (1.0, 0.8, 0.55), (0.6, 0, 0))
SHELF_L = area("shelfGlow", V(3.05, RY - 0.4, 1.7), 0.35, 0, (1.0, 0.8, 0.6), (math.pi / 2 - 0.3, 0, 0), sy=1.0)
FILL = area("fill", V(6, -7, 7), 6, 0, (0.9, 0.93, 1.0), (55 * DEG, 0, 40 * DEG))
HOLO_L = point("holoSpill", V(0, 0, 2.0), 0, (0.7, 0.6, 1.0), 0.6)
PL_NEON = area("neonSpill", V(1.5, -FY - 0.5, -0.31), 6, 0, (0.62, 0.38, 1.0), (math.pi, 0, 0), sy=0.4)
GROUND_EX = bpy.data.collections.new("groundExclude"); GROUND_EX.objects.link(bpy.data.objects["ground"])
# studio lights must not show up as highlights in the glossy floor and ground
for o in (FILL, HOLO_L, PL_NEON): o.visible_glossy = False
# lamp shade glow (emissive inner surface)
shade_em = emission("shadeIn", "#ffcf96", 0.0)
inner = cyl("shadeInner", 0.19, 0.28, V(lampX, lampY, 1.55), shade_em, 48, r2=0.165); inner.visible_shadow = False


# ------------------------------------------------------------------ the view out of the window: a city plate behind the glass
# Poly Haven's city HDRIs are street-level, so looking "down" through a high window would show pavement. Instead the
# skyline band is cut out of each HDRI and set on an emissive plate that exactly fills the window as seen from the camera:
# distant towers in the lower part, sky above. Day = Shanghai riverside towers, dusk = the same graded to sunset with a
# sun glow, night = the lit Pudong skyline from shanghai_bund.
def city_plates(pw=640, ph=520):
    import numpy as np
    def load(f):
        im = bpy.data.images.load(os.path.join(PH, "hdri", f + ".hdr")); w, h = im.size
        a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3]; bpy.data.images.remove(im); return a, w, h
    def plate(a, w, h, x0, x1, y0, y1, sky_top):
        X0, X1, Y0, Y1 = int(x0 * w), int(x1 * w), int(y0 * h), int(y1 * h)
        band = a[Y0:Y1, X0:X1]; bh = int(pw * band.shape[0] / band.shape[1])
        ys = np.linspace(0, band.shape[0] - 1, bh).astype(int); xs = np.linspace(0, band.shape[1] - 1, pw).astype(int)
        band = band[ys][:, xs]
        out = np.zeros((ph, pw, 3), np.float32); base = int(ph * 0.82); top = base - bh
        out[top:base] = band
        out[base:] = band[-3:].mean(axis=0) * 0.8
        edge = band[:4].mean(axis=(0, 1))
        for r in range(top):
            t = 1 - r / max(1, top)                                # 1 at the top
            out[r] = edge * (1 - t) + np.array(sky_top) * t
        return out
    d, w, h = load("shanghai_riverside"); n, w2, h2 = load("shanghai_bund")
    day = plate(d, w, h, 60 / 2048, 600 / 2048, 380 / 1024, 506 / 1024, (0.32, 0.46, 0.78))
    night = plate(n, w2, h2, 1080 / 2048, 1480 / 2048, 380 / 1024, 500 / 1024, (0.02, 0.018, 0.06))
    # dusk: warm grade, deeper sky, a low sun glow over the towers
    yy, xx = np.mgrid[0:ph, 0:pw]; lum = day.mean(axis=2, keepdims=True)
    sunx, suny = pw * 0.62, ph * 0.5
    glow = np.exp(-(((xx - sunx) / (pw * 0.16)) ** 2 + ((yy - suny) / (ph * 0.13)) ** 2))[..., None]
    core = np.exp(-(((xx - sunx) ** 2 + (yy - suny) ** 2) / (pw * 0.02) ** 2))[..., None]
    vert = (yy / ph)[..., None]
    sky = np.array([0.35, 0.16, 0.22]) * (1 - vert) + np.array([1.4, 0.62, 0.3]) * vert
    dusk = lum * 0.55 * np.array([1.0, 0.7, 0.55]) * 0.6 + 0.0
    top = int(ph * 0.82 - pw * (126 / 540)); skym = (yy < top + pw * (126 / 540) * 0.35)[..., None]
    dusk = np.where(skym, sky * 0.9, dusk) + glow * np.array([1.6, 0.8, 0.35]) * 1.4 + core * np.array([6, 4.5, 2.5])
    paths = {}
    for k, a in (("day", day), ("dusk", dusk), ("night", night)):
        im = bpy.data.images.new("city-" + k, pw, ph, float_buffer=True)
        px = np.concatenate([a[::-1], np.ones((ph, pw, 1))], axis=2).astype(np.float32)
        im.pixels.foreach_set(px.ravel()); im.pack(); paths[k] = im
    return paths

def city_plate():
    imgs = city_plates()
    cam_pos = CAM_TGT + CAM_DIR * CAM_DIST; view = -CAM_DIR
    wy0, wy1, wz0, wz1 = -1.05, 1.45, 0.62, 2.38; wx = -RX - WT
    centre = V(wx, (wy0 + wy1) / 2, (wz0 + wz1) / 2) + view * 2.2
    nrm = CAM_DIR.copy(); right = Vector((0, 0, 1)).cross(nrm).normalized(); up = nrm.cross(right).normalized()
    us, vs = [], []
    for y in (wy0, wy1):
        for z in (wz0, wz1):
            q = V(-RX, y, z); d = (q - cam_pos).normalized(); t = (centre - cam_pos).dot(nrm) / d.dot(nrm); hit = cam_pos + d * t
            us.append((hit - centre).dot(right)); vs.append((hit - centre).dot(up))
    u0, u1, v0, v1 = min(us) - 0.35, max(us) + 0.35, min(vs) - 0.3, max(vs) + 0.3
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new()
    vv = [bm.verts.new(centre + right * u + up * v) for (u, v) in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]
    f = bm.faces.new(vv)
    for lp, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): lp[uvl].uv = uv
    me = bpy.data.meshes.new("cityPlate"); bm.to_mesh(me); bm.free(); ob = link(bpy.data.objects.new("cityPlate", me))
    m = bpy.data.materials.new("cityPlate"); m.use_nodes = True; nt = m.node_tree; N_, L = nt.nodes, nt.links
    for x in list(N_): N_.remove(x)
    o = N_.new("ShaderNodeOutputMaterial"); e = N_.new("ShaderNodeEmission"); L.new(e.outputs[0], o.inputs[0])
    tex = {}
    for k, im in imgs.items():
        t = N_.new("ShaderNodeTexImage"); t.image = im; t.extension = "EXTEND"; tex[k] = t
    m1 = N_.new("ShaderNodeMix"); m1.data_type = "RGBA"; L.new(tex["day"].outputs[0], m1.inputs[6]); L.new(tex["dusk"].outputs[0], m1.inputs[7])
    m2 = N_.new("ShaderNodeMix"); m2.data_type = "RGBA"; L.new(m1.outputs[2], m2.inputs[6]); L.new(tex["night"].outputs[0], m2.inputs[7])
    L.new(m2.outputs[2], e.inputs["Color"]); me.materials.append(m)
    ob.visible_camera = False; ob.visible_shadow = False; ob.visible_diffuse = False; ob.visible_glossy = False   # seen only through the glass
    return ob, m1, m2, e

def sun_state(h):
    day = smooth(6.2, 8.2, h) * (1 - smooth(18.6, 20.0, h)); dusk = smooth(16.8, 18.8, h) * (1 - smooth(19.8, 20.8, h)) + (1 - smooth(6.0, 8.3, h)) * 0.7
    night = smooth(19.6, 21.0, h); u = clamp((h - 6) / 14)
    elev = math.sin(u * math.pi) * 48 * DEG + 3 * DEG; az = lerp(-60, 60, u) * DEG
    return day, dusk, night, elev, az, u

# ------------------------------------------------------------------ camera: the reference's elevated three-quarter view
cam_d = bpy.data.cameras.new("cam"); cam = link(bpy.data.objects.new("cam", cam_d)); scene.camera = cam
cam_d.sensor_fit = "VERTICAL"; cam_d.angle_y = 24 * DEG; cam_d.clip_start = 1; cam_d.clip_end = 80
CAM_TGT = V(0.1, 0.12, 0.62); CAM_DIR = V(1.0, -1.08, 0.92).normalized(); CAM_DIST = float(os.environ.get("CX_DIST", "17.6"))
cam_d.dof.use_dof = True; cam_d.dof.aperture_fstop = 4.0
CITY, CITY_M1, CITY_M2, CITY_E = city_plate()
for o in (sun, FILL, LAMP, KLED_L, DESK_L, SHELF_L, HOLO_L, CITY):
    o.light_linking.receiver_collection = GROUND_EX
    for c in GROUND_EX.collection_objects: c.light_linking.link_state = "EXCLUDE"

# ------------------------------------------------------------------ the state at progress p
def set_state(p):
    nB = len(BEATS); f = clamp(p) * (nB - 1); i0 = min(nB - 2, int(f)); fr = f - i0
    tr = smooth(0.55, 1.0, fr); A = BEATS[i0]; B = BEATS[i0 + 1]
    local = smooth(0, 0.55, fr)
    clock = p * 120.0
    h = lerp(A["h"], B["h"], smooth(0.3, 1.0, fr))
    day, dusk, night, elev, az, u = sun_state(h)
    # sun through the window (from -x), warming toward evening
    d = Vector((-math.cos(elev) * math.cos(az), math.cos(elev) * math.sin(az) * 0.9, math.sin(elev)))
    sun.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    warm = clamp(smooth(14.5, 19, h) + (1 - smooth(7, 10, h)))
    sunL.color = (1.0, lerp(0.93, 0.6, warm), lerp(0.85, 0.36, warm)); sunL.energy = (day * 4.2 + dusk * 2.6) * (1 - night)
    try:
        sky.sun_elevation = max(elev, 0.02) if night < 0.5 else -0.05; sky.sun_rotation = math.pi + az
    except Exception: pass
    skyB.inputs["Strength"].default_value = 0.22 * (day + 0.6 * dusk) + 0.01
    mixC.inputs["Factor"].default_value = smooth(18.8, 20.6, h)
    gr = (lerp(1.0, 1.15, dusk), lerp(1.0, 0.82, dusk), lerp(1.0, 0.7, dusk), 1)
    lvl = 0.9 * day + 1.0 * dusk + 0.9 * night
    gradeC.inputs[7].default_value = (gr[0] * lvl, gr[1] * lvl, gr[2] * lvl, 1)
    cityB.inputs["Strength"].default_value = 1.0
    CITY_M1.inputs["Factor"].default_value = clamp(smooth(15.8, 18.4, h) * 1.0)
    CITY_M2.inputs["Factor"].default_value = smooth(19.0, 20.6, h)
    CITY_E.inputs["Strength"].default_value = 1.5 * day + 1.2 * dusk + 1.6 * night + 0.2
    # practical lamps come on through the evening
    on = smooth(17.4, 19.2, h); kon = max(on, smooth(12.6, 13.6, h) * 0.6)
    LAMP.data.energy = on * 110; shade_em.node_tree.nodes["Emission"].inputs["Strength"].default_value = on * 6
    KLED_L.data.energy = kon * 55; KLED.data.materials[0].node_tree.nodes["Emission"].inputs["Strength"].default_value = kon * 12
    DESK_L.data.energy = on * 18; SHELF_L.data.energy = on * 22
    FILL.data.energy = 150 * (0.25 + 0.75 * day) + 25 * night; FILL.data.color = (lerp(0.86, 1.0, day), lerp(0.86, 0.96, day), lerp(1.0, 0.9, day))
    PL_NEON.data.energy = 30 + 50 * night
    oven = lerp(A.get("oven", 0), B.get("oven", 0), tr) * (0.85 + 0.15 * math.sin(clock * 2))
    OVEN_GLOW.data.materials[0].node_tree.nodes["Emission"].inputs["Strength"].default_value = oven * 7
    scene.view_settings.exposure = 0.15 + 0.2 * night + 0.1 * dusk
    # props
    for name, (ob, kind, loc, sc) in PROPS.items():
        if kind == "hand": continue
        a = 1.0 if name in A.get("props", []) else 0.0; b = 1.0 if name in B.get("props", []) else 0.0; v = lerp(a, b, tr)
        ob.hide_render = v < 0.02
        if kind == "slide":
            ob.location = loc + Vector((0, 0, 0)) if v >= 0.999 else loc + Vector((0.0, -0.9 * (1 - v) ** 2, 0)); ob.scale = sc
        else:
            e = smooth(0, 1, v); ob.location = loc + Vector((0, 0, (1 - e) * 0.18)); ob.scale = sc * max(0.001, e)
    # holograms: fade + rise; inner animation follows progress inside the beat
    spill = 0.0
    for key, (ob, m, tnode, last) in HOLO.items():
        ha, hb = A.get("holo", {}).get(key), B.get("holo", {}).get(key)
        a = (1 - tr) * (1 if ha else 0) + tr * (1 if hb else 0); spec = (ha if tr < 0.5 else hb) or ha or hb
        ob.hide_render = a < 0.02 or not spec
        if ob.hide_render: continue
        ob.location = V(spec[0], spec[1], spec[2] + (1 - a) * 0.12 + math.sin(clock * 0.7 + spec[0]) * 0.015)
        ob.rotation_euler = (math.pi / 2, 0, spec[3] * DEG)
        m.node_tree.nodes["FADE"].outputs[0].default_value = a
        t = 1.0 if (hb and not ha) and tr > 0.5 else (local if ha else 0.0)
        if ha and hb: t = 1.0
        q = round(t * 12) / 12
        if abs(q - last) > 1e-3:
            path = panel_png(key, q, os.path.join(TMP, f"holo-{key}-{int(q * 12)}.png"))
            tnode.image = bpy.data.images.load(path, check_existing=True); HOLO[key] = (ob, m, tnode, q)
        if a > spill: HOLO_L.location = V(spec[0], spec[1], spec[2] - 0.3)
        spill = max(spill, a)
    HOLO_L.data.energy = 25 * spill
    # monitor screen
    scr = A.get("screen") if tr < 0.5 else B.get("screen")
    sm = monScreen.data.materials[0]
    if scr:
        key = {"brand": "brand", "store": "store", "orders": "orders"}[scr]
        path = os.path.join(TMP, f"holo-{key}-12.png")
        if not os.path.exists(path): panel_png(key, 1.0, path)
        mat = M.get("scr-" + key) or image_mat("scr-" + key, path, 0.3, emit=2.2); M["scr-" + key] = mat
        monScreen.data.materials[0] = mat
    else: monScreen.data.materials[0] = M["screen"]
    # figure: blend in place, or dissolve out at A and in at B (time-lapse)
    same = A["at"] == B["at"]
    if same: spot, pz, op = A["at"], mixpose(POSES[A["pose"]], POSES[B["pose"]], tr), 1.0
    elif tr < 0.5: spot, pz, op = A["at"], POSES[A["pose"]], 1 - smooth(0, 0.5, tr)
    else: spot, pz, op = B["at"], POSES[B["pose"]], smooth(0.5, 1, tr)
    pz = dict(pz); pz["face"] = dict(pz["face"])
    pn = (A if (same and tr < 0.5) or (not same and tr < 0.5) else B)["pose"]
    if pn == "counter": pz["rh"] = (pz["rh"][0] + math.sin(clock * 5) * 0.04, pz["rh"][1], pz["rh"][2] + math.cos(clock * 5) * 0.04)
    if pn == "pack": pz["lean"] += math.sin(clock * 1.4) * 4; pz["twist"] = math.sin(clock * 0.9) * 10
    pz["look"] = (pz["look"][0] + math.sin(clock * 0.37) * 0.06, pz["look"][1] + math.sin(clock * 0.53) * 0.03, pz["look"][2])
    FIGH.location = V(spot[0], spot[1], 0); FIGH.rotation_euler = (0, 0, spot[2] * DEG); upd()
    apply_pose(pz, clock)
    for fv in FADES: fv.outputs[0].default_value = op
    for o in FIGMESH: o.hide_render = op < 0.02
    # phone in hand
    side = A.get("phone") if tr < 0.5 else B.get("phone")
    ph = PROPS["phone"][0]; ph.hide_render = not side or op < 0.05
    for c in ph.children: c.hide_render = ph.hide_render
    if side:
        hp = bw("hand_" + side); mid = bw("middle_01_" + side); ph.location = hp.lerp(mid, 0.95)
        look = (bw("head") - ph.location).normalized(); ph.rotation_euler = look.to_track_quat("-Y", "Z").to_euler()
    # camera: fixed angle, gentle drift toward where the story is
    fx = lerp(A["at"][0], B["at"][0], tr); fy = lerp(A["at"][1], B["at"][1], tr)
    tgt = CAM_TGT.lerp(V(fx, fy, 0.9), 0.1)
    cam.location = tgt + CAM_DIR * CAM_DIST; cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam_d.dof.focus_distance = (cam.location - V(fx, fy, 0.9)).length
    # hide children of hidden prop roots
    for name, (ob, kind, loc, sc) in PROPS.items():
        for c in ob.children_recursive: c.hide_render = ob.hide_render

# ------------------------------------------------------------------ render settings
r = scene.render; r.engine = "CYCLES"
scene.cycles.device = "CPU"; scene.cycles.samples = SPP; scene.cycles.use_denoising = True
try: scene.cycles.denoiser = "OPENIMAGEDENOISE"
except Exception: pass
scene.cycles.use_adaptive_sampling = True; scene.cycles.adaptive_threshold = 0.02
scene.cycles.max_bounces = 8; scene.cycles.diffuse_bounces = 4; scene.cycles.glossy_bounces = 4; scene.cycles.transmission_bounces = 8; scene.cycles.transparent_max_bounces = 16
scene.cycles.caustics_reflective = False; scene.cycles.caustics_refractive = False; scene.cycles.blur_glossy = 1.0; scene.cycles.sample_clamp_indirect = 6
try: scene.cycles.use_light_tree = True
except Exception: pass
r.resolution_x, r.resolution_y = W, H; r.image_settings.file_format = "PNG"; r.use_persistent_data = True
scene.view_settings.view_transform = "AgX"
try: scene.view_settings.look = "AgX - Medium High Contrast"
except Exception: pass

if FRAMES.startswith("p:"): items = [(f"p{i}", float(x)) for i, x in enumerate(FRAMES[2:].split(","))]
else: items = [(f"{STORY[0]}-{int(x):03d}", int(x) / (N - 1)) for x in FRAMES.split(",") if x != ""]
for name, p in items:
    set_state(p)
    r.filepath = os.path.join(OUT, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", name, round(p, 3), flush=True)
