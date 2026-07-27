/* Did the Polish site move — visually?
 *
 * regress-pl.mjs answers "did the markup change" and /tmp/textcmp answers "did
 * the words change". Neither answers the question that actually matters to a
 * visitor: does the page still LOOK the same. That gap is not theoretical.
 * Phases 3–4 moved a lot of copy into ui.ts, and strings rendered through
 * `set:html` come out WITHOUT the data-astro-cid scoping attribute — so a
 * scoped rule that used to match can silently stop matching. Nothing in an
 * HTML diff flags that; the markup is arguably "more correct" while the page
 * renders wrong. Only pixels catch it.
 *
 * Two servers, same page, full-height screenshot, pixel compare:
 *   8413 → dist-baseline  (last build before any English work)
 *   8412 → dist           (now)
 *
 * Run: CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/regress-pixels.mjs
 *
 * Result when this was written (EN phase 6):
 *   HIDE=layout → 19/22 identical; the three misses were home at both widths
 *   and case-studies@desktop at 102 px (0.0006%).
 *   Control run (BASELINE_ORIGIN=8412, the build against ITSELF) → home still
 *   differs from itself at both widths, case-studies comes out clean.
 *   So: the home hero has floating spheres and a scroll-progress zoom that
 *   never land on the same frame twice, and case-studies is decode jitter
 *   inside an embedded screenshot (clean in 2 of 3 runs). Nothing on the
 *   Polish site moved. Expect home to stay noisy here — it is not a
 *   regression, and chasing it to zero would mean disabling the animation
 *   this harness exists to leave alone.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

/* Point BASELINE_ORIGIN at 8412 to diff the current build against itself: the
   control run that separates "this regressed" from "this page never renders
   the same twice". */
const BASE = process.env.BASELINE_ORIGIN || 'http://127.0.0.1:8413';
const NOW = 'http://127.0.0.1:8412';
const OUT = 'regress-shots';
mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['home', '/'],
  ['czym-jest-esb', '/czym-jest-esb/'],
  ['technologia', '/technologia/'],
  ['cennik', '/cennik/'],
  ['kalkulator', '/kalkulator/'],
  ['integracje', '/integracje/'],
  ['case-studies', '/case-studies/'],
  ['kontakt', '/kontakt/'],
  ['pobieranie', '/pobieranie/'],
  ['polityka', '/polityka-prywatnosci/'],
  ['404', '/404.html'],
];
const WIDTHS = [['mobile', 390, 844], ['desktop', 1440, 900]];

/* The footer language switcher is *supposed* to be new, and it is the only
   intended visual change on the Polish site. Hiding it keeps it from painting
   every footer red and burying anything real underneath. */
const HIDE_SWITCHER = process.env.HIDE === 'layout'
  ? '.gi-lang{display:none !important}'   /* remove from flow: proves the rest of the page is unmoved */
  : '.gi-lang{visibility:hidden !important}'; /* keep the box: shows what the switcher costs */

/* Reveal-on-scroll and the cookie bar both animate, so a screenshot taken mid
   transition differs from itself run to run. Freeze everything, then walk the
   page so lazy images and reveals have fired. */
const FREEZE = `*,*::before,*::after{animation:none !important;transition:none !important;
  animation-duration:0s !important;transition-duration:0s !important}
  html{scroll-behavior:auto !important}`;

async function shoot(ctx, origin, path, file) {
  const page = await ctx.newPage();
  await page.addStyleTag({ content: FREEZE + HIDE_SWITCHER }).catch(() => {});
  await page.goto(origin + path, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: FREEZE + HIDE_SWITCHER });
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
}

const browser = await chromium.launch({ executablePath: process.env.CHROME });
let moved = 0;
const rows = [];

for (const [wname, w, h] of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  for (const [slug, path] of PAGES) {
    const a = `${OUT}/base-${slug}-${wname}.png`;
    const b = `${OUT}/now-${slug}-${wname}.png`;
    await shoot(ctx, BASE, path, a);
    await shoot(ctx, NOW, path, b);

    const A = PNG.sync.read(readFileSync(a));
    const B = PNG.sync.read(readFileSync(b));
    if (A.width !== B.width || A.height !== B.height) {
      moved++;
      rows.push(`SIZE   ${slug} @ ${wname}: ${A.width}×${A.height} → ${B.width}×${B.height}`);
      continue;
    }
    const diff = new PNG({ width: A.width, height: A.height });
    /* threshold 0.1 is the library default: tolerant of antialiasing, not of a
       moved element or a dropped style. */
    const n = pixelmatch(A.data, B.data, diff.data, A.width, A.height, { threshold: 0.1 });
    const pct = (n / (A.width * A.height)) * 100;
    if (n > 0) {
      moved++;
      writeFileSync(`${OUT}/diff-${slug}-${wname}.png`, PNG.sync.write(diff));
      rows.push(`DIFF   ${slug} @ ${wname}: ${n} px (${pct.toFixed(4)}%) → diff-${slug}-${wname}.png`);
    } else {
      rows.push(`same   ${slug} @ ${wname}  (${A.width}×${A.height})`);
    }
  }
  await ctx.close();
}
await browser.close();

rows.forEach((r) => console.log(r));
console.log(`\n=== ${rows.length - moved} of ${rows.length} Polish page×width renders pixel-identical to the pre-English build ===`);
