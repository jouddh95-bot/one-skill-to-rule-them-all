# Emit themeFilesUpsert batches (50 files each) as JSON, using raw GitHub URLs pinned to a commit.
# usage: python upsert-batches.py <sha> <outdir> <theme-relative files or dir:prefix=srcdir ...>
#   theme-v8/...           → the file at the same theme path
#   film:<srcdir>          → every .webp in srcdir uploaded as assets/<name>
import json, os, sys
sha, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
REPO = "https://raw.githubusercontent.com/jouddh95-bot/one-skill-to-rule-them-all/" + sha + "/"
files = []
for a in sys.argv[3:]:
    if a.startswith("film:"):
        d = a[5:]
        for f in sorted(os.listdir(d)):
            if f.endswith(".webp"): files.append({"filename": "assets/" + f, "body": {"type": "URL", "value": REPO + os.path.relpath(os.path.join(d, f), "/home/claude/one-skill-to-rule-them-all")}})
    else:
        rel = os.path.relpath(a, "/home/claude/one-skill-to-rule-them-all/chargix/theme-v8")
        files.append({"filename": rel, "body": {"type": "URL", "value": REPO + os.path.relpath(a, "/home/claude/one-skill-to-rule-them-all")}})
for i in range(0, len(files), 50):
    json.dump(files[i:i + 50], open(os.path.join(out, f"b{i // 50:02d}.json"), "w"))
print(len(files), "files in", (len(files) + 49) // 50, "batches")
