/* Fourth pass: the three focus cases the third pass could not settle.
 *
 *   - input#s-projects and input#dl-email reported tabbed=false. A Tab that
 *     lands somewhere else proves nothing about the ring; the previous
 *     "pixels identical" verdict on those two is not evidence. This tabs
 *     repeatedly until the target actually has focus before it looks.
 *   - input#nemaiil reported "pixels changed" while its computed style shows
 *     no outline and no shadow. The likely explanation is the text caret,
 *     which every focused input draws and which is not a focus indicator.
 *     So: shoot the element twice while focused, a caret blink apart. If the
 *     two focused shots differ from each other, the difference that made it
 *     "pass" was the caret, and the ring verdict has to come from the ring
 *     region — the border box — not the whole element.
 *
 * Run: CHROME=… ORIGIN=http://127.0.0.1:8501 node scripts/audit-verify3.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8501';
mkdirSync('/tmp/audit-focus3', { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const CASES = [
  ['/kalkulator/', 'input#s-projects'],
  ['/pobieranie/', 'input#dl-email'],
  ['/pobieranie/', 'input#dl-company'],
  ['/technologia/', 'input#nemaiil'],
  ['/', 'input#demo-your-name'],
  ['/', 'button.hamburger'],
];

for (const [route, sel] of CASES) {
  await page.goto(ORIGIN + route, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  /* let reveal animations settle so nothing moves under the camera */
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 50));
    }
  });
  const el = await page.$(sel);
  if (!el) { console.log(`  ?    ${route}${sel} — not present`); continue; }
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  const key = `${route}${sel}`.replace(/\W+/g, '_');
  const blur = await el.screenshot({ path: `/tmp/audit-focus3/${key}-blur.png` });

  /* Tab until the target actually has focus. Cap it: if 60 presses don't get
     there, the element is not reachable from the keyboard at all, which is a
     bigger finding than a missing ring. */
  await page.evaluate(() => { document.body.setAttribute('tabindex','-1'); document.body.focus(); window.scrollTo(0,0); });
  let hops = 0, reached = false;
  for (; hops < 60; hops++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate((s) => document.activeElement === document.querySelector(s), sel);
    if (reached) break;
  }
  await page.waitForTimeout(250);
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);

  const f1 = await el.screenshot({ path: `/tmp/audit-focus3/${key}-focus1.png` });
  /* a caret blinks on roughly a 1s cycle; 600ms guarantees a different phase */
  await page.waitForTimeout(600);
  const f2 = await el.screenshot({ path: `/tmp/audit-focus3/${key}-focus2.png` });

  const changed = Buffer.compare(blur, f1) !== 0 || Buffer.compare(blur, f2) !== 0;
  const caretOnly = Buffer.compare(f1, f2) !== 0;
  const style = await el.evaluate((e) => {
    const cs = getComputedStyle(e);
    return { outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, shadow: cs.boxShadow, border: `${cs.borderWidth} ${cs.borderColor}`, bg: cs.backgroundColor };
  });
  console.log(
    `  ${reached ? (changed ? 'ok  ' : 'NONE') : 'UNREACHABLE'} ${route}${sel}  reached=${reached} after ${hops + 1} tabs  ` +
    `pixels ${changed ? 'changed' : 'identical'}${caretOnly ? '  (two focused frames differ — caret is animating)' : ''}\n` +
    `        outline:${style.outline} · shadow:${style.shadow} · border:${style.border}`,
  );
}

await browser.close();
