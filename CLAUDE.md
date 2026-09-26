# Working on gravity-integration.com

Read this before touching anything. It is the operating manual for this
repository: what the project is, how to build and verify it, what must not be
changed, and the traps that have already cost time.

The companion document is `../START-HERE.md`, one level up, outside the repo.
That one is written for Artur — orientation, current state, the prioritised
backlog. This one is written for you. When they disagree, measure and fix both.

---

## What this is

The marketing site for **gravity.integration**, an enterprise service bus. A
static Astro build, content in Git as JSON, served as plain files from Artur's
own Apache box. No Node, no PHP, no database on the server. Forms post straight
from the browser to MailerLite.

**v2 (branch `design-v2`, September 2026)** is the same site rebuilt onto the
new design system, "Mass" v2.0. The copy, URLs, SEO, forms, consent and
analytics are unchanged; every line of markup and CSS was written again.
`DESIGN.md` is the visual system and says what came from where. The design
system itself is `2_0/Gravity Design System.html`, beside the repo, not in it.

Polish at the root, English under `/en/`. Twenty routes: ten Polish pages,
eight English, plus two 404s.

## Where things are

```
SITES/gravity-integration/          the project folder — media, docs, deploy artefacts
  gravity-integration-site/         the v1 clone (main)
  2_0/                              the v2 design system and the v2 work:
    Gravity Design System.html      the design system (§01–§08), read-only
    gravity-integration-site/       a clone on branch design-v2 — v2 lives here
    gravity-v2-preview/             a built v2 site; PREVIEW.command serves it
  gravity-deploy-YYYYMMDD/          a built site, ready to upload. Disposable.
  READ-BEFORE-UPLOADING.txt         upload instructions in plain text
  START-HERE.md                     Artur's brief. Keep it in step with this file.
  _BIN-safe-to-delete/              nothing in here is needed. Safe to empty.
  <everything else>                 source material: video, PSDs, docs, exports
```

Anything outside `gravity-integration-site/` is **not** version-controlled.
Do not assume a file you find beside the repo is tracked.

## Commands

```bash
npm ci                # Node 22.12+ required — Astro 7's engine constraint
npm run dev           # http://localhost:4321
npm run build         # → dist/ . This is also the typecheck.
npm run preview       # serve the built output
```

`npx astro check` hangs. It is not slow, it does not finish. `npm run build`
is how this project typechecks.

CI (`.github/workflows/build.yml`) builds every push and attaches `dist/` as an
artifact. A green check means the tree still builds. It does not deploy.

## Repository layout

```
src/
  pages/                    routes; [...slug] renders the JSON page collection
  layouts/Site.astro        head, SEO, GA4/consent, JSON-LD shell
  components/               17 section components (hero, pricing, ROI calc, …)
  content/pages/*.json      page content: sections, verbatim SEO meta, h1
  content/case-studies/     4 case studies (anchors #section0…#section6 kept)
  data/                     clients, 139 integrations, site config, redirects,
                            intrinsic image dimensions (CLS guard)
  i18n/                     ui.ts (strings), routes.ts (slug ↔ URL, NOT_OFFERED),
                            sitemap-data.mjs (must stay .mjs — see traps)
  lib/                      case-study parser, media resolver, MailerLite, links,
                            html.ts (clean() + typeset() for heading breaks),
                            icons.ts (Lucide, ?raw)
  scripts/ml-forms.ts       shared form runtime: submit, validation, GA4 events
  styles/tokens.css         design tokens: the design system's block verbatim,
                            then the site's layer (fluid type scale, z-index…)
  styles/base.css           surfaces, type classes, buttons, forms, cards
public/                     copied verbatim into dist/ — media, video, fonts,
                            favicons, .htaccess, robots.txt, .well-known/
media-src/                  originals of re-encoded assets, plus orphans/
deploy/nginx-gravity.conf   nginx equivalent of public/.htaccess
scripts/                    Playwright harnesses. Not part of the build.
```

Built CSS lands in **`dist/_assets/`**, not `dist/_astro/`.

## How to verify your work

None of these is optional. Each exists because something got through without it.

Serve a directory first, in its own call:

```bash
(setsid nohup python3 -m http.server 8412 -d dist > /tmp/s.log 2>&1 < /dev/null &)
```

Then run the harness. `CHROME` points at a Chromium binary; in a cloud sandbox
that is `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Running locally,
`npx playwright install chromium` once and then omit `CHROME` entirely —
`executablePath: undefined` makes Playwright use its own.

| Harness | What it proves | Clean output |
|---|---|---|
| `verify-final-two.mjs` | the download is the one highlighted action on the bar and in the menu dialog (contrast, hover, focus, modal behaviour) at 1440/768/390; the post-submit direct-download link in both locales | `69 passed, 0 failed` |
| `consent.mjs` | nothing loads before consent; equal buttons; withdrawal clears cookies; one `generate_lead` | `56 passed, 0 failed` |
| `ml-forms-routed.mjs` | the request each form builds and how it renders each MailerLite reply — **intercepted, nothing is sent** | `ALL ASSERTIONS PASSED` (two `ERR_FAILED` console lines are the network-failure case) |
| `verify-ads-conversion.mjs` | the download conversion guard and `generate_lead` | `12 passed, 0 failed` |
| `verify-mailerlite-consent.mjs` | the MailerLite pop-up tag waits for consent and never loads on `/en/` | `clean — …` |
| `verify-harden-names.mjs` | accessible names, from Chrome's accessibility tree | `all accessible names and announced values verified` |
| `verify-harden-a11y.mjs` + `measure-focus-pairs.py` | 16 focus indicators, reached with a real Tab, ≥3:1 against their backdrop | `all focus indicators verified at >= 3.0:1` |
| `verify-axe.mjs` | axe-core, WCAG 2.2 AA + best practice, 20 routes × 1440/390, the consent panel, the open menu | `0 violations` |
| `verify-overflow.mjs` | no text off-screen, spilling, or cut by a clipping frame, 20 routes × 6 widths | `0 problems` |
| `verify-video-seam.mjs` | the `connect-systems` loop plays, fits its frame uncropped, and its edge decodes to the frame's fill (≤1 level) | `22 passed, 0 failed` |
| `verify-delivery.mjs` | walks the **extracted archive**, not `dist/` | `clean — 8 English pages, …` |
| `shots.mjs` | full-page screenshots for looking at: `ROUTES=/,/cennik/ WIDTHS=1440,390 OUT=dir` | — |

All take `ORIGIN=http://127.0.0.1:8412` (the served `dist/`) and `CHROME=…`.

**Never run `ml-forms-e2e.mjs`.** It submits the real forms and creates
subscribers in the live MailerLite account — a write, which the rule below
forbids. `ml-forms-routed.mjs` covers the same client code without sending
anything.

`verify-final-two.mjs` was rewritten for v2 (v1's version clicked a
`button.hamburger` that no longer exists). `verify-overflow.mjs` and
`verify-axe.mjs` are new in v2; `axe-core` is a devDependency for the latter.
`verify-overflow.mjs` takes `INJECT_CSS` to re-create a known fault and prove
it can see one — do that before trusting a clean run.

**v1-era harnesses that no longer apply** — they target v1 markup, v1 colours
or a v1 baseline, and fail or pass for reasons that mean nothing now:
`regress-pixels.mjs` / `regress-pl.mjs` (pixel diffs against a v1 baseline —
make a v2 baseline before reusing), `audit-*.mjs`, `probe-*.mjs`,
`verify-polish.mjs`, `verify-menu-control.mjs` (v1's MENU lockup),
`verify-adapt.mjs`, `verify-harden-contrast.mjs`, and the `legacy.css` tools
(`css-usage.mjs`, `strip-css.mjs`, `removed-css.mjs`, `polish-sweep.mjs`) —
`legacy.css` is gone.

`verify-delivery.mjs` exists because the only fault this project has ever
shipped was in the packaging rather than the build.

## The one rule that outranks everything

**MailerLite is not to be changed. At all.** No new custom field, no new group,
no new automation, no account settings. Artur ruled this out explicitly and it
has not been relaxed. Both locales post to the same four forms, the same
GRAVITY group, the same automations. The radio wire values stay Polish
(`Darmowa konsultacja`, `Użytek komercyjny`) in both languages, because they
are data, not copy.

Read-only MailerLite calls are fine. Anything that writes is not.

## Settled decisions — do not reopen

- **`slug` is the language-neutral key**, the same string in both locales;
  `url` carries the localised path. A page's translation is "same slug, other
  lang". Never localise `slug`.
- **URLs use an `/en/` prefix with translated slugs** — `/en/what-is-esb/`,
  not `/en/czym-jest-esb/`.
- **No auto-redirect by browser language.** A switcher in header and footer,
  plus hreflang for Google.
- **The privacy policy is Polish-only by decision.** The English nav links it
  as "Privacy policy (in Polish)" with `hreflang="pl"`. Not a gap to fill.
- **`/en/roi-calculator/` was removed, not repriced.** Its sliders are scaled
  to Polish contractor day rates. `NOT_OFFERED` in `src/i18n/routes.ts` records
  the decision; `linkUrl` **throws** for a slug the locale does not offer,
  rather than falling back to Polish. If you remove another page from one
  locale, add it to `NOT_OFFERED` or the nav will quietly point at the Polish
  page — a link that lands somewhere wrong looks exactly like one that lands
  somewhere right until someone clicks it.
- **Proper nouns stay Polish**: Graffiti.ERP, BaseLinker, cStore, Roger,
  Comarch, Subiekt GT, Streamsoft Prestiż, ELMET POZNAŃ, Kapitan Navi,
  Trzebiatów, Zachodniopomorskie.
- **English drops Polish NBSP grouping**: `2 999 PLN` → `2,999 PLN`, `„ "` →
  `" "`. NBSP is still right in English for `sp. z o.o.`, `799 EUR`,
  `Book the demo →`, `KRS: 0000500700`.
- **The Stripe Buy buttons still point at PLN checkouts on the English site.**
  That is Artur's call, recorded in a commit message. Do not invent a
  replacement link. Do not "fix" it.
- **"Share capital: 100,000 PLN" on `/en/contact/` stays.** It is a fact from
  the Polish register about a Polish company.

## Deploying

`DEPLOY.md` is the run-book and it is written against Artur's actual server,
not a generic Apache. Two things from it that matter enough to repeat:

- **Never `rsync --delete`, never FTP "mirror" or "sync".** The docroot holds
  ten folders this build knows nothing about — `downloads`, `fonts`,
  `licencje`, `mailing`, `manual`, `old`, `supabase`, `tatoo`, `test`,
  `gravity_old`. A mirror deletes every one.
- **`.htaccess` and `.well-known/security.txt` are hidden by most FTP
  clients.** A deploy missing `.htaccess` looks like a success: pages load,
  nothing errors, and the no-www redirect, HSTS and `Options -Indexes` are all
  silently gone.

Upload the **contents** of the built folder, not the folder itself.

## Traps that have already cost time

**Instruments lie.** This is the project's central lesson and it has been
earned eighteen times over. The last automated audit produced thirteen
findings and **all thirteen were false** — every one a probe reporting the
absence of something it could not see. The focus ring on the calculator
sliders is drawn on `::-webkit-slider-thumb`, which no DOM query can reach, so
eleven controls that visibly light up under a real Tab were reported as having
no indicator at all. Chasing down why one of those "passes" made no sense is
what found the only real problem in the whole audit. When a probe reports
nothing, establish that it *can* see something before believing it.

Specific ones:

- **CSSOM does not expand nesting.** Reading rules through `document.styleSheets`
  misses nested selectors entirely — this produced 135 false findings once.
- **Off-screen honeypot fields read as visible** to naive visibility checks.
- **TypeScript generics are invalid inside `page.evaluate`.** They throw.
- **`autoplay` overrides `preload="none"`.** Setting both does not defer.
- **A screenshot taken after a hover shows the hover state.** Move the pointer
  away first.
- **`f.routes` is an object, not an array. `probe.overflow` is a scalar.**
- **Writing a probe to `/tmp` breaks `playwright` module resolution.** Harnesses
  must live inside the project.
- **`grep -c '<loc>' dist/sitemap-0.xml` returns 1** — the XML is one line.
  Use `grep -o '<loc>' | wc -l`.
- **`zip` appends to an existing archive.** `rm -f` the target first, always.
- **CLDR groups Polish thousands from five digits.** `(1500).toLocaleString('pl-PL')`
  is `'1500'`, no separator; `(12000)` is `'12 000'`. The `/kalkulator/` slider
  label reading `1500` is not a typo.
- **`@astrojs/sitemap`'s `i18n` option is unusable here** — it pairs pages by
  the residual path after stripping the locale prefix, and our slugs are
  translated, so it pairs nothing. Replaced by an explicit `serialize` hook
  driven by `slug`. `astro.config.mjs` cannot reach the content layer, so
  sitemap concerns read JSON through `node:fs` in `src/i18n/sitemap-data.mjs`,
  which must stay `.mjs`.
- **Astro only special-cases the root `404.astro`.** With `trailingSlash:
  'always'`, `src/pages/en/404.astro` would emit to `dist/en/404/index.html`,
  which Apache's `ErrorDocument` cannot use. An integration named `gi:en-404`
  renames it at `astro:build:done`.
- **`set:html` children carry no scoping attribute**, so scoped rules targeting
  them must be `:global()`. Astro also scopes every compound selector, which
  inflates specificity — `.col-7 .gi-consent-link` lands at (0,4,0) and
  silently outranks `[hidden]` at (0,3,0).
- **`draft: true`** builds the page but adds `noindex`, keeps it out of the
  sitemap, hides it from the switcher, and drops it from hreflang.
- **hreflang reciprocates.** `alternates()` returns `[]` unless every locale
  publishes the page.
- **The `Edit` tool needs a prior `Read`** and fails on NBSP and `€`
  mismatches. Some strings in `ui.ts` contain literal ` ` escape *text*,
  not the character — diagnose the actual bytes with `cat -A` before editing,
  and use a script rather than `Edit` when they differ.

From the v2 rebuild:

- **Text cut by a frame is invisible to `scrollWidth`.** Every cropped mass
  lives in an `overflow: hidden` frame. An unbreakable word (a no-break-space
  phrase, "gravity.integration") overflowing a grid track widens the element
  with it, the frame cuts the line, and the page still reports no overflow.
  Element-box checks miss it too. `verify-overflow.mjs` measures each line of
  text (a Range) against its clipping ancestor; that is what finally saw it.
- **An `auto` or bare `1fr` grid track grows to min-content.** Use
  `minmax(0, 1fr)`. The Polish copy binds phrases with no-break spaces, and a
  bound phrase is one long word to the layout.
- **A mass pinned to the viewport collides with content that flows.** The menu
  dialog's mass sat under the links on every phone. Pin masses to the
  element whose content they must clear, or drop them where there's no room.
- **Mass geometry sized in `vw` drifts from text sized in `px`.** The page
  hero's arc climbed faster than its padding grew and uncovered the title
  from ~420px up. Size the circle and its clearance from the same box.
- **A focus ring hard-coded for ink vanishes on white and on mint.** Read
  `--focus-gap` / `--focus-ring` from the surface; never write white + mint
  into a component.

In a cloud sandbox specifically: bash cwd resets between calls, so start every
command with `cd <repo> &&`; calls die at a two-minute ceiling, so background
long jobs with `(setsid CMD > log 2>&1 < /dev/null &)` and poll;
`pkill -f 'http.server'` returns exit 144 and takes the invoking shell with it,
so issue it alone.

## Delivering changes back

**v2** was delivered as a clone in `2_0/gravity-integration-site/`, on branch
`design-v2`, branched from a `main` whose tree equals the v1 patch series'
(`c81ce515…`). Artur pushes it himself. Everything below still applies to
patches against either branch.

If the session can push, push. If it cannot — a sandbox with no write
credential for GitHub is the normal case — deliver a `git format-patch` series
and let Artur apply it in his clone.

**Patches, not `git bundle`.** His clone has different commit hashes, because
he applied earlier deliveries with `git am`, which replays diffs and mints new
hashes. A bundle refuses to graft; patches do not care.

Two consequences worth internalising:

- **Compare trees, not hashes.** After a `git am` the hashes differ on both
  sides by design. `git rev-parse HEAD^{tree}` is the invariant. Comparing
  hashes will tell you a successful push failed.
- **Generate the range against his actual base**, not against a pre-built
  folder. `git format-patch <his-HEAD>..HEAD`. Guessing the range once produced
  a series that could not apply.

Never write a patch file through a shell heredoc onto a remote disk — it eats
trailing whitespace and the patch silently stops applying. Zip it and transfer
the archive. And verify by replaying into a throwaway clone and comparing the
resulting tree before telling anyone it is safe to run.

## The other documents, and where they are stale

| File | What it is | Trust |
|---|---|---|
| `README.md` | stack, layout, getting started | current |
| `DEPLOY.md` | the server run-book | current |
| `DESIGN.md` | the v2 visual system: tokens, type scale, the mass, components, motion, and the v1 behaviour carried over | current (rewritten for v2) |
| `PRODUCT.md` | product context | current |
| `AUDIT.md` | the v1 re-audit, 16/20, eleven open findings | historical — v1 markup |
| `OPTIMIZE.md` | the weight-reduction pass, 18.1 MB → 6.0 MB | current for media; v1 CSS figures |
| `POLISH.md` | the v1 design-system pass | historical — superseded by v2 |
| `EN-PLAN.md` | the English build as it was *planned* | historical |
| `HANDOFF.md` | the English build as it *happened* | mostly current — **two known errors** |
| `packaging/APPLY.txt` | notes shipped with a patch series | **one known error** |

`HANDOFF.md` says the push fails with HTTP 403. That is wrong. It fails with
`fatal: could not read Username for 'https://github.com'` — no credential is
presented at all. Anonymous read works. The distinction matters: a 403 would
mean the wrong account, which a patch series would not solve either. It also
lists clearing eleven `_to_delete_gravity-preview-*` folders as outstanding;
they are gone.

`packaging/APPLY.txt`'s `new/` vs `full/` decision rule is wrong for a clone
at `3283321` — both folders would have failed, which is why that delivery was
cut fresh with `git format-patch` instead. Do not follow that rule; measure the
range.

`scripts/package-delivery.sh` has not been re-run since, so any zips it left
behind are stale.
