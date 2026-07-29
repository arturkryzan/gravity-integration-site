/* The definitive focus-indicator test.
 *
 * Three earlier instruments each got part of it wrong, in instructive ways:
 *   - `.focus()` + computed-style diff: :focus-visible has UA heuristics that
 *     programmatic focus doesn't always satisfy.
 *   - Tab + element screenshot: an outline is drawn *outside* the element box,
 *     so an element-clipped screenshot can't see it; and the page's reveal
 *     animations move pixels on their own, which reads as a false "changed".
 *   - CSSOM selector matching: `.gi-range:focus-visible::-webkit-slider-thumb`
 *     and `.demo-consent input:focus-visible + .demo-check` both style
 *     something other than the focused element itself, so a naive
 *     `el.matches(strippedSelector)` calls them bare when they aren't.
 *
 * So: force :focus-visible through CDP (no heuristics to satisfy), freeze all
 * animation and transition first (no moving pixels to confuse the diff), and
 * screenshot a region padded 14px around the element (an outline or a ring on
 * a sibling both land inside that). Identical bytes means nothing is drawn.
 *
 * Run: CHROME=… ORIGIN=http://127.0.0.1:8501 node scripts/audit-focus-final.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8501';
mkdirSync('/tmp/audit-focusF', { recursive: true });

const CASES = [
  ['/', 'button.hamburger'],
  ['/', 'input#demo-consent'],
  ['/', 'a.logo'],
  ['/technologia/', 'input#nemaiil'],
  ['/technologia/', 'input.wpcf7-submit'],
  ['/cennik/', 'button.btn-accordion'],
  ['/pobieranie/', 'input#dl-consent'],
  ['/pobieranie/', 'input#dl-email'],
  ['/kalkulator/', 'input#s-projects'],
  ['/kalkulator/', 'input#s-rate'],
  ['/', 'a.gi-bar-cta-primary'],
  ['/', 'a.gi-lang'],
];

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('DOM.enable');
await cdp.send('CSS.enable');

const FREEZE = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`;

for (const [route, sel] of CASES) {
  await page.goto(ORIGIN + route, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  /* fire the scroll-gated reveals, then nail everything down */
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40));
    }
  });
  await page.addStyleTag({ content: FREEZE });
  await page.waitForTimeout(400);

  const el = await page.$(sel);
  if (!el) { console.log(`  ?           ${route} ${sel} — not present`); continue; }
  /* Not `scrollIntoViewIfNeeded`: a visually-hidden control that a sibling
     draws for it (the consent checkboxes) is "not visible" to Playwright and
     that call waits forever. Scroll by script and read the geometry directly. */
  await page.evaluate((s) => {
    const e = document.querySelector(s);
    (e.offsetParent || e).scrollIntoView({ block: 'center' });
  }, sel);
  await page.waitForTimeout(300);

  /* If the control itself is a 1px hit-target, measure the thing the user
     actually sees: its labelled row. */
  const box = await page.evaluate((s) => {
    const e = document.querySelector(s);
    let r = e.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) {
      const holder = e.closest('label') || e.parentElement;
      if (holder) r = holder.getBoundingClientRect();
    }
    return r.width > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  }, sel);
  if (!box) { console.log(`  ?           ${route} ${sel} — no box`); continue; }
  const PAD = 14;
  const clip = {
    x: Math.max(0, box.x - PAD), y: Math.max(0, box.y - PAD),
    width: Math.min(box.width + PAD * 2, 1440 - Math.max(0, box.x - PAD)),
    height: Math.min(box.height + PAD * 2, 900 - Math.max(0, box.y - PAD)),
  };
  const key = `${route}${sel}`.replace(/\W+/g, '_');
  const before = await page.screenshot({ path: `/tmp/audit-focusF/${key}-off.png`, clip });

  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
  await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['focus', 'focus-visible'] });
  await page.waitForTimeout(300);
  const after = await page.screenshot({ path: `/tmp/audit-focusF/${key}-on.png`, clip });
  await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });

  const drawn = Buffer.compare(before, after) !== 0;
  console.log(`  ${drawn ? 'ok  ' : 'NONE'}  ${route}${sel}   ${drawn ? 'an indicator is drawn' : 'nothing is drawn — no focus indicator'}`);
}

await browser.close();
