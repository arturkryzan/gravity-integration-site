/* What the sitemap needs to know about pages, read straight off disk.
 *
 * astro.config.mjs runs before the content layer exists, so `getCollection` is
 * not available to it. Reading the same JSON files with node:fs gives the config
 * the three fields it needs — `lang`, `slug`, `url`, plus `draft`. The loop is
 * deliberately dumber than the Zod schema in src/content.config.ts, because
 * everything it looks at is a literal in the file.
 *
 * This duplicates the rule in src/i18n/routes.ts (`alternates`), which is what
 * Site.astro uses for the <head> tags. Two readers, one rule, stated the same
 * way in both places: a page is offered as an alternate only when EVERY locale
 * has it published. Google discards a whole hreflang cluster if the references
 * don't reciprocate, so a partial set is worse than none, and the sitemap
 * disagreeing with the head is worse still.
 *
 * .mjs, not .ts: astro.config.mjs is loaded by Node before any TypeScript
 * transform is in play.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGES_DIR = new URL('../content/pages/', import.meta.url).pathname;

/** The default locale — the one x-default points at. Mirrors `DEFAULT_LOCALE`
 *  in ./ui.ts, which this file can't import for the reason above. */
const DEFAULT_LOCALE = 'pl';

function readPages() {
  const out = [];
  for (const dir of readdirSync(PAGES_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const file of readdirSync(join(PAGES_DIR, dir.name))) {
      if (!file.endsWith('.json')) continue;
      const d = JSON.parse(readFileSync(join(PAGES_DIR, dir.name, file), 'utf8'));
      out.push({ lang: d.lang ?? DEFAULT_LOCALE, slug: d.slug, url: d.url, draft: d.draft === true });
    }
  }
  return out;
}

/** Every URL whose entry is a draft, as pathnames — the shape
 *  `new URL(page).pathname` produces, so the caller can compare directly.
 *
 *  Drafts already carry `noindex`; leaving them in the sitemap would be asking
 *  Google to crawl a URL that then turns it away. */
export function draftUrls() {
  return new Set(readPages().filter((p) => p.draft).map((p) => p.url));
}

/** pathname → the `xhtml:link` set for that page, or absent if it has no
 *  published twin.
 *
 *  @astrojs/sitemap's own `i18n` option can't do this: it pairs pages by the
 *  path left over after stripping the locale prefix, so it only ever finds
 *  /foo/ ↔ /en/foo/. Our English slugs are translated — /czym-jest-esb/ pairs
 *  with /en/what-is-esb/ — which is the whole point of the URL decision, and
 *  means the pairing has to come from the `slug` field instead. It also lets
 *  the tags stay bare `pl` / `en`, matching the <head>, rather than the
 *  pl-PL / en-US that option would force. */
export function alternatesByUrl() {
  const pages = readPages().filter((p) => !p.draft);
  const langs = [...new Set(pages.map((p) => p.lang))];

  const bySlug = new Map();
  for (const p of pages) {
    if (!bySlug.has(p.slug)) bySlug.set(p.slug, new Map());
    bySlug.get(p.slug).set(p.lang, p.url);
  }

  const out = new Map();
  for (const [, byLang] of bySlug) {
    /* Reciprocity: unless every locale has it, the page claims nothing. */
    if (byLang.size !== langs.length || langs.length < 2) continue;
    const links = [...byLang].map(([lang, url]) => ({ lang, url }));
    const fallback = byLang.get(DEFAULT_LOCALE);
    if (fallback) links.push({ lang: 'x-default', url: fallback });
    for (const url of byLang.values()) out.set(url, links);
  }
  return out;
}
