/* The exact inverse of scripts/strip-css.mjs: emit ONLY what that script drops.
 *
 * This exists for one reason — when the pixel gate flags a page, "which of the
 * 2941 removed rules did that" is not answerable by reading the diff. Loading
 * this sheet on top of the stripped build restores every removed declaration,
 * so the question becomes an experiment: if the geometry snaps back, the
 * removal caused it and this file is the search space to bisect; if it does
 * not, the difference came from somewhere else and the strip is exonerated.
 *
 * The reachability test is copied verbatim rather than imported so that an
 * edit to one file cannot silently change the meaning of the other — they are
 * meant to be checked against each other, not wired together.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import * as csstree from 'css-tree';

const SHEET = process.argv[2] || '/tmp/legacy.css.orig';
const OUT = process.argv[3] || '/tmp/legacy.removed.css';
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

/* Same walk, opposite verdict: a rule survives here exactly when strip-css
   would have deleted it, and a comma run keeps precisely the selectors that
   one drops. @font-face and @keyframes are never touched there, so they are
   never emitted here. */
let kept = 0;
function prune(block, insideKeyframes = false) {
  if (!block || !block.children) return;
  const drop = [];
  block.children.forEach((node, item) => {
    if (node.type === 'Atrule') {
      const name = node.name.toLowerCase();
      if (name === 'font-face') { drop.push(item); return; }
      if (insideKeyframes || name.endsWith('keyframes')) { drop.push(item); return; }
      prune(node.block, false);
      if (node.block && node.block.children && node.block.children.isEmpty) drop.push(item);
      return;
    }
    if (node.type !== 'Rule') { drop.push(item); return; }
    if (node.prelude.type !== 'SelectorList') { drop.push(item); return; }
    const dead = [];
    node.prelude.children.forEach((sel, selItem) => { if (!selectorReachable(sel)) dead.push(selItem); });
    if (!dead.length) { drop.push(item); return; }
    kept++;
    const live = [];
    node.prelude.children.forEach((sel, selItem) => { if (!dead.includes(selItem)) live.push(selItem); });
    for (const s of live) node.prelude.children.remove(s);
  });
  for (const item of drop) block.children.remove(item);
}
prune(ast);

const out = csstree.generate(ast);
writeFileSync(OUT, out + '\n');
console.log(`${SHEET}: ${css.length} B -> ${OUT}: ${out.length} B (${kept} rules carry at least one removed selector)`);
