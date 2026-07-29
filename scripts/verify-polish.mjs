/**
 * verify-polish.mjs — checks the polish pass by *querying the DOM*, not by
 * looking at pixels.
 *
 * Why this exists: diff-shots.mjs runs pixelmatch at threshold 0.1, which in
 * its YIQ metric corresponds to a delta of ~3521. Two of this pass's changes
 * score 73 and 14 on that scale — the muted-slate unification is a uniform
 * -12 on every channel, and the ink unification is -6/-5/-4. The pixel diff
 * reporting "no change" for /cennik/ is therefore NOT evidence that those
 * edits landed; it is the instrument being blind by design. Everything the
 * pixel diff cannot see has to be asserted here instead.
 *
 * Run: CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *      node scripts/verify-polish.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8601';
const CHROME = process.env.CHROME;

let fails = 0;
const ok = (label, got, want) => {
  const pass = got === want;
  if (!pass) fails++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}  got=${got}${pass ? '' : `  want=${want}`}`);
};
const info = (label, v) => console.log(`  ..    ${label}  ${v}`);

const browser = await chromium.launch({ executablePath: CHROME });

/* ------------------------------------------------------------------ colours */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${ORIGIN}/cennik/`, { waitUntil: 'networkidle' });

  console.log('\n/cennik/ — colours the pixel diff is blind to');

  const unit = await page.evaluate(() => {
    const el = document.querySelector('.price-item-value span:last-of-type');
    return el ? getComputedStyle(el).color : null;
  });
  ok('currency unit = --gi-text-muted-slate (#5f6178)', unit, 'rgb(95, 97, 120)');

  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const names = [
      '--gi-text-on-light',
      '--gi-text-muted-slate',
      '--gi-bg-tint',
      '--gi-line',
      '--gi-measure',
    ];
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n).trim()]));
  });
  ok('--gi-text-on-light unified', tokens['--gi-text-on-light'], '#14152a');
  ok('--gi-text-muted-slate declared', tokens['--gi-text-muted-slate'], '#5f6178');
  ok('--gi-bg-tint declared', tokens['--gi-bg-tint'], '#f3f4fb');
  ok('--gi-line declared', tokens['--gi-line'], '#e4e5ef');
  ok('--gi-measure declared', tokens['--gi-measure'], '68ch');

  /* The reserved namespace must not be redeclared anywhere below :root —
     with one carve-out that is the system working rather than drifting.

     There is a real difference between a component *rebinding* a system token
     to its correct value for the surface it is on, and a component *claiming*
     a system name to mean something private. RoiCalculator did the second: it
     declared --gi-border, --gi-card, --gi-dark inside an is:global block, so
     the names meant one thing globally and another inside that component.
     site.css does the first: --gi-focus-ink and --gi-focus-halo are declared
     on :root and rebound on .bg-green / .bg-light, because a green focus ring
     is invisible on the brand green and measures 1.44:1 on the light panel.
     Same role, corrected value, and any new component that lands on a light
     section inherits the right ring for free. That is what a contextual token
     is for, so it is allow-listed *by name* — anything else still fails. */
  const CONTEXTUAL = new Set(['--gi-focus-ink', '--gi-focus-halo']);
  const shadowed = await page.evaluate((allowed) => {
    const out = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      const walk = (list) => {
        for (const r of list) {
          if (r.selectorText !== undefined) {
            if (r.selectorText === ':root') continue;
            const t = r.style.cssText || '';
            for (const m of t.matchAll(/(--gi-[a-z0-9-]+)\s*:/g))
              if (!allowed.includes(m[1])) out.push(`${r.selectorText} { ${m[1]} }`);
            continue;
          }
          if (r.cssRules) walk(r.cssRules);
        }
      };
      walk(rules);
    }
    return out;
  }, [...CONTEXTUAL]);
  ok('no --gi-* redeclared outside :root (bar the two contextual focus tokens)',
    shadowed.length ? shadowed.join(' | ') : '0', '0');

  await page.close();
}

/* ------------------------------------------------------------------ measure */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  /* A real ch: the advance width of "0" in the element's own computed font.
     Dividing px by an assumed 8 is how the earlier measurement was wrong.

     Two more things this has to get right, both learned by being wrong first:

     1. Measure is a property of the RETURN SWEEP — the eye travelling back to
        find the start of the next line and landing on the wrong one. A block
        that renders on a single line has no next line, so it cannot have a
        measure defect however wide its box is. The hero's customer-names line
        boxes at 88ch and sets in one 12.8px line; "fixing" it would put a hard
        wrap in the middle of a list of client names to satisfy a number. Lines
        are counted from a Range's client rects — one rect per line box, which
        is the layout engine's own answer rather than height ÷ line-height.

     2. There is no allow-list. The two blocks previously written off as
        deliberate exceptions turned out to be defects — two frozen pixel
        widths and one `ch` cap resolving against the wrapper's font instead of
        the text's (see the note in site.css). Every multi-line block is now
        under the cap, so this asserts zero and a future exception has to argue
        for itself rather than inheriting a pass. */
  const measure = async (url) => {
    await page.goto(`${ORIGIN}${url}`, { waitUntil: 'networkidle' });
    return page.evaluate(() => {
      const cvs = document.createElement('canvas');
      const ctx = cvs.getContext('2d');
      const out = [];
      const seen = new Set();
      for (const el of document.querySelectorAll('p, li, blockquote')) {
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 4) continue;
        const txt = (el.textContent || '').trim();
        if (txt.length < 60) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (r.left < -1000) continue; /* off-screen honeypots and the like */
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const ch = ctx.measureText('0').width;
        if (!ch) continue;
        /* content box, not border box */
        const inner =
          r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) -
          parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
        const chars = Math.round(inner / ch);
        if (chars <= 75) continue;
        const rng = document.createRange();
        rng.selectNodeContents(el);
        const lines = new Set(
          [...rng.getClientRects()].filter((q) => q.height > 0).map((q) => Math.round(q.top))
        ).size;
        if (lines < 2) continue; /* no return sweep, no measure defect */
        const key = el.className + '|' + chars;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ chars, lines, cls: el.id || el.className || el.tagName, txt: txt.slice(0, 48) });
      }
      return out.sort((a, b) => b.chars - a.chars);
    });
  };

  console.log('\nmeasure — prose wider than 75ch at 1440 (desktop is the only width that could be)');
  const routes = [
    '/', '/kontakt/', '/technologia/', '/czym-jest-esb/', '/case-studies/',
    '/integracje/', '/cennik/', '/pobieranie/', '/kalkulator/',
    '/en/', '/en/what-is-esb/', '/en/case-studies/',
  ];
  let over = 0;
  for (const r of routes) {
    const hits = await measure(r);
    over += hits.length;
    for (const h of hits) info(`${r}  ${h.chars}ch × ${h.lines} lines  .${h.cls}`, `"${h.txt}…"`);
  }
  ok('prose over 75ch', String(over), '0');

  /* The CaseStudies local override, in resolved pixels. */
  await page.goto(`${ORIGIN}/case-studies/`, { waitUntil: 'networkidle' });
  const cs = await page.evaluate(() => {
    const el = document.querySelector('.cs');
    if (!el) return null;
    const v = getComputedStyle(el).getPropertyValue('--measure').trim();
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;visibility:hidden;width:${v}`;
    el.appendChild(probe);
    const px = probe.getBoundingClientRect().width;
    probe.remove();
    return { v, px: Math.round(px * 10) / 10 };
  });
  info('.cs --measure', `${cs.v} = ${cs.px}px (was 39rem = 624px)`);

  await page.close();
}

/* ------------------------------------------------- header control alignment */
{
  console.log('\nheader control — ring must not move when the label changes');
  for (const [name, width] of [['desk', 1440], ['tab', 900], ['mob', 390]]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' });

    const read = async () =>
      page.evaluate(() => {
        const btn = document.querySelector('.hamburger');
        const spans = btn.querySelectorAll('span');
        const svgs = btn.querySelectorAll('svg');
        const box = (el) => {
          const r = el.getBoundingClientRect();
          return { l: +r.left.toFixed(2), r: +r.right.toFixed(2), w: +r.width.toFixed(2) };
        };
        const visible = (el) => +getComputedStyle(el).opacity > 0.5;
        const openIdx = visible(spans[1]) ? 1 : 0;
        return {
          label: spans[openIdx].textContent.trim(),
          labelBox: box(spans[openIdx]),
          ringBox: box(svgs[visible(svgs[1]) ? 1 : 0]),
        };
      });

    const closed = await read();
    /* Hover the closed state — the theme's letter-spacing flourish is what
       used to eat the gap. */
    await page.hover('.hamburger');
    await page.waitForTimeout(400);
    const closedHover = await read();

    await page.click('.hamburger');
    await page.waitForTimeout(700);
    const open = await read();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(400);
    await page.hover('.hamburger');
    await page.waitForTimeout(400);
    const openHover = await read();

    const gap = (s) => +(s.ringBox.l - s.labelBox.r).toFixed(2);
    const states = { closed, closedHover, open, openHover };
    for (const [k, s] of Object.entries(states)) {
      info(`${name} ${k}`, `label="${s.label}" labelRight=${s.labelBox.r} ringLeft=${s.ringBox.l} gap=${gap(s)}px`);
    }
    const rings = Object.values(states).map((s) => s.ringBox.l);
    ok(`${name}: ring left edge identical in all four states`, [...new Set(rings)].join(','), String(rings[0]));
    const gaps = Object.values(states).map(gap);
    ok(`${name}: label→ring gap identical in all four states`, [...new Set(gaps)].join(','), String(gaps[0]));
    ok(`${name}: open label is ZAMKNIJ`, open.label, 'ZAMKNIJ');

    await page.close();
  }
}

/* ------------------------------------------------------- slider hover state */
{
  console.log('\nROI sliders — pointer feedback');
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${ORIGIN}/kalkulator/`, { waitUntil: 'networkidle' });
  const hoverRule = await page.evaluate(() => {
    const out = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      const walk = (list) => {
        for (const r of list) {
          if (r.selectorText !== undefined) {
            if (/\.gi-range:hover::/.test(r.selectorText)) out.push(r.selectorText);
            continue;
          }
          if (r.cssRules) walk(r.cssRules);
        }
      };
      walk(rules);
    }
    return out;
  });
  /* One, not two — and that is the correct expectation. The CSSOM is the
     engine's *parsed* view of the stylesheet, not its text: Chromium does not
     know ::-moz-range-thumb, so it drops that rule on parse and it is simply
     absent here. Asserting 2 was the harness asking a Chromium DOM to confirm
     a Firefox rule, which it can never do. The engine-specific half is checked
     against the built CSS text below, where it is a fact rather than a
     rendering. Same lesson as the pixel diff, one layer up: know what the
     instrument is able to see before you read its silence as an answer. */
  ok('a :hover rule exists for the range thumb (Chromium half)', String(hoverRule.length), '1');
  ok('…and it is the webkit one', hoverRule[0] || '', '.gi-range:hover::-webkit-slider-thumb');

  /* The Firefox half, read from the shipped CSS text — the only place a rule
     this browser refuses to parse can be observed at all. */
  const css = (await Promise.all(
    (await fs.readdir('dist/_assets'))
      .filter((f) => f.endsWith('.css'))
      .map((f) => fs.readFile(`dist/_assets/${f}`, 'utf8'))
  )).join('\n');
  ok('the -moz half ships in the built CSS',
    String(css.includes('.gi-range:hover::-moz-range-thumb')), 'true');

  /* And the submit button: the sweep flagged it, but legacy.css styles it via
     an ancestor-hover selector whose subject IS the input. Prove it renders. */
  await page.goto(`${ORIGIN}/kontakt/`, { waitUntil: 'networkidle' });
  const before = await page.evaluate(() => getComputedStyle(document.querySelector('input.wpcf7-submit')).color);
  await page.hover('input.wpcf7-submit');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => getComputedStyle(document.querySelector('input.wpcf7-submit')).color);
  info('submit colour closed→hover', `${before} → ${after}`);
  ok('submit DOES change on hover (ancestor-hover selector, subject = input)', String(before !== after), 'true');
  await page.close();
}

await browser.close();
console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : `${fails} CHECK(S) FAILED`}`);
process.exit(fails === 0 ? 0 : 1);
