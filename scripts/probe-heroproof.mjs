/* P1-1: the hero social-proof line. The previous audit measured 3.77:1 at
 * alpha 0.4 and recommended 0.55. The built HTML now says 0.55 — but "the
 * number in the recommendation appears in the source" is not a measurement.
 * Composite it against what is actually painted behind it and check. */
import { chromium } from 'playwright';
const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8414';
const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (r, g, b) => 0.2126*srgb(r/255) + 0.7152*srgb(g/255) + 0.0722*srgb(b/255);
const cr = (a, b) => { const [x, y] = [a, b].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
for (const route of ['/', '/en/']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(ORIGIN + route, { waitUntil: 'networkidle' });
  const m = await page.evaluate(() => {
    const p = [...document.querySelectorAll('p')]
      .find((n) => /Wybierany przez|Chosen by/.test(n.textContent));
    if (!p) return null;
    const cs = getComputedStyle(p);
    const fg = (cs.color.match(/[\d.]+/g) || []).map(Number);
    let ground = [255,255,255];
    for (let n = p; n; n = n.parentElement) {
      const b = (getComputedStyle(n).backgroundColor.match(/[\d.]+/g) || []).map(Number);
      if (b.length >= 3 && (b[3] === undefined || b[3] > 0.9)) { ground = b.slice(0,3); break; }
    }
    const a = fg[3] === undefined ? 1 : fg[3];
    return { raw: cs.color, size: cs.fontSize, weight: cs.fontWeight, ground,
             eff: [0,1,2].map(i => Math.round(fg[i]*a + ground[i]*(1-a))),
             inlineStyled: p.hasAttribute('style'), style: p.getAttribute('style') };
  });
  if (!m) { console.log(`  ${route}: line not found`); await page.close(); continue; }
  const ratio = cr(lum(...m.eff), lum(...m.ground));
  const px = parseFloat(m.size);
  console.log(`  ${route}  ${m.raw} over rgb(${m.ground}) → rgb(${m.eff}) = ${ratio.toFixed(2)}:1`
    + `  at ${m.size}/${m.weight} (needs 4.5) ${ratio >= 4.5 ? 'PASS' : 'FAIL'}`);
  console.log(`        inline style: ${m.inlineStyled ? m.style : 'none'}`);
  await page.close();
}
await browser.close();
