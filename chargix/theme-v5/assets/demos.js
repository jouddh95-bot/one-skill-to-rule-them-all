/* CHARGIX v3 "MONUMENT" · Package demos — core module.
   Room intros (scope disclosure), the light seam + wall gate, Room 01 (Mercer & Vane tour),
   Room 02 UI (Solenne: beats, colourways, stills, bag), the Room 03 store-admin console, and lazy loading of:
     demos-pavilion.js (three.js walk-in pavilion, Room 02, WebGL + motion only)
     demos-3d.js   (three.js watch, only when WebGL is available and motion is allowed)
     demos-shop.js (Casa Ocre store, when room 03 approaches)
   No frameworks. Everything degrades to readable static content. */

const root = document.querySelector('[data-dm]');
if (root) boot(root);

function boot(root) {
  const mqRM = matchMedia('(prefers-reduced-motion: reduce)');
  const RM = () => mqRM.matches;
  const isTouch = matchMedia('(hover: none), (pointer: coarse)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (t) => t * t * (3 - 2 * t);

  /* ── one shared scroll/resize ticker ── */
  const onScroll = new Set(); const onResize = new Set();
  let ticking = false;
  const tick = () => { ticking = false; onScroll.forEach((f) => f()); };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(tick); } }, { passive: true });
  let rT; addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { onResize.forEach((f) => f()); tick(); }, 120); });

  /* ── scope disclosures ── */
  root.querySelectorAll('[data-dm-scope]').forEach((btn) => {
    const panel = document.getElementById(btn.getAttribute('aria-controls'));
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      btn.querySelector('span').textContent = open ? 'Hide what’s included' : 'See what’s included';
      panel.hidden = !open;
      requestAnimationFrame(() => onResize.forEach((f) => f()));
    });
  });

  /* ═════════ Light seam + gate ═════════
     A plan line of daylight draws down each room intro, turns square and runs into the centre of
     the wall below; there the wall parts along the seam (two panels slide apart) onto the demo.
     Reduced motion: the line is fully drawn and the wall stays open (CSS hides the gate). */
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); return e; };
  const easeQ = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const rooms = [...root.querySelectorAll('[data-dm-ch]')].map((ch) => {
    const host = ch.querySelector('[data-dm-seam]');
    const intro = ch.querySelector('.dm-intro');
    const eyebrow = ch.querySelector('.dm-eyebrow');
    const gate = ch.querySelector('[data-dm-gate]');
    const v = { ch, gate, lit: null, len: 0, marks: [], tip: null, p: -1, q: -1, forced: false };
    v.build = () => {
      const W = ch.clientWidth; const H = Math.round(intro.offsetTop + intro.offsetHeight);
      host.style.height = H + 'px';
      const cs = getComputedStyle(intro);
      const x0 = Math.round(Math.max(10, parseFloat(cs.paddingLeft) - (W < 860 ? 16 : 34))) + .5;
      const y0 = Math.round(intro.offsetTop + eyebrow.offsetTop + eyebrow.offsetHeight / 2) + .5;
      const yc = Math.round(H - Math.min(74, Math.max(40, (H - y0) * .16))) + .5;
      const xe = Math.round(W / 2) + .5;
      const L1 = yc - y0, L2 = Math.abs(xe - x0), L3 = H - yc, T = L1 + L2 + L3;
      const d = `M${x0},${y0} V${yc} H${xe} V${H}`;
      host.innerHTML = '';
      const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' });
      svg.append(mk('path', { d, class: 's-ghost' }));
      v.marks = [];
      for (let y = y0 + 56; y < yc - 24; y += 56) { const t = mk('path', { d: `M${x0 - 4},${y} H${x0 + 5}`, class: 's-tick' }); svg.append(t); v.marks.push({ el: t, f: (y - y0) / T }); }
      for (let x = Math.min(x0, xe) + 64; x < Math.max(x0, xe) - 24; x += 64) { const t = mk('path', { d: `M${x},${yc - 4} V${yc + 5}`, class: 's-tick' }); svg.append(t); v.marks.push({ el: t, f: (L1 + Math.abs(x - x0)) / T }); }
      const lit = mk('path', { d, class: 's-lit' }); svg.append(lit);
      [[x0, y0, 0], [x0, yc, L1 / T], [xe, yc, (L1 + L2) / T]].forEach(([x, y, f]) => {
        const n = mk('rect', { x: x - 3.5, y: y - 3.5, width: 7, height: 7, class: 's-node' }); svg.append(n); v.marks.push({ el: n, f: Math.max(.001, f) });
      });
      const tip = mk('rect', { width: 5, height: 5, class: 's-tip' }); svg.append(tip);
      host.append(svg);
      v.lit = lit; v.len = lit.getTotalLength(); v.tip = tip;
      lit.style.strokeDasharray = v.len; lit.style.strokeDashoffset = v.len;
      v.p = -1; v.q = -1; v.update();
    };
    v.update = () => {
      if (!v.lit) return;
      let p = 1, q = 1;
      if (!RM()) {
        const vh = innerHeight; const r = host.getBoundingClientRect();
        p = clamp((vh * .72 - r.top) / Math.max(1, r.height));
        const gt = r.bottom; // the gate starts where the intro ends
        q = v.forced ? 1 : easeQ(clamp((vh * .74 - gt) / (vh * .5)));
        if (v.forced && gt > vh * .74) v.forced = false;
      }
      if (Math.abs(p - v.p) > .0005) {
        v.p = p;
        v.lit.style.strokeDashoffset = (v.len * (1 - p)).toFixed(1);
        const pt = v.lit.getPointAtLength(v.len * p); v.tip.setAttribute('x', pt.x - 2.5); v.tip.setAttribute('y', pt.y - 2.5);
        v.tip.style.opacity = p > .002 && p < .999 ? 1 : 0;
        v.marks.forEach((m) => m.el.classList.toggle('is-on', p >= m.f));
      }
      if (v.gate && Math.abs(q - v.q) > .0005) {
        v.q = q; v.gate.style.setProperty('--q', q.toFixed(4));
        ch.classList.toggle('is-gate-open', q >= .999);
      }
    };
    return v;
  });
  if (rooms.some((v) => v.gate)) root.classList.add('has-gate');
  const buildRooms = () => rooms.forEach((v) => v.build());
  buildRooms(); onResize.add(buildRooms); onScroll.add(() => rooms.forEach((v) => v.update()));
  if (document.fonts) document.fonts.ready.then(buildRooms);
  mqRM.addEventListener?.('change', () => rooms.forEach((v) => { v.p = -1; v.q = -1; v.update(); }));
  // Keyboard users never tab into a closed wall: focus inside a demo opens its gate at once.
  root.addEventListener('focusin', (e) => {
    const v = rooms.find((r) => r.ch.contains(e.target)); if (!v || e.target.closest('.dm-intro')) return;
    if (v.q < 1) { v.forced = true; v.q = -1; v.update(); }
  });

  /* ═════════ Room 01 · Mercer & Vane ═════════ */
  const ess = root.querySelector('[data-ess]');
  if (ess) initEssential(ess);

  function initEssential(ess) {
    const mv = ess.querySelector('[data-mv]');
    const view = ess.querySelector('[data-ess-view]');
    const track = ess.querySelector('[data-ess-track]');
    const phoneScr = ess.querySelector('[data-ess-phone]');
    const stepBtns = [...ess.querySelectorAll('[data-ess-go]')];
    const meter = ess.querySelector('[data-ess-meter]');

    // Art first, so the phone clone carries it.
    mv.querySelectorAll('[data-mv-art]').forEach((el) => { el.innerHTML = atelier(el.dataset.mvArt); });

    // Tabs (roving tabindex, arrow keys)
    const tabs = [...mv.querySelectorAll('[data-mv-tabbtn]')];
    const selectTab = (name, focus) => {
      tabs.forEach((t) => {
        const on = t.dataset.mvTabbtn === name;
        t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
        if (on && focus) t.focus({ preventScroll: true });
      });
      syncClone(); if (tour) render(true);
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => selectTab(t.dataset.mvTabbtn));
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
        e.preventDefault(); selectTab(tabs[(i + d + tabs.length) % tabs.length].dataset.mvTabbtn, true);
      });
    });

    // Burger (phone layout)
    const burger = mv.querySelector('[data-mv-burger]');
    burger.addEventListener('click', () => { const o = burger.getAttribute('aria-expanded') !== 'true'; burger.setAttribute('aria-expanded', o); mv.querySelector('.mv-hdr').classList.toggle('is-open', o); });

    // Bag
    let count = 0;
    mv.querySelectorAll('[data-mv-add]').forEach((b) => b.addEventListener('click', () => {
      count++; ess.querySelectorAll('[data-mv-count]').forEach((c) => (c.textContent = count));
      b.textContent = 'Added ✓'; b.classList.add('is-added');
      setTimeout(() => { b.textContent = 'Add to bag'; b.classList.remove('is-added'); }, 1800);
    }));
    mv.querySelector('[data-mv-bag]').addEventListener('click', (e) => {
      const n = mv.querySelector('[data-mv-note]'); go(3);
      n.textContent = count ? `${count} item${count > 1 ? 's' : ''} in the bag. Checkout is switched off in this concept demo.` : 'Your bag is empty. Add something from the Shop tab.';
      e.currentTarget.blur?.();
    });

    // Contact form, honest demo submit
    const form = mv.querySelector('[data-mv-form]');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const note = form.querySelector('[data-mv-note]');
      const name = form.elements.name; const mail = form.elements.email;
      const okName = name.value.trim().length > 0; const okMail = /.+@.+\..+/.test(mail.value.trim());
      name.setAttribute('aria-invalid', !okName); mail.setAttribute('aria-invalid', !okMail);
      if (!okName || !okMail) { note.textContent = 'Please add your name and a valid email.'; (okName ? mail : name).focus(); return; }
      note.textContent = `Thank you, ${name.value.trim().split(' ')[0]}. This is a concept demo, so nothing was sent.`;
      form.reset();
    });

    // Phone clone (desktop only): inert copy that mirrors the tour at mobile width
    let clone = null;
    function syncClone() {
      if (!phoneScr || getComputedStyle(phoneScr.parentElement).display === 'none') { if (phoneScr) phoneScr.innerHTML = ''; clone = null; measure(); return; }
      clone = mv.cloneNode(true);
      clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
      clone.querySelectorAll('[for],[aria-controls],[aria-labelledby]').forEach((n) => { n.removeAttribute('for'); n.removeAttribute('aria-controls'); n.removeAttribute('aria-labelledby'); });
      clone.querySelectorAll('textPath').forEach((n) => n.remove());
      clone.setAttribute('inert', ''); clone.removeAttribute('data-mv');
      phoneScr.innerHTML = ''; phoneScr.append(clone);
      measure();
    }

    // Tour mapping
    let tour = false, stops = [0], cStops = [0], travel = 0, cTravel = 0, cScale = 1;
    let cur = 0, tgt = 0, curP = 0, active = false, raf = 0, lastT = performance.now();
    const secs = () => [...mv.querySelectorAll('[data-mv-sec]')];
    function measure() {
      travel = Math.max(0, mv.offsetHeight - view.clientHeight);
      const s = secs().map((el) => Math.min(travel, el.offsetTop - (el.dataset.mvSec === '0' ? el.offsetTop : 8)));
      stops = [0, s[1], s[2], travel];
      if (clone) {
        cScale = phoneScr.clientWidth / 375; clone.style.setProperty('--s', cScale);
        cTravel = Math.max(0, clone.offsetHeight - phoneScr.clientHeight / cScale);
        const cs = [...clone.querySelectorAll('[data-mv-sec]')].map((el) => Math.min(cTravel, el.offsetTop - 8));
        cStops = [0, cs[1], cs[2], cTravel];
      }
    }
    const K = 4;
    const yAt = (p, st) => { const q = clamp(p / .92); const u = q * (K - 1); const i = Math.min(K - 2, Math.floor(u)); const f = u - i; const g = smooth(clamp((f - .32) / .68)); return st[i] + (st[i + 1] - st[i]) * g; };
    const progress = () => { const r = track.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - innerHeight)); };
    const pFor = (i) => i >= K - 1 ? .97 : ((i + .12) / (K - 1)) * .92;

    function setTour(on) {
      tour = on; ess.classList.toggle('is-tour', on);
      syncClone();
      if (on) { measure(); const vh = innerHeight; track.style.height = Math.round(vh + (K - 1) * vh * (innerWidth < 861 ? .75 : .85)) + 'px'; view.scrollTop = 0; }
      else { track.style.height = ''; mv.style.transform = ''; if (clone) clone.style.transform = `scale(${cScale})`; }
      render(true);
    }
    function render(force) {
      if (!tour) { const y = view.scrollTop; markStep(nearest(y, stops)); meter.style.setProperty('--p', travel ? y / travel : 0); return; }
      curP = progress(); tgt = yAt(curP, stops);
      const now = performance.now(); const dt = Math.min(.25, (now - lastT) / 1000); lastT = now;
      cur = force ? tgt : cur + (tgt - cur) * (1 - Math.exp(-dt * 9));
      if (Math.abs(tgt - cur) < .3) cur = tgt;
      mv.style.transform = `translate3d(0,${-cur.toFixed(1)}px,0)`;
      if (clone) { const cy = travel ? cur / travel * cTravel : 0; clone.style.transform = `scale(${cScale}) translate3d(0,${-cy.toFixed(1)}px,0)`; }
      meter.style.setProperty('--p', curP.toFixed(3));
      markStep(nearest(cur, stops));
    }
    const nearest = (y, st) => st.reduce((b, v, i) => (Math.abs(v - y) < Math.abs(st[b] - y) ? i : b), 0);
    let lastStep = -1;
    function markStep(i) { if (i === lastStep) return; lastStep = i; stepBtns.forEach((b, k) => { b.classList.toggle('is-on', k === i); b.setAttribute('aria-current', k === i ? 'step' : 'false'); }); }
    function loop() { render(false); raf = active && tour && Math.abs(tgt - cur) > .3 ? requestAnimationFrame(loop) : 0; }
    function kick() { if (!raf && tour) { lastT = performance.now(); raf = requestAnimationFrame(loop); } }
    function go(i, instant) {
      if (!tour) { view.scrollTo({ top: stops[i] ?? 0, behavior: RM() || instant ? 'auto' : 'smooth' }); return; }
      const r = track.getBoundingClientRect(); const top = scrollY + r.top + pFor(i) * (r.height - innerHeight);
      scrollTo({ top, behavior: instant || RM() ? 'auto' : 'smooth' });
    }
    stepBtns.forEach((b) => b.addEventListener('click', () => go(+b.dataset.essGo)));
    mv.addEventListener('click', (e) => {
      const l = e.target.closest('[data-mv-link]'); if (l) { if (l.dataset.mvTab) selectTab(l.dataset.mvTab); go(+l.dataset.mvLink); mv.querySelector('.mv-hdr').classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); }
      const t = e.target.closest('[data-mv-top]'); if (t) { e.preventDefault(); go(0); }
    });
    mv.addEventListener('focusin', (e) => {
      if (!tour) return; view.scrollTop = 0;
      const sec = e.target.closest('[data-mv-sec]'); const i = sec ? +sec.dataset.mvSec : 0;
      const yEl = e.target.getBoundingClientRect().top - mv.getBoundingClientRect().top;
      if (yEl < cur || yEl > cur + view.clientHeight - 60) go(i, true);
    });
    view.addEventListener('scroll', () => { if (tour) view.scrollTop = 0; else render(); }, { passive: true });

    if ('ResizeObserver' in window) new ResizeObserver(() => { measure(); if (tour) render(true); }).observe(mv);
    const wantTour = () => !RM() && 'IntersectionObserver' in window;
    setTour(wantTour());
    mqRM.addEventListener?.('change', () => setTour(wantTour()));
    let lastW = innerWidth, lastH = innerHeight;
    onResize.add(() => {
      // Phone URL bars resize the viewport height while scrolling: only rebuild on real changes.
      if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 160) { measure(); render(true); return; }
      lastW = innerWidth; lastH = innerHeight; setTour(wantTour());
    });
    if (document.fonts) document.fonts.ready.then(() => { measure(); render(true); });
    new IntersectionObserver(([en]) => { active = en.isIntersecting; if (active) kick(); }, { rootMargin: '100px' }).observe(track);
    onScroll.add(() => { if (active && tour) kick(); });
  }

  /* ═════════ Room 02 · Solenne (UI; the WebGL lives in demos-3d.js) ═════════ */
  const sl = root.querySelector('[data-sl]');
  if (sl) initSolenne(sl);

  function initSolenne(sl) {
    const track = sl.querySelector('[data-sl-track]');
    const stage = sl.querySelector('[data-sl-stage]');
    const canvas = sl.querySelector('[data-sl-canvas]');
    const img = sl.querySelector('[data-sl-img]'); const imgX = sl.querySelector('[data-sl-img-x]');
    const hot = sl.querySelector('[data-sl-hot]');
    const nEl = sl.querySelector('[data-sl-n]'); const bar = sl.querySelector('[data-sl-bar]');
    const CW = {
      steel: { name: 'Steel · Ink', price: '$4,200', alt: 'steel case with ink-blue radial-brushed dial' },
      gold: { name: 'Gold · Malachite', price: '$6,900', alt: 'gold-tone case with deep green radial-brushed dial' },
      titanium: { name: 'Titanium · Blush', price: '$4,800', alt: 'matte titanium case with blush-pink dial' },
    };
    const state = { cw: 'steel', strap: 'leather', p: 0 };
    let api = null, mode = 'pending', active = false;
    const stillUrl = (k) => root.dataset['still' + k[0].toUpperCase() + k.slice(1)];

    const setStill = () => {
      if (!img.getAttribute('src') || img.dataset.k !== state.cw) { img.src = stillUrl(state.cw); img.dataset.k = state.cw; }
      img.alt = `Studio render of the Solenne Ligne 39 watch, ${CW[state.cw].alt}`;
      if (!imgX.getAttribute('src')) imgX.src = stillUrl('exploded');
    };
    function setCw(k, from) {
      if (!CW[k]) return; state.cw = k; sl.dataset.cw = k;
      sl.querySelectorAll('[data-sl-cw] [data-cw]').forEach((b) => b.setAttribute('aria-checked', b.dataset.cw === k));
      sl.querySelectorAll('input[name="sl-cw"]').forEach((r) => { r.checked = r.value === k; });
      sl.querySelector('[data-sl-cwname]').textContent = CW[k].name;
      sl.querySelector('[data-sl-price]').textContent = CW[k].price;
      if (mode === 'still') setStill();
      api?.setColourway(k);
      if (from !== 'pv') sl.dispatchEvent(new CustomEvent('sl:cw', { detail: k }));
    }
    sl.__setCw = setCw;
    const cwBtns = [...sl.querySelectorAll('[data-sl-cw] [data-cw]')];
    cwBtns.forEach((b, i) => {
      b.addEventListener('click', () => setCw(b.dataset.cw));
      b.addEventListener('keydown', (e) => {
        const d = ['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 0; if (!d) return;
        e.preventDefault(); const nb = cwBtns[(i + d + cwBtns.length) % cwBtns.length]; setCw(nb.dataset.cw); nb.focus();
      });
    });
    cwBtns.forEach((b) => (b.tabIndex = b.getAttribute('aria-checked') === 'true' ? 0 : -1));
    sl.querySelector('[data-sl-cw]').addEventListener('click', () => cwBtns.forEach((b) => (b.tabIndex = b.getAttribute('aria-checked') === 'true' ? 0 : -1)));
    sl.querySelectorAll('input[name="sl-cw"]').forEach((r) => r.addEventListener('change', () => { setCw(r.value); cwBtns.forEach((b) => (b.tabIndex = b.dataset.cw === r.value ? 0 : -1)); }));
    sl.querySelectorAll('input[name="sl-strap"]').forEach((r) => r.addEventListener('change', () => { state.strap = r.value; api?.setStrap(r.value); }));
    let bag = 0;
    sl.querySelector('[data-sl-add]').addEventListener('click', () => {
      bag++; sl.querySelector('[data-sl-count]').textContent = bag;
      sl.querySelector('[data-sl-note]').textContent = `Added: Ligne 39, ${CW[state.cw].name}, ${state.strap} strap. Concept demo, nothing was charged.`;
    });

    // Hotspots
    const hps = [...hot.querySelectorAll('.sl-hp')];
    hps.forEach((b) => b.addEventListener('click', () => {
      const open = b.getAttribute('aria-expanded') !== 'true';
      hps.forEach((o) => { o.setAttribute('aria-expanded', 'false'); document.getElementById(o.getAttribute('aria-describedby')).classList.remove('is-on'); });
      if (open) { b.setAttribute('aria-expanded', 'true'); document.getElementById(b.getAttribute('aria-describedby')).classList.add('is-on'); }
    }));
    let hotOn = false;
    const setHot = (on) => { if (on === hotOn) return; hotOn = on; hot.classList.toggle('is-on', on); hps.forEach((b) => { b.tabIndex = on ? 0 : -1; }); if (!on) hps.forEach((o) => { o.setAttribute('aria-expanded', 'false'); document.getElementById(o.getAttribute('aria-describedby')).classList.remove('is-on'); }); };
    hps.forEach((b) => (b.tabIndex = -1));

    // Scroll state → CSS + scene
    let lastBeat = -1;
    function update() {
      const r = track.getBoundingClientRect();
      const p = clamp(-r.top / Math.max(1, r.height - innerHeight)); state.p = p;
      sl.style.setProperty('--p', p.toFixed(4));
      const beat = Math.min(4, Math.round(p * 4));
      if (beat !== lastBeat) { lastBeat = beat; sl.dataset.beat = beat; nEl.textContent = '0' + (beat + 1); }
      bar.style.transform = `scaleX(${p.toFixed(4)})`;
      if (mode === 'gl') { api.setProgress(p); setHot(Math.abs(p - .5) < .09); }
    }
    onScroll.add(update); onResize.add(update); update();

    // Hotspot positions follow the 3D parts every frame
    function placeHot() {
      if (!hotOn || !api) return;
      const W = stage.clientWidth, H = stage.clientHeight;
      hps.forEach((b) => {
        const q = api.project(b.dataset.hp); if (!q) return;
        const x = q.x * W, flip = x > W - 130; b.classList.toggle('is-l', flip);
        b.style.transform = `translate(${(flip ? x - b.offsetWidth + 30 : x).toFixed(1)}px,${(q.y * H).toFixed(1)}px)`;
        const tip = document.getElementById(b.getAttribute('aria-describedby'));
        tip.style.transform = `translate(${Math.max(8, Math.min(W - tip.offsetWidth - 8, q.x * W - (flip ? tip.offsetWidth : 0) + (flip ? -10 : 18))).toFixed(1)}px,${(q.y * H + 18).toFixed(1)}px)`;
      });
    }

    // Drag hint fades once used
    const dragHint = sl.querySelector('[data-sl-drag]');

    function useStill() { mode = 'still'; sl.classList.add('sl--still'); sl.classList.remove('sl--gl'); setStill(); }
    function hasGL() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }

    const start = async () => {
      if (RM() || !hasGL()) { useStill(); return; }
      try {
        const mod = await import(root.dataset.modWatch);
        api = await mod.init({ canvas, stage, isTouch, state, onFrame: placeHot, onDrag: () => dragHint.classList.add('is-used') });
        mode = 'gl'; sl.classList.add('sl--gl'); api.setActive(active); update();
        if (location.search.includes('slDebug')) window.__slApi = api;
      } catch (err) { console.warn('[demos] 3D scene unavailable, showing stills', err); useStill(); }
    };
    mqRM.addEventListener?.('change', () => { if (RM() && mode === 'gl') { api.setActive(false); useStill(); } });
    let started = false;
    new IntersectionObserver(([en]) => {
      active = en.isIntersecting;
      if (en.isIntersecting && !started) { started = true; start(); }
      api?.setActive(active && mode === 'gl');
    }, { rootMargin: '600px 0px' }).observe(track);
  }

  /* ═════════ Room 02 · the pavilion (walk-in 3D, lazy) ═════════ */
  const pv = root.querySelector('[data-pv]');
  if (pv) initPavilion(pv);

  function initPavilion(pv) {
    const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
    if (RM() || !gl || !root.dataset.modPavilion || !('IntersectionObserver' in window)) return; // the product scene carries the room
    pv.classList.add('pv--on');
    let started = false;
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting || started) return; started = true; io.disconnect();
      import(root.dataset.modPavilion).then(async (m) => {
        const api = await m.init({ root: pv, isTouch, assets: { hdr: root.dataset.csHdr }, onColourway: (k) => sl?.__setCw?.(k, 'pv') });
        pv.classList.add('pv--ready');
        sl?.addEventListener('sl:cw', (e) => api.setColourway(e.detail));
        if (location.search.includes('pvDebug')) window.__pvApi = api;
      }).catch((err) => { console.warn('[demos] pavilion unavailable', err); pv.classList.remove('pv--on'); });
    }, { rootMargin: '900px 0px' });
    io.observe(pv);
    mqRM.addEventListener?.('change', () => { if (RM()) pv.classList.remove('pv--on'); });
  }

  /* ═════════ Room 03 · the 3D showroom (walk-in house, links into the shop) ═════════ */
  const cs = root.querySelector('[data-cs]');
  if (cs) initCasa(cs);

  function initCasa(cs) {
    const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
    if (RM() || !gl || !root.dataset.modCasa || !('IntersectionObserver' in window)) return; // the storefront below carries the room
    cs.classList.add('cs--on');
    const d = root.dataset, assets = { hdr: d.csHdr, sofa: d.csSofa, chair: d.csChair, pouf: d.csPouf, cup: d.csCup, lamp: d.csLamp };
    let started = false;
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting || started) return; started = true; io.disconnect();
      import(d.modCasa).then(async (m) => {
        const api = await m.init({ root: cs, isTouch, assets });
        cs.classList.add('cs--ready');
        if (location.search.includes('pvDebug')) window.__csApi = api;
      }).catch((err) => { console.warn('[demos] showroom unavailable', err); cs.classList.remove('cs--on'); });
    }, { rootMargin: '900px 0px' });
    io.observe(cs);
    mqRM.addEventListener?.('change', () => { if (RM()) cs.classList.remove('cs--on'); });
  }

  /* ═════════ Room 03 · store-admin console ═════════ */
  const adm = root.querySelector('[data-co-adm]');
  if (adm) initConsole(adm);

  function initConsole(adm) {
    const tabs = [...adm.querySelectorAll('[data-adm-tab]')];
    const pick = (t, focus) => {
      tabs.forEach((o) => { const on = o === t; o.setAttribute('aria-selected', on); o.tabIndex = on ? 0 : -1; document.getElementById(o.getAttribute('aria-controls')).hidden = !on; });
      if (focus) t.focus({ preventScroll: true });
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => pick(t));
      t.addEventListener('keydown', (e) => {
        const d = ['ArrowDown', 'ArrowRight'].includes(e.key) ? 1 : ['ArrowUp', 'ArrowLeft'].includes(e.key) ? -1 : 0; if (!d) return;
        e.preventDefault(); pick(tabs[(i + d + tabs.length) % tabs.length], true);
      });
    });
    // product filter
    const rows = [...adm.querySelectorAll('[data-adm-rows] tr')]; const more = adm.querySelector('[data-adm-more]');
    adm.querySelector('[data-adm-filter]')?.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase(); let n = 0;
      rows.forEach((r) => { const on = !q || r.textContent.toLowerCase().includes(q); r.hidden = !on; n += on; });
      more.textContent = q ? `${n} shown here · the full catalogue holds 40 products.` : '+ 30 more products, each with a description written for you, sizes and colours as variants, images prepared.';
    });
    // theme settings → live preview
    const prev = adm.querySelector('[data-adm-prev]');
    const radio = (sel, fn) => { const bs = [...adm.querySelectorAll(sel)]; bs.forEach((b) => b.addEventListener('click', () => { bs.forEach((o) => o.setAttribute('aria-checked', o === b)); fn(b); })); };
    radio('[data-adm-acc]', (b) => prev.style.setProperty('--acc', b.dataset.admAcc));
    radio('[data-adm-type]', (b) => { prev.dataset.type = b.dataset.admType; });
    radio('[data-adm-btn]', (b) => { prev.dataset.btn = b.dataset.admBtn; });
    // launch checklist
    const boxes = [...adm.querySelectorAll('[data-adm-check] input')];
    const sync = () => { const d = boxes.filter((b) => b.checked).length; adm.querySelector('[data-adm-pct]').textContent = `${d} of ${boxes.length} done`; adm.querySelector('[data-adm-left]').textContent = boxes.length - d; };
    boxes.forEach((b) => b.addEventListener('change', sync)); sync();
  }

  /* ═════════ Room 03 · Casa Ocre (lazy) ═════════ */
  const co = root.querySelector('[data-co]');
  if (co) {
    let done = false;
    const load = () => { if (done) return; done = true; import(root.dataset.modShop).then((m) => m.init(co, { RM })).catch((e) => console.warn('[demos] store demo failed', e)); };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '1200px 0px' });
      io.observe(co);
    } else load();
    if (location.hash && co.querySelector(location.hash)) load();
  }

  requestAnimationFrame(tick);
}

/* ─────────── Atelier illustrations (flat, layered, no ids) ─────────── */
function atelier(kind) {
  const NAVY = '#26324a', NAVY_D = '#1a2335', NAVY_L = '#36446a', CH = '#f3efe7', RED = '#a93a2a', TAPE = '#e2c35c', GOLD = '#c59a45';
  const f1 = (v) => (+v).toFixed(1);
  const mir = (d, W = 300) => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (m, x, y) => `${f1(W - x)},${y}`);
  const out = [];
  const svg = (W, H, body) => `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${body}</svg>`;
  const twill = (W, H, col, op, gap = 8) => { let s = ''; for (let x = -H; x < W + 10; x += gap) s += `<path d="M${x},0 L${x + H * .8},${H}" stroke="${col}" stroke-width="1" opacity="${op}"/>`; return s; };

  if (kind === 'hero') {
    const L = 'M136,62 C112,66 86,70 74,84 C64,102 67,132 77,162 C85,186 90,202 89,218 C88,240 82,258 80,278 C102,286 126,288 146,284 C148,252 150,214 150,182 Z';
    const lapel = 'M136,62 L150,182 L124,122 L109,101 L121,97 L117,82 L128,64 Z';
    out.push('<ellipse cx="150" cy="337" rx="74" ry="6" fill="#1d2638" opacity=".16"/>');
    out.push(`<path d="M150,326 L110,341 M150,326 L190,341 M150,326 V343" stroke="#5d5a55" stroke-width="4" stroke-linecap="round" fill="none"/><rect x="147" y="262" width="6" height="66" fill="#8d8577"/><rect x="143" y="300" width="14" height="6" rx="1" fill="#6f6a63"/>`);
    out.push('<rect x="136" y="30" width="28" height="34" fill="#b9ab94"/><ellipse cx="150" cy="30" rx="15" ry="4.5" fill="#9c8f78"/><circle cx="150" cy="24" r="4" fill="#5d5a55"/>');
    out.push(`<path d="M132,62 C110,66 84,70 74,84 C66,100 70,130 80,160 C88,185 94,200 94,210 C92,230 84,248 82,262 L218,262 C216,248 208,230 206,210 C206,200 212,185 220,160 C230,130 234,100 226,84 C216,70 190,66 168,62 Z" fill="#d8cdbb"/>`);
    // finished left half, basted right half
    out.push(`<path d="${L}" fill="${NAVY}"/><path d="${mir(L)}" fill="${NAVY_L}"/>`);
    out.push(`<path d="M136,62 L164,62 L150,182 Z" fill="#eef1f5"/><path d="M150,70 V182" stroke="#d3d9e3" stroke-width="2"/><path d="M137,62 L150,76 L141,84 Z" fill="#fff" stroke="#cfd6e0"/><path d="${mir('M137,62 L150,76 L141,84 Z')}" fill="#fff" stroke="#cfd6e0"/>`);
    out.push(`<path d="${lapel}" fill="${NAVY_D}" stroke="#3e4c6c" stroke-width="1"/><path d="${mir(lapel)}" fill="#2c3856" stroke="#4a5a7f" stroke-width="1"/>`);
    out.push(`<path d="M78,90 C86,108 86,128 80,146" stroke="${NAVY_D}" stroke-width="2" fill="none"/><path d="${mir('M78,90 C86,108 86,128 80,146')}" stroke="#25304b" stroke-width="2" fill="none"/>`);
    // pocket square + welt, hip pocket
    out.push(`<path d="M95,130 L101,117 L107,126 L113,115 L119,127 Z" fill="${RED}"/><rect x="92" y="127" width="30" height="5" fill="${NAVY_D}" transform="rotate(-6 107 129)"/>`);
    out.push(`<rect x="86" y="234" width="42" height="11" rx="1" fill="${NAVY_D}" stroke="#3e4c6c" stroke-width="1"/>`);
    // buttons
    out.push('<circle cx="149" cy="198" r="3.6" fill="#10151f"/><circle cx="149" cy="224" r="3.6" fill="#10151f"/><circle cx="148" cy="197" r="1" fill="#6c7894"/><circle cx="148" cy="223" r="1" fill="#6c7894"/>');
    // basting, chalk and pins on the unfinished half
    out.push(`<path d="M152,186 C153,214 153,252 155,280 M158,285 C180,288 202,286 218,280 M224,90 C214,104 212,126 220,148" stroke="${CH}" stroke-width="1.4" stroke-dasharray="5 4" fill="none" opacity=".9"/>`);
    out.push(`<rect x="172" y="234" width="42" height="11" rx="1" fill="none" stroke="${CH}" stroke-width="1.1" stroke-dasharray="3 2.5" opacity=".85"/>`);
    out.push(`<path d="M182,118 l22,5 M176,206 l30,-3 M196,160 l6,6 m0,-6 l-6,6" stroke="${CH}" stroke-width="1.6" stroke-linecap="round" opacity=".85"/>`);
    out.push(`<g stroke="#c9ced6" stroke-width="1.1"><path d="M190,74 l9,12"/><path d="M200,76 l7,13"/><path d="M211,80 l4,13"/></g><circle cx="190" cy="74" r="2.2" fill="${RED}"/><circle cx="200" cy="76" r="2.2" fill="${GOLD}"/><circle cx="211" cy="80" r="2.2" fill="${RED}"/>`);
    // tape measure around the neck
    const tl = 'M131,58 C121,92 113,140 108,196', tr = 'M169,58 C182,88 192,122 197,168';
    out.push(`<path d="M131,58 C139,49 161,49 169,58" stroke="#c6a945" stroke-width="7" fill="none"/>`);
    [tl, tr].forEach((d) => out.push(`<path d="${d}" stroke="${TAPE}" stroke-width="7" fill="none"/><path d="${d}" stroke="#6b5a2a" stroke-width="6" stroke-dasharray=".8 4.2" fill="none" opacity=".55"/>`));
    out.push('<rect x="104.5" y="194" width="7" height="6" fill="#b9bcc2"/><rect x="193.5" y="166" width="7" height="6" fill="#b9bcc2"/>');
    return svg(300, 345, out.join(''));
  }
  if (kind === 'square') {
    out.push(`<rect width="300" height="345" fill="${NAVY}"/><g>${twill(300, 345, '#5a6a8f', .2, 6)}</g>`);
    // a silk square laid flat, one corner folded back, hand-rolled hem, small monogram
    out.push('<g transform="rotate(-8 150 176)">');
    out.push('<rect x="58" y="84" width="184" height="184" fill="#000" opacity=".22" transform="translate(6 8)"/>');
    out.push(`<path d="M58,84 H242 V214 L188,268 H58 Z" fill="${RED}"/>`);
    let dots = ''; for (let y = 98; y < 262; y += 15) for (let x = 72 + ((y - 98) / 15 % 2) * 7.5; x < 236; x += 15) { if (x + y > 450) continue; dots += `<circle cx="${f1(x)}" cy="${y}" r="1.9" fill="#f3d9c9"/>`; }
    out.push(dots);
    out.push('<path d="M242,214 L188,268 L188,214 Z" fill="#c5543f"/><path d="M188,214 H242 L188,268 Z" fill="none" stroke="#7d2619" stroke-width="1.2"/>');
    out.push('<path d="M58,84 H242 V214 L188,268 H58 Z" fill="none" stroke="#7d2619" stroke-width="3" stroke-linejoin="round"/><path d="M62,88 H238 V212 L187,263 H62 Z" fill="none" stroke="#f3d9c9" stroke-width=".9" stroke-dasharray="2 3" opacity=".7"/>');
    out.push('<path d="M88,84 C120,140 100,200 150,268" stroke="#fff" stroke-width="14" opacity=".06" fill="none"/>');
    out.push(`<text x="76" y="252" font-family="'Bodoni Moda', Georgia, serif" font-style="italic" font-size="20" fill="#f6e3d8">MV</text></g>`);
    return svg(300, 345, out.join(''));
  }
  if (kind === 'shirt') {
    out.push('<rect width="300" height="345" fill="#e5e1d8"/><rect x="0" y="300" width="300" height="45" fill="#d8d3c8"/>');
    out.push(`<rect x="40" y="62" width="220" height="250" rx="2" fill="${NAVY_D}"/><rect x="48" y="70" width="204" height="234" fill="#f4f1eb"/><path d="M48,70 L96,120 M252,70 L204,120" stroke="#e1dbcf" stroke-width="1"/>`);
    out.push('<rect x="72" y="96" width="156" height="196" fill="#f7f9fc" stroke="#d3d9e3"/>');
    let g = ''; for (let y = 100; y < 290; y += 5) g += `<path d="M73,${y} H227" stroke="#c9d6ea" stroke-width=".8" opacity=".55"/>`; out.push(g);
    out.push('<rect x="146" y="118" width="8" height="174" fill="#eef2f8" stroke="#d3d9e3"/>');
    [142, 170, 198, 226, 254].forEach((y) => out.push(`<circle cx="150" cy="${y}" r="3" fill="#ece6da" stroke="#b8b0a2" stroke-width=".8"/>`));
    out.push('<rect x="112" y="90" width="76" height="14" rx="5" fill="#edf1f7" stroke="#cfd6e0"/>');
    out.push('<path d="M150,120 L114,98 L104,140 Z" fill="#fff" stroke="#c7cfdb"/><path d="M150,120 L186,98 L196,140 Z" fill="#fff" stroke="#c7cfdb"/><path d="M112,104 L106,136 M188,104 L194,136" stroke="#d9dee7" stroke-width="1"/>');
    out.push(`<rect x="140" y="92" width="20" height="9" fill="${NAVY}"/><rect x="72" y="204" width="156" height="26" fill="${RED}"/><text x="150" y="221" text-anchor="middle" font-family="Figtree, sans-serif" font-size="8.5" font-weight="600" letter-spacing="2.6" fill="#f6eee6">MERCER &amp; VANE</text>`);
    return svg(300, 345, out.join(''));
  }
  if (kind === 'gift') {
    out.push('<rect width="300" height="345" fill="#ebe5da"/><rect x="0" y="292" width="300" height="53" fill="#e0d9cc"/>');
    out.push('<g transform="rotate(4 150 210)"><rect x="40" y="142" width="226" height="150" fill="#d6c9b1"/><path d="M40,142 L153,222 L266,142" stroke="#c1b296" stroke-width="2" fill="none"/><path d="M40,292 L128,214 M266,292 L178,214" stroke="#c9bba1" stroke-width="1.4"/></g>');
    out.push(`<g transform="rotate(-7 150 140)"><rect x="56" y="70" width="196" height="122" rx="4" fill="${NAVY}"/><rect x="64" y="78" width="180" height="106" rx="2" fill="none" stroke="${GOLD}" stroke-width="1" opacity=".8"/>`
      + `<text x="80" y="112" font-family="'Bodoni Moda', Georgia, serif" font-style="italic" font-size="21" fill="#f4f1eb">Mercer &amp; Vane</text>`
      + `<text x="80" y="132" font-family="Figtree, sans-serif" font-size="8" font-weight="600" letter-spacing="2.4" fill="${GOLD}">GIFT CARD</text>`
      + `<text x="228" y="170" text-anchor="end" font-family="'Bodoni Moda', Georgia, serif" font-size="26" fill="#f4f1eb">$100</text></g>`);
    out.push(`<path d="M196,40 C180,120 200,220 188,330" stroke="${RED}" stroke-width="2" fill="none"/><path d="M0,226 C90,214 210,236 300,220" stroke="${RED}" stroke-width="2" fill="none"/><circle cx="193" cy="224" r="5" fill="${RED}"/><path d="M193,224 c-14,-10 -22,4 -8,8 M193,224 c14,-12 22,2 8,8" stroke="${RED}" stroke-width="2" fill="none"/>`);
    return svg(300, 345, out.join(''));
  }
  // 'bench': the cutting table seen from above
  const W = 300, H = 270;
  out.push(`<rect width="${W}" height="${H}" fill="#3b4250"/>`);
  let grid = ''; for (let x = 10; x < W; x += 20) grid += `<path d="M${x},0 V${H}" stroke="#4a5366" stroke-width="1"/>`; for (let y = 10; y < H; y += 20) grid += `<path d="M0,${y} H${W}" stroke="#4a5366" stroke-width="1"/>`; out.push(`<g opacity=".7">${grid}</g>`);
  const pat = 'M34,40 L150,26 L176,118 L146,206 L58,214 L26,128 Z';
  out.push(`<path d="${pat}" fill="#efe7d6"/><path d="M44,50 L146,37 L168,118 L140,198 L64,204 L36,128 Z" fill="none" stroke="${RED}" stroke-width="1.2" stroke-dasharray="5 3"/>`);
  out.push(`<path d="M100,70 V176 M96,76 l4,-8 4,8 M96,170 l4,8 4,-8" stroke="#6c6a66" stroke-width="1.2" fill="none"/><path d="M150,26 l-4,10 M176,118 l-10,0 M58,214 l3,-10" stroke="#6c6a66" stroke-width="1.4"/>`);
  out.push(`<text x="70" y="128" font-family="Figtree, sans-serif" font-size="8" font-weight="600" letter-spacing="1.6" fill="#8b857a">FRONT · CUT 2</text>`);
  out.push(`<g stroke="#c9ced6" stroke-width="1.1"><path d="M120,58 l10,6"/><path d="M58,186 l9,-6"/></g><circle cx="120" cy="58" r="2.6" fill="${RED}"/><circle cx="58" cy="186" r="2.6" fill="${GOLD}"/>`);
  // shears
  out.push('<path d="M214,137 L284,62 L289,66 L220,145 Z" fill="#cfd4db"/><path d="M211,143 L287,76 L290,82 L216,149 Z" fill="#aeb4be"/><path d="M216,140 L284,64" stroke="#eef1f4" stroke-width="1" opacity=".8"/>');
  out.push('<path d="M214,142 L192,166 M214,142 L204,178" stroke="#1b1d22" stroke-width="7" stroke-linecap="round"/><ellipse cx="182" cy="176" rx="16" ry="10" transform="rotate(-42 182 176)" fill="none" stroke="#1b1d22" stroke-width="7"/><ellipse cx="200" cy="196" rx="22" ry="12" transform="rotate(-52 200 196)" fill="none" stroke="#1b1d22" stroke-width="7"/><circle cx="214" cy="142" r="3.4" fill="#7c828c" stroke="#e1e5ea" stroke-width="1"/>');
  // chalk
  out.push(`<path d="M232,24 L266,30 L246,56 Z" fill="${CH}"/><path d="M236,27 L262,31" stroke="#d8d1c3" stroke-width="2"/>`);
  // thread spools
  [[52, 238, RED], [92, 244, GOLD], [132, 238, '#e9ecf1']].forEach(([x, y, c]) => {
    out.push(`<circle cx="${x}" cy="${y}" r="17" fill="#cdbf9f"/><circle cx="${x}" cy="${y}" r="14" fill="${c}"/>`);
    for (let r = 6; r < 14; r += 2.4) out.push(`<circle cx="${x}" cy="${y}" r="${f1(r)}" fill="none" stroke="#000" stroke-width=".6" opacity=".14"/>`);
    out.push(`<circle cx="${x}" cy="${y}" r="5" fill="#d9cdb3"/><circle cx="${x}" cy="${y}" r="2" fill="#2a2f3a"/>`);
  });
  // tape measure, coiled, with a tail
  out.push(`<path d="M222,236 L176,252 L178,262 L224,246 Z" fill="${TAPE}"/>`);
  out.push(`<circle cx="248" cy="226" r="28" fill="${TAPE}"/>`);
  for (let r = 6; r < 27; r += 3.2) out.push(`<circle cx="248" cy="226" r="${f1(r)}" fill="none" stroke="#a88a2c" stroke-width=".8" opacity=".55"/>`);
  out.push('<circle cx="248" cy="226" r="4" fill="#8a7224"/>');
  return svg(W, H, out.join(''));
}
