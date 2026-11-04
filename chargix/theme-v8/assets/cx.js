// CHARGIX · site behaviour: header state, mobile menu, reveals, small form helpers.
(function () {
  document.documentElement.classList.add('cx-ready');
  var hdr = document.querySelector('[data-hdr]');
  if (hdr) {
    var solid = function () { hdr.classList.toggle('is-solid', scrollY > 24 && !document.body.classList.contains('film-on')); };
    addEventListener('scroll', solid, { passive: true }); solid();
    document.addEventListener('cx:film', function (e) { document.body.classList.toggle('film-on', e.detail.on); solid(); });
  }
  // mobile sheet
  var open = document.querySelector('[data-menu-open]'), sheet = document.querySelector('[data-sheet]');
  if (open && sheet) {
    var close = sheet.querySelector('[data-menu-close]');
    var set = function (on) {
      sheet.hidden = !on; open.setAttribute('aria-expanded', on ? 'true' : 'false'); document.documentElement.style.overflow = on ? 'hidden' : '';
      if (on) (sheet.querySelector('a') || close).focus(); else open.focus();
    };
    open.addEventListener('click', function () { set(true); });
    close.addEventListener('click', function () { set(false); });
    sheet.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheet.hidden) set(false); });
  }
  // reveal
  var els = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && els.length) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  } else els.forEach(function (el) { el.classList.add('is-in'); });
  // variant radios update the shown price
  document.querySelectorAll('[data-price-group]').forEach(function (g) {
    var out = document.querySelector(g.dataset.priceGroup);
    g.addEventListener('change', function (e) { if (e.target.dataset.price && out) out.textContent = e.target.dataset.price; });
  });
  // product page: keep the variant id the delivery estimate reads in step with the picked radio
  document.querySelectorAll('[data-product]').forEach(function (pdp) {
    var out = pdp.querySelector('[data-variant-id]');
    pdp.addEventListener('change', function (e) { if (e.target.matches('[data-option-input]') && out) out.value = e.target.value; });
  });
  // quantity steppers
  document.querySelectorAll('[data-qty]').forEach(function (q) {
    var i = q.querySelector('input');
    q.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var v = Math.max(+i.min || 0, (+i.value || 0) + (b.dataset.step === '+' ? 1 : -1)); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  // checkbox groups that post as one field (onboarding form)
  document.querySelectorAll('[data-group]').forEach(function (g) {
    var out = document.querySelector('[data-for="' + g.dataset.group + '"]');
    g.addEventListener('change', function () { out.value = [].slice.call(g.querySelectorAll('input:checked')).map(function (c) { return c.value; }).join(', '); });
  });
})();
