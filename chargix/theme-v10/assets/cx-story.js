// CHARGIX v10 · story stage
// One sticky stage per story. The first story opens with a short loop that plays by itself (<video>),
// so the box is alive before anyone scrolls. Scrolling hands over to a pre-rendered frame sequence on a
// canvas: the scroll position picks a fractional frame, neighbouring frames are cross-dissolved, and
// everything else (camera moves, captions, interface cards, the clock, the chapter bar) is keyed to that
// same frame index, so it all plays backwards exactly as it plays forwards.
// The films are rendered footage played by the scroll. They are not live 3D, and the page says so.
//
// Smoothness rules this file follows:
// - Frames are fetched once as compressed files and decoded off the main thread (createImageBitmap)
//   in a small window around the playhead, biased in the scroll direction. A quarter-size copy of every
//   frame stays in memory, so a fast fling always has a picture while the full frame decodes.
// - The canvas holds one film frame at its own resolution and only repaints when the frame or the
//   dissolve changes. Camera pans and zooms are a CSS transform on the canvas (GPU compositing).
// - The soft edges are baked into the canvas, so no CSS mask or full-screen blur repaints per frame.
// - One shared animation loop: every story reads layout first, then every story writes styles. Element
//   sizes are cached (ResizeObserver), and a style is only written when its value changes.
(() => {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, u) => a + (b - a) * u;
  const smooth = (a, b, x) => { if (b <= a) return x >= b ? 1 : 0; const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad = (i) => String(i).padStart(3, '0');
  const put = (el, k, v) => { const c = el.__cx || (el.__cx = {}); if (c[k] !== v) { c[k] = v; if (k[0] === '-') el.style.setProperty(k, v); else el.style[k] = v; } };
  const attr = (el, k, v) => { const c = el.__cxa || (el.__cxa = {}); if (c[k] !== v) { c[k] = v; el.setAttribute(k, v); } };
  const release = (b) => { if (b && b.close) b.close(); };
  const fromImage = (src, revoke) => new Promise((res, rej) => {
    const im = new Image(); im.decoding = 'async';
    im.onload = () => (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => { if (revoke) URL.revokeObjectURL(src); res(im); });
    im.onerror = () => { if (revoke) URL.revokeObjectURL(src); rej(new Error('img')); };
    im.src = src;
  });
  const decodeBlob = (bl) => (typeof createImageBitmap === 'function' ? createImageBitmap(bl) : Promise.reject(new Error('no bitmap'))).catch(() => fromImage(URL.createObjectURL(bl), true));

  const all = [];
  let raf = 0;
  const loop = (t) => { raf = 0; let again = false; for (const s of all) if (s.on()) s.read(); for (const s of all) if (s.on() && s.write(t)) again = true; if (again) kick(); };
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

  function story(root) {
    const C = JSON.parse(root.querySelector('script[data-story-config]').textContent);
    const stick = root.querySelector('[data-stick]');
    const canvas = root.querySelector('canvas[data-film]');
    const g = canvas.getContext('2d');
    const amb = root.querySelector('canvas[data-amb]'), ag = amb && amb.getContext('2d', { alpha: false });
    const video = root.querySelector('video[data-hero-video]');
    const hero = root.querySelector('[data-hero]'), cue = root.querySelector('[data-cue]');
    const hud = [...root.querySelectorAll('[data-hud]')];
    const capsEl = root.querySelector('.story__caps');
    const caps = [...root.querySelectorAll('[data-cap]')].map((el) => ({ el, a: +el.dataset.from, b: +el.dataset.to, hold: el.hasAttribute('data-hold'), h: 0 }));
    const bars = [...root.querySelectorAll('[data-chapter]')].map((el) => ({ el, a: +el.dataset.from, b: +el.dataset.to, on: null }));
    const timeEl = root.querySelector('[data-time]'), dayEl = root.querySelector('[data-day]');
    const svg = root.querySelector('svg[data-leaders]');
    const ovs = [...root.querySelectorAll('[data-ov]')].map((el) => {
      const d = el.dataset, o = { el, a: +d.from, b: +d.to, fade: +(d.fade || 8), place: d.place || 'right', mplace: d.mplace || 'bottom', ka: +(d.kFrom || 0), kb: +(d.kTo || 0), at: d.at ? d.at.split(',').map(Number) : null, hold: el.hasAttribute('data-hold'), w: 1, h: 1 };
      if (o.at && svg) { o.path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); o.ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); o.dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); o.ring.setAttribute('r', '9'); o.ring.setAttribute('class', 'ring'); o.dot.setAttribute('r', '2.5'); svg.append(o.path, o.ring, o.dot); }
      return o;
    });

    const n = C.n, iw = C.iw || 1280, ih = C.ih || 716;
    let W = 0, H = 0, len = 1, mobile = false, s0 = 1, near0 = !!C.eager, active = true, sizesDirty = true;
    let f = 0, ft = 0, p = 0, lastFt = -1, dir = 1, lastT = 0, heroOn = !!video, heroCam = null;
    let drawnKey = '', ambKey = '', clockTxt = '', dayTxt = '';

    // ---- frames -------------------------------------------------------------------------------
    let set = '', gen = 0, fw = 0, fh = 0, PW = 256;
    let blobs = [], prox = [], keep = [];
    const bmps = new Map(), decoding = new Set(), proxQ = [];
    let proxBusy = 0;
    const mask = document.createElement('canvas');
    function buildMask() {
      mask.width = fw; mask.height = fh;
      const m = mask.getContext('2d'), stops = (gr) => { gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.08, '#000'); gr.addColorStop(0.92, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)'); return gr; };
      m.clearRect(0, 0, fw, fh);
      m.fillStyle = stops(m.createLinearGradient(0, 0, fw, 0)); m.fillRect(0, 0, fw, fh);
      m.globalCompositeOperation = 'destination-in';
      m.fillStyle = stops(m.createLinearGradient(0, 0, 0, fh)); m.fillRect(0, 0, fw, fh);
      m.globalCompositeOperation = 'source-over';
    }
    const winLo = () => Math.round(ft) - (dir > 0 ? 8 : 20), winHi = () => Math.round(ft) + (dir > 0 ? 20 : 8);
    const inWin = (i, slack = 0) => i >= winLo() - slack && i <= winHi() + slack;

    function load() {
      if (!near0) return;
      const s = mobile ? 'm' : 'd';
      if (s === set) return;
      set = s; const my = ++gen;
      fw = s === 'm' ? 960 : 1280; fh = Math.round((fw * ih) / iw); PW = s === 'm' ? 192 : 256;
      for (const b of bmps.values()) release(b);
      bmps.clear(); decoding.clear(); proxQ.length = 0;
      blobs = new Array(n).fill(null); prox = new Array(n).fill(null); keep = new Array(n).fill(null);
      canvas.width = fw; canvas.height = fh; buildMask(); drawnKey = '';
      const order = [], seen = new Set();
      for (const st of [32, 16, 8, 4, 2, 1]) for (let i = 0; i < n; i += st) if (!seen.has(i)) { seen.add(i); order.push(i); }
      if (!seen.has(n - 1)) order.splice(1, 0, n - 1);
      let busy = 0;
      const pump = () => {
        while (busy < 6 && order.length) {
          const i = order.shift(), url = `${C.base}${C.prefix}-${s}-${pad(i)}.webp`; busy++;
          const done = () => { busy--; if (my === gen) pump(); };
          fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status))))
            .then((bl) => { if (my !== gen) return; blobs[i] = bl; proxQ.push(i); pumpProx(); if (inWin(i)) want(); })
            .catch(() => fromImage(url).then((im) => { if (my === gen) { keep[i] = im; prox[i] = im; drawnKey = ''; kick(); } }).catch(() => {}))
            .finally(done);
        }
      };
      pump();
    }
    // Quarter-size copy of every frame, made as frames arrive.
    function pumpProx() {
      while (proxBusy < 2 && proxQ.length) {
        const i = proxQ.shift(), bl = blobs[i], my = gen;
        if (!bl || prox[i]) continue;
        proxBusy++;
        decodeBlob(bl).then((bm) => {
          if (my !== gen) { release(bm); return; }
          const c = document.createElement('canvas'); c.width = PW; c.height = Math.round((PW * ih) / iw);
          const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(bm, 0, 0, c.width, c.height);
          prox[i] = c;
          if (active && inWin(i) && !bmps.has(i) && bm.close) bmps.set(i, bm); else if (bm.close) release(bm); else keep[i] = bm;
          drawnKey = ''; kick();
        }).catch(() => {}).finally(() => { proxBusy--; pumpProx(); });
      }
    }
    // Full frames: a window around the playhead, decoded off the main thread, nearest first.
    function want() {
      for (const [i, b] of bmps) if (!active || !inWin(i, 6)) { release(b); bmps.delete(i); }
      if (!active) return;
      const c = Math.round(ft);
      for (let k = 0; k <= 20 && decoding.size < 3; k++) {
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
    function pick(i) { const b = full(i); if (b) return [b, 1, i]; if (prox[i]) return [prox[i], 0, i]; return null; }
    function nearest(i) { for (let d = 0; d < n; d++) { let r = i - d >= 0 && pick(i - d); if (r) return r; r = i + d < n && pick(i + d); if (r) return r; } return null; }

    function draw() {
      const i0 = Math.floor(f), u = f - i0;
      const A = pick(i0) || nearest(i0);
      if (!A) return null;
      let B = u > 0.02 && !reduce && i0 + 1 < n && A[2] === i0 ? pick(i0 + 1) : null;
      let src = A;
      if (B && B[1] !== A[1]) { if (B[1]) src = B; B = null; }
      const uq = B ? Math.round(u * 32) / 32 : 0;
      const key = `${src[2]}:${src[1]}|${B ? B[2] + ':' + uq : ''}`;
      if (key !== drawnKey) {
        drawnKey = key;
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.imageSmoothingQuality = 'high';
        g.drawImage(src[0], 0, 0, fw, fh);
        if (B && uq > 0) { g.globalAlpha = uq; g.drawImage(B[0], 0, 0, fw, fh); g.globalAlpha = 1; }
        g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'source-over';
      }
      return src;
    }

    // ---- layout -------------------------------------------------------------------------------
    function measureSizes() {
      sizesDirty = false;
      len = Math.max(1, root.offsetHeight - H);
      for (const o of ovs) { o.w = o.el.offsetWidth || 1; o.h = o.el.offsetHeight || 1; }
      for (const c of caps) c.h = c.el.offsetHeight;
    }
    function resize() {
      W = stick.clientWidth; H = stick.clientHeight;
      mobile = W / H < 0.85 || W < 700;
      if (amb) { amb.width = Math.max(1, Math.ceil(W / 12)); amb.height = Math.max(1, Math.ceil(H / 12)); if ('filter' in ag) ag.filter = 'blur(2px)'; ambKey = ''; }
      const [bx0, by0, bx1, by1] = C.box;
      s0 = mobile ? (W * C.mobileFill) / ((bx1 - bx0) * iw) : Math.min((W * 0.94) / ((bx1 - bx0) * iw), (H * 0.84) / ((by1 - by0) * ih));
      sizesDirty = true; load(); drawnKey = '';
      read(); write(performance.now(), true);
    }

    // Camera keys: [frame, fx, fy, zoom]. (fx, fy) is the source-image point placed at the screen anchor.
    function camAt(fr) {
      const keys = mobile ? C.cam.m : C.cam.d;
      let k = 0; while (k < keys.length - 2 && fr > keys[k + 1][0]) k++;
      const A = keys[k], B = keys[k + 1] || A, u = B[0] > A[0] ? smooth(A[0], B[0], fr) : 0;
      return [lerp(A[1], B[1], u), lerp(A[2], B[2], u), lerp(A[3], B[3], u)];
    }
    const anchor = () => (mobile ? C.anchor.m : C.anchor.d);
    // Landing framing: the whole box at a given width and centre (fractions of the screen).
    function heroFrame() {
      const h = mobile ? C.hero.m : C.hero.d, a = anchor(), [bx0, by0, bx1, by1] = C.box;
      const S = Math.min((W * h.w) / ((bx1 - bx0) * iw), (H * 0.8) / ((by1 - by0) * ih));
      return [(bx0 + bx1) / 2 - ((h.cx - a[0]) * W) / (iw * S), (by0 + by1) / 2 - ((h.cy - a[1]) * H) / (ih * S), S / s0];
    }
    // Phones: cards scale to fit the lower part of the screen, the caption rides just above the card,
    // and the film tilts up so the action stays visible above both.
    const vis = (o, fr) => (o.hold ? smooth(o.a, o.a + o.fade, fr) : Math.min(smooth(o.a, o.a + o.fade, fr), 1 - smooth(o.b - o.fade, o.b, fr)));
    const capVis = (c, fr) => (c.hold ? smooth(c.a, c.a + 5, fr) : Math.min(smooth(c.a, c.a + 5, fr), 1 - smooth(c.b - 5, c.b, fr)));
    const cardScale = (o) => (mobile ? Math.min(1, (H * 0.42) / o.h, (W - 32) / o.w) : 1);
    function mobileLayout(fr) {
      if (!mobile) return [0, 0];
      let v = 0, top = H;
      for (const o of ovs) { const k = vis(o, fr); if (k > 0.001) { const t0 = H - o.h * cardScale(o) - 44; if (k > v) v = k; if (t0 < top) top = t0; } }
      if (v <= 0) return [0, 0];
      let ch = 0; for (const c of caps) if (capVis(c, fr) > 0.01) ch = Math.max(ch, c.h);
      const capLift = Math.max(0, H - 58 - (top - 14)), capTop = top - 14 - ch;
      const [, , , by1] = C.box, c = camAt(fr), S = s0 * c[2], a = anchor();
      const boxBottom = a[1] * H + (by1 - c[1]) * ih * S;
      return [Math.min(H * 0.17, Math.max(0, boxBottom - (capTop - 6))) * v, capLift * v];
    }
    function camera(fr, lift) {
      let c = camAt(fr);
      if (C.hero) { const h = heroFrame(), u = smooth(0, C.heroEnd, p); if (u < 1) c = [lerp(h[0], c[0], u), lerp(h[1], c[1], u), lerp(h[2], c[2], u)]; }
      const a = anchor(), S = s0 * c[2];
      return { S, L: a[0] * W - c[0] * iw * S, T: a[1] * H - c[1] * ih * S - lift };
    }
    const toScreen = (cam, x, y) => [cam.L + x * iw * cam.S, cam.T + y * ih * cam.S];
    const matrix = (cam) => `matrix(${cam.S.toFixed(5)},0,0,${cam.S.toFixed(5)},${cam.L.toFixed(2)},${cam.T.toFixed(2)})`;

    function ambient(src, cam, key) {
      if (!ag || !src) return;
      if (key === ambKey) return; ambKey = key;
      ag.fillStyle = C.bg; ag.fillRect(0, 0, amb.width, amb.height);
      ag.drawImage(src, cam.L / 12, cam.T / 12, (iw * cam.S) / 12, (ih * cam.S) / 12);
    }

    function place(o, cam) {
      const gut = W < 700 ? 16 : Math.max(16, Math.min(56, W * 0.04));
      if (mobile) {
        const ms = cardScale(o), vw = o.w * ms, vh = o.h * ms;
        return [o.mplace === 'bottom-right' ? W - vw - gut : (W - vw) / 2, H - vh - 44, ms];
      }
      const [ax] = o.at ? toScreen(cam, o.at[0], o.at[1]) : [W / 2];
      const x = o.place === 'left' ? gut + 8 : o.place === 'center' ? (W - o.w) / 2 : Math.min(W - o.w - 48, Math.max(ax + 220, W * 0.66));
      return [x, clamp(H / 2 - o.h / 2 + 10, 90, H - o.h - 64), 1];
    }

    function overlays(cam, ml) {
      const ho = C.hero ? 1 - smooth(0, C.heroEnd * 0.8, p) : 0;
      if (hero) { put(hero, 'opacity', ho.toFixed(3)); put(hero, 'transform', `translateY(${((1 - ho) * -24).toFixed(1)}px)`); put(hero, 'visibility', ho < 0.01 ? 'hidden' : 'visible'); }
      if (cue) put(cue, 'opacity', ho.toFixed(3));
      const hu = C.hero ? smooth(C.heroEnd * 0.5, C.heroEnd * 1.3, p) : smooth(0, 0.02, p), hus = hu.toFixed(3);
      for (const el of hud) put(el, 'opacity', hus);
      if (capsEl) put(capsEl, 'transform', mobile ? `translateY(${(-ml[1]).toFixed(1)}px)` : 'none');
      for (const c of caps) {
        const o = capVis(c, f) * hu;
        put(c.el, 'visibility', o < 0.01 ? 'hidden' : 'visible');
        put(c.el, 'opacity', o.toFixed(3)); put(c.el, 'transform', `translateY(${((1 - o) * 14).toFixed(1)}px)`);
      }
      for (const c of bars) {
        put(c.el, '--f', (Math.round(clamp((f - c.a) / (c.b - c.a)) * 200) / 200).toFixed(3));
        const on = f >= c.a && f < c.b + 0.5 && hu > 0.5; if (on !== c.on) { c.on = on; c.el.classList.toggle('is-on', on); }
      }
      if (timeEl && C.clock) {
        const K = C.clock; let k = 0; while (k < K.length - 2 && f > K[k + 1][0]) k++;
        const A = K[k], B = K[k + 1] || A, u = B[0] > A[0] ? clamp((f - A[0]) / (B[0] - A[0])) : 0;
        let m = Math.round(lerp(A[1], B[1], u)); const day = u < 1 || !B[2] ? A[2] : B[2];
        m = ((m % 1440) + 1440) % 1440; const hh = Math.floor(m / 60), mm = m % 60;
        const txt = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
        if (txt !== clockTxt) { clockTxt = txt; timeEl.textContent = txt; }
        if (dayEl && day && day !== dayTxt) { dayTxt = day; dayEl.textContent = day; }
      }
      for (const o of ovs) {
        const v = vis(o, f) * hu, el = o.el;
        put(el, 'visibility', v < 0.01 ? 'hidden' : 'visible');
        if (v < 0.01) { if (o.path) { put(o.path, 'opacity', '0'); put(o.ring, 'opacity', '0'); put(o.dot, 'opacity', '0'); } continue; }
        const [x, y, ms] = place(o, cam), sc = mobile ? (0.94 + v * 0.06) * ms : 0.9 + v * 0.1;
        put(el, 'opacity', v.toFixed(3));
        put(el, 'transform', `translate(${x.toFixed(1)}px,${(y + (1 - v) * 24).toFixed(1)}px) scale(${sc.toFixed(4)})`);
        if (o.kb > o.ka) put(el, '--k', smooth(o.ka, o.kb, f).toFixed(3));
        if (o.path) {
          const [ax, ay] = toScreen(cam, o.at[0], o.at[1]);
          const ex = mobile ? x + 24 : x > ax ? x : x + o.w, ey = mobile ? y : y + o.h * 0.42, dx = ex - ax;
          if (!mobile) attr(o.path, 'd', `M${ax.toFixed(1)},${ay.toFixed(1)} C${(ax + dx * 0.5).toFixed(1)},${(ay - 40).toFixed(1)} ${(ex - dx * 0.3).toFixed(1)},${ey.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`);
          for (const c of [o.ring, o.dot]) { attr(c, 'cx', ax.toFixed(1)); attr(c, 'cy', ay.toFixed(1)); }
          const vo = (v * 0.9).toFixed(3); put(o.ring, 'opacity', vo); put(o.dot, 'opacity', vo); put(o.path, 'opacity', mobile ? '0' : vo);
        }
      }
    }

    function heroVideo() {
      if (!video) return;
      const on = p <= 0.004 && !reduce;
      if (on !== heroOn) {
        heroOn = on; video.classList.toggle('is-off', !on); ambKey = '';
        if (on) { const pr = video.play(); if (pr && pr.catch) pr.catch(() => {}); } else setTimeout(() => { if (!heroOn) video.pause(); }, 520);
      }
      if (heroOn || p < C.heroEnd * 2) { heroCam = camera(0, 0); put(video, 'transform', matrix(heroCam)); }
    }
    function feedAmbient() {
      if (heroOn && heroCam && video.readyState >= 2 && active) { ambKey = ''; ambient(video, heroCam, 'v'); }
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(feedAmbient); else setTimeout(feedAmbient, 120);
    }

    // ---- loop ---------------------------------------------------------------------------------
    function read() {
      if (sizesDirty) measureSizes();
      p = clamp(-root.getBoundingClientRect().top / len);
      const a = C.hero ? C.heroEnd : C.start || 0, b = C.filmEnd || 0.97;
      ft = clamp((p - a) / (b - a)) * (n - 1);
    }
    function write(t, force) {
      const dt = Math.min(64, t - (lastT || t)); lastT = t;
      if (Math.abs(ft - lastFt) > 0.01) { if (lastFt >= 0) dir = ft > lastFt ? 1 : -1; lastFt = ft; want(); }
      if (force || reduce) f = ft; else { f += (ft - f) * (1 - Math.exp(-dt / 80)); if (Math.abs(ft - f) < 0.003) f = ft; }
      const ml = mobileLayout(f), cam = camera(f, ml[0]);
      heroVideo();
      put(canvas, 'transform', matrix(cam));
      const src = draw();
      if (src && !heroOn) ambient(prox[src[2]] || src[0], cam, `${src[2]}|${Math.round(cam.L / 6)}|${Math.round(cam.T / 6)}|${Math.round(cam.S * 400)}`);
      overlays(cam, ml);
      return f !== ft;
    }

    (window.__cxStory = window.__cxStory || {})[root.id] = { progress: () => p, frame: () => f, loaded: () => blobs.filter(Boolean).length + keep.filter(Boolean).length, decoded: () => bmps.size, n };

    canvas.style.width = iw + 'px'; canvas.style.height = ih + 'px';
    if ('IntersectionObserver' in window) {
      if (!near0) { const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { near0 = true; io.disconnect(); load(); } }, { rootMargin: '150% 0px' }); io.observe(root); }
      new IntersectionObserver((es) => { const on = es.some((e) => e.isIntersecting); if (on !== active) { active = on; want(); if (on) { drawnKey = ''; kick(); } } }, { rootMargin: '20% 0px' }).observe(root);
    } else near0 = true;
    if ('ResizeObserver' in window) { const ro = new ResizeObserver(() => { sizesDirty = true; kick(); }); for (const o of ovs) ro.observe(o.el); for (const c of caps) ro.observe(c.el); }
    addEventListener('resize', () => { const w = stick.clientWidth, h = stick.clientHeight; if (w !== W || Math.abs(h - H) > 80) resize(); else { sizesDirty = true; kick(); } });
    if (video) {
      video.style.width = iw + 'px'; video.style.height = ih + 'px';
      if (reduce) { video.removeAttribute('autoplay'); video.pause(); }
      feedAmbient();
    }
    root.classList.add('is-live');
    all.push({ on: () => active, read, write });
    resize(); kick();
  }

  addEventListener('scroll', kick, { passive: true });
  document.querySelectorAll('[data-story]').forEach((el) => { try { story(el); } catch (e) { console.warn('story', e); } });
})();
