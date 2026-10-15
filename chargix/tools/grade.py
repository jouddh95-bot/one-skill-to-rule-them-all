# Photo grade for the demo product renders: neutralise the warm cast, add contrast, export webp.
# usage: python grade.py in.png out.webp [width]
import sys
import numpy as np
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]; W = int(sys.argv[3]) if len(sys.argv) > 3 else 0
a = np.asarray(Image.open(src).convert("RGB")).astype(np.float32) / 255
a = a * np.array([0.93, 0.98, 1.06])                       # white balance toward neutral
lum = a @ np.array([0.2126, 0.7152, 0.0722])
a = lum[..., None] + (a - lum[..., None]) * 0.86            # ease saturation
a = np.clip((a - 0.5) * 1.28 + 0.5 - 0.035, 0, 1)            # contrast, slightly deeper blacks
a = a ** 1.08
im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
if W: im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
im.save(dst, quality=84, method=6)
