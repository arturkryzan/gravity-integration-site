# Adding the English site — step by step

The Polish site is live. That single fact shapes everything below: every phase
ends with proof that the Polish pages did not move, and the English site is
built alongside rather than on top of them. Nothing in this plan edits a
Polish URL, a Polish string, or a Polish output file. If a step ever would,
that's a bug in the step.

**Decisions already taken** (yours, on 27 July):

| | |
|---|---|
| Scope | Marketing pages. The privacy policy stays Polish-only. |
| URLs | `/en/` prefix, translated slugs — `/en/what-is-esb/`, not `/en/czym-jest-esb/` |
| Pricing | Keep PLN, label it — "from 2,999 PLN/year (approx. €700)" |
| Routing | No auto-redirect. A switcher in the header and footer, hreflang for Google. |

**What ships**: nine English pages plus four case studies —
home, what-is-esb, technology, integrations, roi-calculator, pricing,
case-studies, contact, download. Roughly 6,500 words of prose and about 200
interface strings, all translated by me.

---

## The one architectural decision worth stating up front

`astro.config.mjs` already declares the locales, so the routing floor exists.
What it doesn't have is a way to say *"this English page is the translation of
that Polish one."* Without that link there's no switcher, no hreflang, and no
way to tell which pages have an English twin and which don't.

The cheapest link that works: **`slug` becomes the language-neutral key and
`url` carries the localised path.** So `czym-jest-esb` stays the slug in both
files, while `url` reads `/czym-jest-esb/` in Polish and `/en/what-is-esb/` in
English. Finding a page's translation becomes "the entry with the same slug and
the other lang" — one line, no map to maintain, and a page with no twin simply
has no match, which is exactly the behaviour the privacy policy needs.

The schema change is one field:

```ts
lang: z.enum(['pl', 'en']).default('pl'),
```

The default matters — it means the ten existing Polish JSON files need no edit
at all to keep working.

---

## Phase 1 — Foundations (nothing visible changes)

The goal of this phase is a build that is *byte-identical* to what's on the
server right now, produced by code that has learned the concept of a locale.

1. **Capture a baseline.** Build the current tree and keep `dist/` aside as
   `dist-baseline/`. This is the thing every later phase diffs against. It's
   the same technique that proved the repo was complete before the push, and
   it's the only real defence against quietly breaking a live site.

2. **Add `lang` to the `pages` and `caseStudies` schemas** in
   `src/content.config.ts`, defaulting to `'pl'`.

3. **Move the Polish content down a level** — `src/content/pages/*.json` into
   `src/content/pages/pl/`, same for `case-studies/`. Update the two `glob()`
   loaders to `pattern: '**/*.json'`. Astro's generated ids gain a `pl/`
   prefix; nothing reads ids directly, so nothing breaks.

4. **Create `src/i18n/ui.ts`** — one object, two keys, every interface string
   the site says. It starts as a Polish-only dictionary; the English half
   arrives in Phase 3. Plus a `t(lang)` helper that returns a lookup function
   and throws in dev on a missing key, so a forgotten string fails loudly at
   build time instead of rendering `undefined` on a live page.

5. **Create `src/i18n/routes.ts`** — given a slug and a lang, return the
   sibling entry's `url` or `null`. This is what the switcher and the hreflang
   tags both consume.

6. **Make `Site.astro` locale-aware.** `Astro.currentLocale` derives the
   locale from the URL automatically once i18n is configured, so no component
   needs a `lang` prop drilled through it. Wire it into `<html lang>`,
   `og:locale`, and the `inLanguage` field of the WebPage JSON-LD. With only
   Polish content present, all three resolve to exactly what they render today.

7. **Prove it.** `npm run build`, then `diff -rq dist dist-baseline`. Expect
   zero differing files. If anything differs, that's the phase's real output —
   fix it before going further.

**Ends with:** a locale-capable codebase and an unchanged site.

---

## Phase 2 — The English shell

Routing and plumbing, with one placeholder page to prove it works. Still no
translation.

1. **Add the English routes** under `src/pages/en/`: `index.astro`, a
   `[...slug]/index.astro` catch-all, and thin wrappers for the five special
   pages (`what-is-esb`, `integrations`, `roi-calculator`, `download`,
   `case-studies`). Each is a handful of lines — the page bodies already live
   in components. The Polish route files are not touched; the existing
   catch-all just gains a `lang === 'pl'` filter in `getStaticPaths`.

2. **Build the switcher.** `LangSwitch.astro`, rendered in the fullscreen nav
   and in the footer. It shows the other language when a translation exists.
   When one doesn't — the privacy policy, and any page mid-translation — it
   links to the English home rather than dead-ending, with `hreflang` on the
   anchor so assistive tech announces the language change.

3. **Emit hreflang.** In `Site.astro`'s head: `alternate` links for `pl` and
   `en` plus `x-default` pointing at Polish. Emitted **only** for pages that
   genuinely have both. A reciprocal hreflang pair that doesn't reciprocate is
   worse than none — Google discards the lot.

4. **Check the sitemap.** `@astrojs/sitemap` is already configured with the
   locale map and should emit `xhtml:link` alternates once `/en/` URLs exist.
   Worth verifying rather than assuming: if the integration doesn't pick up the
   default-locale-at-root arrangement, a `serialize` hook does it by hand.

5. **Verify.** `/en/` renders; the Polish diff is still clean apart from the
   sitemap and the switcher markup, both expected and both reviewed by eye.

**Ends with:** a navigable English shell in Polish words. Not deployable, and
not meant to be.

---

## Phase 3 — Interface strings

About 200 strings are hard-coded in 19 files. The distribution, measured:

```
DownloadPage.astro    82    Newsletter.astro      19    IntegrationsGrid       5
DemoSection.astro     54    CookieConsent.astro   15    HomeHero               4
RoiCalculator.astro   25    404.astro             13    AnnouncementBar        5
                            EsbArticle.astro      12    Header.astro           5
                            ContactForm.astro     12    + 8 files with 1–2
```

Plus `src/scripts/ml-forms.ts`, which carries the validation and error copy the
forms speak.

1. **Sweep file by file**, heaviest first, replacing each literal with a
   dictionary lookup. Mechanical, but it's where the subtle breakage lives:
   `aria-label`s, the visually-hidden "otwiera się w nowej karcie" notes, the
   `MENU`/`CLOSE` button labels, placeholder text, and `alt` attributes all
   count as interface copy and all get translated.

2. **Write the English half of the dictionary.** Not a gloss — English UI copy.
   "Umów 15-min demo" becomes "Book a 15-min demo", not "Arrange a 15-minute
   demonstration".

3. **Give `ml-forms.ts` a language.** It's a client script, so it reads
   `document.documentElement.lang` and picks its message set. No build
   coupling, works on both trees, one code path.

4. **Re-diff the Polish build.** Two hundred string moves is exactly the kind
   of change that drops a non-breaking space or a trailing period without
   anyone noticing. The diff notices.

**Ends with:** an English shell that speaks English everywhere except the page
content itself.

---

## Phase 4 — Translating the content

The substance: roughly 6,500 words. Four waves, each independently reviewable,
each ending in a rendered page you can read.

**4a — the SEO core**: home (550 w), what-is-esb (732 w + 673 w of
`esb-content.json`), technology (278 w).
**4b — the commercial pages**: pricing (436 w), roi-calculator (334 w + the FAQ
JSON-LD), integrations (37 w + category descriptions).
**4c — proof**: the case-studies page (1,423 w) and the four studies (1,327 w).
**4d — conversion**: contact (162 w), download (262 w).

How I'll translate, and what I won't do mechanically:

The Polish copy is peppered with `&nbsp;` before short words — `w&nbsp;15`,
`z&nbsp;brokerem`. That's a Polish typographic rule: single-letter words may not
end a line. **English has no such rule, so those get dropped, not carried
over.** Left in, they produce visibly odd line breaks in English. This is the
single most common tell of a machine-translated Polish site.

SEO `title`, `description` and `focusKeyword` are **rewritten, not translated**.
"polska szyna ESB nowej generacji" is a Polish search term; the English page
wants "enterprise service bus" and "ERP integration platform", which are what
English buyers actually type. Descriptions get re-fitted to the ~155-character
truncation independently — Polish and English don't compress alike.

Untouched: company and legal names (`Caffeine Minds sp. z o.o.` stays; it does
not become "Ltd"), product names, client names, and system names like Comarch
ERP XL. Converted: Polish quotation marks `„ "` to `" "`, and `2 999 PLN` to
`2,999 PLN` — Polish uses a space as the thousands separator and English
doesn't, which is a small thing that reads as sloppy when it's wrong.

Per your pricing decision, the money line becomes "from 2,999 PLN/year
(approx. €700)" — I'll need one thing from you: the euro figure you want shown,
or permission to round from a rate on the day and mark it approximate.

**Ends with:** thirteen readable English pages.

---

## Phase 5 — Forms, analytics, 404

1. **Tag English leads in MailerLite.** My recommendation: keep the four
   existing forms and the single GRAVITY group — the per-surface split already
   earns its keep for attribution — and add a `language` custom field the
   English forms submit as `en`. That gives you a segment without a parallel
   set of forms to keep in sync. Creating the field is additive and reversible;
   I'll do it on your say-so, not before.

2. **English form copy** — validation, the submitting state, the success
   message, and the failure fallback that names a contact address. Worth
   confirming `contact@caffeine-minds.com` is the right address to show an
   English-speaking visitor.

3. **An English 404.** The current one is a single global page wired via
   `ErrorDocument`. Apache 2.4's `<If "%{REQUEST_URI} =~ m#^/en/#">` lets the
   `/en/` subtree point at `/en/404.html` instead — a four-line addition to
   `public/.htaccess`, verified by curl after deploy.

4. **A language dimension in GA4**, so the English funnel is separable from the
   Polish one without guessing from URLs.

---

## Phase 6 — Audit and ship

1. **Playwright over every English page** at three widths. English runs longer
   than Polish in some places and shorter in others; headings that fit at
   `clamp()` max in Polish can overflow in English, and buttons sized to
   "Pobierz" don't always hold "Download the free version". This is the pass
   that catches it.
2. **Contrast and a11y re-check** on the English tree — same thresholds as the
   Polish audit in `AUDIT.md`.
3. **curl verification**: canonical, hreflang reciprocity, `/en/` 404, and the
   three legacy Polish redirects still behaving.
4. **The final Polish regression diff** against `dist-baseline/`.
5. **Deploy**, then submit the regenerated sitemap to Search Console and
   confirm Google sees the alternates.

---

## Open questions I'll need answered along the way

None of these block starting; all of them block finishing.

**Are the docs English?** The nav links to `docs.gravity-integration.com`. If
that documentation is Polish-only, the English nav is pointing an English
visitor at a wall. Either it's already bilingual, or the English nav needs
different wording, or the link needs a language note.

**The announcement bar** currently reads "gravity.integration v4 już
dostępna / Sprawdź zmiany". Straightforward to translate; I just want to be
sure the linked changelog is worth sending an English reader to.

**The OG image** (`og-homehero.png`) — I haven't checked whether it carries
Polish text baked in. If it does, the English pages want their own.

**The Kontakt city conflict** from the pre-launch audit — Bielsko-Biała in the
copy versus Poznań in the KRS registration — reaches the English contact page
too, and this is a good moment to settle it once for both languages.

**The euro figure** for the pricing line.

---

## Sequencing note

Phases 1–3 are infrastructure: they can run start to finish without a single
content decision from you, and they end with a working English shell you can
click through. Phase 4 is where your review actually matters, and it's split
into four waves precisely so you can read the first one and redirect the tone
before I've translated 6,500 words in a register you don't like.

If you want to compress: 4a alone plus Phases 5 and 6 would put a credible
three-page English site live — home, what-is-esb, technology, with the switcher
only offering English on pages that have it. The rest could follow without any
further structural work.
