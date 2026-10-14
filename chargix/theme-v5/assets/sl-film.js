// CHARGIX · Room 02 · Solenne — film player.
// The watch is path-traced offline (Blender Cycles) into a frame sequence per
// colourway; scroll progress through the room scrubs it on one 2D canvas,
// cross-dissolving between neighbouring frames. Frames load coarse-first
// (every 16th, then 8th, 4th, 2nd, all) so the film is scrubbable early.
// A colourway without its own film yet falls back to steel.
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

export function init({ canvas, stage, base, n, cws, state }) {
  const g = canvas.getContext('2d', { alpha: true });
  if (!g) throw new Error('no 2d canvas');
  const have = new Set(cws);
  const pad = (i) => String(i).padStart(3, '0');
  const sets = {};          // cw -> { imgs, started }
  let cw = have.has(state.cw) ? state.cw : 'steel';
  let p = 0, shown = -1, active = false, raf = 0, W = 0, H = 0, dpr = 1, dirty = true;

  function order() {
    const seen = new Set(), out = [];
    for (const s of [16, 8, 4, 2, 1]) for (let i = 0; i < n; i += s) if (!seen.has(i)) { seen.add(i); out.push(i); }
    if (!seen.has(n - 1)) out.splice(1, 0, n - 1);
    return out;
  }
  const queue = []; let busy = 0;
  function load(k) {
    if (sets[k]) return sets[k];
    const s = sets[k] = { imgs: new Array(n).fill(null) };
    order().forEach((i) => queue.push([s, k, i]));
    pump(); return s;
  }
  function pump() {
    while (busy < 6 && queue.length) {
      // the visible colourway loads first
      let qi = queue.findIndex((q) => q[1] === cw); if (qi < 0) qi = 0;
      const [s, k, i] = queue.splice(qi, 1)[0]; busy++;
      const im = new Image(); im.decoding = 'async';
      im.onload = () => { (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => { s.imgs[i] = im; busy--; if (k === cw) { dirty = true; kick(); } pump(); }); };
      im.onerror = () => { busy--; pump(); };
      im.src = `${base}sl-${k}-${pad(i)}.webp`;
    }
  }
  const near = (s, i, dir) => { for (let j = i; j >= 0 && j < n; j += dir) if (s.imgs[j]) return j; return -1; };

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = stage.clientWidth; H = stage.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    dirty = true; kick();
  }

  // Desktop: cover the stage, watch shifted right of the copy column.
  // Portrait phones: the frame sits in the top part of the screen, wider than
  // the screen (centre of the shot), with the copy below it.
  function rect(iw, ih) {
    const portrait = W / H < 0.9;
    if (portrait) {
      const h = H * 0.6, w = h * iw / ih;
      return [(W - w) / 2, H * 0.04, w, h];
    }
    const s = Math.max(W / iw, H / ih) * 1.02, w = iw * s, h = ih * s;
    return [W * 0.6 - w / 2, (H - h) / 2, w, h];
  }

  function draw() {
    raf = 0;
    const s = sets[cw]; if (!s) return;
    const f = p * (n - 1), i0 = Math.floor(f), t = f - i0;
    const a = near(s, i0, -1) >= 0 ? near(s, i0, -1) : near(s, i0, 1);
    if (a < 0) return;
    let b = near(s, Math.min(n - 1, i0 + 1), 1); if (b < 0) b = a;
    const key = a * 1000 + b + t;
    if (!dirty && key === shown) return; shown = key; dirty = false;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const A = s.imgs[a], B = s.imgs[b];
    const [x, y, w, h] = rect(A.naturalWidth, A.naturalHeight);
    // cross-dissolve weighted by how far between the two loaded frames we are
    const span = b - a, mix = span > 0 ? clamp((f - a) / span) : 0;
    g.globalAlpha = 1; g.drawImage(A, x, y, w, h);
    if (b !== a && mix > 0.001) { g.globalAlpha = mix; g.drawImage(B, x, y, w, h); g.globalAlpha = 1; }
  }
  function kick() { if (!raf && active) raf = requestAnimationFrame(draw); }

  addEventListener('resize', resize, { passive: true });
  resize(); load(cw);
  return {
    setProgress(v) { p = clamp(v); kick(); },
    setActive(on) { active = on; if (on) { dirty = true; kick(); } },
    setColourway(k) { const nk = have.has(k) ? k : 'steel'; if (nk === cw) return; cw = nk; load(cw); dirty = true; kick(); },
    hasColourway: (k) => have.has(k),
    setStrap() {},
    project: () => null,
  };
}
