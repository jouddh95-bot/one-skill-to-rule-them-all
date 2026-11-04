#!/usr/bin/env bash
# Pack theme-v11 for themeCreate: copy the scene bundle in, convert rendered stills to WebP, zip.
# usage: tools/v11-pack.sh <bundle.js> <stills-dir-with-png>
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
bundle="$1"; stills="$2"
cp "$bundle" "$here/theme-v11/assets/cx-grow.js"
python3 - "$stills" "$here/theme-v11/assets" <<'PY'
import sys, os
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
for f in sorted(os.listdir(src)):
    if f.endswith('.png'):
        im = Image.open(os.path.join(src, f)).convert('RGB')
        out = os.path.join(dst, f[:-4] + '.webp'); im.save(out, 'WEBP', quality=80, method=6)
        print(f, '->', os.path.getsize(out) // 1024, 'KB')
PY
mkdir -p "$here/out/zip"; rm -f "$here/out/zip/theme-v11.zip"
(cd "$here/theme-v11" && zip -qr -X "$here/out/zip/theme-v11.zip" assets config layout locales sections snippets templates)
ls -la "$here/out/zip/theme-v11.zip"
