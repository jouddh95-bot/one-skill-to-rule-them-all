// Screenshot the living-miniature film section of a preview theme on desktop and phone.
// usage: node capture-dio.mjs <outDir> <themeId> <label>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out, themeId, label = 'dio'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const url = `https://chargix.store/?preview_theme_id=${themeId}&pb=0`;
const views = [
  { name: 'desk', viewport: { width: 1440, height: 900 }, dpr: 1 },
  { name: 'mob', viewport: { width: 390, height: 844 }, dpr: 2, mobile: true },
];
const points = [0.02, 0.15, 0.27, 0.45, 0.6, 0.72, 0.85, 0.97];
const log = [];
const browser = await chromium.launch();
for (const v of views) {
  const ctx = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: !!v.mobile, hasTouch: !!v.mobile });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') log.push(`[${v.name}] console: ${m.text()}`); });
  page.on('pageerror', e => log.push(`[${v.name}] pageerror: ${e.message}`));
  page.on('response', r => { if (r.status() >= 400) log.push(`[${v.name}] http ${r.status()}: ${r.url()}`); });
  let frames = 0; page.on('response', r => { if (/dio-(cookie|clothing)-\d+\.webp/.test(r.url()) && r.status() < 400) frames++; });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.evaluate(() => document.querySelector('[data-dio]')?.scrollIntoView());
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${label}-${v.name}-head.jpg`, quality: 85, type: 'jpeg' });
  const live = await page.evaluate(() => document.querySelector('[data-dio]')?.className);
  log.push(`[${v.name}] section class: ${live}`);
  for (const story of ['cookie', 'clothing']) {
    await page.evaluate(k => document.querySelector(`[data-dio-story="${k}"]`)?.click(), story);
    await page.waitForTimeout(6000);
    log.push(`[${v.name}] ${story}: frame responses so far ${frames} (${Math.round((Date.now() - t0) / 1000)}s)`);
    for (const p of points) {
      await page.evaluate(p => { const t = document.querySelector('[data-dio-track]'); const top = t.getBoundingClientRect().top + scrollY; scrollTo(0, Math.round(top + (t.offsetHeight - innerHeight) * p)); }, p);
      await page.waitForTimeout(1800);
      const cap = await page.evaluate(() => [...document.querySelectorAll('[data-dio-cap].is-on .dio__ch')].map(e => e.textContent.trim()).join(' | '));
      log.push(`[${v.name}] ${story} ${p}: caption "${cap}"`);
      await page.screenshot({ path: `${out}/${label}-${v.name}-${story}-${String(Math.round(p * 100)).padStart(3, '0')}.jpg`, quality: 85, type: 'jpeg' });
    }
    await page.evaluate(() => document.querySelector('[data-dio]')?.scrollIntoView());
  }
  const order = await page.evaluate(() => [...document.querySelectorAll('main > *')].map(s => `${s.id || s.className.slice(0, 40)} h=${Math.round(s.getBoundingClientRect().height)}`));
  log.push(`[${v.name}] sections:\n  ${order.join('\n  ')}`);
  await ctx.close();
}
fs.writeFileSync(`${out}/${label}-log.txt`, log.join('\n'));
await browser.close();
