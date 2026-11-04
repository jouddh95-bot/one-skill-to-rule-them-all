// Verify the CHARGIX v10 preview theme on the real storefront (desktop + phone):
// landing loop moves without scrolling, both stories play forwards and backwards with the scroll,
// every frame loads, sections render, and the package Buy button reaches checkout (nothing is paid).
// usage: node verify10.mjs <outDir> <themeId>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out, themeId] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const base = process.env.BASE || `https://chargix.store/?preview_theme_id=${themeId}&pb=0`;
const views = [
  { name: 'desk', viewport: { width: 1440, height: 900 }, dpr: 1 },
  { name: 'mob', viewport: { width: 390, height: 844 }, dpr: 2, mobile: true },
];
const report = { themeId, views: {} };
const errors = [];
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.jpg`, quality: 78, type: 'jpeg', timeout: 60000 }).catch(e => errors.push(`shot ${name}: ${e.message.split('\n')[0]}`));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
for (const v of views) {
  const r = (report.views[v.name] = { stories: {}, sections: {} });
  const ctx = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: !!v.mobile, hasTouch: !!v.mobile });
  const page = await ctx.newPage();
  let bytes = 0;
  page.on('response', async (res) => { const l = +(res.headers()['content-length'] || 0); bytes += l; });
  page.on('pageerror', (e) => errors.push(`[${v.name}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${v.name}] console: ${m.text()}`); });
  const t0 = Date.now();
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 90000 });
  r.domContentLoadedMs = Date.now() - t0;
  await page.waitForLoadState('load', { timeout: 90000 }).catch(() => {});
  r.loadMs = Date.now() - t0;
  await page.waitForTimeout(2500);
  // 1. Landing moves without scrolling: compare two screenshots 1.2 s apart.
  const a = await page.screenshot({ type: 'png' });
  await shot(page, `${v.name}-00-landing`);
  await page.waitForTimeout(1200);
  const b = await page.screenshot({ type: 'png' });
  r.landingChangesWithoutScroll = !a.equals(b);
  r.heroVideo = await page.evaluate(() => { const vd = document.querySelector('[data-hero-video]'); return vd ? { paused: vd.paused, time: vd.currentTime, src: vd.currentSrc.split('/').pop().split('?')[0] } : null; });
  r.bytesAtLanding = bytes;
  // 2. Stories: step through frames, then go back.
  for (const id of ['work', 'nova']) {
    const g = await page.evaluate((id) => { const s = document.getElementById(id); if (!s) return null; const c = JSON.parse(s.querySelector('[data-story-config]').textContent); return { top: s.offsetTop, len: s.offsetHeight - innerHeight, n: c.n, a: +c.heroEnd, b: c.filmEnd }; }, id);
    if (!g) { errors.push(`[${v.name}] no #${id}`); continue; }
    const st = (r.stories[id] = { n: g.n, steps: [] });
    const at = (f) => Math.round(g.top + (g.a + (f / (g.n - 1)) * (g.b - g.a)) * g.len);
    const marks = id === 'work' ? [10, 48, 100, 140, 185, 220, 250, 262] : [14, 44, 75, 105, 150, 200, 230, 236];
    for (const f of [...marks, marks[2]]) {
      await page.evaluate((y) => window.scrollTo(0, y), at(f));
      await page.waitForTimeout(1500);
      const s = await page.evaluate((id) => { const x = (window.__cxStory || {})[id]; const caps = [...document.querySelectorAll(`#${id} [data-cap]`)].filter((c) => +getComputedStyle(c).opacity > 0.5).map((c) => c.textContent.trim().slice(0, 60)); const time = document.querySelector(`#${id} [data-time]`)?.textContent; const day = document.querySelector(`#${id} [data-day]`)?.textContent; return x ? { frame: Math.round(x.frame()), loaded: x.loaded(), caps, time, day } : null; }, id);
      st.steps.push({ target: f, ...s });
      await shot(page, `${v.name}-${id}-${String(f).padStart(3, '0')}${st.steps.length > marks.length ? '-back' : ''}`);
    }
    const fr = st.steps.map((s) => s.frame);
    st.forward = fr.slice(0, marks.length).every((x, i, arr) => i === 0 || x >= arr[i - 1]);
    st.reverses = fr[fr.length - 1] < fr[fr.length - 2];
  }
  // 3. Sections below the stories.
  for (const sel of ['#packages', '#studio', '#process', '#care', '#faq', 'section.close']) {
    const ok = await page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return false; el.scrollIntoView({ block: 'start' }); return true; }, sel);
    r.sections[sel] = ok;
    if (ok) { await page.waitForTimeout(1200); await shot(page, `${v.name}-z-${sel.replace(/[^a-z]+/g, '')}`); }
  }
  r.overflowX = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  r.bytesTotal = bytes;
  // 4. Packages: prices from live products, Buy reaches checkout.
  r.packages = await page.evaluate(() => [...document.querySelectorAll('.pk__form')].map((f) => { const card = f.closest('[class*="pk"]') || f.parentElement; return { action: f.getAttribute('action'), price: (card.textContent.match(/\$[\d,]+/) || [''])[0], disabled: !!f.querySelector('[type=submit]')?.disabled }; }));
  if (v.name === 'desk') {
    await page.evaluate(() => document.querySelector('#packages')?.scrollIntoView());
    await page.waitForTimeout(800);
    const btn = page.locator('.pk__form [type=submit]').first();
    await Promise.all([page.waitForURL(/checkout|checkouts|\/cart/, { timeout: 45000 }).catch((e) => errors.push('checkout nav: ' + e.message.split('\n')[0])), btn.click()]);
    await page.waitForTimeout(4000);
    r.afterBuyUrl = page.url().replace(/\?.*/, '');
    r.afterBuyTitle = await page.title();
    await shot(page, `${v.name}-checkout`);
  }
  await ctx.close();
}
await browser.close();
report.errors = errors;
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
