/* Interface strings — the words the site says that are NOT page content.
 *
 * Page content (headings, prose, SEO) lives in `src/content/`. This file holds
 * the rest: nav labels, button text, form copy, aria-labels, the
 * visually-hidden notes. They were hard-coded across 19 .astro files until
 * Phase 3 moved them here.
 *
 * `pl` is the base dictionary and is complete by definition — it's the shape
 * every other locale is checked against. `en` is a Partial of it, so a key that
 * hasn't been translated yet is a legal state, not a type error.
 *
 * The two failure modes are deliberately treated differently:
 *
 *   • a key that isn't in `pl` at all is a typo. It throws in dev, because
 *     there is no sensible value to fall back to and `undefined` rendered into
 *     a live page is the outcome this file exists to prevent.
 *   • a key that's in `pl` but not yet in `en` is untranslated. It falls back
 *     to Polish and warns once in dev. Loud enough to find, quiet enough to
 *     keep working.
 *
 * Conventions the values follow:
 *
 *   • `\u00A0` is the non-breaking space and `\u2011` the non-breaking hyphen the
 *     markup used to carry as `&nbsp;` / `&#8209;`. They must be characters
 *     here, not entities: an entity inside `{expr}` gets HTML-escaped into
 *     visible text. They are written as escapes, not raw characters, so a
 *     dropped one shows in a diff instead of hiding inside identical-looking
 *     whitespace. English values keep them only where English wants the tie
 *     (before a CTA arrow, inside "15-minute") — the Polish
 *     single-letter-word rule does not carry over.
 *   • keys ending in `Html` hold markup and MUST be rendered with `set:html`.
 *     Everything else is plain text. Localised hrefs inside Html values are
 *     part of the translation (the English 404 copy links where an English
 *     reader should land).
 *
 * Not in here: the MailerLite wire values (the `fields[typ_zapytania]` radio
 * values stay Polish in both locales so the CRM data stays uniform), and the
 * client-side form messages, which live next to the scripts that speak them
 * (src/scripts/ml-forms.ts and the component <script> blocks) and pick their
 * language at runtime via src/i18n/client.ts — shipping this whole dictionary
 * into every JS bundle would be paying page weight for strings the browser
 * never renders.
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
  /* MENU is the same word in Polish and stays. CLOSE was not — an English
     verb inside an otherwise Polish interface, on the one control a reader
     needs when they want out of the fullscreen menu. The stylesheet anchors
     this label from the *right*, so a longer word grows leftward into empty
     space instead of shifting the ring: ZAMKNIJ is safe by construction, not
     by luck. Verified in a real browser at all three widths. */
  'nav.menuOpen': 'MENU',
  'nav.menuClose': 'ZAMKNIJ',
  /* The logo is a link with nothing but an <svg> inside it, so without this
     it announces as "link" and nothing else. Names the destination rather
     than describing the picture \u2014 a screen-reader user wants to know
     where it goes, not what it looks like. */
  'nav.logoHome': 'gravity.integration \u2014 strona główna',
  /* First focusable element on every page; see .skip-link in base.css. */
  'nav.skipToContent': 'Przejdź do treści',
  /* v2: accessible names for the landmarks the visible top bar introduced.
     Names, not copy — nothing here is painted. */
  'nav.aria': 'Nawigacja główna',
  'nav.menuAria': 'Menu',
  'nav.onThisPage': 'Na tej stronie',
  'nav.footerAria': 'Mapa strony',
  'int.jumpAria': 'Kategorie integracji',

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

  /* Announcement bar ---------------------------------------------------- */
  'bar.msg': 'Nowa wersja już dostępna',
  'bar.close': 'Zamknij pasek z ogłoszeniem',
  'bar.aria': 'Ogłoszenie',

  /* Home hero ----------------------------------------------------------- */
  'hero.sub':
    '139+ konektorów, Always\u2011on\u2011data, instalacja lokalna. Plany od\u00A02\u00A0999 PLN/rok. Pobierz i\u00A0sprawdź dziś.',
  'hero.download': 'Pobierz za darmo',
  'hero.demo': 'Umów 15\u2011min demo',
  'hero.social':
    'Wybierany przez Bispol, Frogum, Hewalex, Lindner i\u00A020+ innych firm produkcyjnych',
  /* The stop control on every animation (WCAG 2.2.2), and the two connector
     categories in the hero whose names are words rather than acronyms. */
  'anim.pause': 'Zatrzymaj animację',
  'hero.cat.courier': 'KURIER',
  'hero.cat.invoice': 'FAKTURY',

  /* Home page CTA (row override on section 0) --------------------------- */
  'home.roiCta': 'Policz korzyści',

  /* The two animated SVG heroes on the home page — their lines are SVG <text>
     nodes, so they never showed up in the markup sweeps until a rendered
     English page still greeted readers in Polish. Line lengths matter: the
     text is centred in an 800-unit viewBox and sized to fit these words. */
  'svg.dev.l1': 'Dla programistów,',
  'svg.dev.l2': 'wdrożeniowców,',
  'svg.dev.l3': 'buntowników',
  'svg.dev.l4': "i software house'ów",
  'svg.biz.l1': 'Dla biznesu,',
  'svg.biz.l2': 'przedsiębiorstw,',
  'svg.biz.l3': 'rewolucjonistów,',
  'svg.biz.l4': 'myślicieli i działów IT',

  /* Demo section --------------------------------------------------------- */
  'demo.h2.line1': 'Sprawdź gravity.integration na\u00A0żywo',
  'demo.h2.accent': 'Umów 15\u2011minutowe demo',
  'demo.lede':
    'Pokaż nam swój scenariusz integracji — przygotujemy demo dopasowane do\u00A0Twoich systemów. Bez zobowiązań, bez slajdów.',
  'demo.h2.integrations': 'Nie widzisz swojego systemu?',
  'demo.lede.integrations':
    'Integrujemy też systemy niestandardowe, legacy i\u00A0rozwiązania pisane na\u00A0zamówienie. Jeśli system ma API lub bazę danych\u00A0—\u00A0podłączymy go.',
  'demo.form.aria': 'Formularz zgłoszenia na demo',
  'demo.field.name': 'Imię i nazwisko',
  'demo.field.name.ph': 'Jan Kowalski',
  'demo.field.email': 'E-mail służbowy',
  'demo.field.email.ph': 'jan@firma.pl',
  'demo.field.company': 'Firma',
  'demo.field.company.ph': 'Nazwa firmy',
  'demo.field.phone': 'Telefon',
  'demo.field.phone.ph': '+48 123 456 789',
  'demo.optional': '(opcjonalnie)',
  'demo.consent':
    'Zgadzam się na kontakt w celu umówienia demo. Administratorem danych jest Caffeine Minds sp.\u00A0z\u00A0o.o.',
  'demo.submit': 'Umów demo\u00A0→',
  'demo.done.h': 'Dzięki',
  'demo.done.p1': 'Potwierdzenie poleciało na ',
  'demo.done.p2':
    '. Odezwiemy się w\u00A0ciągu jednego dnia roboczego, żeby dobrać termin.',
  'demo.done.note':
    'Demo trwa 15\u00A0minut i\u00A0pokazujemy na\u00A0nim Twój scenariusz integracji\u00A0— nie slajdy.',

  /* Forms, shared -------------------------------------------------------- */
  'form.sending': 'Wysyłam…',
  'form.emailLabel': 'Podaj swój adres e-mail',

  /* Download page --------------------------------------------------------
     The e-mail subject inside dl.done.msg is what the MailerLite automation
     actually sends — Polish in both locales until an English welcome
     automation exists (flagged as a Phase 5 open question). */
  'dl.h1': 'Pobierz gravity.integration za\u00A0darmo',
  'dl.lede':
    'Pełna wersja platformy ESB — bez\u00A0ograniczeń funkcjonalnych i\u00A0bez\u00A0limitu czasu testów. Podaj firmowy e\u2011mail, a\u00A0link do\u00A0pobrania najnowszej wersji wyślemy od\u00A0razu.',
  'dl.trust1': 'Bez\u00A0karty i\u00A0bez\u00A0zobowiązań',
  'dl.trust2': 'Instalacja w\u00A0ok.\u00A015\u00A0minut',
  'dl.trust3': 'Wsparcie techniczne premium w\u00A0zestawie',
  'dl.form.aria': 'Formularz pobierania gravity.integration',
  'dl.card.h': 'Uzyskaj link do\u00A0pobierania',
  'dl.field.email': 'E-mail służbowy',
  'dl.field.email.ph': 'jan@firma.pl',
  'dl.field.company': 'Firma',
  'dl.field.company.ph': 'Nazwa firmy',
  'dl.consent':
    'Zgadzam się na\u00A0przesłanie linku do\u00A0pobrania i\u00A0kontakt w\u00A0sprawie gravity.integration. Administratorem danych jest Caffeine Minds sp.\u00A0z\u00A0o.o.',
  'dl.submit': 'Wyślij mi link do\u00A0pobierania',
  'dl.micro':
    'Wiadomość przychodzi zwykle w\u00A0ciągu minuty. Nadawca: contact@gravity-integration.com.',
  'dl.done.h': 'Link jest w\u00A0drodze',
  'dl.done.p1': 'Wysłaliśmy go na\u00A0',
  'dl.done.p2': '. Szukaj wiadomości ',
  'dl.done.msg': '„Witaj w\u00A0gravity.integration”',
  'dl.done.p3': ' od\u00A0contact@gravity-integration.com.',
  /* The e-mail is the path that puts the address into MailerLite, so it stays
     the headline. But by the time this panel renders we already have the
     address and the automation has fired — making someone wait on an inbox
     they may not have open buys us nothing. The direct link is for the
     impatient; it costs the lead nothing, because the lead is already in. */
  'dl.done.direct1': 'Nie chcesz czekać? ',
  'dl.done.directLink': 'Pobierz instalator teraz',
  'dl.done.direct2': ' (GravityInstaller.exe, Windows).',
  'dl.done.note1':
    'Nie widzisz jej po\u00A0kilku minutach? Zajrzyj do\u00A0folderu Oferty lub Spam. W\u00A0międzyczasie możesz przejrzeć ',
  'dl.done.docsLink': 'dokumentację online',
  'dl.step1.h': 'Odbierz link',
  'dl.step1.p':
    'Wysyłamy go e\u2011mailem od\u00A0razu po\u00A0wysłaniu formularza. Bez\u00A0karty, bez\u00A0zobowiązań — nadawcą jest contact@gravity-integration.com.',
  'dl.step2.h': 'Zainstaluj w\u00A0ok.\u00A015\u00A0minut',
  'dl.step2.p':
    'gravity.integration działa w\u00A0środowisku Windows. Środowisko uruchomisz w\u00A0kwadrans, z\u00A0pełną dokumentacją i\u00A0wsparciem technicznym premium.',
  'dl.step3.h': 'Integruj bez\u00A0limitu czasu',
  'dl.step3.p':
    'Testujesz pełną wersję tak\u00A0długo, jak\u00A0chcesz — nic nie\u00A0płacisz, dopóki nie\u00A0używasz środowiska poza\u00A0testami. Pierwszy projekt integracyjny prowadzisz z\u00A0bezpłatnym wsparciem zdalnym.',
  'dl.steps.h2': 'Od\u00A0formularza do\u00A0działającej integracji',
  'dl.proof.h2': 'To, co\u00A0pobierasz, to\u00A0pełne środowisko integracyjne',
  'dl.cap1Html':
    '<strong>139+ gotowych konektorów</strong> — wszystkie popularne ERP, BaseLinker, Saldeo i\u00A0systemy dziedzinowe.',
  'dl.cap2Html':
    '<strong>REST, SOAP, GraphQL, gRPC, MQTT i\u00A0Kafka</strong> z\u00A0automatycznym mapowaniem schematów XML/JSON/EDI.',
  'dl.cap3Html':
    '<strong>Routing, retry i\u00A0uwierzytelnianie</strong> (OAuth\u00A02.0, mTLS) konfigurujesz wizualnie — bez\u00A0pisania kodu.',
  'dl.spec':
    'Wersja\u00A04 · Windows · licencja komercyjna od\u00A02\u00A0999\u00A0PLN/rok dopiero, gdy\u00A0wychodzisz poza\u00A0testy.',
  'dl.shot.alt':
    'Wizualny edytor przepływów gravity.integration — projekt integracji RCP z bazą PostgreSQL',
  'dl.clients.h': 'Pracuje już m.in.\u00A0w:',
  'dl.caseAria': 'Case study: ',
  'dl.casesLink': 'Zobacz case studies\u00A0→',
  'dl.docs.h2': 'Wolisz najpierw poczytać?',
  'dl.docs.pHtml':
    'Interaktywna dokumentacja oprogramowania jest dostępna pod\u00A0adresem docs.gravity-integration.com. Jeśli potrzebujesz wersji offline, pobierz podręcznik PDF — miej jednak na\u00A0uwadze, że\u00A0jest to\u00A0wersja z\u00A0<strong>2024</strong>\u00A0roku.',
  'dl.docs.open': 'Otwórz dokumentację',
  'dl.docs.pdf': 'Pobierz podręcznik PDF\u00A0(2024)',
  'dl.manual.alt': 'Podręcznik gravity.integration — wizualizacja okładki',
  'dl.band.p1': 'Chcesz zobaczyć produkt na\u00A0żywo? ',
  'dl.band.strong': 'Umów 15-minutowe demo',
  'dl.band.p2': '\u00A0— pokażemy Twój scenariusz integracji, nie\u00A0slajdy.',
  'dl.band.cta': 'Umów demo',
  'dl.crumb.how': 'Jak to działa',
  'dl.crumb.what': 'Co pobierasz',

  /* Newsletter section ---------------------------------------------------- */
  'nl.h2': 'Bądź na\u00A0bieżąco, zapisz się na\u00A0newsletter.',
  'nl.p':
    'Co miesiąc dostarczymy Ci\u00A0wartościowe artykuły oraz\u00A0pokażemy nowe zastosowania gravity.integration',
  'nl.form.aria': 'Formularz zapisu na newsletter',
  'nl.consent':
    'Zgadzam się na używanie mojego adresu e-mail przez spółkę Caffeine Minds sp. z o.o. z siedzibą w Poznaniu przy ulicy Jasielskiej 16 w celu marketingu oprogramowania gravity.integration oraz przyszłych produktów spółki.',
  'nl.submit': 'Zapisz się',

  /* Contact form section --------------------------------------------------
     The radio *labels* localise; the radio *values* stay Polish in both
     locales — they are the `typ_zapytania` wire format MailerLite stores, and
     splitting it by language would split the reporting. */
  'cf.h2': 'Wyślij zapytanie',
  'cf.form.aria': 'Formularz kontaktowy',
  'cf.radio.commercial': 'Użytek komercyjny',
  'cf.radio.consult': 'Darmowa konsultacja',
  'cf.consent':
    'Zgadzam się na przekazanie adresu e-mail spółce Caffeine Minds sp. z o.o. celem kontaktu i przedstawienia indywidualnej wyceny handlowej lub umówienia konsultacji z ekspertem.',
  'cf.submit': 'Zapytaj',

  /* Cookie consent --------------------------------------------------------
     cc.bodyHtml links to the privacy policy, which exists only in Polish — by
     decision, not omission — so both locales point at the same URL.

     The Polish string names MailerLite and the English one does not, and that
     asymmetry is the accurate state rather than a missed translation: the
     MailerLite pop-up tag is published on Polish pages only (see Site.astro),
     so naming it on /en/ would describe something that never loads there.
     Each string lists what actually runs on the page it appears on. If the
     pop-up is ever turned on for English, this is the second edit. */
  'cc.title': 'Ciasteczka na tej stronie',
  'cc.bodyHtml':
    'Niezbędne pliki cookie utrzymują działanie serwisu i\u00A0zapamiętują tę\u00A0decyzję. Do statystyk odwiedzin i\u00A0do\u00A0działań reklamowych używamy narzędzi Google — Google\u00A0Analytics oraz Google\u00A0Ads — a\u00A0okienko z\u00A0zapisem na\u00A0newsletter wyświetla MailerLite. Uruchamiamy je\u00A0tylko wtedy, gdy wyrazisz zgodę. Szczegóły znajdziesz w\u00A0<a href="/polityka-prywatnosci/#cookies">polityce prywatności</a>.',
  'cc.accept': 'Akceptuję',
  'cc.reject': 'Tylko niezbędne',

  /* 404 -------------------------------------------------------------------
     Consumed by the Polish 404 today; the English 404 (Phase 5, with its own
     Apache ErrorDocument for /en/) will read the same keys. */
  'nf.title': 'Nie znaleziono strony (404) — gravity.integration',
  'nf.desc': 'Ta strona nie istnieje albo zmieniła adres.',
  'nf.h': 'Ta strona nie istnieje albo zmieniła adres',
  'nf.pHtml':
    'Adres mógł się zmienić przy\u00A0przebudowie serwisu. Poniżej znajdziesz wszystko, czego ludzie szukają najczęściej — a\u00A0jeśli trafiłeś tu z\u00A0linku na\u00A0naszej stronie, <a href="/kontakt/">daj nam znać</a>, poprawimy go.',
  'nf.nav.aria': 'Najczęściej odwiedzane strony',
  'nf.download': 'Pobierz gravity.integration',
  /* Sentence case on purpose — the live 404 button says 'Case studies',
     unlike the nav's 'Case Studies'. */
  'nf.cases': 'Case studies',

  /* ESB article (diagram chrome; the prose is content) --------------------- */
  'esb.tag.p2p': 'punkt\u2011punkt',
  'esb.tag.bus': 'przez szynę ESB',
  'esb.aria.p2p':
    'Integracja punkt-punkt: każdy system połączony bezpośrednio z każdym innym — plątanina połączeń.',
  'esb.aria.bus':
    'Integracja przez szynę ESB: każdy system połączony z jednym centralnym punktem — szyną integracyjną.',
  'esb.hub.sub': 'szyna',
  'esb.faq': 'FAQ',

  /* Integrations grid ------------------------------------------------------ */
  'int.subHtml':
    'gotowych konektorów i\u00A0adapterów.<br />Twoje systemy połączone w\u00A0jedną szynę danych\u00A0—\u00A0bez programowania.',

  /* ROI calculator --------------------------------------------------------- */
  'roi.h2': 'Sprawdź, ile możesz zaoszczędzić dzięki gravity.integration',
  'roi.disclaimer':
    'Kalkulacja oparta jest na\u00A0uśrednionych danych z\u00A0realizacji projektów integracyjnych z\u00A0wykorzystaniem gravity.integration. Rzeczywiste oszczędności mogą się różnić w\u00A0zależności od\u00A0złożoności systemów i\u00A0specyfiki środowiska IT.',
  'roi.params.h3': 'Parametry projektów',
  'roi.costs.h3': 'Koszty',
  'roi.slider.projects': 'Projekty integracyjne / rok',
  'roi.slider.days': 'Śr. czas projektu (dni robocze)',
  'roi.slider.team': 'Wielkość zespołu',
  'roi.slider.rate': 'Stawka dzienna (PLN netto)',
  'roi.slider.tools': 'Obecne narzędzia / licencje (PLN / rok)',
  'roi.kpi.save': 'Roczna oszczędność (PLN)',
  'roi.kpi.extra': 'Dodatkowe projekty w tym samym czasie',
  'roi.kpi.roi': 'ROI w pierwszym roku',
  'roi.chart.h3': 'Czas realizacji projektu (dni robocze)',
  'roi.bar.current': 'Obecny',
  'roi.bar.gravity': 'gravity',
  'roi.th.phase': 'Faza',
  'roi.th.current': 'Obecny koszt',
  'roi.th.gravity': 'Z gravity',
  'roi.th.savings': 'Oszczędność',
  'roi.row.dev': 'Rozwój',
  'roi.row.test': 'Testy',
  'roi.row.deploy': 'Wdrożenie',
  'roi.row.maint': 'Utrzymanie',
  'roi.row.tools': 'Licencje / narzędzia',
  'roi.row.total': 'Razem / rok',
  'roi.days.unit': ' dni',
  /* Appended to the two money sliders' aria-valuetext. A range input
     announces its raw `value`, which loses both the thousands grouping and
     the currency: "2999" instead of "2 999 PLN". The three count sliders
     get no valuetext on purpose \u2014 a bare number is already the whole
     answer, and inventing Polish plural forms for it would read worse than
     not trying. */
  'roi.pln.unit': ' PLN',
  /* toLocaleString locale for the calculator's figures — formatting is
     language: 2 999 in Polish, 2,999 in English. */
  'roi.numberLocale': 'pl-PL',
  'roi.cta': 'Pobierz gravity.integration za darmo',

  /* Case studies (layout chrome) -------------------------------------------
     cs.payoff is a MATCHER, not just a label: CaseStudies.astro promotes the
     stage whose heading equals it to the dark payoff panel, so the value must
     equal the payoff-stage heading used in that locale's content file. */
  'cs.payoff': 'Rezultaty',

  /* Generic section furniture ---------------------------------------------- */
  'common.download': 'Pobierz',
} as const;

export type UiKey = keyof typeof pl;

const en: Partial<Record<UiKey, string>> = {
  /* Header / nav ------------------------------------------------------- */
  'nav.home': 'Home',
  'nav.roiCalculator': 'ROI Calculator',
  'nav.download': 'Download',
  'nav.contact': 'Contact',
  'nav.technology': 'Technology',
  'nav.whatIsEsb': 'What is an ESB?',
  'nav.pricing': 'Pricing',
  'nav.caseStudies': 'Case Studies',
  'nav.docs': 'Documentation',
  'nav.integrations': 'Integrations',
  /* The policy exists only in Polish (a decision, not a gap), so the label has
     to do two jobs: be findable by someone hunting for the privacy policy, and
     not promise an English page the link can't deliver. The Polish title alone
     did the second and failed the first — to an English reader it is just
     foreign words in a menu, and a privacy policy is precisely the thing people
     go looking for on purpose. Naming it in English and stating the language in
     parentheses is the same shape the cookie bar already uses two hundred lines
     below; the anchor carries hreflang="pl" so machines get it too. */
  'nav.privacy': 'Privacy policy (in Polish)',
  'nav.menuOpen': 'MENU',
  'nav.menuClose': 'CLOSE',
  'nav.logoHome': 'gravity.integration \u2014 home',
  'nav.skipToContent': 'Skip to content',
  'nav.aria': 'Main navigation',
  'nav.menuAria': 'Menu',
  'nav.onThisPage': 'On this page',
  'nav.footerAria': 'Site map',
  'int.jumpAria': 'Integration categories',

  /* Accessibility ------------------------------------------------------ */
  'a11y.newTab': ' (opens in a new tab)',
  'a11y.linkedin': 'LinkedIn (opens in a new tab)',

  /* Footer ------------------------------------------------------------- */
  'footer.cookieSettings': 'Cookie settings',
  'footer.copyright': '© Copyright',

  /* Language switcher --------------------------------------------------- */
  'lang.switchTo': 'Switch language to Polish',

  /* Announcement bar ----------------------------------------------------
     The changelog behind bar.changelog lives on docs.gravity-integration.com —
     whether those docs are English is an EN-PLAN.md open question. The label
     translates either way. */
  'bar.msg': 'A new version is available',
  'bar.close': 'Close the announcement bar',
  'bar.aria': 'Announcement',

  /* Home hero ----------------------------------------------------------- */
  'hero.sub':
    '139+ connectors, Always\u2011on\u2011data, on-premises install. Plans from 799\u00A0EUR/year. Download and try it today.',
  'hero.download': 'Download free',
  'hero.demo': 'Book a 15\u2011min demo',
  'hero.social':
    'Chosen by Bispol, Frogum, Hewalex, Lindner and 20+ other manufacturing companies',
  'anim.pause': 'Pause the animation',
  'hero.cat.courier': 'COURIER',
  'hero.cat.invoice': 'INVOICING',

  /* Home page CTA -------------------------------------------------------- */
  'home.roiCta': 'Calculate your savings',

  /* SVG home heroes ------------------------------------------------------- */
  'svg.dev.l1': 'For developers,',
  'svg.dev.l2': 'implementers,',
  'svg.dev.l3': 'rebels',
  'svg.dev.l4': 'and software houses',
  'svg.biz.l1': 'For business,',
  'svg.biz.l2': 'enterprises,',
  'svg.biz.l3': 'revolutionaries,',
  'svg.biz.l4': 'thinkers and IT teams',

  /* Demo section --------------------------------------------------------- */
  'demo.h2.line1': 'See gravity.integration live',
  'demo.h2.accent': 'Book a 15\u2011minute demo',
  'demo.lede':
    "Show us your integration scenario — we'll tailor the demo to your systems. No commitments, no slide decks.",
  'demo.h2.integrations': "Don't see your system?",
  'demo.lede.integrations':
    'We also integrate custom, legacy and made-to-order systems. If it has an API or a database, we can connect it.',
  'demo.form.aria': 'Demo request form',
  'demo.field.name': 'Full name',
  'demo.field.name.ph': 'John Smith',
  'demo.field.email': 'Work e-mail',
  'demo.field.email.ph': 'john@company.com',
  'demo.field.company': 'Company',
  'demo.field.company.ph': 'Company name',
  'demo.field.phone': 'Phone',
  'demo.field.phone.ph': '+48 123 456 789',
  'demo.optional': '(optional)',
  'demo.consent':
    'I agree to be contacted to arrange the demo. The data controller is Caffeine Minds sp.\u00A0z\u00A0o.o.',
  'demo.submit': 'Book the demo\u00A0→',
  'demo.done.h': 'Thanks',
  'demo.done.p1': 'A confirmation is on its way to ',
  'demo.done.p2': ". We'll get back to you within one business day to pick a time.",
  'demo.done.note':
    'The demo takes 15 minutes and shows your integration scenario — not slides.',

  /* Forms, shared -------------------------------------------------------- */
  'form.sending': 'Sending…',
  'form.emailLabel': 'Enter your e-mail address',

  /* Download page --------------------------------------------------------- */
  'dl.h1': 'Download gravity.integration for free',
  'dl.lede':
    "The full ESB platform — no functional limits and no time limit on testing. Enter your work e\u2011mail and we'll send the download link for the latest version right away.",
  'dl.trust1': 'No card, no commitments',
  'dl.trust2': 'Installs in about 15 minutes',
  'dl.trust3': 'Premium technical support included',
  'dl.form.aria': 'gravity.integration download form',
  'dl.card.h': 'Get the download link',
  'dl.field.email': 'Work e-mail',
  'dl.field.email.ph': 'john@company.com',
  'dl.field.company': 'Company',
  'dl.field.company.ph': 'Company name',
  'dl.consent':
    'I agree to receive the download link and to be contacted about gravity.integration. The data controller is Caffeine Minds sp.\u00A0z\u00A0o.o.',
  'dl.submit': 'Send me the download link',
  'dl.micro':
    'The e-mail usually arrives within a minute. Sender: contact@gravity-integration.com.',
  'dl.done.h': 'The link is on its way',
  'dl.done.p1': "We've sent it to ",
  'dl.done.p2': '. Look for the message ',
  'dl.done.msg': '"Witaj w\u00A0gravity.integration"',
  'dl.done.p3': ' from contact@gravity-integration.com.',
  'dl.done.direct1': "Don't want to wait? ",
  'dl.done.directLink': 'Download the installer now',
  'dl.done.direct2': ' (GravityInstaller.exe, Windows).',
  'dl.done.note1':
    "Can't see it after a few minutes? Check your Offers or Spam folder. In the meantime you can browse the ",
  'dl.done.docsLink': 'online documentation',
  'dl.step1.h': 'Get the link',
  'dl.step1.p':
    'We e\u2011mail it the moment the form goes out. No card, no commitments — the sender is contact@gravity-integration.com.',
  'dl.step2.h': 'Install in about 15 minutes',
  'dl.step2.p':
    "gravity.integration runs on Windows. You'll have the environment up in a quarter of an hour, with full documentation and premium technical support.",
  'dl.step3.h': 'Integrate with no time limit',
  'dl.step3.p':
    'Test the full version for as long as you like — you pay nothing until you use the environment beyond testing. Your first integration project comes with free remote support.',
  'dl.steps.h2': 'From the form to a working integration',
  'dl.proof.h2': 'What you download is the full integration environment',
  'dl.cap1Html':
    '<strong>139+ ready-made connectors</strong> — all the popular ERPs, BaseLinker, Saldeo and line-of-business systems.',
  'dl.cap2Html':
    '<strong>REST, SOAP, GraphQL, gRPC, MQTT and Kafka</strong> with automatic XML/JSON/EDI schema mapping.',
  'dl.cap3Html':
    '<strong>Routing, retries and authentication</strong> (OAuth 2.0, mTLS) configured visually — without writing code.',
  'dl.spec':
    'Version\u00A04 · Windows · commercial licence from 799\u00A0EUR/year only once you go beyond testing.',
  'dl.shot.alt':
    'gravity.integration visual flow editor — an RCP-to-PostgreSQL integration project',
  'dl.clients.h': 'Already at work at:',
  'dl.caseAria': 'Case study: ',
  'dl.casesLink': 'See the case studies\u00A0→',
  'dl.docs.h2': 'Prefer to read first?',
  'dl.docs.pHtml':
    'The interactive software documentation lives at docs.gravity-integration.com. If you need an offline copy, download the PDF manual — bear in mind it is the <strong>2024</strong> edition.',
  'dl.docs.open': 'Open the documentation',
  'dl.docs.pdf': 'Download the PDF manual\u00A0(2024)',
  'dl.manual.alt': 'gravity.integration manual — cover visualisation',
  'dl.band.p1': 'Want to see the product live? ',
  'dl.band.strong': 'Book a 15-minute demo',
  'dl.band.p2': "\u00A0— we'll show your integration scenario, not slides.",
  'dl.band.cta': 'Book a demo',
  'dl.crumb.how': 'How it works',
  'dl.crumb.what': 'What you download',

  /* Newsletter section ----------------------------------------------------- */
  'nl.h2': 'Stay in the loop — subscribe to the newsletter.',
  'nl.p':
    "Once a month we'll send you worthwhile articles and show you new ways to use gravity.integration",
  'nl.form.aria': 'Newsletter sign-up form',
  'nl.consent':
    "I agree to Caffeine Minds sp. z o.o., of Jasielska 16, Poznań, using my e-mail address to market the gravity.integration software and the company's future products.",
  'nl.submit': 'Subscribe',

  /* Contact form section --------------------------------------------------- */
  'cf.h2': 'Send an enquiry',
  'cf.form.aria': 'Contact form',
  'cf.radio.commercial': 'Commercial use',
  'cf.radio.consult': 'Free consultation',
  'cf.consent':
    'I agree to share my e-mail address with Caffeine Minds sp. z o.o. so they can contact me with an individual commercial quote or to arrange a consultation with an expert.',
  'cf.submit': 'Ask us',

  /* Cookie consent ---------------------------------------------------------- */
  'cc.title': 'Cookies on this site',
  'cc.bodyHtml':
    'Essential cookies keep the site running and remember this choice. For visit statistics and advertising we use Google tools — Google\u00A0Analytics and Google\u00A0Ads. They run only if you agree. Details are in the <a href="/polityka-prywatnosci/#cookies">privacy policy</a> (in Polish).',
  'cc.accept': 'Accept',
  'cc.reject': 'Essential only',

  /* 404 ---------------------------------------------------------------------
     The English 404's inline link points at the English contact page — the
     href is part of the translation. */
  'nf.title': 'Page not found (404) — gravity.integration',
  'nf.desc': "This page doesn't exist or has moved.",
  'nf.h': "This page doesn't exist or has moved",
  'nf.pHtml':
    'The address may have changed when the site was rebuilt. Below is what people look for most often — and if you got here from a link on our site, <a href="/en/contact/">let us know</a> and we’ll fix it.',
  'nf.nav.aria': 'Most visited pages',
  'nf.download': 'Download gravity.integration',
  'nf.cases': 'Case studies',

  /* ESB article -------------------------------------------------------------- */
  'esb.tag.p2p': 'point\u2011to\u2011point',
  'esb.tag.bus': 'through an ESB',
  'esb.aria.p2p':
    'Point-to-point integration: every system connected directly to every other — a tangle of connections.',
  'esb.aria.bus':
    'Integration through an ESB: every system connected to a single central point — the integration bus.',
  'esb.hub.sub': 'bus',
  'esb.faq': 'FAQ',

  /* Integrations grid --------------------------------------------------------- */
  'int.subHtml':
    'ready-made connectors and adapters.<br />Your systems joined into a single data bus\u00A0—\u00A0no programming.',

  /* ROI calculator ------------------------------------------------------------
     Nothing renders these any more: /en/roi-calculator/ was removed, because
     the calculator is priced and scaled for the Polish market (NOT_OFFERED in
     routes.ts). They stay because `en` is checked against `pl` key for key —
     `untranslated('en')` is asserted empty before ship — and deleting a
     translation to mark a page absent would report as a translation gap, which
     is a different thing that wants a different fix.

     Three of them still say PLN, and that is the honest state: it is what they
     would have to stop saying before the page could come back. Translating them
     to EUR now would leave the file claiming a page exists in euro when the
     numbers behind them are still Polish day rates. */
  'roi.h2': 'See how much you could save with gravity.integration',
  'roi.disclaimer':
    'The calculation is based on averaged data from integration projects delivered with gravity.integration. Actual savings vary with system complexity and the specifics of your IT environment.',
  'roi.params.h3': 'Project parameters',
  'roi.costs.h3': 'Costs',
  'roi.slider.projects': 'Integration projects / year',
  'roi.slider.days': 'Avg. project length (working days)',
  'roi.slider.team': 'Team size',
  'roi.slider.rate': 'Day rate (PLN net)',
  'roi.slider.tools': 'Current tools / licences (PLN / year)',
  'roi.kpi.save': 'Annual savings (PLN)',
  'roi.kpi.extra': 'Extra projects in the same time',
  'roi.kpi.roi': 'First-year ROI',
  'roi.chart.h3': 'Project delivery time (working days)',
  'roi.bar.current': 'Today',
  'roi.bar.gravity': 'gravity',
  'roi.th.phase': 'Phase',
  'roi.th.current': 'Current cost',
  'roi.th.gravity': 'With gravity',
  'roi.th.savings': 'Savings',
  'roi.row.dev': 'Development',
  'roi.row.test': 'Testing',
  'roi.row.deploy': 'Deployment',
  'roi.row.maint': 'Maintenance',
  'roi.row.tools': 'Licences / tools',
  'roi.row.total': 'Total / year',
  'roi.days.unit': ' days',
  'roi.pln.unit': ' PLN',
  'roi.numberLocale': 'en-US',
  'roi.cta': 'Download gravity.integration for free',

  /* Case studies --------------------------------------------------------------
     Must equal the payoff-stage heading in the ENGLISH content files once
     Phase 4c translates them — the matcher and the content move together. */
  'cs.payoff': 'Results',

  /* Generic section furniture --------------------------------------------------- */
  'common.download': 'Download',
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

/** Every key still missing from a locale. Should be empty from Phase 3 on;
 *  the pre-ship audit in Phase 6 asserts it. */
export function untranslated(lang: Lang): UiKey[] {
  if (lang === DEFAULT_LOCALE) return [];
  return (Object.keys(ui.pl) as UiKey[]).filter((k) => ui[lang][k] === undefined);
}
