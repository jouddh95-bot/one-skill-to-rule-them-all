// CHARGIX · site behaviour: floating header, sheet menu, fail-safe reveals, lazy 3D previews and
// small form helpers. Every block is guarded so one failure never hides content or breaks forms.
(function () {
  var root = document.documentElement;
  var guard = function (fn) { try { fn(); } catch (e) { if (window.console) console.warn('[cx]', e); } };

  // reveal: observe first, only then mark the page ready (which is what hides [data-reveal])
  guard(function () {
    var els = [].slice.call(document.querySelectorAll('[data-reveal]'));
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) return; // no class added, nothing ever hides
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -6% 0px' });
    els.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) el.classList.add('is-in'); else io.observe(el);
    });
    root.classList.add('cx-ready');
    // belt and braces: anything still hidden after a long while is shown
    setTimeout(function () { els.forEach(function (el) { if (!el.classList.contains('is-in') && el.getBoundingClientRect().top < innerHeight) el.classList.add('is-in'); }); }, 4000);
  });

  // header: transparent pill on the film, floating glass bar once the page scrolls
  guard(function () {
    var hdr = document.querySelector('[data-hdr]');
    if (!hdr) return;
    var float = function () { hdr.classList.toggle('is-float', scrollY > 24); };
    addEventListener('scroll', float, { passive: true }); float();
  });

  // mobile sheet menu
  guard(function () {
    var open = document.querySelector('[data-menu-open]'), sheet = document.querySelector('[data-sheet]');
    if (!open || !sheet) return;
    var close = sheet.querySelector('[data-menu-close]');
    var set = function (on) {
      sheet.hidden = !on; open.setAttribute('aria-expanded', on ? 'true' : 'false'); root.style.overflow = on ? 'hidden' : '';
      if (on) (sheet.querySelector('.sheet__nav a') || close).focus(); else open.focus();
    };
    open.addEventListener('click', function () { set(true); });
    close.addEventListener('click', function () { set(false); });
    sheet.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    addEventListener('keydown', function (e) {
      if (sheet.hidden) return;
      if (e.key === 'Escape') set(false);
      if (e.key === 'Tab') { // keep focus inside the sheet
        var f = sheet.querySelectorAll('a, button'), a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    });
    matchMedia('(min-width: 990px)').addEventListener('change', function (m) { if (m.matches && !sheet.hidden) set(false); });
  });

  // 3D previews: <model-viewer> loads only when the packages section nears the viewport
  guard(function () {
    var zones = [].slice.call(document.querySelectorAll('[data-mv-zone]'));
    if (!zones.length || !document.querySelector('[data-mv-tpl]')) return;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, loaded = false;
    var mount = function (zone) {
      if (!loaded) {
        loaded = true;
        var s = document.createElement('script'); s.type = 'module';
        s.src = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
        document.head.appendChild(s);
      }
      zone.querySelectorAll('[data-mv]').forEach(function (stage) {
        var tpl = stage.querySelector('[data-mv-tpl]'); if (!tpl || stage.dataset.mounted) return;
        stage.dataset.mounted = '1';
        var mv = tpl.content.firstElementChild.cloneNode(true);
        if (reduce) mv.removeAttribute('auto-rotate');
        mv.addEventListener('load', function () { stage.classList.add('is-ready'); });
        mv.addEventListener('error', function () { mv.remove(); }); // poster stays
        stage.insertBefore(mv, tpl);
      });
    };
    if (!('IntersectionObserver' in window)) { zones.forEach(mount); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { mount(e.target); io.unobserve(e.target); } });
    }, { rootMargin: '600px 0px' });
    zones.forEach(function (z) { io.observe(z); });
  });

  // variant radios update the shown price
  guard(function () {
    document.querySelectorAll('[data-price-group]').forEach(function (g) {
      var out = document.querySelector(g.dataset.priceGroup);
      g.addEventListener('change', function (e) { if (e.target.dataset.price && out) out.textContent = e.target.dataset.price; });
    });
  });
  // product page: keep the variant id the delivery estimate reads in step with the picked radio
  guard(function () {
    document.querySelectorAll('[data-product]').forEach(function (pdp) {
      var out = pdp.querySelector('[data-variant-id]');
      pdp.addEventListener('change', function (e) { if (e.target.matches('[data-option-input]') && out) out.value = e.target.value; });
    });
  });
  // quantity steppers
  guard(function () {
    document.querySelectorAll('[data-qty]').forEach(function (q) {
      var i = q.querySelector('input');
      q.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var v = Math.max(+i.min || 0, (+i.value || 0) + (b.dataset.step === '+' ? 1 : -1)); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  });
  // checkbox groups that post as one field (onboarding form)
  guard(function () {
    document.querySelectorAll('[data-group]').forEach(function (g) {
      var out = document.querySelector('[data-for="' + g.dataset.group + '"]');
      g.addEventListener('change', function () { out.value = [].slice.call(g.querySelectorAll('input:checked')).map(function (c) { return c.value; }).join(', '); });
    });
  });
})();
