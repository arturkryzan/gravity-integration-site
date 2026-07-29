/* Throwaway probe: for each prose block the measure check flagged, how many
   LINES does it actually render on? Measure is a property of the return sweep
   — the eye losing the start of the *next* line — so a block that renders on
   one line cannot have a measure problem no matter how wide its box is. */
import { chromium } from 'playwright';
const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8601';
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const url of ['/', '/integracje/', '/kalkulator/', '/en/', '/en/case-studies/']) {
  await page.goto(`${ORIGIN}${url}`, { waitUntil: 'networkidle' });
  const rows = await page.evaluate(() => {
    const cvs = document.createElement('canvas');
    const ctx = cvs.getContext('2d');
    const out = [];
    for (const el of document.querySelectorAll('p, li, blockquote')) {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 4 || r.left < -1000) continue;
      const txt = (el.textContent || '').trim();
      if (txt.length < 60) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const ch = ctx.measureText('0').width;
      if (!ch) continue;
      const inner =
        r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) -
        parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
      const chars = Math.round(inner / ch);
      if (chars <= 75) continue;
      /* Count rendered lines from the client rects of a Range over the node —
         one rect per line box, which is the browser's own answer. */
      const rng = document.createRange();
      rng.selectNodeContents(el);
      const tops = new Set(
        [...rng.getClientRects()].filter((q) => q.height > 0).map((q) => Math.round(q.top))
      );
      out.push({
        chars,
        lines: tops.size,
        id: el.id || '',
        cls: el.className || el.tagName,
        fs: cs.fontSize,
        lh: cs.lineHeight,
        h: Math.round(r.height),
        txt: txt.slice(0, 56),
      });
    }
    return out;
  });
  for (const r of rows)
    console.log(
      `${url}  ${r.chars}ch  lines=${r.lines}  h=${r.h}  ${r.fs}/${r.lh}  ${r.id ? '#' + r.id : '.' + r.cls}  "${r.txt}…"`
    );
}
await browser.close();
