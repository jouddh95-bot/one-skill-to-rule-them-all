#!/usr/bin/env python3
"""Turn the Higgsfield product photos in chargix/out/hf into theme assets for v10.

sw-* : Sweet & Co. (made-up bakery) store card + Essential mockup. nv-* : NOVA (made-up label) store
card and design picker. demo-* : the demo storefront pages (replaces the old CG renders).
usage: v10-assets.py [theme_dir]
"""
import os, sys
from PIL import Image

HF = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out', 'hf')
OUT = os.path.join(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HF, '..', '..', 'theme-v10'), 'assets')


def src(n):
    return Image.open(os.path.join(HF, n + '.png')).convert('RGB')


def crop(im, box):
    # box in fractions (x0, y0, x1, y1)
    w, h = im.size
    return im.crop((round(box[0] * w), round(box[1] * h), round(box[2] * w), round(box[3] * h)))


def save(im, name, size, q=82):
    im = im.copy()
    tw, th = size
    r = max(tw / im.width, th / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x, y = (im.width - tw) // 2, (im.height - th) // 2
    im.crop((x, y, x + tw, y + th)).save(os.path.join(OUT, name), 'WEBP', quality=q, method=6)
    print(name, size)


hero_sw, hero_nv = src('p40-sw-hero'), src('p44-nv-hero')
# Story cards
save(hero_sw, 'sw-hero.webp', (900, 506))
save(src('p41-sw-classic'), 'sw-p1.webp', (360, 360))
save(src('p42-sw-brown'), 'sw-p2.webp', (360, 360))
save(src('p43-sw-gift'), 'sw-p3.webp', (360, 360))
save(hero_nv, 'nv-hero.webp', (900, 506))
save(src('p45-nv-bone'), 'nv-p1.webp', (360, 360))
save(src('p46-nv-black'), 'nv-p2.webp', (360, 360))
save(src('p47-nv-mailer'), 'nv-p3.webp', (360, 360))
# Design picker: the three prints, cropped close (4:5)
save(crop(hero_nv, (0.33, 0.30, 0.67, 0.90)), 'nv-d1.webp', (240, 300))
save(crop(src('p45-nv-bone'), (0.22, 0.22, 0.78, 0.92)), 'nv-d2.webp', (240, 300))
save(crop(src('p46-nv-black'), (0.22, 0.22, 0.78, 0.92)), 'nv-d3.webp', (240, 300))
# Demo storefront pages + Essential mockup (replace the old CG cookie renders)
save(crop(hero_sw, (0.18, 0.0, 0.74, 1.0)), 'demo-hero.webp', (1200, 1200))
save(hero_sw, 'demo-kitchen.webp', (1200, 900))
save(src('p41-sw-classic'), 'demo-p1.webp', (900, 900))
save(src('p42-sw-brown'), 'demo-p2.webp', (900, 900))
save(src('p43-sw-gift'), 'demo-p3.webp', (900, 900))
save(crop(hero_sw, (0.0, 0.35, 0.5, 1.0)), 'demo-p4.webp', (900, 900))
save(crop(hero_sw, (0.18, 0.0, 0.74, 1.0)), 'pk-essential.webp', (900, 900))
