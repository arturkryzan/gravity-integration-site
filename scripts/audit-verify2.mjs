/* Third pass: the two findings that needed a different instrument.
 *
 *   A. The hero scene's SVG captions. They measured 2.22:1 as CSS, but SVG
 *      <text> inside a transformed group doesn't screenshot cleanly by
 *      element, so this crops the region from a page screenshot instead and
 *      reads the pixels. It also asks the question the ratio can't: are these
 *      words content, or are they part of the drawing?
 *
 *   B. Focus rings. The first pass called `.focus()` and diffed computed
 *      style, which is only a proxy — `:focus-visible` has heuristics and
 *      programmatic focus doesn't always satisfy them. This drives the real
 *      keyboard: press Tab, screenshot the focused element, and compare the
 *      pixels against the same element unfocused. If nothing changed on
 *      screen, there is no focus indicator, whatever the CSS says.
 *
 * Run: CHROME=… ORIGIN=http://127.0.0.1:8501 node scripts/audit-verify2.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8501';
mkdirSync('/tmp/audit-focus', { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

/* ------------------------------------------------------------------ A ---- */
await page.goto(ORIGIN + '/', { waitUntil: 'load' });
await page.waitForTimeout(900);

const svgText = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('svg text').forEach((t) => {
    const r = t.getBoundingClientRect();
    const cs = getComputedStyle(t);
    const svg = t.closest('svg');
    out.push({
      text: t.textContent.trim().slice(0, 40),
      fill: cs.fill, size: cs.fontSize,
      box: { x: r.x, y: r.y, w: r.width, h: r.height },
      inView: r.width > 0 && r.height > 0,
      ariaHidden: svg?.getAttribute('aria-hidden'),
      svgRole: svg?.getAttribute('role'),
      /* is this text repeated as real DOM text anywhere else on the page? */
      duplicated: [...document.querySelectorAll('h1,h2,h3,h4,p,li,span')]
        .some((e) => e.textContent.trim() === t.textContent.trim()),
    });
  });
  return out;
});
console.log('=== SVG <text> in the hero scene ===');
for (const t of svgText) {
  console.log(`  "${t.text}"  fill=${t.fill} ${t.size}  box=${Math.round(t.box.x)},${Math.round(t.box.y)} ${Math.round(t.box.w)}×${Math.round(t.box.h)}  aria-hidden=${t.ariaHidden}  role=${t.svgRole}  duplicatedInDom=${t.duplicated}`);
}
/* The captions live well below the fold, so scroll to them before cropping —
   `clip` is viewport-relative and a full-page shot of this page is 8000px tall. */
const first = svgText.find((t) => t.inView);
if (first) {
  await page.evaluate((y) => window.scrollTo(0, y - 200), first.box.y);
  await page.waitForTimeout(500);
  const box = await page.evaluate(() => {
    const t = document.querySelector('svg text');
    const r = t.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await page.screenshot({
    path: '/tmp/audit-crops/hero-svg-text.png',
    clip: {
      x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 20),
      width: Math.min(box.w + 40, 1400), height: Math.min(box.h + 40, 880),
    },
  });
  console.log('  crop → /tmp/audit-crops/hero-svg-text.png');
}

/* ------------------------------------------------------------------ B ---- */
console.log('\n=== focus indicator, driven from the keyboard ===');

const PAGES = [
  ['/', ['button.hamburger']],
  ['/kalkulator/', ['input#s-projects']],
  ['/pobieranie/', ['input#dl-email', 'input#dl-company']],
  ['/technologia/', ['input#nemaiil']],
  ['/', ['input#demo-your-name', 'input#demo-your-email']],
];

for (const [route, sels] of PAGES) {
  await page.goto(ORIGIN + route, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  for (const sel of sels) {
    const el = await page.$(sel);
    if (!el) { console.log(`  ?   ${route} ${sel} — not present`); continue; }
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    const key = `${route}${sel}`.replace(/\W+/g, '_');
    const before = await el.screenshot({ path: `/tmp/audit-focus/${key}-blur.png` });

    /* real keyboard focus: tab onto it from the element before it */
    await page.evaluate((s) => {
      const target = document.querySelector(s);
      const order = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])')];
      const i = order.indexOf(target);
      if (i > 0) order[i - 1].focus({ preventScroll: true });
      else document.body.focus();
    }, sel);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);

    const focused = await page.evaluate((s) => document.activeElement === document.querySelector(s), sel);
    const after = await el.screenshot({ path: `/tmp/audit-focus/${key}-focus.png` });
    const same = Buffer.compare(before, after) === 0;
    const style = await el.evaluate((e) => {
      const cs = getComputedStyle(e);
      return `outline:${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} · shadow:${cs.boxShadow} · border:${cs.borderColor}`;
    });
    console.log(`  ${same ? 'NONE' : 'ok  '} ${route}${sel}  tabbed=${focused}  pixels ${same ? 'identical' : 'changed'}\n        ${style}`);
  }
}

await browser.close();
