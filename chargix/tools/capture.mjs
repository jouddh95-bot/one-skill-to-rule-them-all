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
const pause = (page, on) => page.evaluate(on => { window.__cxPause = on; window.__pvPause = on; if (!on) dispatchEvent(new Event('scroll')); }, on).catch(() => {});
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
  const sections = await page.evaluate(() => [...document.querySelectorAll('main > *')].map(s => `${s.id || s.className.slice(0, 40)} h=${Math.round(s.getBoundingClientRect().height)}`));
  fs.writeFileSync(`${out}/${label}-${v.name}-sections.txt`, sections.join('\n'));
  await ctx.close();
}
fs.writeFileSync(`${out}/${label}-errors.txt`, errors.join('\n'));
await browser.close();
