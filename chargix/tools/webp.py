import sys
from PIL import Image
src, dst, q = sys.argv[1], sys.argv[2], int(sys.argv[3])
crop = len(sys.argv) > 4
im = Image.open(src).convert("RGB")
if crop:
    w, h = im.size; cw = round(w * 0.4); x = (w - cw) // 2
    im = im.crop((x, 0, x + cw, h))
im.save(dst, "WEBP", quality=q, method=6)
