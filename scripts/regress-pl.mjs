/* Did the Polish site move?
   dist-baseline/ is the last build before any English work started. This diffs
   every Polish page against it after normalising away the things that are
   *expected* to differ, and prints whatever is left. The point is that the
   leftovers are small enough to read one by one — a diff nobody reads proves
   nothing. */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PL = [
  '/index.html',
  '/czym-jest-esb/index.html',
  '/technologia/index.html',
  '/cennik/index.html',
  '/kalkulator/index.html',
  '/integracje/index.html',
  '/case-studies/index.html',
  '/kontakt/index.html',
  '/pobieranie/index.html',
  '/polityka-prywatnosci/index.html',
  '/404.html',
];

/* Each entry is a class of change we have already understood and accepted.
   Anything NOT matched here survives into the printed diff. */
const NORMALISERS = [
  [/\.[A-Za-z0-9_-]{8}\.(css|js)/g, '.HASH.$1'],           // content-hashed bundles
  [/ data-astro-cid-[a-z0-9]+=""/g, ''],                    // scoping attrs (component-shape churn)
  [/data-astro-cid-[a-z0-9]+/g, 'CID'],                     // …and inside class lists / CSS
  [/<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/?>/g, ''], // hreflang: new by design
  [/<a href="\/en\/[^"]*"[^>]*class="[^"]*gi-lang[^"]*"[^>]*>.*?<\/a>/g, ''], // the switcher itself
  [/<a[^>]*class="[^"]*gi-lang[^"]*"[^>]*>.*?<\/a>/g, ''],
];

const norm = (s) => NORMALISERS.reduce((acc, [re, to]) => acc.replace(re, to), s);
const h = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);

/* Word-level diff, so a one-word copy change doesn't print the whole line. */
function wordDiff(a, b) {
  const A = a.split(/(?<=>)|(?=<)/), B = b.split(/(?<=>)|(?=<)/);
  const setB = new Set(B), setA = new Set(A);
  const removed = A.filter((t) => !setB.has(t) && t.trim());
  const added = B.filter((t) => !setA.has(t) && t.trim());
  return { removed, added };
}

let moved = 0;
for (const p of PL) {
  const bPath = 'dist-baseline' + p;
  const nPath = 'dist' + p;
  if (!existsSync(bPath)) { console.log(`NEW PAGE (no baseline): ${p}`); continue; }
  if (!existsSync(nPath)) { console.log(`MISSING NOW: ${p}`); moved++; continue; }

  const b = norm(readFileSync(bPath, 'utf8'));
  const n = norm(readFileSync(nPath, 'utf8'));
  if (h(b) === h(n)) { console.log(`identical  ${p}`); continue; }

  moved++;
  const { removed, added } = wordDiff(b, n);
  console.log(`\nCHANGED    ${p}   (${b.length} → ${n.length} bytes normalised)`);
  const cap = (arr, sign) =>
    arr.slice(0, 12).forEach((t) => console.log(`   ${sign} ${JSON.stringify(t.slice(0, 160))}`)) ||
    (arr.length > 12 && console.log(`   ${sign} …and ${arr.length - 12} more`));
  cap(removed, '-');
  cap(added, '+');
}
console.log(`\n=== ${PL.length - moved} of ${PL.length} Polish pages byte-identical after normalisation ===`);
