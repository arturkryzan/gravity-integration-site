/* Accessible names and announced values for the controls the harden pass named.
 *
 * Markup in dist/ was already grepped, but an attribute being present is not
 * the same as the browser computing the name from it — a stray duplicate `for`,
 * an aria-hidden ancestor or a label that does not resolve all produce correct
 * markup and a silent control. This asks Chrome's own accessibility tree via
 * Playwright's role/name matching, which is the same computation a screen
 * reader consumes.
 *
 * It also drives the two money sliders, because their aria-valuetext is
 * maintained by the inline calc() script; a server-rendered attribute that
 * never updates would announce a stale number for every value but the default.
 *
 * Run: CHROME=… ORIGIN=http://127.0.0.1:8556 node scripts/verify-harden-names.mjs
 */
import { chromium } from 'playwright';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8556';
let bad = 0;
const ok = (c, msg) => { if (!c) bad++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${msg}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

/* ---- logo link (P1-4): an <svg> of bare <path>s, no text node ---- */
for (const [route, expect] of [['/', 'strona główna'], ['/en/', 'home']]) {
  await page.goto(ORIGIN + route, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const name = await page.evaluate(() => {
    const a = document.querySelector('header a.logo, a.logo');
    return a ? a.getAttribute('aria-label') : null;
  });
  ok(!!name && name.includes(expect), `${route} logo link announces "${name}"`);
  // the footer's logo is an <img alt>, deliberately left without aria-label
  const footer = await page.evaluate(() => {
    const l = [...document.querySelectorAll('a.logo')].pop();
    return { hasImgAlt: !!l?.querySelector('img[alt]:not([alt=""])'), aria: l?.getAttribute('aria-label') };
  });
  ok(footer.hasImgAlt, `${route} footer logo still gets its name from <img alt> (aria-label=${footer.aria})`);
}

/* ---- the five ROI sliders (P1-5) ----
   Polish only; the calculator was removed from /en/ because the software is
   priced for the Polish market, so there is no English twin to check. */
await page.goto(ORIGIN + '/kalkulator/', { waitUntil: 'load' });
await page.waitForTimeout(600);
const sliders = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('input.gi-range')) {
    const lab = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
    out.push({
      id: el.id,
      name: (lab?.textContent || el.getAttribute('aria-label') || '').trim(),
      valuetext: el.getAttribute('aria-valuetext'),
      value: el.value,
    });
  }
  return out;
});
ok(sliders.length === 5, `found ${sliders.length} range inputs on /kalkulator/`);
for (const s of sliders) {
  ok(s.name.length > 0, `#${s.id} has an accessible name — "${s.name}"`);
}
if (sliders.length !== 5) { console.log('  (skipping slider detail — wrong count)'); }
const money = sliders.filter((s) => s.id === 's-rate' || s.id === 's-tool');
for (const s of money) {
  ok(/PLN/.test(s.valuetext || ''), `#${s.id} announces a currency-qualified value — "${s.valuetext}"`);
}
const counts = sliders.filter((s) => !['s-rate', 's-tool'].includes(s.id));
for (const s of counts) {
  ok(s.valuetext === null, `#${s.id} deliberately has no aria-valuetext (a bare count needs none)`);
}

/* the JS must keep valuetext in step, or every value but the default lies */
const moved = await page.evaluate(() => {
  const el = document.getElementById('s-rate');
  const before = el.getAttribute('aria-valuetext');
  el.value = String(Math.min(+el.max, +el.value + 900));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return { before, after: el.getAttribute('aria-valuetext'), value: el.value };
});
ok(
  moved.after !== moved.before && /PLN/.test(moved.after || '') && moved.after.replace(/\D/g, '') === moved.value,
  `#s-rate valuetext tracks the slider: "${moved.before}" → "${moved.after}" at value=${moved.value}`
);

/* ---- skip link target (P2-8) ---- */
for (const route of ['/', '/en/']) {
  await page.goto(ORIGIN + route, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const link = document.querySelector('a.skip-link');
    const first = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])')]
      .filter((e) => e.offsetWidth || e.offsetHeight || e.getClientRects().length)[0];
    const target = document.querySelector(link?.getAttribute('href') || '#none');
    return {
      isFirst: link === first,
      name: link?.textContent.trim(),
      targetExists: !!target,
      targetFocusable: target?.getAttribute('tabindex') === '-1',
      targetTag: target?.tagName.toLowerCase(),
    };
  });
  ok(r.isFirst, `${route} skip link is the first thing Tab reaches — "${r.name}"`);
  ok(r.targetExists && r.targetTag === 'main', `${route} skip link resolves to <${r.targetTag}>`);
  ok(r.targetFocusable, `${route} <main> carries tabindex="-1" so the jump moves focus, not just scroll`);
}

/* the jump must actually land focus on <main> */
await page.goto(ORIGIN + '/', { waitUntil: 'load' });
await page.waitForTimeout(300);
await page.keyboard.press('Tab');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const landed = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
ok(landed === 'main', `activating the skip link puts focus on #main (got "${landed}")`);

/* ---- autocomplete (P2-3) without touching the MailerLite wire name ---- */
for (const route of ['/kontakt/', '/technologia/']) {
  await page.goto(ORIGIN + route, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  const f = await page.evaluate(() => {
    const e = document.querySelector('input#nemaiil');
    return e ? { ac: e.getAttribute('autocomplete'), im: e.getAttribute('inputmode'), n: e.getAttribute('name') } : null;
  });
  ok(f?.ac === 'email' && f?.im === 'email', `${route} email field: autocomplete=${f?.ac} inputmode=${f?.im}`);
  ok(f?.n === 'fields[email]', `${route} MailerLite wire name untouched — name="${f?.n}"`);
}

await browser.close();
console.log(bad ? `\n${bad} problem(s)` : '\nall accessible names and announced values verified');
process.exit(bad ? 1 : 0);
