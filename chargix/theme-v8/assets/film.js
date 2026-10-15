// CHARGIX · the box film. A path-traced frame sequence (Blender Cycles), scrubbed by scroll.
// Scroll position through the track picks a fractional frame; the two neighbouring frames are
// cross-dissolved on a canvas so motion stays continuous between rendered frames, forwards and
// backwards. Frames load coarse-first (every 16th, 8th, 4th, 2nd, then all), so the whole story is
// scrubbable almost immediately and sharpens as it loads; phones fetch every 2nd frame.
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

function player(canvas, { base, prefix, n, step }) {
  const g = canvas.getContext('2d', { alpha: false });
  const frames = new Array(n).fill(null);
  const pad = (i) => String(i).padStart(3, '0');
  const idx = []; for (let i = 0; i < n; i += step) idx.push(i); if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  const order = []; const seen = new Set();
  for (const s of [16, 8, 4, 2, 1]) for (let k = 0; k < idx.length; k += s) if (!seen.has(k)) { seen.add(k); order.push(idx[k]); }
  if (!seen.has(idx.length - 1)) order.splice(1, 0, idx[idx.length - 1]);
  let p = 0, raf = 0, W = 0, H = 0, dpr = 1, shown = '', active = true, busy = 0, q = order.slice(), first = null;
  const ready = new Promise((r) => { first = r; });
  function pump() {
    while (busy < 6 && q.length) {
      // fetch what is closest to the current position first, among the next coarse level
      const i = q.shift(); busy++;
      const im = new Image(); im.decoding = 'async';
      im.onload = () => { (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => { frames[i] = im; busy--; if (i === 0 || frames.filter(Boolean).length === 1) first(); kick(true); pump(); }); };
      im.onerror = () => { busy--; pump(); };
      im.src = `${base}${prefix}-${pad(i)}.webp`;
    }
  }
  const near = (i, dir) => { for (let j = i; j >= 0 && j < n; j += dir) if (frames[j]) return j; return -1; };
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2); W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); kick(true);
  }
  // Landscape: the whole box as large as fits, nudged right so captions (bottom left) keep clear.
  // Portrait: the box fills the width, trimmed a little at the sides, in the upper part of the screen.
  function rect(iw, ih) {
    if (W / H < 0.9) { const w = W * 1.3, h = w * ih / iw; return [(W - w) / 2, Math.max(H * 0.08, (H * 0.62 - h) / 2), w, h]; }
    const s = Math.min(W / iw, H / ih) * (W > 1100 ? 1.0 : 1.05), w = iw * s, h = ih * s;
    return [(W - w) / 2 + (W > 1100 ? W * 0.06 : 0), (H - h) / 2, w, h];
  }
  function draw() {
    raf = 0;
    const f = p * (n - 1), i0 = Math.floor(f);
    let a = near(i0, -1); if (a < 0) a = near(i0, 1); if (a < 0) return;
    let b = near(Math.min(n - 1, i0 + 1), 1); if (b < 0) b = a;
    const mix = b > a ? clamp((f - a) / (b - a)) : 0;
    const key = `${a}|${b}|${mix.toFixed(3)}|${W}`; if (key === shown) return; shown = key;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#0d0c0f'; g.fillRect(0, 0, W, H);
    const A = frames[a]; const [x, y, w, h] = rect(A.naturalWidth, A.naturalHeight);
    g.globalAlpha = 1; g.drawImage(A, x, y, w, h);
    if (b !== a && mix > 0.002) { g.globalAlpha = mix; g.drawImage(frames[b], x, y, w, h); g.globalAlpha = 1; }
  }
  function kick(force) { if (force) shown = ''; if (!raf && active) raf = requestAnimationFrame(draw); }
  addEventListener('resize', resize, { passive: true }); resize(); pump();
  return { set(v) { p = clamp(v); kick(); }, active(on) { active = on; if (on) kick(true); }, ready };
}

export function init(root) {
  const canvas = root.querySelector('[data-film-canvas]');
  const track = root.querySelector('[data-film-track]');
  const n = +root.dataset.frames || 300;
  const caps = [...root.querySelectorAll('[data-cap]')];
  const rail = [...root.querySelectorAll('[data-rail]')];
  const bar = root.querySelector('[data-film-bar]');
  const time = root.querySelector('[data-film-time]'), day = root.querySelector('[data-film-day]');
  const introEnd = (+root.dataset.intro || 4) / 100;
  const phone = matchMedia('(max-width: 749px)').matches;
  root.classList.add('is-live');
  const film = player(canvas, { base: root.dataset.base, prefix: root.dataset.prefix, n, step: phone ? 2 : 1 });
  const span = () => track.offsetHeight - innerHeight;
  const progress = () => { const r = track.getBoundingClientRect(); const s = span(); return s > 0 ? clamp(-r.top / s) : 0; };
  let last = -1;
  function update() {
    const p = progress(); film.set(p);
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
  // chapter rail: jump to the middle of that chapter's caption window
  rail.forEach((r) => r.addEventListener('click', (e) => {
    e.preventDefault();
    const c = caps.find((k) => +k.dataset.chapter === +r.dataset.rail); if (!c) return;
    const at = (+c.dataset.a + Math.min(4, (c.dataset.b - c.dataset.a) / 3)) / 100;
    scrollTo({ top: track.getBoundingClientRect().top + scrollY + span() * at, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));
  new IntersectionObserver((es) => es.forEach((e) => { film.active(e.isIntersecting); document.dispatchEvent(new CustomEvent('cx:film', { detail: { on: e.isIntersecting } })); }), { rootMargin: '0px' }).observe(track);
  addEventListener('scroll', update, { passive: true }); addEventListener('resize', update, { passive: true });
  caps.forEach((c) => { c.inert = true; });
  update();
  window.__cxFilm = { seek: (p) => scrollTo(0, track.getBoundingClientRect().top + scrollY + span() * p), ready: film.ready };
}

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelectorAll('[data-film]').forEach((el) => {
  if (reduce) { el.classList.add('is-static'); return; }
  try { init(el); } catch (e) { el.classList.remove('is-live'); el.classList.add('is-static'); }
});
