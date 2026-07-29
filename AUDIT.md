# Technical Audit — gravity.integration (Astro rebuild)

`/impeccable audit` · web · register: brand · scope: **18 routes** (10 Polish, 8 English) × **4 viewports** (1440 / 768 / 390 / 320) = **72 combinations**, measured against a production build served locally.

Every finding below survived a second instrument. The raw sweep produced 2 contrast failures, 11 missing focus rings, 9 undersized targets and 27 "text over an image" cases; verification cut those to **0, 0, 8 and 0** — with one new and different finding taking the focus-ring group's place, found by the arbitration rather than by the sweep. What was thrown out is listed under *Suppressed false positives* so a re-run doesn't re-report it.

This supersedes the previous audit (12/20, same scope). Of its 19 findings, **12 verify fixed, 2 are materially improved but not closed, and 5 remain open.** Every one was re-measured; none is carried forward as "fixed" because a commit claimed to fix it.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 / 4 | No `<nav>` landmark on any of the 18 routes; the ROI sliders' focus ring measures 2.98:1 against a 3:1 floor |
| 2 | Performance | 3 / 4 | Total weight across 18 routes is down 68% to 5.83 MB; 11 images still ship at ≥2× their displayed width |
| 3 | Responsive Design | 3 / 4 | Zero horizontal overflow in 72 of 72 combinations; seven 17 px contact links remain below the 24 px AA floor |
| 4 | Theming | 3 / 4 | 121 hex literals against 167 token references — the ratio has inverted, but 27 of the survivors are the brand green |
| 5 | Anti-Patterns | 4 / 4 | No AI tells, and the two washed-out translucent-white instances that cost this dimension a point last time now measure clear |
| **Total** | | **16 / 20** | **Good — minor issues only** |

Up from 12/20 at identical scope, and **zero P0 and zero P1 for the first time.** Four points moved: accessibility and performance each gained one from the harden and optimize passes, theming gained one as token adoption crossed over, and anti-patterns returned to full marks because the two contrast failures behind its deduction are gone and there is no third.

## Anti-Patterns Verdict

**Pass, without caveat.** This does not look AI-generated, and it is not close.

Being brutally honest about what I looked for and did not find: `background-clip: text` appears **zero** times; `backdrop-filter` **zero**; `text-transform: uppercase` **zero** outside the vendored layer; no `01 / 02 / 03` numbered section scaffolding; no tiny uppercase tracked eyebrow above section headings; no hero-metric template; no repeating identical icon-heading-text card grid; no side-stripe accent borders; no `z-index` of three digits or more anywhere in the new code; a single `will-change`; and no cream/sand/beige body background. All four `cubic-bezier` curves in the built CSS are monotone ease-outs with both ordinates inside [0,1] — no bounce, no elastic, no overshoot. The palette is a committed dark slate carrying a single saturated green, which is a strategy rather than a default. Epilogue, Inter and Telegraf are the existing brand's committed typefaces on a ported commercial identity, so they are not scored as reflex picks.

Last pass deducted a point for **washed-out translucent white on a coloured surface**, present twice. Both are now measured clear: the hero social-proof line composites to **6.25:1** and the "(optional)" field hints to **5.24:1**. There is no third instance. The point is returned.

The one change worth naming explicitly as *not* a tell is the new green menu item. A single item in a list rendered in the accent colour is exactly the shape of a reflex — except this one is the item the entire site funnels toward, it is the only green item in the menu, and it inverts to white on hover and keyboard focus rather than reusing the green, so it is the one item in the list that would otherwise have had no pointer feedback. Measured on the menu's real painted ground: **3.22:1** at rest and **5.09:1** inverted, on 36–64 px type where AA asks 3:1. That is a decision with a reason behind it, which is the difference.

## Executive Summary

- **Audit Health Score: 16 / 20 (Good — minor issues only)**
- **11 verified issues: 0 P0 · 0 P1 · 7 P2 · 4 P3**
- Nothing left is systemic. The previous audit's central pattern — every accessibility gap living in the ported `legacy.css` layer — has been closed out; what remains clusters by **style rule**, not by page, which is why eleven findings produce no P1s.

**Top five:**

1. **Seven contact links are 17 px tall**, below the 24 px AA target floor, on `/kontakt/` and `/en/contact/`. One `.btn-text` rule, one line to fix. (P2-1 · WCAG 2.5.8 AA)
2. **The five ROI sliders' focus ring measures 2.98:1** against the 3:1 non-text-contrast floor. The ring is real and correctly implemented — it is drawn on `::-webkit-slider-thumb`, which is why no DOM-level probe can see it — it is simply two hundredths short. (P2-2 · WCAG 1.4.11 AA)
3. **No `<nav>` landmark exists on any of the 18 routes.** The header's navigation is marked up as `<section class="nav-main">`. Screen-reader users navigating by landmark find `main`, `header` and `footer`, and no navigation. (P2-3 · WCAG 1.3.1 A)
4. **Eleven images still ship at ≥2× their displayed width**, worst case 8.4× — down from 21, but the remaining set includes a 2560 px JPEG drawn at 305 px. (P2-6)
5. **121 hex literals against 167 token references.** The ratio inverted since the last pass (it was 216 against 78), but 27 of the survivors are the brand green in two components. (P2-5)

**Next steps:** `/impeccable adapt` carries the largest group — the contact links, the footer logo, the slider ring's alpha and the AAA target sizes. Then `/impeccable harden` for the `<nav>` landmark, `/impeccable clarify` for the "here" link, `/impeccable optimize` for the oversized images and the missing `decoding` attributes, `/impeccable animate` for the one stylesheet without a reduced-motion block, and `/impeccable polish` last to finish the token migration.

## Detailed Findings by Severity

### P0 — Critical

None.

### P1 — Major

None. This is the first pass at this scope with no P1 findings.

### P2 — Minor

**[P2-1] Seven contact links are 17 px tall, below the AA target floor**

- **Location:** `/kontakt/` and `/en/contact/` — seven `a.btn.btn-text` links, including `graffiti-erp.pl`, `caffeine-minds.com`, `dminvestments.pl`, `contact@caffeine-minds.com` and the privacy-policy link in both locales
- **Category:** Responsive
- **Impact:** These are standalone links in a contact block, not inline links inside prose, so WCAG's inline exemption does not apply. On a phone they are a 17 px strip, and a mis-tap lands on the neighbouring link — which is a different company's website. Carried forward unchanged from the previous audit; the count is seven rather than six because the English contact page gained a link since.
- **WCAG:** 2.5.8 Target Size (Minimum), AA — 24×24 required
- **Recommendation:** `padding-block: 6px` on `.btn-text` inside the contact block takes them to 29 px without changing the visual rhythm, since the padding is transparent. One rule covers all seven.
- **Suggested command:** `/impeccable adapt`

**[P2-2] The ROI sliders' focus ring measures 2.98:1**

- **Location:** `/kalkulator/` — `#s-projects`, `#s-days`, `#s-team`, `#s-rate`, `#s-tool`. The rule is `.gi-range:focus-visible::-webkit-slider-thumb { box-shadow: rgba(39,234,147,0.3) 0 0 0 4px }`.
- **Category:** Accessibility
- **Impact:** Under a real Tab the ring is painted — 340 changed pixels, cluster confined to the thumb — but at 30% alpha the green composites to `rgb(60,121,111)` against the track's `rgb(36,37,56)`, which is **2.98:1** where 3:1 is required. It is a genuine, narrow miss on a control whose position is the only thing that tells the user which slider they are on.
- **Note on how this was found:** the sweep reported these five as *no focus ring at all*, because `getComputedStyle` on the input reports `outline: none` and a fully transparent `box-shadow` — a ring drawn on `::-webkit-slider-thumb` is invisible to any DOM-level query. That reading was a false positive, but the arbitration that cleared it is what surfaced the real, different problem underneath. Had the sweep been trusted in either direction, this finding would not exist.
- **WCAG:** 1.4.11 Non-text Contrast, AA — 3:1 for the indicator against what is adjacent
- **Recommendation:** Raise the alpha from `0.3` to `0.38`; that composites to roughly 3.4:1 on the same track and changes nothing else about the treatment. Widening the ring does not help — contrast, not size, is what is short.
- **Suggested command:** `/impeccable adapt`

**[P2-3] No `<nav>` landmark on any route**

- **Location:** `Header.astro` — the primary navigation is `<section class="nav-main">`. Landmark counts are identical on all 18 routes: `{ main: 1, nav: 0, header: 1, footer: 1, h1: 1 }`.
- **Category:** Accessibility
- **Impact:** A screen-reader user pulling up the landmark list finds banner, main and contentinfo, and no navigation — on a site whose entire menu lives behind one control. The skip link (added by the harden pass, present on all 18 routes) partly covers the sighted-keyboard case, but landmark navigation has no substitute.
- **WCAG:** 1.3.1 Info and Relationships, A
- **Recommendation:** Change the element to `<nav class="nav-main">` and give it an `aria-label` from `ui.ts` so it is named per locale. Nothing else needs to move; the class carries all the styling.
- **Suggested command:** `/impeccable harden`

**[P2-4] Link text "here" carries no context**

- **Location:** `/en/pricing/`, an `<a href="/en/contact/">` whose entire text is "here"
- **Category:** Accessibility
- **Impact:** Screen-reader users commonly navigate by pulling up a list of a page's links; "here" tells them nothing. It is still the only such link on the site. Carried forward unchanged.
- **WCAG:** 2.4.4 Link Purpose (In Context), A
- **Recommendation:** Replace with the destination — "get in touch" or "contact us" — now that the target is confirmed to be `/en/contact/`.
- **Suggested command:** `/impeccable clarify`

**[P2-5] 121 hex literals remain against 167 token references**

- **Location:** `src/components`, `src/pages`, `src/layouts`. Heaviest: `DownloadPage.astro` (29), `DemoSection.astro` (22).
- **Category:** Theming
- **Impact:** The previous audit measured 216 literals against 78 token uses; the polish pass inverted that to **121 against 167**, with 39 tokens now defined. The remaining problem is narrower and more specific: **27 of the 121 are the brand green**, concentrated in two components. A brand-colour change today still means editing two files by hand.
- **Recommendation:** Finish the substitution in `DownloadPage.astro` and `DemoSection.astro` first — those two account for 42% of what is left. The 37 uppercase `#27EA93` occurrences that remain are inside SVG artwork (`SvgHeroDevelopers.astro` 24, `SvgHeroBusiness.astro` 13) plus three inline-SVG uses in `Header.astro` and the token definition itself; SVG artwork is out of scope by explicit instruction and should not be counted against this.
- **Suggested command:** `/impeccable polish`

**[P2-6] Eleven images ship at ≥2× their displayed width**

- **Location:** `etl-scaled.jpg` 8.4× (2560 → 305), four case-study logos 7.6× (520 → 68), `heropricing.webp` and `contact.webp` 4.7×, `img.webp` 3.0×, `etl-text.webp` and `CM_CLAIM.webp` 2.7×, `kapitan-navi-gravity-integration-etl.webp` 2.4×
- **Category:** Performance
- **Impact:** Down from 21, and all but one are now WebP — the format work landed, the resampling did not. Bytes are still downloaded and discarded, and the browser still pays decode and rescale on the main thread. The four case-study logos are the clearest case: roughly 58× more pixels than are painted.
- **Recommendation:** Resample at source to the largest size actually displayed, then re-encode. The assets live in `public/`, so Astro's image pipeline never sees them — `media-src/` holds the originals, which is where this work starts.
- **Suggested command:** `/impeccable optimize`

**[P2-7] The footer logo drops to 19.1 px tall at 320 px**

- **Location:** `a.logo` in the footer, `small` viewport (320×640), every route
- **Category:** Responsive
- **Impact:** 88.4×19.1. The previous audit attributed this to the header logo; enumerating all 144 `a.logo` instances across 18 routes × 4 viewports settles it — the header logo measures 112.5×24.2 at 320 and clears the floor, the footer one does not.
- **WCAG:** 2.5.8 Target Size (Minimum), AA
- **Recommendation:** `min-height: 44px` on the footer anchor with the mark centred inside it. The mark itself does not need to grow.
- **Suggested command:** `/impeccable adapt`

### P3 — Polish

**[P3-1] 43 controls sit between 24 px and 44 px**

- **Location:** Across all 18 routes — the announcement-bar CTAs, the language switcher, the consent-panel controls, the calculator sliders and the header hamburger
- **Category:** Responsive
- **Impact:** All clear the 24 px AA floor, so this is comfort rather than compliance. The bar CTAs are the ones worth raising: they sit at the very top edge of the screen, where thumbs are least accurate.
- **WCAG:** 2.5.5 Target Size (Enhanced), AAA
- **Recommendation:** Take the bar CTAs to 44 px on touch viewports only, via `@media (pointer: coarse)`, so the desktop bar keeps its slim proportions.
- **Suggested command:** `/impeccable adapt`

**[P3-2] One stylesheet ships motion with no reduced-motion escape**

- **Location:** `WhatIsEsb.Dm9LqSoJ.css` — the only one of six built stylesheets with zero `prefers-reduced-motion` blocks, while shipping two animation/transition declarations. Loaded by `/czym-jest-esb/` and `/en/what-is-esb/`.
- **Category:** Accessibility
- **Impact:** Small in absolute terms, but it is a hole in an otherwise complete policy: the other five stylesheets all honour the preference. Carried forward unchanged.
- **Recommendation:** Add the same `@media (prefers-reduced-motion: reduce)` block the other five already use.
- **Suggested command:** `/impeccable animate`

**[P3-3] Focus indicators fall short of AAA focus appearance**

- **Location:** Ten of the eleven keyboard-focusable form controls tested at 1440
- **Category:** Accessibility
- **Impact:** Measured as the ratio between the focused and unfocused states of the changed area: the four demo fields reach **1.80:1**, the five sliders **2.06:1**, `#dl-email` **2.32:1**, against the 3:1 AAA threshold. `#dl-company` is the sole pass at **11.96:1**. All of these pass the AA criterion (1.4.11) comfortably except the sliders, which are recorded separately as P2-2 — this finding is the AAA layer only.
- **WCAG:** 2.4.13 Focus Appearance, AAA
- **Recommendation:** Recorded for completeness and probably not worth taking. Reaching 3:1 state-to-state on the demo fields would mean a heavier ring than the design calls for, on controls whose AA indicator is already 6.96:1 against its surround. Fix P2-2 and leave the rest.
- **Suggested command:** none — informational

**[P3-4] 292 images ship without a `decoding` attribute**

- **Location:** Across all 18 routes
- **Category:** Performance
- **Impact:** Minor. Every image already carries `width`, `height` and `loading`, so there is no layout shift and no eager-loading waste; `decoding="async"` would only keep image decode off the critical path during first paint. Worth doing in the same pass as the resampling, not on its own.
- **Recommendation:** `decoding="async"` on everything below the fold; leave the header logo synchronous.
- **Suggested command:** `/impeccable optimize`

## Previous findings, re-measured

Every one of the previous audit's 19 findings was re-measured against the current build. None was carried forward on the strength of a commit message.

**Fixed — 12:**

- **P1-1** hero social-proof line: 3.77 → **6.25:1** (composited from `rgba(255,255,255,0.55)` over black, at 12.8 px/300)
- **P1-2** "(optional)" hints: 4.19 → **5.24:1** (`rgba(255,255,255,0.78)` over `rgb(83,85,104)`, at 13.6 px/400)
- **P1-3** the hamburger: draws a ring under real keyboard focus, 629 changed pixels, **10.54:1** indicator against its ground
- **P1-4** the logo link: all **144** instances (18 routes × 4 viewports × 2 logos) carry an accessible name — three distinct shapes, all named
- **P1-5** the five ROI sliders: every one now carries a `<label for>`; announced names are the visible captions
- **P1-6** `/case-studies/`: **2.78 MB → 336 kB**
- **P1-7** the contact email field: **12.48:1** indicator under real keyboard focus
- **P2-3** `autocomplete`: present, alongside `required` and `aria-required`
- **P2-8** the skip link: present on all **18** routes
- **P3-2** images without `loading`: **zero**
- **P3-3** brand-green letter case: resolved in authored CSS; the 37 uppercase occurrences that remain are SVG artwork, out of scope
- **P3-4** CSS weight: **172–189 kB → 47–61 kB** per route

**Improved but not closed — 2:**

- **P2-5** tokens: 216 literals / 78 references → **121 / 167**, with 39 tokens defined. Re-reported above.
- **P2-6** oversized images: **21 → 11**, all but one now WebP, none resampled. Re-reported above.

**Still open — 5:** P2-1 (contact links), P2-2 (the logo at 320 — re-attributed to the footer logo and re-reported as P2-7), P2-4 ("here"), P2-7 (WhatIsEsb reduced motion — re-reported as P3-2), P3-1 (targets between 24 and 44 px).

## Patterns & Systemic Issues

**The legacy layer is no longer the story.** The previous audit's strongest signal was that every accessibility gap lived in ported code while every hand-built component was clean. That pattern is closed: the focus indicators, the accessible names, the labels and the contrast fixes all landed, and `legacy.css` went from 162,623 to 28,912 bytes along the way. Nothing in this pass traces back to it.

**What is left clusters by style rule, not by page.** Eleven findings, four underlying causes: one `.btn-text` rule (seven links), one `::-webkit-slider-thumb` alpha (five sliders), one element name in `Header.astro` (18 routes), one un-run resampling step (eleven images). That is why there are no P1s despite the finding count — nothing here compounds, and each fix is bounded.

**Instrumentation lied more than the site did, and in a specific direction.** All 13 raw findings — 2 contrast, 11 focus — were false positives. Every one of them was a case of a probe reporting *the absence of what it cannot observe* as the absence of the thing itself: `getComputedStyle` on a range input cannot see a shadow drawn on `::-webkit-slider-thumb`; a CSS-only backdrop walk cannot resolve ink behind a transparent fixed header; an off-screen honeypot at x = −9566 reads as "in the DOM" to anything that doesn't check where it actually sits. The corrective is not a better probe but a second instrument of a different kind — pixels, under a real Tab. Worth stating plainly: **the one genuinely new finding in this audit (P2-2) was produced by the arbitration, not by the sweep.** Had the sweep's eleven focus findings been trusted, the report would have been eleven wrong things and one missing right one.

**Colour discipline improved faster than colour consolidation.** The letter-case inconsistency is gone from authored CSS and the token file grew to 39 entries, but 121 literals remain and 27 of them are the one colour the token file exists to own. Discipline arrived; the migration is still two components short of done.

## Positive Findings

**Zero horizontal overflow in 72 of 72 combinations.** At 320, 390, 768 and 1440, across all 18 routes, in both locales. This is the single most common failure in the responsive category and it does not occur once.

**Zero JavaScript errors and zero console warnings** on every route at every viewport.

**Semantic structure is correct throughout:** exactly one `<h1>` per page, **zero** heading-level skips anywhere, `<main>` on every route, no clickable `<div>`s, no images missing `alt`. The `<nav>` gap (P2-3) is the only structural finding.

**Every image carries explicit `width`, `height` and `loading`.** Zero exceptions across 292 images. Layout shift from media is structurally impossible on this site.

**Total weight across the 18 routes fell from 18.1 MB to 5.83 MB** — a 68% reduction, measured as real transfer bytes rather than declared `Content-Length`. The heaviest route is now `/technologia/` at 535 kB; the lightest, `/polityka-prywatnosci/`, is 181 kB.

**Form accessibility is complete.** Labels, `autocomplete`, `required` and `aria-required` on every field; accessible names on all five sliders; a visible focus indicator on every one of the eleven controls tested under a real keyboard.

**The honeypot is correctly implemented.** Off-screen at x = −9566 inside a 1×1 wrapper, `tabindex="-1"` — invisible to both users and the tab order, which is what makes it a honeypot rather than a trap. It generated three findings in the raw sweep, all correctly false.

**Reduced motion is honoured in five of six stylesheets,** which makes it a policy rather than an accident. Only `WhatIsEsb` was missed.

**`tokens.css` is a real design system** — a proper colour ramp, a genuine semantic z-index scale, layout tokens, 39 entries. The remaining problem is adoption in two components, not design.

**Motion is disciplined.** One `will-change` on the whole site, no unbounded blur or filter effects, no animation of layout properties, and all four `cubic-bezier` curves monotone ease-outs with ordinates inside [0,1].

**Both recent changes verify clean.** The green download item in the menu measures 3.22:1 at rest and 5.09:1 inverted on 36–64 px type, and the direct-installer link in the download form's success panel renders and fires its `direct_download` event without re-firing `generate_lead`.

## Suppressed false positives

Recorded so a re-run doesn't re-report them:

- **`span.btn.btn-text` "MENU"** — the fixed header is transparent, which defeats a CSS-only backdrop walk. Pixel-arbitrated at **16.67:1**.
- **The honeypot label "Leave this field empty"** and the two target-size findings on the fields beside it — the element sits at **x = −9566** in a 1×1 wrapper with `tabindex="-1"`. Not on the page.
- **All 11 "no focus ring" findings.** Under a real Tab, every one paints an indicator. The five slider cases survive in altered form as **P2-2 — a *contrast* finding, not an absence**; the other six are cleanly false. `getComputedStyle` on the input reports `outline: none` and a transparent `box-shadow` because the ring lives on `::-webkit-slider-thumb`, which it can never reach.
- **All 27 "text over an image" cases** — pixel-arbitrated; none fail.
- **The footer logo's empty `text` field.** `probe.targets[].text` is `textContent`, not an accessible name; reading it as a name manufactures a phantom "unnamed logo link". Enumerating every naming source across all 144 instances found no unnamed logo.
- **"0 oversized images"** — an earlier query read fields (`i.nw` / `i.dw`) that do not exist in the record shape (`natural: [w,h]` / `shown: [w,h]`), so every record fell through and the query returned a convenient zero. The real answer is 11. A null instrument is not a pass.

## Recommended Actions

1. **[P2] `/impeccable adapt`** — the largest group. The seven 17 px contact links to 29 px via transparent padding, the footer logo to 44 px at 320, the slider ring's alpha from 0.3 to 0.38, and the 28 px announcement-bar CTAs to 44 px under `@media (pointer: coarse)`.
2. **[P2] `/impeccable harden`** — change `<section class="nav-main">` to `<nav class="nav-main">` with a per-locale `aria-label` from `ui.ts`.
3. **[P2] `/impeccable clarify`** — replace the bare "here" on `/en/pricing/` with its destination.
4. **[P2] `/impeccable optimize`** — resample the 11 oversized images at source (starting with `etl-scaled.jpg` at 8.4× and the four case-study logos at 7.6×), and add `decoding="async"` below the fold.
5. **[P3] `/impeccable animate`** — add the missing `prefers-reduced-motion` block to `WhatIsEsb`, matching the five stylesheets that already have one.
6. **[P2] `/impeccable polish`** — finish the token migration in `DownloadPage.astro` (29 literals) and `DemoSection.astro` (22), and move the hero social-proof line's inline style into the stylesheet.
