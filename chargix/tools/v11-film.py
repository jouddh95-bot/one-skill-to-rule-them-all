# CHARGIX v11 desert film: turn the four Higgsfield clips into the scroll film's frames.
# Clips (chained by shared keyframes): 1 seed -> sprout, 2 sprout -> young tree, 3 tree -> store, 4 day -> night.
# Writes into chargix/theme-v11/assets:
#   gf-d-NNN.webp  desktop frames (1280x720)
#   gf-m-NNN.webp  phone frames, centre crop (640x720)
#   grow-d-0..5.webp / grow-m-0..5.webp  posters and stills taken from the film
# and chargix/v11-film/film.json with the frame count and where each clip starts (read by tools/v11-index.py).
# Run:  python3 chargix/tools/v11-film.py clip1.mp4 clip2.mp4 clip3.mp4 clip4.mp4
import json, os, shutil, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', 'theme-v11', 'assets')
PER_CLIP = int(os.environ.get('PER_CLIP', 80))   # frames kept per 5 s clip (16 per second)
DW, DH, MW = 1280, 720, 640
clips = sys.argv[1:]

def unblue(im):
    # Clip 2 morphs the sprout's leaf into the tree and the leaf's underside comes out teal-blue for
    # about a second. Tint those pixels (upper middle of the frame only) to the canopy's olive.
    a = np.asarray(im).astype(np.float32); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    core = (b > r + 8) & (g > r); core[450:] = False; core[:, :300] = False; core[:, 1000:] = False
    if not core.any(): return im
    m = (np.asarray(Image.fromarray((core * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))) > 0) & (b > r - 6)
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    a[..., 0][m] = lum[m] * 1.05; a[..., 1][m] = lum[m] * 1.12; a[..., 2][m] = lum[m] * 0.55
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))
assert len(clips) == 4, 'need four clips'

for f in os.listdir(ASSETS):
    if f.startswith('gf-') and f.endswith('.webp'): os.remove(os.path.join(ASSETS, f))

frames, starts = [], []
tmp = tempfile.mkdtemp()
for ci, clip in enumerate(clips):
    d = os.path.join(tmp, str(ci)); os.makedirs(d)
    subprocess.run(['ffmpeg', '-v', 'error', '-i', clip, '-vf', f'scale={DW}:{DH}:flags=lanczos', os.path.join(d, 'f%04d.png')], check=True)
    src = sorted(os.listdir(d))
    # PER_CLIP + 1 evenly spaced frames from first to last; the first is dropped for clips 2-4
    # because it repeats the previous clip's last frame (they share a keyframe).
    idx = [round(i * (len(src) - 1) / PER_CLIP) for i in range(PER_CLIP + 1)]
    if ci: idx = idx[1:]
    starts.append(len(frames) - (1 if ci else 0))
    frames += [os.path.join(d, src[i]) for i in idx]

n = len(frames)
for i, fp in enumerate(frames):
    im = Image.open(fp).convert('RGB')
    if starts[1] + 36 <= i <= starts[1] + 62: im = unblue(im); im.save(fp)
    im.save(os.path.join(ASSETS, f'gf-d-{i:03d}.webp'), quality=72, method=5)
    x0 = (DW - MW) // 2
    im.crop((x0, 0, x0 + MW, DH)).save(os.path.join(ASSETS, f'gf-m-{i:03d}.webp'), quality=74, method=5)

ends = starts[1:] + [n - 1]
# posters/stills: opening, mid clip 1, end clip 2, mid clip 3, mid clip 4, last frame
picks = [0, (starts[0] + ends[0]) // 2, ends[1], (starts[2] + ends[2]) // 2, (starts[3] + ends[3]) // 2, n - 1]
for k, i in enumerate(picks):
    im = Image.open(frames[i]).convert('RGB')
    im.save(os.path.join(ASSETS, f'grow-d-{k}.webp'), quality=84, method=5)
    x0 = (DW - MW) // 2
    im.crop((x0, 0, x0 + MW, DH)).save(os.path.join(ASSETS, f'grow-m-{k}.webp'), quality=82, method=5)

os.makedirs(os.path.join(HERE, '..', 'v11-film'), exist_ok=True)
json.dump({'n': n, 'starts': starts, 'per_clip': PER_CLIP, 'hero': round(PER_CLIP * 0.3), 'size_d': [DW, DH], 'size_m': [MW, DH], 'stills': picks},
          open(os.path.join(HERE, '..', 'v11-film', 'film.json'), 'w'), indent=1)
shutil.rmtree(tmp)
tot = sum(os.path.getsize(os.path.join(ASSETS, f)) for f in os.listdir(ASSETS) if f.startswith('gf-'))
print(f'{n} frames, clip starts {starts}, {tot / 1e6:.1f} MB of frames')
