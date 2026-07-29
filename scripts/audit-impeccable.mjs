/* Technical audit harness — accessibility, performance, responsive.
 *
 * This is the measuring instrument behind `/impeccable audit`. It walks every
 * built route in both locales and reports only what it can prove from the
 * rendered page: computed colours, real bounding boxes, actual focus styles,
 * actual network weight. Nothing here is a judgement call; the judgement
 * happens in the report, from these numbers.
 *
 * Deliberately *not* checked here:
 *   - contrast over background images or gradients. The compositing is real
 *     but the sampled colour underneath a photograph is not a number CSS can
 *     hand you, so those elements are counted and listed separately rather
 *     than pushed into the pass/fail column on a guess.
 *   - anything that needs a design opinion. That is the report's job.
 *
 * Run: CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *      ORIGIN=http://127.0.0.1:8501 node scripts/audit-impeccable.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8501';

const ROUTES = [
  '/', '/technologia/', '/czym-jest-esb/', '/integracje/', '/cennik/',
  '/kalkulator/', '/case-studies/', '/pobieranie/', '/kontakt/',
  '/polityka-prywatnosci/',
  '/en/', '/en/technology/', '/en/what-is-esb/', '/en/integrations/',
  '/en/pricing/', '/en/case-studies/', '/en/download/', '/en/contact/',
];

const VIEWPORTS = [
  ['desktop', 1440, 900],
  ['tablet', 768, 1024],
  ['phone', 390, 844],
  ['small', 320, 700],
];

const findings = [];
const add = (cat, route, vp, msg, detail) =>
  findings.push({ cat, route, vp, msg, detail });

const browser = await chromium.launch({ executablePath: process.env.CHROME });

/* ---------------------------------------------------------------- in-page --
   Everything below runs inside the browser. Kept as one big evaluate so the
   DOM is walked once per page rather than once per check. */
const PAGE_PROBE = () => {
  const out = {
    contrast: [], overImage: [], targets: [], headings: [], landmarks: {},
    images: [], forms: [], names: [], overflow: null, offenders: [],
    langs: {}, focusables: 0, divButtons: [], linkText: [],
  };

  /* --- colour maths, duplicated in-page because evaluate has no closure --- */
  const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = ([r, g, b]) =>
    0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const rgba = (s) => {
    const m = String(s).match(/-?\d*\.?\d+/g);
    if (!m) return null;
    return { c: m.slice(0, 3).map(Number), a: m.length > 3 ? Number(m[3]) : 1 };
  };
  /* src over dst */
  const over = (src, dst) =>
    src.c.map((v, i) => v * src.a + dst[i] * (1 - src.a));

  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
    if (cls.length) s += '.' + cls.slice(0, 2).join('.');
    return s;
  };

  /* The painted background behind an element: walk up compositing every
     translucent layer until something opaque stops us. Returns null when we
     run into an image or gradient, because then the colour under the text is
     a picture, not a value. */
  const backdrop = (el) => {
    let node = el;
    let acc = null; // accumulated translucent stack, top-first
    const stack = [];
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return { img: true };
      const bg = rgba(cs.backgroundColor);
      if (bg && bg.a > 0) {
        if (bg.a >= 0.999) {
          let base = bg.c;
          for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
          return { c: base };
        }
        stack.push(bg);
      }
      node = node.parentElement;
    }
    let base = [255, 255, 255];
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return { c: base };
  };

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  /* --- 1. contrast on every element that directly owns visible text ------- */
  const TEXTY = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'OPTION', 'TEMPLATE']);
  document.querySelectorAll('*').forEach((el) => {
    if (TEXTY.has(el.tagName)) return;
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
      .map((n) => n.textContent.trim())
      .join(' ');
    if (!own) return;
    if (!visible(el)) return;

    const cs = getComputedStyle(el);
    /* SVG <text> takes its ink from `fill`, not `color`. Reading `color` here
       inherits whatever the surrounding CSS set and reports a ratio for a
       colour that is never painted — ten false failures on the hero scene
       before this was caught. */
    const ink = el.namespaceURI === 'http://www.w3.org/2000/svg' ? cs.fill : cs.color;
    const fg = rgba(ink);
    if (!fg) return;
    const bd = backdrop(el);
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;

    if (bd.img) {
      out.overImage.push({ sel: sel(el), text: own.slice(0, 50), size, color: ink });
      return;
    }
    const composited = fg.a >= 0.999 ? fg.c : over(fg, bd.c);
    const r = ratio(composited, bd.c);
    if (r < need) {
      out.contrast.push({
        sel: sel(el), text: own.slice(0, 60), ratio: +r.toFixed(2), need,
        size: +size.toFixed(1), weight, color: ink,
        bg: `rgb(${bd.c.map((v) => Math.round(v)).join(' ')})`,
      });
    }
  });

  /* --- 2. focus visibility and touch targets ----------------------------- */
  const FOCUSABLE = 'a[href], button, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const focusables = [...document.querySelectorAll(FOCUSABLE)].filter(visible);
  out.focusables = focusables.length;

  focusables.forEach((el) => {
    const r = el.getBoundingClientRect();
    /* Inline links inside a paragraph are exempt: their target is the line of
       text, and WCAG 2.5.8 says so explicitly. Everything standalone is not. */
    const inlineInProse = el.tagName === 'A' &&
      getComputedStyle(el).display === 'inline' &&
      el.parentElement && /^(P|LI|SPAN|DD|DT|TD|SMALL|EM|STRONG)$/.test(el.parentElement.tagName);
    if (inlineInProse) return;
    if (Math.min(r.width, r.height) < 24) {
      out.targets.push({ sel: sel(el), w: +r.width.toFixed(1), h: +r.height.toFixed(1), text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30), tier: 'aa' });
    } else if (Math.min(r.width, r.height) < 44) {
      out.targets.push({ sel: sel(el), w: +r.width.toFixed(1), h: +r.height.toFixed(1), text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30), tier: 'aaa' });
    }
  });

  /* accessible name, roughly: text, aria-label, aria-labelledby, title, alt */
  const accName = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
      if (t) return t;
    }
    const txt = (el.textContent || '').trim();
    if (txt) return txt;
    const img = el.querySelector('img[alt]');
    if (img && img.alt.trim()) return img.alt.trim();
    const t = el.getAttribute('title');
    if (t && t.trim()) return t.trim();
    if (el.tagName === 'INPUT' && el.value && /submit|button/i.test(el.type)) return el.value;
    return '';
  };

  focusables.forEach((el) => {
    if (!/^(A|BUTTON)$/.test(el.tagName)) return;
    if (!accName(el)) out.names.push({ sel: sel(el), html: el.outerHTML.slice(0, 110) });
  });

  /* generic link text */
  document.querySelectorAll('a[href]').forEach((a) => {
    const t = (a.textContent || '').trim().toLowerCase();
    if (/^(click here|here|read more|więcej|czytaj więcej|learn more|more)$/.test(t)) {
      out.linkText.push({ sel: sel(a), text: t, href: a.getAttribute('href') });
    }
  });

  /* clickable divs */
  document.querySelectorAll('div[onclick], span[onclick], div[role=button]:not([tabindex])').forEach((el) => {
    out.divButtons.push({ sel: sel(el) });
  });

  /* --- 3. structure ------------------------------------------------------ */
  out.headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .filter(visible)
    .map((h) => ({ level: +h.tagName[1], text: h.textContent.trim().slice(0, 60) }));
  out.landmarks = {
    main: document.querySelectorAll('main').length,
    nav: document.querySelectorAll('nav').length,
    header: document.querySelectorAll('header').length,
    footer: document.querySelectorAll('footer').length,
    skipLink: !!document.querySelector('a[href^="#"][class*=skip], .skip-link, a[href="#main"], a[href="#content"]'),
    h1: document.querySelectorAll('h1').length,
  };
  out.langs = {
    html: document.documentElement.lang,
    hreflang: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map((l) => l.hreflang),
    title: document.title,
    metaDesc: document.querySelector('meta[name=description]')?.content?.length || 0,
  };

  /* --- 4. images --------------------------------------------------------- */
  document.querySelectorAll('img').forEach((img) => {
    const r = img.getBoundingClientRect();
    out.images.push({
      src: (img.currentSrc || img.src || '').split('/').pop().slice(0, 50),
      alt: img.getAttribute('alt'),
      hasDims: img.hasAttribute('width') && img.hasAttribute('height'),
      loading: img.getAttribute('loading'),
      decoding: img.getAttribute('decoding'),
      natural: [img.naturalWidth, img.naturalHeight],
      shown: [Math.round(r.width), Math.round(r.height)],
      offscreen: r.top > window.innerHeight,
      visible: r.width > 0 && r.height > 0,
    });
  });

  /* --- 5. forms ---------------------------------------------------------- */
  document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach((f) => {
    const id = f.id;
    const labelled = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
      f.closest('label') || f.getAttribute('aria-label') || f.getAttribute('aria-labelledby');
    const ph = f.getAttribute('placeholder');
    let phRatio = null;
    if (ph) {
      /* placeholder colour is only reachable through ::placeholder */
      const pc = getComputedStyle(f, '::placeholder').color;
      const c = rgba(pc);
      const bd = backdrop(f);
      if (c && !bd.img) {
        const comp = c.a >= 0.999 ? c.c : over(c, bd.c);
        phRatio = +ratio(comp, bd.c).toFixed(2);
      }
    }
    out.forms.push({
      sel: sel(f), type: f.type || f.tagName.toLowerCase(),
      labelled: !!labelled, placeholder: ph || null, phRatio,
      required: f.hasAttribute('required'),
      ariaRequired: f.getAttribute('aria-required'),
      autocomplete: f.getAttribute('autocomplete'),
      name: f.getAttribute('name'),
    });
  });

  /* --- 6. overflow ------------------------------------------------------- */
  const de = document.documentElement;
  out.overflow = de.scrollWidth - de.clientWidth;
  if (out.overflow > 1) {
    const seen = new Set();
    document.querySelectorAll('*').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.right > de.clientWidth + 2 && b.width > 8 && b.left >= -2) {
        const s = sel(el);
        if (!seen.has(s)) { seen.add(s); out.offenders.push({ sel: s, right: Math.round(b.right) }); }
      }
    });
    out.offenders = out.offenders.slice(0, 8);
  }

  return out;
};

/* ------------------------------------------------------------------ sweep -- */
const perRoute = {};

for (const route of ROUTES) {
  perRoute[route] = {};
  for (const [vp, width, height] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    const errors = [];
    const requests = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
    page.on('response', async (r) => {
      try {
        const h = r.headers();
        requests.push({
          url: r.url(), status: r.status(), type: h['content-type'] || '',
          bytes: Number(h['content-length'] || 0),
        });
      } catch { /* redirects can vanish */ }
    });

    await page.goto(ORIGIN + route, { waitUntil: 'load' });
    await page.waitForTimeout(400);

    const probe = await page.evaluate(PAGE_PROBE);

    /* focus-visible has to be exercised, not read: apply focus to each
       control and see whether the computed outline or shadow actually
       changes. A theme that sets `outline: none` and forgets the
       replacement is invisible to static reading. */
    let focusMissing = [];
    if (vp === 'desktop') {
      focusMissing = await page.evaluate(() => {
        const out = [];
        const sel = (el) => {
          let s = el.tagName.toLowerCase();
          if (el.id) return s + '#' + el.id;
          const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
          return c.length ? s + '.' + c.slice(0, 2).join('.') : s;
        };
        const els = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea')]
          .filter((el) => {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
          });
        const snap = (el) => {
          const cs = getComputedStyle(el);
          return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.border, cs.backgroundColor, cs.textDecorationLine].join('|');
        };
        const seen = new Set();
        for (const el of els) {
          const key = sel(el);
          if (seen.has(key)) continue;
          seen.add(key);
          const before = snap(el);
          el.focus({ preventScroll: true });
          const after = snap(el);
          el.blur();
          if (before === after) out.push({ sel: key, text: (el.textContent || '').trim().slice(0, 30) });
        }
        return out;
      });
    }

    perRoute[route][vp] = { probe, errors, requests, focusMissing };
    await ctx.close();
  }
}

await browser.close();

/* --------------------------------------------------------------- roll-up -- */
const report = { origin: ORIGIN, routes: perRoute };
writeFileSync('/tmp/audit-raw.json', JSON.stringify(report, null, 1));

const uniq = new Map();
const bump = (key, route, vp, extra) => {
  if (!uniq.has(key)) uniq.set(key, { key, routes: new Set(), vps: new Set(), extra });
  uniq.get(key).routes.add(route);
  uniq.get(key).vps.add(vp);
};

for (const [route, byVp] of Object.entries(perRoute)) {
  for (const [vp, d] of Object.entries(byVp)) {
    const p = d.probe;
    p.contrast.forEach((c) =>
      bump(`CONTRAST ${c.sel} ${c.ratio}:1 (needs ${c.need}) ${c.color} on ${c.bg} — "${c.text}"`, route, vp));
    p.targets.forEach((t) =>
      bump(`TARGET[${t.tier}] ${t.sel} ${t.w}×${t.h} — "${t.text}"`, route, vp));
    p.names.forEach((n) => bump(`NONAME ${n.sel} ${n.html}`, route, vp));
    p.linkText.forEach((l) => bump(`VAGUELINK ${l.sel} "${l.text}"`, route, vp));
    p.divButtons.forEach((b) => bump(`DIVBUTTON ${b.sel}`, route, vp));
    if (p.overflow > 1) bump(`OVERFLOW ${p.overflow}px → ${p.offenders.map((o) => o.sel).join(', ')}`, route, vp);
    if (p.landmarks.h1 !== 1) bump(`H1COUNT ${p.landmarks.h1}`, route, vp);
    if (!p.landmarks.main) bump('NOMAIN', route, vp);
    if (!p.landmarks.skipLink) bump('NOSKIPLINK', route, vp);
    /* heading order */
    let prev = 0;
    p.headings.forEach((h) => {
      if (prev && h.level > prev + 1) bump(`HEADINGSKIP h${prev}→h${h.level} "${h.text}"`, route, vp);
      prev = h.level;
    });
    p.forms.forEach((f) => {
      if (!f.labelled) bump(`NOLABEL ${f.sel} type=${f.type} name=${f.name} placeholder=${JSON.stringify(f.placeholder)}`, route, vp);
      if (f.phRatio !== null && f.phRatio < 4.5) bump(`PLACEHOLDER ${f.sel} ${f.phRatio}:1`, route, vp);
      if (!f.autocomplete && /email|text|tel/.test(f.type)) bump(`NOAUTOCOMPLETE ${f.sel} name=${f.name}`, route, vp);
    });
    p.images.forEach((im) => {
      if (im.alt === null) bump(`NOALT ${im.src}`, route, vp);
      if (!im.hasDims && im.visible) bump(`NODIMS ${im.src}`, route, vp);
      if (im.offscreen && im.loading !== 'lazy') bump(`NOLAZY ${im.src}`, route, vp);
      if (im.visible && im.natural[0] > im.shown[0] * 2.2 && im.shown[0] > 0)
        bump(`OVERSIZED ${im.src} natural ${im.natural.join('×')} shown ${im.shown.join('×')}`, route, vp);
    });
    d.errors.forEach((e) => bump(`JSERROR ${e}`, route, vp));
    d.focusMissing.forEach((f) => bump(`NOFOCUSRING ${f.sel} "${f.text}"`, route, vp));
    p.overImage.forEach((o) => bump(`OVERIMAGE ${o.sel} ${o.color} "${o.text}"`, route, vp));
  }
}

/* page weight, desktop only, from the first (uncached) load */
const weights = Object.entries(perRoute).map(([route, byVp]) => {
  const reqs = byVp.desktop.requests;
  const total = reqs.reduce((s, r) => s + r.bytes, 0);
  const by = {};
  reqs.forEach((r) => {
    const k = /javascript/.test(r.type) ? 'js' : /css/.test(r.type) ? 'css'
      : /font/.test(r.type) ? 'font' : /image|svg/.test(r.type) ? 'img'
      : /html/.test(r.type) ? 'html' : 'other';
    by[k] = (by[k] || 0) + r.bytes;
  });
  const bad = reqs.filter((r) => r.status >= 400);
  return { route, n: reqs.length, total, by, bad: bad.map((b) => `${b.status} ${b.url}`) };
});

const groups = {};
for (const v of uniq.values()) {
  const kind = v.key.split(' ')[0];
  (groups[kind] ||= []).push(v);
}

const fmt = (n) => (n > 1024 * 1024 ? (n / 1048576).toFixed(2) + ' MB' : (n / 1024).toFixed(0) + ' kB');

console.log('=== PAGE WEIGHT (desktop, cold) ===');
weights.sort((a, b) => b.total - a.total).forEach((w) => {
  console.log(`  ${w.route.padEnd(24)} ${fmt(w.total).padStart(9)}  ${w.n} req  ` +
    Object.entries(w.by).map(([k, v]) => `${k} ${fmt(v)}`).join('  '));
  w.bad.forEach((b) => console.log(`      !! ${b}`));
});

console.log('\n=== FINDINGS ===');
const ORDER = ['JSERROR', 'CONTRAST', 'PLACEHOLDER', 'NOLABEL', 'NONAME', 'NOALT', 'NOFOCUSRING',
  'OVERFLOW', 'TARGET[aa]', 'TARGET[aaa]', 'HEADINGSKIP', 'H1COUNT', 'NOMAIN', 'NOSKIPLINK',
  'DIVBUTTON', 'VAGUELINK', 'NOAUTOCOMPLETE', 'NODIMS', 'NOLAZY', 'OVERSIZED', 'OVERIMAGE'];
const keys = [...new Set([...ORDER, ...Object.keys(groups)])].filter((k) => groups[k]);
for (const k of keys) {
  const list = groups[k];
  console.log(`\n-- ${k} (${list.length} distinct)`);
  list.slice(0, 40).forEach((v) => {
    const r = [...v.routes];
    const where = r.length === ROUTES.length ? 'every route'
      : r.length > 6 ? `${r.length} routes` : r.join(' ');
    const vps = [...v.vps];
    const at = vps.length === VIEWPORTS.length ? '' : ` @${vps.join(',')}`;
    console.log(`   ${v.key}\n      ↳ ${where}${at}`);
  });
  if (list.length > 40) console.log(`   … and ${list.length - 40} more (see /tmp/audit-raw.json)`);
}
console.log('\nraw → /tmp/audit-raw.json');
