// CHARGIX v11 · desert film
// The "From the ground up" section plays a pre-rendered film (made with Higgsfield) with the scroll:
// a seed in the sand sprouts, grows into a palo verde, a store rises around it and the night comes in.
// It is footage played by the scroll, not live 3D, and the page says so.
//
// Movement: on arrival the opening shot plays by itself (the camera glides in toward the seed). After that
// the scroll drives the film, and the scene never freezes: the camera breathes slowly, and a light layer of
// dust in the sun, falling gold petals during the bloom and fireflies at night keeps moving, drifting with
// the scroll as if it were in front of the lens.
//
// Smoothness rules:
// - The film follows the scroll with very little easing (no floaty trailing), and neighbouring frames are
//   cross-dissolved, so the picture moves continuously between the 16 frames per second of footage.
// - Frames are fetched once, the opening shot first, then nearest to the playhead (ahead of it first), and
//   decoded off the main thread (createImageBitmap) in a window that reaches further ahead than behind.
//   A small copy of every frame stays in memory, so a fast fling always has a picture.
// - The film canvas holds one frame at the film's own size and only repaints when the frame or the dissolve
//   changes. Scale and placement are a CSS transform (GPU compositing). The particle layer is a small canvas
//   drawn with pre-rendered sprites.
// - Layout is read once per animation frame, then styles are written, and a style is only written when its
//   value changes.
(() => {
  const root = document.querySelector('[data-grow]');
  if (!root) return;
  const cfgEl = root.querySelector('script[data-film-config]');
  const canvas = root.querySelector('canvas[data-grow-film]');
  if (!cfgEl || !canvas) return;
  root.classList.add('is-on', 'is-film');

  const C = JSON.parse(cfgEl.textContent);
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, u) => a + (b - a) * u;
  const smooth = (a, b, x) => { if (b <= a) return x >= b ? 1 : 0; const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const easeOut = (u) => 1 - Math.pow(1 - u, 3);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad = (i) => String(i).padStart(3, '0');
  const put = (el, k, v) => { const c = el.__g || (el.__g = {}); if (c[k] !== v) { c[k] = v; if (k[0] === '-') el.style.setProperty(k, v); else el.style[k] = v; } };
  const release = (b) => { if (b && b.close) b.close(); };
  const fromImage = (src, revoke) => new Promise((res, rej) => {
    const im = new Image(); im.decoding = 'async';
    im.onload = () => (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => { if (revoke) URL.revokeObjectURL(src); res(im); });
    im.onerror = () => { if (revoke) URL.revokeObjectURL(src); rej(new Error('img')); };
    im.src = src;
  });
  const decodeBlob = (bl) => (typeof createImageBitmap === 'function' ? createImageBitmap(bl) : Promise.reject(new Error('no bitmap'))).catch(() => fromImage(URL.createObjectURL(bl), true));

  const stick = root.querySelector('[data-grow-stick]');
  const g = canvas.getContext('2d');
  const fg = g; // particles are painted into the film canvas itself, so the page composites one layer, not two
  const chapters = [...root.querySelectorAll('[data-ch]')].map((el) => ({ el, a: +el.dataset.from, b: +el.dataset.to, hold: el.hasAttribute('data-hold'), on: false }));
  const bars = [...root.querySelectorAll('[data-bar]')].map((el) => ({ el, a: +el.dataset.from, b: +el.dataset.to, on: null }));
  const hero = root.querySelector('[data-grow-hero]'), scrim = root.querySelector('[data-grow-scrim]'), cue = root.querySelector('[data-grow-cue]');
  const n = C.n, MAP = C.map; // MAP: [[p, frame], ...] scroll position (0-1 of the section) to film frame
  const HF = MAP[0][1];        // the frame the opening shot glides to
  const INTRO_MS = C.introMs || 3200;

  let W = 1, H = 1, top = 0, len = 1, mobile = false, active = true, near = false, cS = 1, cL = 0, cT = 0;
  let pT = 0, p = 0, pPrev = 0, ft = 0, f = 0, lastFt = -1, dir = 1, last = 0, shown = false, drawnKey = '';
  let intro = reduce ? 1 : 0, introGo = false;

  // ---- frames -----------------------------------------------------------------------------------
  let set = '', gen = 0, fw = 1, fh = 1, PW = 320;
  let blobs = [], prox = [], keep = [], queued = [];
  const bmps = new Map(), decoding = new Set(), proxQ = [];
  let proxBusy = 0, busy = 0, pumpFn = null;
  const fade = document.createElement('canvas');
  const AHEAD = 30, BEHIND = 10;
  const winLo = () => Math.round(ft) - (dir > 0 ? BEHIND : AHEAD), winHi = () => Math.round(ft) + (dir > 0 ? AHEAD : BEHIND);
  const inWin = (i, slack = 0) => i >= winLo() - slack && i <= winHi() + slack;

  function buildFade() {
    // Phones show the film in the upper part of the screen; its lower edge melts into the page.
    fade.width = fw; fade.height = fh;
    const m = fade.getContext('2d'), gr = m.createLinearGradient(0, 0, 0, fh);
    gr.addColorStop(0, '#000'); gr.addColorStop(0.8, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    m.clearRect(0, 0, fw, fh); m.fillStyle = gr; m.fillRect(0, 0, fw, fh);
  }
  // Next frame to fetch: the opening shot first, then a sparse skeleton of the whole film, then whatever
  // missing frame is nearest the playhead (ahead of it counts as nearer).
  function nextFrame() {
    if (queued.length) return queued.shift();
    const c = Math.round(Math.max(ft, intro < 1 ? HF : 0));
    for (let d = 0; d < n; d++) {
      for (const i of [c + (dir > 0 ? d : -d), c - (dir > 0 ? d : -d) * 0.34]) {
        const k = Math.round(i);
        if (k >= 0 && k < n && !blobs[k] && !keep[k] && !inflight.has(k)) return k;
      }
    }
    return -1;
  }
  const inflight = new Set();
  function load() {
    if (!near) return;
    const s = mobile ? 'm' : 'd';
    if (s === set) return;
    set = s; const my = ++gen;
    [fw, fh] = C.size[s]; PW = s === 'm' ? 200 : 320;
    for (const b of bmps.values()) release(b);
    bmps.clear(); decoding.clear(); proxQ.length = 0; inflight.clear(); busy = 0;
    blobs = new Array(n).fill(null); prox = new Array(n).fill(null); keep = new Array(n).fill(null);
    canvas.width = fw; canvas.height = fh; put(canvas, 'width', fw + 'px'); put(canvas, 'height', fh + 'px');
    if (s === 'm') buildFade();
    drawnKey = '';
    queued = [];
    for (let i = 0; i <= HF; i++) queued.push(i);
    for (let i = HF + 8; i < n; i += 8) queued.push(i);
    if (queued[queued.length - 1] !== n - 1) queued.push(n - 1);
    const pump = () => {
      while (busy < 6) {
        const i = nextFrame(); if (i < 0) return;
        if (blobs[i] || keep[i] || inflight.has(i)) continue;
        const url = C.base + `${C.prefix}-${s}-${pad(i)}.webp`; busy++; inflight.add(i);
        const done = () => { inflight.delete(i); busy--; if (my === gen) pump(); };
        fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status))))
          .then((bl) => { if (my !== gen) return; blobs[i] = bl; proxQ.push(i); pumpProx(); if (inWin(i)) want(); })
          .catch(() => fromImage(url).then((im) => { if (my === gen) { keep[i] = im; prox[i] = im; drawnKey = ''; kick(); } }).catch(() => {}))
          .finally(done);
      }
    };
    pumpFn = pump;
    pump();
  }
  function pumpProx() {
    while (proxBusy < 2 && proxQ.length) {
      const i = proxQ.shift(), bl = blobs[i], my = gen;
      if (!bl || prox[i]) continue;
      proxBusy++;
      decodeBlob(bl).then((bm) => {
        if (my !== gen) { release(bm); return; }
        const c = document.createElement('canvas'); c.width = PW; c.height = Math.round((PW * fh) / fw);
        const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(bm, 0, 0, c.width, c.height);
        prox[i] = c;
        if (active && inWin(i) && !bmps.has(i) && bm.close) bmps.set(i, bm); else if (bm.close) release(bm); else keep[i] = bm;
        drawnKey = ''; kick();
      }).catch(() => {}).finally(() => { proxBusy--; pumpProx(); });
    }
  }
  function want() {
    for (const [i, b] of bmps) if (!active || !inWin(i, 8)) { release(b); bmps.delete(i); }
    if (!active) return;
    const c = Math.round(ft);
    for (let k = 0; k <= AHEAD && decoding.size < 4; k++) {
      for (const i of k ? [c + dir * k, c - dir * Math.ceil(k / 3)] : [c]) {
        if (decoding.size >= 4) break;
        if (i < 0 || i >= n || !blobs[i] || keep[i] || bmps.has(i) || decoding.has(i) || !inWin(i)) continue;
        decoding.add(i); const my = gen;
        decodeBlob(blobs[i]).then((bm) => {
          decoding.delete(i);
          if (my !== gen || !active || !inWin(i, 8)) release(bm); else { bmps.set(i, bm); if (Math.abs(i - f) < 2) drawnKey = ''; kick(); }
          want();
        }, () => { decoding.delete(i); });
      }
    }
  }
  const full = (i) => bmps.get(i) || keep[i];
  const pick = (i) => { const b = full(i); if (b) return [b, 1, i]; if (prox[i]) return [prox[i], 0, i]; return null; };
  function nearest(i) { for (let d = 0; d < n; d++) { let r = i - d >= 0 && pick(i - d); if (r) return r; r = i + d < n && pick(i + d); if (r) return r; } return null; }

  let shownQ = '';
  function draw(t, dt) {
    const i0 = Math.floor(f), u = f - i0;
    const A = pick(i0) || nearest(i0);
    if (!A) return false;
    let B = u > 0.03 && !reduce && i0 + 1 < n && A[2] === i0 ? pick(i0 + 1) : null;
    let src = A;
    if (B && B[1] !== A[1]) { if (B[1]) src = B; B = null; }
    const uq = B ? Math.round(u * 16) / 16 : 0;
    const key = `${src[2]}:${src[1]}|${B ? B[2] + ':' + uq : ''}`;
    const live = !reduce;
    if (key !== drawnKey || live) {
      drawnKey = key; shownQ = key;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.imageSmoothingQuality = 'high';
      g.drawImage(src[0], 0, 0, fw, fh);
      if (B && uq > 0) { g.globalAlpha = uq; g.drawImage(B[0], 0, 0, fw, fh); g.globalAlpha = 1; }
      if (live) { g.setTransform(1 / cS, 0, 0, 1 / cS, -cL / cS, -cT / cS); fx(t, dt); g.setTransform(1, 0, 0, 1, 0, 0); }
      if (set === 'm') { g.globalCompositeOperation = 'destination-in'; g.drawImage(fade, 0, 0); g.globalCompositeOperation = 'source-over'; }
    }
    return true;
  }

  // ---- light layer: dust in the sun, gold petals in the bloom, fireflies at night -----------------
  const sprite = (r, stops) => { const c = document.createElement('canvas'); c.width = c.height = r * 2; const x = c.getContext('2d'), gr = x.createRadialGradient(r, r, 0, r, r, r); for (const [o, col] of stops) gr.addColorStop(o, col); x.fillStyle = gr; x.fillRect(0, 0, r * 2, r * 2); return c; };
  const MOTE = sprite(16, [[0, 'rgba(255,240,214,1)'], [0.35, 'rgba(255,226,180,.55)'], [1, 'rgba(255,214,160,0)']]);
  const FLY = sprite(24, [[0, 'rgba(255,236,170,1)'], [0.18, 'rgba(255,210,110,.75)'], [0.5, 'rgba(255,180,80,.16)'], [1, 'rgba(255,170,70,0)']]);
  const rnd = (a, b) => a + Math.random() * (b - a);
  let motes = [], petals = [], flies = [];
  function seedFx() {
    const k = mobile ? 0.55 : 1;
    motes = Array.from({ length: Math.round(54 * k) }, () => ({ x: Math.random(), y: Math.random(), z: rnd(0.25, 1), vx: rnd(0.004, 0.014), vy: rnd(-0.006, 0.002), ph: rnd(0, 6.28), w: rnd(0.6, 1.8) }));
    petals = Array.from({ length: Math.round(26 * k) }, () => ({ x: Math.random(), y: Math.random(), z: rnd(0.4, 1), vy: rnd(0.025, 0.055), sw: rnd(0.4, 1.1), ph: rnd(0, 6.28), rot: rnd(0, 6.28), vr: rnd(-1.6, 1.6), c: Math.random() < 0.6 ? '#f2c14e' : '#e3a33a' }));
    flies = Array.from({ length: Math.round(18 * k) }, () => ({ x: Math.random(), y: rnd(0.35, 0.95), z: rnd(0.4, 1), ph: rnd(0, 6.28), sp: rnd(0.25, 0.6), pw: rnd(0.5, 1.3) }));
  }
  function fx(t, dt) {
    if (!fg || reduce) return;
    const day = 1 - smooth(0.58, 0.74, p), bloom = smooth(0.6, 0.7, p), night = smooth(0.7, 0.84, p);
    const s = dt / 1000, scrollDy = (p - pPrev) * len; // pixels the page moved this frame
    const wrap = (o) => { if (o.x > 1.05) o.x -= 1.1; if (o.x < -0.05) o.x += 1.1; if (o.y > 1.05) o.y -= 1.1; if (o.y < -0.05) o.y += 1.1; };
    if (day > 0.01) {
      fg.globalCompositeOperation = 'screen';
      for (const m of motes) {
        m.x += m.vx * s * m.z; m.y += m.vy * s * m.z - (scrollDy * 0.35 * m.z) / H; wrap(m);
        const a = day * (0.22 + 0.5 * m.z) * (0.55 + 0.45 * Math.sin(t * 0.0012 * m.w + m.ph));
        if (a < 0.02) continue;
        const r = (1.2 + 3.2 * m.z) * (mobile ? 0.8 : 1);
        fg.globalAlpha = a; fg.drawImage(MOTE, m.x * W - r, m.y * H - r, r * 2, r * 2);
      }
    }
    if (bloom > 0.01) {
      fg.globalCompositeOperation = 'source-over';
      for (const q of petals) {
        q.y += q.vy * s * q.z - (scrollDy * 0.5 * q.z) / H; q.rot += q.vr * s; q.x += Math.sin(t * 0.0008 * q.sw + q.ph) * 0.0006 * q.z; wrap(q);
        const r = (2.4 + 4.2 * q.z) * (mobile ? 0.85 : 1);
        fg.globalAlpha = bloom * (0.45 + 0.45 * q.z);
        fg.save(); fg.translate(q.x * W, q.y * H); fg.rotate(q.rot); fg.scale(1, 0.35 + 0.65 * Math.abs(Math.sin(t * 0.002 * q.sw + q.ph)));
        fg.fillStyle = q.c; fg.beginPath(); fg.ellipse(0, 0, r, r * 0.55, 0, 0, 6.2832); fg.fill(); fg.restore();
      }
    }
    if (night > 0.01) {
      fg.globalCompositeOperation = 'screen';
      for (const q of flies) {
        q.x += Math.sin(t * 0.00035 * q.sp + q.ph) * 0.012 * s; q.y += Math.cos(t * 0.00029 * q.sp + q.ph * 1.7) * 0.01 * s - (scrollDy * 0.25 * q.z) / H; wrap(q);
        const pulse = Math.max(0, Math.sin(t * 0.0016 * q.pw + q.ph)); const a = night * pulse * pulse * (0.4 + 0.5 * q.z);
        if (a < 0.02) continue;
        const r = (6 + 10 * q.z) * (mobile ? 0.8 : 1);
        fg.globalAlpha = a; fg.drawImage(FLY, q.x * W - r, q.y * H - r, r * 2, r * 2);
      }
    }
    fg.globalAlpha = 1; fg.globalCompositeOperation = 'source-over';
  }

  // ---- layout -----------------------------------------------------------------------------------
  function measure() {
    W = stick.clientWidth; H = stick.clientHeight;
    const wasMobile = mobile; mobile = W / H < 0.8;
    const r = root.getBoundingClientRect(); top = r.top + scrollY; len = Math.max(1, root.offsetHeight - H);
    if (!motes.length || wasMobile !== mobile) seedFx();
    load(); drawnKey = '';
  }
  const frameAt = (pp) => {
    let k = 0; while (k < MAP.length - 2 && pp > MAP[k + 1][0]) k++;
    const A = MAP[k], B = MAP[k + 1];
    return lerp(A[1], B[1], clamp((pp - A[0]) / (B[0] - A[0])));
  };
  // Desktop: the film covers the screen and drifts a little right while a chapter is open on the left.
  // Phones: the film fills the upper part of the screen; text and cards sit below it.
  // Everywhere: a slow breathing push-in and drift, so the shot is never a still picture.
  function place(chap, t) {
    let S, L, T;
    const br = reduce ? 0 : 0.5 - 0.5 * Math.cos(t * 0.00042), bx = reduce ? 0 : Math.sin(t * 0.00027);
    const z = 1.02 + 0.03 * br + (mobile ? 0 : C.zoom * chap);
    if (mobile) {
      S = Math.max(W / fw, (H * C.mobileH) / fh) * z;
      L = (W - fw * S) / 2 + bx * W * 0.03; T = -(fh * S - fh * S / z) * 0.5;
    } else {
      S = Math.max(W / fw, H / fh) * z;
      L = (W - fw * S) / 2 + C.shift * W * chap + bx * W * 0.008; T = (H - fh * S) / 2;
      L = Math.min(0, Math.max(W - fw * S, L));
    }
    cS = S; cL = L; cT = T;
    put(canvas, 'transform', `matrix(${S.toFixed(5)},0,0,${S.toFixed(5)},${L.toFixed(2)},${T.toFixed(2)})`);
  }

  function overlays() {
    if (hero) { const ho = 1 - smooth(0.0, 0.045, p); put(hero, 'opacity', ho.toFixed(3)); put(hero, 'transform', `translateY(${(-(1 - ho) * 30).toFixed(1)}px)`); put(hero, 'visibility', ho < 0.01 ? 'hidden' : 'visible'); }
    if (cue) put(cue, 'opacity', (1 - smooth(0, 0.03, p)).toFixed(3));
    let scr = 0;
    for (const ch of chapters) {
      const o = ch.hold ? smooth(ch.a, ch.a + 0.02, p) : Math.min(smooth(ch.a, ch.a + 0.02, p), 1 - smooth(ch.b - 0.02, ch.b, p));
      put(ch.el, 'opacity', o.toFixed(3)); put(ch.el, 'transform', `translateY(${((1 - o) * 18).toFixed(1)}px)`); put(ch.el, 'visibility', o < 0.01 ? 'hidden' : 'visible');
      const on = ch.on ? o > 0.05 : o > 0.4; if (on !== ch.on) { ch.on = on; ch.el.classList.toggle('is-in', on); }
      scr = Math.max(scr, o);
    }
    if (scrim) put(scrim, 'opacity', Math.max(scr, 1 - smooth(0, 0.05, p)).toFixed(3));
    for (const b of bars) { put(b.el, '--f', (Math.round(clamp((p - b.a) / (b.b - b.a)) * 200) / 200).toFixed(3)); const on = p >= b.a && p < b.b; if (on !== b.on) { b.on = on; b.el.classList.toggle('is-on', on); } }
    return scr;
  }

  // ---- loop -------------------------------------------------------------------------------------
  // The opening shot plays once the frames for it are in, unless the visitor has already scrolled.
  const introReady = () => { for (let i = 0; i <= HF; i += 3) if (!blobs[i] && !keep[i]) return false; return true; };
  let raf = 0;
  function frame(t) {
    raf = 0;
    if (!active || document.hidden) return;
    const dt = Math.min(64, t - (last || t)); last = t;
    pPrev = p;
    pT = clamp((scrollY - top) / len);
    p = reduce ? pT : p + (pT - p) * (1 - Math.exp(-dt / 45));
    if (Math.abs(pT - p) < 0.00003) p = pT;
    if (intro < 1) {
      // plays at its own pace; if the visitor starts scrolling first, it finishes quickly instead of jumping
      if (!introGo && (introReady() || pT > 0.004)) introGo = true;
      if (introGo) intro = Math.min(1, intro + dt / (pT > 0.004 ? 450 : INTRO_MS));
    }
    const fi = HF * easeOut(intro);
    ft = pT < MAP[1][0] ? fi : frameAt(pT);
    if (Math.abs(ft - lastFt) > 0.01) { if (lastFt >= 0) dir = ft > lastFt ? 1 : -1; lastFt = ft; want(); if (pumpFn && busy < 6) pumpFn(); }
    f = p < MAP[1][0] ? fi : frameAt(p);
    const scr = overlays();
    place(smooth(0.04, 0.09, p) * (1 - smooth(0.88, 0.94, p)) * Math.min(1, scr + 0.4), t);
    if (draw(t, dt) && !shown) { shown = true; root.classList.add('is-gl'); }
    // The scene keeps breathing while it is on screen; with reduced motion it only redraws on scroll.
    if (!reduce || p !== pT || !shown) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && active && !document.hidden) raf = requestAnimationFrame(frame); };
  window.__cxFilm = { q: () => shownQ, t: () => ft, p: () => p, frame: () => f, intro: () => intro, loaded: () => blobs.filter(Boolean).length + keep.filter(Boolean).length, decoded: () => bmps.size, n, jump: (v) => { p = pT = v; intro = 1; } };

  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', () => { measure(); kick(); });
  document.addEventListener('visibilitychange', () => { last = 0; kick(); });
  if ('ResizeObserver' in window) new ResizeObserver(() => { measure(); kick(); }).observe(root);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { near = true; load(); kick(); } }, { rootMargin: '150% 0px' }).observe(root);
    new IntersectionObserver((es) => { const on = es.some((e) => e.isIntersecting); if (on !== active) { active = on; want(); if (on) { last = 0; drawnKey = ''; kick(); } } }, { rootMargin: '10% 0px' }).observe(root);
  } else near = true;
  measure();
  p = pT = clamp((scrollY - top) / len); if (pT > 0.004) intro = 1;
  f = ft = intro < 1 ? 0 : frameAt(p);
  load(); kick();
})();
