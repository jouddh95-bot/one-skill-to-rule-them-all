// Screenshot the CHARGIX storefront at fixed scroll progress points.
// usage: node capture.mjs <outDir> <themeId> <label>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out, themeId, label = 'cap'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const url = `https://chargix.store/?preview_theme_id=${themeId}&pb=0`;
const views = [
  { name: 'desk', viewport: { width: 1440, height: 900 }, dpr: 2 },
  { name: 'mob', viewport: { width: 390, height: 844 }, dpr: 3, mobile: true },
];
const story = [0, 0.05, 0.12, 0.2, 0.27, 0.285, 0.32, 0.38, 0.47, 0.55, 0.6, 0.66, 0.72, 0.78, 0.84, 0.9, 0.95, 0.99];
const finale = [0.1, 0.3, 0.5, 0.7, 0.9];
const errors = [];
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
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${out}/${label}-${v.name}-${tag}.jpg`, quality: 88, type: "jpeg", timeout: 60000 }).catch(e => errors.push(`[${v.name}] shot ${tag}: ${e.message.split("\n")[0]}`));
  };
  for (const p of story) await shotAt('[data-cx-region="hall"]', p, `story-${String(Math.round(p * 1000)).padStart(4, '0')}`);
  for (const id of ['#work', '#demos', '#demo-essential', '#demo-3d', '#demo-launch', '#packages', '#compare', '#services', '#process', '#care', '#faq']) {
    const ok = await page.evaluate(id => { const el = document.querySelector(id); if (!el) return false; el.scrollIntoView(); return true; }, id);
    if (!ok) continue;
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/${label}-${v.name}-sec-${id.replace(/[^a-z0-9]/g, '')}.jpg`, quality: 85, type: 'jpeg', timeout: 60000 }).catch(e => errors.push(`[${v.name}] shot ${id}: ${e.message.split('\n')[0]}`));
  }
  for (const p of finale) await shotAt('[data-cx-region="light"]', p, `finale-${String(Math.round(p * 1000)).padStart(4, '0')}`);
  const sections = await page.evaluate(() => [...document.querySelectorAll('main > *')].map(s => `${s.id || s.className.slice(0, 40)} h=${Math.round(s.getBoundingClientRect().height)}`));
  fs.writeFileSync(`${out}/${label}-${v.name}-sections.txt`, sections.join('\n'));
  await ctx.close();
}
fs.writeFileSync(`${out}/${label}-errors.txt`, errors.join('\n'));
await browser.close();
