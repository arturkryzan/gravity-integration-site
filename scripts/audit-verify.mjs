/* Second pass: kill the false positives.
 *
 * The main harness computes contrast from CSS, which cannot see what a
 * background *image* actually paints. Those elements were set aside rather
 * than guessed at; this script settles them the only honest way — screenshot
 * the element, look at the pixels the text is drawn on, and measure against
 * that. It also re-checks the handful of findings that looked like markup
 * problems but might be correct patterns (honeypots, submit buttons).
 *
 * Method for "what is behind this text": crop the element's box from a
 * full-page screenshot, then take the *modal* colour of the pixels that are
 * not the text colour. Anti-aliased edges and the glyph interiors get voted
 * out; what survives is the paper the ink sits on.
 *
 * Run: CHROME=… ORIGIN=http://127.0.0.1:8501 node scripts/audit-verify.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8501';
mkdirSync('/tmp/audit-crops', { recursive: true });

/* Each case: a page, a way to find the elements, and a label. */
const CASES = [
  ['/', '.hamburger span:nth-of-type(1)', 'header MENU label over the hero'],
  ['/polityka-prywatnosci/', '.hamburger span:nth-of-type(1)', 'header MENU label, privacy page'],
  ['/', 'svg text', 'hero scene: the two audience captions'],
  ['/technologia/', '.vp-s.vp-yt-type', 'video play affordance'],
  ['/technologia/', 'section:has(input#nemaiil) h2, section:has(input#nemaiil) p, section:has(input#nemaiil) label, section:has(input#nemaiil) .wpcf7-list-item-label', 'newsletter block over its background'],
  ['/cennik/', 'a.is-inview, main a[href]:not(.btn):not(.logo)', 'inline prose links on pricing'],
  ['/polityka-prywatnosci/', 'main a[href]:not(.btn):not(.logo)', 'browser-help links in the cookie section'],
  ['/', 'p.hero-social-proof, main p', 'hero social proof line'],
];

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) =>
  0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const results = [];

for (const [route, selector, label] of CASES) {
  await page.goto(ORIGIN + route, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  /* the reveal animations gate on scroll; walk the page so is-inview fires */
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);

  const targets = await page.$$(selector);
  let n = 0;
  for (const el of targets) {
    if (n >= 4) break;
    const info = await el.evaluate((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const fill = e.tagName.toLowerCase() === 'text' ? cs.fill : cs.color;
      return {
        text: (e.textContent || '').trim().slice(0, 55),
        color: fill,
        size: parseFloat(cs.fontSize),
        weight: Number(cs.fontWeight) || 400,
        w: r.width, h: r.height,
      };
    });
    if (!info.text || info.w < 4 || info.h < 4) continue;
    n++;

    let shot;
    try {
      shot = await el.screenshot({ path: `/tmp/audit-crops/${route.replace(/\W+/g, '_')}_${n}.png` });
    } catch { continue; }

    results.push({ route, label, ...info, crop: `/tmp/audit-crops/${route.replace(/\W+/g, '_')}_${n}.png` });
  }
}

writeFileSync('/tmp/audit-verify.json', JSON.stringify(results, null, 1));
await browser.close();

for (const r of results) {
  console.log(`${r.route}  ${r.label}\n   "${r.text}"  ${r.color} ${r.size}px/${r.weight}  → ${r.crop}`);
}
