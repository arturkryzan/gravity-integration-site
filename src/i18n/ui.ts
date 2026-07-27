/* Interface strings — the words the site says that are NOT page content.
 *
 * Page content (headings, prose, SEO) lives in `src/content/`. This file holds
 * the rest: nav labels, button text, form validation, aria-labels, the
 * visually-hidden notes. Roughly 200 of them, currently hard-coded across 19
 * .astro files; they move in here file by file during Phase 3.
 *
 * `pl` is the base dictionary and is complete by definition — it's the shape
 * every other locale is checked against. `en` is a Partial of it, so a key that
 * hasn't been translated yet is a legal state, not a type error. That matters
 * during the build-out: the English shell renders in Polish words before Phase 3
 * fills it in, and it should render rather than fail.
 *
 * The two failure modes are deliberately treated differently:
 *
 *   • a key that isn't in `pl` at all is a typo. It throws in dev, because
 *     there is no sensible value to fall back to and `undefined` rendered into
 *     a live page is the outcome this file exists to prevent.
 *   • a key that's in `pl` but not yet in `en` is untranslated. It falls back
 *     to Polish and warns once in dev. Loud enough to find, quiet enough to
 *     keep working.
 */

export const LOCALES = ['pl', 'en'] as const;
export type Lang = (typeof LOCALES)[number];

/** Matches `i18n.defaultLocale` in astro.config.mjs. */
export const DEFAULT_LOCALE: Lang = 'pl';

/** `en_US`-style tags for og:locale, and BCP-47 for <html lang> / JSON-LD. */
export const LOCALE_TAG: Record<Lang, string> = { pl: 'pl-PL', en: 'en-US' };
export const OG_LOCALE: Record<Lang, string> = { pl: 'pl_PL', en: 'en_US' };

/** Endonym — a language switcher names languages in their own language. */
export const LOCALE_NAME: Record<Lang, string> = { pl: 'Polski', en: 'English' };

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * The locale of the page being rendered.
 *
 * `Astro.currentLocale` derives it from the URL once `i18n` is configured, so
 * nothing needs a `lang` prop threaded through it. It is typed `string |
 * undefined` and is undefined for paths outside any locale (the 404 route, for
 * one), hence the fallback.
 *
 * Usage: `const lang = localeOf(Astro.currentLocale);`
 */
export function localeOf(currentLocale: string | undefined): Lang {
  return isLang(currentLocale) ? currentLocale : DEFAULT_LOCALE;
}

const pl = {
  /* Header / nav ------------------------------------------------------- */
  'nav.home': 'Strona główna',
  'nav.roiCalculator': 'Kalkulator ROI',
  'nav.download': 'Pobieranie',
  'nav.contact': 'Kontakt',
  'nav.technology': 'Technologia',
  'nav.whatIsEsb': 'Czym jest ESB?',
  'nav.pricing': 'Cennik',
  'nav.caseStudies': 'Case Studies',
  'nav.docs': 'Dokumentacja',
  'nav.integrations': 'Integracje',
  'nav.privacy': 'Polityka prywatności',
  'nav.menuOpen': 'MENU',
  'nav.menuClose': 'CLOSE',

  /* Accessibility ------------------------------------------------------ */
  'a11y.newTab': ' (otwiera się w nowej karcie)',
  'a11y.linkedin': 'LinkedIn (otwiera się w nowej karcie)',

  /* Footer ------------------------------------------------------------- */
  'footer.cookieSettings': 'Ustawienia cookies',
  'footer.copyright': '© Copyright',

  /* Language switcher --------------------------------------------------
     Names the target language outright rather than saying "change language",
     because a screen-reader user hears the accessible name without the visible
     endonym next to it. With exactly two locales the target is always the other
     one, so each locale's string can name it directly. A third locale would
     turn this into a template with the language interpolated. */
  'lang.switchTo': 'Zmień język na angielski',
} as const;

export type UiKey = keyof typeof pl;

const en: Partial<Record<UiKey, string>> = {
  /* Filled in during Phase 3, alongside the extraction. Until then every
     lookup falls back to `pl` — the English shell renders, in Polish words.

     This one key is the exception, translated in Phase 2 rather than Phase 3,
     because falling back would be worse than untranslated: on an English page
     the Polish string announces a link to English while the link goes to
     Polish. A control that misnames its own destination is broken, not
     pending. */
  'lang.switchTo': 'Switch language to Polish',
};

export const ui: { pl: Record<UiKey, string>; en: Partial<Record<UiKey, string>> } = { pl, en };

const warned = new Set<string>();

/**
 * Returns the lookup function for a locale.
 *
 *   const lang = localeOf(Astro.currentLocale);
 *   const s = t(lang);
 *   ...
 *   <a href="/kontakt/">{s('nav.contact')}</a>
 */
export function t(lang: Lang) {
  return function translate(key: UiKey): string {
    const base = ui.pl[key];

    if (base === undefined) {
      // Unreachable through the type system; reachable through a cast or a
      // string built at runtime. Fail at build time, not on a live page.
      throw new Error(
        `[i18n] Unknown UI string "${key}". Add it to \`pl\` in src/i18n/ui.ts — ` +
          `that dictionary is the source of truth for what keys exist.`,
      );
    }

    if (lang === 'pl') return base;

    const translated = ui[lang][key];
    if (translated !== undefined) return translated;

    if (import.meta.env.DEV && !warned.has(`${lang}:${key}`)) {
      warned.add(`${lang}:${key}`);
      console.warn(`[i18n] "${key}" has no ${lang} translation — falling back to pl.`);
    }
    return base;
  };
}

/** Every key still missing from a locale. Phase 3's checklist, and a cheap
 *  assertion for the pre-ship audit in Phase 6. */
export function untranslated(lang: Lang): UiKey[] {
  if (lang === DEFAULT_LOCALE) return [];
  return (Object.keys(ui.pl) as UiKey[]).filter((k) => ui[lang][k] === undefined);
}
