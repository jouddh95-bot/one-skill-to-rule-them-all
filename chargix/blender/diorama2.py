# CHARGIX · The box story — one open-front room on a plinth, path-traced in Cycles.
#
# One fixed elevated three-quarter camera looks into a single apartment box. Scroll
# progress p∈[0,1] plays one choreographed story: a dream on the sofa, the phone, finding
# CHARGIX and picking a package, the kitchen turning into a bakery and packing table,
# the storefront going live, demo orders packed, night, and morning again. The figure
# walks, reaches, picks up and puts down; props follow her hands; the oven door hinges;
# the tray bakes; the sun crosses and sets and comes back. Everything is a pure function
# of p (no keyframes), so any frame renders alone (sharded CI) and reverse scroll is exact.
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
PREFIX = sys.argv[6] if len(sys.argv) > 6 else "story"
N = int(os.environ.get("CX_N", "480"))
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
M["floor"] = pbr("parquet", "herringbone_parquet", scale=0.8, tint="#e8cbab", rough_mul=1.15, sat=0.85)
M["wallL"] = plaster_wall("wallL", "#cfb7a2"); M["wallB"] = plaster_wall("wallB", "#c9b09a")
M["cap"] = flat("cap", "#ece2d6", 0.65)
M["plinth"] = flat("plinth", "#1c1b22", 0.38)
M["plinthDark"] = flat("plinthDark", "#16151c", 0.5)
M["neon"] = emission("neon", "#ffb977", 2.4)
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
M["rug"] = pbr("rug", "rough_linen", scale=2.4, tint="#9a8a7d", sat=0.0, normal=1.6)
M["trug"] = pbr("trug", "rough_linen", scale=2.6, tint="#c4a585", sat=0.0, normal=1.6)
M["krug"] = pbr("krug", "rough_linen", scale=2.5, tint="#77706a", sat=0.0)
M["curtain"] = pbr("curtain", "rough_linen", scale=2.2, tint="#efe2d4", sat=0.0)
M["oak"] = pbr("oak", "oak_veneer_01", scale=0.9, tint="#c89a74", rough_mul=0.8)
M["screen"] = emission("screenOff", "#0b0c10", 0.0)
M["blackGloss"] = flat("tvBlack", "#08080a", 0.12, 0.2)
M["paper"] = flat("paper", "#f3efe8", 0.85)

# ------------------------------------------------------------------ room shell
def room():
    # plinth: dark slab with a base band and one thin brass line along the two visible edges
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
    glow = block("ovenGlow", (w - 0.12, 0.004, 0.36), V(ox, RY - d + 0.002, 0.38), emission("ovenGlow", "#ff7a2a", 0.0), 0)
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
gltf("ceramic_vase_01", V(-1.15, RY - 0.13, 2.138), 0.6, 0.45)
gltf("pot_enamel_01", V(-0.3, RY - 0.13, 2.138), 2.2, 0.8)
gltf("tea_set_01", V(-1.15, RY - 0.13, 1.738), 0, 0.42)
gltf("wicker_basket_02", V(-2.95, RY - 0.3, 1.965), 0.8, 0.8)   # on top of the fridge

# ------------------------------------------------------------------ living area
sofa = retint(gltf("sofa_02", V(-2.95, 0.25, 0), 90 * DEG, 1.12), 0.55, 1.0, "#b9aea4", 0.85)   # dark leather → warm greige
retint(gltf("throw_pillows_01", V(-2.98, 0.25, 0.38), 90 * DEG, 1.0), 0.18, 0.95)   # quieter, oatmeal
rug = block("rug", (2.0, 2.6, 0.012), V(-1.95, 0.25, 0.006), M["rug"], 0.006)
gltf("modern_coffee_table_01", V(-1.85, 0.25, 0), 0, 1.0)
gltf("ceramic_vase_01", V(-1.85, -0.08, 0.39), 0, 0.4)
book = gltf("book_encyclopedia_set_01", V(-1.95, 0.3, 0.39), 90 * DEG, 0.6)
armchair = gltf("modern_arm_chair_01", V(-0.75, -1.45, 0), 150 * DEG, 0.95)
tvcab = gltf("modern_wooden_cabinet", V(-1.6, -1.64, 0), 180 * DEG, 0.85)
gltf("ceramic_vase_02", V(-2.65, -1.64, 0.58), 0, 0.5)
gltf("Ottoman_01", V(-3.0, 1.7, 0), 0.3, 0.9)
gltf("side_table_01", V(3.1, -0.25, 0), 2.0, 0.9)

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
gltf("ceramic_vase_03", V(2.9, RY - 0.22, 1.56), 0, 0.5)
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
    b = block(name, size, V(0, 0, sz / 2), M["kraft"] , 0.004)
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


# ------------------------------------------------------------------ boxes: a kraft gift box that assembles (walls rise, lid folds shut)
def label_png(path, brand, sub, w=512, h=320):
    from PIL import Image, ImageDraw, ImageFont
    im = Image.new("RGB", (w, h), (244, 234, 217)); d = ImageDraw.Draw(im)
    d.text((w / 2, h / 2 - 16), brand, font=ImageFont.truetype(FONT, 66), fill=(59, 35, 20), anchor="mm")
    d.text((w / 2, h / 2 + 62), sub, font=ImageFont.truetype(FONT, 26), fill=(59, 35, 20), anchor="mm")
    im.save(path); return path
BRAND = "Sweet & Co."
LABEL = image_mat("label", label_png(os.path.join(TMP, "label.png"), BRAND, "baked today"), 0.7)
TAPE = flat("tape", "#d9c9a8", 0.35)
BOXES = []
def gift_box(i, size=(0.26, 0.26, 0.1)):
    sx, sy, sz = size; root = empty(f"gbox{i}")
    base = block(f"gb{i}base", (sx, sy, 0.006), V(0, 0, 0.003), M["kraft"], 0.002); base.parent = root
    walls = empty(f"gb{i}walls"); walls.parent = root
    for k, (wx, wy, ww, wd) in enumerate(((0, sy / 2, sx, 0.006), (0, -sy / 2, sx, 0.006), (sx / 2, 0, 0.006, sy), (-sx / 2, 0, 0.006, sy))):
        wb = block(f"gb{i}w{k}", (ww, wd, sz), V(wx, wy, sz / 2), M["kraft"], 0.002); wb.parent = walls
    hinge = empty(f"gb{i}hinge"); hinge.parent = root; hinge.location = V(0, sy / 2, sz)
    lid = block(f"gb{i}lid", (sx + 0.006, sy + 0.006, 0.006), V(0, -sy / 2, 0.003), M["kraft"], 0.002); lid.parent = hinge
    lab = block(f"gb{i}lab", (sx * 0.62, sy * 0.4, 0.002), V(0, -sy / 2 - 0.02, 0.007), LABEL, 0); lab.parent = hinge
    tape = block(f"gb{i}tape", (sx + 0.008, 0.045, 0.002), V(0, -sy / 2, 0.0065), TAPE, 0); tape.parent = hinge
    # four cookies inside, placed by the figure's scoop
    cks = []
    for c in range(4):
        ck = cookie(f"gb{i}ck{c}", BAKED, CHIP, random.Random(i * 10 + c)); ck.parent = root; ck.location = V((c % 2 - 0.5) * 0.11, (c // 2 - 0.5) * 0.11, 0.013); cks.append(ck)
    BOXES.append(dict(root=root, walls=walls, hinge=hinge, cookies=cks, sz=sz)); return root

# ------------------------------------------------------------------ cookies: one dough material that bakes (pale and domed → golden and spread)
def dough_mat(name, raw):
    m, nt, b = principled(name); N_, L = nt.nodes, nt.links
    tc = N_.new("ShaderNodeTexCoord"); n = N_.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = 40; n.inputs["Detail"].default_value = 6
    L.new(tc.outputs["Object"], n.inputs["Vector"])
    ra = N_.new("ShaderNodeValToRGB"); ra.color_ramp.elements[0].color = hexc("#e2c79b"); ra.color_ramp.elements[1].color = hexc("#f0dcb9")
    rb = N_.new("ShaderNodeValToRGB"); rb.color_ramp.elements[0].color = hexc("#a8652c"); rb.color_ramp.elements[1].color = hexc("#dca463")
    for r in (ra, rb): L.new(n.outputs["Fac"], r.inputs["Fac"])
    bake = N_.new("ShaderNodeValue"); bake.name = "BAKE"; bake.outputs[0].default_value = 0.0 if raw else 1.0
    mx = N_.new("ShaderNodeMix"); mx.data_type = "RGBA"; L.new(bake.outputs[0], mx.inputs[0]); L.new(ra.outputs["Color"], mx.inputs[6]); L.new(rb.outputs["Color"], mx.inputs[7])
    L.new(mx.outputs[2], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.78; b.inputs["Subsurface Weight"].default_value = 0.08
    bp = N_.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.35; L.new(n.outputs["Fac"], bp.inputs["Height"]); L.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m
TRAY_DOUGH = dough_mat("trayDough", True); BAKED = dough_mat("baked", False); CHIP = flat("chip", "#2a160b", 0.35)

# ------------------------------------------------------------------ story props
def bbox(root):
    pts = [o.matrix_world @ Vector(c) for o in root.children_recursive if o.type == "MESH" for c in o.bound_box]
    return V(min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)), V(max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))
upd = lambda: bpy.context.view_layer.update()
upd()
CT = next(o for o in bpy.data.objects if o.name.startswith("modern_coffee_table_01_root"))
ct0, ct1 = bbox(CT); CT_TOP = ct1.z

# the phone: lies on the coffee table, lights up, is picked up, used, put back
phone = empty("phone")
PH_SCR = emission("phoneScr", "#f4efe6", 0.0)
parent([block("phoneBody", (0.075, 0.155, 0.009), V(0, 0, 0.0045), M["black"], 0.008), block("phoneScreen", (0.068, 0.145, 0.002), V(0, 0, 0.0095), PH_SCR, 0)], phone)
PHONE_REST = V(ct0.x + 0.09, 0.12, CT_TOP + 0.001)

# worktable (arrives as the room turns into a bakery)
work = gltf("wooden_table_02", V(1.4, -0.55, 0), 0, 1.0); upd(); wt0, wt1 = bbox(work); WT_TOP = wt1.z
# counter ingredients
bowl = gltf("wooden_bowl_01", V(-1.92, 2.1, 0.9), 0, 1.2)
spoon = gltf("wooden_spoon", V(-1.78, 2.02, 0.91), 0.6, 1.0)
flour = block("flour", (0.16, 0.1, 0.26), V(-2.3, 2.25, 1.03), flat("flourbag", "#efe6d6", 0.9), 0.02)
board = gltf("wooden_cutting_board", V(-1.5, 2.06, 0.902), 0, 1.0)
# the tray: 12 cookies that appear one scoop at a time, go in the oven raw and come out baked
tray = empty("tray"); tray_m = flat("trayMetal", "#a2a6ab", 0.32, 1.0)
block("trayPlate", (0.44, 0.31, 0.012), V(0, 0, 0.006), tray_m, 0.004).parent = tray
for sx_ in (-1, 1): block("trayLip", (0.012, 0.31, 0.02), V(sx_ * 0.22, 0, 0.012), tray_m, 0.003).parent = tray
TRAY_CK = []
rr = random.Random(7)
for i in range(12):
    c = cookie(f"tck{i}", TRAY_DOUGH, CHIP, rr); c.parent = tray; c.location = V(-0.165 + (i % 4) * 0.11, -0.095 + (i // 4) * 0.095, 0.014); TRAY_CK.append(c)
TRAY_COUNTER = V(-1.5, 2.06, 0.935)       # on the cutting board
# flat box blanks on the worktable and the stack where finished boxes go
for i in range(6): gift_box(i)
BOX_TABLE = [V(1.0 + (i % 3) * 0.3, -0.62 + (i // 3) * 0.0, WT_TOP + 0.001) for i in range(6)]
BOX_STACK = [V(2.55 + (i % 2) * 0.3, -1.25, (i // 2) * 0.106) for i in range(6)]
# oven door on a hinge at its bottom edge
door, bar = bpy.data.objects["ovenDoor"], bpy.data.objects["ovenBar"]
OVEN_X = door.location.x; HINGE = empty("ovenHinge", V(OVEN_X, door.location.y, 0.12)); upd()
for o in (door, bar):
    mw = o.matrix_world.copy(); o.parent = HINGE; o.matrix_world = mw
upd()
TRAY_OVEN = V(OVEN_X, RY - 0.62 + 0.12, 0.33)

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


# ------------------------------------------------------------------ UI cards: frosted warm glass, ink type, one brass accent (the site's own design system)
INK = (24, 22, 26); MUTE = (24, 22, 26, 150); BRASS = (184, 143, 88); PAPER = (250, 247, 242)
def card_png(key, t, path):
    from PIL import Image, ImageDraw, ImageFont
    sizes = {"dream": (760, 620), "phone": (640, 1180), "build": (900, 720), "store": (1700, 1060), "orders": (900, 960)}
    w, h = sizes[key]; im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    F = lambda s: ImageFont.truetype(FONT, s)
    def glass(x0, y0, x1, y1, r=40, a=226):
        d.rounded_rectangle((x0, y0, x1, y1), radius=r, fill=PAPER + (a,), outline=(255, 255, 255, 250), width=4)
    def cookie_art(cx, cy, R, alpha=255, seed=2):
        d.ellipse((cx - R, cy - R, cx + R, cy + R), fill=(205, 150, 88, alpha)); rr = random.Random(seed)
        for _ in range(9):
            a, r_ = rr.random() * 6.28, rr.random() * R * 0.68; x, y = cx + math.cos(a) * r_, cy + math.sin(a) * r_
            d.ellipse((x - R * 0.11, y - R * 0.08, x + R * 0.11, y + R * 0.08), fill=(62, 36, 20, alpha))
    def tick(x, y, s, a=255):
        d.ellipse((x - s, y - s, x + s, y + s), fill=BRASS + (a,)); d.line((x - s * 0.45, y, x - s * 0.1, y + s * 0.38, x + s * 0.5, y - s * 0.4), fill=(255, 255, 255, a), width=max(3, int(s / 5)))
    if key == "dream":
        glass(20, 20, w - 20, h - 150, r=160)
        d.ellipse((150, h - 140, 210, h - 80), fill=PAPER + (226,)); d.ellipse((90, h - 70, 124, h - 36), fill=PAPER + (226,))
        cookie_art(w // 2 - 120, (h - 130) // 2, 110 + 8 * t, 255, 2)
        # the box with a ribbon: the business she imagines
        bx, by = w // 2 + 60, (h - 130) // 2 - 70
        d.rounded_rectangle((bx, by, bx + 190, by + 150), radius=10, fill=(214, 182, 140, 255)); d.rectangle((bx + 85, by, bx + 105, by + 150), fill=BRASS + (255,))
        d.text((bx + 95, by + 196), BRAND, font=F(40), fill=INK + (255,), anchor="mm")
    elif key == "phone":
        glass(10, 10, w - 10, h - 10, r=80, a=240)
        d.rounded_rectangle((w // 2 - 70, 34, w // 2 + 70, 52), radius=9, fill=INK + (255,))
        # t runs through the screens: 0 lock · .14 search · .3 CHARGIX · .46 packages · .66 picked · .8 paid · .9 project form sent
        if t < 0.14:
            d.text((w // 2, 300), "7:41", font=F(170), fill=INK + (255,), anchor="mm")
            d.text((w // 2, 420), "Tuesday", font=F(44), fill=MUTE, anchor="mm")
            d.rounded_rectangle((60, 560, w - 60, 700), radius=30, fill=(255, 255, 255, 230))
            d.text((100, 610), "Idea for later", font=F(36), fill=INK + (255,), anchor="lm"); d.text((100, 660), "sell the cookies online?", font=F(32), fill=MUTE, anchor="lm")
            d.text((w // 2, h - 110), "swipe up to unlock", font=F(32), fill=MUTE, anchor="mm")
        elif t < 0.3:
            q = "sell my cookies online"; n = int(len(q) * clamp((t - 0.14) / 0.1))
            d.rounded_rectangle((50, 120, w - 50, 220), radius=50, fill=(255, 255, 255, 255)); d.text((90, 170), q[:n] + ("|" if n < len(q) else ""), font=F(40), fill=INK + (255,), anchor="lm")
            if t > 0.24:
                for i, (a, b) in enumerate((("CHARGIX", "Websites and 3D that turn ideas into businesses"), ("Start selling online", "A guide"), ("Bakery websites", "Examples"))):
                    y = 270 + i * 190; d.rounded_rectangle((50, y, w - 50, y + 160), radius=28, fill=(255, 255, 255, 235), outline=BRASS + (255,) if i == 0 else None, width=4)
                    d.text((90, y + 55), a, font=F(46 if i == 0 else 40), fill=INK + (255,), anchor="lm"); d.text((90, y + 112), b[:32], font=F(28), fill=MUTE, anchor="lm")
        elif t < 0.46:
            d.rectangle((10, 90, w - 10, 560), fill=(13, 12, 15, 255)); d.text((60, 150), "CHARGIX", font=F(40), fill=(242, 236, 226, 255), anchor="lm")
            d.text((60, 300), "Every business", font=F(64), fill=(242, 236, 226, 255), anchor="lm"); d.text((60, 380), "starts in a", font=F(64), fill=(242, 236, 226, 255), anchor="lm")
            d.text((60, 460), "small room.", font=F(64), fill=(214, 176, 124, 255), anchor="lm")
            for i, s in enumerate(("Websites", "3D experiences", "Store launches")):
                y = 620 + i * 120; d.rounded_rectangle((50, y, w - 50, y + 96), radius=20, fill=(255, 255, 255, 220)); d.text((90, y + 48), s, font=F(40), fill=INK + (255,), anchor="lm")
        elif t < 0.8:
            d.text((60, 150), "Packages", font=F(56), fill=INK + (255,), anchor="lm")
            pick = smooth(0.6, 0.66, t)
            for i, (pr, nm, nt3) in enumerate((("$750", "Essential Website", "No 3D"), ("$1,650", "3D Experience", "Premium 3D"), ("$2,750", "Business Launch", "3D + full launch"))):
                y = 230 + i * 250; on = pick if i == 2 else 0
                d.rounded_rectangle((50, y, w - 50, y + 220), radius=30, fill=(255, 255, 255, 240), outline=BRASS + (int(120 + 135 * on),), width=int(3 + 7 * on))
                d.text((90, y + 70), pr, font=F(70), fill=INK + (255,), anchor="lm"); d.text((90, y + 140), nm, font=F(38), fill=INK + (255,), anchor="lm"); d.text((90, y + 186), nt3, font=F(28), fill=MUTE, anchor="lm")
                if on > 0.5: tick(w - 110, y + 70, 34)
            if t > 0.7:
                d.rounded_rectangle((50, h - 190, w - 50, h - 80), radius=55, fill=INK + (255,)); d.text((w // 2, h - 135), "Buy now · $2,750", font=F(42), fill=(242, 236, 226, 255), anchor="mm")
        else:
            tick(w // 2, 330, 90)
            sent = t > 0.9
            d.text((w // 2, 520), "Project form sent" if sent else "Order placed", font=F(54), fill=INK + (255,), anchor="mm")
            d.text((w // 2, 600), "CHARGIX starts building" if sent else "Business Launch", font=F(36), fill=MUTE, anchor="mm")
            d.text((w // 2, h - 120), "Story demo · not a real order", font=F(28), fill=MUTE, anchor="mm")
    elif key == "build":
        glass(10, 10, w - 10, h - 10)
        d.text((60, 90), "Sweet & Co. · launch", font=F(48), fill=INK + (255,), anchor="lm")
        steps = ("Brand and logo", "Store and products", "3D gift box scene", "Socials and pixels", "Spanish pages")
        for i, s in enumerate(steps):
            k = smooth(i / 6, i / 6 + 0.12, t); y = 180 + i * 96
            d.rounded_rectangle((60, y, w - 60, y + 76), radius=18, fill=(255, 255, 255, 200))
            d.text((100, y + 38), s, font=F(36), fill=INK + (255,), anchor="lm")
            if k > 0.05: tick(w - 110, y + 38, 24, int(255 * k))
        d.rounded_rectangle((60, h - 70, w - 60, h - 50), radius=10, fill=(24, 22, 26, 40)); d.rounded_rectangle((60, h - 70, 60 + int((w - 120) * clamp(t)), h - 50), radius=10, fill=BRASS + (255,))
    elif key == "store":
        d.rounded_rectangle((10, 10, w - 10, h - 10), radius=36, fill=(251, 245, 236, 252), outline=(255, 255, 255, 255), width=6)
        d.rectangle((24, 24, w - 24, 92), fill=(240, 232, 220, 255))
        for i in range(3): d.ellipse((50 + i * 40, 46, 74 + i * 40, 70), fill=(205, 190, 172, 255))
        d.rounded_rectangle((220, 40, w - 220, 76), radius=18, fill=(255, 255, 255, 255)); d.text((w // 2, 58), "sweetandco.example", font=F(26), fill=MUTE, anchor="mm")
        coc = (59, 35, 20, 255)
        d.text((80, 160), BRAND, font=F(54), fill=coc, anchor="lm")
        for i, s in enumerate(("Shop", "Gift boxes", "Our kitchen", "ES")): d.text((w - 620 + i * 150, 160), s, font=F(30), fill=(59, 35, 20, 190), anchor="lm")
        k = smooth(0.0, 0.5, t)
        d.text((80, 320), "Baked this morning.", font=F(84), fill=(59, 35, 20, int(255 * k)), anchor="lm"); d.text((80, 410), "At your door tomorrow.", font=F(84), fill=(59, 35, 20, int(255 * k)), anchor="lm")
        d.rounded_rectangle((80, 470, 380, 550), radius=40, fill=(59, 35, 20, int(255 * k))); d.text((230, 510), "Shop the boxes", font=F(32), fill=(251, 245, 236, int(255 * k)), anchor="mm")
        # the hero: the gift box, open, cookies inside
        bx, by = w - 640, 230
        d.rounded_rectangle((bx, by, bx + 520, by + 330), radius=24, fill=(243, 232, 216, int(255 * k)))
        d.rounded_rectangle((bx + 110, by + 70, bx + 410, by + 280), radius=10, fill=(198, 160, 112, int(255 * k)))
        for c in range(4): cookie_art(bx + 185 + (c % 2) * 150, by + 125 + (c // 2) * 100, 44, int(255 * k), c)
        names = (("The Classic Dozen", "$28"), ("Pistachio & Rose Six", "$19"), ("Sea-Salt Shortbread", "$22"), ("The Celebration Box", "$48"))
        for i, (nm, pr) in enumerate(names):
            kk = smooth(0.35 + i * 0.12, 0.55 + i * 0.12, t)
            if kk <= 0: continue
            x = 80 + i * 395; y = 640
            d.rounded_rectangle((x, y, x + 365, y + 340), radius=20, fill=(243, 232, 216, int(255 * kk)))
            cookie_art(x + 182, y + 120, 70, int(255 * kk), i + 5)
            d.text((x + 24, y + 250), nm, font=F(30), fill=(59, 35, 20, int(255 * kk)), anchor="lm"); d.text((x + 24, y + 296), pr, font=F(30), fill=(59, 35, 20, int(200 * kk)), anchor="lm")
        if t > 0.8: d.rounded_rectangle((w - 300, 120, w - 70, 200), radius=40, fill=BRASS + (255,)); d.text((w - 185, 160), "Live", font=F(36), fill=(255, 255, 255, 255), anchor="mm")
    elif key == "orders":
        glass(10, 10, w - 10, h - 10)
        d.text((60, 90), "Demo orders", font=F(56), fill=INK + (255,), anchor="lm"); d.text((60, 150), "sample data for this story", font=F(30), fill=MUTE, anchor="lm")
        rows = ("The Classic Dozen", "Celebration Box", "Pistachio & Rose Six", "The Classic Dozen", "Sea-Salt Shortbread", "Celebration Box")
        for i, s in enumerate(rows):
            k = clamp((t * 6.6 - i) * 2.5); packed = t * 6 > i + 0.85
            if k <= 0: continue
            y = 210 + i * 120; d.rounded_rectangle((40, y, w - 40, y + 100), radius=20, fill=(255, 255, 255, int(220 * k)))
            d.text((80, y + 50), f"#D{101 + i}", font=F(32), fill=(24, 22, 26, int(150 * k)), anchor="lm"); d.text((230, y + 50), s, font=F(36), fill=(24, 22, 26, int(255 * k)), anchor="lm")
            if packed: tick(w - 100, y + 50, 26)
    im.save(path); return path

CARDS = {}
CAM_YAW = math.degrees(math.atan2(1.0, 1.08))   # cards turn to face the camera
def card(key, size, at):
    path = card_png(key, 0.0, os.path.join(TMP, f"card-{key}-0.png"))
    m = bpy.data.materials.new("card-" + key); m.use_nodes = True; nt = m.node_tree; N_, L = nt.nodes, nt.links
    for n in list(N_): N_.remove(n)
    t = N_.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(path); t.name = "IMG"
    e = N_.new("ShaderNodeEmission"); e.inputs["Strength"].default_value = 0.85; e.name = "EM"
    tr = N_.new("ShaderNodeBsdfTransparent"); mix = N_.new("ShaderNodeMixShader"); o = N_.new("ShaderNodeOutputMaterial")
    fade = N_.new("ShaderNodeValue"); fade.name = "FADE"; fade.outputs[0].default_value = 1.0
    mul = N_.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.use_clamp = True
    L.new(t.outputs["Color"], e.inputs["Color"]); L.new(t.outputs["Alpha"], mul.inputs[0]); L.new(fade.outputs[0], mul.inputs[1])
    L.new(mul.outputs[0], mix.inputs[0]); L.new(tr.outputs[0], mix.inputs[1]); L.new(e.outputs[0], mix.inputs[2]); L.new(mix.outputs[0], o.inputs[0])
    aspect = t.image.size[1] / t.image.size[0]
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5); me = bpy.data.meshes.new("card"); bm.to_mesh(me); bm.free()
    uv = me.uv_layers.new()
    for li, l in enumerate(me.loops): v = me.vertices[l.vertex_index].co; uv.data[li].uv = (v.x + 0.5, v.y + 0.5)
    ob = link(bpy.data.objects.new("card-" + key, me)); me.materials.append(m); ob.scale = (size, size * aspect, 1)
    ob.rotation_euler = (math.pi / 2, 0, CAM_YAW * DEG); ob.location = at
    ob.visible_shadow = False; ob.visible_diffuse = False; ob.visible_glossy = False
    CARDS[key] = dict(ob=ob, m=m, img=t, last=-1.0, at=at); return ob
card("dream", 0.85, V(-2.2, 0.8, 1.85))
card("phone", 0.56, V(-1.55, 0.95, 1.4))
card("build", 0.78, V(1.75, 1.55, 1.95))
card("store", 1.85, V(0.15, 0.6, 1.62))
card("orders", 0.72, V(2.55, -0.55, 1.65))

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
FILL = area("fill", V(6, -7, 7), 6, 0, (1.0, 0.92, 0.84), (55 * DEG, 0, 40 * DEG))
HOLO_L = point("cardSpill", V(0, 0, 2.0), 0, (1.0, 0.94, 0.86), 0.6)
PL_NEON = area("plinthSpill", V(1.5, -FY - 0.5, -0.31), 6, 0, (1.0, 0.8, 0.55), (math.pi, 0, 0), sy=0.4)
GROUND_EX = bpy.data.collections.new("groundExclude"); GROUND_EX.objects.link(bpy.data.objects["ground"])
# studio lights must not show up as highlights in the glossy floor and ground
for o in (FILL, HOLO_L, PL_NEON): o.visible_glossy = False
# lamp shade glow (emissive inner surface)
shade_em = emission("shadeIn", "#ffcf96", 0.0)
inner = cyl("shadeInner", 0.19, 0.28, V(lampX, lampY, 1.55), shade_em, 48, r2=0.165); inner.visible_shadow = False

# warm practicals that make the room read as lived-in after dark (and give the work zone its own pool of light)
SCONCE_EM = emission("sconceIn", "#ffc98a", 0.0)
gltf("industrial_wall_lamp", V(0.12, RY - 0.004, 1.62), 0, 1.0)
cyl("sconceBulb", 0.035, 0.05, V(0.12, RY - 0.1, 1.55), SCONCE_EM, 24).visible_shadow = False
SCONCE_L = point("sconce", V(0.12, RY - 0.16, 1.5), 0, WARM, 0.05)
st_top = 0.55 * 0.9
cyl("tlBase", 0.07, 0.24, V(3.1, -0.25, st_top + 0.12), M["ceramic"], 48, r2=0.05, bevel=0.01)
tsh = cyl("tlShade", 0.15, 0.2, V(3.1, -0.25, st_top + 0.36), M["linen"], 64, r2=0.12); tsh.modifiers.new("s", "SOLIDIFY").thickness = 0.004
bm = bmesh.new(); bm.from_mesh(tsh.data)
for f in [f for f in bm.faces if abs(f.normal.z) > 0.9]: bm.faces.remove(f)
bm.to_mesh(tsh.data); bm.free()
TLAMP_EM = emission("tlampIn", "#ffcf96", 0.0)
cyl("tlInner", 0.14, 0.18, V(3.1, -0.25, st_top + 0.36), TLAMP_EM, 48, r2=0.115).visible_shadow = False
TLAMP_L = point("tableLamp", V(3.1, -0.25, st_top + 0.34), 0, WARM, 0.08)
CARTON = flat("carton", "#9c6c42", 0.82)
# a stool at the worktable and a stack of flat-packed shipping cartons waiting by the side table
gltf("bar_chair_round_01", V(2.32, -0.18, 0), 0.5, 0.92)
for i, (dx, dy, sz, rz) in enumerate(((0, 0, (0.52, 0.4, 0.3), 0.08), (0.02, 0.01, (0.46, 0.36, 0.26), -0.06), (-0.01, 0.0, (0.38, 0.3, 0.2), 0.15))):
    zb = sum(((0.52, 0.4, 0.3), (0.46, 0.36, 0.26), (0.38, 0.3, 0.2))[k][2] for k in range(i))
    block(f"carton{i}", sz, V(2.5 + dx, -1.5 + dy, zb + sz[2] / 2), CARTON, 0.008, rz)
    block(f"cartonT{i}", (sz[0] + 0.004, 0.06, 0.003), V(2.5 + dx, -1.5 + dy, zb + sz[2] + 0.0015), flat(f"ctape{i}", "#cdb48a", 0.35), 0, rz)


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
    h = h % 24.0                       # the story runs past midnight into the next morning
    day = smooth(6.2, 8.2, h) * (1 - smooth(18.6, 20.0, h))
    dusk = smooth(16.8, 18.8, h) * (1 - smooth(19.8, 20.8, h)) + smooth(5.0, 6.2, h) * (1 - smooth(6.6, 8.3, h)) * 0.7
    night = max(smooth(19.6, 21.0, h), 1 - smooth(5.2, 6.6, h)); u = clamp((h - 6) / 14)
    elev = math.sin(u * math.pi) * 48 * DEG + 3 * DEG; az = lerp(-60, 60, u) * DEG
    return day, dusk, night, elev, az, u

# ------------------------------------------------------------------ camera: the reference's elevated three-quarter view
cam_d = bpy.data.cameras.new("cam"); cam = link(bpy.data.objects.new("cam", cam_d)); scene.camera = cam
cam_d.sensor_fit = "VERTICAL"; cam_d.angle_y = 24 * DEG; cam_d.clip_start = 1; cam_d.clip_end = 80
CAM_TGT = V(0.1, 0.12, 0.62); CAM_DIR = V(1.0, -1.08, 0.92).normalized(); CAM_DIST = float(os.environ.get("CX_DIST", "16.2"))
cam_d.dof.use_dof = True; cam_d.dof.aperture_fstop = 4.0
CITY, CITY_M1, CITY_M2, CITY_E = city_plate()
for o in (sun, FILL, LAMP, KLED_L, DESK_L, SHELF_L, HOLO_L, CITY):
    o.light_linking.receiver_collection = GROUND_EX
    for c in GROUND_EX.collection_objects: c.light_linking.link_state = "EXCLUDE"


# ------------------------------------------------------------------ choreography
# The story runs on a unit clock u ∈ [0, U]; p = u / U. Every function below is pure in u.
U = 540.0
def seg(u, a, b): return clamp((u - a) / (b - a))
def ease(t): return t * t * (3 - 2 * t)
def angle_lerp(a, b, t):
    d = (b - a + 180) % 360 - 180; return a + d * t
HOURS = [(0, 18.6), (42, 19.3), (150, 21.6), (166, 22.6), (204, 31.4), (218, 32.6), (258, 33.6), (310, 34.4), (332, 34.8), (350, 36.0),
         (372, 36.6), (398, 37.2), (426, 40.6), (456, 42.4), (504, 44.6), (522, 46.4), (531, 51.0), (540, 55.0)]
def hour_at(u):
    for (a, ha), (b, hb) in zip(HOURS, HOURS[1:]):
        if u <= b: return lerp(ha, hb, seg(u, a, b))
    return HOURS[-1][1]

# spots (x, y, yaw°); yaw 0 faces -y (the camera side), 90 faces +x, 180 faces +y (back wall), -90 faces the window
SOFA = (-2.66, 0.25, 90.0); RISE = (-2.46, 0.25, 90.0)
CTR = (-1.62, 1.40, 180.0); OVN = (-1.42, 1.22, 180.0)
TBL = (1.2, 0.02, 0.0); WIN = (-2.95, -0.62, -90.0)
P_SOFA_CTR = [(-2.46, 0.25), (-2.42, 0.9), (-2.0, 1.28), (-1.62, 1.40)]
P_CTR_OVN = [(-1.62, 1.40), (-1.42, 1.22)]
P_OVN_TBL = [(-1.42, 1.22), (-0.6, 0.85), (0.5, 0.25), (1.2, 0.02)]
P_TBL_OVN = list(reversed(P_OVN_TBL))
P_TBL_WIN = [(1.2, 0.02), (0.2, -0.1), (-1.4, -0.72), (-2.95, -0.62)]
TRAY_COUNTER = V(-1.5, 1.98, 0.935)
TRAY_OVEN = V(OVEN_X, 1.95, 0.38)
TRAY_TABLE = V(1.08, -0.7, WT_TOP + 0.001)
ASM = V(1.05, -0.35, WT_TOP + 0.001)
STACK = [V(1.56 + (i % 2) * 0.28, -0.45, WT_TOP + 0.001 + (i // 2) * 0.106) for i in range(4)]
BLANKS = V(1.6, -0.76, WT_TOP + 0.001)
BOWL = V(-1.85, 2.0, 0.9)
blanks = block("blanks", (0.3, 0.3, 0.04), V(0, 0, 0.02), M["kraft"], 0.002); blank_root = empty("blankRoot", BLANKS); blanks.parent = blank_root
bowl.location = BOWL; spoon.location = BOWL + V(0.12, -0.05, 0.02)
board.location = V(-1.5, 1.98, 0.902)
SLOTS = [456 + i * 12 for i in range(4)]
for b in BOXES[4:]:
    b["root"].hide_render = True
    for c in b["root"].children_recursive: c.hide_render = True
BOXES = BOXES[:4]

def path_len(P): return sum((V(*b) - V(*a)).length for a, b in zip(P, P[1:]))
def path_at(P, s):
    for a, b in zip(P, P[1:]):
        A, B = V(*a), V(*b); L_ = (B - A).length
        if s <= L_ or (a, b) == (P[-2], P[-1]):
            t = clamp(s / L_) if L_ > 0 else 0; d = (B - A).normalized(); return A.lerp(B, t), math.degrees(math.atan2(d.x, -d.y))
        s -= L_
def walk(u, P, u0, u1, yaw0, yaw1):
    t = seg(u, u0, u1); L_ = path_len(P); s = L_ * ease(t)
    pos, head = path_at(P, s)
    yaw = angle_lerp(yaw0, head, ease(seg(t, 0, 0.18)))
    yaw = angle_lerp(yaw, yaw1, ease(seg(t, 0.8, 1.0)))
    amp = ease(seg(t, 0, 0.12)) * (1 - ease(seg(t, 0.88, 1.0)))
    return (pos.x, pos.y, yaw), s, amp
def walk_pose(s, amp, base=None):
    b = dict(base or POSES_W["stand"]); b["face"] = dict(b["face"]); ph = s / 1.2
    def foot(f):
        f = f % 1.0
        if f < 0.5: return 0.3 - f / 0.5 * 0.6, 0.0
        g = (f - 0.5) / 0.5; return -0.3 + 0.6 * ease(g), 0.11 * math.sin(math.pi * g)
    zl, yl = foot(ph); zr, yr = foot(ph + 0.5)
    b["lf"] = (0.1, 0.06 + yl * amp, 0.02 + zl * amp); b["rf"] = (-0.1, 0.06 + yr * amp, 0.02 + zr * amp)
    b["lk"] = (0.12, 0.5, 1); b["rk"] = (-0.12, 0.5, 1)
    sw = math.sin(ph * 2 * math.pi) * amp
    if base is None:
        b["lh"] = (0.22, 0.84, 0.03 - 0.2 * sw); b["rh"] = (-0.22, 0.84, 0.03 + 0.2 * sw)
    b["hip"] = (0, -0.02 * amp * abs(math.cos(ph * 2 * math.pi)), 0); b["lean"] = b["lean"] + 4 * amp
    return b

POSES_W = {
    "stand": pose(STAND, lh=(0.22, 0.84, 0.03), rh=(-0.22, 0.84, 0.03), face=dict(smile=0.2)),
    "sitKnees": pose(SIT, lean=6, lh=(0.16, 0.56, 0.34), rh=(-0.16, 0.56, 0.34), le=(0.5, 0.6, -0.2), re=(-0.5, 0.6, -0.2), face=dict(smile=0.15)),
    "carry": pose(STAND, lh=(0.17, 0.98, 0.34), rh=(-0.17, 0.98, 0.34), le=(0.5, 0.8, -0.3), re=(-0.5, 0.8, -0.3), cl=0.7, cr=0.7, look=(0, 1.5, 2), face=dict(focus=0.15, smile=0.25)),
    "bend": pose(STAND, lean=52, hip=(0, -0.1, -0.05), lk=(0.14, 0.45, 1.2), rk=(-0.14, 0.45, 1.2), look=(0, 0.4, 0.8), face=dict(focus=0.3)),
    "lean": pose(STAND, lean=24, look=(0, 0.9, 0.9), face=dict(focus=0.2, smile=0.25)),
    "admire": pose(STAND, lh=(0.12, 1.0, 0.25), rh=(-0.14, 1.02, 0.24), le=(0.5, 0.7, -0.3), re=(-0.5, 0.7, -0.3), cl=0.6, cr=0.6, face=dict(smile=0.8, brow=0.3)),
    "window": POSES["window"],
}
POSES_W["bendCarry"] = pose(POSES_W["bend"])
POSES_W["walkCarry"] = POSES_W["carry"]

def to_char(w, spot):
    x, y, yaw = spot; c, s_ = math.cos(-yaw * DEG), math.sin(-yaw * DEG); dx, dy = w.x - x, w.y - y
    lx, ly = dx * c - dy * s_, dx * s_ + dy * c
    return (lx, w.z, -ly)

def bar_world(angle):
    # the oven bar's world position for a door angle (rotation about x at the hinge)
    h = V(OVEN_X, HINGE.location.y, 0.12); r = V(0, -0.03 - (h.y - (RY - 0.62 - 0.004)), 0.66 - 0.12)
    return h + V(0, r.y * math.cos(angle) - r.z * math.sin(angle), r.y * math.sin(angle) + r.z * math.cos(angle))

def door_angle(u):
    a1 = ease(seg(u, 266, 278)) - ease(seg(u, 298, 306))
    a2 = ease(seg(u, 374, 382)) - ease(seg(u, 392, 400))
    return (a1 + a2) * 85 * DEG

def tray_state(u):
    """(where, world loc or None, baked, visible cookies)"""
    n_ck = int(clamp((u - 236) / 22) * 12 + 0.999) if u < 258 else 12
    if u >= SLOTS[0]:
        n_ck = 12 - sum(2 for S in SLOTS if u >= S + 0.4 * 12 + 2)
    baked = ease(seg(u, 330, 372))
    if u < 208: return ("hide", None, 0.0, 0)
    if u < 286: return ("at", TRAY_COUNTER, 0.0, n_ck)
    if u < 296: return ("hands", None, 0.0, 12)
    if u < 382: return ("oven" if door_angle(u) < 0.3 else "at", TRAY_OVEN, baked, 12)
    if u < 424: return ("hands", None, 1.0, 12)
    return ("at", TRAY_TABLE, 1.0, n_ck)

def figure_at(u):
    """→ spot (x, y, yaw), pose dict, hands {side: world target} overriding the pose, carry ('phone'|'tray'|'box', i)"""
    H = {}; carry = None
    def P(name): return dict(POSES_W.get(name) or POSES[name])
    if u < 30:
        return SOFA, P("sitThink"), H, None
    if u < 42:
        pz = mixpose(POSES["sitThink"], POSES["sitPhone"], 0.0); pz["look"] = to_char(PHONE_REST, SOFA); pz["lean"] = lerp(16, 22, ease(seg(u, 30, 42)))
        return SOFA, pz, H, None
    if u < 70:
        reach = pose(POSES["sitPhone"], lean=34, look=to_char(PHONE_REST, SOFA))
        if u < 56:
            t = ease(seg(u, 42, 56)); pz = mixpose(POSES["sitThink"], reach, t)
            pz["rh"] = tuple(lerp(a, b, t) for a, b in zip(POSES["sitThink"]["rh"], to_char(PHONE_REST + V(0, 0, 0.03), SOFA)))
            return SOFA, pz, H, None
        t = ease(seg(u, 56, 70)); pz = mixpose(reach, POSES["sitPhone"], t)
        pz["rh"] = tuple(lerp(a, b, t) for a, b in zip(to_char(PHONE_REST + V(0, 0, 0.03), SOFA), POSES["sitPhone"]["rh"]))
        return SOFA, pz, H, ("phone", "r")
    if u < 150:
        pz = P("sitPhone"); pz["rh"] = (pz["rh"][0], pz["rh"][1] + math.sin(u * 0.9) * 0.004, pz["rh"][2])
        return SOFA, pz, H, ("phone", "r")
    if u < 170:
        reach = pose(POSES["sitPhone"], lean=34, look=to_char(PHONE_REST, SOFA))
        tgt = to_char(PHONE_REST + V(0, 0, 0.03), SOFA)
        if u < 160:
            t = ease(seg(u, 150, 160)); pz = mixpose(POSES["sitPhone"], reach, t)
            pz["rh"] = tuple(lerp(a, b, t) for a, b in zip(POSES["sitPhone"]["rh"], tgt)); return SOFA, pz, H, ("phone", "r")
        t = ease(seg(u, 160, 170)); pz = mixpose(reach, POSES_W["sitKnees"], t)
        pz["rh"] = tuple(lerp(a, b, t) for a, b in zip(tgt, POSES_W["sitKnees"]["rh"])); return SOFA, pz, H, None
    if u < 186:
        t = ease(seg(u, 170, 186)); lean = math.sin(t * math.pi) * 30
        pz = mixpose(POSES_W["sitKnees"], POSES_W["stand"], t); pz["lean"] += lean
        x = lerp(SOFA[0], RISE[0], t); return (x, SOFA[1], 90.0), pz, H, None
    if u < 208:
        spot, s, amp = walk(u, P_SOFA_CTR, 186, 208, 90.0, 180.0); return spot, walk_pose(s, amp), H, None
    if u < 218:
        t = ease(seg(u, 208, 212)); pz = mixpose(POSES_W["stand"], POSES["counter"], t); return CTR, pz, H, None
    if u < 258:
        pz = P("counter"); bw_ = to_char(BOWL + V(0, 0, 0.12), CTR)
        if u < 236:   # stirring
            a = u * 1.6; pz["rh"] = (bw_[0] + math.cos(a) * 0.05, bw_[1], bw_[2] + math.sin(a) * 0.05); pz["look"] = to_char(BOWL, CTR)
        else:         # scooping onto the tray, one cookie at a time
            k = (u - 236) / 22 * 12; i = min(11, int(k)); f = k - int(k)
            ck = TRAY_COUNTER + V(-0.165 + (i % 4) * 0.11, -0.095 + (i // 4) * 0.095, 0.08)
            src = BOWL + V(0, 0, 0.12); w = src.lerp(ck, math.sin(f * math.pi)) if f < 0.5 else ck.lerp(src, (f - 0.5) * 2)
            pz["rh"] = to_char(w, CTR); pz["look"] = to_char(TRAY_COUNTER, CTR)
        return CTR, pz, H, ("spoon", "r")
    if u < 264:
        spot, s, amp = walk(u, P_CTR_OVN, 258, 264, 180.0, 180.0); return spot, walk_pose(s, amp * 0.6), H, None
    ang = door_angle(u)
    if u < 278:   # bend, open the oven door by its bar
        t = ease(seg(u, 264, 268)); pz = mixpose(POSES_W["stand"], POSES_W["bend"], t)
        hold = u < 274
        pz["lh"] = to_char(bar_world(ang) + V(0, -0.02, 0.02), OVN) if hold else pz["lh"]
        if u >= 274: pz = mixpose(POSES_W["bend"], POSES_W["lean"], ease(seg(u, 274, 278)))
        return OVN, pz, H, None
    if u < 286:   # reach for the tray on the counter
        t = ease(seg(u, 278, 286)); pz = P("lean"); pz["lean"] = 30
        L_ = to_char(TRAY_COUNTER + V(0.2, 0, 0.03), OVN); R_ = to_char(TRAY_COUNTER + V(-0.2, 0, 0.03), OVN)
        pz["lh"] = tuple(lerp(a, b, t) for a, b in zip(POSES_W["stand"]["lh"], L_)); pz["rh"] = tuple(lerp(a, b, t) for a, b in zip(POSES_W["stand"]["rh"], R_))
        pz["look"] = to_char(TRAY_COUNTER, OVN); return OVN, pz, H, None
    if u < 310:
        if u < 296:   # tray into the oven
            t = ease(seg(u, 286, 296)); w = TRAY_COUNTER.lerp(TRAY_OVEN, t) + V(0, 0, math.sin(t * math.pi) * 0.08)
            pz = mixpose(POSES_W["lean"], POSES_W["bend"], t); pz["lean"] = lerp(30, 54, t)
            pz["lh"] = to_char(w + V(0.2, 0, 0.03), OVN); pz["rh"] = to_char(w + V(-0.2, 0, 0.03), OVN); pz["look"] = to_char(w, OVN)
            return OVN, pz, H, ("tray", w)
        if u < 306:   # push the door shut
            pz = P("bend"); pz["lh"] = to_char(bar_world(ang) + V(0, -0.02, 0.02), OVN); pz["look"] = to_char(TRAY_OVEN, OVN); return OVN, pz, H, None
        pz = mixpose(POSES_W["bend"], POSES_W["stand"], ease(seg(u, 306, 310))); return OVN, pz, H, None
    if u < 332:
        spot, s, amp = walk(u, P_OVN_TBL, 310, 332, 180.0, 0.0); return spot, walk_pose(s, amp), H, None
    if u < 350:   # lays out flat box blanks while the cookies bake
        pz = P("lean"); a = u * 0.7
        pz["lh"] = to_char(BLANKS + V(0.08 + math.sin(a) * 0.05, 0.05, 0.08), TBL); pz["rh"] = to_char(BLANKS + V(-0.12, 0.08 + math.cos(a) * 0.05, 0.08), TBL)
        pz["look"] = to_char(BLANKS, TBL); return TBL, pz, H, None
    if u < 372:
        spot, s, amp = walk(u, P_TBL_OVN, 350, 372, 0.0, 180.0); return spot, walk_pose(s, amp), H, None
    if u < 398:   # take the baked tray out
        if u < 382:
            t = ease(seg(u, 372, 376)); pz = mixpose(POSES_W["stand"], POSES_W["bend"], t)
            if u < 378: pz["lh"] = to_char(bar_world(ang) + V(0, -0.02, 0.02), OVN)
            else:
                k = ease(seg(u, 378, 382)); pz["lh"] = to_char(TRAY_OVEN + V(0.2, 0, 0.03), OVN) if k > 0.5 else pz["lh"]; pz["rh"] = to_char(TRAY_OVEN + V(-0.2, 0, 0.03), OVN)
            pz["look"] = to_char(TRAY_OVEN, OVN); return OVN, pz, H, None
        t = ease(seg(u, 382, 392)); hold = to_char(TRAY_OVEN, OVN)
        w = TRAY_OVEN.lerp(T_spot(OVN, POSES_W["carry"]), t)
        pz = mixpose(POSES_W["bend"], POSES_W["carry"], t)
        pz["lh"] = to_char(w + V(0.2, 0, 0.03), OVN); pz["rh"] = to_char(w + V(-0.2, 0, 0.03), OVN)
        return OVN, pz, H, ("tray", w)
    if u < 420:
        spot, s, amp = walk(u, P_OVN_TBL, 398, 420, 180.0, 0.0); pz = walk_pose(s, amp, POSES_W["carry"])
        return spot, pz, H, ("tray", None)
    if u < 426:   # set it down
        t = ease(seg(u, 420, 426)); src = T_spot(TBL, POSES_W["carry"]); w = src.lerp(TRAY_TABLE, t)
        pz = mixpose(POSES_W["carry"], POSES_W["lean"], t); pz["lh"] = to_char(w + V(0.2, 0, 0.03), TBL); pz["rh"] = to_char(w + V(-0.2, 0, 0.03), TBL)
        return TBL, pz, H, ("tray", w)
    if u < 456:   # the store goes live: she turns to look at it
        t = ease(seg(u, 426, 438)); yaw = angle_lerp(0.0, face_to(TBL, CARDS["store"]["at"]) * 0.55, t)
        pz = mixpose(POSES_W["lean"], POSES_W["admire"], t); sp = (TBL[0], TBL[1], yaw); pz["look"] = to_char(CARDS["store"]["at"], sp)
        return sp, pz, H, None
    if u < 504:   # packing the demo orders, one box each
        t = ease(seg(u, 456, 460)); yaw = angle_lerp(face_to(TBL, CARDS["store"]["at"]) * 0.55, 0.0, t); sp = (TBL[0], TBL[1], yaw)
        pz = P("lean"); pz["lean"] = 26
        i = min(3, int((u - 456) / 12)); bw_ = box_world(i, u)
        pz["lh"] = to_char(bw_ + V(0.15, 0, 0.06), sp); pz["rh"] = to_char(bw_ + V(-0.15, 0, 0.06), sp); pz["look"] = to_char(bw_, sp)
        return sp, pz, H, None
    if u < 522:
        spot, s, amp = walk(u, P_TBL_WIN, 504, 522, 0.0, -90.0); return spot, walk_pose(s, amp), H, None
    pz = P("window"); return WIN, pz, H, None

def face_to(spot, w): return math.degrees(math.atan2(w.x - spot[0], -(w.y - spot[1])))
def T_spot(spot, pz):
    """world point between the hands of a carry pose at a spot"""
    x, y, yaw = spot; c = V((pz["lh"][0] + pz["rh"][0]) / 2, -(pz["lh"][2] + pz["rh"][2]) / 2, (pz["lh"][1] + pz["rh"][1]) / 2)
    r = Matrix.Rotation(yaw * DEG, 3, "Z"); return V(x, y, 0) + r @ c

def box_world(i, u):
    S = SLOTS[i]; v = clamp((u - S) / 12)
    if u < S: return ASM
    if v < 0.75: return ASM
    k = ease(seg(v, 0.75, 1.0)); return ASM.lerp(STACK[i], k) + V(0, 0, math.sin(k * math.pi) * 0.16)

def box_state(i, u):
    """→ visible, loc, wall height 0..1, cookies 0..1, lid angle"""
    S = SLOTS[i]
    if u < S: return False, ASM, 0, 0, -110 * DEG
    v = clamp((u - S) / 12)
    return True, box_world(i, u), max(0.03, ease(seg(v, 0.12, 0.4))), ease(seg(v, 0.4, 0.6)), lerp(-110, 0, ease(seg(v, 0.6, 0.75))) * DEG

def mon_img():
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5); me = bpy.data.meshes.new("monImg"); bm.to_mesh(me); bm.free()
    uv = me.uv_layers.new()
    for li, l in enumerate(me.loops): v = me.vertices[l.vertex_index].co; uv.data[li].uv = (v.x + 0.5, v.y + 0.5)
    ob = link(bpy.data.objects.new("monImg", me)); me.materials.append(image_mat("scr-build", card_png("store", 1.0, os.path.join(TMP, "scr-store.png")), 0.3, emit=1.4))
    ob.scale = (0.575, 0.345, 1); ob.rotation_euler = (math.pi / 2, 0, 0); ob.location = monScreen.location + V(0, -0.004, 0); return ob
MON_IMG = mon_img()

# ------------------------------------------------------------------ card timing: (key, fade in a→b, fade out c→d, content t range)
CARD_T = {"dream": (4, 18, 40, 48, 4, 40), "phone": (66, 74, 150, 158, 70, 150), "build": (304, 314, 352, 362, 304, 356),
          "store": (426, 440, 500, 510, 426, 456), "orders": (452, 460, 504, 512, 456, 504)}
WORKSPACE = ["work", "bowl", "spoon", "flour", "board"]
WS_OBJ = {"work": work, "bowl": bowl, "spoon": spoon, "flour": flour, "board": board}
WS_BASE = {k: (o.location.copy(), o.scale.copy()) for k, o in WS_OBJ.items()}

def show(ob, on):
    ob.hide_render = not on
    for c in ob.children_recursive: c.hide_render = not on

def set_state(p):
    u = clamp(p) * U; clock = u * 0.55; h = hour_at(u)
    day, dusk, night, elev, az, uu = sun_state(h)
    d = Vector((-math.cos(elev) * math.cos(az), math.cos(elev) * math.sin(az) * 0.9, math.sin(elev)))
    sun.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    hh = h % 24
    warm = clamp(smooth(14.5, 19, hh) + (1 - smooth(7, 10, hh)))
    sunL.color = (1.0, lerp(0.93, 0.6, warm), lerp(0.85, 0.36, warm)); sunL.energy = (day * 4.2 + dusk * 2.6) * (1 - night)
    try:
        sky.sun_elevation = max(elev, 0.02) if night < 0.5 else -0.05; sky.sun_rotation = math.pi + az
    except Exception: pass
    skyB.inputs["Strength"].default_value = 0.16 * (day + 0.6 * dusk) + 0.008
    mixC.inputs["Factor"].default_value = night
    gr = (lerp(1.0, 1.15, dusk), lerp(1.0, 0.82, dusk), lerp(1.0, 0.7, dusk), 1); lvl = 0.9 * day + 1.0 * dusk + 0.9 * night
    gradeC.inputs[7].default_value = (gr[0] * lvl, gr[1] * lvl, gr[2] * lvl, 1)
    CITY_M1.inputs["Factor"].default_value = clamp(dusk * 1.4)
    CITY_M2.inputs["Factor"].default_value = night
    CITY_E.inputs["Strength"].default_value = 1.5 * day + 1.2 * dusk + 1.6 * night + 0.2
    on = clamp(max(dusk * 1.3, night))                       # practical lamps follow the light outside
    kon = clamp(0.35 + 0.65 * on)                              # the under-cabinet strip is on whenever someone is cooking
    LAMP.data.energy = on * 130; shade_em.node_tree.nodes["Emission"].inputs["Strength"].default_value = on * 6
    KLED_L.data.energy = kon * 70; KLED.data.materials[0].node_tree.nodes["Emission"].inputs["Strength"].default_value = kon * 12
    DESK_L.data.energy = (0.25 + 0.75 * on) * 22; SHELF_L.data.energy = (0.2 + 0.8 * on) * 26
    SCONCE_L.data.energy = on * 40; SCONCE_EM.node_tree.nodes["Emission"].inputs["Strength"].default_value = on * 8
    TLAMP_L.data.energy = (0.15 + 0.85 * on) * 28; TLAMP_EM.node_tree.nodes["Emission"].inputs["Strength"].default_value = (0.15 + 0.85 * on) * 7
    FILL.data.energy = 95 * (0.2 + 0.8 * day) + 12 * night; FILL.data.color = (1.0, lerp(0.86, 0.93, day), lerp(0.78, 0.86, day))
    PL_NEON.data.energy = 8 + 8 * night
    scene.view_settings.exposure = 0.2 + 0.25 * night + 0.1 * dusk
    # oven: glows while baking, door on its hinge
    bake_on = smooth(300, 306, u) * (1 - smooth(374, 380, u))
    OVEN_GLOW.data.materials[0].node_tree.nodes["Emission"].inputs["Strength"].default_value = bake_on * (2.2 + 0.2 * math.sin(clock * 2))
    HINGE.rotation_euler = (door_angle(u), 0, 0)
    # workspace evolves (time-lapse between 208 and 218, staggered)
    for i, k in enumerate(WORKSPACE):
        e = ease(seg(u, 208 + i * 1.5, 213 + i * 1.5)); loc, sc = WS_BASE[k]; ob = WS_OBJ[k]
        show(ob, e > 0.01); ob.scale = sc * max(0.001, e); ob.location = loc + V(0, 0, (1 - e) * 0.12)
    # blanks for the boxes: appear while she lays them out, shrink as boxes are made
    nb = ease(seg(u, 334, 348)) * 4 - sum(1 for S in SLOTS if u >= S + 1.5)
    show(blank_root, nb > 0.05); blank_root.scale = (1, 1, max(0.05, nb / 4))
    # the tray
    where, loc, baked, nck = tray_state(u)
    TRAY_DOUGH.node_tree.nodes["BAKE"].outputs[0].default_value = baked
    for i, c in enumerate(TRAY_CK):
        grow = 1.0 if u >= 258 else ease(clamp((u - 236) / 22 * 12 - i))
        c.scale = (lerp(1.0, 1.12, baked), lerp(1.0, 1.12, baked), lerp(1.25, 0.85, baked)) if i < nck or u < 258 else (0.001, 0.001, 0.001)
        if u < 258: c.scale = tuple(x * max(0.001, grow) for x in c.scale)
    # boxes
    for i, b in enumerate(BOXES):
        vis, loc, wall, ck, lid = box_state(i, u)
        show(b["root"], vis)
        if not vis: continue
        b["root"].location = loc; b["walls"].scale = (1, 1, max(0.03, wall)); b["hinge"].location.z = b["sz"] * max(0.03, wall)
        b["hinge"].rotation_euler = (lid, 0, 0); b["hinge"].hide_render = wall < 0.9
        for c in b["hinge"].children: c.hide_render = wall < 0.9
        for c in b["cookies"]:
            c.scale = (max(0.001, ck),) * 3
            for cc in c.children: cc.hide_render = ck < 0.02
    # cards
    spill = 0.0
    for key, (a, b, c, d2, t0, t1) in CARD_T.items():
        cd = CARDS[key]; f = ease(seg(u, a, b)) * (1 - ease(seg(u, c, d2)))
        show(cd["ob"], f > 0.02)
        if f <= 0.02: continue
        cd["ob"].location = cd["at"] + V(0, 0, (1 - f) * 0.08 + math.sin(clock * 0.6 + cd["at"].x) * 0.01)
        cd["m"].node_tree.nodes["FADE"].outputs[0].default_value = f
        cd["m"].node_tree.nodes["EM"].inputs["Strength"].default_value = 0.9 - 0.35 * night
        t = seg(u, t0, t1); q = round(t * 24) / 24
        if abs(q - cd["last"]) > 1e-4:
            path = card_png(key, q, os.path.join(TMP, f"card-{key}-{int(q * 24)}.png"))
            cd["img"].image = bpy.data.images.load(path, check_existing=True); cd["last"] = q
        if f > spill: HOLO_L.location = cd["at"] - V(0, 0, 0.4); spill = f
    HOLO_L.data.energy = 8 * spill
    # the desk monitor shows the build while CHARGIX works on the store
    building = 304 <= u < 456
    show(MON_IMG, building)
    # the figure
    spot, pz, Hh, carry = figure_at(u)
    pz = dict(pz); pz["face"] = dict(pz["face"])
    pz["look"] = (pz["look"][0] + math.sin(clock * 0.37) * 0.04, pz["look"][1] + math.sin(clock * 0.53) * 0.02, pz["look"][2])
    FIGH.location = V(spot[0], spot[1], 0); FIGH.rotation_euler = (0, 0, spot[2] * DEG); upd()
    apply_pose(pz, clock)
    for fv in FADES: fv.outputs[0].default_value = 1.0
    # props that follow the hands
    ph_on = 30 <= u
    PH_SCR.node_tree.nodes["Emission"].inputs["Strength"].default_value = (1.4 * (0.6 + 0.4 * math.sin(u * 2.2)) if u < 56 else 2.0) * (smooth(30, 32, u) * (1 - smooth(160, 166, u)))
    if carry and carry[0] == "phone":
        hp = bw("hand_r"); mid = bw("middle_01_r"); phone.location = hp.lerp(mid, 0.95)
        look = (bw("head") - phone.location).normalized(); phone.rotation_euler = look.to_track_quat("Z", "Y").to_euler()
    else:
        phone.location = PHONE_REST; phone.rotation_euler = (0, 0, 0.3)
    show(phone, True)
    show(spoon, u >= 208); 
    if carry and carry[0] == "spoon":
        spoon.location = bw("hand_r").lerp(bw("middle_01_r"), 0.8) + V(0, 0, -0.08); spoon.rotation_euler = (0.4, 0, 0)
    elif u >= 258:
        spoon.location = BOWL + V(0.12, -0.05, 0.02); spoon.rotation_euler = (0, 0, 0.6)
    if where == "hide": show(tray, False)
    else:
        show(tray, where != "oven")
        if carry and carry[0] == "tray":
            w = carry[1] if carry[1] is not None else (bw("hand_l") + bw("hand_r")) / 2 + V(0, 0, -0.03)
            tray.location = w; tray.rotation_euler = (0, 0, spot[2] * DEG)
        else:
            tray.location = loc; tray.rotation_euler = (0, 0, 0)
    for i, c in enumerate(TRAY_CK):
        for cc in c.children: cc.hide_render = tray.hide_render or c.scale.z < 0.05
    # camera: one fixed elevated three-quarter view, never moves
    cam.location = CAM_TGT + CAM_DIR * CAM_DIST; cam.rotation_euler = (CAM_TGT - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam_d.dof.focus_distance = (cam.location - V(0, 0.3, 0.9)).length

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
print("coffee table", tuple(round(x, 2) for x in ct0), tuple(round(x, 2) for x in ct1), "worktable", tuple(round(x, 2) for x in wt0), tuple(round(x, 2) for x in wt1), flush=True)

if FRAMES.startswith("p:"): items = [(f"p{i}", float(x)) for i, x in enumerate(FRAMES[2:].split(","))]
elif FRAMES.startswith("u:"): items = [(f"u{int(float(x)):03d}", float(x) / U) for x in FRAMES[2:].split(",")]
else: items = [(f"{PREFIX}-{int(x):03d}", int(x) / (N - 1)) for x in FRAMES.split(",") if x != ""]
# ------------------------------------------------------------------ virtual-camera track for the web player
# For every frame: where the action is in the image (normalised, y down) and how far the player may push in.
from bpy_extras.object_utils import world_to_camera_view
Z_KEYS = [(0, 1.1), (40, 1.15), (60, 1.45), (160, 1.45), (180, 1.15), (212, 1.15), (220, 1.45), (256, 1.45), (270, 1.35), (350, 1.35),
          (360, 1.2), (420, 1.2), (428, 1.0), (452, 1.0), (462, 1.35), (500, 1.35), (520, 1.05), (540, 1.0)]
CARD_PULL = {"dream": 0.35, "phone": 0.3, "build": 0.25, "store": 0.6, "orders": 0.35}
def track_point(p):
    u = clamp(p) * U
    z = Z_KEYS[-1][1]
    for (a, za), (b, zb) in zip(Z_KEYS, Z_KEYS[1:]):
        if u <= b: z = lerp(za, zb, ease(seg(u, a, b))); break
    pt = bw("head") * 0.45 + (bw("hand_l") + bw("hand_r")) / 2 * 0.55
    best, w = None, 0.0
    for key, (a, b, c, d2, t0, t1) in CARD_T.items():
        f = ease(seg(u, a, b)) * (1 - ease(seg(u, c, d2))) * CARD_PULL[key]
        if f > w: best, w = CARDS[key]["at"], f
    if best is not None: pt = pt.lerp(best, w)
    upd(); q = world_to_camera_view(scene, cam, pt)
    return [q.x, 1 - q.y, z]

TRACK = []
for name, p in items:
    set_state(p)
    TRACK.append(track_point(p))
    r.filepath = os.path.join(OUT, f"{name}.png")
    if os.environ.get("CX_DRY"): print("posed", name, [round(x, 3) for x in TRACK[-1]], flush=True); continue
    bpy.ops.render.render(write_still=True)
    print("rendered", name, round(p, 3), flush=True)
if os.environ.get("CX_TRACK"):
    import json
    sig = 4.0; n = len(TRACK); sm = []
    for i in range(n):
        ws = [(math.exp(-((j - i) / sig) ** 2 / 2), TRACK[j]) for j in range(max(0, i - 12), min(n, i + 13))]
        tw = sum(w for w, _ in ws); sm.append([round(sum(w * t[k] for w, t in ws) / tw, 4) for k in range(3)])
    json.dump(sm, open(os.environ["CX_TRACK"], "w")); print("track", os.environ["CX_TRACK"], n, flush=True)
