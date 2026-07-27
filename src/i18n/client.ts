/* Language, as the browser sees it.
 *
 * Server-rendered strings come from src/i18n/ui.ts via `t(lang)` at build
 * time. Client scripts can't do that: the form runtimes are bundled ONCE and
 * shared by every page, Polish and English alike, so their language has to be
 * read at runtime. `<html lang>` is already stamped per-page by Site.astro
 * ('pl' or 'en'), which makes it the single source of truth here — no build
 * coupling, one code path for both trees.
 *
 * The messages themselves stay next to the scripts that speak them (each
 * component <script> carries its own small {pl, en} pair) rather than in
 * ui.ts, so a page's JS bundle ships only the strings that script can actually
 * say, not the whole site dictionary.
 */

export type ClientLang = 'pl' | 'en';

export function clientLang(): ClientLang {
  return document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'pl';
}

/** `pick({ pl: {...}, en: {...} })` — the current page's message set. */
export function pick<T>(sets: Record<ClientLang, T>): T {
  return sets[clientLang()];
}
