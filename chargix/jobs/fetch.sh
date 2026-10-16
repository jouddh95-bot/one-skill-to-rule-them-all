# seq 3: download the chosen CC0 Poly Haven assets (glTF 1k models, PBR textures, HDRIs) into chargix/assets/ph
O=$(realpath $1); D=$(realpath chargix)/assets/ph; mkdir -p $D
python3 - "$D" <<'PY'
import json, os, sys, urllib.request
D = sys.argv[1]
def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'chargix-pipeline'}), timeout=120).read()
MODELS = '''sofa_02 throw_pillows_01 modern_coffee_table_01 modern_arm_chair_01 Ottoman_01 potted_plant_01 potted_plant_02
potted_plant_04 planter_box_01 modern_ceiling_lamp_01 hanging_industrial_lamp industrial_wall_lamp wooden_display_shelves_01
steel_frame_shelves_03 wooden_table_02 small_wooden_table_01 modern_wooden_cabinet classic_laptop stationery_supplies
office_notepads book_encyclopedia_set_01 decorative_book_set_01 electric_stove vintage_electric_kettle vintage_microwave
wooden_cutting_board wooden_bowl_01 wooden_spoon pot_enamel_01 jug_01 ceramic_vase_01 ceramic_vase_02 ceramic_vase_03
tea_set_01 croissant carrot_cake wicker_basket_02 hanging_picture_frame_01 hanging_picture_frame_02 hanging_picture_frame_03
wall_clock side_table_01 standing_picture_frame_01 bar_chair_round_01 drawer_cabinet modern_ceiling_lamp_01 dining_chair_02'''.split()
TEX = {'herringbone_parquet': '2k', 'plastered_wall_04': '2k', 'kitchen_wood': '1k', 'marble_01': '1k', 'long_white_tiles': '1k',
       'rough_linen': '1k', 'knitted_fleece': '1k', 'cotton_jersey': '1k', 'oak_veneer_01': '1k', 'fabric_pattern_07': '1k', 'leather_white': '1k'}
HDRI = {'shanghai_riverside': '2k', 'shanghai_bund': '2k', 'venice_dawn_2': '1k'}
log = []
for m in dict.fromkeys(MODELS):
    try:
        f = json.loads(get(f'https://api.polyhaven.com/files/{m}'))
        g = f['gltf']['1k']['gltf']; os.makedirs(f'{D}/{m}', exist_ok=True)
        open(f'{D}/{m}/{m}.gltf', 'wb').write(get(g['url']))
        for p, inc in g.get('include', {}).items():
            os.makedirs(os.path.dirname(f'{D}/{m}/{p}'), exist_ok=True); open(f'{D}/{m}/{p}', 'wb').write(get(inc['url']))
        log.append(f'ok model {m}')
    except Exception as e: log.append(f'FAIL model {m} {e}')
for t, res in TEX.items():
    try:
        f = json.loads(get(f'https://api.polyhaven.com/files/{t}')); os.makedirs(f'{D}/tex/{t}', exist_ok=True)
        for k in ('Diffuse', 'nor_gl', 'Rough', 'AO', 'Displacement', 'arm'):
            if k in f and res in f[k]:
                fmt = 'jpg' if 'jpg' in f[k][res] else 'png'; open(f'{D}/tex/{t}/{k}.{fmt}', 'wb').write(get(f[k][res][fmt]['url']))
        log.append(f'ok tex {t} {sorted(os.listdir(f"{D}/tex/{t}"))}')
    except Exception as e: log.append(f'FAIL tex {t} {e}')
for h, res in HDRI.items():
    try:
        f = json.loads(get(f'https://api.polyhaven.com/files/{h}')); os.makedirs(f'{D}/hdri', exist_ok=True)
        open(f'{D}/hdri/{h}.hdr', 'wb').write(get(f['hdri'][res]['hdr']['url'])); log.append(f'ok hdri {h}')
    except Exception as e: log.append(f'FAIL hdri {h} {e}')
open(f'{D}/LICENSE.txt', 'w').write('All files in this folder are CC0 assets from Poly Haven (https://polyhaven.com), downloaded via its public API.\n')
print('\n'.join(log))
PY
du -sh $D; du -sh $D/* | sort -h | tail -15
