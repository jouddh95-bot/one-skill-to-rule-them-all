# CHARGIX · diorama character builder (Blender, headless).
# Builds a realistic human from CC0 MakeHuman / MPFB assets: the hm08 base mesh,
# the macro targets, the 53-bone "game_engine" rig and weights, and the 34 facial
# expression-unit targets (as glTF morph targets for blinking, brows, smiles).
# Clothes are cut from the mesh's own fitted helper (the tights helper), so they
# follow the body exactly; skin, lips and brows are painted as vertex colours.
# usage: python character.py <mh data dir> <mpfb data dir> <out.glb> <female|male>
import bpy, bmesh, json, sys, os, math
from mathutils import Vector

MH, MP, OUT, SEX = sys.argv[-4:]
S = 0.1
def cv(x, y, z): return Vector((x * S, -z * S, y * S))   # MakeHuman (Y up, dm) -> Blender (Z up, m)

# ---------- base mesh
V, VT, F = [], [], []          # F: (group, [v], [vt])
g = None
for l in open(os.path.join(MH, '3dobjs/base.obj')):
    if l.startswith('v '): V.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('vt '): VT.append([float(t) for t in l.split()[1:3]])
    elif l.startswith('g '): g = l.split()[1]
    elif l.startswith('f '):
        vs, ts = [], []
        for t in l.split()[1:]:
            p = t.split('/'); vs.append(int(p[0]) - 1); ts.append(int(p[1]) - 1 if len(p) > 1 and p[1] else 0)
        F.append((g, vs, ts))
N = len(V)

def target(path):
    d = {}
    for l in open(path):
        if l[:1] in '#\n' or not l.strip(): continue
        p = l.split(); d[int(p[0])] = (float(p[1]), float(p[2]), float(p[3]))
    return d

def apply(t, w):
    for i, (x, y, z) in t.items(): V[i][0] += x * w; V[i][1] += y * w; V[i][2] += z * w

T = os.path.join(MH, 'targets/macrodetails')
if SEX == 'female':
    apply(target(f'{T}/caucasian-female-young.target'), 1.0)
    apply(target(f'{T}/universal-female-young-averagemuscle-minweight.target'), 0.35)
else:
    apply(target(f'{T}/caucasian-male-young.target'), 1.0)
P = [cv(*v) for v in V]

# ---------- rig (MPFB game_engine, CC0): joints are the centres of the base mesh's joint cubes
groups = {}
for gname, vs, _ in F:
    groups.setdefault(gname, set()).update(vs)
def cube(name): s = groups[name]; return sum((P[i] for i in s), Vector()) / len(s)
rig = json.load(open(os.path.join(MP, 'rigs/standard/rig.game_engine.json')))
W = json.load(open(os.path.join(MP, 'rigs/standard/weights.game_engine.json')))['weights']

bpy.ops.wm.read_factory_settings(use_empty=True)
arm = bpy.data.armatures.new('rig'); ao = bpy.data.objects.new('rig', arm)
bpy.context.scene.collection.objects.link(ao); bpy.context.view_layer.objects.active = ao
bpy.ops.object.mode_set(mode='EDIT')
def jpos(j):
    if j.get('strategy') == 'CUBE' and j.get('cube_name') in groups: return cube(j['cube_name'])
    if j.get('strategy') == 'MEAN' and 'vertex_indices' in j: return sum((P[i] for i in j['vertex_indices']), Vector()) / len(j['vertex_indices'])
    if j.get('strategy') == 'VERTEX' and 'vertex_index' in j: return P[j['vertex_index']].copy()
    return Vector(j['default_position'])
for name, b in rig.items():
    e = arm.edit_bones.new(name); e.head = jpos(b['head']); e.tail = jpos(b['tail'])
    if (e.tail - e.head).length < 1e-4: e.tail = e.head + Vector((0, 0, 0.02))
    e.roll = b.get('roll', 0)
for name, b in rig.items():
    if b.get('parent'): arm.edit_bones[name].parent = arm.edit_bones[b['parent']]; arm.edit_bones[name].use_connect = bool(b.get('use_connect'))
bpy.ops.object.mode_set(mode='OBJECT')

# per-vertex dominant bone
dom = [None] * N; best = [0.0] * N
for bn, lst in W.items():
    for i, w in lst:
        if w > best[i]: best[i] = w; dom[i] = bn

HEADB = {'head', 'neck_01'}
HAND = lambda b: b and (b.startswith(('hand_', 'thumb', 'index', 'middle', 'ring', 'pinky')))
FOOT = lambda b: b and b.startswith(('foot_', 'ball_'))
def fdom(vs):
    c = {}
    for i in vs: c[dom[i]] = c.get(dom[i], 0) + 1
    return max(c, key=c.get)

# ---------- expression units -> morph targets (body only)
EXP = os.path.join(MH, 'targets/expression/units/caucasian')
UNITS = ['eye-left-closure', 'eye-right-closure', 'eyebrows-left-inner-up', 'eyebrows-right-inner-up',
         'eyebrows-left-up', 'eyebrows-right-up', 'eyebrows-left-down', 'eyebrows-right-down',
         'mouth-corner-puller', 'mouth-open', 'mouth-depression', 'mouth-compression', 'mouth-elevation']
ALLU = sorted(f[:-7] for f in os.listdir(EXP) if f.endswith('.target'))
ED = {u: target(os.path.join(EXP, u + '.target')) for u in ALLU}

def mag(d, i):
    t = d.get(i); return 0 if not t else math.sqrt(t[0] ** 2 + t[1] ** 2 + t[2] ** 2)

def _c(name): s_ = groups[name]; return sum((P[i] for i in s_), Vector()) / len(s_)
EYEZ = _c('joint-r-eye').z; HDY = _c('joint-head').y
# ---------- skin tint per vertex (lips, brows, lid line, cheeks)
lip = {i: mag(ED['mouth-protusion'], i) for i in ED['mouth-protusion']}
brow = {}
for u in ('eyebrows-left-up', 'eyebrows-right-up'):
    for i in ED[u]: brow[i] = max(brow.get(i, 0), mag(ED[u], i))
lid = {}
for u in ('eye-left-closure', 'eye-right-closure'):
    for i in ED[u]: lid[i] = max(lid.get(i, 0), mag(ED[u], i))
def norm(d):
    m = max(d.values()) if d else 1; return {k: v / m for k, v in d.items()}
lip, brow, lid = norm(lip), norm(brow), norm(lid)
SKIN = (0.80, 0.60, 0.50) if SEX == 'female' else (0.74, 0.55, 0.44)
def skin_col(i):
    r, g_, b = SKIN
    l = max(0.0, lip.get(i, 0) - 0.18) / 0.82
    if l > 0: k = min(1, l * 1.2) * 0.75; r, g_, b = r * (1 - k) + 0.62 * k, g_ * (1 - k) + 0.38 * k, b * (1 - k) + 0.34 * k
    bw = brow.get(i, 0)
    # brows: the strongest-moving band of the brow targets that sits above the lids
    if bw > 0.55 and lid.get(i, 0) < 0.05:
        k = min(1, (bw - 0.55) / 0.35) * 0.7; r, g_, b = r * (1 - k) + 0.16 * k, g_ * (1 - k) + 0.11 * k, b * (1 - k) + 0.08 * k
    bd = beard_w(i)
    if bd > 0: k = bd * 0.8; r, g_, b = r * (1 - k) + 0.17 * k, g_ * (1 - k) + 0.12 * k, b * (1 - k) + 0.10 * k
    return (r, g_, b, 1.0)

# ---------- male stubble beard: a soft mask over the jaw, chin and upper lip
def beard_w(i):
    if SEX != 'male' or dom[i] not in HEADB: return 0
    e = (P[14598] + P[14670]) / 2 if False else None
    ez = EYEZ; p = P[i]
    if p.y > HDY + 0.01 or abs(p.x) > 0.078: return 0
    if lip.get(i, 0) > 0.12: return 0
    top = ez - 0.052 if abs(p.x) > 0.022 else ez - 0.066      # cheek line, then the upper lip
    w = min(1, (top - p.z) / 0.012) * min(1, (p.z - (ez - 0.175)) / 0.02)
    return max(0, w)

# ---------- build objects
def build(name, faces, colfn=None, offset=0.0, keep_morphs=False):
    used = sorted({i for _, vs, _ in faces for i in vs}); remap = {o: n for n, o in enumerate(used)}
    me = bpy.data.meshes.new(name)
    me.from_pydata([P[i] for i in used], [], [[remap[i] for i in vs] for _, vs, _ in faces])
    uv = me.uv_layers.new(name='UVMap')
    li = 0
    for _, vs, ts in faces:
        for t in ts: uv.data[li].uv = VT[t] if t < len(VT) else (0, 0); li += 1
    me.validate(); me.update()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    if offset:
        bm = bmesh.new(); bm.from_mesh(me); bm.normal_update()
        for v in bm.verts: v.co += v.normal * offset
        bm.to_mesh(me); bm.free()
    if colfn:
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        for n, o in enumerate(used): ca.data[n].color = colfn(o)
    for bn, lst in W.items():
        vg = None
        for i, w in lst:
            if i in remap:
                vg = vg or ob.vertex_groups.new(name=bn); vg.add([remap[i]], w, 'REPLACE')
    if keep_morphs:
        basis = ob.shape_key_add(name='Basis', from_mix=False)
        for u in UNITS:
            k = ob.shape_key_add(name=u, from_mix=False); k.value = 0; d = ED[u]
            for o, (x, y, z) in d.items():
                if o in remap: k.data[remap[o]].co = basis.data[remap[o]].co + cv(x, y, z)
    ob.parent = ao; m = ob.modifiers.new('rig', 'ARMATURE'); m.object = ao
    return ob

body = [f for f in F if f[0] == 'body']
def lin(c): return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c[:3]) + (1.0,)
skin = [f for f in body if fdom(f[1]) in HEADB or HAND(fdom(f[1]))]
ob_skin = build('skin', skin, lambda i: lin(skin_col(i)), keep_morphs=True)
ref = build('ref', body)          # weight source for the garments, removed before export

def shell(name, faces, off, voxel, col, flat_floor=None, smooth=6):
    """offset a region of the body, close it with a voxel remesh, smooth it,
    then copy the body's skin weights onto it so it moves with the rig"""
    ob = build(name, faces, offset=off)
    for m in list(ob.modifiers): ob.modifiers.remove(m)
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    r = ob.modifiers.new('sol', 'SOLIDIFY'); r.thickness = max(off * 0.9, voxel * 1.8); r.offset = -1
    bpy.ops.object.modifier_apply(modifier='sol')
    r = ob.modifiers.new('rm', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = voxel; r.adaptivity = 0
    bpy.ops.object.modifier_apply(modifier='rm')
    r = ob.modifiers.new('sm', 'SMOOTH'); r.factor = 0.7; r.iterations = smooth
    bpy.ops.object.modifier_apply(modifier='sm')
    r = ob.modifiers.new('dec', 'DECIMATE'); r.ratio = min(1, 4500 / max(1, len(ob.data.vertices)))
    bpy.ops.object.modifier_apply(modifier='dec')
    if flat_floor is not None:
        for v in ob.data.vertices: v.co.z = max(v.co.z, flat_floor)
    for p_ in ob.data.polygons: p_.use_smooth = True
    ob.vertex_groups.clear()
    dt = ob.modifiers.new('dt', 'DATA_TRANSFER'); dt.object = ref; dt.use_vert_data = True
    dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
    dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
    bpy.ops.object.datalayout_transfer(modifier='dt'); bpy.ops.object.modifier_apply(modifier='dt')
    ca = ob.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for d in ca.data: d.color = lin(col)
    m = ob.modifiers.new('rig', 'ARMATURE'); m.object = ao
    return ob

def zc(f): return sum(P[i].z for i in f[1]) / len(f[1])
def yc(f): return sum(P[i].y for i in f[1]) / len(f[1])
elbow = cube('joint-r-elbow').z
eye = cube('joint-r-eye'); neck_z = cube('joint-neck').z if 'joint-neck' in groups else eye.z - 0.17
crotch = min(P[i].z for i in groups['helper-tights'] if abs(P[i].x) < 0.02) + 0.05

TORSO = ('spine', 'clavicle', 'upperarm', 'lowerarm', 'pelvis', 'neck')
hood_f = [f for f in body if fdom(f[1]).startswith(TORSO) and zc(f) > crotch + 0.06
          and not (fdom(f[1]).startswith('lowerarm') and zc(f) < elbow - 0.13)]
ob_top = shell('top', hood_f, 0.024, 0.012, (0.11, 0.13, 0.17) if SEX == 'male' else (0.86, 0.84, 0.79), smooth=14)
leg_f = [f for f in body if fdom(f[1]).startswith(('pelvis', 'thigh', 'calf')) and zc(f) < crotch + 0.16]
ob_legs = shell('trousers', leg_f, 0.013, 0.010, (0.05, 0.05, 0.055) if SEX == 'male' else (0.30, 0.27, 0.23))
foot_f = [f for f in body if FOOT(fdom(f[1])) or (fdom(f[1]).startswith('calf') and zc(f) < min(P[i].z for i in range(N)) + 0.13)]
floor = min(P[i].z for f in foot_f for i in f[1])
ob_feet = shell('shoes', foot_f, 0.014, 0.008, (0.92, 0.91, 0.88), flat_floor=floor - 0.012)

# hair: the scalp above the hairline, plus a short beard on the jaw for the male figure
hd = cube('joint-head'); hz = eye.z + 0.036
def scalp(f):
    if fdom(f[1]) != 'head': return False
    z, y = zc(f), yc(f)
    front = y < hd.y - 0.02          # -Y is the face side
    return (z > hz and not (front and z < hz + 0.02)) or (not front and z > eye.z - 0.035 and y > hd.y + 0.035)
hair_f = [f for f in body if scalp(f)]
HC = (0.06, 0.045, 0.035) if SEX == 'male' else (0.10, 0.065, 0.045)
ob_hair = shell('hair', hair_f, 0.009, 0.006, HC, smooth=8)
lash = [f for f in F if 'eyelashes' in f[0]]
ob_lash = build('lashes', lash, lambda i: lin((0.03, 0.02, 0.02)))
teeth = [f for f in F if 'teeth' in f[0]]
ob_teeth = build('teeth', teeth, lambda i: lin((0.85, 0.82, 0.74)))
bpy.data.objects.remove(ref)

# ---------- eyes (MakeHuman high-poly eyes, fitted through their .mhclo)
def mhclo(path):
    obj, refs, scales, mode = None, [], {}, None
    for l in open(path):
        p = l.split()
        if not p or p[0].startswith('#'): continue
        if p[0] == 'obj_file': obj = p[1]
        elif p[0] in ('x_scale', 'y_scale', 'z_scale'): scales[p[0][0]] = (int(p[1]), int(p[2]), float(p[3]))
        elif p[0] == 'verts': mode = 'v'
        elif mode == 'v' and len(p) == 9: refs.append(([int(x) for x in p[:3]], [float(x) for x in p[3:6]], [float(x) for x in p[6:9]]))
        elif mode == 'v' and len(p) == 1: refs.append(([int(p[0])] * 3, [1, 0, 0], [0, 0, 0]))
    return obj, refs, scales
eobj, refs, sc = mhclo(os.path.join(MH, 'eyes/high-poly/high-poly.mhclo'))
ev, ef = [], []
for l in open(os.path.join(MH, 'eyes/high-poly', eobj)):
    if l.startswith('v '): ev.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('f '): ef.append([int(t.split('/')[0]) - 1 for t in l.split()[1:]])
def axis_scale(k):
    a, b, d = sc[k]; j = 'xyz'.index(k); return abs(V[a][j] - V[b][j]) / d
s3 = [axis_scale(k) for k in 'xyz']
EP = []
for (vi, w, off) in refs:
    x = sum(V[vi[j]][0] * w[j] for j in range(3)) + off[0] * s3[0]
    y = sum(V[vi[j]][1] * w[j] for j in range(3)) + off[1] * s3[1]
    z = sum(V[vi[j]][2] * w[j] for j in range(3)) + off[2] * s3[2]
    EP.append(cv(x, y, z))
me = bpy.data.meshes.new('eyes'); me.from_pydata(EP, [], ef); me.update()
for p in me.polygons: p.use_smooth = True
ob_eyes = bpy.data.objects.new('eyes', me); bpy.context.scene.collection.objects.link(ob_eyes)
ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
cl, cr = cube('joint-l-eye'), cube('joint-r-eye')
for n, p in enumerate(EP):
    c = cl if (p - cl).length < (p - cr).length else cr
    d = (p - c).normalized(); ang = math.degrees(math.acos(max(-1, min(1, -d.y))))   # -Y is forward
    col = (0.02, 0.015, 0.012, 1) if ang < 9 else (0.23, 0.13, 0.07, 1) if ang < 22 else (0.11, 0.06, 0.035, 1) if ang < 24 else (0.86, 0.83, 0.79, 1)
    ca.data[n].color = lin(col)
vg = ob_eyes.vertex_groups.new(name='head'); vg.add(list(range(len(EP))), 1.0, 'REPLACE')
ob_eyes.parent = ao; m = ob_eyes.modifiers.new('rig', 'ARMATURE'); m.object = ao

for ob in bpy.context.scene.objects:
    if ob.type == 'MESH':
        mat = bpy.data.materials.new(ob.name); mat.use_nodes = True
        nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
        a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Col'
        nt.links.new(a.outputs['Color'], bsdf.inputs['Base Color'])
        ob.data.materials.append(mat)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_skins=True, export_morph=True,
                          export_morph_normal=False, export_animations=False, export_apply=False,
                          export_vertex_color='ACTIVE' if bpy.app.version >= (4, 2, 0) else None)
print('wrote', OUT, os.path.getsize(OUT), 'units', len(UNITS))
