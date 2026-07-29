/* Remove the rules scripts/css-usage.mjs proved cannot match, and nothing else.
 *
 * The removal criterion is entirely that file's: a selector naming a class or
 * id that appears in no built page and in no script cannot match any document
 * this site produces. This script only performs the edit — it re-derives the
 * verdict rather than reading a list, so the two can never drift apart.
 *
 * Structural rules it will not touch, regardless:
 *   @font-face, @keyframes  — no selectors to reason about; the fonts and the
 *                             animation the site uses live here
 *   @supports, @media       — kept whenever anything survives inside them; an
 *                             empty one is dropped, since an empty block is
 *                             not a breakpoint, it is a leftover
 *   :root / html / body     — bare type and pseudo-class selectors are never
 *                             evidence of death (see requires())
 *
 * The output is not trusted on the strength of this reasoning. It is gated on
 * a pixel diff of every route at two widths, and that gate is what decides.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import * as csstree from 'css-tree';

const SHEET = process.argv[2] || 'src/styles/legacy.css';
const OUT = process.argv[3] || 'src/styles/legacy.css';
const DIST = 'dist';

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const files = walk(DIST);
const classes = new Set();
const ids = new Set();
const jsTokens = new Set();
const addJs = (s) => { for (const m of s.matchAll(/[A-Za-z_][\w-]{1,}/g)) jsTokens.add(m[0]); };

for (const f of files.filter((f) => extname(f) === '.html')) {
  const html = readFileSync(f, 'utf8');
  for (const m of html.matchAll(/\sclass\s*=\s*["']([^"']*)["']/g))
    for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
  for (const m of html.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)) ids.add(m[1]);
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) addJs(m[1]);
}
for (const f of files.filter((f) => ['.js', '.mjs'].includes(extname(f)))) addJs(readFileSync(f, 'utf8'));

const css = readFileSync(SHEET, 'utf8');
const ast = csstree.parse(css);

const liveClass = (c) => classes.has(c) || jsTokens.has(c);

function selectorReachable(sel) {
  let bail = false;
  const need = { c: [], i: [] };
  csstree.walk(sel, (n) => {
    if (n.type === 'ClassSelector') need.c.push(n.name);
    else if (n.type === 'IdSelector') need.i.push(n.name);
    else if (n.type === 'PseudoClassSelector' && ['not', 'is', 'where', 'has'].includes(n.name)) bail = true;
  });
  if (bail) return true;
  return need.c.every(liveClass) && need.i.every((i) => ids.has(i) || jsTokens.has(i));
}

/* Depth-first so a @media emptied by this pass is seen as empty by its own
   parent on the way back up. */
let removed = 0;
function prune(block, insideKeyframes = false) {
  if (!block || !block.children) return;
  const drop = [];
  block.children.forEach((node, item) => {
    if (node.type === 'Atrule') {
      const name = node.name.toLowerCase();
      if (name === 'font-face') return;
      const kf = insideKeyframes || name.endsWith('keyframes');
      prune(node.block, kf);
      if (!kf && node.block && node.block.children && node.block.children.isEmpty) drop.push(item);
      return;
    }
    if (node.type !== 'Rule' || insideKeyframes) return;
    if (node.prelude.type !== 'SelectorList') return;
    const keep = [];
    node.prelude.children.forEach((sel, selItem) => { if (selectorReachable(sel)) keep.push(selItem); });
    if (!keep.length) { drop.push(item); removed++; return; }
    /* A rule can be partly dead: `.btn,.badge{…}` keeps `.btn` and loses the
       other. Dropping only the dead selectors is where a real share of the
       bytes are, since this sheet lists utilities in long comma runs. */
    const dropSel = [];
    node.prelude.children.forEach((sel, selItem) => { if (!keep.includes(selItem)) dropSel.push(selItem); });
    for (const s of dropSel) node.prelude.children.remove(s);
  });
  for (const item of drop) block.children.remove(item);
}
prune(ast);

const out = csstree.generate(ast);
writeFileSync(OUT, out + '\n');
console.log(`${SHEET}: ${css.length} B -> ${OUT}: ${out.length} B  (-${(100 * (1 - out.length / css.length)).toFixed(1)}%, ${removed} rules removed)`);
