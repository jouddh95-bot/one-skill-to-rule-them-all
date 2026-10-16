// CHARGIX v8 · browser check of the unpublished theme: film progress points, every home section,
// product/service pages, cart + checkout hand-off, demo storefronts, forms. Desktop and phone.
// usage: node capture-v8.mjs <outDir> <themeId> <label>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out, themeId] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const base = 'https://chargix.store';
const q = (p) => `${base}${p}${p.includes('?') ? '&' : '?'}preview_theme_id=${themeId}`;
const log = []; const note = (s) => { log.push(s); console.log(s); };
const views = [
  { name: 'desk', viewport: { width: 1440, height: 900 }, dpr: 1 },
  { name: 'mob', viewport: { width: 390, height: 844 }, dpr: 2, mobile: true },
];
const browser = await chromium.launch();
for (const v of views) {
  const ctx = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: !!v.mobile, hasTouch: !!v.mobile });
  const page = await ctx.newPage();
  page.on('pageerror', e => note(`[${v.name}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') note(`[${v.name}] console: ${m.text().slice(0, 200)}`); });
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('monorail')) note(`[${v.name}] http ${r.status()}: ${r.url().slice(0, 160)}`); });
  const shot = (n, full = false) => page.screenshot({ path: `${out}/${v.name}-${n}.jpg`, quality: 78, type: 'jpeg', fullPage: full });
  await page.goto(q('/'), { waitUntil: 'networkidle', timeout: 120000 });
  await page.evaluate(() => window.__cxFilm && window.__cxFilm.ready).catch(() => {});
  await page.waitForTimeout(8000);
  note(`[${v.name}] sections: ${await page.evaluate(() => [...document.querySelectorAll('main > *')].map(e => e.id || e.className.split(' ')[0]).join(', '))}`);
  for (const p of [0, 0.03, 0.06, 0.1, 0.2, 0.3, 0.45, 0.55, 0.66, 0.75, 0.81, 0.88, 0.97]) {
    await page.evaluate(p => window.__cxFilm.seek(p), p); await page.waitForTimeout(2500);
    const cap = await page.evaluate(() => { const c = document.querySelector('.cap.is-on'); return c ? c.querySelector('.cap__h').textContent : '-'; });
    note(`[${v.name}] film ${p}: caption "${cap}"`);
    await shot(`film-${String(Math.round(p * 100)).padStart(2, '0')}`);
  }
  await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((e) => e.classList.add('is-in')));
  for (const id of ['studio', 'packages', 'compare', 'process', 'care', 'faq']) {
    const el = await page.$('#' + id); if (!el) { note(`[${v.name}] missing #${id}`); continue; }
    await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(900);
    await el.screenshot({ path: `${out}/${v.name}-sec-${id}.jpg`, type: 'jpeg', quality: 78 });
  }
  const buys = await page.$$eval('#packages form[action*="/cart/add"] button', bs => bs.map(b => b.textContent.trim()));
  note(`[${v.name}] package buttons: ${JSON.stringify(buys)}`);
  if (v.name === 'desk') {
    // buy now on a package goes to checkout (stop there; nothing is paid)
    await page.$eval('#packages', el => el.scrollIntoView());
    const [resp] = await Promise.all([page.waitForNavigation({ timeout: 60000 }).catch(() => null), page.click('#packages .pk:nth-child(2) button[name="add"]')]);
    await page.waitForTimeout(3000); note(`[desk] after Buy now: ${page.url().replace(/\?.*/, '')}`); await shot('checkout-handoff');
    await page.goto(q('/cart/clear'), { waitUntil: 'networkidle' }).catch(() => {});
  }
  for (const [n, path] of [['svc', '/products/business-launch'], ['care', '/products/care-plan'], ['ess-demo', '/?view=essential-demo'], ['3d-demo', '/?view=3d-demo'], ['launch-demo', '/?view=launch-demo'], ['contact', '/pages/contact'], ['onboarding', '/pages/onboarding'], ['collection', '/collections/all'], ['404', '/nope-404']]) {
    await page.goto(q(path), { waitUntil: 'networkidle', timeout: 90000 }).catch(e => note(`[${v.name}] goto ${path}: ${e.message}`));
    await page.waitForTimeout(2500); await shot(n, true);
  }
  // physical product: first item in the shop, add to cart, view cart
  await page.goto(q('/collections/all'), { waitUntil: 'networkidle' });
  const href = await page.$$eval('a.card', as => (as.find(a => !/website|launch|care-plan/.test(a.href)) || {}).href).catch(() => null);
  if (href) {
    await page.goto(href.includes('preview_theme_id') ? href : q(new URL(href).pathname), { waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await shot('product', true);
    const eta = await page.$eval('[data-eta-range]', e => e.textContent).catch(() => 'none'); note(`[${v.name}] eta: ${eta}`);
    await Promise.all([page.waitForNavigation({ timeout: 60000 }).catch(() => null), page.click('form[action*="/cart/add"] button[name="add"]')]);
    await page.goto(q('/cart'), { waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await shot('cart', true);
    note(`[${v.name}] cart lines: ${await page.$$eval('.line', l => l.length)}`);
    await page.goto(q('/cart/clear'), { waitUntil: 'networkidle' }).catch(() => {});
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${out}/log.txt`, log.join('\n'));
