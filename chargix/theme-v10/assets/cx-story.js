// CHARGIX v10 · story stage
// One sticky stage per story. The first story opens with a short loop that plays by itself (<video>),
// so the box is alive before anyone scrolls. Scrolling hands over to a pre-rendered frame sequence on a
// canvas: the scroll position picks a fractional frame, neighbouring frames are cross-dissolved, and
// everything else (camera moves, captions, interface cards, the clock, the chapter bar) is keyed to that
// same frame index, so it all plays backwards exactly as it plays forwards.
// The films are rendered footage played by the scroll. They are not live 3D, and the page says so.
(() => {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, u) => a + (b - a) * u;
  const smooth = (a, b, x) => { if (b <= a) return x >= b ? 1 : 0; const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad = (i) => String(i).padStart(3, '0');

  function story(root) {
    const C = JSON.parse(root.querySelector('script[data-story-config]').textContent);
    const stick = root.querySelector('[data-stick]');
    const canvas = root.querySelector('canvas[data-film]');
    const g = canvas.getContext('2d');
    const amb = root.querySelector('canvas[data-amb]'), ag = amb && amb.getContext('2d', { alpha: false });
    const video = root.querySelector('video[data-hero-video]');
    const hero = root.querySelector('[data-hero]'), cue = root.querySelector('[data-cue]');
    const hud = [...root.querySelectorAll('[data-hud]')];
    const caps = [...root.querySelectorAll('[data-cap]')].map((el) => ({ el, a: +el.dataset.from, b: +el.dataset.to, hold: el.hasAttribute('data-hold') }));
    const bars = [...root.querySelectorAll('[data-chapter]')].map((el) => ({ el, a: +el.dataset.from, b: +el.dataset.to }));
    const timeEl = root.querySelector('[data-time]'), dayEl = root.querySelector('[data-day]');
    const svg = root.querySelector('svg[data-leaders]');
    const ovs = [...root.querySelectorAll('[data-ov]')].map((el) => {
      const d = el.dataset, o = { el, a: +d.from, b: +d.to, fade: +(d.fade || 8), place: d.place || 'right', mplace: d.mplace || 'bottom', ka: +(d.kFrom || 0), kb: +(d.kTo || 0), at: d.at ? d.at.split(',').map(Number) : null, hold: el.hasAttribute('data-hold') };
      if (o.at && svg) { o.path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); o.ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); o.dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); o.ring.setAttribute('r', '9'); o.ring.setAttribute('class', 'ring'); o.dot.setAttribute('r', '2.5'); svg.append(o.path, o.ring, o.dot); }
      return o;
    });

    const n = C.n, iw = C.iw || 1280, ih = C.ih || 716;
    let W = 0, H = 0, dpr = 1, mobile = false, s0 = 1, near0 = !!C.eager;
    const frames = new Array(n).fill(null);
    let f = 0, ft = 0, p = 0, lastT = 0, raf = 0, drawn = '', heroOn = !!video, loadedSet = '', heroCamNow = null;

    // Frames load coarse-first so the whole story is scrubbable almost at once.
    function load() {
      if (!near0) return;
      const set = mobile ? 'm' : 'd';
      if (set === loadedSet) return; loadedSet = set; frames.fill(null);
      const order = [], seen = new Set();
      for (const s of [32, 16, 8, 4, 2, 1]) for (let i = 0; i < n; i += s) if (!seen.has(i)) { seen.add(i); order.push(i); }
      if (!seen.has(n - 1)) order.splice(1, 0, n - 1);
      let busy = 0; const q = order.slice();
      const pump = () => {
        while (busy < 6 && q.length) {
          const i = q.shift(); busy++;
          const im = new Image(); im.decoding = 'async';
          im.onload = () => (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => { if (set === loadedSet) { frames[i] = im; if (!root.classList.contains('is-drawn')) root.classList.add('is-drawn'); } busy--; drawn = ''; kick(); pump(); });
          im.onerror = () => { busy--; pump(); };
          im.src = `${C.base}${C.prefix}-${set}-${pad(i)}.webp`;
        }
      };
      pump();
    }
    const near = (i, dir) => { for (let j = i; j >= 0 && j < n; j += dir) if (frames[j]) return j; return -1; };

    function resize() {
      W = stick.clientWidth; H = stick.clientHeight; dpr = Math.min(devicePixelRatio || 1, 2);
      mobile = W / H < 0.85 || W < 700;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      if (amb) { amb.width = Math.max(1, Math.round(W / 8)); amb.height = Math.max(1, Math.round(H / 8)); }
      const [bx0, by0, bx1, by1] = C.box;
      s0 = mobile ? (W * C.mobileFill) / ((bx1 - bx0) * iw) : Math.min((W * 0.94) / ((bx1 - bx0) * iw), (H * 0.84) / ((by1 - by0) * ih));
      load(); drawn = ''; update(true);
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
    function heroCam() {
      const h = mobile ? C.hero.m : C.hero.d, a = anchor(), [bx0, by0, bx1, by1] = C.box;
      const S = Math.min((W * h.w) / ((bx1 - bx0) * iw), (H * 0.8) / ((by1 - by0) * ih));
      return [(bx0 + bx1) / 2 - ((h.cx - a[0]) * W) / (iw * S), (by0 + by1) / 2 - ((h.cy - a[1]) * H) / (ih * S), S / s0];
    }
    // Phones: cards scale to fit the lower part of the screen, the caption rides just above the card,
    // and the film tilts up so the action stays visible above both.
    const capsEl = root.querySelector('.story__caps');
    const vis = (o, fr) => (o.hold ? smooth(o.a, o.a + o.fade, fr) : Math.min(smooth(o.a, o.a + o.fade, fr), 1 - smooth(o.b - o.fade, o.b, fr)));
    const capVis = (c, fr) => (c.hold ? smooth(c.a, c.a + 5, fr) : Math.min(smooth(c.a, c.a + 5, fr), 1 - smooth(c.b - 5, c.b, fr)));
    function cardScale(o) { if (!mobile) return 1; const pw = o.el.offsetWidth || 1, ph = o.el.offsetHeight || 1; return Math.min(1, (H * 0.42) / ph, (W - 32) / pw); }
    function mobileLayout(fr) {
      // returns [film lift px, caption lift px]
      if (!mobile) return [0, 0];
      let v = 0, top = H;
      for (const o of ovs) { const k = vis(o, fr); if (k > 0.001) { const t0 = H - o.el.offsetHeight * cardScale(o) - 44; if (k > v) v = k; if (t0 < top) top = t0; } }
      if (v <= 0) return [0, 0];
      let ch = 0; for (const c of caps) if (capVis(c, fr) > 0.01) ch = Math.max(ch, c.el.offsetHeight);
      const capBottom = H - 58, capLift = Math.max(0, capBottom - (top - 14));
      const capTop = top - 14 - ch;
      const [, by0, , by1] = C.box; const c = camAt(fr), S = s0 * c[2], a = anchor();
      const boxBottom = a[1] * H + (by1 - c[1]) * ih * S;
      const filmLift = Math.min(H * 0.17, Math.max(0, boxBottom - (capTop - 6)));
      return [filmLift * v, capLift * v];
    }
    function camera(fr) {
      let c = camAt(fr);
      if (C.hero) { const h = heroCam(), u = smooth(0, C.heroEnd, p); if (u < 1) c = [lerp(h[0], c[0], u), lerp(h[1], c[1], u), lerp(h[2], c[2], u)]; }
      const a = anchor(), S = s0 * c[2], lift = mobile ? mobileLayout(fr)[0] : 0;
      return { S, L: a[0] * W - c[0] * iw * S, T: a[1] * H - c[1] * ih * S - lift };
    }
    const toScreen = (cam, x, y) => [cam.L + x * iw * cam.S, cam.T + y * ih * cam.S];

    function edges(L, T, w, h) { const s = canvas.style; s.webkitMaskSize = s.maskSize = `${w}px ${h}px`; s.webkitMaskPosition = s.maskPosition = `${L}px ${T}px`; }
    function ambient(src, cam) {
      if (!ag || !src) return;
      ag.fillStyle = C.bg; ag.fillRect(0, 0, amb.width, amb.height);
      ag.drawImage(src, cam.L / 8, cam.T / 8, (iw * cam.S) / 8, (ih * cam.S) / 8);
    }
    function draw(cam) {
      const i0 = Math.floor(f), u = f - i0;
      let a = near(i0, -1); if (a < 0) a = near(i0, 1); if (a < 0) return;
      const b = near(Math.min(n - 1, i0 + 1), 1);
      const key = `${a}|${b}|${u.toFixed(3)}|${cam.S.toFixed(4)}|${cam.L.toFixed(1)}|${cam.T.toFixed(1)}|${W}|${H}|${heroOn}`;
      if (key === drawn) return; drawn = key;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      const w = iw * cam.S, h = ih * cam.S;
      g.imageSmoothingQuality = 'high';
      g.globalAlpha = 1; g.drawImage(frames[a], cam.L, cam.T, w, h);
      if (b >= 0 && b !== a && u > 0.01 && !reduce) { g.globalAlpha = u; g.drawImage(frames[b], cam.L, cam.T, w, h); g.globalAlpha = 1; }
      edges(cam.L, cam.T, w, h);
      if (!heroOn) ambient(frames[a], cam);
    }

    function place(o, cam) {
      const el = o.el, pw = el.offsetWidth, ph = el.offsetHeight, gut = W < 700 ? 16 : Math.max(16, Math.min(56, W * 0.04));
      let x, y;
      if (mobile) {
        const ms = cardScale(o), vw = pw * ms, vh = ph * ms;
        el.style.setProperty('--ms', ms.toFixed(3));
        if (o.mplace === 'bottom-right') { x = W - vw - gut; y = H - vh - 44; }
        else { x = (W - vw) / 2; y = H - vh - 44; }
        return [x, y, vw, vh];
      } else {
        const [ax] = o.at ? toScreen(cam, o.at[0], o.at[1]) : [W / 2];
        if (o.place === 'left') { x = gut + 8; } else if (o.place === 'center') { x = (W - pw) / 2; } else { x = Math.min(W - pw - 48, Math.max(ax + 220, W * 0.66)); }
        y = clamp(H / 2 - ph / 2 + 10, 90, H - ph - 64);
      }
      return [x, y, pw, ph];
    }

    function overlays(cam) {
      const ho = C.hero ? 1 - smooth(0, C.heroEnd * 0.8, p) : 0;
      if (hero) { hero.style.opacity = ho; hero.style.transform = `translateY(${(1 - ho) * -24}px)`; hero.style.visibility = ho < 0.01 ? 'hidden' : 'visible'; }
      if (cue) cue.style.opacity = ho;
      const hu = C.hero ? smooth(C.heroEnd * 0.5, C.heroEnd * 1.3, p) : smooth(0, 0.02, p) * (1 - smooth(0.995, 1, p) * 0);
      hud.forEach((el) => { el.style.opacity = hu; });
      if (capsEl) capsEl.style.transform = mobile ? `translateY(${(-mobileLayout(f)[1]).toFixed(1)}px)` : '';
      for (const c of caps) {
        const o = capVis(c, f);
        c.el.style.setProperty('--o', (o * hu).toFixed(3)); c.el.style.visibility = o * hu < 0.01 ? 'hidden' : 'visible';
      }
      for (const c of bars) { c.el.style.setProperty('--f', clamp((f - c.a) / (c.b - c.a)).toFixed(4)); c.el.classList.toggle('is-on', f >= c.a && f < c.b + 0.5 && hu > 0.5); }
      if (timeEl && C.clock) {
        const K = C.clock; let k = 0; while (k < K.length - 2 && f > K[k + 1][0]) k++;
        const A = K[k], B = K[k + 1] || A, u = B[0] > A[0] ? clamp((f - A[0]) / (B[0] - A[0])) : 0;
        let m = Math.round(lerp(A[1], B[1], u)); const day = u < 1 || !B[2] ? A[2] : B[2];
        m = ((m % 1440) + 1440) % 1440; const hh = Math.floor(m / 60), mm = m % 60;
        timeEl.textContent = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
        if (dayEl && day) dayEl.textContent = day;
      }
      for (const o of ovs) {
        const v = vis(o, f) * hu;
        const el = o.el; el.style.visibility = v < 0.01 ? 'hidden' : 'visible';
        if (v < 0.01) { if (o.path) o.path.parentNode && (o.path.style.opacity = o.ring.style.opacity = o.dot.style.opacity = 0); continue; }
        const [x, y, , ph] = place(o, cam);
        el.style.setProperty('--o', v.toFixed(3)); el.style.setProperty('--x', `${x}px`); el.style.setProperty('--y', `${y + (1 - v) * 24}px`);
        if (o.kb > o.ka) el.style.setProperty('--k', smooth(o.ka, o.kb, f).toFixed(4));
        if (o.path) {
          const [ax, ay] = toScreen(cam, o.at[0], o.at[1]);
          const ex = mobile ? x + 24 : (x > ax ? x : x + o.el.offsetWidth), ey = mobile ? y : y + ph * 0.42, dx = ex - ax;
          o.path.setAttribute('d', mobile ? `M${ax.toFixed(1)},${ay.toFixed(1)} C${ax.toFixed(1)},${(ay + (ey - ay) * 0.6).toFixed(1)} ${ex.toFixed(1)},${(ey - (ey - ay) * 0.4).toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}` : `M${ax.toFixed(1)},${ay.toFixed(1)} C${(ax + dx * 0.5).toFixed(1)},${(ay - 40).toFixed(1)} ${(ex - dx * 0.3).toFixed(1)},${ey.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`);
          for (const c of [o.ring, o.dot]) { c.setAttribute('cx', ax.toFixed(1)); c.setAttribute('cy', ay.toFixed(1)); }
          o.ring.style.opacity = o.dot.style.opacity = (v * 0.9).toFixed(3); o.path.style.opacity = mobile ? 0 : (v * 0.9).toFixed(3);
        }
      }
    }

    function heroVideo() {
      if (!video) return;
      const on = p <= 0.004 && !reduce;
      if (on !== heroOn) {
        heroOn = on; video.classList.toggle('is-off', !on); drawn = '';
        if (on) { const pr = video.play(); if (pr && pr.catch) pr.catch(() => {}); } else setTimeout(() => { if (!heroOn) video.pause(); }, 520);
      }
      heroCamNow = camera(0);
      video.style.transform = `matrix(${heroCamNow.S},0,0,${heroCamNow.S},${heroCamNow.L},${heroCamNow.T})`;
    }
    function feedAmbient() {
      if (heroOn && heroCamNow && video.readyState >= 2) ambient(video, heroCamNow);
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(feedAmbient); else setTimeout(feedAmbient, 120);
    }

    function measure() {
      const r = root.getBoundingClientRect(), len = root.offsetHeight - H;
      p = clamp(-r.top / Math.max(1, len));
      const a = C.hero ? C.heroEnd : C.start || 0, b = C.filmEnd || 0.97;
      ft = clamp((p - a) / (b - a)) * (n - 1);
    }
    function frame(force) {
      measure(); if (force) f = ft;
      const cam = camera(f); heroVideo(); draw(cam); overlays(cam);
    }
    const update = frame;
    function tick(t) {
      raf = 0; const dt = Math.min(64, t - (lastT || t)); lastT = t;
      measure();
      const k = reduce ? 1 : 1 - Math.exp(-dt / 110);
      f += (ft - f) * k; if (Math.abs(ft - f) < 0.002) f = ft;
      const cam = camera(f); heroVideo(); draw(cam); overlays(cam);
      if (f !== ft) kick();
    }
    function kick() { if (!raf) raf = requestAnimationFrame(tick); }
    (window.__cxStory = window.__cxStory || {})[root.id] = { progress: () => p, frame: () => f, loaded: () => frames.filter(Boolean).length, n };

    if (!near0 && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { near0 = true; io.disconnect(); load(); } }, { rootMargin: '150% 0px' });
      io.observe(root);
    } else near0 = true;
    addEventListener('scroll', kick, { passive: true });
    addEventListener('resize', () => { const w = stick.clientWidth, h = stick.clientHeight; if (w !== W || Math.abs(h - H) > 80) resize(); });
    if (video) {
      video.style.width = iw + 'px'; video.style.height = ih + 'px';
      if (reduce) { video.removeAttribute('autoplay'); video.pause(); }
      feedAmbient();
    }
    root.classList.add('is-live');
    resize(); kick();
  }

  document.querySelectorAll('[data-story]').forEach((el) => { try { story(el); } catch (e) { console.warn('story', e); } });
})();
