/* Full-page screenshots for design review.
 *   ROUTES=/,/cennik/ WIDTHS=1440,390 OUT=/tmp/shots node scripts/shots.mjs
 * The consent bar is answered ("denied") before load so it doesn't cover the
 * page; the page is scrolled top to bottom so every reveal has fired. */
import { chromium } from 'playwright';
import fs from 'node:fs';
const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8412';
const ROUTES = (process.env.ROUTES || '/').split(',');
const WIDTHS = (process.env.WIDTHS || '1440,390').split(',').map(Number);
const OUT = process.env.OUT || '/tmp/shots';
const FULL = process.env.FULL !== '0';
const H = Number(process.env.H || 900);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : H }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: 'gi_consent', value: 'denied', url: ORIGIN }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  for (const r of ROUTES) {
    await page.goto(ORIGIN + r, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
    if (FULL) {
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < h; y += 400) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(60); }
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.waitForTimeout(1200);
    const name = (r === '/' ? 'home' : r.replace(/\//g, '_').replace(/^_|_$/g, '')) + `-${w}`;
    const ow = await page.evaluate(() => document.documentElement.scrollWidth);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: FULL });
    console.log(name, 'scrollWidth', ow, ow > w ? 'OVERFLOW' : '');
  }
  await ctx.close();
}
await browser.close();
