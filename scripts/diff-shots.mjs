/* Pixel-diff two screenshot sets. This is the gate the CSS strip has to pass:
 * the reasoning about which rules can match is an argument, and an argument is
 * not evidence. A differing pixel count above the anti-aliasing floor means a
 * rule that mattered was removed, wherever the analysis said otherwise.
 *
 * Differing heights are reported rather than diffed — a page that got shorter
 * is the loudest possible failure (a layout rule went missing) and averaging it
 * into a pixel percentage would bury it.
 *
 * One region of the page is deliberately invisible to the pixel diff. A fullPage
 * capture cannot photograph a <video> twice and get the same picture — Chromium
 * drops the compositing layer at random while it expands the viewport — so
 * shoot-routes.mjs hides them and records their boxes and painted style into
 * `_geom.json` instead. That file is compared here, exactly, before the pixels
 * are. Hidden is not the same as unchecked, and the check has to live in the
 * same place as the gate it is covering for or it will not be run.
 */
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [A, B, DIFFDIR = '/tmp/shots-diff'] = process.argv.slice(2);
mkdirSync(DIFFDIR, { recursive: true });
const names = readdirSync(A).filter((f) => f.endsWith('.png'));
let worst = null, failures = 0;

/* Geometry first: it is cheap, and a video that moved is a louder result than
   any pixel percentage the loop below can produce. A missing sidecar is
   reported, never silently skipped — that would turn the one blind spot the
   pixel diff has into an unmonitored one. */
let geomBad = 0;
try {
  const ga = JSON.parse(readFileSync(join(A, '_geom.json'), 'utf8'));
  const gb = JSON.parse(readFileSync(join(B, '_geom.json'), 'utf8'));
  const shots = new Set([...Object.keys(ga), ...Object.keys(gb)]);
  for (const s of shots) {
    const x = JSON.stringify(ga[s] ?? null), y = JSON.stringify(gb[s] ?? null);
    if (x !== y) {
      geomBad++;
      console.log(`  VIDEO    ${s.padEnd(30)} geometry/style changed`);
      console.log(`             A: ${x}`);
      console.log(`             B: ${y}`);
    }
  }
  console.log(`  video geometry: ${shots.size} shots, ${geomBad || 'none'} changed`);
} catch (e) {
  geomBad++;
  console.log(`  VIDEO    _geom.json unreadable in one or both sets (${e.code || e.message}) — the video regions are hidden AND unchecked`);
}
for (const n of names) {
  const a = PNG.sync.read(readFileSync(join(A, n)));
  let b;
  try { b = PNG.sync.read(readFileSync(join(B, n))); } catch { console.log(`  MISSING  ${n}`); failures++; continue; }
  if (a.width !== b.width || a.height !== b.height) {
    console.log(`  SIZE     ${n.padEnd(30)} ${a.width}x${a.height} -> ${b.width}x${b.height}  (${b.height - a.height >= 0 ? '+' : ''}${b.height - a.height}px tall)`);
    failures++;
    continue;
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const px = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  const pct = (100 * px) / (a.width * a.height);
  if (px > 0) {
    writeFileSync(join(DIFFDIR, n), PNG.sync.write(diff));
    console.log(`  DIFF     ${n.padEnd(30)} ${String(px).padStart(8)} px  ${pct.toFixed(3)}%`);
    if (!worst || px > worst.px) worst = { n, px, pct };
    failures++;
  }
}
console.log(`\n  ${names.length} shots, ${failures} with differences`);
if (worst) console.log(`  worst: ${worst.n} ${worst.px} px (${worst.pct.toFixed(3)}%) — diffs written to ${DIFFDIR}`);
else console.log('  identical');
if (geomBad || failures) process.exitCode = 1;
