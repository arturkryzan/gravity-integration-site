/* axe-core (WCAG 2.0/2.1/2.2 A + AA, plus axe's best-practice rules) over
 * every route at 1440 and 390, then the two states a static sweep never sees:
 * the first-visit consent panel and the open menu dialog.
 *
 * Each page is scrolled top to bottom first so every [data-reveal] block has
 * come into view — otherwise axe measures text at opacity 0 and reports
 * contrast failures that no visitor can ever see (reduced motion is also set,
 * which shows reveals instantly; the scroll is the belt to those braces).
 *
 *   CHROME=… ORIGIN=http://127.0.0.1:8412 node scripts/verify-axe.mjs
 *
 * Clean output ends with "0 violations".
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8412';
const ROUTES = [
  '/', '/technologia/', '/integracje/', '/cennik/', '/case-studies/', '/czym-jest-esb/', '/pobieranie/',
  '/kontakt/', '/kalkulator/', '/polityka-prywatnosci/', '/404.html',
  '/en/', '/en/technology/', '/en/integrations/', '/en/pricing/', '/en/case-studies/', '/en/what-is-esb/',
  '/en/download/', '/en/contact/', '/en/404.html',
];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const axe = fs.readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
let total = 0;

async function audit(page, label) {
  await page.addScriptTag({ content: axe });
  const found = await page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { resultTypes: ['violations'], runOnly: { type: 'tag', values: tags } });
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => `${n.target.join(' ')} — ${(n.failureSummary || '').split('\n').slice(1, 2).join(' ')}`),
    }));
  }, TAGS);
  for (const v of found) {
    total += v.nodes.length;
    console.log(`  FAIL ${label} [${v.id}, ${v.impact}] ×${v.nodes.length}`);
    for (const n of v.nodes.slice(0, 3)) console.log(`         ${n.slice(0, 220)}`);
  }
  if (!found.length) console.log(`  ok   ${label}`);
}

for (const width of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'gi_consent', value: 'denied', url: ORIGIN }]);
  const page = await ctx.newPage();
  for (const r of ROUTES) {
    await page.goto(ORIGIN + r, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        scrollTo(0, y);
        await new Promise((f) => setTimeout(f, 30));
      }
      scrollTo(0, 0);
    });
    await page.waitForTimeout(300);
    await audit(page, `${r} @${width}`);
  }
  await ctx.close();

  // first visit: the consent panel is up
  const fresh = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const p2 = await fresh.newPage();
  for (const r of ['/', '/en/']) {
    await p2.goto(ORIGIN + r, { waitUntil: 'networkidle' });
    await p2.waitForSelector('#gi-consent:not([hidden])');
    await audit(p2, `${r} @${width} consent panel`);
  }
  await fresh.close();
}

// the menu dialog, open (it only exists as a control below 1100px)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'gi_consent', value: 'denied', url: ORIGIN }]);
  const page = await ctx.newPage();
  for (const r of ['/', '/en/']) {
    await page.goto(ORIGIN + r, { waitUntil: 'networkidle' });
    await page.click('.site-header [data-menu-open]');
    await page.waitForSelector('#site-menu[open]');
    await audit(page, `${r} @390 menu open`);
  }
  await ctx.close();
}

await browser.close();
console.log(`\n${total} violations`);
process.exit(total ? 1 : 0);
