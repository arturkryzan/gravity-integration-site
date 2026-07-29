/* Why did the case-study video's x move exactly -59px in BOTH locales while
   its w/h stayed identical? A content reflow would differ between locales
   (the copy differs); an identical delta points at structure. Walk the
   video's ancestor chain and print each box, so the answer is a measurement
   rather than a hypothesis. */
import { chromium } from 'playwright';
const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8601';
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const url of ['/case-studies/', '/en/case-studies/']) {
  await page.goto(`${ORIGIN}${url}`, { waitUntil: 'networkidle' });
  const chain = await page.evaluate(() => {
    const v = document.querySelector('video');
    if (!v) return null;
    const out = [];
    for (let el = v; el && el !== document.documentElement; el = el.parentElement) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out.push({
        tag: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(/\s+/).join('.') : ''),
        x: Math.round(r.left + scrollX),
        w: Math.round(r.width),
        maxW: cs.maxWidth,
        display: cs.display,
        cols: cs.gridTemplateColumns,
        measure: cs.getPropertyValue('--measure').trim(),
      });
    }
    return out;
  });
  console.log(`\n${url}`);
  for (const c of chain) console.log(`  x=${String(c.x).padStart(5)} w=${String(c.w).padStart(5)}  max=${c.maxW}  ${c.display}${c.cols && c.cols !== 'none' ? ` cols=[${c.cols}]` : ''}${c.measure ? `  --measure=${c.measure}` : ''}  ${c.tag}`);
}
await browser.close();
