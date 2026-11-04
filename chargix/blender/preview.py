# Render selected frames of a sequence at preview size: python preview.py <seq> <out> <W> <H> <spp> <frames...>
import sys, runpy
seq, out, w, h, spp, *frames = sys.argv[1:]
for f in frames:
    sys.argv = ["monument.py", seq, f, str(int(f) + 1), out, w, h, spp]
    runpy.run_path(__file__.replace("preview.py", "monument.py"), run_name="__main__")
