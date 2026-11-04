#!/usr/bin/env python3
"""Build the scroll-film frame sequences for the CHARGIX v10 story stages.

Each story is a chain of 5-second Kling clips (1280x716, 24 fps) whose ends are shared keyframes, so
clip k's last frame matches clip k+1's first frame. We keep every 2nd frame (12 fps; the player
cross-dissolves neighbours), drop the duplicated first frame of every clip after the first, optionally
replace a glitchy stretch of a clip with a clean cross-dissolve, and tame over-saturated magenta skies.

Output per story: {prefix}-d-NNN.webp (1280 wide, desktop), {prefix}-m-NNN.webp (960 wide, phones),
{prefix}-poster.webp, and {prefix}-map.json listing where each clip starts in the sequence.

usage: v10-frames.py <story.json> <out_dir>
story.json: {"prefix": "ck", "clips": [{"src": "path.mp4", "dissolve": [a, b, n]}, ...]}
  dissolve [a, b, n]: keep source frames up to a, then n blended frames from a to b, then from b on.
  nightcut [a, b, n]: like dissolve, but the room dims to night before the change and the change
  happens in the dark (n frames), then dawn lifts the exposure again. Used where the model's own
  in-between frames smear furniture.
"""
import json, os, sys
import cv2
import numpy as np

cfg, out = json.load(open(sys.argv[1])), sys.argv[2]
os.makedirs(out, exist_ok=True)
P = cfg['prefix']


def read(src):
    cap, fr = cv2.VideoCapture(src), []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        fr.append(f)
    return fr


def tame(img):
    # Desaturate strongly saturated magenta/violet (hue 128-168 of 180), which only appears in skies.
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    h, s = hsv[..., 0], hsv[..., 1]
    w = np.clip((s - 70) / 80, 0, 1) * np.clip(1 - np.abs(h - 148) / 22, 0, 1)
    hsv[..., 1] = s * (1 - 0.7 * w)
    hsv[..., 0] = h + (112 - h) * 0.5 * w  # nudge toward dusk blue
    return cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)


seq, starts = [], []
for k, c in enumerate(cfg['clips']):
    fr = read(c['src'])
    idx = list(range(0, len(fr), 2))
    if idx[-1] != len(fr) - 1:
        idx.append(len(fr) - 1)
    picked = []
    if 'dissolve' in c:
        a, b, n = c['dissolve']
        picked += [fr[i] for i in idx if i <= a]
        for j in range(1, n + 1):
            u = j / (n + 1)
            u = u * u * (3 - 2 * u)
            picked.append(cv2.addWeighted(fr[a], 1 - u, fr[b], u, 0))
        picked += [fr[i] for i in idx if i >= b]
    elif 'nightcut' in c:
        a, b, n = c['nightcut']
        lo = 0.16
        def dim(img, e):
            out = img.astype(np.float32) * e
            out[..., 0] *= 1 + (1 - e) * 0.25  # a little cooler as it darkens
            return np.clip(out, 0, 255).astype(np.uint8)
        pre = [i for i in idx if i <= a]
        for j, i in enumerate(pre):
            u = max(0, (j - (len(pre) - 5)) / 4)  # last 5 kept frames fade down
            picked.append(dim(fr[i], 1 - (1 - lo) * u * u * (3 - 2 * u)))
        for j in range(1, n + 1):
            u = j / (n + 1)
            picked.append(dim(cv2.addWeighted(fr[a], 1 - u, fr[b], u, 0), lo))
        post = [i for i in idx if i >= b]
        for j, i in enumerate(post):
            u = min(1, j / 5)  # first 6 frames lift up
            picked.append(dim(fr[i], lo + (1 - lo) * u * u * (3 - 2 * u)))
    else:
        picked = [fr[i] for i in idx]
    if k > 0:
        picked = picked[1:]
    starts.append(len(seq))
    seq += picked

for i, f in enumerate(seq):
    f = tame(f)
    cv2.imwrite(os.path.join(out, f'{P}-d-{i:03d}.webp'), cv2.resize(f, (1280, 716), interpolation=cv2.INTER_AREA) if f.shape[1] != 1280 else f, [cv2.IMWRITE_WEBP_QUALITY, 80])
    cv2.imwrite(os.path.join(out, f'{P}-m-{i:03d}.webp'), cv2.resize(f, (960, 537), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_WEBP_QUALITY, 74])
    if i == 0:
        cv2.imwrite(os.path.join(out, f'{P}-poster.webp'), f, [cv2.IMWRITE_WEBP_QUALITY, 84])
json.dump({'prefix': P, 'frames': len(seq), 'starts': starts}, open(os.path.join(out, f'{P}-map.json'), 'w'))
print(P, 'frames', len(seq), 'clip starts', starts)
