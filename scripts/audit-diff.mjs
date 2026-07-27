/* Diff the two audit runs. Anything present in both locales is the site's own
   long-standing behaviour and out of scope for a translation review; what's left
   is what English introduced. Findings are compared by element selector rather
   than by text, since the text is supposed to differ. */
import { readFileSync } from 'node:fs';

const pl = JSON.parse(readFileSync('audit-pl.json', 'utf8'));
const en = JSON.parse(readFileSync('audit-en.json', 'utf8'));
const key = (r) => `${r.page}@${r.width}`;
const plBy = new Map(pl.map((r) => [key(r), r]));

const KINDS = ['overflow', 'clipped', 'small'];
/* `is-inview` is added by the reveal observer, so the same element can carry a
   different class list depending on scroll timing; strip it before comparing. */
const sel = (f) => f.el.replace(/\.is-inview/g, '');

let n = 0;
const shared = new Map();

for (const e of en) {
  const p = plBy.get(key(e));
  if (!p) { console.log(`no Polish counterpart for ${key(e)}`); continue; }

  for (const kind of KINDS) {
    const plSet = new Set(p[kind].map(sel));
    for (const f of e[kind]) {
      if (plSet.has(sel(f))) {
        shared.set(kind + ' ' + sel(f), (shared.get(kind + ' ' + sel(f)) || 0) + 1);
        continue;
      }
      n++;
      console.log(`ENGLISH-ONLY ${kind.toUpperCase()} — ${key(e)}`);
      console.log('   ' + JSON.stringify(f));
    }
  }
  /* These aren't locale-shaped: any difference is a real difference. */
  for (const kind of ['broken', 'errors', 'failed']) {
    const extra = e[kind].filter((x) => !p[kind].includes(x));
    if (extra.length) { n++; console.log(`ENGLISH-ONLY ${kind.toUpperCase()} — ${key(e)}: ${extra.join(', ')}`); }
  }
  if (e.docScroll > e.vw + 1) { n++; console.log(`H-SCROLL — ${key(e)} doc=${e.docScroll} vw=${e.vw}`); }
  if (e.lang !== 'en') { n++; console.log(`WRONG LANG — ${key(e)}: ${e.lang}`); }
  if (e.h1.length !== 1) { n++; console.log(`H1 COUNT — ${key(e)}: ${e.h1.length}`); }
}

console.log(`\n=== ${n} English-only finding(s) across ${en.length} page×width combinations ===`);
console.log('\nShared with Polish (pre-existing, out of scope for this review):');
for (const [k, c] of [...shared].sort((a, b) => b[1] - a[1])) console.log(`  ×${c}  ${k}`);
