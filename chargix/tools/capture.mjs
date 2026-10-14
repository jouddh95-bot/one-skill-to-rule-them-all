// Screenshot the CHARGIX storefront at fixed scroll progress points.
// usage: node capture.mjs <outDir> <themeId> <label>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out, themeId, label = 'cap'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const url = `https://chargix.store/?preview_theme_id=${themeId}&pb=0&pvDebug`;
const views = [
  { name: 'desk', viewport: { width: 1440, height: 900 }, dpr: 1 },
  { name: 'mob', viewport: { width: 390, height: 844 }, dpr: 2, mobile: true },
];
const story = [0, 0.08, 0.16, 0.27, 0.38, 0.5, 0.62, 0.72, 0.84, 0.95];
const finale = [0.2, 0.5, 0.85];
const errors = [];
const pause = (page, on) => page.evaluate(on => { window.__cxPause = on; window.__pvPause = on; window.__csPause = on; if (!on) dispatchEvent(new Event('scroll')); }, on).catch(() => {});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const v of views) {
  const ctx = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: !!v.mobile, hasTouch: !!v.mobile });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${v.name}] console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${v.name}] pageerror: ${e.message}`));
  page.on('requestfailed', r => errors.push(`[${v.name}] reqfail: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400) errors.push(`[${v.name}] http ${r.status()}: ${r.url()}`); });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(4000);
  const shotAt = async (sel, p, tag) => {
    const y = await page.evaluate(([sel, p]) => {
      const el = document.querySelector(sel); if (!el) return null;
      const b = el.getBoundingClientRect(); const top = b.top + scrollY;
      return Math.round(top + (b.height - innerHeight) * p);
    }, [sel, p]);
    if (y == null) return;
    await page.evaluate(y => window.scrollTo(0, y), y);
    await page.waitForTimeout(1500);
    await pause(page, true);
    // draw the exact progress point synchronously (the eased loop is slow under software GL)
    await page.evaluate(([sel, p]) => {
      const m = sel.match(/data-cx-region="(\w+)"/);
      if (m && window.__cxMonument) window.__cxMonument.shot(m[1], p);
      if (sel.includes('data-pv-track') && window.__pvApi) window.__pvApi.shot(p);
      if (sel.includes('data-cs-track') && window.__csApi) window.__csApi.shot(p);
    }, [sel, p]).catch(e => errors.push(`hook ${e.message}`));
    await page.screenshot({ path: `${out}/${label}-${v.name}-${tag}.jpg`, quality: 88, type: "jpeg", timeout: 60000 }).catch(e => errors.push(`[${v.name}] shot ${tag}: ${e.message.split("\n")[0]}`)); await pause(page, false);
  };
  for (const p of story) await shotAt('[data-cx-region="hall"]', p, `story-${String(Math.round(p * 1000)).padStart(4, '0')}`);
  for (const id of ['#work', '#demos', '#demo-essential', '#demo-3d', '#demo-launch', '#packages', '#compare', '#services', '#process', '#care', '#faq']) {
    const ok = await page.evaluate(id => { const el = document.querySelector(id); if (!el) return false; el.scrollIntoView(); return true; }, id);
    if (!ok) continue;
    await page.waitForTimeout(2500);
    await pause(page, true); await page.screenshot({ path: `${out}/${label}-${v.name}-sec-${id.replace(/[^a-z0-9]/g, '')}.jpg`, quality: 85, type: 'jpeg', timeout: 60000 }).catch(e => errors.push(`[${v.name}] shot ${id}: ${e.message.split('\n')[0]}`));
  }
  for (const p of finale) await shotAt('[data-cx-region="light"]', p, `finale-${String(Math.round(p * 1000)).padStart(4, '0')}`);
  // Room 02 pavilion (walk-in 3D) and Room 03 store admin + store interactions
  for (const p of [0, 0.2, 0.38, 0.5, 0.7, 0.95]) await shotAt('[data-pv-track]', p, `pv-${String(Math.round(p * 1000)).padStart(4, '0')}`);
  // Room 03 walk-in showroom: wait for the furniture models, then shoot the path and one picked jar
  await page.evaluate(() => document.querySelector('[data-cs]')?.scrollIntoView()); await page.waitForTimeout(3000);
  await page.waitForFunction(() => window.__csApi, null, { timeout: 120000 }).catch(e => errors.push(`[${v.name}] casa api: ${e.message.split('\n')[0]}`));
  await page.evaluate(() => window.__csApi?.ready).catch(() => {});
  for (const p of [0, 0.26, 0.55, 0.8, 1]) await shotAt('[data-cs-track]', p, `cs-${String(Math.round(p * 1000)).padStart(4, '0')}`);
  await page.evaluate(() => { window.__csApi?.fabric('sofa:Champagne'); window.__csApi?.choose('Cántaro jar · cobalt'); }).catch(e => errors.push(`cs pick ${e.message}`));
  await page.waitForTimeout(2500); await shotAt('[data-cs-track]', 0.92, 'cs-pick');
  const csGo = await page.evaluate(() => { const b = document.querySelector('[data-cs-card-go]'); if (!b || document.querySelector('[data-cs-card]').hidden) return 'card hidden'; b.click(); return 'clicked'; }).catch(e => e.message);
  await page.waitForTimeout(2500); await pause(page, true); await page.screenshot({ path: `${out}/${label}-${v.name}-cs-go.jpg`, quality: 85, type: 'jpeg', timeout: 60000 }).catch(() => {}); await pause(page, false);
  errors.push(`[${v.name}] casa card -> shop: ${csGo}`);
  for (const p of [0.1, 0.5, 0.9]) await shotAt('[data-sl-track]', p, `sl-${String(Math.round(p * 1000)).padStart(4, '0')}`);
  const state = await page.evaluate(() => ({ mono: !!window.__cxMono, ready: !!window.__cxReady, html: document.documentElement.className, pv: document.querySelector('[data-pv]')?.className, gates: document.querySelectorAll('.dm-gate').length }));
  errors.push(`[${v.name}] state ${JSON.stringify(state)}`);
  const clickShot = async (sel, tag) => { const ok = await page.evaluate(sel => { const el = document.querySelector(sel); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; }, sel); if (!ok) { errors.push(`[${v.name}] missing ${sel}`); return; } await page.waitForTimeout(1500); await pause(page, true); await page.screenshot({ path: `${out}/${label}-${v.name}-${tag}.jpg`, quality: 85, type: 'jpeg', timeout: 60000 }).catch(e => errors.push(`[${v.name}] shot ${tag}: ${e.message.split('\n')[0]}`)); };
  await clickShot('#adm-t-products', 'adm-products');
  await clickShot('#adm-t-brand', 'adm-brand');
  await clickShot('#adm-t-channels', 'adm-channels');
  await clickShot('#adm-t-launch', 'adm-launch');
  await clickShot('[data-co-store] [data-co-go="product"]', 'store-pdp');
  await clickShot('[data-co-store] [data-co-add], [data-co-store] .co-add, [data-co-store] button[type="submit"]', 'store-add');
  await clickShot('[data-co-cart]', 'store-cart');
  await page.evaluate(() => document.querySelector('dialog[open]')?.close());
  // commerce path on the real store (no purchase): package buttons, product page, add to cart, cart with checkout button
  const buy = await page.evaluate(() => [...document.querySelectorAll('#packages a')].filter(a => /cart|products/.test(a.getAttribute('href') || '')).map(a => `${a.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)} -> ${a.getAttribute('href')}`));
  errors.push(`[${v.name}] package links ${JSON.stringify(buy)}`);
  if (v.name === 'desk') for (const h of ['essential-website', '3d-experience-website', 'business-launch']) {
    const r = await page.goto(`https://chargix.store/products/${h}?preview_theme_id=${themeId}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => null);
    errors.push(`[desk] product ${h}: ${r?.status()}`);
    await page.waitForTimeout(2500); await page.screenshot({ path: `${out}/${label}-desk-pdp-${h}.jpg`, quality: 80, type: 'jpeg' }).catch(() => {});
    const add = await page.evaluate(() => { const f = document.querySelector('form[action*="/cart/add"]'); const b = f?.querySelector('[type="submit"], button[name="add"]'); if (!b) return 'no add button'; b.click(); return 'clicked add'; }).catch(e => e.message);
    errors.push(`[desk] ${h} add: ${add}`); await page.waitForTimeout(3500);
  }
  if (v.name === 'desk') {
    await page.goto(`https://chargix.store/cart?preview_theme_id=${themeId}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500); await page.screenshot({ path: `${out}/${label}-desk-cart.jpg`, quality: 80, type: 'jpeg', fullPage: true }).catch(() => {});
    const cart = await page.evaluate(() => fetch('/cart.js').then(r => r.json()).then(c => ({ items: c.items.map(i => `${i.product_title} $${(i.final_line_price / 100).toFixed(2)}`), total: c.total_price / 100 }))).catch(e => e.message);
    const co = await page.evaluate(() => !!document.querySelector('[name="checkout"], a[href*="/checkout"], button[form*="cart"]'));
    errors.push(`[desk] cart ${JSON.stringify(cart)} checkout button: ${co}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  }
  const sections = await page.evaluate(() => [...document.querySelectorAll('main > *')].map(s => `${s.id || s.className.slice(0, 40)} h=${Math.round(s.getBoundingClientRect().height)}`));
  fs.writeFileSync(`${out}/${label}-${v.name}-sections.txt`, sections.join('\n'));
  await ctx.close();
}
fs.writeFileSync(`${out}/${label}-errors.txt`, errors.join('\n'));
await browser.close();
