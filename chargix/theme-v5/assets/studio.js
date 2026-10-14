/* CHARGIX — shared interaction layer (identity v5 · MONUMENT).
   Header (progress, hide-on-scroll, scrollspy), accessible mobile menu
   (dialog, focus trap, Esc, inert page), split-text headings, reveals,
   package-plinth light (fine pointers only), process rail, care billing
   toggle, compare sheet, onboarding form helpers. GSAP + ScrollTrigger are
   optional: without them content is revealed with IntersectionObserver;
   with reduced motion nothing animates.
   The 3D film (mono-*.js) owns window.__cxReady; this file never sets it. */
(function () {
  'use strict';
  var doc = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  /* ---------- Split text ------------------------------------------------- */
  // Text nodes are split into words (and chars); child elements such as <em>
  // stay whole so italics keep one continuous shape.
  function splitText(el, mode) {
    if (el.classList.contains('is-split')) return el;
    var label = el.textContent.replace(/\s+/g, ' ').trim();
    var units = [];
    function unit(content, isEl) {
      var mask = document.createElement('span'); mask.className = (isEl && content.tagName === 'EM') ? 'sx-mask is-em' : 'sx-mask'; mask.style.display = 'inline-block';
      if (mode !== 'words') { mask.style.overflow = 'hidden'; mask.style.verticalAlign = 'top'; mask.style.paddingBottom = '.28em'; mask.style.marginBottom = '-.28em'; mask.style.paddingRight = '.06em'; mask.style.marginRight = '-.06em'; }
      var inner = document.createElement('span'); inner.className = mode === 'chars' && !isEl ? 'sx-word' : 'sx-word sx-u';
      inner.style.display = 'inline-block';
      if (isEl) { inner.appendChild(content); units.push(inner); }
      else if (mode === 'chars') {
        Array.from(content).forEach(function (ch) { var c = document.createElement('span'); c.className = 'sx-ch'; c.textContent = ch; inner.appendChild(c); units.push(c); });
      } else { inner.textContent = content; units.push(inner); }
      mask.appendChild(inner);
      return mode === 'words' ? inner : mask;
    }
    function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(' '));
            else frag.appendChild(unit(part, false));
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) {
          if (n.classList.contains('sx-line')) walk(n);
          else { var holder = unit(n.cloneNode(true), true); node.replaceChild(holder, n); }
        }
      });
    }
    walk(el);
    if (mode === 'chars') { el.setAttribute('aria-label', label); $$('.sx-mask, .sx-line', el).forEach(function (m) { m.setAttribute('aria-hidden', 'true'); }); }
    el.classList.add('is-split');
    el._units = units;
    return el;
  }

  ready(function () {
    var G = window.gsap, ST = window.ScrollTrigger;
    var hasGsap = !!(G && ST);
    if (hasGsap) G.registerPlugin(ST); else doc.classList.add('no-gsap');

    if (!reduced) $$('[data-split]').forEach(function (el) { splitText(el, el.getAttribute('data-split')); });

    /* ---------- Mobile menu (dialog: focus trap, Esc, inert page) -------- */
    var hdr = $('[data-hdr]'), prog = $('[data-progress]');
    var btn = $('[data-menu-btn]'), drawer = document.getElementById('MenuDrawer');
    var menuOpen = false;
    if (btn && drawer) {
      var outside = function () { return $$('body > *').filter(function (n) { return n !== drawer && !n.contains(hdr) && n.tagName !== 'SCRIPT' && !n.classList.contains('grain'); }); };
      var hdrOthers = function () { return $$('.hdr__in > *', hdr).filter(function (n) { return !n.contains(btn); }).concat($$('.hdr__end > *', hdr).filter(function (n) { return n !== btn; })); };
      var lastFocus = null;
      var setInert = function (on) {
        outside().concat(hdrOthers()).forEach(function (n) {
          if (on) { n.setAttribute('inert', ''); n.setAttribute('data-cx-inert', ''); }
          else if (n.hasAttribute('data-cx-inert')) { n.removeAttribute('inert'); n.removeAttribute('data-cx-inert'); }
        });
      };
      var setOpen = function (open, restore) {
        if (open === menuOpen) return;
        menuOpen = open;
        btn.setAttribute('aria-expanded', String(open));
        drawer.hidden = !open;
        doc.classList.toggle('menu-open', open);
        document.body.style.overflow = open ? 'hidden' : '';
        setInert(open);
        if (open) {
          lastFocus = document.activeElement;
          hdr && hdr.classList.remove('is-hidden');
          var first = $('a, button', drawer); if (first) first.focus({ preventScroll: true });
        } else if (restore !== false) {
          (btn || lastFocus).focus({ preventScroll: true });
        }
      };
      btn.addEventListener('click', function () { setOpen(!menuOpen); });
      drawer.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false, false); });
      document.addEventListener('keydown', function (e) {
        if (!menuOpen) return;
        if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
        if (e.key !== 'Tab') return;
        var f = [btn].concat($$('a[href], button:not([disabled]), input, select, textarea', drawer)).filter(function (x) { return x.offsetParent !== null || x === btn; });
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === f.length - 1 || i === -1)) { e.preventDefault(); f[0].focus(); }
      });
      window.matchMedia('(min-width: 1041px)').addEventListener('change', function (m) { if (m.matches) setOpen(false, false); });
    }

    /* ---------- Header: progress, hide on scroll, scrollspy --------------- */
    var lastY = window.scrollY, ticking = false;
    function onScroll() {
      var y = window.scrollY, max = doc.scrollHeight - window.innerHeight;
      if (prog) prog.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
      if (hdr) {
        hdr.classList.toggle('is-scrolled', y > 40);
        var hide = !menuOpen && !hdr.contains(document.activeElement) && y > 480 && y > lastY + 2;
        if (hide) hdr.classList.add('is-hidden');
        if (y < lastY - 2 || y < 480) hdr.classList.remove('is-hidden');
      }
      lastY = y; ticking = false;
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    if (hdr) hdr.addEventListener('focusin', function () { hdr.classList.remove('is-hidden'); });
    onScroll();

    var nav = $('[data-nav]'), ind = nav && $('.nav__ind', nav);
    function moveInd(a) {
      if (!ind) return;
      if (!a) { ind.classList.remove('is-on'); return; }
      ind.style.width = a.offsetWidth + 'px';
      ind.style.transform = 'translateX(' + a.offsetLeft + 'px)';
      ind.classList.add('is-on');
    }
    if (nav) {
      var navLinks = $$('a', nav), active = null, map = {};
      navLinks.forEach(function (a) {
        a.addEventListener('mouseenter', function () { moveInd(a); });
        a.addEventListener('focus', function () { moveInd(a); });
        var h = (a.getAttribute('href') || '').split('#')[1]; if (h) map[h] = a;
      });
      nav.addEventListener('mouseleave', function () { moveInd(active); });
      var targets = Object.keys(map).map(function (id) { return document.getElementById(id); }).filter(Boolean);
      if ('IntersectionObserver' in window && targets.length) {
        var spy = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            navLinks.forEach(function (a) { a.classList.remove('is-active'); });
            active = map[en.target.id]; active.classList.add('is-active'); moveInd(active);
          });
        }, { rootMargin: '-45% 0px -50% 0px' });
        targets.forEach(function (t) { spy.observe(t); });
      }
    }

    /* ---------- Plinth light: a soft specular follows the pointer -------- */
    if (!reduced && finePointer) {
      $$('[data-tilt-card]').forEach(function (c) {
        c.addEventListener('pointermove', function (e) {
          var r = c.getBoundingClientRect();
          c.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
          c.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
        });
      });
    }

    /* ---------- Compare slider (kept for sections that use [data-compare]) - */
    $$('[data-compare]').forEach(function (box) {
      var range = $('[data-compare-range]', box);
      function set(v) { v = Math.max(0, Math.min(100, v)); box.style.setProperty('--pos', v + '%'); if (range) range.value = Math.round(v); }
      if (range) range.addEventListener('input', function () { set(+range.value); });
    });

    /* ---------- Concept mock interactions (data-demo) ---------------------- */
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-demo] [data-set]');
      if (!b) return;
      var demo = b.closest('[data-demo]'), grp = b.closest('[role=group]') || b.parentNode;
      var key = grp.getAttribute('data-key') || 'state', val = b.getAttribute('data-set');
      demo.setAttribute('data-' + key, val);
      $$('[data-set]', grp).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      $$('[data-when]', demo).forEach(function (w) { if ((w.getAttribute('data-key') || 'state') === key) w.hidden = w.getAttribute('data-when') !== val; });
    });

    /* ---------- Care billing toggle -------------------------------------- */
    $$('[data-care]').forEach(function (wrap) {
      var tog = $('[data-bill-toggle]', wrap); if (!tog) return;
      var pill = $('i', tog), btns = $$('[data-bill-set]', tog);
      function place(b) { if (pill && b) { pill.style.width = b.offsetWidth + 'px'; pill.style.transform = 'translateX(' + (b.offsetLeft - 5) + 'px)'; } }
      btns.forEach(function (b) {
        b.addEventListener('click', function () {
          wrap.setAttribute('data-billing', b.getAttribute('data-bill-set'));
          btns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
          place(b);
        });
      });
      tog.classList.add('is-ready');
      place(btns[0]);
      window.addEventListener('resize', function () { place($('[aria-pressed=true]', tog)); });
      if (document.fonts) document.fonts.ready.then(function () { place($('[aria-pressed=true]', tog)); });
    });

    /* ---------- Compare table opens from #compare links -------------------- */
    function openCompare() { if (location.hash === '#compare') { var d = $('[data-compare-details]'); if (d) d.open = true; } }
    openCompare(); window.addEventListener('hashchange', openCompare);
    document.addEventListener('click', function (e) { var a = e.target.closest('a[href$="#compare"]'); if (a) { var d = $('[data-compare-details]'); if (d) d.open = true; } });

    /* ---------- Onboarding form: summarise checkbox groups ---------------- */
    $$('#ProjectForm').forEach(function (form) {
      form.addEventListener('submit', function () {
        $$('[data-group]', form).forEach(function (group) {
          var name = group.getAttribute('data-group');
          var vals = $$('input:checked', group).map(function (i) { return i.value; });
          var hidden = form.querySelector('input[type=hidden][data-for="' + name + '"]');
          if (hidden) hidden.value = vals.join(', ') || '—';
        });
      });
    });

    /* ---------- Reveals ---------------------------------------------------- */
    var items = $$('[data-reveal]');
    if (reduced || !('IntersectionObserver' in window)) items.forEach(function (el) { el.classList.add('is-in'); });
    else {
      var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('is-in'); io.unobserve(x.target); } }); }, { rootMargin: '0px 0px -6% 0px' });
      items.forEach(function (el) { io.observe(el); });
    }

    var plist = $('[data-proc]');
    if (reduced || !hasGsap) {
      $$('.proc__step').forEach(function (s) { s.classList.add('is-active'); });
      if (plist) plist.style.setProperty('--pp', 1);
      return;
    }

    /* =================== GSAP motion =================== */
    ST.config({ ignoreMobileResize: true });
    ST.addEventListener('refresh', function () { document.dispatchEvent(new Event('cx:layout')); });

    // Section headings: words rise out of their masks
    $$('[data-split="lines"]').forEach(function (h) {
      G.from(h._units || [], { yPercent: 115, duration: 1.1, ease: 'expo.out', stagger: 0.045, scrollTrigger: { trigger: h, start: 'top 88%', once: true } });
    });

    // Process: a line of light runs down the corridor, steps open as they reach it
    if (plist) {
      ST.create({ trigger: plist, start: 'top 62%', end: 'bottom 62%', scrub: true, onUpdate: function (s) { plist.style.setProperty('--pp', s.progress.toFixed(3)); } });
      var big = $('[data-proc-big] span');
      var swap = function (step) {
        if (!big) return;
        var n = step.getAttribute('data-proc-step'); if (big.textContent === n) return;
        G.to(big, { yPercent: -100, duration: 0.3, ease: 'power2.in', onComplete: function () { big.textContent = n; G.fromTo(big, { yPercent: 100 }, { yPercent: 0, duration: 0.6, ease: 'expo.out' }); } });
      };
      $$('[data-proc-step]', plist).forEach(function (step) {
        ST.create({ trigger: step, start: 'top 64%', onEnter: function () { step.classList.add('is-active'); swap(step); }, onLeaveBack: function () {
          step.classList.remove('is-active');
          var prev = step.previousElementSibling; if (prev && prev.hasAttribute('data-proc-step')) swap(prev);
        } });
      });
      // If the page loads below the process section, open everything above the fold line.
      ST.addEventListener('refresh', function () { $$('[data-proc-step]', plist).forEach(function (s) { if (s.getBoundingClientRect().top < window.innerHeight * 0.64) s.classList.add('is-active'); }); });
    }

    // Finale title (cx-cta finale style)
    var fin = $('[data-fin-title]');
    if (fin) G.fromTo(fin._units || [], { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, ease: 'power3.out', stagger: 0.02, scrollTrigger: { trigger: fin, start: 'top 85%', end: 'top 40%', scrub: 0.8 } });

    // Footer wordmark letters settle into place
    var wm = $('[data-ftr-wm] .wm');
    if (wm) G.from($$('.wm__w > span', wm), { yPercent: 60, opacity: 0, ease: 'power3.out', stagger: 0.05, scrollTrigger: { trigger: wm, start: 'top 98%', end: 'bottom 90%', scrub: 0.8 } });

    if (document.fonts) document.fonts.ready.then(function () { ST.refresh(); });
    window.addEventListener('load', function () { ST.refresh(); });
  });
})();

