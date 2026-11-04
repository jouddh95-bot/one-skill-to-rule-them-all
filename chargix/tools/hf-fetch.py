# Download Higgsfield results listed in a job file and, for videos, extract a scroll-scrub frame sequence.
# job: {"items": [{"name": "hero-a", "url": "https://...", "fps": 24, "w": 1920}]}
# out/<name>.<ext> (original), out/<name>/f-NNN.webp (video frames), out/<name>-sheet.jpg (contact sheet)
import json, os, subprocess, sys, urllib.request
job, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
for it in json.load(open(job))["items"]:
    name, url = it["name"], it["url"]; ext = os.path.splitext(url.split("?")[0])[1] or ".bin"
    dst = os.path.join(out, name + ext)
    if not os.path.exists(dst):
        req = urllib.request.Request(url, headers={"User-Agent": "chargix-pipeline"})
        with urllib.request.urlopen(req, timeout=120) as r, open(dst, "wb") as f: f.write(r.read())
    print(name, os.path.getsize(dst))
    if ext.lower() in (".mp4", ".mov", ".webm"):
        d = os.path.join(out, name); os.makedirs(d, exist_ok=True)
        fps, w = it.get("fps", 24), it.get("w", 1920)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", dst, "-vf", f"fps={fps},scale={w}:-2:flags=lanczos", "-c:v", "libwebp", "-quality", "82", "-start_number", "0", os.path.join(d, "f-%03d.webp")], check=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", dst, "-vf", "fps=2,scale=480:-2,tile=4x4", "-frames:v", "1", os.path.join(out, name + "-sheet.jpg")], check=True)
        print(" frames", len(os.listdir(d)))
