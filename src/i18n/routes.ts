/* Linking a page to its translation.
 *
 * The site has locales configured but, until this file, no way to say "this
 * English page is the translation of that Polish one". Without that link there
 * is no switcher, no hreflang, and no way to tell which pages have an English
 * twin and which don't.
 *
 * The link is the content model itself, not a map maintained alongside it:
 *
 *   `slug` is the language-neutral key — the SAME string in both files
 *   `url`  is the localised path
 *
 * So `czym-jest-esb` is the slug of both the Polish page at /czym-jest-esb/ and
 * the English one at /en/what-is-esb/. Finding a translation is "the entry with
 * this slug and the other lang". A page with no twin — the privacy policy —
 * simply has no match, which is exactly the answer hreflang needs.
 *
 * Filenames are free: the invariant lives in the data, so a translator can name
 * the English file what it's actually about. `assertOneEntryPerSlug` is what
 * keeps that freedom honest.
 */

import { getCollection, type CollectionEntry } from 'astro:content';
import { DEFAULT_LOCALE, LOCALES, type Lang } from './ui';

export type PageEntry = CollectionEntry<'pages'>;

/**
 * Pages that have a route file of their own, so the `[...slug]` catch-all must
 * skip them.
 *
 * Keyed by slug rather than by url, because slug is the language-neutral key —
 * the English catch-all imports this exact set, where a list of Polish paths
 * would have needed a translated twin kept in sync by hand.
 *
 * It lives here rather than in the route file because Astro hoists
 * `getStaticPaths` into its own scope: consts declared in the same frontmatter
 * are not visible inside it, but imports are.
 */
export const OWN_ROUTE: ReadonlySet<string> = new Set([
  'home',
  'integracje',
  'kalkulator',
  'pobieranie',
  'czym-jest-esb',
  'case-studies',
]);

/** Two entries claiming the same (lang, slug) means one of them is silently
 *  unreachable — a copy-paste during translation, most likely. Cheap to check
 *  at 14 entries, and the failure it prevents is a page that exists on disk and
 *  nowhere on the site. */
function assertOneEntryPerSlug(pages: PageEntry[]): void {
  const seen = new Map<string, string>();
  for (const page of pages) {
    const key = `${page.data.lang}/${page.data.slug}`;
    const previous = seen.get(key);
    if (previous) {
      throw new Error(
        `[i18n] Two pages share lang="${page.data.lang}" slug="${page.data.slug}": ` +
          `${previous} and ${page.id}. Slug is the translation key — it must be ` +
          `unique within a language.`,
      );
    }
    seen.set(key, page.id);
  }
}

async function allPages(): Promise<PageEntry[]> {
  const pages = await getCollection('pages');
  assertOneEntryPerSlug(pages);
  return pages;
}

/** Every page in one language, for `getStaticPaths`. Drafts included — they
 *  have to build in order to be reviewed; what they don't get is an index
 *  entry, a sitemap row, an hreflang claim or a switcher link. */
export async function pagesIn(lang: Lang): Promise<PageEntry[]> {
  return (await allPages()).filter((p) => p.data.lang === lang);
}

/**
 * The `[...slug]` param for a page, i.e. its url minus the locale prefix and
 * the surrounding slashes. `/en/what-is-esb/` under `src/pages/en/[...slug]/`
 * is the param `what-is-esb`, because the `/en/` is already in the file path.
 */
export function pathParam(url: string, lang: Lang): string {
  const withoutPrefix = lang === DEFAULT_LOCALE ? url : url.replace(new RegExp(`^/${lang}/`), '/');
  return withoutPrefix.replace(/^\/|\/$/g, '');
}

/**
 * One page by its language-neutral slug.
 *
 * Throws when it isn't there. The six route files that call this used a `!`
 * non-null assertion, which crashed anyway — this just says which page and why.
 */
export async function getPage(slug: string, lang: Lang = DEFAULT_LOCALE): Promise<PageEntry> {
  const hit = (await allPages()).find((p) => p.data.slug === slug && p.data.lang === lang);
  if (!hit) {
    throw new Error(
      `[i18n] No "${lang}" page with slug "${slug}". Expected a JSON file under ` +
        `src/content/pages/${lang}/ carrying { "lang": "${lang}", "slug": "${slug}" }.`,
    );
  }
  return hit;
}

/**
 * Where this page lives in another language, or `null` if it doesn't exist there
 * yet. The language switcher's whole logic.
 */
export async function translationUrl(slug: string, to: Lang): Promise<string | null> {
  const hit = (await allPages()).find(
    (p) => p.data.slug === slug && p.data.lang === to && !p.data.draft,
  );
  return hit?.data.url ?? null;
}

/**
 * Where an internal link on a page rendered in `lang` should point.
 *
 * The nav, the CTAs and the announcement bar all link to *pages*, and on an
 * English page those links should stay in English — but only when there is a
 * published English page to land on. A published page must never send a real
 * visitor to a draft (Polish placeholder text under a /en/ URL, noindexed), so
 * the rule mirrors the switcher's: same slug in `lang` if it's published,
 * otherwise the default locale's URL. An English home page shipped ahead of
 * the English pricing page links to /cennik/ until the translation lands —
 * honest Polish over broken English.
 *
 * For `lang === DEFAULT_LOCALE` this resolves to the Polish URL it always was.
 */
export async function linkUrl(slug: string, lang: Lang): Promise<string> {
  if (lang !== DEFAULT_LOCALE) {
    const hit = await translationUrl(slug, lang);
    if (hit) return hit;
  }
  return (await getPage(slug, DEFAULT_LOCALE)).data.url;
}

/**
 * The hreflang set for a page — every locale it genuinely exists in.
 *
 * Returns `[]` unless the page exists in ALL locales. hreflang has to
 * reciprocate: if the Polish page points at an English one that doesn't point
 * back, Google discards the whole cluster rather than half of it. An
 * incomplete set is worse than no set, so this returns nothing rather than
 * something partial.
 */
export async function alternates(slug: string): Promise<Array<{ lang: Lang; url: string }>> {
  const pages = await allPages();
  const found: Array<{ lang: Lang; url: string }> = [];

  for (const lang of LOCALES) {
    const hit = pages.find((p) => p.data.slug === slug && p.data.lang === lang && !p.data.draft);
    if (!hit) return [];
    found.push({ lang, url: hit.data.url });
  }

  return found;
}
