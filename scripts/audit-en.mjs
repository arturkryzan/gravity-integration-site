/* Phase EN-6 audit harness.
   Every English page at three widths: does anything overflow, is any heading
   clipped, is any control smaller than a thumb, does the console stay quiet.
   Run:  CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/audit-en.mjs
*/
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8412';
const SHOTS = 'audit-shots';
mkdirSync(SHOTS, { recursive: true });

/* Keyed by the language-neutral slug, so the two locales line up row for row and
   a finding can be asked the only question that matters here: does it also
   happen in Polish? If it does, it is the site's own long-standing behaviour and
   not something the translation introduced. */
const LOCALE = process.env.LOCALE === 'pl' ? 'pl' : 'en';
/* `null` on the English side means the page is Polish-only on purpose, not
   that its URL was forgotten. The row stays so LOCALE=pl still audits the
   Polish page — dropping it would have quietly narrowed the Polish run too. */
const ROUTES = {
  home: ['/', '/en/'],
  'czym-jest-esb': ['/czym-jest-esb/', '/en/what-is-esb/'],
  technologia: ['/technologia/', '/en/technology/'],
  cennik: ['/cennik/', '/en/pricing/'],
  kalkulator: ['/kalkulator/', null],
  integracje: ['/integracje/', '/en/integrations/'],
  'case-studies': ['/case-studies/', '/en/case-studies/'],
  kontakt: ['/kontakt/', '/en/contact/'],
  pobieranie: ['/pobieranie/', '/en/download/'],
  '404': ['/404.html', '/en/404.html'],
};
const PAGES = Object.entries(ROUTES)
  .map(([slug, [pl, en]]) => [LOCALE === 'pl' ? pl : en, slug])
  .filter(([url]) => url !== null);

const WIDTHS = [
  ['mobile', 390, 844],
  ['tablet', 820, 1180],
  ['desktop', 1440, 900],
];

/* Runs in the page. Returns everything measurable in one round trip so the
   report is a single object per (page, width) rather than a dozen evaluates. */
const PROBE = () => {
  const vw = window.innerWidth;
  const label = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = (el.className && typeof el.className === 'string')
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    return (el.tagName.toLowerCase() + id + cls).slice(0, 70);
  };

  /* Anything sticking past the right edge. Fixed/sticky decoration that is
     deliberately off-canvas (closed mobile menu, cookie bar pre-consent) would
     be a false positive, so those are skipped by position — as is anything
     parked at left:-9999px, which is the honeypot/visually-hidden idiom, not a
     layout fault. */
  const overflow = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (cs.position === 'fixed' || cs.position === 'sticky') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.left < -1000) continue; // parked off-canvas on purpose
    if (r.right > vw + 1.5 || r.left < -1.5) {
      overflow.push({ el: label(el), left: +r.left.toFixed(1), right: +r.right.toFixed(1) });
    }
  }

  /* A heading whose text box is taller than the element that clips it: the
     Polish copy fitted, the English copy may not. */
  const clipped = [];
  for (const el of document.querySelectorAll('h1,h2,h3,h4,.hero-title,.sec-title')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    const hiddenY = cs.overflowY === 'hidden' || cs.overflow === 'hidden';
    if (hiddenY && el.scrollHeight > el.clientHeight + 2) {
      clipped.push({ el: label(el), scroll: el.scrollHeight, client: el.clientHeight, text: el.textContent.trim().slice(0, 60) });
    }
    /* Word longer than its own box — the classic long-compound-noun break. */
    if (el.scrollWidth > el.clientWidth + 2) {
      clipped.push({ el: label(el), wide: true, scroll: el.scrollWidth, client: el.clientWidth, text: el.textContent.trim().slice(0, 60) });
    }
  }

  /* Touch targets. 44×44 is the floor; buttons sized to Polish words can come
     out short when the English label is one word instead of two. */
  const small = [];
  for (const el of document.querySelectorAll('a,button,input,select,textarea,[role="button"]')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    /* Inline links inside prose are read, not tapped — a 17px-tall anchor mid
       sentence is typography, not a 44px control that shrank. */
    if (el.tagName === 'A' && el.closest('p,li,td,dd,figcaption') && cs.display.startsWith('inline')) continue;
    if (r.height < 44 || r.width < 24) {
      small.push({ el: label(el), w: +r.width.toFixed(1), h: +r.height.toFixed(1), text: (el.textContent || el.value || '').trim().slice(0, 40) });
    }
  }

  /* Images that failed to decode. */
  const broken = [...document.images]
    .filter((i) => !i.complete || i.naturalWidth === 0)
    .map((i) => i.getAttribute('src'));

  return {
    docScroll: document.documentElement.scrollWidth,
    vw,
    lang: document.documentElement.lang,
    h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim().slice(0, 80)),
    overflow, clipped, small, broken,
  };
};

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const report = [];

for (const [name, w, h] of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    isMobile: name === 'mobile',
    hasTouch: name === 'mobile',
  });
  for (const [path, slug] of PAGES) {
    const page = await ctx.newPage();
    const errors = [];
    const failed = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 200)));
    page.on('requestfailed', (r) => failed.push(r.url().slice(-70) + ' :: ' + (r.failure()?.errorText || '')));

    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    /* Walk the whole page before measuring. Lazy images below the fold report
       naturalWidth 0 until they are asked for, and the scroll-triggered reveals
       need to have fired or half the sections measure at their pre-reveal size. */
    await page.evaluate(async () => {
      const step = window.innerHeight * 0.8;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 90));
      }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 250));
    });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(250);
    const r = await page.evaluate(PROBE);
    await page.screenshot({ path: `${SHOTS}/${LOCALE}-${slug}-${name}.png`, fullPage: false });
    report.push({ page: slug, width: name, path, errors, failed, ...r });
    await page.close();
  }
  await ctx.close();
}
await browser.close();

writeFileSync(`audit-${LOCALE}.json`, JSON.stringify(report, null, 2));

/* ------------------------------------------------------------------ summary */
let bad = 0;
for (const r of report) {
  const issues = [];
  if (r.docScroll > r.vw + 1) issues.push(`H-SCROLL doc=${r.docScroll} vw=${r.vw}`);
  if (r.lang !== LOCALE) issues.push(`LANG=${r.lang}`);
  if (r.h1.length !== 1) issues.push(`H1 count=${r.h1.length}`);
  if (r.overflow.length) issues.push(`OVERFLOW ×${r.overflow.length}: ` + r.overflow.slice(0, 3).map((o) => `${o.el}(${o.left}→${o.right})`).join(', '));
  if (r.clipped.length) issues.push(`CLIPPED ×${r.clipped.length}: ` + r.clipped.slice(0, 3).map((c) => `${c.el} "${c.text}"`).join(' | '));
  if (r.small.length) issues.push(`SMALL-TAP ×${r.small.length}: ` + r.small.slice(0, 4).map((s) => `${s.el} ${s.w}×${s.h} "${s.text}"`).join(' | '));
  if (r.broken.length) issues.push(`BROKEN-IMG ×${r.broken.length}: ` + r.broken.join(', '));
  if (r.errors.length) issues.push(`CONSOLE ×${r.errors.length}: ` + r.errors[0]);
  if (r.failed.length) issues.push(`REQ-FAIL ×${r.failed.length}: ` + r.failed[0]);
  if (issues.length) { bad++; console.log(`\n✗ ${r.page} @ ${r.width}`); issues.forEach((i) => console.log('   ' + i)); }
}
console.log(`\n${report.length - bad}/${report.length} page×width combinations clean.`);
