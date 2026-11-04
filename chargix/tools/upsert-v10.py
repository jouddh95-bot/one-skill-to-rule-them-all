# Emit themeFilesUpsert batches (50 files each) for the heavy theme-v10 assets the base zip leaves out
# (film frames, loops, GLB), as URL bodies on raw GitHub pinned to a commit.
# usage: python upsert-v10.py <sha> <outdir> [glob ...]   (default: ck-* nv-* *.glb *.mp4 *.webm)
import fnmatch, json, os, sys
sha, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
pats = sys.argv[3:] or ["ck-*", "nv-*", "*.glb", "*.mp4", "*.webm"]
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "theme-v10", "assets")
REPO = "https://raw.githubusercontent.com/jouddh95-bot/one-skill-to-rule-them-all/" + sha + "/chargix/theme-v10/assets/"
names = sorted(f for f in os.listdir(root) if any(fnmatch.fnmatch(f, p) for p in pats))
files = [{"filename": "assets/" + f, "body": {"type": "URL", "value": REPO + f}} for f in names]
for i in range(0, len(files), 50):
    json.dump(files[i:i + 50], open(os.path.join(out, f"b{i // 50:02d}.json"), "w"))
print(len(files), "files in", (len(files) + 49) // 50, "batches")
