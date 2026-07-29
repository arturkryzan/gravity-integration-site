/* The sweep reported TWO logo links with the same selector and different
 * accessible names — one named, one empty. Until that empty name is
 * explained it can be reported neither as fixed nor as open. Enumerate every
 * a.logo on every route at every viewport and say exactly which element each
 * one is, where it sits, and where its name does or does not come from. */
import { chromium } from 'playwright';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8414';
const ROUTES = [
  '/', '/czym-jest-esb/', '/technologia/', '/integracje/', '/cennik/',
  '/case-studies/', '/pobieranie/', '/kalkulator/', '/kontakt/', '/polityka-prywatnosci/',
  '/en/', '/en/what-is-esb/', '/en/technology/', '/en/integrations/',
  '/en/pricing/', '/en/case-studies/', '/en/download/', '/en/contact/',
];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'small', width: 320, height: 640 },
];

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
const tally = new Map();

for (const vp of VIEWPORTS) {
  for (const route of ROUTES) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(ORIGIN + route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(120);

    const found = await page.evaluate(() => {
      const path = (el) => {
        const parts = [];
        for (let n = el; n && n.tagName; n = n.parentElement) {
          let s = n.tagName.toLowerCase();
          if (n.className && typeof n.className === 'string')
            s += '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.');
          parts.unshift(s);
          if (parts.length >= 4) break;
        }
        return parts.join(' > ');
      };
      return [...document.querySelectorAll('a.logo')].map((a) => {
        const r = a.getBoundingClientRect();
        const cs = getComputedStyle(a);
        const svg = a.querySelector('svg');
        const img = a.querySelector('img');
        // Everything the accessible name could legitimately come from.
        return {
          ancestor: path(a),
          aria: a.getAttribute('aria-label'),
          ariaLabelledby: a.getAttribute('aria-labelledby'),
          title: a.getAttribute('title'),
          text: a.textContent.trim(),
          imgAlt: img ? img.getAttribute('alt') : null,
          svgRole: svg ? svg.getAttribute('role') : null,
          svgTitle: svg ? (svg.querySelector('title')?.textContent || null) : null,
          svgAriaHidden: svg ? svg.getAttribute('aria-hidden') : null,
          box: `${r.width.toFixed(1)}x${r.height.toFixed(1)}`,
          at: `${Math.round(r.x)},${Math.round(r.y)}`,
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          // "Visible" must mean on the page, not merely in the DOM.
          rendered: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden'
                    && cs.display !== 'none' && Number(cs.opacity) > 0.01
                    && r.right > 0 && r.bottom > 0,
          offscreenLeft: r.right <= 0,
        };
      });
    });

    for (const f of found) {
      const name = f.aria || f.ariaLabelledby || f.title || f.text || f.imgAlt || f.svgTitle || '';
      const key = JSON.stringify({
        ancestor: f.ancestor, name, rendered: f.rendered,
        svgRole: f.svgRole, svgAriaHidden: f.svgAriaHidden,
      });
      const t = tally.get(key) || { ...f, name, where: [], count: 0 };
      t.count++;
      if (t.where.length < 4) t.where.push(`${route}@${vp.name} ${f.box}`);
      tally.set(key, t);
    }
    await page.close();
  }
}

await browser.close();

console.log(`\n${tally.size} distinct a.logo shapes across ${ROUTES.length} routes x ${VIEWPORTS.length} viewports\n`);
for (const t of tally.values()) {
  console.log(`--- x${t.count}  name=${JSON.stringify(t.name)}  rendered=${t.rendered}`);
  console.log(`    ${t.ancestor}`);
  console.log(`    aria-label=${JSON.stringify(t.aria)} text=${JSON.stringify(t.text)} imgAlt=${JSON.stringify(t.imgAlt)}`);
  console.log(`    svg: role=${t.svgRole} aria-hidden=${t.svgAriaHidden} <title>=${JSON.stringify(t.svgTitle)}`);
  console.log(`    display=${t.display} visibility=${t.visibility} opacity=${t.opacity} offscreenLeft=${t.offscreenLeft}`);
  console.log(`    e.g. ${t.where.join(' | ')}`);
}
