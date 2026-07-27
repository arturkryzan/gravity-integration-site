import { chromium } from 'playwright';

const BASE = 'http://localhost:4321';
const ROUTES = [
  '/', '/technologia/', '/czym-jest-esb/', '/cennik/', '/integracje/',
  '/kalkulator/', '/case-studies/', '/pobieranie/', '/kontakt/', '/polityka-prywatnosci/',
];

// relative luminance / contrast
function lum(rgb) {
  const a = rgb.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function contrast(fg, bg) {
  const L1 = lum(fg), L2 = lum(bg);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}
function parseRGB(s) {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x.trim()));
  return { rgb: [p[0], p[1], p[2]], a: p[3] === undefined ? 1 : p[3] };
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

async function auditPage(route, width, height, label) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message.slice(0, 200)));
  try { await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20000 }); }
  catch (e) { await page.goto(BASE + route, { waitUntil: 'commit', timeout: 20000 }); }
  await page.waitForTimeout(600);

  const result = await page.evaluate(() => {
    const out = { title: document.title, lang: document.documentElement.lang, issues: [] };

    // horizontal overflow
    const docW = document.documentElement.scrollWidth;
    const winW = window.innerWidth;
    out.overflow = docW - winW;
    if (docW > winW + 1) {
      // find offenders
      const off = [];
      document.querySelectorAll('*').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.right > winW + 2 && r.width > 20 && r.left >= -1) {
          off.push((el.tagName.toLowerCase()) + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') + ` (right:${Math.round(r.right)})`);
        }
      });
      out.overflowOffenders = [...new Set(off)].slice(0, 6);
    }

    // headings
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({
      level: +h.tagName[1], text: h.textContent.trim().slice(0, 50),
    }));
    out.h1count = hs.filter((h) => h.level === 1).length;
    // skips
    const skips = [];
    for (let i = 1; i < hs.length; i++) {
      if (hs[i].level - hs[i - 1].level > 1) skips.push(`${hs[i-1].level}->${hs[i].level} at "${hs[i].text}"`);
    }
    out.headingSkips = skips;
    out.headings = hs.map((h) => h.level).join(',');

    // images alt
    const imgs = [...document.querySelectorAll('img')];
    out.imgCount = imgs.length;
    out.imgNoAlt = imgs.filter((i) => !i.hasAttribute('alt')).map((i) => (i.getAttribute('src') || '').split('/').pop()).slice(0, 8);
    // lazy loading & dimensions
    out.imgNoDims = imgs.filter((i) => (!i.getAttribute('width') || !i.getAttribute('height')) && !i.closest('.ratio') && !i.closest('svg')).length;

    // links/buttons without accessible name
    const controls = [...document.querySelectorAll('a,button')];
    out.emptyControls = controls.filter((c) => {
      const t = (c.textContent || '').trim();
      const al = c.getAttribute('aria-label') || c.getAttribute('title');
      const hasImg = c.querySelector('img[alt]:not([alt=""]),svg');
      return !t && !al && !hasImg;
    }).map((c) => c.tagName.toLowerCase() + (c.getAttribute('href') ? `[${c.getAttribute('href')}]` : '')).slice(0, 8);

    // touch targets (mobile only meaningful) - links/buttons < 24px
    const smallTargets = controls.filter((c) => {
      const r = c.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      // skip inline links inside paragraphs
      const inProse = c.closest('p,li,.paragraph');
      return (r.height < 24 || r.width < 24) && !inProse;
    }).map((c) => {
      const r = c.getBoundingClientRect();
      return c.tagName.toLowerCase() + ` ${Math.round(r.width)}x${Math.round(r.height)} "${(c.textContent||'').trim().slice(0,20)}"`;
    }).slice(0, 8);
    out.smallTargets = smallTargets;

    // contrast — sample text nodes
    function toRGB(s) {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map((x) => parseFloat(x.trim()));
      return { rgb: [p[0], p[1], p[2]], a: p[3] === undefined ? 1 : p[3] };
    }
    function bgOf(el) {
      let e = el;
      while (e && e !== document.documentElement) {
        const c = getComputedStyle(e).backgroundColor;
        const p = toRGB(c);
        if (p && p.a > 0.5) return p.rgb;
        e = e.parentElement;
      }
      return [255, 255, 255];
    }
    const lowContrast = [];
    const seen = new Set();
    document.querySelectorAll('p,span,a,li,h1,h2,h3,h4,h5,h6,button,label,td,th,figcaption,small,strong,em,div').forEach((el) => {
      const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
      if (!txt || txt.length < 2) return;
      const st = getComputedStyle(el);
      const fg = toRGB(st.color);
      if (!fg) return;
      const bg = bgOf(el);
      const fs = parseFloat(st.fontSize);
      const fw = parseInt(st.fontWeight) || 400;
      const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
      // compute contrast
      const L = (rgb) => {
        const a = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
        return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];
      };
      const cr = (Math.max(L(fg.rgb), L(bg)) + 0.05) / (Math.min(L(fg.rgb), L(bg)) + 0.05);
      const min = large ? 3 : 4.5;
      if (cr < min) {
        const key = st.color + '|' + txt.slice(0, 20);
        if (!seen.has(key)) {
          seen.add(key);
          lowContrast.push(`"${txt.slice(0,28)}" ${cr.toFixed(2)}:1 (need ${min}) color:${st.color} size:${fs}px`);
        }
      }
    });
    out.lowContrast = lowContrast.slice(0, 12);

    // focusable outline check - sample
    return out;
  });
  result.consoleErrors = [...new Set(consoleErrors)].slice(0, 6);
  result.route = route;
  result.viewport = label;

  // screenshot
  const name = route === '/' ? 'home' : route.replace(/\//g, '-').replace(/^-|-$/g, '');
  await page.screenshot({ path: `/tmp/shots/${name}__${label}.png`, fullPage: label === 'desktop' });
  await ctx.close();
  return result;
}

import { mkdirSync } from 'fs';
mkdirSync('/tmp/shots', { recursive: true });

const all = [];
for (const route of ROUTES) {
  const d = await auditPage(route, 1440, 900, 'desktop');
  const m = await auditPage(route, 390, 844, 'mobile');
  all.push({ route, desktop: d, mobile: m });
  console.log(`done ${route}`);
}
await browser.close();
import { writeFileSync } from 'fs';
writeFileSync('/tmp/audit-results.json', JSON.stringify(all, null, 2));
console.log('WROTE /tmp/audit-results.json');
