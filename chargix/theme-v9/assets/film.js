// CHARGIX · scroll film player.
// A pre-rendered frame sequence scrubbed by scroll. The scroll position through the track picks a
// fractional frame index; the two neighbouring frames are cross-dissolved on a canvas so motion
// stays continuous between rendered frames, forwards and backwards. Progress eases toward the
// scroll target (critically damped, tau ~140 ms). Frames load coarse-first (every 16th, 8th, 4th,
// 2nd, then all) so the whole film is scrubbable almost at once; phones fetch every 2nd frame.
//
// Camera track (optional): {prefix}-track.json = [[cx, cy, z], ...] one entry per frame, where
// cx, cy are the normalised (0..1) image coordinates of the action and z >= 1 a suggested zoom.
// When present the frame is cropped like a virtual camera: portrait screens zoom
// clamp(z * 1.6, 1.4, 2.4), landscape clamp(z, 1, 1.35), centred on (cx, cy) and always clamped
// inside the image. The track is sampled with the same fractional frame index as the dissolve,
// pre-smoothed, and the camera itself eases, so it never jumps.
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;

// Resample a raw track to n entries and smooth it with a small gaussian, so per-frame jitter in the
// tracked coordinates never reaches the camera.
function prepTrack(raw, n) {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const pts = raw.map((e) => (Array.isArray(e) ? e : [e && e.cx, e && e.cy, e && e.z]))
    .map(([x, y, z]) => [clamp(+x || 0.5), clamp(+y || 0.5), Math.max(1, +z || 1)]);
  const m = pts.length, res = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? (i * (m - 1)) / (n - 1) : 0, a = Math.floor(t), b = Math.min(m - 1, a + 1), u = t - a;
    res.push([0, 1, 2].map((k) => lerp(pts[a][k], pts[b][k], u)));
  }
  const R = 6, sig = 3, w = [];
  for (let k = -R; k <= R; k++) w.push(Math.exp(-(k * k) / (2 * sig * sig)));
  return res.map((_, i) => {
    const s = [0, 0, 0]; let ws = 0;
    for (let k = -R; k <= R; k++) { const e = res[clamp(i + k, 0, n - 1)]; const q = w[k + R]; s[0] += e[0] * q; s[1] += e[1] * q; s[2] += e[2] * q; ws += q; }
    return s.map((v) => v / ws);
  });
}

function player(canvas, { base, prefix, n, step }) {
  const g = canvas.getContext('2d', { alpha: false });
  const frames = new Array(n).fill(null);
  const pad = (i) => String(i).padStart(3, '0');
  const idx = []; for (let i = 0; i < n; i += step) idx.push(i); if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  const order = []; const seen = new Set();
  for (const s of [16, 8, 4, 2, 1]) for (let k = 0; k < idx.length; k += s) if (!seen.has(k)) { seen.add(k); order.push(idx[k]); }
  if (!seen.has(idx.length - 1)) order.splice(1, 0, idx[idx.length - 1]);
  let p = 0, target = 0, last = 0, raf = 0, W = 0, H = 0, dpr = 1, shown = '', active = true, busy = 0, loaded = 0;
  let track = null, cam = null, onp = null, ondraw = null, first = null;
  const q = order.slice();
  const ready = new Promise((r) => { first = r; });
  function pump() {
    while (busy < 6 && q.length) {
      const i = q.shift(); busy++;
      const im = new Image(); im.decoding = 'async';
      im.onload = () => { (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => { frames[i] = im; busy--; loaded++; if (loaded === 1) first(); kick(true); pump(); }); };
      im.onerror = () => { busy--; pump(); };
      im.src = `${base}${prefix}-${pad(i)}.webp`;
    }
  }
  const near = (i, dir) => { for (let j = i; j >= 0 && j < n; j += dir) if (frames[j]) return j; return -1; };
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2); W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr)); cam = null; kick(true);
  }
  // Camera target at fractional frame f (same index as the cross-dissolve), or null without a track.
  function camAt(f) {
    if (!track) return null;
    const a = clamp(Math.floor(f), 0, n - 1), b = Math.min(n - 1, a + 1), u = clamp(f - a);
    return [lerp(track[a][0], track[b][0], u), lerp(track[a][1], track[b][1], u), lerp(track[a][2], track[b][2], u)];
  }
  // Without a track: the v8 framing. Landscape shows the whole box, nudged right of the captions;
  // portrait fills the width, trimmed a little at the sides, in the upper part of the stage.
  function plain(iw, ih) {
    if (W / H < 0.9) { const w = W * 1.3, h = (w * ih) / iw; return [0, 0, iw, ih, (W - w) / 2, Math.max(H * 0.04, (H * 0.7 - h) / 2), w, h]; }
    const s = Math.min(W / iw, H / ih) * (W > 1100 ? 1.0 : 1.05), w = iw * s, h = ih * s;
    return [0, 0, iw, ih, (W - w) / 2 + (W > 1100 ? W * 0.06 : 0), (H - h) / 2, w, h];
  }
  // With a track: a virtual camera crop centred on (cx, cy), clamped inside the image.
  function framed(iw, ih, c) {
    const portrait = W / H < 0.9;
    const zoom = portrait ? clamp(c[2] * 1.6, 1.4, 2.4) : clamp(c[2], 1, 1.35);
    const s = (portrait ? W / iw : Math.max(W / iw, H / ih)) * zoom;
    const sw = Math.min(iw, W / s), sh = Math.min(ih, H / s);
    const sx = clamp(c[0] * iw - sw / 2, 0, iw - sw), sy = clamp(c[1] * ih - sh / 2, 0, ih - sh);
    const dw = sw * s, dh = sh * s;
    return [sx, sy, sw, sh, (W - dw) / 2, portrait ? Math.max(0, (H - dh) * 0.38) : (H - dh) / 2, dw, dh];
  }
  function draw(now) {
    raf = 0;
    const dt = Math.min(64, last ? now - last : 16); last = now;
    p += (target - p) * (1 - Math.exp(-dt / 140));
    if (Math.abs(target - p) < 0.00005) p = target;
    if (onp) onp(p);
    const f = p * (n - 1), i0 = Math.floor(f);
    let settled = p === target;
    const ct = camAt(f);
    if (ct) {
      if (!cam) cam = ct.slice();
      else { const k = 1 - Math.exp(-dt / 160); for (let j = 0; j < 3; j++) { cam[j] += (ct[j] - cam[j]) * k; if (Math.abs(ct[j] - cam[j]) > 0.0004) settled = false; else cam[j] = ct[j]; } }
    }
    if (!settled) kick(); else last = 0;
    let a = near(i0, -1); if (a < 0) a = near(i0, 1); if (a < 0) return;
    let b = near(Math.min(n - 1, i0 + 1), 1); if (b < 0) b = a;
    const mix = b > a ? clamp((f - a) / (b - a)) : 0;
    const key = `${a}|${b}|${mix.toFixed(3)}|${W}x${H}|${cam ? cam.map((v) => v.toFixed(4)).join(',') : ''}`;
    if (key === shown) return; shown = key;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#0f0e11'; g.fillRect(0, 0, W, H);
    const A = frames[a], iw = A.naturalWidth, ih = A.naturalHeight;
    const r = cam ? framed(iw, ih, cam) : plain(iw, ih);
    g.imageSmoothingQuality = 'high';
    g.globalAlpha = 1; g.drawImage(A, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]);
    if (b !== a && mix > 0.002) { g.globalAlpha = mix; g.drawImage(frames[b], r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]); g.globalAlpha = 1; }
    if (ondraw) { ondraw(); ondraw = null; }
  }
  function kick(force) { if (force) shown = ''; if (!raf && active) raf = requestAnimationFrame(draw); }
  addEventListener('resize', resize, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  resize(); pump();
  return {
    set(v, jump) { target = clamp(v); if (jump) { p = target; cam = null; } kick(); },
    active(on) { active = on; if (on) kick(true); },
    onprogress(fn) { onp = fn; },
    ondraw(fn) { ondraw = fn; },
    track(raw) { track = prepTrack(raw, n); cam = null; kick(true); return !!track; },
    ready,
  };
}

export function init(root) {
  if (root.dataset.filmInit) return; root.dataset.filmInit = '1';
  const canvas = root.querySelector('[data-film-canvas]');
  const trackEl = root.querySelector('[data-film-track]');
  const n = +root.dataset.frames || 300;
  const caps = [...root.querySelectorAll('[data-cap]')];
  const rail = [...root.querySelectorAll('[data-rail]')];
  const bar = root.querySelector('[data-film-bar]');
  const time = root.querySelector('[data-film-time]'), day = root.querySelector('[data-film-day]');
  const introEnd = (+root.dataset.intro || 4) / 100;
  const phone = matchMedia('(max-width: 749px)').matches;
  root.classList.add('is-live');
  caps.forEach((c) => { c.setAttribute('aria-hidden', 'true'); c.inert = true; });
  const film = player(canvas, { base: root.dataset.base, prefix: root.dataset.prefix, n, step: phone ? 2 : 1 });
  film.ondraw(() => root.classList.add('is-drawn'));
  if (root.dataset.track) {
    fetch(root.dataset.track, { credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && film.track(j)) root.classList.add('has-track'); })
      .catch(() => {});
  }
  const span = () => trackEl.offsetHeight - innerHeight;
  const progress = () => { const r = trackEl.getBoundingClientRect(); const s = span(); return s > 0 ? clamp(-r.top / s) : 0; };
  let last = -1;
  function update() { film.set(progress()); }
  function paint(p) {
    if (bar) bar.style.transform = `scaleX(${p})`;
    root.classList.toggle('is-past-intro', p > introEnd);
    let cur = -1;
    caps.forEach((c, i) => {
      const on = p >= c.dataset.a / 100 && p < c.dataset.b / 100;
      if (on) cur = i;
      if (on !== c.classList.contains('is-on')) { c.classList.toggle('is-on', on); c.setAttribute('aria-hidden', on ? 'false' : 'true'); c.inert = !on; }
    });
    if (cur !== last && cur >= 0) {
      last = cur; const c = caps[cur];
      if (time && c.dataset.time) time.textContent = c.dataset.time;
      if (day && c.dataset.day) day.textContent = c.dataset.day;
      rail.forEach((r) => r.classList.toggle('is-on', +r.dataset.rail === +c.dataset.chapter));
    }
  }
  const seek = (p) => scrollTo(0, trackEl.getBoundingClientRect().top + scrollY + span() * clamp(p));
  // chapter rail: jump a little into that chapter's caption window
  rail.forEach((r) => r.addEventListener('click', (e) => {
    e.preventDefault();
    const c = caps.find((k) => +k.dataset.chapter === +r.dataset.rail); if (!c) return;
    const at = (+c.dataset.a + Math.min(4, (c.dataset.b - c.dataset.a) / 3)) / 100;
    scrollTo({ top: trackEl.getBoundingClientRect().top + scrollY + span() * at, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));
  new IntersectionObserver((es) => es.forEach((e) => {
    film.active(e.isIntersecting);
    document.dispatchEvent(new CustomEvent('cx:film', { detail: { on: e.isIntersecting, anchor: root.dataset.anchor } }));
  })).observe(trackEl);
  film.onprogress(paint);
  addEventListener('scroll', update, { passive: true }); addEventListener('resize', update, { passive: true });
  film.set(progress(), true); paint(progress());
  const api = { seek, ready: film.ready, progress };
  const reg = (window.__cxFilm = window.__cxFilm || {});
  reg[root.dataset.anchor || root.id] = api;
  if (!reg.seek) { reg.seek = api.seek; reg.ready = api.ready; }
  return api;
}

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelectorAll('[data-film]').forEach((el) => {
  if (reduce) { el.classList.add('is-static'); return; }
  try { init(el); } catch (e) {
    el.classList.remove('is-live'); el.classList.add('is-static');
    el.querySelectorAll('[data-cap]').forEach((c) => { c.inert = false; c.removeAttribute('aria-hidden'); });
  }
});
