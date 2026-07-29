/* Which focusable elements have *no* focus indicator, everywhere?
 *
 * Sampling with the keyboard settles individual cases but can't prove
 * coverage. This asks the stylesheets instead: collect every selector in the
 * document that contains :focus-visible or :focus, strip the pseudo-class,
 * and test each focusable element against what remains. An element that
 * matches none of them has no author focus style — and because the ported
 * theme sets `outline:0` on its inputs and `*{box-shadow:0 0 1px transparent}`
 * globally, "no author focus style" means no ring at all, not a UA default.
 *
 * Run: CHROME=… ORIGIN=http://127.0.0.1:8501 node scripts/audit-focus-coverage.mjs
 */
import { chromium } from 'playwright';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8501';
const ROUTES = ['/', '/technologia/', '/kalkulator/', '/cennik/', '/kontakt/', '/case-studies/',
  '/pobieranie/', '/polityka-prywatnosci/', '/en/', '/en/technology/', '/en/pricing/',
  '/en/contact/', '/en/case-studies/', '/en/download/', '/en/privacy-policy/'];

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

const tally = new Map();
for (const route of ROUTES) {
  await page.goto(ORIGIN + route, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const bare = await page.evaluate(() => {
    /* every author selector that styles a focused element */
    const focusSel = [];
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      /* Every CSSStyleRule carries a (usually empty) `cssRules` list in modern
         Chrome, so this must inspect the rule AND descend — an `else if` here
         silently collects nothing at all. */
      const walk = (rs) => { for (const r of rs) {
        if (r.cssRules && r.cssRules.length) walk(r.cssRules);
        if (r.selectorText && /:focus/.test(r.selectorText) && r.style && r.style.length) {
          /* a rule that only sets outline:0 is a *removal*, not an indicator */
          const only = [...r.style].every((p) => /^outline/.test(p));
          const kills = r.style.outlineStyle === 'none' || r.style.outlineWidth === '0px' || r.style.outline === '0';
          if (!(only && kills)) focusSel.push(r.selectorText);
        }
      } };
      walk(rules);
    }
    const stripped = focusSel.flatMap((s) => s.split(',')).map((s) =>
      s.replace(/:focus-visible|:focus-within|:focus/g, '').trim()).filter(Boolean);

    const out = [];
    const focusables = document.querySelectorAll(
      'a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])');
    for (const el of focusables) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;         /* hidden / honeypot */
      if (el.closest('[aria-hidden="true"]')) continue;
      let covered = false;
      for (const s of stripped) {
        try { if (el.matches(s) || el.closest(s)) { covered = true; break; } } catch {}
      }
      if (!covered) {
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
        out.push(`${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 70));
      }
    }
    return out;
  });
  for (const k of bare) {
    if (!tally.has(k)) tally.set(k, new Set());
    tally.get(k).add(route);
  }
}
await browser.close();

const rows = [...tally.entries()].sort((a, b) => b[1].size - a[1].size);
console.log(`focusable elements with no author focus style — ${rows.length} distinct\n`);
for (const [sel, routes] of rows) console.log(`  ${String(routes.size).padStart(2)}×  ${sel}\n        ${[...routes].join(' ')}`);
