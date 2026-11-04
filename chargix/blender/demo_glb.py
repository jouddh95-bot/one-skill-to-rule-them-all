# CHARGIX · the interactive 3D model for the "Sweet & Co." demo storefronts: one open gift box of
# cookies with its lid beside it. Same geometry and materials as demo.py, with every procedural
# material baked (colour + bump normals) into one 2048 px atlas so it survives glTF export.
# usage: python demo_glb.py <out.glb>
import bpy, os, sys
SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "demo.py")).read().split("# studio")[0]
OUTGLB = sys.argv[1]; sys.argv = [sys.argv[0], os.path.dirname(os.path.abspath(OUTGLB)) or "."]
exec(compile(SRC, "demo.py", "exec"))
# model-viewer has no path tracing, so give the dough a deeper bake and sink the chips into it
r = DOUGH.node_tree.nodes["Color Ramp"].color_ramp; r.elements[0].color = hexc("#8a4b1c"); r.elements[1].color = hexc("#d79a55")
_cookie = cookie
def cookie(name, m, top, loc, r=0.04, seed=1):
    o = _cookie(name, m, top, loc, r, seed)
    for c in o.children: c.location.z = r * 0.17; c.scale = (1.1, 0.95, 0.5)
    return o
gift("m1", (0, 0, 0), (0.3, 0.3, 0.07), DOUGH, CHIP, True, 9)
dg = bpy.context.evaluated_depsgraph_get(); meshes = []
for o in [o for o in bpy.data.objects if o.type == "MESH"]:
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); me.transform(o.matrix_world)
    n = bpy.data.objects.new(o.name + "_x", me); col.objects.link(n); meshes.append(n)
for o in [o for o in bpy.data.objects if o not in meshes]: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action="DESELECT")
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]; bpy.ops.object.join(); M = bpy.context.view_layer.objects.active; M.name = "SweetCoGiftBox"
me = M.data
for p in me.polygons: p.use_smooth = True
keep = me.uv_layers.get("UVMap"); bake_uv = me.uv_layers.new(name="bake"); me.uv_layers.active = bake_uv
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004); bpy.ops.object.mode_set(mode="OBJECT")
# the label uses the original UVs; route every material's image nodes through them explicitly
for m in me.materials:
    nt = m.node_tree
    for nd in [n for n in nt.nodes if n.type == "TEX_IMAGE" and not n.inputs["Vector"].is_linked]:
        uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = me.uv_layers[0].name; nt.links.new(uvn.outputs["UV"], nd.inputs["Vector"])
S = 2048; scene.render.engine = "CYCLES"; scene.cycles.samples = 4; scene.cycles.device = "CPU"
def bake(kind, img):
    for m in me.materials:
        nt = m.node_tree; t = nt.nodes.get("_bake") or nt.nodes.new("ShaderNodeTexImage"); t.name = "_bake"; t.image = img
        u = nt.nodes.get("_bakeuv") or nt.nodes.new("ShaderNodeUVMap"); u.name = "_bakeuv"; u.uv_map = "bake"; nt.links.new(u.outputs["UV"], t.inputs["Vector"])
        for n in nt.nodes: n.select = False
        t.select = True; nt.nodes.active = t
    if kind == "DIFFUSE":
        scene.render.bake.use_pass_direct = False; scene.render.bake.use_pass_indirect = False; scene.render.bake.use_pass_color = True
    scene.render.bake.margin = 6; bpy.ops.object.bake(type=kind, uv_layer="bake")
col_img = bpy.data.images.new("sweetco_color", S, S); nrm_img = bpy.data.images.new("sweetco_normal", S, S, is_data=True); nrm_img.colorspace_settings.name = "Non-Color"
bake("DIFFUSE", col_img); bake("NORMAL", nrm_img)
rgh_img = bpy.data.images.new("sweetco_rough", S, S, is_data=True); rgh_img.colorspace_settings.name = "Non-Color"; bake("ROUGHNESS", rgh_img)
ao_img = bpy.data.images.new("sweetco_ao", S, S); scene.cycles.samples = 64; bake("AO", ao_img)
import numpy as np
c = np.array(col_img.pixels[:]).reshape(-1, 4); a = np.array(ao_img.pixels[:]).reshape(-1, 4)[:, :1]
c[:, :3] *= 0.35 + 0.65 * a; col_img.pixels[:] = c.ravel()
for img in (col_img, nrm_img, rgh_img):
    img.filepath_raw = os.path.join(os.path.dirname(os.path.abspath(OUTGLB)), img.name + ".png"); img.file_format = "PNG"; img.save()
F = bpy.data.materials.new("SweetCo"); F.use_nodes = True; nt = F.node_tree; b = nt.nodes["Principled BSDF"]
def tex(img, nc=False):
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = img
    u = nt.nodes.new("ShaderNodeUVMap"); u.uv_map = "bake"; nt.links.new(u.outputs["UV"], t.inputs["Vector"]); return t
nt.links.new(tex(col_img).outputs["Color"], b.inputs["Base Color"])
nm = nt.nodes.new("ShaderNodeNormalMap"); nm.uv_map = "bake"; nt.links.new(tex(nrm_img).outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
nt.links.new(tex(rgh_img).outputs["Color"], b.inputs["Roughness"])
me.materials.clear(); me.materials.append(F)
for l in list(me.uv_layers):
    if l.name != "bake": me.uv_layers.remove(l)
bpy.ops.object.select_all(action="DESELECT"); M.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUTGLB, export_format="GLB", use_selection=True, export_image_format="WEBP" if hasattr(bpy.types, "Image") else "AUTO", export_apply=True)
print("glb", OUTGLB, os.path.getsize(OUTGLB), "faces", len(me.polygons))
