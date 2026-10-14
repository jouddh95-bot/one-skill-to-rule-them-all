# CHARGIX · MONUMENT — the building, rebuilt for the scroll film.
#
# Builds the whole scene procedurally (forecourt, bronze door, threshold
# corridor, hall with steel monoliths, six-storey structure, pivoting wall and
# galleries; plus the rotunda for the finale), drives the camera along a path
# keyed to the same scroll percentages the theme's beats use, and renders a
# frame range with Cycles. Also writes the per-frame label anchors that
# film-core.js pins the scene labels to.
#
# usage: python monument.py <seq hall|light> <start> <end> <outdir> [W H samples]
#        python monument.py <seq> anchors <outdir>
import bpy, bmesh, math, json, os, sys
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

SEQ = sys.argv[1]
N = {"hall": 161, "light": 61}[SEQ]
MODE = sys.argv[2]
OUT = sys.argv[4] if MODE != "anchors" else sys.argv[3]
START = int(MODE) if MODE != "anchors" else 0
END = int(sys.argv[3]) if MODE != "anchors" else N
W, H, SPP = (int(sys.argv[5]), int(sys.argv[6]), int(sys.argv[7])) if len(sys.argv) > 7 else (1600, 1000, 128)
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def smooth(a, b, x):
    t = clamp((x - a) / (b - a))
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ materials
def mat(name, build):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    build(nt, bsdf)
    return m


def tex_coord(nt):
    return nt.nodes.new("ShaderNodeTexCoord").outputs["Object"]


def noise(nt, vec, scale, detail=6, rough=0.55):
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = rough
    nt.links.new(vec, n.inputs["Vector"])
    return n


def ramp(nt, fac, stops):
    r = nt.nodes.new("ShaderNodeValToRGB")
    nt.links.new(fac, r.inputs["Fac"])
    els = r.color_ramp.elements
    for i, (pos, c) in enumerate(stops):
        e = els[i] if i < len(els) else els.new(pos)
        e.position = pos
        e.color = (*c, 1)
    return r.outputs["Color"]


def bump(nt, bsdf, height, strength, dist=0.02):
    b = nt.nodes.new("ShaderNodeBump")
    b.inputs["Strength"].default_value = strength
    b.inputs["Distance"].default_value = dist
    nt.links.new(height, b.inputs["Height"])
    nt.links.new(b.outputs["Normal"], bsdf.inputs["Normal"])


def stone_builder(c1, c2, rough, block=(1.6, 0.8), joint=0.006, pit=0.5, world=True):
    """Dressed stone / travertine: large blocks with fine joints, banded veining and pitting."""
    def build(nt, bsdf):
        tc = nt.nodes.new("ShaderNodeTexCoord").outputs["Object"]
        # blocks: brick texture on the two faces we see most (xz and yz) via a mix on the normal
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(tc, sep.inputs[0])
        nrm = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(geo.outputs["Normal"], nrm.inputs[0])
        def plane(u, v):
            c = nt.nodes.new("ShaderNodeCombineXYZ")
            nt.links.new(u, c.inputs[0]); nt.links.new(v, c.inputs[1])
            return c.outputs[0]
        absx = nt.nodes.new("ShaderNodeMath"); absx.operation = "ABSOLUTE"
        nt.links.new(nrm.outputs[0], absx.inputs[0])
        absz = nt.nodes.new("ShaderNodeMath"); absz.operation = "ABSOLUTE"
        nt.links.new(nrm.outputs[2], absz.inputs[0])
        bricks = []
        for u, v in ((sep.outputs[1], sep.outputs[2]), (sep.outputs[0], sep.outputs[2]), (sep.outputs[0], sep.outputs[1])):
            br = nt.nodes.new("ShaderNodeTexBrick")
            br.offset = 0.5
            br.inputs["Scale"].default_value = 1.0
            br.inputs["Brick Width"].default_value = block[0]
            br.inputs["Row Height"].default_value = block[1]
            br.inputs["Mortar Size"].default_value = joint
            br.inputs["Mortar Smooth"].default_value = 0.2
            br.inputs["Color1"].default_value = (1, 1, 1, 1)
            br.inputs["Color2"].default_value = (0.86, 0.86, 0.86, 1)
            br.inputs["Mortar"].default_value = (0, 0, 0, 1)
            nt.links.new(plane(u, v), br.inputs["Vector"])
            bricks.append(br)
        # pick projection by the dominant normal axis
        gx = nt.nodes.new("ShaderNodeMath"); gx.operation = "GREATER_THAN"; gx.inputs[1].default_value = 0.6
        nt.links.new(absx.outputs[0], gx.inputs[0])
        gz = nt.nodes.new("ShaderNodeMath"); gz.operation = "GREATER_THAN"; gz.inputs[1].default_value = 0.6
        nt.links.new(absz.outputs[0], gz.inputs[0])
        m1 = nt.nodes.new("ShaderNodeMix"); m1.data_type = "RGBA"
        nt.links.new(gx.outputs[0], m1.inputs["Factor"])
        nt.links.new(bricks[1].outputs["Color"], m1.inputs["A"]); nt.links.new(bricks[0].outputs["Color"], m1.inputs["B"])
        m2 = nt.nodes.new("ShaderNodeMix"); m2.data_type = "RGBA"
        nt.links.new(gz.outputs[0], m2.inputs["Factor"])
        nt.links.new(m1.outputs["Result"], m2.inputs["A"]); nt.links.new(bricks[2].outputs["Color"], m2.inputs["B"])
        blk = m2.outputs["Result"]
        # veining (travertine bands) and pitting
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.wave_type = "BANDS"; wave.bands_direction = "Z"
        wave.inputs["Scale"].default_value = 0.9
        wave.inputs["Distortion"].default_value = 6
        wave.inputs["Detail"].default_value = 4
        nt.links.new(tc, wave.inputs["Vector"])
        n1 = noise(nt, tc, 2.2, 8, 0.6)
        n2 = noise(nt, tc, 38, 4, 0.7)
        mixv = nt.nodes.new("ShaderNodeMix"); mixv.data_type = "FLOAT"
        mixv.inputs["Factor"].default_value = 0.35
        nt.links.new(n1.outputs["Fac"], mixv.inputs["A"]); nt.links.new(wave.outputs["Fac"], mixv.inputs["B"])
        base = ramp(nt, mixv.outputs["Result"], [(0.25, c2), (0.75, c1)])
        mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        nt.links.new(base, mul.inputs["A"]); nt.links.new(blk, mul.inputs["B"])
        nt.links.new(mul.outputs["Result"], bsdf.inputs["Base Color"])
        rr = ramp(nt, n2.outputs["Fac"], [(0.3, (rough - 0.08,) * 3), (0.7, (rough + 0.12,) * 3)])
        nt.links.new(rr, bsdf.inputs["Roughness"])
        pits = ramp(nt, n2.outputs["Fac"], [(0.62, (1, 1, 1)), (0.7, (0, 0, 0))])
        hmix = nt.nodes.new("ShaderNodeMix"); hmix.data_type = "FLOAT"; hmix.blend_type = "MULTIPLY"
        hmix.inputs["Factor"].default_value = pit
        bw = nt.nodes.new("ShaderNodeRGBToBW"); nt.links.new(blk, bw.inputs[0])
        bw2 = nt.nodes.new("ShaderNodeRGBToBW"); nt.links.new(pits, bw2.inputs[0])
        nt.links.new(bw.outputs[0], hmix.inputs["A"]); nt.links.new(bw2.outputs[0], hmix.inputs["B"])
        bump(nt, bsdf, hmix.outputs["Result"], 0.35, 0.01)
    return build


def concrete_builder(c, rough=0.72):
    """Board-formed concrete: horizontal board marks, mottling, tie holes."""
    def build(nt, bsdf):
        tc = tex_coord(nt)
        n1 = noise(nt, tc, 1.3, 8, 0.62)
        n2 = noise(nt, tc, 22, 6, 0.65)
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.wave_type = "BANDS"; wave.bands_direction = "Z"; wave.wave_profile = "SAW"
        wave.inputs["Scale"].default_value = 3.2
        wave.inputs["Distortion"].default_value = 0.6
        wave.inputs["Detail"].default_value = 2
        nt.links.new(tc, wave.inputs["Vector"])
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "FLOAT"
        mix.inputs["Factor"].default_value = 0.22
        nt.links.new(n1.outputs["Fac"], mix.inputs["A"]); nt.links.new(wave.outputs["Fac"], mix.inputs["B"])
        dark = tuple(x * 0.72 for x in c)
        col_ = ramp(nt, mix.outputs["Result"], [(0.3, dark), (0.7, c)])
        nt.links.new(col_, bsdf.inputs["Base Color"])
        rr = ramp(nt, n2.outputs["Fac"], [(0.3, (rough - 0.1,) * 3), (0.7, (rough + 0.1,) * 3)])
        nt.links.new(rr, bsdf.inputs["Roughness"])
        h = nt.nodes.new("ShaderNodeMix"); h.data_type = "FLOAT"; h.inputs["Factor"].default_value = 0.5
        nt.links.new(n2.outputs["Fac"], h.inputs["A"]); nt.links.new(wave.outputs["Fac"], h.inputs["B"])
        bump(nt, bsdf, h.outputs["Result"], 0.22, 0.02)
    return build


def metal_builder(c, rough, aniso=0.0):
    def build(nt, bsdf):
        tc = tex_coord(nt)
        bsdf.inputs["Metallic"].default_value = 1.0
        bsdf.inputs["Base Color"].default_value = (*c, 1)
        n = noise(nt, tc, 60, 3, 0.5)
        stretch = nt.nodes.new("ShaderNodeMapping")
        stretch.inputs["Scale"].default_value = (1, 1, 40)
        nt.links.new(tc, stretch.inputs["Vector"]); nt.links.new(stretch.outputs[0], n.inputs["Vector"])
        rr = ramp(nt, n.outputs["Fac"], [(0.35, (rough - 0.06,) * 3), (0.65, (rough + 0.08,) * 3)])
        nt.links.new(rr, bsdf.inputs["Roughness"])
        bsdf.inputs["Anisotropic"].default_value = aniso
    return build


def glass_builder(tint=(0.85, 0.9, 0.88)):
    def build(nt, bsdf):
        bsdf.inputs["Base Color"].default_value = (*tint, 1)
        bsdf.inputs["Transmission Weight"].default_value = 1.0
        bsdf.inputs["Roughness"].default_value = 0.02
        bsdf.inputs["IOR"].default_value = 1.5
        bsdf.inputs["Thin Wall"].default_value = True
    return build


def water_builder():
    def build(nt, bsdf):
        tc = nt.nodes.new("ShaderNodeTexCoord").outputs["Generated"]
        bsdf.inputs["Base Color"].default_value = (0.015, 0.02, 0.022, 1)
        bsdf.inputs["Roughness"].default_value = 0.035
        bsdf.inputs["Specular IOR Level"].default_value = 0.5
        bsdf.inputs["IOR"].default_value = 1.33
        n = noise(nt, nt.nodes.new("ShaderNodeTexCoord").outputs["Object"], 1.6, 3, 0.4)
        bump(nt, bsdf, n.outputs["Fac"], 0.06, 0.05)
    return build


def emit_builder(c, strength):
    def build(nt, bsdf):
        bsdf.inputs["Base Color"].default_value = (*c, 1)
        bsdf.inputs["Emission Color"].default_value = (*c, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return build


def solid_builder(c, rough, metal=0.0):
    def build(nt, bsdf):
        bsdf.inputs["Base Color"].default_value = (*c, 1)
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
    return build


def art_builder(c):
    """A framed canvas in the galleries: a soft gradient field with brushed texture."""
    def build(nt, bsdf):
        tc = tex_coord(nt)
        n = noise(nt, tc, 3.0, 10, 0.6)
        col_ = ramp(nt, n.outputs["Fac"], [(0.2, tuple(x * 0.55 for x in c)), (0.8, c)])
        nt.links.new(col_, bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.8
    return build


M = {
    "trav": mat("travertine", stone_builder((0.5, 0.44, 0.36), (0.38, 0.33, 0.26), 0.5)),
    "trav_dark": mat("travertine_dark", stone_builder((0.3, 0.27, 0.23), (0.22, 0.2, 0.17), 0.55)),
    "paving": mat("paving", stone_builder((0.32, 0.3, 0.28), (0.22, 0.21, 0.2), 0.42, block=(1.2, 1.2), joint=0.01, pit=0.3)),
    "floor_in": mat("floor_polished", stone_builder((0.2, 0.19, 0.18), (0.11, 0.105, 0.1), 0.16, block=(2.4, 1.2), joint=0.003, pit=0.1)),
    "conc": mat("concrete", concrete_builder((0.33, 0.32, 0.3))),
    "conc_dark": mat("concrete_dark", concrete_builder((0.17, 0.165, 0.16))),
    "bronze": mat("bronze", metal_builder((0.42, 0.27, 0.15), 0.32, 0.4)),
    "steel": mat("steel", metal_builder((0.22, 0.225, 0.23), 0.28, 0.5)),
    "steel_light": mat("steel_light", metal_builder((0.6, 0.6, 0.6), 0.22, 0.3)),
    "glass": mat("glass", glass_builder()),
    "water": mat("water", water_builder()),
    "slot": mat("light_slot", emit_builder((1.0, 0.86, 0.68), 14)),
    "panel": mat("ceiling_panel", emit_builder((1.0, 0.84, 0.64), 3.0)),
    "glow": mat("balcony_glow", emit_builder((1.0, 0.82, 0.6), 1.1)),
    "gallery_light": mat("gallery_light", emit_builder((1.0, 0.9, 0.78), 5)),
    "plaster": mat("plaster", solid_builder((0.6, 0.57, 0.53), 0.85)),
    "black": mat("black", solid_builder((0.02, 0.02, 0.02), 0.6)),
}
ART = [mat(f"art{i}", art_builder(c)) for i, c in enumerate([
    (0.55, 0.16, 0.12), (0.78, 0.55, 0.5), (0.12, 0.2, 0.32), (0.62, 0.5, 0.18), (0.22, 0.33, 0.24)])]


# ------------------------------------------------------------------ geometry helpers
def box(name, x0, x1, y0, y1, z0, z1, m, bevel=0.025, parent=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x0 + (v.co.x + 0.5) * (x1 - x0)
        v.co.y = y0 + (v.co.y + 0.5) * (y1 - y0)
        v.co.z = z0 + (v.co.z + 0.5) * (z1 - z0)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    ob.data.materials.append(m)
    if bevel:
        bv = ob.modifiers.new("bevel", "BEVEL")
        bv.width = bevel; bv.segments = 2; bv.limit_method = "ANGLE"
        bv.harden_normals = False
    if parent:
        ob.parent = parent
    return ob


def pivoted(name, hinge, objs):
    e = bpy.data.objects.new(name, None)
    e.location = hinge
    col.objects.link(e)
    bpy.context.view_layer.update()
    for o in objs:
        o.parent = e
        o.matrix_parent_inverse = e.matrix_world.inverted()
    return e


# ------------------------------------------------------------------ world + sun
world = bpy.data.worlds.new("sky")
scene.world = world
world.use_nodes = True
wn = world.node_tree
sky = wn.nodes.new("ShaderNodeTexSky")
sky.sky_type = "MULTIPLE_SCATTERING"
SUN_EL = math.radians(36)
SUN_TO = Vector((-0.8 * math.cos(SUN_EL), -0.6 * math.cos(SUN_EL), math.sin(SUN_EL)))   # towards the sun: front-left, raking the facade
SUN_AZ = math.atan2(SUN_TO.x, SUN_TO.y)
sky.sun_elevation = SUN_EL
sky.sun_rotation = SUN_AZ
sky.sun_disc = False
sky.air_density = 1.2
sky.aerosol_density = 1.6
bg = wn.nodes["Background"]
bg.inputs["Strength"].default_value = 0.16
wn.links.new(sky.outputs["Color"], bg.inputs["Color"])

sun_data = bpy.data.lights.new("sun", "SUN")
sun_data.energy = 4.2
sun_data.angle = math.radians(0.6)
sun_data.color = (1.0, 0.8, 0.62)
sun = bpy.data.objects.new("sun", sun_data)
col.objects.link(sun)
sun.rotation_euler = (-SUN_TO).to_track_quat("-Z", "Y").to_euler()


def area(name, loc, size, energy, color, rot=(0, 0, 0), shape="RECTANGLE", sy=None):
    d = bpy.data.lights.new(name, "AREA")
    d.energy = energy; d.color = color; d.shape = shape
    d.size = size
    if sy is not None:
        d.size_y = sy
    o = bpy.data.objects.new(name, d)
    o.location = loc; o.rotation_euler = rot
    col.objects.link(o)
    return o


# ================================================================== HALL SEQUENCE SET
ANCHOR_PTS = {}
anim = {}

if SEQ == "hall":
    # ---- forecourt
    box("ground", -150, 150, -160, 0.2, -1, 0, M["paving"], bevel=0)
    # reflecting pool on the axis, with stone coping
    box("pool", -2.0, 2.0, -48, -3.2, -0.6, -0.04, M["water"], bevel=0)
    box("coping_l", -2.45, -2.0, -48.45, -2.75, -0.6, 0.06, M["trav"])
    box("coping_r", 2.0, 2.45, -48.45, -2.75, -0.6, 0.06, M["trav"])
    box("coping_f", -2.45, 2.45, -48.45, -48.0, -0.6, 0.06, M["trav"])
    box("coping_b", -2.45, 2.45, -3.2, -2.75, -0.6, 0.06, M["trav"])
    # rows of free-standing fins
    hs = [17, 21, 15, 19, 23, 16]
    for i, y in enumerate(range(-52, -4, 8)):
        for x, k in ((-8.0, 0), (8.0, 1), (-14.5, 2), (14.5, 3)):
            h = hs[(i + k) % len(hs)] - (3 if abs(x) > 10 else 0)
            box(f"fin_{i}_{k}", x - 0.8, x + 0.8, y - 0.8, y + 0.8, 0, h, M["trav"], bevel=0.04)
    # the monument facade (depth 10), split around the door
    box("facade_l", -24, -2.6, 0, 10, 0, 26, M["trav"])
    box("facade_r", 2.6, 24, 0, 10, 0, 26, M["trav"])
    box("lintel", -2.6, 2.6, 0, 10, 10, 26, M["trav"])
    box("plinth_l", -24.4, -2.95, -0.4, 10.4, 0, 0.45, M["trav_dark"])
    box("plinth_r", 2.95, 24.4, -0.4, 10.4, 0, 0.45, M["trav_dark"])
    box("threshold_step", -2.95, 2.95, -0.4, 0.0, 0, 0.05, M["trav_dark"], bevel=0.01)
    # deep vertical fins on the face, a recessed attic band and the cantilevered canopy
    for x in (-21, -17.5, -14, -10.5, -7, 7, 10.5, 14, 17.5, 21):
        box(f"pier_{x}", x - 0.45, x + 0.45, -1.2, 0, 0.45, 23.5, M["trav"], bevel=0.03)
    box("attic", -24.2, 24.2, -1.5, 1.5, 23.5, 26.6, M["trav"])
    box("canopy", -8.5, 8.5, -8.0, 0.5, 12.0, 13.1, M["trav_dark"], bevel=0.05)
    box("canopy_reveal", -8.2, 8.2, -7.7, 0.4, 11.92, 12.0, M["slot"], bevel=0)
    box("door_frame_l", -2.95, -2.6, -0.35, 0.6, 0.45, 10.35, M["bronze"], bevel=0.01)
    box("door_frame_r", 2.6, 2.95, -0.35, 0.6, 0.45, 10.35, M["bronze"], bevel=0.01)
    box("door_frame_t", -2.95, 2.95, -0.35, 0.6, 10.0, 10.35, M["bronze"], bevel=0.01)
    # bronze door leaves, hinged at the jambs, opening inward
    leaves = []
    for side in (-1, 1):
        x_h = side * 2.6
        slab = box(f"leaf_{side}", min(x_h, 0), max(x_h, 0), 0.0, 0.22, 0.45, 10.0, M["bronze"], bevel=0.012)
        bar = box(f"pull_{side}", side * 0.35 - 0.04, side * 0.35 + 0.04, -0.18, -0.05, 3.2, 7.2, M["steel_light"], bevel=0.01)
        leaves.append(pivoted(f"hinge_{side}", Vector((x_h, 0.11, 0)), [slab, bar]))
    anim["door"] = leaves
    ANCHOR_PTS["door"] = Vector((0, 0, 5.2))

    # ---- threshold corridor (y 10 → 34): dark, ceiling slots of warm light
    box("cor_floor", -3.2, 3.2, 0, 34, -0.5, 0.02, M["floor_in"], bevel=0)
    box("cor_wall_l", -4.0, -2.6, 10, 34, 0, 10.5, M["conc_dark"], bevel=0)
    box("cor_wall_r", 2.6, 4.0, 10, 34, 0, 10.5, M["conc_dark"], bevel=0)
    box("cor_ceiling", -4.0, 4.0, 10, 34, 10.0, 11.0, M["conc_dark"], bevel=0)
    for k, y in enumerate(range(3, 34, 3)):
        box(f"slot_{k}", -2.4, 2.4, y, y + 0.14, 9.96, 10.0, M["slot"], bevel=0)
    # door reveal inside the thick wall
    area("lintel_fill", (0, 5.5, 9.6), 3.6, 160, (1.0, 0.84, 0.66), sy=8)

    # ---- the hall (y 34 → 132, x ±24, 48 m tall)
    HX, HY0, HY1, HZ = 24, 34, 132, 48
    box("hall_floor", -HX, HX, HY0, HY1, -0.5, 0.02, M["floor_in"], bevel=0)
    box("hall_front_l", -HX - 1, -2.6, HY0 - 1, HY0, 0, HZ, M["conc"], bevel=0)
    box("hall_front_r", 2.6, HX + 1, HY0 - 1, HY0, 0, HZ, M["conc"], bevel=0)
    box("hall_front_t", -2.6, 2.6, HY0 - 1, HY0, 10.5, HZ, M["conc"], bevel=0)
    box("hall_wall_l", -HX - 1, -HX, HY0, HY1, 0, HZ, M["conc"], bevel=0)
    box("hall_wall_r", HX, HX + 1, HY0, HY1, 0, HZ, M["conc"], bevel=0)
    # back wall with the pivot opening (x ±5, up to 16 m)
    box("hall_back_l", -HX - 1, -5.2, HY1, HY1 + 1.2, 0, HZ, M["conc"], bevel=0)
    box("hall_back_r", 5.2, HX + 1, HY1, HY1 + 1.2, 0, HZ, M["conc"], bevel=0)
    box("hall_back_t", -5.2, 5.2, HY1, HY1 + 1.2, 16.2, HZ, M["conc"], bevel=0)
    # roof: deep beams with slits between them; the sun falls through in blades
    y = HY0
    k = 0
    while y < HY1:
        box(f"roof_{k}", -HX - 1, HX + 1, y, min(y + 4.4, HY1 + 1.2), HZ, HZ + 1.0, M["conc"], bevel=0)
        y += 4.4 + 2.0
        k += 1
    # pilasters on the side walls
    for yy in range(38, 130, 9):
        for side in (-1, 1):
            x0 = side * HX
            box(f"pil_{yy}_{side}", min(x0, x0 - side * 1.1), max(x0, x0 - side * 1.1), yy - 0.7, yy + 0.7, 0, HZ, M["conc"], bevel=0.03)
    # cantilevered balconies with glass balustrades
    balconies = [(-1, 10, 46, 64), (1, 16, 52, 74), (-1, 24, 70, 86), (1, 32, 40, 58), (-1, 38, 54, 70), (1, 8, 80, 96)]
    for i, (side, z, y0, y1) in enumerate(balconies):
        x_wall = side * HX
        x_edge = side * (HX - 5.0)
        xa, xb = min(x_wall, x_edge), max(x_wall, x_edge)
        box(f"balc_{i}", xa, xb, y0, y1, z - 0.6, z, M["conc"], bevel=0.03)
        box(f"balc_glass_{i}", min(x_edge, x_edge + side * 0.06), max(x_edge, x_edge + side * 0.06), y0, y1, z, z + 1.15, M["glass"], bevel=0)
        box(f"balc_rail_{i}", min(x_edge, x_edge + side * 0.08) - 0.02, max(x_edge, x_edge + side * 0.08) + 0.02, y0, y1, z + 1.15, z + 1.22, M["steel"], bevel=0.005)
        box(f"balc_glow_{i}", xa + 0.2, xb - 0.2, y0 + 0.2, y1 - 0.2, z - 0.62, z - 0.6, M["glow"], bevel=0)
    # the reflecting floor of the hall and its steel monoliths
    box("hall_pool", -11, 11, 46, 80, -0.4, -0.03, M["water"], bevel=0)
    box("hall_pool_edge_l", -11.4, -11, 45.6, 80.4, -0.4, 0.03, M["trav_dark"], bevel=0.01)
    box("hall_pool_edge_r", 11, 11.4, 45.6, 80.4, -0.4, 0.03, M["trav_dark"], bevel=0.01)
    box("hall_pool_edge_f", -11.4, 11.4, 45.6, 46, -0.4, 0.03, M["trav_dark"], bevel=0.01)
    box("hall_pool_edge_b", -11.4, 11.4, 80, 80.4, -0.4, 0.03, M["trav_dark"], bevel=0.01)
    monos = [(-5.5, 52, 13, 18), (4.0, 57, 16, -12), (-2.0, 64, 11, 8), (6.5, 69, 14, 24), (-7.0, 73, 15, -20)]
    for i, (x, yy, h, rot) in enumerate(monos):
        o = box(f"mono_{i}", -0.7, 0.7, -0.22, 0.22, -0.05, h, M["steel"], bevel=0.008)
        o.location = (x, yy, 0)
        o.rotation_euler = (0, 0, math.radians(rot))
    # ---- the structure: six storeys of glass and concrete inside the hall
    TX0, TX1, TY0, TY1 = -8.5, 8.5, 88, 106
    FL = 6.0
    for f in range(7):
        z = f * FL
        box(f"slab_{f}", TX0 - 0.6, TX1 + 0.6, TY0 - 0.6, TY1 + 0.6, z - 0.55 if f else -0.2, z + 0.05, M["conc"], bevel=0.02)
        if f < 6:
            box(f"ceil_{f}", TX0 + 0.5, TX1 - 0.5, TY0 + 0.5, TY1 - 0.5, z + FL - 0.62, z + FL - 0.58, M["panel"], bevel=0)
            # floor finish and a few volumes inside so the glass reads as occupied
            box(f"core_{f}", -2.2, 2.2, 97, 101, z + 0.05, z + FL - 0.6, M["trav_dark"], bevel=0.02)
            box(f"bench_{f}", -6, -3.5, 91, 92, z + 0.05, z + 0.5, M["trav"], bevel=0.02)
            box(f"table_{f}", 3.2, 6.4, 92, 94, z + 0.75, z + 0.85, M["bronze"], bevel=0.01)
            # curtain wall: glass with steel mullions every 1.5 m
            for side_y in (TY0, TY1):
                box(f"cw_{f}_{side_y}", TX0, TX1, side_y - 0.03, side_y + 0.03, z + 0.05, z + FL - 0.55, M["glass"], bevel=0)
                xm = TX0
                while xm <= TX1 + 0.01:
                    box(f"mul_{f}_{side_y}_{xm:.1f}", xm - 0.05, xm + 0.05, side_y - 0.12, side_y + 0.05, z + 0.05, z + FL - 0.55, M["steel"], bevel=0)
                    xm += 1.5
            for side_x in (TX0, TX1):
                box(f"cws_{f}_{side_x}", side_x - 0.03, side_x + 0.03, TY0, TY1, z + 0.05, z + FL - 0.55, M["glass"], bevel=0)
                ym = TY0
                while ym <= TY1 + 0.01:
                    box(f"muls_{f}_{side_x}_{ym:.1f}", side_x - 0.12, side_x + 0.05, ym - 0.05, ym + 0.05, z + 0.05, z + FL - 0.55, M["steel"], bevel=0)
                    ym += 1.5
        # anchors: a point on each storey's front slab edge, stepped across the face
        if f < 6:
            ANCHOR_PTS[f"n{f}"] = Vector((-6.0 + f * 2.4, TY0 - 0.6, z + 0.05))
    # four corner columns rising through the hall
    for x in (TX0 - 0.3, TX1 + 0.3):
        for yy in (TY0 - 0.3, TY1 + 0.3):
            box(f"col_{x}_{yy}", x - 0.45, x + 0.45, yy - 0.45, yy + 0.45, 0, 6 * FL + 0.1, M["conc"], bevel=0.02)
    # ---- the pivoting wall and the galleries behind it
    pw = box("pivot_wall", -5.0, 5.0, HY1 + 0.2, HY1 + 1.0, 0.02, 16.0, M["conc"], bevel=0.02)
    seam = box("pivot_seam", -0.03, 0.03, HY1 + 0.17, HY1 + 0.2, 0.02, 16.0, M["slot"], bevel=0)
    anim["pivot"] = pivoted("pivot", Vector((0, HY1 + 0.6, 0)), [pw, seam])
    GY0, GY1 = HY1 + 1.2, HY1 + 60
    box("gal_floor", -9, 9, GY0, GY1, -0.5, 0.02, M["floor_in"], bevel=0)
    box("gal_wall_l", -10, -9, GY0, GY1, 0, 16.2, M["plaster"], bevel=0)
    box("gal_wall_r", 9, 10, GY0, GY1, 0, 16.2, M["plaster"], bevel=0)
    box("gal_end", -10, 10, GY1, GY1 + 1, 0, 16.2, M["plaster"], bevel=0)
    box("gal_ceil", -10, 10, GY0, GY1 + 1, 16.2, 17, M["plaster"], bevel=0)
    box("gal_lightline", -1.2, 1.2, GY0 + 1, GY1 - 1, 16.15, 16.2, M["gallery_light"], bevel=0)
    for i in range(5):
        yy = GY0 + 8 + i * 10
        side = -1 if i % 2 == 0 else 1
        x = side * 8.95
        box(f"art_{i}", min(x, x - side * 0.08), max(x, x - side * 0.08), yy - 2.6, yy + 2.6, 2.0, 8.8, ART[i], bevel=0.005)
        box(f"plinth_g_{i}", -1.2 + side * 3.5, 1.2 + side * 3.5, yy - 1.2, yy + 1.2, 0, 1.0, M["plaster"], bevel=0.02)
    area("gal_fill", (0, GY0 + 28, 15.5), 14, 3500, (1.0, 0.92, 0.82), sy=50)
    ANCHOR_PTS["gal"] = Vector((0, HY1 + 6, 4.0))

    # hall fill: the soft skylight bounce, warm cove light under the roof, low glow on the floor
    area("hall_sky_fill", (0, 83, HZ - 1.0), 46, 4000, (0.86, 0.9, 1.0), sy=96)
    area("back_wash", (0, HY1 - 14, 20), 20, 2600, (1.0, 0.86, 0.7), rot=(math.radians(55), 0, 0), sy=6)
    area("cor_fill", (0, 22, 9.5), 4, 260, (1.0, 0.85, 0.68), sy=22)

# ================================================================== FINALE: THE ROTUNDA
if SEQ == "light":
    R, RH = 17.0, 20.0
    box("r_ground", -80, 80, -80, 80, -1, 0, M["paving"], bevel=0)
    box("r_floor", -R - 2, R + 2, -R - 2, R + 2, -0.5, 0.02, M["floor_in"], bevel=0)
    # drum wall: a solid cylinder with the doorway cut at -Y, travertine pilasters inside
    me = bpy.data.meshes.new("drum")
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=128, radius1=R, radius2=R, depth=RH)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, RH / 2))
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if abs(f.calc_center_median().x) < 2.2 and f.calc_center_median().y < 0 and f.calc_center_median().z < 11], context="FACES")
    bm.to_mesh(me); bm.free()
    drum = bpy.data.objects.new("drum", me)
    col.objects.link(drum); drum.data.materials.append(M["trav"])
    sd = drum.modifiers.new("solid", "SOLIDIFY"); sd.thickness = 1.4; sd.offset = 1.0
    for i in range(24):
        am = 2 * math.pi * i / 24 + math.pi / 24
        if math.sin(am) < -0.9:
            continue
        p_ = box(f"pilaster_{i}", -0.55, 0.55, 0.0, 0.4, 0.0, RH - 0.4, M["trav"], bevel=0.03)
        p_.location = (math.cos(am) * (R - 0.02), math.sin(am) * (R - 0.02), 0)
        p_.rotation_euler = (0, 0, am + math.pi / 2)
    # coffered dome
    me = bpy.data.meshes.new("dome")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=24, radius=R + 0.2)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.01], context="VERTS")
    OCULUS = 4.4
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(math.hypot(v.co.x, v.co.y) < OCULUS for v in f.verts)], context="FACES")
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    faces = [f for f in bm.faces if f.calc_center_median().z > 1.0 and len(f.verts) == 4]
    ins = bmesh.ops.inset_individual(bm, faces=faces, thickness=0.18, depth=0.0)
    for f in faces:
        nrm = f.normal.copy()
        for v in f.verts:
            v.co -= nrm * 0.45
    bm.to_mesh(me); bm.free()
    dome = bpy.data.objects.new("dome", me)
    dome.location = (0, 0, RH)
    dome.scale = (1, 1, 0.92)
    col.objects.link(dome)
    dome.data.materials.append(M["trav"])
    sol = dome.modifiers.new("solid", "SOLIDIFY"); sol.thickness = 1.0
    # oculus ring and the two leaves that slide open
    ring = bpy.data.objects.new("oculus_ring", bpy.data.meshes.new("ring"))
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=64, radius1=OCULUS + 0.4, radius2=OCULUS + 0.4, depth=1.4)
    bm.to_mesh(ring.data); bm.free()
    ring.location = (0, 0, RH + (R + 0.2) * 0.92 * math.sqrt(1 - (OCULUS / (R + 0.2)) ** 2) - 0.2)
    col.objects.link(ring); ring.data.materials.append(M["bronze"])
    sol2 = ring.modifiers.new("solid", "SOLIDIFY"); sol2.thickness = 0.35
    OZ = ring.location.z + 0.9
    lids = []
    for side in (-1, 1):
        lid = box(f"lid_{side}", min(0, side * (OCULUS + 0.6)), max(0, side * (OCULUS + 0.6)), -OCULUS - 0.6, OCULUS + 0.6, OZ, OZ + 0.25, M["bronze"], bevel=0.02)
        lids.append(pivoted(f"lidp_{side}", Vector((0, 0, 0)), [lid]))
    anim["lids"] = lids
    ANCHOR_PTS["rot"] = Vector((0, 0, OZ))
    # the approach: a short colonnade and the doorway in the drum
    box("door_l", -3.4, -2.2, -R - 1.6, -R + 0.1, 0, 11, M["trav"], bevel=0.03)
    box("door_r", 2.2, 3.4, -R - 1.6, -R + 0.1, 0, 11, M["trav"], bevel=0.03)
    box("door_t", -3.4, 3.4, -R - 1.6, -R + 0.1, 11, RH, M["trav"], bevel=0.03)
    box("vest_l", -3.6, -3.4, -R - 14, -R - 1.6, 0, 11, M["trav_dark"], bevel=0)
    box("vest_r", 3.4, 3.6, -R - 14, -R - 1.6, 0, 11, M["trav_dark"], bevel=0)
    box("vest_t", -3.6, 3.6, -R - 14, -R - 1.6, 11, 11.8, M["trav_dark"], bevel=0)
    ANCHOR_PTS["door"] = Vector((2.2, -R - 1.6, 5.5))
    # central disc in the floor where the light lands
    disc = bpy.data.objects.new("disc", bpy.data.meshes.new("disc"))
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=96, radius=3.2)
    bm.to_mesh(disc.data); bm.free(); disc.location = (0, 0, 0.025)
    col.objects.link(disc); disc.data.materials.append(M["bronze"])
    area("rot_fill", (0, 0, RH + 8), 6, 900, (0.9, 0.93, 1.0), shape="DISK")
    # cornice ledge at the spring of the dome, with a hidden warm cove light washing the coffers
    me = bpy.data.meshes.new("cornice")
    bm = bmesh.new()
    outer = bmesh.ops.create_circle(bm, cap_ends=False, segments=128, radius=R)["verts"]
    inner = bmesh.ops.create_circle(bm, cap_ends=False, segments=128, radius=R - 1.3)["verts"]
    for k in range(128):
        bm.faces.new((outer[k], outer[(k + 1) % 128], inner[(k + 1) % 128], inner[k]))
    bm.to_mesh(me); bm.free()
    cor = bpy.data.objects.new("cornice", me); cor.location = (0, 0, RH - 0.6)
    col.objects.link(cor); cor.data.materials.append(M["trav"])
    cs = cor.modifiers.new("solid", "SOLIDIFY"); cs.thickness = 0.7
    me = bpy.data.meshes.new("cove")
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=128, radius1=R - 0.35, radius2=R - 0.35, depth=0.12)
    bm.to_mesh(me); bm.free()
    cove = bpy.data.objects.new("cove", me); cove.location = (0, 0, RH + 0.2)
    col.objects.link(cove); cove.data.materials.append(mat("cove", emit_builder((1.0, 0.8, 0.58), 22)))
    lip = bpy.data.meshes.new("lip")
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=128, radius1=R - 1.25, radius2=R - 1.25, depth=0.9)
    bm.to_mesh(lip); bm.free()
    lipo = bpy.data.objects.new("lip", lip); lipo.location = (0, 0, RH + 0.3)
    col.objects.link(lipo); lipo.data.materials.append(M["trav"])
    ls = lipo.modifiers.new("solid", "SOLIDIFY"); ls.thickness = 0.12
    area("vest_fill", (0, -R - 8, 11.3), 2.5, 140, (1.0, 0.85, 0.68), sy=10)


# ------------------------------------------------------------------ camera path
cam_data = bpy.data.cameras.new("cam")
cam_data.sensor_width = 36
cam_data.clip_start = 0.1
cam_data.clip_end = 1200
cam = bpy.data.objects.new("cam", cam_data)
col.objects.link(cam)
scene.camera = cam

# keys: (p, position, look-at, focal mm, exposure EV)
if SEQ == "hall":
    KEYS = [
        (0.000, (0, -64, 1.7), (0, 0, 9.5), 30, -1.25),
        (0.070, (0, -55, 1.75), (0, 0, 9.0), 30, -1.25),
        (0.140, (0, -32, 1.9), (0, 0, 7.5), 30, -1.20),
        (0.195, (0, -12, 2.0), (0, 10, 6.0), 28, -1.10),
        (0.232, (0, 4.5, 2.0), (0, 30, 4.8), 26, -0.30),
        (0.262, (0, 20, 2.0), (0, 40, 5.5), 24, 1.00),
        (0.300, (0, 36.5, 2.4), (0, 70, 16), 22, 0.30),
        (0.380, (2.5, 42, 3.4), (-6, 72, 26), 20, 0.20),
        (0.430, (1.0, 45.5, 2.2), (0, 70, 10), 22, 0.20),
        (0.480, (-1.6, 52, 1.35), (1.5, 72, 6.0), 24, 0.10),
        (0.530, (1.2, 61, 1.4), (-1, 80, 5.0), 24, 0.10),
        (0.580, (-2.0, 72, 2.4), (0, 92, 7.0), 26, 0.00),
        (0.620, (-4.5, 78.5, 4.0), (0, 92, 6.0), 26, -0.10),
        (0.680, (-9.5, 79.5, 11.0), (0, 92, 12.5), 26, -0.15),
        (0.740, (-6.0, 78.0, 19.5), (0, 92, 20.0), 26, -0.15),
        (0.800, (1.5, 77.5, 28.0), (0, 92, 26.0), 26, -0.15),
        (0.840, (11.0, 82.0, 36.5), (0, 98, 30.0), 24, -0.10),
        (0.880, (15.0, 104.0, 24.0), (0, 128, 10.0), 24, -0.05),
        (0.915, (6.0, 118.0, 6.0), (1.5, 134, 5.0), 24, -0.20),
        (0.950, (3.1, 126.0, 2.6), (2.0, 150, 4.2), 24, -0.50),
        (1.000, (2.6, 141.0, 2.4), (1.0, 175, 4.2), 24, -1.00),
    ]
else:
    KEYS = [
        (0.00, (-1.4, -36, 1.8), (0.6, 0, 3.2), 28, 1.4),
        (0.18, (-0.4, -22, 1.8), (0.2, 0, 4.2), 26, 1.6),
        (0.34, (0.0, -9.0, 1.8), (0.0, 10, 9.0), 22, 1.7),
        (0.50, (0.0, -3.0, 1.8), (0.0, 4.0, 20.0), 20, 1.6),
        (0.66, (0.0, -0.8, 1.8), (0.0, 0.4, 30.0), 18, 1.4),
        (0.82, (0.0, -0.1, 1.8), (0.0, 0.25, 34.0), 18, 1.15),
        (1.00, (0.0, 0.0, 1.8), (0.0, 0.2, 36.0), 18, 1.0),
    ]


def catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


def sample(p):
    ks = KEYS
    i = 0
    while i < len(ks) - 2 and p > ks[i + 1][0]:
        i += 1
    k0, k1, k2, k3 = ks[max(i - 1, 0)], ks[i], ks[i + 1], ks[min(i + 2, len(ks) - 1)]
    t = clamp((p - k1[0]) / (k2[0] - k1[0]))
    # ease within each segment so the camera never lurches at a key
    te = t
    pos = catmull(*(Vector(k[1]) for k in (k0, k1, k2, k3)), te)
    tgt = catmull(*(Vector(k[2]) for k in (k0, k1, k2, k3)), te)
    lens = k1[3] + (k2[3] - k1[3]) * (t * t * (3 - 2 * t))
    ev = k1[4] + (k2[4] - k1[4]) * (t * t * (3 - 2 * t))
    return pos, tgt, lens, ev


def set_frame(i):
    p = i / (N - 1)
    pos, tgt, lens, ev = sample(p)
    cam.location = pos
    f = (tgt - pos).normalized()
    w = smooth(0.55, 0.97, f.z)
    up = (Vector((0, 0, 1)) * (1 - w) + Vector((0, 1, 0)) * w).normalized()
    r = f.cross(up).normalized()
    u = r.cross(f)
    from mathutils import Matrix
    cam.rotation_euler = Matrix((r, u, -f)).transposed().to_euler()
    cam_data.lens = lens
    scene.view_settings.exposure = ev
    if SEQ == "hall":
        a = smooth(0.105, 0.2, p) * math.radians(84)
        anim["door"][0].rotation_euler = (0, 0, a)
        anim["door"][1].rotation_euler = (0, 0, -a)
        anim["pivot"].rotation_euler = (0, 0, smooth(0.855, 0.93, p) * math.radians(78))
    else:
        o = smooth(0.38, 0.8, p) * 3.9
        anim["lids"][0].location = (-o, 0, 0)
        anim["lids"][1].location = (o, 0, 0)
    bpy.context.view_layer.update()
    return p


# ------------------------------------------------------------------ render settings
scene.render.engine = "CYCLES"
cy = scene.cycles
cy.device = "CPU"
cy.samples = SPP
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.02
cy.use_denoising = True
cy.denoiser = "OPENIMAGEDENOISE"
cy.denoising_input_passes = "RGB_ALBEDO_NORMAL"
cy.denoising_prefilter = "ACCURATE"
cy.max_bounces = 6
cy.diffuse_bounces = 3
cy.glossy_bounces = 3
cy.transmission_bounces = 4
cy.volume_bounces = 0
cy.sample_clamp_indirect = 4.0
cy.blur_glossy = 1.0
cy.caustics_reflective = False
cy.caustics_refractive = False
cy.seed = 7
cy.use_animated_seed = False
scene.render.resolution_x = W
scene.render.resolution_y = H
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.render.use_motion_blur = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_depth = "8"
scene.render.threads_mode = "AUTO"

stem = {"hall": "s", "light": "f"}[SEQ]

if MODE == "anchors":
    out = []
    for i in range(N):
        set_frame(i)
        fr = {}
        for k, pt in ANCHOR_PTS.items():
            v = world_to_camera_view(scene, cam, pt)
            if v.z <= 0.2:
                continue
            x, y = v.x, 1 - v.y
            if -0.12 < x < 1.12 and -0.12 < y < 1.12:
                fr[k] = [round(x, 4), round(y, 4)]
        out.append(fr)
    with open(os.path.join(OUT, f"anchors-{SEQ}.json"), "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print("anchors written", len(out))
else:
    frames = [int(x) for x in os.environ["CX_FRAMES"].split(",")] if os.environ.get("CX_FRAMES") else range(START, min(END, N))
    for i in frames:
        set_frame(i)
        scene.render.filepath = os.path.join(OUT, f"{stem}-{i:03d}.png")
        bpy.ops.render.render(write_still=True)
        print("rendered", i, flush=True)
