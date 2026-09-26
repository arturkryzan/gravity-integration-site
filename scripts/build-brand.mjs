/* Brand assets for v2, rendered from the design system's own geometry.
 *
 *   node scripts/build-brand.mjs            (CHROME=… in a sandbox)
 *
 * The mark (design system §01): a mint square, the ink mass cropped by it —
 * about 94% of the side, bleeding off the bottom-right — and the satellite,
 * a fifth of the mass, top-left. At 16px the satellite is dropped, exactly
 * as the system's own 16px specimen does. Rounded 25% for tab icons; square
 * and full-bleed where the platform rounds it itself (Apple touch icon) or
 * where a crawler wants a plain square (the JSON-LD logo).
 *
 * The share images (1200×630) are the "A · Corner fall" frame: mint field,
 * ink mass, the home H1 on the mass in mint, the wordmark on the field. One
 * per language, because the headline is words. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const MINT = '#01EC90';
const INK = '#1E1F33';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = (p) => path.join(root, 'public', p);

const mark = (size, { rounded = true, satellite = true } = {}) => {
  const s = 64;
  const clip = rounded ? `<clipPath id="c"><rect width="${s}" height="${s}" rx="16"/></clipPath>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${size}" height="${size}">${
    clip ? `<defs>${clip}</defs>` : ''
  }<g${clip ? ' clip-path="url(#c)"' : ''}><rect width="${s}" height="${s}" fill="${MINT}"/><circle cx="50" cy="50" r="30" fill="${INK}"/>${
    satellite ? `<circle cx="13" cy="13" r="5" fill="${INK}"/>` : ''
  }</g></svg>`;
};

fs.mkdirSync(out('favicons'), { recursive: true });
fs.writeFileSync(out('favicons/mark.svg'), mark(64).replace(/ width="64" height="64"/, '') + '\n');

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });

async function png(svg, size, file) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: out(file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await png(mark(16, { satellite: false }), 16, 'favicons/mark-16.png');
await png(mark(32), 32, 'favicons/mark-32.png');
await png(mark(180, { rounded: false }), 180, 'favicons/mark-180.png');
await png(mark(192), 192, 'favicons/mark-192.png');
await png(mark(512, { rounded: false }), 512, 'favicons/mark-512.png');

/* ---- share images ---- */
const font = (f) =>
  'data:font/woff2;base64,' +
  fs.readFileSync(path.join(root, 'node_modules/@fontsource', f)).toString('base64');
const faces = `
@font-face{font-family:E;font-weight:800;src:url(${font('epilogue/files/epilogue-latin-800-normal.woff2')}) format('woff2');unicode-range:U+0000-00FF,U+2013-2014,U+2019}
@font-face{font-family:E;font-weight:800;src:url(${font('epilogue/files/epilogue-latin-ext-800-normal.woff2')}) format('woff2');unicode-range:U+0100-02AF}
@font-face{font-family:M;font-weight:500;src:url(${font('jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2')}) format('woff2')}`;

const share = (h1, label) => `<!doctype html><html><head><meta charset="utf-8"><style>${faces}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;background:${MINT};position:relative;font-family:E,sans-serif}
.mass{position:absolute;width:980px;height:980px;border-radius:50%;background:${INK};left:470px;top:120px}
.sat{position:absolute;width:64px;height:64px;border-radius:50%;background:${INK};left:372px;top:92px}
.wm{position:absolute;left:64px;top:56px;font:800 34px/.92 E;letter-spacing:-.045em;color:${INK}}
.label{position:absolute;left:64px;bottom:60px;font:500 15px/1.3 M;letter-spacing:.08em;color:${INK};text-transform:uppercase}
h1{position:absolute;left:560px;right:56px;bottom:74px;color:${MINT};font:800 54px/.95 E;letter-spacing:-.05em}
</style></head><body><div class="mass"></div><div class="sat"></div>
<div class="wm">gravity.<br>integration</div><div class="label">${label}</div><h1>${h1}</h1></body></html>`;

async function shareImage(h1, label, file) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(share(h1, label), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out(file) });
  await page.close();
}
const pl = JSON.parse(fs.readFileSync(path.join(root, 'src/content/pages/pl/home.json'), 'utf8')).h1;
const en = JSON.parse(fs.readFileSync(path.join(root, 'src/content/pages/en/home.json'), 'utf8')).h1;
await shareImage(pl, 'gravity-integration.com', 'og-gravity.png');
await shareImage(en, 'gravity-integration.com', 'og-gravity-en.png');

await browser.close();
console.log('brand assets written');
