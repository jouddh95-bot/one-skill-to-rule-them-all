// Step through one section of the storefront, one screenshot per ~0.85 viewport.
// usage: node scan.mjs <outDir> <themeId> <label> <selector> [maxShots]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out, themeId, label, sel, max = '40'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const url = `https://chargix.store/?preview_theme_id=${themeId}&pb=0`;
const views = [
  { name: 'desk', viewport: { width: 1440, height: 900 }, dpr: 1 },
  { name: 'mob', viewport: { width: 390, height: 844 }, dpr: 2, mobile: true },
];
const errors = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const v of views) {
  const ctx = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: !!v.mobile, hasTouch: !!v.mobile });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`[${v.name}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${v.name}] console: ${m.text()}`); });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3000);
  const box = await page.evaluate(sel => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { top: b.top + scrollY, h: b.height }; }, sel);
  if (!box) { errors.push(`no ${sel}`); continue; }
  const step = Math.round(v.viewport.height * 0.85);
  let k = 0;
  for (let y = box.top; y < box.top + box.h && k < +max; y += step, k++) {
    await page.evaluate(y => window.scrollTo(0, y), y);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${out}/${label}-${v.name}-${String(k).padStart(2, '0')}.jpg`, quality: 80, type: 'jpeg', timeout: 60000 }).catch(e => errors.push(`[${v.name}] shot ${k}: ${e.message.split('\n')[0]}`));
  }
  await ctx.close();
}
fs.writeFileSync(`${out}/${label}-errors.txt`, errors.join('\n'));
await browser.close();
