/* Did capping the consent copy make the bar taller? Measure it, don't guess:
   the bar is fixed and sits on every route, so a one-line growth is a change
   to every page on the site. */
import { chromium } from 'playwright';
const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8601';
const browser = await chromium.launch({ executablePath: process.env.CHROME });
for (const w of [1440, 900, 390]) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const bar = document.querySelector('#gi-consent');
    const p = document.querySelector('#gi-consent-body');
    if (!bar || !p) return null;
    const cs = getComputedStyle(bar);
    if (cs.display === 'none' || bar.hidden) return { hidden: true };
    const cvs = document.createElement('canvas');
    const ctx = cvs.getContext('2d');
    const ps = getComputedStyle(p);
    ctx.font = `${ps.fontStyle} ${ps.fontWeight} ${ps.fontSize} ${ps.fontFamily}`;
    const ch = ctx.measureText('0').width;
    const rng = document.createRange();
    rng.selectNodeContents(p);
    const lines = new Set(
      [...rng.getClientRects()].filter((q) => q.height > 0).map((q) => Math.round(q.top))
    ).size;
    return {
      barH: Math.round(bar.getBoundingClientRect().height),
      pW: Math.round(p.getBoundingClientRect().width),
      chars: Math.round(p.getBoundingClientRect().width / ch),
      lines,
      fs: ps.fontSize,
    };
  });
  console.log(`${w}px  ${JSON.stringify(r)}`);
  await page.close();
}
await browser.close();
