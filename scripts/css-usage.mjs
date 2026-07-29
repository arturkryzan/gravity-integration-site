/* What in the 175 kB stylesheet can never match anything this site renders?
 *
 * WHY NOT COVERAGE ALONE
 * CDP's CSS.startRuleUsageTracking reports the rules that matched during one
 * visit. That makes it a sampler: a rule guarding a hover state, an error
 * message, a menu the crawl never opened, or a breakpoint the crawl never sat
 * at all read as "unused" and none of them are. Deleting on that evidence is
 * how a stylesheet loses its focus rings.
 *
 * So the authority here is static and the question is narrower and answerable:
 * does the class this selector requires exist ANYWHERE in what the site ships?
 * Every class attribute in all 20 built pages, plus every string literal in
 * every script (a class added at runtime is still a class that exists), is the
 * universe. A selector naming a class outside that universe cannot match any
 * document this site can produce — not on hover, not at 320px, not after any
 * interaction. That is a fact about the markup, not a sample of one crawl.
 *
 * Coverage still runs, as corroboration in the other direction: anything it
 * saw match is kept no matter what this analysis concludes. The two disagree
 * only if this file has a bug, so the disagreement is worth printing.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import * as csstree from 'css-tree';

const DIST = 'dist';

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(DIST);
const htmlFiles = files.filter((f) => extname(f) === '.html');
const jsFiles = files.filter((f) => extname(f) === '.js' || extname(f) === '.mjs');

/* ---- the universe of names the site can actually produce ---- */
const classes = new Set();
const ids = new Set();
const tags = new Set();
const attrs = new Set();
/* Anything that looks like an identifier inside any script, inline or bundled.
   Deliberately over-broad: a false keep costs bytes, a false drop costs a
   visual defect, and those are not the same mistake. */
const jsTokens = new Set();

const addJs = (src) => {
  for (const m of src.matchAll(/[A-Za-z_][\w-]{1,}/g)) jsTokens.add(m[0]);
};

for (const f of htmlFiles) {
  const html = readFileSync(f, 'utf8');
  for (const m of html.matchAll(/\sclass\s*=\s*"([^"]*)"/g))
    for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
  for (const m of html.matchAll(/\sclass\s*=\s*'([^']*)'/g))
    for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
  for (const m of html.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)) ids.add(m[1]);
  for (const m of html.matchAll(/<([a-zA-Z][\w-]*)/g)) tags.add(m[1].toLowerCase());
  for (const m of html.matchAll(/\s([a-zA-Z-]+)\s*=/g)) attrs.add(m[1].toLowerCase());
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) addJs(m[1]);
}
for (const f of jsFiles) addJs(readFileSync(f, 'utf8'));

/* ---- classify every rule in the sheet ---- */
const SHEET = process.argv[2] || 'src/styles/legacy.css';
const css = readFileSync(SHEET, 'utf8');
const ast = csstree.parse(css, { positions: true });

/** Names a selector requires. `null` means "this selector uses a construct
    this analysis does not model" — treated as reachable, never as dead. */
function requires(selNode) {
  const need = { classes: [], ids: [], tags: [] };
  let bail = false;
  csstree.walk(selNode, (n) => {
    if (n.type === 'ClassSelector') need.classes.push(n.name);
    else if (n.type === 'IdSelector') need.ids.push(n.name);
    else if (n.type === 'TypeSelector') need.tags.push(n.name.toLowerCase());
    else if (n.type === 'PseudoClassSelector' && (n.name === 'not' || n.name === 'is' || n.name === 'where' || n.name === 'has')) bail = true;
  });
  return bail ? null : need;
}

const reachableClass = (c) => classes.has(c) || jsTokens.has(c);

const dead = [];
const live = [];
let total = 0;

csstree.walk(ast, {
  visit: 'Rule',
  enter(rule) {
    total++;
    const sel = csstree.generate(rule.prelude);
    let anyReachable = false;
    const reasons = [];
    if (rule.prelude.type !== 'SelectorList') { anyReachable = true; }
    else {
      for (const s of rule.prelude.children) {
        const need = requires(s);
        if (!need) { anyReachable = true; break; }
        const missingC = need.classes.filter((c) => !reachableClass(c));
        const missingI = need.ids.filter((i) => !ids.has(i) && !jsTokens.has(i));
        /* Tags are not used as evidence of death: a <table> the site does not
           render today is one content edit away, and tag rules are cheap. */
        if (!missingC.length && !missingI.length) { anyReachable = true; break; }
        reasons.push(...missingC.map((c) => '.' + c), ...missingI.map((i) => '#' + i));
      }
    }
    const bytes = rule.loc ? rule.loc.end.offset - rule.loc.start.offset : 0;
    (anyReachable ? live : dead).push({ sel: sel.slice(0, 120), bytes, missing: [...new Set(reasons)].slice(0, 6) });
  },
});

const deadBytes = dead.reduce((a, r) => a + r.bytes, 0);
console.log(`${SHEET}: ${css.length} B, ${total} rules`);
console.log(`  unreachable: ${dead.length} rules, ~${(deadBytes / 1024).toFixed(1)} kB of rule text`);
console.log(`  reachable:   ${live.length} rules`);

const byPrefix = new Map();
for (const r of dead) for (const m of r.missing) {
  const k = m.slice(0, 1) + (m.slice(1).split('-')[0] || '');
  byPrefix.set(k, (byPrefix.get(k) || 0) + 1);
}
console.log('\n  most common missing names:');
for (const [k, n] of [...byPrefix].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`    ${k.padEnd(22)} ${n}`);

console.log('\n  20 largest unreachable rules:');
for (const r of dead.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 20))
  console.log(`    ${String(r.bytes).padStart(6)} B  ${r.sel.slice(0, 90)}`);

writeFileSync('/tmp/css-usage.json', JSON.stringify({ sheet: SHEET, total, dead, classesSeen: classes.size, jsTokens: jsTokens.size }, null, 2));
console.log(`\n  classes in built HTML: ${classes.size}   js identifiers: ${jsTokens.size}`);
console.log('  written to /tmp/css-usage.json');
