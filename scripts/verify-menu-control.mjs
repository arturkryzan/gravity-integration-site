/* The header's menu control swaps both halves when the menu opens — MENU plus
 * the ringed logo mark becomes CLOSE plus a ringed ×. Two states drawn on top
 * of each other is a lockup that only works if it doesn't move, and "doesn't
 * move" is a claim about geometry, so this measures rather than eyeballs.
 *
 * Three things have to hold, in all four states the control can be in (closed
 * and open, each hovered and not), because the theme's letter-spacing flourish
 * fires on hover and changes the label's width:
 *
 *   1. The two rings occupy the same box. They already did — the icon is
 *      anchored `right: 0` — and this is the regression guard.
 *   2. The two labels end on the same edge, so the gap between the word and
 *      the ring is constant. They did NOT: the theme anchored the second label
 *      `left: 0`, so the wider CLOSE grew into the gap and the word slid ~5px
 *      right on every open. That is the fix in src/styles/site.css.
 *   3. The open-state control is legible against the panel behind it. On
 *      phones the theme painted it #464861 for a white menu that no longer
 *      exists; ours is dark slate, which made it 1.8:1.
 *   4. The scrollbar gutter stays reserved. Opening the menu sets
 *      `overflow: hidden`; where scrollbars take up space, that widens the
 *      layout viewport by ~15px and throws the whole right-anchored header
 *      sideways — a jump three times bigger than the one in (2). This one
 *      cannot be reproduced here: headless Chromium on Linux has zero-width
 *      scrollbars whatever flags you pass it, so the harness checks the cause
 *      (the gutter rule computes) and the risk the fix introduces (a reserved
 *      gutter plus a 100vw child would overflow sideways). The jump itself was
 *      verified by hand in Chrome on the live site.
 *
 * Run: CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *      ORIGIN=http://127.0.0.1:8412 node scripts/verify-menu-control.mjs
 */
import { chromium } from 'playwright';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8412';
const problems = [];
const note = (m) => problems.push(m);

/* Half a CSS pixel: below what anyone can see, above the sub-pixel noise that
   fractional flex widths leave behind. */
const EPS = 0.5;

const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) =>
  0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const parseRgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

const browser = await chromium.launch({ executablePath: process.env.CHROME });

for (const [width, label] of [
  [1440, 'desktop'],
  [768, 'tablet'],
  [390, 'phone'],
]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' });

  const icon = await page.evaluate(() => {
    const r = document.querySelector('.hamburger svg').getBoundingClientRect();
    return { x: r.x, y: r.y };
  });

  const probe = () =>
    page.evaluate(() => {
      const btn = document.querySelector('.hamburger');
      const [s1, s2] = btn.querySelectorAll('span');
      const [g1, g2] = btn.querySelectorAll('svg');
      const r = (el) => {
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right };
      };
      return { s1: r(s1), s2: r(s2), g1: r(g1), g2: r(g2) };
    });

  const away = async () => {
    await page.mouse.move(5, 600);
    await page.waitForTimeout(500);
  };
  const over = async () => {
    await page.mouse.move(icon.x + 20, icon.y + 20);
    await page.waitForTimeout(500);
  };

  const states = {};
  await away();
  states.closed = await probe();
  await over();
  states['closed+hover'] = await probe();
  await page.mouse.click(icon.x + 20, icon.y + 20);
  await page.waitForTimeout(800);
  states['open+hover'] = await probe();
  await away();
  states.open = await probe();

  for (const [name, m] of Object.entries(states)) {
    /* 1 — the rings */
    const dx = Math.abs(m.g2.x - m.g1.x);
    const dy = Math.abs(m.g2.y - m.g1.y);
    if (dx > EPS || dy > EPS) {
      note(`${label} ${name}: the two ring boxes are ${dx.toFixed(2)},${dy.toFixed(2)} apart`);
    }
    /* 2 — the labels */
    const de = Math.abs(m.s2.right - m.s1.right);
    if (de > EPS) {
      note(
        `${label} ${name}: the labels end ${de.toFixed(2)}px apart ` +
          `(MENU at ${m.s1.right.toFixed(1)}, CLOSE at ${m.s2.right.toFixed(1)}) — ` +
          `the word moves when the menu opens`,
      );
    }
    const dv = Math.abs(m.s2.y - m.s1.y);
    if (dv > EPS) note(`${label} ${name}: the labels sit ${dv.toFixed(2)}px apart vertically`);
  }

  /* The gap itself, reported so a future change that moves both halves
     together still shows up in the log rather than passing silently. */
  const gap = states.closed.g1.x - states.closed.s1.right;
  const gapOpen = states.open.g1.x - states.open.s2.right;
  console.log(
    `  ok  ${label}: rings coincident, labels flush — gap ${gap.toFixed(1)}px closed, ` +
      `${gapOpen.toFixed(1)}px open`,
  );

  /* 4 — the gutter. `scrollbar-gutter: stable` is what keeps the viewport the
     same width when the open menu removes the scrollbar. Reserving it is only
     safe while nothing on the page is sized in viewport units, so check for a
     sideways overflow at the same time. */
  const doc = await page.evaluate(() => ({
    gutter: getComputedStyle(document.documentElement).scrollbarGutter,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  if (!/stable/.test(doc.gutter)) {
    note(`${label}: the root's scrollbar-gutter is "${doc.gutter}" — the header will jump on open`);
  }
  if (/stable/.test(doc.gutter) && doc.scrollW <= doc.clientW + EPS) {
    console.log(`  ok  ${label}: scrollbar gutter reserved, nothing overflows sideways`);
  }
  if (doc.scrollW > doc.clientW + EPS) {
    note(
      `${label}: the page overflows sideways by ${(doc.scrollW - doc.clientW).toFixed(1)}px ` +
        `— something is sized in viewport units and the reserved gutter no longer fits`,
    );
  }

  /* 3 — is the open control actually visible? The menu panel is what sits
     behind it once it opens. */
  const ink = await page.evaluate(() => {
    const svg2 = document.querySelectorAll('.hamburger svg')[1];
    const [, s2] = document.querySelectorAll('.hamburger span');
    const panel = document.querySelector('.nav-main .col-pull .overlay') ||
      document.querySelector('.nav-main');
    return {
      stroke: getComputedStyle(svg2.querySelector('circle')).stroke,
      word: getComputedStyle(s2).color,
      behind: getComputedStyle(panel).backgroundColor,
    };
  });
  const cRing = contrast(parseRgb(ink.stroke), parseRgb(ink.behind));
  const cWord = contrast(parseRgb(ink.word), parseRgb(ink.behind));
  /* 3:1 is the non-text / large-text floor; the ring is a 1px UI stroke and
     the word is 10px tracked caps, so both are held to it. */
  if (cRing < 3) note(`${label}: the × ring is ${cRing.toFixed(2)}:1 on the open menu`);
  if (cWord < 3) note(`${label}: the word CLOSE is ${cWord.toFixed(2)}:1 on the open menu`);
  if (cRing >= 3 && cWord >= 3) {
    console.log(
      `  ok  ${label}: open control reads ${cRing.toFixed(1)}:1 (ring), ` +
        `${cWord.toFixed(1)}:1 (label)`,
    );
  }

  await ctx.close();
}

await browser.close();

console.log(
  problems.length
    ? '\n' + problems.join('\n')
    : '\nclean — the ring never moves, the word never moves, and the close control is legible',
);
process.exit(problems.length ? 1 : 0);
