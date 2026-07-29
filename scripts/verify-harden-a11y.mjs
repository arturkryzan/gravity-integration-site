/* Harden verification: does each control actually paint a focus indicator when
 * a real keyboard reaches it?
 *
 * Four instruments were tried during the audit and each has a blind spot:
 *   1. .focus() + computed-style diff — :focus-visible has UA heuristics that
 *      programmatic focus does not satisfy, so it under-reports.
 *   2. Tab + element-clipped screenshot — an outline drawn OUTSIDE the element
 *      box gets cropped away, so it under-reports too.
 *   3. CSSOM selector matching — `.gi-range:focus-visible::-webkit-slider-thumb`
 *      styles something other than the focused element, so it mis-attributes.
 *   4. CDP CSS.forcePseudoState — does not propagate into shadow pseudo-elements
 *      like ::-webkit-slider-thumb, so it reports "nothing drawn" on controls
 *      that do light up.
 *
 * What survives all four: real keyboard focus, animation/transition/caret
 * frozen first, and a screenshot region padded well past the element box so an
 * outline-offset ring is inside the crop.
 *
 * This harness only WRITES the off/on pairs. The verdict is measured in
 * Python (PIL) by scripts/measure-focus-pairs.py, because a Buffer.compare
 * byte-diff previously returned a false "ok" on /kontakt/ input#nemaiil — the
 * pill border was pixel-identical and only a label above it had reflowed 1px.
 * A count and a bounding box tell those two cases apart; a byte-compare cannot.
 *
 * Run: CHROME=… ORIGIN=http://127.0.0.1:8555 node scripts/verify-harden-a11y.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8555';
const OUT = '/tmp/harden-focus';
mkdirSync(OUT, { recursive: true });
const FREEZE = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`;

/* [route, selector, mode]
 * mode 'clip'  — pad a box around the control and diff that region.
 * mode 'full'  — the control is off-screen until focused (the skip link moves
 *                from top:-100% to top:1rem), so there is no useful box to pad.
 */
const CASES = [
  // the two rings this harden pass added
  ['/', 'button.hamburger', 'clip'], // P1-3
  ['/en/', 'button.hamburger', 'clip'], // P1-3, other locale
  ['/technologia/', 'input#nemaiil', 'clip'], // P1-7
  ['/kontakt/', 'input#nemaiil', 'clip'], // P1-7, the case byte-compare got wrong
  ['/', 'a.skip-link', 'full'], // P2-8
  ['/en/', 'a.skip-link', 'full'], // P2-8, other locale
  // controls that already passed — regression guard, these must stay drawn
  ['/technologia/', 'input.wpcf7-submit', 'clip'],
  ['/cennik/', 'button.btn-accordion', 'clip'],
  ['/', 'input#demo-consent', 'clip'],
];

const PAD = 16;
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const manifest = [];

for (const [route, sel, mode] of CASES) {
  const key = `${route}${sel}`.replace(/\W+/g, '_');
  const rec = { route, sel, mode, key, reached: false, parked: false, note: '' };

  await page.goto(ORIGIN + route, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  /* scroll the whole page once so every reveal animation has already fired —
     otherwise a section un-hiding mid-capture reads as a false "indicator" */
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
  await page.addStyleTag({ content: FREEZE });
  await page.waitForTimeout(300);

  const exists = await page.evaluate((s) => !!document.querySelector(s), sel);
  if (!exists) {
    rec.note = 'selector not present on route';
    manifest.push(rec);
    console.log(`  MISSING     ${route}${sel}`);
    continue;
  }

  let clip = null;
  if (mode === 'clip') {
    await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel);
    await page.waitForTimeout(300);
    const box = await page.evaluate((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
    }, sel);
    if (!box) {
      rec.note = 'no layout box';
      manifest.push(rec);
      console.log(`  NOBOX       ${route}${sel}`);
      continue;
    }
    const x = Math.max(0, box.x - PAD);
    const y = Math.max(0, box.y - PAD);
    clip = {
      x,
      y,
      width: Math.min(box.width + PAD * 2, 1440 - x),
      height: Math.min(box.height + PAD * 2, 900 - y),
    };
    rec.box = box;
  }

  const shot = (suffix) =>
    page.screenshot(clip ? { path: `${OUT}/${key}-${suffix}.png`, clip } : { path: `${OUT}/${key}-${suffix}.png` });

  await shot('off');

  /* park focus on the element immediately before the target in tab order, then
     press Tab — real keypresses, so :focus-visible's UA heuristics are satisfied */
  rec.parked = await page.evaluate((s) => {
    const t = document.querySelector(s);
    const order = [
      ...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])'),
    ].filter((e) => e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const i = order.indexOf(t);
    if (i > 0) {
      order[i - 1].focus({ preventScroll: true });
      return true;
    }
    if (i === 0) {
      document.body.focus?.();
      return 'first';
    }
    return false;
  }, sel);

  for (let i = 0; i < 4 && !rec.reached; i++) {
    await page.keyboard.press('Tab');
    rec.reached = await page.evaluate((s) => document.activeElement === document.querySelector(s), sel);
  }
  await page.waitForTimeout(300);
  await shot('on');
  manifest.push(rec);

  console.log(`  ${rec.reached ? 'FOCUSED' : 'UNREACHED'}   ${route}${sel}  parked=${rec.parked}`);
}

writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
await browser.close();
console.log(`\npairs written to ${OUT} — measure with scripts/measure-focus-pairs.py`);
