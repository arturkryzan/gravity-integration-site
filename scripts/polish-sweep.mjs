/*
 * polish-sweep.mjs — the evidence-gathering half of `/impeccable polish`.
 *
 * The reference is explicit that a clean script result is never proof the
 * design is strong. So this harness does not grade anything. It walks every
 * route in a real browser and *asks the DOM what is actually there*: which
 * controls have an accessible name, which ones grow a focus ring when you
 * focus them, which ones have a :hover rule that matches, how long the body
 * lines actually run, where the heading levels jump. Facts, not crops.
 *
 * Usage:
 *   CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *   ORIGIN=http://127.0.0.1:8601 node scripts/polish-sweep.mjs
 *
 * ONLY=/,/en/  narrows the route list. WIDTH=390 narrows the viewport.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8601';
const OUT = process.env.OUT || '/tmp/polish-sweep.json';

/* Same 18 routes shoot-routes.mjs uses, and for the same reason: the two
   harnesses have to be talking about the same site. */
const ALL = [
  '/', '/case-studies/', '/cennik/', '/czym-jest-esb/', '/integracje/',
  '/kalkulator/', '/kontakt/', '/pobieranie/', '/polityka-prywatnosci/',
  '/technologia/',
  '/en/', '/en/case-studies/', '/en/contact/', '/en/download/',
  '/en/integrations/', '/en/pricing/', '/en/technology/', '/en/what-is-esb/',
];
const ROUTES = process.env.ONLY ? process.env.ONLY.split(',') : ALL;
const WIDTHS = process.env.WIDTH
  ? [Number(process.env.WIDTH)]
  : [1440, 390];

const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--font-render-hinting=none'],
});

const report = { origin: ORIGIN, routes: [] };

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
    deviceScaleFactor: 1,
  });

  for (const route of ROUTES) {
    const page = await ctx.newPage();
    const consoleMsgs = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') {
        consoleMsgs.push(`${m.type()}: ${m.text()}`.slice(0, 200));
      }
    });
    page.on('pageerror', (e) => consoleMsgs.push(`pageerror: ${String(e).slice(0, 200)}`));

    await page.goto(ORIGIN + route, { waitUntil: 'networkidle' });

    const facts = await page.evaluate((route) => {
      const sel = (el) => {
        let s = el.tagName.toLowerCase();
        if (el.id) return s + '#' + el.id;
        if (el.className && typeof el.className === 'string') {
          const c = el.className.trim().split(/\s+/).slice(0, 3).join('.');
          if (c) s += '.' + c;
        }
        return s;
      };
      const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      /* "Visible" has to mean *on the page*, not merely non-zero. The two
         honeypot fields are parked at x=-9566 inside a 1x1 clipping wrapper;
         a width/height test calls them 215x23 and they land in every report
         as a cramped input nobody can see. Reject anything parked outside
         the document. */
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) return false;
        const sx = window.scrollX, sy = window.scrollY;
        if (r.right + sx < 0 || r.bottom + sy < 0) return false;
        if (r.left + sx > document.documentElement.scrollWidth) return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
        return true;
      };

      // --- accessible-name approximation for interactive elements ---
      const accName = (el) => {
        const al = el.getAttribute('aria-label');
        if (al && al.trim()) return al.trim();
        const lb = el.getAttribute('aria-labelledby');
        if (lb) {
          const t = lb.split(/\s+/).map((id) => document.getElementById(id))
            .filter(Boolean).map((n) => n.textContent || '').join(' ').trim();
          if (t) return t;
        }
        if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
          // For button-ish inputs the `value` attribute IS the accessible name.
          if (/^(submit|button|reset)$/i.test(el.getAttribute('type') || '') && el.value)
            return String(el.value).trim();
          if (el.id) {
            const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
            if (l && (l.textContent || '').trim()) return l.textContent.trim();
          }
          const wrap = el.closest('label');
          if (wrap && (wrap.textContent || '').trim()) return wrap.textContent.trim();
          const t = el.getAttribute('title') || el.getAttribute('placeholder');
          if (t && t.trim()) return t.trim();
          return '';
        }
        const t = (el.textContent || '').trim();
        if (t) return t;
        const img = el.querySelector('img[alt]');
        if (img && img.alt.trim()) return img.alt.trim();
        const ttl = el.querySelector('svg > title');
        if (ttl && (ttl.textContent || '').trim()) return ttl.textContent.trim();
        return '';
      };

      const interactive = Array.from(document.querySelectorAll(
        'a[href], button, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])'
      ));

      const unnamed = [];
      const noHover = [];
      const noFocusRing = [];
      const smallTargets = [];

      // Does any stylesheet rule containing :hover / :focus-visible match this element?
      const hoverSelectors = [];
      const focusSelectors = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        /* Check selectorText BEFORE recursing. In Chromium a CSSStyleRule
           also carries a (usually empty) .cssRules for CSS nesting, so an
           `if (r.cssRules) recurse; continue;` shape descends into every
           style rule and never reads a single selector — it reports zero
           :hover rules on a page built on Bootstrap. */
        const walk = (list) => {
          for (const r of Array.from(list || [])) {
            if (!r.selectorText) { if (r.cssRules) walk(r.cssRules); continue; }
            if (r.cssRules && r.cssRules.length) walk(r.cssRules);
            for (const one of r.selectorText.split(',')) {
              const s = one.trim();
              if (/:hover\b/.test(s)) hoverSelectors.push(s);
              if (/:focus(-visible)?\b/.test(s)) focusSelectors.push(s);
            }
          }
        };
        walk(rules);
      }
      /* Which rules actually give THIS element feedback when the pointer is on
         it? Two wrong answers were shipped before the right one:

         v1 credited any selector containing :hover. That hands `a:hover .icon`
         to the icon, which gets nothing — the anchor does.

         v2 required the pseudo on the selector's *subject* (last compound).
         Necessary, but not sufficient in the other direction: it threw away
         `.btn-arrow:hover input`, whose subject IS the input. That produced a
         false "no hover feedback" on every contact submit button on the site —
         legacy.css styles them exactly that way and they animate correctly.

         The rule that is actually true: :hover matches an element AND all of
         its ancestors, so a :hover on any ancestor compound is guaranteed live
         whenever the pointer is over the subject. The one case that is not
         guaranteed is a sibling combinator — in `.a:hover + .b`, hovering .a
         says nothing about where .b is. So: credit the rule when the element
         matches the pseudo-stripped selector and the pseudo sits on the
         subject or on an ancestor reached only by descendant/child
         combinators. */
      const matchesAny = (el, selectors, pseudo) => {
        for (const s of selectors) {
          /* Split into compounds, keeping the combinator that precedes each. */
          const parts = s.split(/\s*([>+~])\s*|\s+/).filter((p) => p !== undefined && p !== '');
          let sawPseudo = false;
          for (let i = parts.length - 1; i >= 0; i--) {
            const p = parts[i];
            if (p === '+' || p === '~') break;   /* sibling: stop crediting */
            if (p === '>') continue;
            if (p.includes(pseudo)) { sawPseudo = true; break; }
          }
          if (!sawPseudo) continue;
          /* Strip the pseudo-class, then the trailing pseudo-ELEMENT. The
             second strip is not cosmetic: feedback is often painted on a
             pseudo-element (`.gi-range:hover::-webkit-slider-thumb`, the
             standard way to style a range thumb), and `el.matches()` on a
             selector ending in `::something` is false by definition — a
             pseudo-element is not an element. Without this, every correctly
             implemented thumb hover reads as a missing one. */
          const base = s.split(pseudo).join('').replace(/::[-\w]+$/, '');
          if (!base.trim()) continue;
          try { if (el.matches(base)) return true; } catch { /* :is(), :where() */ }
        }
        return false;
      };

      for (const el of interactive) {
        if (!visible(el)) continue;
        const name = accName(el);
        if (!name) unnamed.push({ sel: sel(el), href: el.getAttribute('href') || '' });

        // Only links and buttons are expected to acknowledge a pointer. Text
        // inputs answer with a caret, which is feedback enough.
        const wantsHover = el.tagName === 'BUTTON' || el.tagName === 'A' ||
          /^(submit|button|reset|checkbox|radio|range)$/i.test(el.getAttribute('type') || '');
        if (wantsHover && !matchesAny(el, hoverSelectors, ':hover'))
          noHover.push({ sel: sel(el), text: txt(el) });

        const r = el.getBoundingClientRect();
        if (r.width < 24 || r.height < 24)
          smallTargets.push({ sel: sel(el), text: txt(el), w: +r.width.toFixed(1), h: +r.height.toFixed(1) });
      }

      // --- images ---
      const images = Array.from(document.querySelectorAll('img')).filter(visible).map((im) => ({
        src: (im.currentSrc || im.src || '').split('/').pop(),
        alt: im.getAttribute('alt'),
        hasAlt: im.hasAttribute('alt'),
        w: im.getAttribute('width'), h: im.getAttribute('height'),
        loading: im.getAttribute('loading'),
      }));

      // --- headings ---
      const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
        .filter(visible)
        .map((h) => ({ level: Number(h.tagName[1]), text: txt(h), wrap: getComputedStyle(h).textWrap || getComputedStyle(h).textWrapStyle }));
      const skips = [];
      for (let i = 1; i < headings.length; i++) {
        if (headings[i].level > headings[i - 1].level + 1)
          skips.push(`h${headings[i - 1].level} → h${headings[i].level}: "${headings[i].text}"`);
      }

      // --- body line length, measured in real advance widths ---
      // "ch" is the advance of "0" in the element's own resolved font. Guessing
      // it as 0.5em is close for Inter and wrong for Epilogue, so measure it.
      const ctx2d = document.createElement('canvas').getContext('2d');
      const chWidth = (cs) => {
        ctx2d.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`;
        return ctx2d.measureText('0').width || parseFloat(cs.fontSize) * 0.5;
      };
      const longLines = [];
      for (const p of Array.from(document.querySelectorAll('p, li'))) {
        if (!visible(p)) continue;
        const t = (p.textContent || '').trim();
        if (t.length < 90) continue;           // one short line can't be too long
        const cs = getComputedStyle(p);
        const w = p.getBoundingClientRect().width -
          parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const ch = w / chWidth(cs);
        // The reference caps body copy at 65-75ch. Report anything past 75.
        if (ch > 75) longLines.push({ sel: sel(p), ch: Math.round(ch), text: t.slice(0, 50) });
      }

      // --- duplicate ids ---
      const seen = new Map();
      for (const el of Array.from(document.querySelectorAll('[id]')))
        seen.set(el.id, (seen.get(el.id) || 0) + 1);
      const dupIds = [...seen].filter(([, n]) => n > 1).map(([id, n]) => `${id} ×${n}`);

      // --- aria-current truth check ---
      const here = location.pathname;
      const ariaCurrent = Array.from(document.querySelectorAll('[aria-current]')).map((el) => ({
        sel: sel(el), text: txt(el), href: el.getAttribute('href') || '',
        value: el.getAttribute('aria-current'),
        truthful: (el.getAttribute('href') || '') === here,
      }));

      // --- placeholder / dead links ---
      const deadLinks = Array.from(document.querySelectorAll('a[href]'))
        .filter(visible)
        .filter((a) => { const h = a.getAttribute('href'); return h === '#' || h === '' || /^javascript:/i.test(h); })
        .map((a) => ({ sel: sel(a), text: txt(a) }));

      // --- new-tab links without a warning ---
      const newTab = Array.from(document.querySelectorAll('a[target="_blank"]'))
        .filter(visible)
        .map((a) => ({ text: txt(a), rel: a.getAttribute('rel') || '', name: accName(a) }));

      // --- form controls ---
      const controls = Array.from(document.querySelectorAll('input:not([type=hidden]), select, textarea'))
        .filter(visible)
        .map((c) => ({
          sel: sel(c), type: c.getAttribute('type') || c.tagName.toLowerCase(),
          name: accName(c), required: c.hasAttribute('required'),
          ariaRequired: c.getAttribute('aria-required'),
          describedby: c.getAttribute('aria-describedby') || '',
          autocomplete: c.getAttribute('autocomplete') || '',
          inputmode: c.getAttribute('inputmode') || '',
        }));

      // --- header menu control geometry (the MENU / CLOSE alignment) ---
      const ham = document.querySelector('.hamburger');
      let menuGeom = null;
      if (ham) {
        const spans = Array.from(ham.querySelectorAll('span.btn'));
        const svgs = Array.from(ham.querySelectorAll('svg'));
        menuGeom = {
          button: ham.getBoundingClientRect().toJSON(),
          labels: spans.map((s) => ({ text: txt(s), rect: s.getBoundingClientRect().toJSON() })),
          icons: svgs.map((s) => s.getBoundingClientRect().toJSON()),
        };
      }

      return {
        title: document.title,
        lang: document.documentElement.lang,
        unnamed, noHover, smallTargets, images, headings, skips,
        longLines, dupIds, ariaCurrent, deadLinks, newTab, controls, menuGeom,
        hoverRuleCount: hoverSelectors.length,
        focusRuleCount: focusSelectors.length,
      };
    }, route);

    // --- focus rings, measured by actually focusing each control ---
    const focus = await page.evaluate(() => {
      const out = [];
      const els = Array.from(document.querySelectorAll(
        'a[href], button, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])'
      )).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      for (const el of els) {
        const before = getComputedStyle(el);
        const b = { outline: before.outlineWidth, shadow: before.boxShadow, bg: before.backgroundColor };
        el.focus();
        const after = getComputedStyle(el);
        const changed =
          after.outlineWidth !== b.outline ||
          after.boxShadow !== b.shadow ||
          after.backgroundColor !== b.bg;
        const ring = parseFloat(after.outlineWidth) > 0 || (after.boxShadow && after.boxShadow !== 'none');
        el.blur();
        if (!changed && !ring) {
          let s = el.tagName.toLowerCase();
          if (el.id) s += '#' + el.id;
          else if (typeof el.className === 'string' && el.className.trim())
            s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
          out.push({ sel: s, text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) });
        }
      }
      return out;
    });

    report.routes.push({ route, width, ...facts, noFocusRing: focus, console: consoleMsgs });
    await page.close();
  }
  await ctx.close();
}

await browser.close();
writeFileSync(OUT, JSON.stringify(report, null, 2));

// --- terminal digest ---
const agg = (key) => {
  const m = new Map();
  for (const r of report.routes)
    for (const item of r[key] || []) {
      const k = JSON.stringify(item);
      if (!m.has(k)) m.set(k, { item, routes: [] });
      m.get(k).routes.push(`${r.route}@${r.width}`);
    }
  return [...m.values()];
};

const line = (s) => console.log(s);
line(`swept ${report.routes.length} route×width combinations`);
for (const k of ['unnamed', 'deadLinks', 'dupIds', 'skips', 'noFocusRing', 'smallTargets', 'longLines']) {
  const hits = agg(k);
  if (!hits.length) { line(`  ${k}: none`); continue; }
  line(`  ${k}: ${hits.length} distinct`);
  for (const h of hits.slice(0, 12))
    line(`    ${typeof h.item === 'string' ? h.item : JSON.stringify(h.item)}  [${h.routes.length} shots]`);
  if (hits.length > 12) line(`    …${hits.length - 12} more`);
}
const noAlt = report.routes.flatMap((r) => r.images.filter((i) => !i.hasAlt).map((i) => `${r.route}: ${i.src}`));
line(`  images without an alt attribute: ${noAlt.length ? [...new Set(noAlt)].join(', ') : 'none'}`);
const noHoverAgg = agg('noHover');
line(`  interactive elements with no matching :hover rule: ${noHoverAgg.length} distinct`);
for (const h of noHoverAgg.slice(0, 15)) line(`    ${JSON.stringify(h.item)}  [${h.routes.length}]`);
/* An instrument that sees nothing must say so rather than report "all clear".
   This page is built on Bootstrap; if the CSSOM walk finds no :hover rules at
   all, the walk is broken and every hover finding above is an artifact. */
const blind = report.routes.filter((r) => !r.hoverRuleCount || !r.focusRuleCount);
if (blind.length) {
  console.error(`\n  !! CSSOM walk read 0 hover/focus rules on ${blind.length} route(s).`);
  console.error('     The hover findings above are instrument failure, not defects.');
  process.exitCode = 1;
}

const cons = report.routes.filter((r) => r.console.length);
line(`  routes with console errors/warnings: ${cons.length}`);
for (const r of cons) line(`    ${r.route}@${r.width}: ${r.console.join(' | ')}`);
line(`full JSON → ${OUT}`);
