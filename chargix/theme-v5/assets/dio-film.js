// CHARGIX · The living miniature — scroll-scrubbed film player.
// One apartment box, path-traced offline in Blender Cycles, one frame sequence per story.
// Scroll progress through the section picks the frame; neighbouring loaded frames
// cross-dissolve. Frames load coarse-first (every 16th, 8th, … 1st) so the film is
// scrubbable early; phones load every 2nd frame.
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

function player({ canvas, base, n, story, step }) {
  const g = canvas.getContext('2d', { alpha: false });
  const sets = {}; const queue = []; let busy = 0;
  let cur = story, p = 0, raf = 0, W = 0, H = 0, dpr = 1, shown = '', active = true;
  const pad = (i) => String(i).padStart(3, '0');
  const idx = []; for (let i = 0; i < n; i += step) idx.push(i); if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  function order() {
    const seen = new Set(), out = [];
    for (const s of [16, 8, 4, 2, 1]) for (let k = 0; k < idx.length; k += s) if (!seen.has(k)) { seen.add(k); out.push(idx[k]); }
    if (!seen.has(idx.length - 1)) out.splice(1, 0, idx[idx.length - 1]);
    return out;
  }
  function load(k) {
    if (sets[k]) return;
    const s = sets[k] = new Array(n).fill(null);
    order().forEach((i) => queue.push([k, i])); pump();
  }
  function pump() {
    while (busy < 6 && queue.length) {
      let qi = queue.findIndex((q) => q[0] === cur); if (qi < 0) qi = 0;
      const [k, i] = queue.splice(qi, 1)[0]; busy++;
      const im = new Image(); im.decoding = 'async';
      im.onload = () => { (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => { sets[k][i] = im; busy--; if (k === cur) kick(true); pump(); }); };
      im.onerror = () => { busy--; pump(); };
      im.src = `${base}dio-${k}-${pad(i)}.webp`;
    }
  }
  const near = (s, i, dir) => { for (let j = i; j >= 0 && j < n; j += dir) if (s[j]) return j; return -1; };
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); kick(true);
  }
  // Landscape: the whole box, as large as fits (contain, nudged up a touch).
  // Portrait phones: the box fills the width (sides trimmed a little) in the upper half.
  function rect(iw, ih) {
    if (W / H < 0.9) { const w = W * 1.22, h = w * ih / iw; return [(W - w) / 2, H * 0.05, w, h]; }
    // wide screens: the box sits right of centre so the captions (bottom left) keep clear of it
    const s = Math.min(W / iw, H / ih) * (W > 1100 ? 0.98 : 1.04), w = iw * s, h = ih * s;
    const ox = W > 1100 ? W * 0.07 : 0;
    return [(W - w) / 2 + ox, (H - h) / 2, w, h];
  }
  function draw() {
    raf = 0;
    const s = sets[cur]; if (!s) return;
    const f = p * (n - 1), i0 = Math.floor(f);
    let a = near(s, i0, -1); if (a < 0) a = near(s, i0, 1); if (a < 0) return;
    let b = near(s, Math.min(n - 1, i0 + 1), 1); if (b < 0) b = a;
    const mix = b > a ? clamp((f - a) / (b - a)) : 0;
    const key = `${cur}${a}|${b}|${mix.toFixed(3)}`; if (key === shown) return; shown = key;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#06060a'; g.fillRect(0, 0, W, H);
    const A = s[a]; const [x, y, w, h] = rect(A.naturalWidth, A.naturalHeight);
    g.globalAlpha = 1; g.drawImage(A, x, y, w, h);
    if (b !== a && mix > 0.001) { g.globalAlpha = mix; g.drawImage(s[b], x, y, w, h); g.globalAlpha = 1; }
  }
  function kick(force) { if (force) shown = ''; if (!raf && active) raf = requestAnimationFrame(draw); }
  addEventListener('resize', resize, { passive: true }); resize(); load(cur);
  return {
    set(v) { p = clamp(v); kick(); },
    story(k) { if (k === cur) return; cur = k; load(k); kick(true); },
    active(on) { active = on; if (on) kick(true); },
    ready: (k) => !!(sets[k] && sets[k][0]),
  };
}

export function init(root) {
  const canvas = root.querySelector('[data-dio-canvas]');
  const track = root.querySelector('[data-dio-track]');
  const base = root.dataset.base, n = +root.dataset.frames || 180;
  const phone = matchMedia('(max-width: 749px)').matches;
  const tabs = [...root.querySelectorAll('[data-dio-story]')];
  const caps = [...root.querySelectorAll('[data-dio-cap]')];
  const bar = root.querySelector('[data-dio-bar]');
  let story = root.dataset.story || 'cookie';
  root.classList.add('is-live');            // before sizing: the canvas is hidden until then
  const film = player({ canvas, base, n, story, step: phone ? 2 : 1 });

  function progress() {
    const r = track.getBoundingClientRect(), span = r.height - innerHeight;
    return span > 0 ? clamp(-r.top / span) : 0;
  }
  function update() {
    const p = progress(); film.set(p);
    if (bar) bar.style.transform = `scaleX(${p})`;
    for (const c of caps) {
      const on = c.dataset.story === story && p >= c.dataset.a / 100 && p < c.dataset.b / 100;
      if (on !== c.classList.contains('is-on')) { c.classList.toggle('is-on', on); c.setAttribute('aria-hidden', on ? 'false' : 'true'); }
    }
  }
  function choose(k) {
    story = k; root.dataset.story = k; film.story(k);
    tabs.forEach((t) => t.setAttribute('aria-pressed', t.dataset.dioStory === k ? 'true' : 'false'));
    update();
  }
  tabs.forEach((t) => t.addEventListener('click', () => choose(t.dataset.dioStory)));
  new IntersectionObserver((es) => es.forEach((e) => film.active(e.isIntersecting)), { rootMargin: '200px' }).observe(track);
  addEventListener('scroll', update, { passive: true }); addEventListener('resize', update, { passive: true });
  choose(story);
}

document.querySelectorAll('[data-dio]').forEach((el) => { try { init(el); } catch (e) { el.classList.add('is-static'); } });
