/* What size is each image ACTUALLY painted at, across every route and breakpoint?
 *
 * The audit reported natural-vs-displayed for one viewport. That is not enough
 * to resample from: an image drawn 305px wide at 1440 may be drawn 720px wide
 * at 390 (a hero that goes full-bleed on mobile), and resampling to the desktop
 * number would ship a blurry phone. So this walks all 18 routes at four widths
 * and keeps the MAXIMUM CSS width each file is ever painted at, which is the
 * only safe number to size against.
 *
 * `getBoundingClientRect().width` is the painted width including any CSS
 * scaling, which is what matters — `offsetWidth` rounds and `clientWidth`
 * excludes borders. Elements with zero box (display:none at this breakpoint,
 * or never revealed) are skipped rather than recorded as 0, or a menu-only
 * image would resample to nothing.
 *
 * Everything is scrolled to the bottom first so lazy images attach and
 * reveal-animated sections have laid out. Images still at zero after that are
 * reported separately — they are either genuinely hidden or a bug worth seeing.
 *
 * Run: CHROME=… ORIGIN=http://127.0.0.1:8600 node scripts/measure-image-sizes.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8600';
const OUT = process.argv[2] || '/tmp/image-sizes.json';

const ROUTES = [
  '/', '/case-studies/', '/cennik/', '/czym-jest-esb/', '/integracje/',
  '/kalkulator/', '/kontakt/', '/pobieranie/', '/polityka-prywatnosci/',
  '/technologia/',
  '/en/', '/en/case-studies/', '/en/contact/', '/en/download/',
  '/en/integrations/', '/en/pricing/', '/en/technology/', '/en/what-is-esb/',
];
// 1440 desktop, 1024 tablet landscape, 768 tablet, 390 phone — the four the
// existing responsive harnesses already use, so the numbers are comparable
const WIDTHS = [1440, 1024, 768, 390];

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const seen = new Map(); // path -> {maxCss, natural, routes:Set, hidden}

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    await page.goto(ORIGIN + route, { waitUntil: 'load' });
    // scroll the whole page so lazy images attach and reveals fire
    await page.evaluate(async () => {
      const step = innerHeight * 0.8;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
      scrollTo(0, 0);
    });
    await page.waitForTimeout(300);
    const imgs = await page.evaluate(() =>
      [...document.querySelectorAll('img')].map((el) => {
        const r = el.getBoundingClientRect();
        return {
          src: new URL(el.currentSrc || el.src, location.href).pathname,
          css: Math.round(r.width),
          nw: el.naturalWidth,
          nh: el.naturalHeight,
        };
      })
    );
    for (const i of imgs) {
      if (!i.src) continue;
      const rec = seen.get(i.src) || { path: i.src, maxCss: 0, nw: i.nw, nh: i.nh, routes: new Set() };
      rec.routes.add(route);
      if (i.nw) { rec.nw = i.nw; rec.nh = i.nh; }
      if (i.css > rec.maxCss) rec.maxCss = i.css;
      seen.set(i.src, rec);
    }
  }
  await ctx.close();
  console.log(`  ${width}px swept`);
}
await browser.close();

const rows = [...seen.values()]
  .map((r) => ({
    path: r.path,
    maxCss: r.maxCss,
    nw: r.nw,
    nh: r.nh,
    // the resample target: 2x the largest painted width, but never upscale
    target: r.maxCss ? Math.min(r.nw, r.maxCss * 2) : r.nw,
    over: r.maxCss ? +(r.nw / (r.maxCss * 2)).toFixed(2) : null,
    routes: [...r.routes],
  }))
  .sort((a, b) => (b.over || 0) - (a.over || 0));

console.log(`\n  path                                              natural    maxCSS  target  over`);
for (const r of rows) {
  const flag = r.over === null ? 'HIDDEN' : r.over > 1.3 ? '  <<<' : '';
  console.log(
    `  ${r.path.slice(-48).padEnd(48)} ${String(r.nw + 'x' + r.nh).padStart(10)} ` +
      `${String(r.maxCss).padStart(6)} ${String(r.target).padStart(7)} ` +
      `${r.over === null ? '   n/a' : r.over.toFixed(2).padStart(6)}${flag}`
  );
}
const wasteful = rows.filter((r) => r.over && r.over > 1.3);
writeFileSync(OUT, JSON.stringify(rows, null, 2));
console.log(`\n  ${wasteful.length} of ${rows.length} images ship more than 1.3x the pixels a 2x screen paints`);
console.log(`  written to ${OUT}`);
