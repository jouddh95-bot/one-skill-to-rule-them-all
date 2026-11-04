// CHARGIX v11 · desert film
// The "From the ground up" section plays a pre-rendered film (made with Higgsfield) with the scroll:
// a seed in the sand sprouts, grows into a palo verde, a store rises around it and the night comes in.
// It is footage played by the scroll, not live 3D, and the page says so.
//
// Smoothness rules:
// - Frames are fetched once as compressed files, coarse-to-fine, and decoded off the main thread
//   (createImageBitmap) in a small window around the playhead, biased in the scroll direction.
//   A small copy of every frame stays in memory, so a fast fling always has a picture.
// - The canvas holds one frame at the film's own resolution and only repaints when the frame or the
//   cross-dissolve changes. Scaling and placement are a CSS transform (GPU compositing).
// - Layout is read once per animation frame, then styles are written, and a style is only written
//   when its value changes.
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
  const chapters = [...root.querySelectorAll('[data-ch]')].map((el) => ({ el, a: +el.dataset.from, b: +el.dataset.to, hold: el.hasAttribute('data-hold') }));
  const bars = [...root.querySelectorAll('[data-bar]')].map((el) => ({ el, a: +el.dataset.from, b: +el.dataset.to, on: null }));
  const hero = root.querySelector('[data-grow-hero]'), scrim = root.querySelector('[data-grow-scrim]'), cue = root.querySelector('[data-grow-cue]');
  const n = C.n, MAP = C.map; // MAP: [[p, frame], ...] scroll position (0-1 of the section) to film frame

  let W = 1, H = 1, top = 0, len = 1, mobile = false, active = true, near = false;
  let pT = 0, p = 0, ft = 0, f = 0, lastFt = -1, dir = 1, last = 0, shown = false, drawnKey = '';

  // ---- frames -----------------------------------------------------------------------------------
  let set = '', gen = 0, fw = 1, fh = 1, PW = 240;
  let blobs = [], prox = [], keep = [];
  const bmps = new Map(), decoding = new Set(), proxQ = [];
  let proxBusy = 0;
  const fade = document.createElement('canvas');
  const winLo = () => Math.round(ft) - (dir > 0 ? 6 : 16), winHi = () => Math.round(ft) + (dir > 0 ? 16 : 6);
  const inWin = (i, slack = 0) => i >= winLo() - slack && i <= winHi() + slack;

  function buildFade() {
    // Phones show the film in the upper part of the screen; its lower edge melts into the page.
    fade.width = fw; fade.height = fh;
    const m = fade.getContext('2d'), gr = m.createLinearGradient(0, 0, 0, fh);
    gr.addColorStop(0, '#000'); gr.addColorStop(0.8, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    m.clearRect(0, 0, fw, fh); m.fillStyle = gr; m.fillRect(0, 0, fw, fh);
  }
  function load() {
    if (!near) return;
    const s = mobile ? 'm' : 'd';
    if (s === set) return;
    set = s; const my = ++gen;
    [fw, fh] = C.size[s]; PW = s === 'm' ? 160 : 240;
    for (const b of bmps.values()) release(b);
    bmps.clear(); decoding.clear(); proxQ.length = 0;
    blobs = new Array(n).fill(null); prox = new Array(n).fill(null); keep = new Array(n).fill(null);
    canvas.width = fw; canvas.height = fh; put(canvas, 'width', fw + 'px'); put(canvas, 'height', fh + 'px');
    if (s === 'm') buildFade();
    drawnKey = '';
    // coarse to fine, starting from wherever the playhead is
    const order = [], seen = new Set(), c0 = Math.round(ft);
    for (let d = -3; d <= 3; d++) { const i = c0 + d; if (i >= 0 && i < n) { seen.add(i); order.push(i); } }
    for (const st of [24, 12, 6, 3, 1]) for (let i = 0; i < n; i += st) if (!seen.has(i)) { seen.add(i); order.push(i); }
    if (!seen.has(n - 1)) order.push(n - 1);
    let busy = 0;
    const pump = () => {
      while (busy < 6 && order.length) {
        const i = order.shift(), url = C.base + `${C.prefix}-${s}-${pad(i)}.webp`; busy++;
        const done = () => { busy--; if (my === gen) pump(); };
        fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status))))
          .then((bl) => { if (my !== gen) return; blobs[i] = bl; proxQ.push(i); pumpProx(); if (inWin(i)) want(); })
          .catch(() => fromImage(url).then((im) => { if (my === gen) { keep[i] = im; prox[i] = im; drawnKey = ''; kick(); } }).catch(() => {}))
          .finally(done);
      }
    };
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
    for (const [i, b] of bmps) if (!active || !inWin(i, 6)) { release(b); bmps.delete(i); }
    if (!active) return;
    const c = Math.round(ft);
    for (let k = 0; k <= 16 && decoding.size < 3; k++) {
      for (const i of k ? [c + dir * k, c - dir * k] : [c]) {
        if (decoding.size >= 3) break;
        if (i < 0 || i >= n || !blobs[i] || keep[i] || bmps.has(i) || decoding.has(i) || !inWin(i)) continue;
        decoding.add(i); const my = gen;
        decodeBlob(blobs[i]).then((bm) => {
          decoding.delete(i);
          if (my !== gen || !active || !inWin(i, 6)) release(bm); else { bmps.set(i, bm); drawnKey = ''; kick(); }
          want();
        }, () => { decoding.delete(i); });
      }
    }
  }
  const full = (i) => bmps.get(i) || keep[i];
  const pick = (i) => { const b = full(i); if (b) return [b, 1, i]; if (prox[i]) return [prox[i], 0, i]; return null; };
  function nearest(i) { for (let d = 0; d < n; d++) { let r = i - d >= 0 && pick(i - d); if (r) return r; r = i + d < n && pick(i + d); if (r) return r; } return null; }

  function draw() {
    const i0 = Math.floor(f), u = f - i0;
    const A = pick(i0) || nearest(i0);
    if (!A) return false;
    let B = u > 0.02 && !reduce && i0 + 1 < n && A[2] === i0 ? pick(i0 + 1) : null;
    let src = A;
    if (B && B[1] !== A[1]) { if (B[1]) src = B; B = null; }
    const uq = B ? Math.round(u * 24) / 24 : 0;
    const key = `${src[2]}:${src[1]}|${B ? B[2] + ':' + uq : ''}`;
    if (key !== drawnKey) {
      drawnKey = key;
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.imageSmoothingQuality = 'high';
      g.drawImage(src[0], 0, 0, fw, fh);
      if (B && uq > 0) { g.globalAlpha = uq; g.drawImage(B[0], 0, 0, fw, fh); g.globalAlpha = 1; }
      if (set === 'm') { g.globalCompositeOperation = 'destination-in'; g.drawImage(fade, 0, 0); g.globalCompositeOperation = 'source-over'; }
    }
    return true;
  }

  // ---- layout -----------------------------------------------------------------------------------
  function measure() {
    W = stick.clientWidth; H = stick.clientHeight;
    mobile = W / H < 0.8;
    const r = root.getBoundingClientRect(); top = r.top + scrollY; len = Math.max(1, root.offsetHeight - H);
    load(); drawnKey = '';
  }
  const frameAt = (pp) => {
    let k = 0; while (k < MAP.length - 2 && pp > MAP[k + 1][0]) k++;
    const A = MAP[k], B = MAP[k + 1];
    return lerp(A[1], B[1], clamp((pp - A[0]) / (B[0] - A[0])));
  };
  // Desktop: the film covers the screen and drifts a little right while a chapter is open on the left.
  // Phones: the film fills the upper part of the screen; text and cards sit below it.
  function place(chap, t) {
    let S, L, T;
    if (mobile) {
      S = Math.max(W / fw, (H * C.mobileH) / fh);
      L = (W - fw * S) / 2; T = 0;
    } else {
      const z = 1 + C.zoom * chap + (reduce ? 0 : 0.012 * (1 - smooth(0, 0.03, p)) * (0.5 - 0.5 * Math.cos(t * 0.00035)));
      S = Math.max(W / fw, H / fh) * z;
      L = (W - fw * S) / 2 + C.shift * W * chap; T = (H - fh * S) / 2;
      L = Math.min(0, Math.max(W - fw * S, L));
    }
    put(canvas, 'transform', `matrix(${S.toFixed(5)},0,0,${S.toFixed(5)},${L.toFixed(2)},${T.toFixed(2)})`);
  }

  function overlays() {
    if (hero) { const ho = 1 - smooth(0.0, 0.045, p); put(hero, 'opacity', ho.toFixed(3)); put(hero, 'transform', `translateY(${(-(1 - ho) * 30).toFixed(1)}px)`); put(hero, 'visibility', ho < 0.01 ? 'hidden' : 'visible'); }
    if (cue) put(cue, 'opacity', (1 - smooth(0, 0.03, p)).toFixed(3));
    let scr = 0;
    for (const ch of chapters) {
      const o = ch.hold ? smooth(ch.a, ch.a + 0.02, p) : Math.min(smooth(ch.a, ch.a + 0.02, p), 1 - smooth(ch.b - 0.02, ch.b, p));
      put(ch.el, 'opacity', o.toFixed(3)); put(ch.el, 'transform', `translateY(${((1 - o) * 18).toFixed(1)}px)`); put(ch.el, 'visibility', o < 0.01 ? 'hidden' : 'visible');
      scr = Math.max(scr, o);
    }
    if (scrim) put(scrim, 'opacity', Math.max(scr, 1 - smooth(0, 0.05, p)).toFixed(3));
    for (const b of bars) { put(b.el, '--f', (Math.round(clamp((p - b.a) / (b.b - b.a)) * 200) / 200).toFixed(3)); const on = p >= b.a && p < b.b; if (on !== b.on) { b.on = on; b.el.classList.toggle('is-on', on); } }
    return scr;
  }

  // ---- loop -------------------------------------------------------------------------------------
  let raf = 0;
  function frame(t) {
    raf = 0;
    if (!active || document.hidden) return;
    const dt = Math.min(64, t - (last || t)); last = t;
    pT = clamp((scrollY - top) / len);
    p = reduce ? pT : p + (pT - p) * (1 - Math.exp(-dt / 90));
    if (Math.abs(pT - p) < 0.00005) p = pT;
    ft = frameAt(pT);
    if (Math.abs(ft - lastFt) > 0.01) { if (lastFt >= 0) dir = ft > lastFt ? 1 : -1; lastFt = ft; want(); }
    f = frameAt(p);
    const scr = overlays();
    place(smooth(0.04, 0.09, p) * (1 - smooth(0.88, 0.94, p)) * Math.min(1, scr + 0.4), t);
    if (draw() && !shown) { shown = true; root.classList.add('is-gl'); }
    // keep animating while the playhead catches up, and slowly at the top for the hero drift
    if (p !== pT || !shown || (!mobile && !reduce && p < 0.03)) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && active && !document.hidden) raf = requestAnimationFrame(frame); };
  window.__cxFilm = { p: () => p, frame: () => f, loaded: () => blobs.filter(Boolean).length + keep.filter(Boolean).length, decoded: () => bmps.size, n, jump: (v) => { p = pT = v; } };

  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', () => { measure(); kick(); });
  document.addEventListener('visibilitychange', () => { last = 0; kick(); });
  if ('ResizeObserver' in window) new ResizeObserver(() => { measure(); kick(); }).observe(root);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { near = true; load(); kick(); } }, { rootMargin: '150% 0px' }).observe(root);
    new IntersectionObserver((es) => { const on = es.some((e) => e.isIntersecting); if (on !== active) { active = on; want(); if (on) { last = 0; drawnKey = ''; kick(); } } }, { rootMargin: '10% 0px' }).observe(root);
  } else near = true;
  measure();
  p = pT = clamp((scrollY - top) / len); f = ft = frameAt(p);
  load(); kick();
})();
