# CHARGIX · Story two, NOVA — the same open-front box, a clothing brand printed at home. Path-traced in Cycles.
# Built from the cookie scene (diorama2.py): same room shell, light rig, camera, figure system and track export.
#
# One fixed elevated three-quarter camera looks into the box. Scroll progress p∈[0,1] plays
# her story: choosing a design at the desk late at night, finding CHARGIX and picking a
# package, the next morning at the heat press (blank tee, transfer, press, peel), the rack
# filling, the worktable arriving, folding, the NOVA store going live, demo orders packed
# into mailers, evening. Everything is a pure function of p (no keyframes), so any frame
# renders alone (sharded CI) and reverse scroll is exact.
#
# Assets: Poly Haven CC0 models / textures / HDRIs (chargix/assets/ph), the CC0
# MakeHuman figure from character.py (assets/fig/nova-woman.glb, female), fonts in ./fonts
# (Manrope, Archivo Black — SIL OFL).
#
# usage: python diorama.py <outdir> <frames "0,5,9" | "p:0.1,0.5"> [W H spp story]
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix, Quaternion, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
PH = os.path.join(HERE, "..", "assets", "ph")
FIG = os.environ.get("CX_FIG", os.path.join(HERE, "..", "assets", "fig", "nova-woman.glb"))
FONT = os.path.join(HERE, "fonts", "Manrope-Medium.ttf"); FONT_B = os.path.join(HERE, "fonts", "ArchivoBlack-Regular.ttf")
OUT = sys.argv[1]; FRAMES = sys.argv[2]
W, H, SPP = (int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (1600, 1000, 96)
PREFIX = sys.argv[6] if len(sys.argv) > 6 else "nova"
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
M["floor"] = pbr("parquet", "herringbone_parquet", scale=0.8, tint="#bf9f84", rough_mul=1.2, sat=0.75)
M["wallL"] = plaster_wall("wallL", "#ab978a"); M["wallB"] = plaster_wall("wallB", "#a28c7e")
M["cap"] = flat("cap", "#ece2d6", 0.65)
M["plinth"] = flat("plinth", "#1c1b22", 0.38)
M["plinthDark"] = flat("plinthDark", "#16151c", 0.5)
M["neon"] = emission("neon", "#ffb977", 2.4)
M["ground"] = flat("ground", "#060609", 0.4); M["ground"].node_tree.nodes["Principled BSDF"].inputs["Specular IOR Level"].default_value = 0.3
M["cab"] = flat("cabinet", "#33353a", 0.48, coat=0.0) if False else flat("cabinet", "#34363b", 0.5)
M["cabFront"] = pbr("cabFront", "kitchen_wood", scale=0.6, tint="#3d3f3a", rough_mul=0.9)
M["brass"] = flat("brass", "#b8925c", 0.32, 1.0)
M["peg"] = pbr("peg", "oak_veneer_01", scale=1.2, tint="#d9c2a4", rough_mul=0.9)
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

# ------------------------------------------------------------------ print studio along the back wall: a long counter with the heat press, open shelves of tees above
def studio():
    x0, x1, d = -2.05, -0.15, 0.62; yc = RY - d / 2
    block("base", (x1 - x0, d - 0.06, 0.8), V((x0 + x1) / 2, yc + 0.03, 0.46), M["cab"], 0.004)
    block("plinthK", (x1 - x0, d - 0.12, 0.08), V((x0 + x1) / 2, yc + 0.06, 0.04), M["black"], 0.002)
    n = 4; w = (x1 - x0) / n
    for i in range(n):
        cx = x0 + w * (i + 0.5)
        block(f"door{i}", (w - 0.006, 0.02, 0.76), V(cx, RY - d + 0.01, 0.46), M["cabFront"], 0.003)
        block(f"pull{i}", (0.16, 0.022, 0.012), V(cx, RY - d - 0.008, 0.8), M["brass"], 0.004)
    block("worktop", (x1 - x0 + 0.04, d + 0.03, 0.04), V((x0 + x1) / 2, yc - 0.01, 0.88), M["top"], 0.004)
    # pegboard panel behind the counter, two open oak shelves with folded tees, warm LED strip under the lower one
    block("peg", (x1 - x0, 0.012, 0.62), V((x0 + x1) / 2, RY - 0.006, 1.21), M["peg"], 0.001)
    for z in (1.66, 2.06):
        block("tshelf", (x1 - x0 - 0.1, 0.3, 0.035), V((x0 + x1) / 2, RY - 0.15, z), M["oak"], 0.004)
        for k in range(5):
            cols = ("#efebe4", "#1d1d21", "#c8b49a", "#efebe4", "#4a4f46")
            h_ = 0.035 * (3 + (k * 7 + int(z * 10)) % 3)
            block(f"tstack{k}", (0.24, 0.22, h_), V(x0 + 0.25 + k * 0.36, RY - 0.16, z + 0.0175 + h_ / 2), jersey(cols[(k + int(z * 3)) % 5]), 0.01)
    led = block("led", (x1 - x0 - 0.2, 0.02, 0.006), V((x0 + x1) / 2, RY - 0.26, 1.635), emission("led", "#ffd7a0", 0.0), 0)
    return led, (x0, x1, w)

def jersey(h):
    k = "jersey" + h
    if k not in M: M[k] = pbr(k, "cotton_jersey", scale=8, tint=h, normal=0.6, sat=0.0)
    return M[k]
KLED, KX = studio()
gltf("classic_laptop", V(-0.45, RY - 0.32, 0.9), 0.25, 0.62)
gltf("office_notepads", V(-1.85, RY - 0.25, 0.9), 0.3, 1.0)

# garment rack in the corner: black steel uprights, a rail, tees appear on it as they are printed
RACK_X0, RACK_X1, RACK_Y, RACK_Z = -3.3, -2.25, 2.0, 1.62
for xx in (RACK_X0, RACK_X1):
    cyl("rackUp", 0.013, RACK_Z, V(xx, RACK_Y, RACK_Z / 2), M["black"], 16)
    block("rackFoot", (0.03, 0.5, 0.02), V(xx, RACK_Y, 0.01), M["black"], 0.004)
rail = cyl("rackRail", 0.011, RACK_X1 - RACK_X0 + 0.04, V((RACK_X0 + RACK_X1) / 2, RACK_Y, RACK_Z), M["black"], 16); rail.rotation_euler = (0, math.pi / 2, 0)

# ------------------------------------------------------------------ living area: her lounge corner by the window
sofa = retint(gltf("sofa_02", V(-2.95, 0.05, 0), 90 * DEG, 1.0), 0.6, 0.62, "#7a3b2a", 0.55)   # deep rust
retint(gltf("throw_pillows_01", V(-2.98, 0.05, 0.38), 90 * DEG, 1.0), 0.25, 0.85)
rug = block("rug", (1.8, 2.4, 0.012), V(-2.0, 0.05, 0.006), M["rug"], 0.006)
gltf("small_wooden_table_01", V(-1.95, 0.05, 0), 0.0, 0.8)
armchair = gltf("modern_arm_chair_01", V(-0.75, -1.45, 0), 150 * DEG, 0.95)
tvcab = gltf("modern_wooden_cabinet", V(-1.6, -1.64, 0), 180 * DEG, 0.85)
gltf("ceramic_vase_02", V(-2.65, -1.64, 0.58), 0, 0.5)
gltf("side_table_01", V(3.1, -0.25, 0), 2.0, 0.9)
block("tableRug", (2.4, 1.8, 0.008), V(1.4, -0.45, 0.004), M["trug"], 0.004)
# floor lamp by the window: black stem, linen drum shade with a warm emitter inside
lampX, lampY = -3.12, -1.55
cyl("lampBase", 0.14, 0.025, V(lampX, lampY, 0.0125), M["black"], 48, bevel=0.006)
cyl("lampStem", 0.011, 1.45, V(lampX, lampY, 0.75), M["black"], 16)
shade = cyl("lampShade", 0.2, 0.3, V(lampX, lampY, 1.55), M["linen"], 64, r2=0.17); shade.modifiers.new("s", "SOLIDIFY").thickness = 0.004
bm = bmesh.new(); bm.from_mesh(shade.data)
for f in [f for f in bm.faces if abs(f.normal.z) > 0.9]: bm.faces.remove(f)
bm.to_mesh(shade.data); bm.free()
# desk zone at the right of the back wall: where she designs
desk = gltf("wooden_table_02", V(1.75, RY - 0.4, 0), 0, 1.0)
chair = gltf("dining_chair_02", V(1.75, RY - 0.98, 0), 180 * DEG, 1.0)
mon = block("monitor", (0.62, 0.03, 0.38), V(1.8, RY - 0.18, 1.12), M["black"], 0.008)
monScreen = block("monScreen", (0.585, 0.004, 0.345), V(1.8, RY - 0.197, 1.12), M["screen"], 0)
block("monNeck", (0.05, 0.03, 0.26), V(1.8, RY - 0.15, 0.92), M["black"], 0.006)
block("monFoot", (0.24, 0.16, 0.012), V(1.8, RY - 0.15, 0.806), M["black"], 0.004)
block("keyboard", (0.42, 0.13, 0.014), V(1.8, RY - 0.48, 0.807), flat("kb", "#d8d6d2", 0.6), 0.004)
block("tablet", (0.3, 0.21, 0.008), V(1.35, RY - 0.5, 0.806), M["black"], 0.006, 0.3)
gltf("stationery_supplies", V(1.25, RY - 0.22, 0.8), 0.2, 1.0)
dl = (1.22, RY - 0.18)
cyl("dlBase", 0.07, 0.018, V(*dl, 0.809), M["black"], 32, bevel=0.004)
arm1 = cyl("dlArm", 0.008, 0.42, V(dl[0], dl[1], 1.0), M["black"], 12); arm1.rotation_euler = (0.25, 0, 0)
dsh = cyl("dlShade", 0.03, 0.12, V(dl[0], dl[1] - 0.1, 1.18), M["black"], 32, r2=0.07); dsh.rotation_euler = (-0.9, 0, 0)
shelves = gltf("wooden_display_shelves_01", V(3.05, RY - 0.22, 0), 90 * DEG, 1.0)
gltf("book_encyclopedia_set_01", V(2.8, RY - 0.25, 0.86), 0, 0.85)
gltf("ceramic_vase_03", V(2.9, RY - 0.22, 1.56), 0, 0.5)
gltf("standing_picture_frame_01", V(3.3, RY - 0.25, 0.48), -0.3, 1.0)
gltf("hanging_picture_frame_02", V(1.75, RY - 0.005, 1.9), 0, 0.9)
gltf("hanging_picture_frame_03", V(0.75, RY - 0.005, 1.75), 0, 1.0)
gltf("wall_clock", V(-1.1, RY - 0.005, 2.4), 0, 0.8)
gltf("hanging_picture_frame_01", V(-RX + 0.005, 1.95, 1.6), -90 * DEG, 0.7)

# ------------------------------------------------------------------ story props: tees, the heat press, transfer sheets, mailers
def cardboard():
    m, nt, b = principled("kraft"); N_, L = nt.nodes, nt.links
    n = N_.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = 180; n.inputs["Detail"].default_value = 8
    ramp = N_.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].color = hexc("#a9784a"); ramp.color_ramp.elements[1].color = hexc("#c69a6a")
    L.new(n.outputs["Fac"], ramp.inputs["Fac"]); L.new(ramp.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.85
    bp = N_.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.15; L.new(n.outputs["Fac"], bp.inputs["Height"]); L.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m
M["kraft"] = cardboard()
BRAND = "NOVA"

def print_png(path, ink=(18, 18, 22), accent=(184, 143, 88), w=1024, h=1024, mirror=False):
    """the NOVA chest print: a heavy wordmark under a thin orbit with a star"""
    from PIL import Image, ImageDraw, ImageFont
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT_B, 250)
    d.ellipse((150, 300, w - 150, 600), outline=accent + (255,), width=16)
    d.text((w / 2, 470), BRAND, font=f, fill=ink + (255,), anchor="mm")
    sx, sy = w - 230, 330
    d.polygon([(sx, sy - 46), (sx + 12, sy - 12), (sx + 46, sy), (sx + 12, sy + 12), (sx, sy + 46), (sx - 12, sy + 12), (sx - 46, sy), (sx - 12, sy - 12)], fill=accent + (255,))
    d.text((w / 2, 690), "STUDIO · EST. 2026", font=ImageFont.truetype(FONT, 60), fill=ink + (255,), anchor="mm")
    if mirror: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    im.save(path); return path
PRINT_DARK = print_png(os.path.join(TMP, "print-dark.png"))
PRINT_LIGHT = print_png(os.path.join(TMP, "print-light.png"), ink=(240, 236, 228))
PRINT_SHEET = print_png(os.path.join(TMP, "print-sheet.png"), mirror=True)

def tee_mat(name, color, printed, light_ink=False):
    """cotton jersey; the print sits on the chest through planar UVs and a PRINT value (0 → 1 when it is pressed)"""
    m = pbr(name, "cotton_jersey", scale=8, tint=color, normal=0.6, sat=0.0); nt = m.node_tree; N_, L = nt.nodes, nt.links; b = nt.nodes["Principled BSDF"]
    b.inputs["Sheen Weight"].default_value = 0.2; b.inputs["Sheen Roughness"].default_value = 0.5
    if not printed: return m
    src = b.inputs["Base Color"].links[0].from_socket
    uv = N_.new("ShaderNodeUVMap"); t = N_.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(PRINT_LIGHT if light_ink else PRINT_DARK, check_existing=True)
    t.extension = "CLIP"; L.new(uv.outputs["UV"], t.inputs["Vector"])
    pv = N_.new("ShaderNodeValue"); pv.name = "PRINT"; pv.outputs[0].default_value = 1.0
    mul = N_.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; L.new(t.outputs["Alpha"], mul.inputs[0]); L.new(pv.outputs[0], mul.inputs[1])
    mx = N_.new("ShaderNodeMix"); mx.data_type = "RGBA"; L.new(mul.outputs[0], mx.inputs[0]); L.new(src, mx.inputs[6]); L.new(t.outputs["Color"], mx.inputs[7])
    L.new(mx.outputs[2], b.inputs["Base Color"])
    return m

TEE_OUT = [(0.0, 0.0), (0.09, 0.0), (0.26, 0.0), (0.26, 0.47), (0.39, 0.38), (0.45, 0.47), (0.27, 0.66), (0.1, 0.7), (0.0, 0.64)]   # half outline (x ≥ 0), metres, hem at y = 0
def tee_mesh(name, mat, thick=0.008):
    pts = TEE_OUT + [(-x, y) for (x, y) in reversed(TEE_OUT[1:-1])]
    bm = bmesh.new(); vs = [bm.verts.new((x, y - 0.35, 0)) for (x, y) in pts]
    bm.faces.new(vs); bmesh.ops.triangulate(bm, faces=bm.faces[:], ngon_method="EAR_CLIP")
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    uv = me.uv_layers.new()
    for li, l in enumerate(me.loops):          # the print: 0.3 m wide, centred 0.17 m below the collar
        v = me.vertices[l.vertex_index].co; uv.data[li].uv = (v.x / 0.3 + 0.5, (v.y - 0.12) / 0.3 + 0.5)
    ob = link(bpy.data.objects.new(name, me)); me.materials.append(mat)
    s = ob.modifiers.new("sol", "SOLIDIFY"); s.thickness = thick; s.offset = 0
    sm = ob.modifiers.new("bv", "BEVEL"); sm.width = 0.003; sm.segments = 2
    for p in me.polygons: p.use_smooth = True
    return ob

def folded(name, mat_body, light_ink=False):
    """a folded tee: soft block with the print's centre showing on top"""
    root = empty(name)
    b = block(name + "B", (0.27, 0.22, 0.03), V(0, 0, 0.015), mat_body, 0.012); b.parent = root
    dec = M.get("decal" + str(light_ink))
    if not dec:
        dec = image_mat("decal" + str(light_ink), PRINT_LIGHT if light_ink else PRINT_DARK, 0.8, alpha=True); M["decal" + str(light_ink)] = dec
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5); me = bpy.data.meshes.new(name + "D"); bm.to_mesh(me); bm.free()
    uv = me.uv_layers.new()
    for li, l in enumerate(me.loops): v = me.vertices[l.vertex_index].co; uv.data[li].uv = (v.x + 0.5, v.y + 0.5)
    d = link(bpy.data.objects.new(name + "D", me)); me.materials.append(dec); d.scale = (0.22, 0.22, 1); d.location = V(0, 0.01, 0.0305); d.parent = root
    return root

TEE_COLS = [("#efebe4", False), ("#1d1d21", True), ("#cdbba0", False), ("#efebe4", False), ("#1d1d21", True), ("#3f443c", True), ("#efebe4", False)]
TM = {}
def tmat(i, printed=True):
    c, light = TEE_COLS[i % len(TEE_COLS)]; k = (c, printed)
    if k not in TM: TM[k] = tee_mat(f"tee{c}{printed}", c, printed, light)
    return TM[k]

# the tee on the press: one blank whose print appears when the transfer is peeled
PRESS_TEE_M = tee_mat("pressTee", "#efebe4", True); PRESS_TEE_M.node_tree.nodes["PRINT"].outputs[0].default_value = 0.0
press_tee = tee_mesh("pressTee", PRESS_TEE_M)
# transfer sheet: a paper carrier with the mirrored print
sheet_m = image_mat("sheet", PRINT_SHEET, 0.5); nt = sheet_m.node_tree; bsdf = nt.nodes["Principled BSDF"]
mixw = nt.nodes.new("ShaderNodeMix"); mixw.data_type = "RGBA"; nt.links.new(nt.nodes["IMG"].outputs["Alpha"], mixw.inputs[0]); mixw.inputs[6].default_value = hexc("#f4f1ea")
nt.links.new(nt.nodes["IMG"].outputs["Color"], mixw.inputs[7]); nt.links.new(mixw.outputs[2], bsdf.inputs["Base Color"])
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5); me = bpy.data.meshes.new("sheet"); bm.to_mesh(me); bm.free()
uv = me.uv_layers.new()
for li, l in enumerate(me.loops): v = me.vertices[l.vertex_index].co; uv.data[li].uv = (v.x + 0.5, v.y + 0.5)
sheet = link(bpy.data.objects.new("sheet", me)); me.materials.append(sheet_m); sheet.scale = (0.32, 0.32, 1)
block("sheetStack", (0.32, 0.32, 0.012), V(-0.5, RY - 0.36, 0.906), flat("sheets", "#f4f1ea", 0.6), 0.002, 0.1)
# blank tees, folded, waiting on the counter
blank_pile = empty("blankPile", V(-1.72, RY - 0.34, 0.9))
for k in range(5):
    f_ = folded(f"blank{k}", jersey("#efebe4")); f_.parent = blank_pile; f_.location = V(0, 0, k * 0.03); f_.rotation_euler = (0, 0, (k % 2) * 0.05)
    for c in f_.children:
        if c.name.endswith("D"): c.hide_render = True

# the heat press (clamshell): base, padded lower platen, rear column, swing arm with the hot upper platen and handle
PX, PY = -1.1, RY - 0.3
PR_TOP = 0.9
block("prBase", (0.34, 0.52, 0.07), V(PX, PY, PR_TOP + 0.035), flat("prBody", "#26272b", 0.42, 0.2), 0.012)
block("prLower", (0.4, 0.46, 0.035), V(PX, PY - 0.02, PR_TOP + 0.0875), flat("prPad", "#b9b8b2", 0.75), 0.01)
block("prColumn", (0.09, 0.09, 0.28), V(PX, PY + 0.26, PR_TOP + 0.17), flat("prBody2", "#26272b", 0.42, 0.2), 0.01)
PR_IND = emission("prInd", "#ff8a3a", 0.0)
cyl("prIndicator", 0.012, 0.01, V(PX + 0.12, PY - 0.262, PR_TOP + 0.05), PR_IND, 16).rotation_euler = (math.pi / 2, 0, 0)
PRESS_H = empty("pressHinge", V(PX, PY + 0.26, PR_TOP + 0.32))
for o in (block("prArm", (0.07, 0.5, 0.05), V(0, -0.25, 0), flat("prBody3", "#26272b", 0.42, 0.2), 0.012),
          block("prPost", (0.05, 0.05, 0.13), V(0, -0.26, -0.09), M["black"], 0.006),
          block("prUpper", (0.41, 0.47, 0.05), V(0, -0.28, -0.175), flat("prAlu", "#c3c5c8", 0.3, 1.0), 0.008),
          block("prHandleBar", (0.035, 0.32, 0.03), V(0, -0.64, 0.0), M["black"], 0.008)):
    o.parent = PRESS_H
grip = cyl("prGrip", 0.02, 0.26, V(0, -0.8, 0.0), flat("grip", "#151517", 0.6), 24); grip.rotation_euler = (0, math.pi / 2, 0); grip.parent = PRESS_H
PLATEN = V(PX, PY - 0.03, PR_TOP + 0.107)        # where the tee lies, chest centred
def handle_world(angle):
    return PRESS_H.location + Matrix.Rotation(angle, 3, "X") @ V(0, -0.8, 0.0)

# the worktable (arrives when the studio moves to packing), the mailers, and the folded stack
work = gltf("wooden_table_02", V(1.4, -0.55, 0), 0, 1.0); upd = lambda: bpy.context.view_layer.update(); upd()
def bbox(root):
    pts = [o.matrix_world @ Vector(c) for o in root.children_recursive if o.type == "MESH" for c in o.bound_box]
    return V(min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)), V(max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))
wt0, wt1 = bbox(work); WT_TOP = wt1.z
FOLD_AT = V(1.12, -0.62, WT_TOP + 0.001)
FSTACK = V(1.68, -0.42, WT_TOP + 0.001)
ASM = V(1.05, -0.4, WT_TOP + 0.001)
MSTACK = [V(1.66 + (i % 2) * 0.0, -0.78, WT_TOP + 0.001 + i * 0.022) for i in range(4)]
fold_tee = tee_mesh("foldTee", tmat(1)); fold_root = empty("foldRoot"); fold_tee.parent = fold_root
FSTK = []
for k in range(6):
    f_ = folded(f"fs{k}", tmat(k % 3 + 1, False) if False else jersey(TEE_COLS[(k + 1) % 7][0]), TEE_COLS[(k + 1) % 7][1]); f_.location = FSTACK + V(0, 0, k * 0.031); f_.rotation_euler = (0, 0, (k % 2) * 0.04); FSTK.append(f_)
PK = folded("pkTee", jersey("#1d1d21"), True)
MAILER_M = flat("mailer", "#141416", 0.38); MAILER_M.node_tree.nodes["Principled BSDF"].inputs["Coat Weight"].default_value = 0.3
def label_png(path, w=512, h=256):
    from PIL import Image, ImageDraw, ImageFont
    im = Image.new("RGB", (w, h), (244, 241, 234)); d = ImageDraw.Draw(im)
    d.text((w / 2, h / 2 - 14), BRAND, font=ImageFont.truetype(FONT_B, 104), fill=(18, 18, 22), anchor="mm")
    d.text((w / 2, h / 2 + 70), "nova.example", font=ImageFont.truetype(FONT, 26), fill=(18, 18, 22), anchor="mm")
    im.save(path); return path
MLABEL = image_mat("mlabel", label_png(os.path.join(TMP, "mlabel.png")), 0.7)
MAILERS = []
for i in range(4):
    root = empty(f"mailer{i}")
    body = block(f"mb{i}", (0.34, 0.27, 0.02), V(0, 0, 0.01), MAILER_M, 0.008); body.parent = root
    lab = block(f"ml{i}", (0.16, 0.08, 0.002), V(0.05, -0.04, 0.0205), MLABEL, 0); lab.parent = root
    MAILERS.append(dict(root=root, label=lab))
SLOTS = [458 + i * 11.5 for i in range(4)]

# the rack: printed tees on hangers, one per slot
HANG = []
for i in range(7):
    root = empty(f"hang{i}", V(RACK_X0 + 0.13 + i * 0.135, RACK_Y, RACK_Z))
    t = tee_mesh(f"rt{i}", tmat(i), 0.006); t.parent = root; t.rotation_euler = (math.pi / 2, 0, math.pi / 2); t.location = V(0, 0, -0.42)
    hk = cyl(f"hook{i}", 0.004, 0.06, V(0, 0, -0.03), M["black"], 8); hk.parent = root
    bar = cyl(f"hbar{i}", 0.005, 0.4, V(0, 0, -0.07), M["black"], 8); bar.rotation_euler = (math.pi / 2, 0, 0); bar.parent = root
    HANG.append(root)
HANG_T = [292, 312, 318, 324, 330, 336, 342]       # when each one is hung

# the dress form by the window: wears the finished tee once the store is live
def dress_form():
    root = empty("dressForm", V(-3.0, -1.0, 0))
    prof = [(0.0, 1.5), (0.06, 1.5), (0.075, 1.44), (0.17, 1.38), (0.19, 1.25), (0.165, 1.08), (0.15, 0.98), (0.17, 0.86), (0.0, 0.84)]
    bm = bmesh.new(); vs = [bm.verts.new((r, 0, z)) for (r, z) in prof]
    for a, b in zip(vs, vs[1:]): bm.edges.new((a, b))
    bmesh.ops.spin(bm, geom=bm.verts[:] + bm.edges[:], cent=(0, 0, 0), axis=(0, 0, 1), angle=2 * math.pi, steps=40, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    for v in bm.verts: v.co.y *= 0.72
    me = bpy.data.meshes.new("form"); bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new("form", me)); me.materials.append(flat("formLinen", "#d9cfc1", 0.9)); ob.parent = root
    for p in me.polygons: p.use_smooth = True
    cyl("formPole", 0.012, 0.84, V(0, 0, 0.42), M["oak"], 16).parent = root
    for k in range(3):
        a = k * 2.094; leg = cyl("formLeg", 0.01, 0.4, V(math.cos(a) * 0.12, math.sin(a) * 0.12, 0.13), M["oak"], 12); leg.rotation_euler = (math.sin(a) * 0.65, -math.cos(a) * 0.65, 0); leg.parent = root
    tee = tee_mesh("formTee", tmat(1), 0.004); tee.parent = root; tee.rotation_euler = (math.pi / 2, 0, 0); tee.location = V(0, -0.142, 1.18); tee.scale = (0.86, 0.86, 0.86)
    root.rotation_euler = (0, 0, 0.75)
    return root, tee
FORM, FORM_TEE = dress_form()

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
        elif n == "top": m = fabric_mat("tee", "cotton_jersey", 9, "#1f1f23", 1.0, 0.5)
        elif n == "trousers": m = fabric_mat("trousers", "rough_linen", 7, "#cdbfae", 1.0, 0.3)
        elif n == "shoes": m = pbr("shoes", "leather_white", scale=12, tint="#f1efe9", rough_mul=0.9)
        elif n == "hair":
            m, nt, b = principled("hair"); b.inputs["Base Color"].default_value = hexc("#2a1810"); b.inputs["Roughness"].default_value = 0.5
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


# ------------------------------------------------------------------ UI cards: frosted glass, ink type, one brass accent (the site's own design system)
INK = (24, 22, 26); MUTE = (24, 22, 26, 150); BRASS = (184, 143, 88); PAPER = (250, 247, 242); NIGHT = (16, 16, 19)
def card_png(key, t, path):
    from PIL import Image, ImageDraw, ImageFont
    sizes = {"design": (980, 640), "browse": (1100, 760), "build": (900, 720), "store": (1700, 1060), "orders": (900, 960)}
    w, h = sizes[key]; im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    F = lambda s: ImageFont.truetype(FONT, s); FB = lambda s: ImageFont.truetype(FONT_B, s)
    def glass(x0, y0, x1, y1, r=40, a=226):
        d.rounded_rectangle((x0, y0, x1, y1), radius=r, fill=PAPER + (a,), outline=(255, 255, 255, 250), width=4)
    def tick(x, y, s, a=255):
        d.ellipse((x - s, y - s, x + s, y + s), fill=BRASS + (a,)); d.line((x - s * 0.45, y, x - s * 0.1, y + s * 0.38, x + s * 0.5, y - s * 0.4), fill=(255, 255, 255, a), width=max(3, int(s / 5)))
    def tee(cx, cy, s, col, ink, art, a=255):
        pts = TEE_OUT + [(-x, y) for (x, y) in reversed(TEE_OUT[1:-1])]
        d.polygon([(cx + x * s, cy - (y - 0.35) * s) for (x, y) in pts], fill=col + (a,))
        if art == 0:      # wordmark under an orbit with a star (the one she picks)
            d.ellipse((cx - 0.14 * s, cy - 0.2 * s, cx + 0.14 * s, cy - 0.07 * s), outline=BRASS + (a,), width=max(2, int(s / 90)))
            d.text((cx, cy - 0.13 * s), BRAND, font=FB(int(0.085 * s)), fill=ink + (a,), anchor="mm")
        elif art == 1:    # three stacked bars
            for k in range(3): d.rectangle((cx - 0.12 * s, cy - 0.2 * s + k * 0.05 * s, cx + 0.12 * s, cy - 0.17 * s + k * 0.05 * s), fill=ink + (a,))
        else:             # a big star
            r = 0.1 * s; x, y = cx, cy - 0.12 * s
            d.polygon([(x, y - r), (x + r * 0.25, y - r * 0.25), (x + r, y), (x + r * 0.25, y + r * 0.25), (x, y + r), (x - r * 0.25, y + r * 0.25), (x - r, y), (x - r * 0.25, y - r * 0.25)], fill=ink + (a,))
    if key == "design":
        glass(10, 10, w - 10, h - 10)
        d.text((50, 70), "NOVA · first drop", font=F(40), fill=INK + (255,), anchor="lm")
        pick = smooth(0.55, 0.7, t)
        for i in range(3):
            k = smooth(i * 0.12, i * 0.12 + 0.2, t)
            if k <= 0: continue
            x = 60 + i * 300; on = pick if i == 0 else 0
            d.rounded_rectangle((x, 130, x + 260, h - 60), radius=28, fill=(255, 255, 255, int(235 * k)), outline=BRASS + (int(255 * on),), width=int(2 + 8 * on))
            tee(x + 130, 330, 300, (239, 235, 228) if i != 1 else (35, 35, 40), (18, 18, 22) if i != 1 else (240, 236, 228), i, int(255 * k * (1 - 0.55 * pick * (i != 0))))
            if on > 0.5: tick(x + 220, 175, 26)
    elif key == "browse":
        glass(10, 10, w - 10, h - 10, r=30, a=244)
        d.rounded_rectangle((30, 30, w - 30, 86), radius=22, fill=(255, 255, 255, 255)); d.text((w // 2, 58), "chargix.store", font=F(28), fill=MUTE, anchor="mm")
        for i in range(3): d.ellipse((50 + i * 34, 48, 70 + i * 34, 68), fill=(205, 190, 172, 255))
        if t < 0.3:
            d.rectangle((30, 100, w - 30, h - 30), fill=NIGHT + (255,)); d.text((80, 160), "CHARGIX", font=F(36), fill=(242, 236, 226, 255), anchor="lm")
            d.text((80, 330), "Every business starts", font=F(70), fill=(242, 236, 226, 255), anchor="lm"); d.text((80, 420), "in a small room.", font=F(70), fill=(214, 176, 124, 255), anchor="lm")
            d.rounded_rectangle((80, 520, 400, 600), radius=40, fill=(242, 166, 90, 255)); d.text((240, 560), "See packages", font=F(32), fill=NIGHT + (255,), anchor="mm")
        elif t < 0.78:
            d.text((70, 150), "Packages", font=F(54), fill=INK + (255,), anchor="lm")
            pick = smooth(0.58, 0.66, t)
            for i, (pr, nm, nt3) in enumerate((("$750", "Essential Website", "No 3D"), ("$1,650", "3D Experience", "Premium 3D"), ("$2,750", "Business Launch", "3D + full launch"))):
                x = 60 + i * 335; on = pick if i == 2 else 0
                d.rounded_rectangle((x, 220, x + 310, 560), radius=28, fill=(255, 255, 255, 240), outline=BRASS + (int(120 + 135 * on),), width=int(3 + 7 * on))
                d.text((x + 30, 300), pr, font=F(64), fill=INK + (255,), anchor="lm"); d.text((x + 30, 390), nm, font=F(32), fill=INK + (255,), anchor="lm"); d.text((x + 30, 440), nt3, font=F(26), fill=MUTE, anchor="lm")
                if on > 0.5: tick(x + 260, 270, 30)
            if t > 0.68:
                d.rounded_rectangle((w - 470, h - 150, w - 60, h - 70), radius=40, fill=INK + (255,)); d.text((w - 265, h - 110), "Buy now · $2,750", font=F(34), fill=(242, 236, 226, 255), anchor="mm")
        else:
            tick(w // 2, 260, 80)
            d.text((w // 2, 420), "Project form sent", font=F(54), fill=INK + (255,), anchor="mm")
            d.text((w // 2, 490), "CHARGIX starts building NOVA", font=F(34), fill=MUTE, anchor="mm")
            d.text((w // 2, h - 80), "Story demo · not a real order", font=F(26), fill=MUTE, anchor="mm")
    elif key == "build":
        glass(10, 10, w - 10, h - 10)
        d.text((60, 90), "NOVA · launch", font=F(48), fill=INK + (255,), anchor="lm")
        steps = ("Brand and logo", "Store and products", "3D tee showroom", "Size guide pages", "Launch email")
        for i, s in enumerate(steps):
            k = smooth(i / 6, i / 6 + 0.12, t); y = 180 + i * 96
            d.rounded_rectangle((60, y, w - 60, y + 76), radius=18, fill=(255, 255, 255, 200))
            d.text((100, y + 38), s, font=F(36), fill=INK + (255,), anchor="lm")
            if k > 0.05: tick(w - 110, y + 38, 24, int(255 * k))
        d.rounded_rectangle((60, h - 70, w - 60, h - 50), radius=10, fill=(24, 22, 26, 40)); d.rounded_rectangle((60, h - 70, 60 + int((w - 120) * clamp(t)), h - 50), radius=10, fill=BRASS + (255,))
    elif key == "store":
        d.rounded_rectangle((10, 10, w - 10, h - 10), radius=36, fill=NIGHT + (252,), outline=(70, 68, 74, 255), width=4)
        d.rectangle((24, 24, w - 24, 92), fill=(30, 29, 34, 255))
        for i in range(3): d.ellipse((50 + i * 40, 46, 74 + i * 40, 70), fill=(80, 78, 86, 255))
        d.rounded_rectangle((220, 40, w - 220, 76), radius=18, fill=(46, 45, 52, 255)); d.text((w // 2, 58), "nova.example", font=F(26), fill=(200, 196, 190, 255), anchor="mm")
        cr = (240, 236, 228)
        d.text((80, 160), BRAND, font=FB(56), fill=cr + (255,), anchor="lm")
        for i, s in enumerate(("Shop", "Drop 01", "Studio", "Sizes")): d.text((w - 640 + i * 150, 160), s, font=F(30), fill=cr + (190,), anchor="lm")
        k = smooth(0.0, 0.5, t)
        d.text((80, 320), "Printed in a small room.", font=F(76), fill=cr + (int(255 * k),), anchor="lm"); d.text((80, 405), "Worn everywhere.", font=F(76), fill=(214, 176, 124, int(255 * k)), anchor="lm")
        d.rounded_rectangle((80, 470, 380, 550), radius=40, fill=cr + (int(255 * k),)); d.text((230, 510), "Shop Drop 01", font=F(32), fill=NIGHT + (int(255 * k),), anchor="mm")
        bx, by = w - 640, 200
        d.rounded_rectangle((bx, by, bx + 520, by + 380), radius=24, fill=(38, 37, 43, int(255 * k)))
        tee(bx + 260, by + 200, 470, (239, 235, 228), (18, 18, 22), 0, int(255 * k))
        names = (("Orbit Tee · Bone", "$34", (239, 235, 228), (18, 18, 22)), ("Orbit Tee · Black", "$34", (35, 35, 40), (240, 236, 228)),
                 ("Orbit Tee · Sand", "$34", (205, 187, 160), (18, 18, 22)), ("Orbit Tee · Olive", "$36", (63, 68, 60), (240, 236, 228)))
        for i, (nm, pr, col, ink) in enumerate(names):
            kk = smooth(0.35 + i * 0.12, 0.55 + i * 0.12, t)
            if kk <= 0: continue
            x = 80 + i * 395; y = 640
            d.rounded_rectangle((x, y, x + 365, y + 340), radius=20, fill=(38, 37, 43, int(255 * kk)))
            tee(x + 182, y + 120, 300, col, ink, 0, int(255 * kk))
            d.text((x + 24, y + 260), nm, font=F(30), fill=cr + (int(255 * kk),), anchor="lm"); d.text((x + 24, y + 304), pr, font=F(30), fill=cr + (int(200 * kk),), anchor="lm")
        if t > 0.8: d.rounded_rectangle((w - 300, 120, w - 70, 200), radius=40, fill=BRASS + (255,)); d.text((w - 185, 160), "Live", font=F(36), fill=(255, 255, 255, 255), anchor="mm")
    elif key == "orders":
        glass(10, 10, w - 10, h - 10)
        d.text((60, 90), "Demo orders", font=F(56), fill=INK + (255,), anchor="lm"); d.text((60, 150), "sample data for this story", font=F(30), fill=MUTE, anchor="lm")
        rows = ("Orbit Tee · Black · M", "Orbit Tee · Bone · S", "Orbit Tee · Sand · L", "Orbit Tee · Black · XL", "Orbit Tee · Olive · M", "Orbit Tee · Bone · M")
        for i, s in enumerate(rows):
            k = clamp((t * 6.6 - i) * 2.5); packed = t * 6 > i + 0.85
            if k <= 0: continue
            y = 210 + i * 120; d.rounded_rectangle((40, y, w - 40, y + 100), radius=20, fill=(255, 255, 255, int(220 * k)))
            d.text((80, y + 50), f"#N{101 + i}", font=F(32), fill=(24, 22, 26, int(150 * k)), anchor="lm"); d.text((230, y + 50), s, font=F(34), fill=(24, 22, 26, int(255 * k)), anchor="lm")
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
card("design", 0.95, V(1.45, 1.2, 2.05))
card("browse", 1.0, V(0.75, 1.2, 1.85))
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
KLED_L = area("shelfLED", V((KX[0] + KX[1]) / 2, RY - 0.28, 1.6), 1.6, 0, (1.0, 0.78, 0.55), (0, 0, 0), sy=0.06)
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
# a hair bun, carried by the head bone
bun = cyl("bun", 0.05, 0.065, V(0, 0, 0), next(o for o in FIGMESH if o.name == "hair").data.materials[0], 24, r2=0.035, bevel=0.02)
BUN_OFF = Matrix.Translation(V(*[float(x) for x in os.environ.get("CX_BUN", "0,0.1,-0.08").split(",")]))
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
# late night at the desk → the next morning at the press → the afternoon folding → golden hour launch → evening packing
HOURS = [(0, 21.6), (150, 23.4), (162, 23.9), (198, 32.2), (262, 33.2), (306, 34.0), (346, 37.2), (420, 40.4), (456, 42.3), (504, 44.0), (540, 45.6)]
def hour_at(u):
    for (a, ha), (b, hb) in zip(HOURS, HOURS[1:]):
        if u <= b: return lerp(ha, hb, seg(u, a, b))
    return HOURS[-1][1]

# spots (x, y, yaw°); yaw 0 faces -y (the camera side), 90 faces +x, 180 faces +y (back wall), -90 faces the window
DESK = (1.75, 1.47, 180.0); RISE = (1.75, 1.05, 180.0)
PRESS = (PX, 1.5, 180.0); RACK = (-2.72, 1.42, 180.0)
TBL = (1.2, 0.02, 0.0); END = (-1.15, -0.45, -55.0)
P_RISE_PR = [(1.75, 1.05), (0.7, 1.05), (-0.4, 1.38), (PX, 1.5)]
P_PR_RACK = [(PX, 1.5), (-1.9, 1.3), (-2.72, 1.42)]
P_RACK_PR = list(reversed(P_PR_RACK))
P_PR_TBL = [(PX, 1.5), (-0.5, 0.95), (0.5, 0.3), (1.2, 0.02)]
P_TBL_END = [(1.2, 0.02), (0.3, -0.35), (-1.15, -0.45)]
BLANK_AT = V(-1.72, RY - 0.34, 0.9 + 5 * 0.03)
SHEET_AT = V(-0.5, RY - 0.36, 0.92)

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
    b = dict(base or POSES_W["stand"]); b["face"] = dict(b["face"]); ph = s / 1.1
    def foot(f):
        f = f % 1.0
        if f < 0.5: return 0.28 - f / 0.5 * 0.56, 0.0
        g = (f - 0.5) / 0.5; return -0.28 + 0.56 * ease(g), 0.1 * math.sin(math.pi * g)
    zl, yl = foot(ph); zr, yr = foot(ph + 0.5)
    b["lf"] = (0.09, 0.06 + yl * amp, 0.02 + zl * amp); b["rf"] = (-0.09, 0.06 + yr * amp, 0.02 + zr * amp)
    b["lk"] = (0.11, 0.5, 1); b["rk"] = (-0.11, 0.5, 1)
    sw = math.sin(ph * 2 * math.pi) * amp
    if base is None:
        b["lh"] = (0.2, 0.82, 0.03 - 0.18 * sw); b["rh"] = (-0.2, 0.82, 0.03 + 0.18 * sw)
    b["hip"] = (0, -0.02 * amp * abs(math.cos(ph * 2 * math.pi)), 0); b["lean"] = b["lean"] + 4 * amp; b["twist"] = b.get("twist", 0) + 5 * sw
    return b

POSES_W = {
    "stand": pose(STAND, lh=(0.2, 0.82, 0.03), rh=(-0.2, 0.82, 0.03), face=dict(smile=0.2)),
    "sitKnees": pose(SIT, lean=6, lh=(0.16, 0.56, 0.34), rh=(-0.16, 0.56, 0.34), le=(0.5, 0.6, -0.2), re=(-0.5, 0.6, -0.2), face=dict(smile=0.15)),
    "carry": pose(STAND, lh=(0.17, 0.98, 0.34), rh=(-0.17, 0.98, 0.34), le=(0.5, 0.8, -0.3), re=(-0.5, 0.8, -0.3), cl=0.7, cr=0.7, look=(0, 1.5, 2), face=dict(focus=0.15, smile=0.25)),
    "lean": pose(STAND, lean=22, look=(0, 0.9, 0.9), face=dict(focus=0.2, smile=0.25)),
    "admire": pose(STAND, lh=(0.12, 1.0, 0.25), rh=(-0.14, 1.02, 0.24), le=(0.5, 0.7, -0.3), re=(-0.5, 0.7, -0.3), cl=0.6, cr=0.6, face=dict(smile=0.8, brow=0.3)),
    "deskSit": pose(SIT, lean=10, lh=(0.16, 0.8, 0.46), rh=(-0.2, 0.8, 0.5), le=(0.6, 0.5, 0), re=(-0.6, 0.5, 0), look=(0, 1.15, 2), cl=0.4, cr=0.5, face=dict(focus=0.35, press=0.15)),
    "deskBack": pose(SIT, lean=-8, lh=(0.12, 0.95, 0.12), rh=(-0.06, 1.38, 0.12), re=(-0.4, 1.0, 0.4), cr=0.6, le=(0.6, 0.7, -0.2), look=(0.2, 1.5, 2), face=dict(worry=0.2, press=0.25)),
    "hangUp": pose(STAND, rh=(-0.05, 1.62, 0.42), re=(-0.6, 1.3, 0.1), lh=(0.14, 1.25, 0.4), le=(0.6, 1.0, 0.1), cl=0.6, cr=0.7, look=(0, 1.55, 2), face=dict(smile=0.4)),
}
POSES_W["sitThink"] = POSES["sitThink"]

def to_char(w, spot):
    x, y, yaw = spot; c, s_ = math.cos(-yaw * DEG), math.sin(-yaw * DEG); dx, dy = w.x - x, w.y - y
    lx, ly = dx * c - dy * s_, dx * s_ + dy * c
    return (lx, w.z, -ly)
def face_to(spot, w): return math.degrees(math.atan2(w.x - spot[0], -(w.y - spot[1])))
def lerp3(a, b, t): return tuple(lerp(x, y, t) for x, y in zip(a, b))

OPEN = -62 * DEG
def press_angle(u):
    """upper platen: open, pulled shut 228-236, held, opened 248-254; two quicker cycles during the time-lapse"""
    c = ease(seg(u, 228, 236)) - ease(seg(u, 248, 254))
    for a in (310, 322):
        c += ease(seg(u, a, a + 3)) - ease(seg(u, a + 7, a + 10))
    return OPEN * (1 - clamp(c))

def fold_state(u):
    """folding at the table, 4 tees of 15 u each from 362: → visible, sx, sy (fold progress), loc"""
    k = (u - 362) / 15
    if u < 362 or k >= 4: return False, 1, 1, FOLD_AT, int(clamp(k, 0, 4))
    i, f = int(k), k - int(k)
    sx = 1 - 0.48 * ease(seg(f, 0.15, 0.45)); sy = 1 - 0.55 * ease(seg(f, 0.45, 0.72))
    loc = FOLD_AT.lerp(FSTACK + V(0, 0, (2 + i) * 0.031), ease(seg(f, 0.78, 1.0)))
    return f < 0.78, sx, sy, loc, i

def mailer_state(i, u):
    S = SLOTS[i]
    if u < S: return False, ASM, 0, 0
    v = clamp((u - S) / 11.5)
    appear = ease(seg(v, 0, 0.15)); sealed = ease(seg(v, 0.55, 0.7))
    k = ease(seg(v, 0.72, 1.0)); loc = ASM.lerp(MSTACK[i], k) + V(0, 0, math.sin(k * math.pi) * 0.12)
    return True, loc, appear, sealed

def figure_at(u):
    """→ spot, pose dict, hands, carry"""
    H = {}
    def P(name): return dict(POSES_W.get(name) or POSES[name])
    def at_mon(pz, sp): pz["look"] = to_char(V(1.8, RY - 0.2, 1.12), sp); return pz
    if u < 60:     # designing at the desk: stylus on the tablet, glance up at the screen
        pz = P("deskSit"); a = u * 0.9; tab = V(1.35, RY - 0.5, 0.82)
        pz["rh"] = to_char(tab + V(math.sin(a) * 0.05, math.cos(a * 0.7) * 0.03, 0.03), DESK)
        if 26 < u < 40: pz["look"] = to_char(tab, DESK)
        else: at_mon(pz, DESK)
        return DESK, pz, H, None
    if u < 72:
        t = ease(seg(u, 60, 72)); pz = mixpose(P("deskSit"), P("deskBack"), t); at_mon(pz, DESK); return DESK, pz, H, None
    if u < 104:
        pz = P("deskBack"); at_mon(pz, DESK); return DESK, pz, H, None
    if u < 150:    # forward to the keyboard: picks the package, sends the form
        t = ease(seg(u, 104, 112)); pz = mixpose(P("deskBack"), P("deskSit"), t)
        kb = V(1.8, RY - 0.48, 0.82); a = u * 2.1
        pz["lh"] = to_char(kb + V(0.1, math.sin(a) * 0.02, 0.02), DESK); pz["rh"] = to_char(kb + V(-0.1, math.cos(a * 1.3) * 0.02, 0.02), DESK)
        if u > 136: pz["face"] = dict(pz["face"], smile=0.6 * ease(seg(u, 136, 142)), brow=0.3)
        at_mon(pz, DESK); return DESK, pz, H, None
    if u < 170:    # stands, pushes the chair back
        t = ease(seg(u, 150, 170)); lean = math.sin(t * math.pi) * 26
        pz = mixpose(POSES_W["sitKnees"], POSES_W["stand"], t); pz["lean"] += lean
        y = lerp(DESK[1], RISE[1], t); return (DESK[0], y, 180.0), pz, H, None
    if u < 198:
        spot, s, amp = walk(u, P_RISE_PR, 170, 198, 180.0, 180.0); return spot, walk_pose(s, amp), H, None
    if u < 214:    # takes a blank from the pile, lays it on the platen
        if u < 204:
            t = ease(seg(u, 198, 204)); pz = mixpose(POSES_W["stand"], POSES["counter"], t)
            w = BLANK_AT + V(0, -0.05, 0.02)
            pz["lh"] = lerp3(POSES_W["stand"]["lh"], to_char(w + V(0.1, 0, 0), PRESS), t); pz["rh"] = lerp3(POSES_W["stand"]["rh"], to_char(w + V(-0.1, 0, 0), PRESS), t)
            pz["look"] = to_char(BLANK_AT, PRESS); pz["twist"] = -18 * t; return PRESS, pz, H, None
        t = ease(seg(u, 204, 214)); pz = P("counter"); w = BLANK_AT.lerp(PLATEN + V(0, -0.1, 0.03), t) + V(0, 0, math.sin(t * math.pi) * 0.12)
        pz["lh"] = to_char(w + V(0.16, -0.12, 0), PRESS); pz["rh"] = to_char(w + V(-0.16, -0.12, 0), PRESS); pz["look"] = to_char(w, PRESS); pz["twist"] = -18 * (1 - t)
        return PRESS, pz, H, ("tee", w, t)
    if u < 228:    # smooths it, places the transfer sheet
        pz = P("counter")
        if u < 220:
            a = u * 1.5; pz["lh"] = to_char(PLATEN + V(0.12 + math.sin(a) * 0.05, -0.05, 0.02), PRESS); pz["rh"] = to_char(PLATEN + V(-0.12 - math.sin(a) * 0.05, -0.05, 0.02), PRESS)
            pz["look"] = to_char(PLATEN, PRESS); return PRESS, pz, H, None
        t = ease(seg(u, 220, 228)); w = SHEET_AT.lerp(PLATEN + V(0, 0.02, 0.012), t) + V(0, 0, math.sin(t * math.pi) * 0.1)
        pz["rh"] = to_char(w + V(-0.1, -0.1, 0.01), PRESS); pz["lh"] = to_char(w + V(0.1, -0.1, 0.01), PRESS); pz["look"] = to_char(w, PRESS); pz["twist"] = 14 * (1 - t)
        return PRESS, pz, H, ("sheet", w)
    if u < 256:    # pulls the handle down, holds, lifts it
        pz = P("counter"); hw = handle_world(press_angle(u))
        pz["lh"] = to_char(hw + V(0.07, 0, 0.02), PRESS); pz["rh"] = to_char(hw + V(-0.07, 0, 0.02), PRESS); pz["look"] = to_char(PLATEN, PRESS)
        pz["lean"] = 12 + 12 * (1 - press_angle(u) / OPEN)
        if 236 <= u < 248: pz["face"] = dict(pz["face"], focus=0.1, smile=0.35); pz["look"] = to_char(V(PX + 0.12, PY - 0.26, PR_TOP + 0.05), PRESS)
        return PRESS, pz, H, None
    if u < 266:    # peels the transfer: the print is on the shirt
        t = ease(seg(u, 256, 264)); pz = P("counter")
        w = (PLATEN + V(0, 0.02, 0.012)).lerp(PLATEN + V(0.25, 0.1, 0.32), t)
        pz["rh"] = to_char(w + V(-0.1, -0.12, 0), PRESS); pz["look"] = to_char(PLATEN, PRESS); pz["face"] = dict(pz["face"], smile=0.7 * t, brow=0.35 * t)
        return PRESS, pz, H, ("peel", w, t)
    if u < 274:    # lifts the printed tee
        t = ease(seg(u, 266, 274)); pz = mixpose(POSES["counter"], POSES_W["carry"], t)
        w = (PLATEN + V(0, -0.1, 0.03)).lerp(T_spot(PRESS, POSES_W["carry"]), t)
        pz["lh"] = to_char(w + V(0.16, 0, 0.05), PRESS); pz["rh"] = to_char(w + V(-0.16, 0, 0.05), PRESS)
        return PRESS, pz, H, ("teeUp", None, t)
    if u < 288:
        spot, s, amp = walk(u, P_PR_RACK, 274, 288, 180.0, 180.0); return spot, walk_pose(s, amp, POSES_W["carry"]), H, ("teeUp", None, 1)
    if u < 296:    # hangs it on the rack
        t = ease(seg(u, 288, 294)); pz = mixpose(POSES_W["carry"], POSES_W["hangUp"], t); pz["look"] = to_char(HANG[0].location + V(0, 0, -0.25), RACK)
        return RACK, pz, H, ("teeUp", None, 1) if u < 292 else None
    if u < 306:
        spot, s, amp = walk(u, P_RACK_PR, 296, 306, 180.0, 180.0); return spot, walk_pose(s, amp), H, None
    if u < 340:    # the time-lapse: tee after tee through the press
        pz = P("counter"); hw = handle_world(press_angle(u)); ang = press_angle(u) / OPEN
        if ang < 0.98:
            pz["lh"] = to_char(hw + V(0.07, 0, 0.02), PRESS); pz["rh"] = to_char(hw + V(-0.07, 0, 0.02), PRESS)
        else:
            a = u * 1.8; pz["lh"] = to_char(PLATEN + V(0.12 + math.sin(a) * 0.06, -0.08, 0.03), PRESS); pz["rh"] = to_char(PLATEN + V(-0.12, -0.08 + math.cos(a) * 0.05, 0.03), PRESS)
        pz["look"] = to_char(PLATEN, PRESS); return PRESS, pz, H, None
    if u < 362:
        spot, s, amp = walk(u, P_PR_TBL, 340, 362, 180.0, 0.0); return spot, walk_pose(s, amp), H, None
    if u < 422:    # folding: sleeves in, hem up, onto the stack
        vis, sx, sy, loc, i = fold_state(u); pz = P("lean"); pz["lean"] = 24
        k = (u - 362) / 15 % 1.0
        if k < 0.45: pz["lh"] = to_char(FOLD_AT + V(0.24 * sx, 0, 0.04), TBL); pz["rh"] = to_char(FOLD_AT + V(-0.24 * sx, 0, 0.04), TBL)
        elif k < 0.78: y_ = -0.3 * sy; pz["lh"] = to_char(FOLD_AT + V(0.12, y_, 0.05), TBL); pz["rh"] = to_char(FOLD_AT + V(-0.12, y_, 0.05), TBL)
        else: pz["lh"] = to_char(loc + V(0.12, 0, 0.05), TBL); pz["rh"] = to_char(loc + V(-0.12, 0, 0.05), TBL)
        pz["look"] = to_char(FOLD_AT, TBL); return TBL, pz, H, None
    if u < 458:    # the store goes live: she turns to look at it
        t = ease(seg(u, 422, 434)); yaw = angle_lerp(0.0, face_to(TBL, CARDS["store"]["at"]) * 0.55, t)
        pz = mixpose(POSES_W["lean"], POSES_W["admire"], t); sp = (TBL[0], TBL[1], yaw); pz["look"] = to_char(CARDS["store"]["at"], sp)
        return sp, pz, H, None
    if u < 506:    # packing the demo orders: a folded tee into each mailer
        t = ease(seg(u, 458, 462)); yaw = angle_lerp(face_to(TBL, CARDS["store"]["at"]) * 0.55, 0.0, t); sp = (TBL[0], TBL[1], yaw)
        pz = P("lean"); pz["lean"] = 24; i = min(3, int((u - 458) / 11.5)); vis, loc, ap, se = mailer_state(i, u)
        pz["lh"] = to_char(loc + V(0.16, 0, 0.05), sp); pz["rh"] = to_char(loc + V(-0.16, 0, 0.05), sp); pz["look"] = to_char(loc, sp)
        return sp, pz, H, None
    if u < 526:
        spot, s, amp = walk(u, P_TBL_END, 506, 526, 0.0, END[2]); return spot, walk_pose(s, amp), H, None
    pz = P("admire"); pz["look"] = to_char(V(-3.0, -1.0, 1.25), END); return END, pz, H, None

def T_spot(spot, pz):
    x, y, yaw = spot; c = V((pz["lh"][0] + pz["rh"][0]) / 2, -(pz["lh"][2] + pz["rh"][2]) / 2, (pz["lh"][1] + pz["rh"][1]) / 2)
    r = Matrix.Rotation(yaw * DEG, 3, "Z"); return V(x, y, 0) + r @ c

def mon_img():
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5); me = bpy.data.meshes.new("monImg"); bm.to_mesh(me); bm.free()
    uv = me.uv_layers.new()
    for li, l in enumerate(me.loops): v = me.vertices[l.vertex_index].co; uv.data[li].uv = (v.x + 0.5, v.y + 0.5)
    ob = link(bpy.data.objects.new("monImg", me)); m = image_mat("scr", card_png("design", 1.0, os.path.join(TMP, "scr-design.png")), 0.3, emit=1.4)
    me.materials.append(m); ob.scale = (0.575, 0.345, 1); ob.rotation_euler = (math.pi / 2, 0, 0); ob.location = monScreen.location + V(0, -0.004, 0); return ob, m
MON_IMG, MON_M = mon_img()
SCR = {k: card_png(k, 1.0 if k != "browse" else 0.5, os.path.join(TMP, f"scr-{k}.png")) for k in ("design", "browse", "store")}

CARD_T = {"design": (4, 14, 58, 66, 6, 56), "browse": (68, 76, 144, 152, 72, 146), "build": (352, 362, 414, 422, 352, 416),
          "store": (422, 436, 500, 510, 422, 456), "orders": (454, 462, 506, 514, 458, 506)}

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
    on = clamp(max(dusk * 1.3, night))
    kon = clamp(0.4 + 0.6 * on)
    LAMP.data.energy = on * 95; shade_em.node_tree.nodes["Emission"].inputs["Strength"].default_value = on * 6
    KLED_L.data.energy = kon * 70; KLED.data.materials[0].node_tree.nodes["Emission"].inputs["Strength"].default_value = kon * 12
    DESK_L.data.energy = (0.25 + 0.75 * on) * 26; SHELF_L.data.energy = (0.2 + 0.8 * on) * 26
    SCONCE_L.data.energy = on * 40; SCONCE_EM.node_tree.nodes["Emission"].inputs["Strength"].default_value = on * 8
    TLAMP_L.data.energy = (0.15 + 0.85 * on) * 28; TLAMP_EM.node_tree.nodes["Emission"].inputs["Strength"].default_value = (0.15 + 0.85 * on) * 7
    FILL.data.energy = 95 * (0.2 + 0.8 * day) + 12 * night; FILL.data.color = (1.0, lerp(0.86, 0.93, day), lerp(0.78, 0.86, day))
    PL_NEON.data.energy = 8 + 8 * night
    scene.view_settings.exposure = 0.15 + 0.12 * night + 0.1 * dusk
    # the press: platen angle, the heat light while it is shut
    ang = press_angle(u); PRESS_H.rotation_euler = (ang, 0, 0)
    PR_IND.node_tree.nodes["Emission"].inputs["Strength"].default_value = 4.0 * clamp(1 - ang / OPEN * 1.5)
    # the worktable and its stacks arrive while she is still printing (time-lapse)
    e = ease(seg(u, 314, 334)); show(work, e > 0.01); work.scale = (1, 1, max(0.001, e)) if e < 1 else (1, 1, 1)
    vis_f, sx, sy, floc, nf = fold_state(u)
    if u >= 334:
        done = int(clamp((u - 362) / 15 + 0.22, 0, 4)) if u >= 362 else 0
        nstk = 2 + done - sum(1 for S in SLOTS if u >= S + 2.3)
    else: nstk = 0
    for k, f_ in enumerate(FSTK): show(f_, k < nstk)
    # the folded tee travelling from the stack into the open mailer
    pk = None
    for i, S in enumerate(SLOTS):
        v = (u - S) / 11.5
        if 0.2 <= v < 0.55: pk = (i, ease(seg(v, 0.2, 0.55)))
    show(PK, pk is not None)
    if pk:
        i, k = pk; top = FSTACK + V(0, 0, (5 - i) * 0.031); PK.location = top.lerp(ASM + V(0, 0, 0.01), k) + V(0, 0, math.sin(k * math.pi) * 0.1)
        PK.scale = (lerp(1, 0.9, k), lerp(1, 0.9, k), lerp(1, 0.3, k))
    show(fold_root, vis_f); fold_root.location = floc; fold_tee.scale = (sx, sy, 1); fold_tee.location = V(0, 0.35 * (1 - sy) * 0.6, 0.005)
    for i, mm in enumerate(MAILERS):
        vis, loc, ap, se = mailer_state(i, u); show(mm["root"], vis)
        if vis: mm["root"].location = loc; mm["root"].scale = (max(0.001, ap),) * 3; mm["label"].hide_render = se < 0.5
    # rack: one tee per slot as they are hung
    for i, hr in enumerate(HANG):
        k = ease(seg(u, HANG_T[i], HANG_T[i] + 3)); show(hr, k > 0.01); hr.scale = (1, 1, max(0.001, k))
    # the press tee and the transfer sheet
    spot, pz, Hh, carry = figure_at(u)
    FORM_TEE.hide_render = u < 436
    printed = ease(seg(u, 256, 264)) if u < 306 else 1.0
    PRESS_TEE_M.node_tree.nodes["PRINT"].outputs[0].default_value = printed
    blank_pile.scale = (1, 1, 1 - 0.2 * clamp((u - 204) / 140))
    tee_vis, tee_loc, tee_rot = False, None, (0, 0, 0)
    if 204 <= u < 266 or (306 <= u < 340):
        tee_vis = True; tee_loc = PLATEN + V(0, 0, 0.004); tee_rot = (0, 0, 0)
    sheet_vis, sheet_loc = False, None
    if 220 <= u < 264: sheet_vis = True; sheet_loc = PLATEN + V(0, 0.02, 0.008)
    if carry:
        if carry[0] == "tee":
            tee_vis = True; tee_loc = carry[1]; t_ = carry[2]; tee_rot = (lerp(0.0, 0.0, t_), 0, 0)
            press_tee.scale = (lerp(0.6, 1, t_), lerp(0.4, 1, t_), 1)
        elif carry[0] == "sheet": sheet_vis = True; sheet_loc = carry[1]
        elif carry[0] == "peel": sheet_vis = carry[2] < 0.98; sheet_loc = carry[1]
        elif carry[0] == "teeUp": tee_vis = True; tee_loc = None
    if not carry or carry[0] != "tee": press_tee.scale = (1, 1, 1)
    FIGH.location = V(spot[0], spot[1], 0); FIGH.rotation_euler = (0, 0, spot[2] * DEG); upd()
    pz = dict(pz); pz["face"] = dict(pz["face"])
    pz["look"] = (pz["look"][0] + math.sin(clock * 0.37) * 0.04, pz["look"][1] + math.sin(clock * 0.53) * 0.02, pz["look"][2])
    apply_pose(pz, clock)
    for fv in FADES: fv.outputs[0].default_value = 1.0
    bun.matrix_world = ARM.matrix_world @ PB["head"].matrix @ BUN_OFF
    show(press_tee, tee_vis)
    if tee_vis:
        if tee_loc is None:     # held up by the shoulders, facing her, then the camera sees its back… so turn it out to show the print
            mid = (bw("hand_l") + bw("hand_r")) / 2; press_tee.location = mid + V(0, 0, -0.3)
            press_tee.rotation_euler = (math.pi / 2, 0, (spot[2] + 180) * DEG)
        else:
            press_tee.location = tee_loc; press_tee.rotation_euler = tee_rot
    show(sheet, sheet_vis)
    if sheet_vis:
        sheet.location = sheet_loc
        k = carry[2] if carry and carry[0] == "peel" else 0
        sheet.rotation_euler = (-1.1 * k, 0, 0)
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
    # the desk monitor: her design while she works, CHARGIX while she browses, the store once it is live
    scr = "design" if u < 66 else "browse" if u < 160 else "store" if u >= 422 else None
    show(MON_IMG, scr is not None)
    if scr: MON_M.node_tree.nodes["IMG"].image = bpy.data.images.load(SCR[scr], check_existing=True)
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

if FRAMES.startswith("p:"): items = [(f"p{i}", float(x)) for i, x in enumerate(FRAMES[2:].split(","))]
elif FRAMES.startswith("u:"): items = [(f"u{int(float(x)):03d}", float(x) / U) for x in FRAMES[2:].split(",")]
else: items = [(f"{PREFIX}-{int(x):03d}", int(x) / (N - 1)) for x in FRAMES.split(",") if x != ""]
# ------------------------------------------------------------------ virtual-camera track for the web player
# For every frame: where the action is in the image (normalised, y down) and how far the player may push in.
from bpy_extras.object_utils import world_to_camera_view
Z_KEYS = [(0, 1.35), (60, 1.35), (70, 1.15), (150, 1.2), (172, 1.1), (196, 1.15), (204, 1.5), (266, 1.5), (276, 1.2), (290, 1.35), (300, 1.2),
          (310, 1.3), (338, 1.25), (350, 1.1), (364, 1.4), (420, 1.4), (428, 1.0), (452, 1.0), (462, 1.35), (500, 1.35), (520, 1.05), (540, 1.0)]
CARD_PULL = {"design": 0.35, "browse": 0.35, "build": 0.25, "store": 0.6, "orders": 0.35}
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
