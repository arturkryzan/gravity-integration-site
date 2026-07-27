import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:4321';
const ROUTES = ['/integracje/', '/cennik/', '/kalkulator/', '/', '/technologia/', '/pobieranie/', '/czym-jest-esb/', '/case-studies/', '/kontakt/', '/polityka-prywatnosci/'];
const VIEWPORTS = [
  ['desktop', 1440, 900],
  ['tablet', 768, 1024],
  ['mobile', 390, 844],
  ['small', 320, 700],
];

mkdirSync('/tmp/adapt', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

for (const route of ROUTES) {
  for (const [label, width, height] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
    try { await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20000 }); }
    catch { await page.goto(BASE + route, { waitUntil: 'commit', timeout: 20000 }); }
    await page.waitForTimeout(500);

    const r = await page.evaluate(() => {
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      const off = [];
      if (docW > winW + 1) {
        document.querySelectorAll('*').forEach((el) => {
          const b = el.getBoundingClientRect();
          if (b.right > winW + 2 && b.width > 20 && b.left >= -1) {
            off.push(el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '') + `(r:${Math.round(b.right)})`);
          }
        });
      }
      const h1 = document.querySelector('h1');
      const h1r = h1 ? h1.getBoundingClientRect() : null;
      const tbl = document.querySelector('table.gi-breakdown');
      const tblr = tbl ? tbl.getBoundingClientRect() : null;
      // fixed/sticky sanity: is the announcement bar still fixed & on screen?
      const bar = document.getElementById('gi-announce-bar');
      const barPos = bar ? getComputedStyle(bar).position : null;
      const barTop = bar ? Math.round(bar.getBoundingClientRect().top) : null;
      return {
        overflow: docW - winW,
        offenders: [...new Set(off)].slice(0, 5),
        h1: h1r ? { fs: getComputedStyle(h1).fontSize, w: Math.round(h1r.width), right: Math.round(h1r.right), text: h1.textContent.trim().slice(0, 40) } : null,
        table: tblr ? { w: Math.round(tblr.width), right: Math.round(tblr.right) } : null,
        barPos, barTop,
      };
    });

    // scroll sanity: does the page still scroll vertically, and does the header react?
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(400);
    const scrolled = await page.evaluate(() => ({
      y: Math.round(window.scrollY),
      barTop: (() => { const b = document.getElementById('gi-announce-bar'); return b ? Math.round(b.getBoundingClientRect().top) : null; })(),
      headerTop: (() => { const h = document.querySelector('header'); return h ? Math.round(h.getBoundingClientRect().top) : null; })(),
    }));

    const flag = r.overflow > 1 ? ' ❌' : ' ✅';
    console.log(`${route} @${label}${flag} overflow=${r.overflow}${r.offenders.length ? ' <- ' + r.offenders.join(', ') : ''}`);
    if (r.h1) console.log(`    h1 ${r.h1.fs} w=${r.h1.w} right=${r.h1.right} "${r.h1.text}"`);
    if (r.table) console.log(`    table w=${r.table.w} right=${r.table.right}`);
    console.log(`    bar=${r.barPos}@${r.barTop} | after scroll y=${scrolled.y} bar@${scrolled.barTop} header@${scrolled.headerTop}`);
    if (errs.length) console.log(`    JS ERRORS: ${errs.join(' | ')}`);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    const name = (route === '/' ? 'home' : route.replace(/\//g, '-').replace(/^-|-$/g, ''));
    await page.screenshot({ path: `/tmp/adapt/${name}__${label}.png` });
    await ctx.close();
  }
}
await browser.close();
