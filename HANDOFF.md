# Where this project stands

Written at the end of the session that put the English site into euro. It
exists because this container is ephemeral and the conversation that built the
English site is not coming back. If you are picking this up cold, read this
first and `EN-PLAN.md` second — that one is the plan as it was written, this
one is what actually happened.

## The state in one paragraph

`gravity-integration.com` is a static Astro site, built from Git, deployed to
Artur's own Apache server, with forms posting straight to MailerLite. The
Polish site is live. A full English site sits alongside it at `/en/`, eight
pages, published and out of draft. The English site quotes euro, the Polish
site quotes złoty, and that split is deliberate. Two Polish pages have no
English twin on purpose — `/polityka-prywatnosci/` and `/kalkulator/` — and
the reasons are different for each; see "Pages a locale doesn't offer". Nothing has been pushed to
GitHub from here — delivery is by patch series, for the reason in the next
section.

## Why delivery is patches and not a push

The GitHub token available in these sessions gets HTTP 403 on
`arturkryzan/gravity-integration-site`. `gh` is not installed and `add_repo` is
unavailable. This has been probed enough times; probing it again costs a
round-trip and finds the same 403.

So the work ships as `git format-patch` series, assembled by
`scripts/package-delivery.sh`. **Not `git bundle`** — Artur's clone has
different commit hashes, because he applied earlier deliveries with `git am`,
which replays diffs and mints new hashes. A bundle would refuse to graft. The
patches don't care.

There is no `origin` configured locally, and the only branch is `master`.

## The open loose end on the euro pricing

It was Artur's explicit call, recorded in the commit message of "Price the
English site in euro" and in the README inside the site archive. It is not a
bug to be tidied away by the next person who notices it.

**The Stripe Buy buttons still point at the PLN-priced checkouts.** He is
setting up euro prices in Stripe himself. Until he does, an English visitor who
clicks Buy lands on a PLN checkout. Do not invent a replacement link.

There used to be a second loose end here — the English ROI calculator still
quoting PLN. It was closed by removing the page rather than by repricing it;
see the next section.

The one PLN left on an English page that is neither of those is on
`/en/contact/`: "Share capital: 100,000 PLN". That is a fact from the Polish
companies register about a Polish company. It stays.

## Pages a locale doesn't offer

`/en/roi-calculator/` was removed at Artur's request: the software is priced
for the Polish market, and the calculator is scaled to it. Its day-rate slider
runs 500–4000 with a default of 1500, which are Polish contractor rates.
Relabelling that in euro without rescaling it would ask an English visitor
whether their people cost 4,000 EUR a day, multiply by headcount, and present
the total as a finding. An English reader gets no calculator rather than a
confident wrong one.

Deleting the page was not enough, and this is the part worth knowing before
you remove any other page from one locale. `linkUrl(slug, lang)` falls back to
the Polish URL when a locale lacks the page — deliberately, because that is
right for a page awaiting translation. Delete the English file and every
English nav item pointing at it quietly starts pointing at the Polish page
instead: the fallback doing exactly what it was built to do, to a page it was
never meant to apply to. So `NOT_OFFERED` in `src/i18n/routes.ts` now records
"this locale deliberately does not have this page", `isOffered(slug, lang)` is
what navigation filters on, and `linkUrl` **throws** for a slug the locale
doesn't offer rather than falling back. The failure it guards against is
silent, and a link that lands somewhere wrong looks exactly like a link that
lands somewhere right until someone clicks it.

The privacy policy is the deliberate contrast. Also Polish-only, but it *is*
linked from the English nav, labelled "(in Polish)" with `hreflang="pl"` — a
privacy policy says the same thing in any language. That is an editorial
judgement per page, which is why it lives in a per-page list rather than being
derived from whether a file happens to exist.

Consequences, all intended: the English `nav-big` is three items (Home,
Download, Contact); Pricing sits in `nav-medium` in both locales and was not
promoted, which Artur can reverse; the home page's business-row second CTA is
absent in English; and `/kalkulator/` lost its hreflang pair and its sitemap
alternates on its own, because `alternates()` returns `[]` the moment one
locale lacks the page.

What was kept on purpose: `Calculator.astro` is still locale-aware, the English
`roi.*` strings are still in `ui.ts`, and `kalkulator-faq-jsonld.en.json` is
still on disk. `en` is checked against `pl` key for key and `untranslated('en')`
is asserted empty before ship, so deleting a translation to signal an absent
page would report as a translation gap — a different problem wanting a
different fix. Three of those strings still say PLN, which is the honest state:
it is what they would have to stop saying before the page could come back.
The way back is a euro default and range for each slider, a euro pass over the
`" PLN"` hard-coded in `RoiCalculator.astro`, restoring
`src/content/pages/en/roi-calculator.json` and the two-line route under
`src/pages/en/`, then dropping `'kalkulator'` from `NOT_OFFERED`.

## Decisions that are settled, so you don't reopen them

- **URLs** use an `/en/` prefix with *translated* slugs (`/en/what-is-esb/`, not
  `/en/czym-jest-esb/`).
- **`slug` is the language-neutral key** — the same string in both locales —
  and `url` carries the localised path. Finding a page's translation means
  "same slug, other lang". This is the whole linking design; don't localise
  `slug`.
- **No auto-redirect by browser language.** A switcher in the header and
  footer, plus hreflang for Google.
- **The privacy policy is Polish-only, by decision.** The English nav labels it
  "Privacy policy (in Polish)" and the anchors carry `hreflang="pl"`. It is not
  a gap waiting to be filled.
- **Proper nouns stay Polish**: company, product, client and place names.
  Graffiti.ERP, BaseLinker, cStore, Roger, Comarch, Subiekt GT, Streamsoft
  Prestiż, ELMET POZNAŃ, Kapitan Navi, Trzebiatów, Zachodniopomorskie.
- **MailerLite was not touched and must not be.** Both locales post to the same
  four forms, the same GRAVITY group, the same automations. No `language`
  custom field, no new group, no new automation — Artur ruled these out
  explicitly. The radio wire values stay Polish (`Darmowa konsultacja`,
  `Użytek komercyjny`) in both languages, because they are data, not copy.
- **Polish typographic NBSP grouping is dropped in English**: `2 999 PLN`
  becomes `2,999 PLN`, `„ "` becomes `" "`. But NBSP is still legitimate in
  English — `sp. z o.o.`, `799 EUR`, `Book the demo →`, `KRS: 0000500700`.

## Things that will bite you

**CLDR groups Polish thousands from five digits.** `(1500).toLocaleString('pl-PL')`
is `'1500'` with no separator; `(12000)` is `'12 000'`. English gives `'1,500'`
and `'12,000'`. This is correct behaviour and was verified in both Chromium and
Node. The `/kalkulator/` slider label reading `1500` is not a typo.

**`@astrojs/sitemap`'s `i18n` option is unusable here.** It pairs pages by the
residual path after stripping the locale prefix, and our slugs are translated,
so it pairs nothing. It is replaced by an explicit `serialize` hook driven by
`slug`. `astro.config.mjs` can't reach the content layer, so sitemap concerns
read JSON through `node:fs` in `src/i18n/sitemap-data.mjs` — which must stay
`.mjs`.

**Astro only special-cases the root `404.astro`.** With `trailingSlash: 'always'`
and directory build format, `src/pages/en/404.astro` emits to
`dist/en/404/index.html`, which Apache's `ErrorDocument` can't use. An
integration named `gi:en-404` renames it at `astro:build:done`.

**`set:html` children carry no scoping attribute**, so scoped rules targeting
them must be `:global()`. And Astro scopes every compound selector, which
inflates specificity — `.col-7 .gi-consent-link` lands at (0,4,0) and silently
outranks `[hidden]` at (0,3,0).

**hreflang reciprocates.** `alternates()` returns `[]` unless every locale has
the page published, so a draft page is not claimed. Tag values are bare `pl` /
`en` plus `x-default`; the regional pairs live in `LOCALE_TAG` (JSON-LD) and
`OG_LOCALE` (`pl_PL` / `en_US`).

**`draft: true`** builds the page but adds `noindex`, keeps it out of the
sitemap, hides it from the switcher, and drops it from hreflang. All eight
English pages are `draft: false`.

## How to check your work

Three harnesses, in `scripts/`. None of them is optional and each exists
because something got through without it.

`regress-pixels.mjs` — screenshots every Polish page at two widths against the
pre-English build and compares pixels. **Run it as
`HIDE=layout node scripts/regress-pixels.mjs`.** Without `HIDE=layout` the
footer switcher keeps a box the baseline never had, every mobile page grows
~15px, and you get a screenful of alarming diffs that mean nothing. The clean
result is **20 of 22 identical**; the two misses are the home hero at both
widths, whose floating spheres never land on the same frame twice. Needs
`dist` on 8412 and `dist-baseline` on 8413.

`verify-delivery.mjs` — walks the **extracted archive** on 8414, not `dist/`.
It starts on the Polish home page, follows the switcher across, and visits all
eight English pages. This one exists because the only fault this project has
ever shipped was in the packaging rather than the build, and it later caught
two untranslated labels that every build-level check had passed. It also
asserts the calculator's absence positively — no English page links to it, the
two Polish-only pages claim no `hreflang="en"`, and `/en/roi-calculator/` is
actually gone from the archive rather than merely unlinked. Note that a
Polish-only page still shows a switcher: `LangSwitch` falls back to the English
*home* page, which is correct and is what the check allows. Clean output is
`clean — 8 English pages, switcher round-trips, 2 Polish-only pages claim no
twin, /en/roi-calculator/ gone, 404 present`.

`package-delivery.sh` — assembles both zips, and replays both patch series into
throwaway clones to prove they reproduce the tested tree. Refuses to run on a
dirty tree.

## Environment notes

- Bash cwd resets to `/home/claude` between calls. Start every command with
  `cd /root/gravity-site &&`.
- Playwright harnesses must live inside the project and run as
  `CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/…`.
  Never run `npx playwright install`.
- Static servers: `(setsid nohup python3 -m http.server PORT -d DIR > /tmp/log 2>&1 < /dev/null &)`.
  8412 = `dist`, 8413 = `dist-baseline`, 8414 = the extracted archive.
- `pkill -f "http.server PORT"` kills the invoking shell too (exit 144).
  Restart servers in a separate call instead.
- `npx astro check` hangs. `npm run build` is the typecheck.
- `grep -c '<loc>' dist/sitemap-0.xml` returns 1 — the XML is one line. Use
  `grep -o '<loc>' | wc -l`.
- `zip` appends to an existing archive. `rm -f` the target first, always.
- The `Edit` tool needs a prior `Read` in the same context and fails on NBSP
  and `€` mismatches. When it does, diagnose the actual bytes with
  `grep -o … | cat -A` before reaching for a Python replace.

## Still open, for Artur

Carried forward and not yet answered:

- Are the docs at `docs.gravity-integration.com` available in English?
- Does `og-homehero.png` have Polish text baked into the image?
- `/kontakt/` names Bielsko-Biała in the copy but `ul. Jasielska 16, 60-476
  Poznań` in the KRS block. Which is right?
- Is `contact@caffeine-minds.com` the right address for English enquiries?
- The announcement bar links a changelog — is it Polish-only?

Before launch, on the MailerLite side: turn double opt-in **off** for Demo,
Kontakt and Newsletter (download is already off), run end-to-end form tests
from a real browser, confirm a live GA4/Ads hit, and check what `GT-K5LVDQD`
actually feeds.

Also outstanding: NAC case study metrics and quote; the Polish ROI
calculator's "Licencje / narzędzia" sign convention; deleting WordPress temp snippets 42 and
43; and clearing the eleven `_to_delete_gravity-preview-*` folders off his
Desktop.

## Accessibility item worth knowing about

`.gi-lang-row` and `.gi-consent-link` are both 38.8px tall, under the 44px
guideline. This predates the English work and is site-wide. They share the
measurement, so they should be fixed together rather than one at a time.
