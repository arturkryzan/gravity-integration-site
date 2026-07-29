/* The 11 "no focus ring" findings are false positives: a ring IS painted under
 * a real Tab. But "a ring exists" and "the ring is discernible" are different
 * claims and the audit must not merge them. Two criteria apply, and my first
 * pass cited the wrong one:
 *
 *   SC 1.4.11 Non-text Contrast (AA)  — the indicator must reach 3:1 against
 *       what is ADJACENT to it.
 *   SC 2.4.13 Focus Appearance (AAA)  — the focused and unfocused states of
 *       the indicator area must differ by 3:1.
 *
 *   (SC 2.4.11 is Focus Not Obscured. Not this. My earlier run said 2.4.11;
 *    that label was wrong and the numbers under it are superseded here.)
 *
 * So measure both, and never from a single max-delta pixel: that pixel is
 * wherever the delta happens to be largest, which may be a border repaint
 * rather than the ring. Classify instead.
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8414';
const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (r, g, b) => 0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
const cr = (a, b) => { const [x, y] = [a, b].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const CASES = [
  { route: '/', ids: ['demo-your-name', 'demo-your-email', 'demo-your-company', 'demo-your-phone'] },
  { route: '/kalkulator/', ids: ['s-projects', 's-days', 's-team', 's-rate', 's-tool'] },
  { route: '/pobieranie/', ids: ['dl-email', 'dl-company'] },
];

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
const rows = [];
for (const c of CASES) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(ORIGIN + c.route, { waitUntil: 'networkidle' });
  const consent = await page.$('.gi-consent-accept, .gi-consent-btn');
  if (consent) { await consent.click(); await page.waitForTimeout(300); }

  for (const id of c.ids) {
    const sel = `#${id}`;
    await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center', behavior: 'instant' }), sel);
    await page.waitForTimeout(200);
    const box = await page.evaluate((s) => {
      const r = document.querySelector(s).getBoundingClientRect(); const pad = 10;
      return { x: Math.max(0, Math.floor(r.x - pad)), y: Math.max(0, Math.floor(r.y - pad)),
               width: Math.ceil(r.width + pad * 2), height: Math.ceil(r.height + pad * 2) };
    }, sel);
    const before = await page.screenshot({ clip: box });
    await page.evaluate((s) => {
      const el = document.querySelector(s);
      const prev = document.createElement('button');
      prev.tabIndex = 0; prev.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0';
      el.parentElement.insertBefore(prev, el); prev.focus(); prev.dataset.tmpPrev = '1';
    }, sel);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    const after = await page.screenshot({ clip: box });
    await page.evaluate(() => document.querySelector('[data-tmp-prev]')?.remove());

    const A = PNG.sync.read(before), B = PNG.sync.read(after);
    const changed = [], unchanged = new Map();
    for (let i = 0; i < A.data.length; i += 4) {
      const bef = [A.data[i], A.data[i+1], A.data[i+2]], aft = [B.data[i], B.data[i+1], B.data[i+2]];
      const d = Math.abs(bef[0]-aft[0]) + Math.abs(bef[1]-aft[1]) + Math.abs(bef[2]-aft[2]);
      if (d > 24) changed.push({ bef, aft });
      else { const k = bef.join(','); unchanged.set(k, (unchanged.get(k) || 0) + 1); }
    }
    if (!changed.length) { rows.push({ id, route: c.route, none: true }); continue; }

    /* Adjacent background = the colour that dominates the pixels that did NOT
       change. In a 10px-padded crop that is the surface the indicator is
       drawn against, which is what 1.4.11 compares to. */
    const ground = [...unchanged.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
    const gL = lum(...ground);

    /* The indicator at full strength: among the changed pixels, the one whose
       AFTER colour is furthest in luminance from the ground. A soft-edged halo
       fades toward the ground at its outer edge; averaging it in would report
       the fade, not the ring. */
    let ind = null, best = -1;
    for (const p of changed) { const v = Math.abs(lum(...p.aft) - gL); if (v > best) { best = v; ind = p; } }
    const vs1411 = cr(lum(...ind.aft), gL);

    /* State change: the largest before/after contrast anywhere in the area
       that changed — the most favourable reading of 2.4.13 the page can get. */
    let vs2413 = 0;
    for (const p of changed) { const v = cr(lum(...p.aft), lum(...p.bef)); if (v > vs2413) vs2413 = v; }

    rows.push({ id, route: c.route, n: changed.length, ground, ind: ind.aft, vs1411, vs2413 });
  }
  await page.close();
}
await browser.close();

console.log('Focus indicators — painted-pixel measurement (1440x900, real Tab)\n');
console.log('  route + id                     px    indicator      adjacent       1.4.11   2.4.13');
for (const r of rows) {
  if (r.none) { console.log(`  ${(r.route + '#' + r.id).padEnd(30)} NO CHANGE`); continue; }
  console.log(`  ${(r.route + '#' + r.id).padEnd(30)} ${String(r.n).padStart(5)}  `
    + `rgb(${r.ground.length && r.ind.join(',')})`.padEnd(15)
    + `rgb(${r.ground.join(',')})`.padEnd(15)
    + `${r.vs1411.toFixed(2)}:1`.padStart(8) + `${r.vs2413.toFixed(2)}:1`.padStart(9)
    + (r.vs1411 >= 3 ? '  AA ok' : '  AA FAIL'));
}
