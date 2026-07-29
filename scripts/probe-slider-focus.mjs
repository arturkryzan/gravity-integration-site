/* The five ROI sliders "passed" the ring test on 1.5% changed pixels while
 * reporting a fully transparent box-shadow. 1.5% over a 0.4% threshold is a
 * pass on paper, but a pass I can't explain is not evidence. Find out WHERE
 * the changed pixels sit and WHICH rule paints them. */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8414';
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${ORIGIN}/kalkulator/`, { waitUntil: 'networkidle' });
const consent = await page.$('.gi-consent-accept, .gi-consent-btn');
if (consent) { await consent.click(); await page.waitForTimeout(300); }

const sel = '#s-projects';
await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center', behavior: 'instant' }), sel);
await page.waitForTimeout(200);

const box = await page.evaluate((s) => {
  const r = document.querySelector(s).getBoundingClientRect();
  const pad = 8;
  return { x: Math.max(0, Math.floor(r.x - pad)), y: Math.max(0, Math.floor(r.y - pad)),
           width: Math.ceil(r.width + pad * 2), height: Math.ceil(r.height + pad * 2),
           raw: { x: r.x, y: r.y, w: r.width, h: r.height } };
}, sel);
console.log('rect', JSON.stringify(box.raw));

const before = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
await page.evaluate((s) => {
  const el = document.querySelector(s);
  const prev = document.createElement('button');
  prev.tabIndex = 0; prev.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0';
  el.parentElement.insertBefore(prev, el); prev.focus(); prev.dataset.tmpPrev = '1';
}, sel);
await page.keyboard.press('Tab');
await page.waitForTimeout(300);
const after = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });

const A = PNG.sync.read(before), B = PNG.sync.read(after);
let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
const colours = new Map();
for (let y = 0; y < A.height; y++) for (let x = 0; x < A.width; x++) {
  const i = (y * A.width + x) * 4;
  const d = Math.abs(A.data[i]-B.data[i]) + Math.abs(A.data[i+1]-B.data[i+1]) + Math.abs(A.data[i+2]-B.data[i+2]);
  if (d <= 24) continue;
  n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  const k = `${B.data[i]},${B.data[i+1]},${B.data[i+2]}`;
  colours.set(k, (colours.get(k) || 0) + 1);
}
console.log(`changed ${n}px, cluster x ${minX}..${maxX} (of ${A.width}), y ${minY}..${maxY} (of ${A.height})`);
console.log('top after-colours:', [...colours.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([c,k])=>`rgb(${c}) x${k}`).join(' | '));

/* Which rule paints it? Ask the stylesheets, not the computed style — a
   ::-webkit-slider-thumb ring never shows up on getComputedStyle(el). */
const rules = await page.evaluate(() => {
  const out = [];
  const walk = (list) => { for (const r of list) {
    if (r.selectorText) { if (/#s-|input\[type=.?range|slider-thumb|\.roi/i.test(r.selectorText) && /focus/i.test(r.selectorText)) out.push(r.cssText.slice(0, 300)); }
    else if (r.cssRules) walk(r.cssRules);
  } };
  for (const ss of document.styleSheets) { try { walk(ss.cssRules); } catch {} }
  return out;
});
console.log('\nfocus rules touching the range input:');
for (const r of rules) console.log('  ' + r);

await page.evaluate(() => document.querySelector('[data-tmp-prev]')?.remove());
await browser.close();
