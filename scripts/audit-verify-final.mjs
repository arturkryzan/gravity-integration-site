/* Second-instrument verification for the audit re-run.
 *
 * The sweep's probes are DOM-level and have lied before. Nothing below is
 * reported on the strength of the sweep alone:
 *
 *  A. The two CONTRAST findings both carry fg=undefined, which means the
 *     probe could not read a colour at all — the ratio of 1 and 1.21 are
 *     artefacts of that, not measurements. Arbitrate by painting: screenshot
 *     the element, and read the actual darkest and lightest pixels in it.
 *  B. The 11 "no focus ring" findings are re-tested with a real keyboard.
 *     Programmatic .focus() and Tab are not the same thing for
 *     :focus-visible, and a ring drawn with box-shadow, border-color or a
 *     background change is a ring even though `outline` stays "none". So:
 *     Tab to the element, screenshot the same rectangle before and after,
 *     and count changed pixels.
 *  C. The two honeypot target-size findings are checked for whether they are
 *     on the page at all.
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8414';
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });

const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (r, g, b) => 0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
const cr = (a, b) => { const [x, y] = [a, b].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/* Read the real ink and ground out of a crop: the extreme luminances present.
   This is what "is it readable" means when the CSSOM won't say. */
function inkGround(buf) {
  const png = PNG.sync.read(buf);
  let lo = 1, hi = 0, loPx = null, hiPx = null;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < 200) continue;
    const L = lum(png.data[i], png.data[i + 1], png.data[i + 2]);
    if (L < lo) { lo = L; loPx = [png.data[i], png.data[i + 1], png.data[i + 2]]; }
    if (L > hi) { hi = L; hiPx = [png.data[i], png.data[i + 1], png.data[i + 2]]; }
  }
  return { lo, hi, loPx, hiPx, ratio: cr(hi, lo) };
}

function changedPixels(a, b) {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) return { n: -1, total: 0 };
  let n = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1])
            + Math.abs(A.data[i + 2] - B.data[i + 2]);
    if (d > 24) n++;
  }
  return { n, total: (A.data.length / 4) };
}

console.log('A. CONTRAST findings — arbitrated by painted pixels\n');

/* A1: the MENU label. fg=undefined because the probe reads .color off a
   <span> whose ink is set on a child; the real question is whether the
   painted glyphs stand out from what is painted behind them. */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const el = await page.$('button.hamburger span.btn.btn-text');
  const shot = await el.screenshot();
  const m = inkGround(shot);
  console.log(`  span.btn.btn-text "MENU": darkest rgb(${m.loPx}) lightest rgb(${m.hiPx}) → ${m.ratio.toFixed(2)}:1`);
  console.log(`  verdict: ${m.ratio >= 4.5 ? 'FALSE POSITIVE — the label is legible; the probe read no colour at all'
    : 'CONFIRMED — genuinely low contrast'}\n`);
  await page.close();
}

/* A2: the MailerLite honeypot label. Before contrast can matter, the field
   has to be on the page. */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const out = [];
    for (const l of document.querySelectorAll('label')) {
      if (!/leave this field empty/i.test(l.textContent)) continue;
      const r = l.getBoundingClientRect();
      const wrap = l.closest('div');
      const wr = wrap ? wrap.getBoundingClientRect() : null;
      const ctl = wrap ? wrap.querySelector('input') : null;
      out.push({
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        wrapper: wr ? `${Math.round(wr.width)}x${Math.round(wr.height)} @${Math.round(wr.x)},${Math.round(wr.y)}` : null,
        onPage: r.right > 0 && r.bottom > 0 && r.left < innerWidth,
        tabindex: ctl ? ctl.getAttribute('tabindex') : null,
        ariaHidden: ctl ? ctl.getAttribute('aria-hidden') : null,
      });
    }
    return out;
  });
  for (const h of m) {
    console.log(`  honeypot label @x=${h.rect.x} wrapper ${h.wrapper} tabindex=${h.tabindex}`);
    console.log(`  verdict: ${h.onPage ? 'CONFIRMED — actually on the page'
      : 'FALSE POSITIVE — positioned off-screen; no sighted or keyboard user reaches it'}`);
  }
  console.log();
  await page.close();
}

console.log('B. "No focus ring" findings — re-tested with a real keyboard\n');

const FOCUS_CASES = [
  { route: '/', ids: ['demo-your-name', 'demo-your-email', 'demo-your-company', 'demo-your-phone'] },
  { route: '/kalkulator/', ids: ['s-projects', 's-days', 's-team', 's-rate', 's-tool'] },
  { route: '/pobieranie/', ids: ['dl-email', 'dl-company'] },
];

let ringed = 0, bare = 0;
for (const c of FOCUS_CASES) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(ORIGIN + c.route, { waitUntil: 'networkidle' });
  const consent = await page.$('.gi-consent-accept, .gi-consent-btn');
  if (consent) { await consent.click(); await page.waitForTimeout(300); }
  await page.waitForTimeout(300);

  for (const id of c.ids) {
    const sel = `#${id}`;
    const handle = await page.$(sel);
    if (!handle) { console.log(`  ${c.route} ${sel}: NOT PRESENT`); continue; }

    await page.evaluate((s) => document.querySelector(s)
      .scrollIntoView({ block: 'center', behavior: 'instant' }), sel);
    await page.waitForTimeout(200);

    // A rectangle generous enough to contain a ring drawn OUTSIDE the box.
    const box = await page.evaluate((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      const pad = 8;
      return {
        x: Math.max(0, Math.floor(r.x - pad)), y: Math.max(0, Math.floor(r.y - pad)),
        width: Math.ceil(r.width + pad * 2), height: Math.ceil(r.height + pad * 2),
      };
    }, sel);

    const before = await page.screenshot({ clip: box });

    /* Focus with the keyboard, not with .focus(): :focus-visible is the whole
       point of the finding, and the two paths do not always agree. */
    await page.evaluate((s) => {
      const el = document.querySelector(s);
      const prev = document.createElement('button');
      prev.tabIndex = 0; prev.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0';
      el.parentElement.insertBefore(prev, el);
      prev.focus();
      prev.dataset.tmpPrev = '1';
    }, sel);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);

    const isFocused = await page.evaluate((s) => document.activeElement === document.querySelector(s), sel);
    const after = await page.screenshot({ clip: box });
    const diff = changedPixels(before, after);

    const styles = await page.evaluate((s) => {
      const cs = getComputedStyle(document.querySelector(s));
      return { outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor,
               boxShadow: cs.boxShadow, borderColor: cs.borderColor, background: cs.backgroundColor };
    }, sel);

    await page.evaluate(() => document.querySelector('[data-tmp-prev]')?.remove());

    const pct = diff.total ? (diff.n / diff.total * 100) : 0;
    const hasRing = isFocused && diff.n > 0 && pct > 0.4;
    if (hasRing) ringed++; else bare++;
    console.log(`  ${c.route}${sel}  keyboard-focused=${isFocused}  ${diff.n} px changed (${pct.toFixed(1)}%) → ${hasRing ? 'RING PRESENT (false positive)' : 'NO VISIBLE CHANGE (confirmed)'}`);
    console.log(`      outline:${styles.outline} | box-shadow:${styles.boxShadow.slice(0, 60)} | border:${styles.borderColor}`);
  }
  await page.close();
}
console.log(`\n  ${ringed} of ${ringed + bare} reported "no focus ring" cases DO paint a focus indicator under a real Tab.\n`);

await browser.close();
