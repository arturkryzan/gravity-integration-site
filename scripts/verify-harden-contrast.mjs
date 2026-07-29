/* The two contrast fixes from the harden pass, re-measured in the browser.
 *
 * Both were translucent white on a dark surface, so the number that matters is
 * not the declared colour but the composited one. The walk below pushes every
 * translucent background-color up the ancestor chain onto a stack, stops at
 * the first opaque layer, and composites down. If a background-image turns up
 * anywhere on the way, the answer is not computable from the CSSOM and the
 * case is reported as needing pixel arbitration rather than guessed at.
 *
 * Run: CHROME=… ORIGIN=http://127.0.0.1:8556 node scripts/verify-harden-contrast.mjs
 */
import { chromium } from 'playwright';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8556';

const CASES = [
  // P1-1 — hero social-proof line, was rgba(255,255,255,0.4) at 3.77:1
  ['/', '[style*="rgba(255,255,255,0.55)"]', 'hero social proof', 4.5],
  ['/en/', '[style*="rgba(255,255,255,0.55)"]', 'hero social proof', 4.5],
  // P1-2 — the "(optional)" marker beside non-required demo fields, was 4.19:1
  ['/', 'span.demo-optional', 'demo "(optional)"', 4.5],
  ['/kontakt/', 'span.demo-optional', 'demo "(optional)"', 4.5],
  ['/en/', 'span.demo-optional', 'demo "(optional)"', 4.5],
];

const PROBE = (sel) => {
  const parse = (c) => {
    const m = c.match(/[\d.]+/g);
    if (!m) return null;
    return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] };
  };
  const el = document.querySelector(sel);
  if (!el) return { missing: true };
  const cs = getComputedStyle(el);
  const fg = parse(cs.color);
  const px = parseFloat(cs.fontSize);
  const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;

  const stack = [];
  let node = el;
  let base = null;
  let img = false;
  while (node && node !== document.documentElement.parentElement) {
    const s = getComputedStyle(node);
    if (s.backgroundImage && s.backgroundImage !== 'none') { img = true; break; }
    const bg = parse(s.backgroundColor);
    if (bg && bg.a > 0) {
      if (bg.a >= 1) { base = bg; break; }
      stack.push(bg);
    }
    node = node.parentElement;
  }
  if (img) return { img: true, px, bold, fg };
  if (!base) base = { r: 255, g: 255, b: 255, a: 1 };
  // composite the translucent layers down onto the opaque base, nearest last
  let bgc = base;
  for (let i = stack.length - 1; i >= 0; i--) {
    const l = stack[i];
    bgc = {
      r: l.r * l.a + bgc.r * (1 - l.a),
      g: l.g * l.a + bgc.g * (1 - l.a),
      b: l.b * l.a + bgc.b * (1 - l.a),
      a: 1,
    };
  }
  const ink = {
    r: fg.r * fg.a + bgc.r * (1 - fg.a),
    g: fg.g * fg.a + bgc.g * (1 - fg.a),
    b: fg.b * fg.a + bgc.b * (1 - fg.a),
  };
  return { ink, bgc, px, bold, text: (el.textContent || '').trim().slice(0, 48) };
};

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
let bad = 0;

for (const [route, sel, name, floor] of CASES) {
  await page.goto(ORIGIN + route, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const r = await page.evaluate(PROBE, sel);
  if (r.missing) { console.log(`  n/a     ${route.padEnd(12)} ${name} — not on this route`); continue; }
  if (r.img) { console.log(`  IMG     ${route.padEnd(12)} ${name} — background-image, needs pixel arbitration`); bad++; continue; }
  // large-text allowance: >=24px, or >=18.66px bold
  const large = r.px >= 24 || (r.bold && r.px >= 18.66);
  const need = large ? 3.0 : floor;
  const cr = ratio(r.ink, r.bgc);
  const ok = cr >= need;
  if (!ok) bad++;
  const rnd = (o) => `rgb(${Math.round(o.r)},${Math.round(o.g)},${Math.round(o.b)})`;
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'}    ${route.padEnd(12)} ${name.padEnd(20)} ` +
      `${cr.toFixed(2)}:1 (needs ${need}) at ${r.px}px  ${rnd(r.ink)} on ${rnd(r.bgc)}  "${r.text}"`
  );
}

await browser.close();
console.log(bad ? `\n${bad} contrast failure(s)` : '\nboth contrast fixes verified');
process.exit(bad ? 1 : 0);
