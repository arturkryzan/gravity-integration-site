/* The last four cases, settled by the real keyboard rather than CDP.
 *
 * CDP's forced :focus-visible does not always propagate into shadow
 * pseudo-elements like ::-webkit-slider-thumb, which is exactly where the
 * range inputs draw their ring — so forcing the state can report "nothing
 * drawn" on a control that does light up for a real user. And the language
 * switcher lives inside the menu overlay, which has no box until the menu is
 * open. Both need the browser driven the way a person drives it.
 *
 * Same discipline as the CDP pass: freeze animation and the caret first, then
 * diff a region padded around the control, so the only thing that can change
 * the pixels is the focus indicator itself.
 *
 * Run: CHROME=… ORIGIN=http://127.0.0.1:8501 node scripts/audit-focus-kbd.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8501';
mkdirSync('/tmp/audit-focusK', { recursive: true });
const FREEZE = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`;

const CASES = [
  ['/technologia/', 'input#nemaiil', false],
  ['/technologia/', 'input.wpcf7-submit', false],
  ['/kontakt/', 'input#nemaiil', false],
  ['/cennik/', 'button.btn-accordion', false],
  ['/', 'input#demo-consent', false],
];

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

for (const [route, sel, needsMenu] of CASES) {
  await page.goto(ORIGIN + route, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
  if (needsMenu) { await page.click('button.hamburger'); await page.waitForTimeout(900); }
  await page.addStyleTag({ content: FREEZE });
  await page.waitForTimeout(300);

  await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel);
  await page.waitForTimeout(300);
  const box = await page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return r.width > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  }, sel);
  if (!box) { console.log(`  ?     ${route}${sel} — still no box`); continue; }

  const PAD = 16;
  const clip = {
    x: Math.max(0, box.x - PAD), y: Math.max(0, box.y - PAD),
    width: Math.min(box.width + PAD * 2, 1440 - Math.max(0, box.x - PAD)),
    height: Math.min(box.height + PAD * 2, 900 - Math.max(0, box.y - PAD)),
  };
  const key = `${route}${sel}`.replace(/\W+/g, '_');
  const off = await page.screenshot({ path: `/tmp/audit-focusK/${key}-off.png`, clip });

  /* park focus on the element before it in tab order, then press Tab once */
  const parked = await page.evaluate((s) => {
    const t = document.querySelector(s);
    const order = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])')]
      .filter((e) => e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const i = order.indexOf(t);
    if (i > 0) { order[i - 1].focus({ preventScroll: true }); return true; }
    return false;
  }, sel);
  let reached = false;
  for (let i = 0; i < 4 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate((s) => document.activeElement === document.querySelector(s), sel);
  }
  await page.waitForTimeout(300);
  const on = await page.screenshot({ path: `/tmp/audit-focusK/${key}-on.png`, clip });

  const drawn = Buffer.compare(off, on) !== 0;
  console.log(`  ${reached ? (drawn ? 'ok  ' : 'NONE') : 'UNREACHED'}  ${route}${sel}  parked=${parked} focused=${reached}  ${drawn ? 'indicator drawn' : 'nothing drawn'}`);
}

await browser.close();
