#!/usr/bin/env python3
"""Encode the two opening loops (they play before the scroll film starts) as H.264 MP4 and VP9 WebM.

Each Higgsfield loop starts and ends on the same keyframe as frame 0 of its film, so the hand-off to
the scroll film is seamless. Applies the same sky taming as v10-frames.py.
usage: v10-loops.py <out_dir>
"""
import os, subprocess, sys
import cv2
import numpy as np

HF = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out', 'hf')
out = sys.argv[1]
os.makedirs(out, exist_ok=True)


def tame(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    h, s = hsv[..., 0], hsv[..., 1]
    w = np.clip((s - 70) / 80, 0, 1) * np.clip(1 - np.abs(h - 148) / 22, 0, 1)
    hsv[..., 1] = s * (1 - 0.7 * w)
    hsv[..., 0] = h + (112 - h) * 0.5 * w
    return cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)


for name, src in (('ck-loop', 'hero-loop.mp4'), ('nv-loop', 'nv-loop.mp4')):
    cap = cv2.VideoCapture(os.path.join(HF, src))
    fr = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        fr.append(tame(f))
    fr = fr[:-1]  # the last frame repeats the first; drop it so the loop doesn't stutter
    h, w = fr[0].shape[:2]
    raw = b''.join(f.tobytes() for f in fr)
    base = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}', '-r', '24', '-i', '-']
    subprocess.run(base + ['-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
                           os.path.join(out, name + '.mp4')], input=raw, check=True)
    subprocess.run(base + ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', '-an',
                           os.path.join(out, name + '.webm')], input=raw, check=True)
    cv2.imwrite(os.path.join(out, name + '-first.png'), fr[0])
    print(name, len(fr), 'frames', {e: os.path.getsize(os.path.join(out, name + e)) for e in ('.mp4', '.webm')})
