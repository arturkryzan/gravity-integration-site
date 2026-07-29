# Technical Audit — gravity.integration (Astro rebuild)

`/impeccable audit` · web · register: brand · scope: **18 routes** (10 Polish, 8 English) × **4 viewports** (1440 / 768 / 390 / 320), measured against a production build served locally (`Site.oKJWfLLW.css`).

Every finding below survived a second instrument. The raw sweep produced 22 contrast failures, 13 missing focus rings, 6 missing labels and 27 "text over an image" cases; verification cut those to 2, 2, 5 and 0. What was thrown out is listed under *Suppressed false positives* so a re-run doesn't re-report it.

This supersedes the previous audit (13/20, 10 routes × 2 viewports). Its three responsive bugs, the missing H1, the arbitrary z-index and the images without dimensions all verify fixed.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 / 4 | The hamburger — the only way into the main navigation — draws no visible focus indicator on any of the 14 routes |
| 2 | Performance | 2 / 4 | `/case-studies/` ships 2.78 MB, of which a single decorative GIF is 2.35 MB |
| 3 | Responsive Design | 3 / 4 | No horizontal overflow anywhere at 320–1440; contact links are 17 px tall, below the 24 px AA floor |
| 4 | Theming | 2 / 4 | 216 hard-coded hex literals across 42 distinct values against 78 uses of `var(--gi-*)`, despite `tokens.css` being the declared single source of truth |
| 5 | Anti-Patterns | 3 / 4 | No AI tells at all; two instances of the washed-out translucent-white-on-colour pattern |
| **Total** | | **12 / 20** | **Acceptable — significant work needed** |

The score moved down from 13 while the site got better. That is the wider net: this run added the 768 px and 320 px viewports, the eight English routes, keyboard-driven focus testing and real network weight — categories the previous pass never measured. Theming dropped a point for the same reason: the token *system* is as strong as it was rated, but counting actual adoption across the component tree told a different story than reading the token file did.

## Anti-Patterns Verdict

**Pass.** This does not look AI-generated, and it isn't close.

Being brutally honest about what I looked for and did not find: no gradient text anywhere (`background-clip: text` appears zero times in the component tree), no `backdrop-filter` and no glassmorphism, no tiny uppercase tracked eyebrow above section headings (`text-transform: uppercase` appears zero times outside the vendored Bootstrap layer), no `01 / 02 / 03` numbered section scaffolding, no hero-metric template, no repeating identical icon-heading-text card grid, no bounce or elastic easing (no `cubic-bezier` with an overshoot control point anywhere), and no cream/sand/beige body background. The palette is a committed dark slate with a single saturated green carrying the accent load — a real strategy, not a default. Epilogue, Inter and Telegraf are the existing brand's committed typefaces on a ported commercial identity, so they are not scored as reflex picks.

The one general anti-pattern that *is* present, twice, is **washed-out translucent white on a coloured surface** — `rgba(255,255,255,0.4)` for the hero social-proof line and `rgba(255,255,255,0.65)` for the "(optional)" field hints. Both are the "gray text on a colored background looks washed out" failure, and both fail contrast (P1-1 and P1-2). The fix in each case is a heavier alpha or a solid token, not different structure.

The score is 3 rather than 4 only because of those two. There are no AI tells to deduct for.

## Executive Summary

- **Audit Health Score: 12 / 20 (Acceptable — significant work needed)**
- **19 verified issues: 0 P0 · 7 P1 · 8 P2 · 4 P3**
- The score is dragged down by three things, all concentrated rather than diffuse: the **ported legacy CSS layer** (`legacy.css` sets `outline: 0` on controls without supplying a `:focus-visible` replacement), **unoptimised source imagery** shipped at full resolution, and **hard-coded colour** in components that predates `tokens.css`.

**Top five:**

1. **The hamburger has no visible focus indicator**, and it is the only entry point to the site's navigation at every viewport. A keyboard user tabbing through the header cannot see when they have reached the menu they need. (P1-3 · WCAG 2.4.7 AA)
2. **`/case-studies/` weighs 2.78 MB** in both locales, 2.35 MB of it a single animated GIF that would be a fraction of the size as a looping muted MP4. (P1-6)
3. **The five ROI-calculator sliders have no accessible name.** A screen-reader user hears five unlabelled ranges and cannot tell which is "projects" and which is "hourly rate" — on the page whose entire purpose is that calculator. (P1-5 · WCAG 4.1.2 / 3.3.2 AA)
4. **216 hard-coded hex literals against 78 token references.** `tokens.css` is real and well-built; the component tree largely bypasses it. Any future theme change is a find-and-replace across 42 distinct values, two of which are the same green in different letter case. (P2-5)
5. **The site logo link has no accessible name on any route.** It is announced as "link", full stop — and it is the conventional back-to-home affordance. (P1-4 · WCAG 4.1.2 AA)

**Next steps:** `/impeccable harden` clears every P1 accessibility finding in one pass, since five of the seven trace to the same two lines of `legacy.css`. `/impeccable optimize` handles page weight. Then `/impeccable adapt` for touch targets, and `/impeccable polish` to consolidate colour onto tokens.

## Detailed Findings by Severity

### P1 — Major

**[P1-1] Hero social-proof line fails contrast at 3.77:1**

- **Location:** `/` and `/en/`, the customer-name line beneath the hero heading — "Wybierany przez Bispol, Frogum, Hewalex, Lindner…"
- **Category:** Accessibility
- **Impact:** 12.8 px text at `rgba(255,255,255,0.4)` on `rgb(10,10,18)`. This line carries the site's social proof, so it is content a visitor is meant to read, not decoration — and it is the least legible text on the page. On a laptop screen in daylight it disappears.
- **WCAG:** 1.4.3 Contrast (Minimum), AA — needs 4.5:1; measured 3.77:1 by pixel arbitration against the composited backdrop.
- **Recommendation:** Raise the alpha to `0.55` (≈4.9:1), or better, use `--gi-text-muted` so the value lives in the token file. Do not compensate with a larger font; 12.8 px is not large text and the threshold would not move.
- **Suggested command:** `/impeccable harden`

**[P1-2] "(optional)" field hints fail contrast at 4.19:1**

- **Location:** `span.demo-optional`, 12 routes — the demo-request block
- **Category:** Accessibility
- **Impact:** `rgba(255,255,255,0.65)` on `rgb(83,85,104)`. These hints tell the user which fields they can skip; a user who cannot read them either fills in everything or abandons the form.
- **WCAG:** 1.4.3 Contrast (Minimum), AA — needs 4.5:1; measured 4.19:1.
- **Recommendation:** `0.78` alpha reaches 5.1:1 on the same surface. The gap is small enough that darkening the surface would also work, but the alpha is the safer edit — the surface is shared with other content.
- **Suggested command:** `/impeccable harden`

**[P1-3] The hamburger draws no focus indicator**

- **Location:** `button.hamburger`, all 14 routes. Cause is `src/styles/legacy.css`: `.hamburger{…outline:0…}` with no `:focus-visible` rule anywhere to replace it.
- **Category:** Accessibility
- **Impact:** This is the sole control that opens the main navigation, at every viewport. A keyboard-only or low-vision user tabbing across the header sees nothing change when focus lands on it, so they cannot tell they have arrived. Verified under real keyboard focus with animations and caret frozen: zero pixels changed above threshold. The control is genuinely bare, not merely hard to measure.
- **WCAG:** 2.4.7 Focus Visible, AA
- **Recommendation:** Add a `:focus-visible` rule matching the pattern every hand-built component already uses (`Icons.astro`, `LangSwitch.astro`, `AnnouncementBar.astro` all do this correctly) — a 2 px `--gi-green` outline at 2 px offset, or the 4 px `rgb(39 234 147 / .3)` ring the range inputs use. Do not remove the `outline: 0`; supply the replacement.
- **Suggested command:** `/impeccable harden`

**[P1-4] The logo link has no accessible name**

- **Location:** `a.logo.d-inline-block`, every route
- **Category:** Accessibility
- **Impact:** The link wraps an SVG with no `<title>` and no text, so screen readers announce "link" and nothing more. It is also the conventional back-to-home affordance, which makes it the one link users most rely on for orientation and the one with no name.
- **WCAG:** 4.1.2 Name, Role, Value, AA
- **Recommendation:** `aria-label="gravity.integration — strona główna"` on the Polish build, the English equivalent on `/en/`, or a `<title>` inside the SVG. `ui.ts` already carries the per-locale string table, so this should be a translated key rather than a literal.
- **Suggested command:** `/impeccable harden`

**[P1-5] Five range inputs on the ROI calculator have no label**

- **Location:** `/kalkulator/` — `input#s-projects`, `#s-days`, `#s-team`, `#s-rate`, `#s-tool` in `RoiCalculator.astro`
- **Category:** Accessibility
- **Impact:** The calculator is the page's entire purpose. Non-visually it is five identical unlabelled ranges and a number that changes; there is no way to know which slider is which or what unit it carries. The visible captions exist but are not associated with the inputs.
- **WCAG:** 4.1.2 Name, Role, Value and 3.3.2 Labels or Instructions, AA
- **Recommendation:** Associate each visible caption with its input via `<label for>`, and add `aria-valuetext` so the announced value carries its unit ("14 projektów", "220 zł/h") rather than a bare number. The sliders already have a correct `:focus-visible` thumb ring, so naming is the only thing missing.
- **Suggested command:** `/impeccable harden`

**[P1-6] `/case-studies/` ships 2.78 MB, 2.35 MB of it one GIF**

- **Location:** `/case-studies/` and `/en/case-studies/` — `tiptopol-dpd-integration.gif`, 2347 kB, natural 1911×982, displayed 740×381
- **Category:** Performance
- **Impact:** On a typical 4G connection this page alone is a multi-second wait before the case study is readable, and the GIF is decoded at more than twice its display size. It is 84% of the page's total weight and 98% of its image weight — and the heaviest thing on the site by an order of magnitude. The next-largest page, `/`, is 1.36 MB.
- **Recommendation:** Convert to a muted, looping, `playsinline` MP4 or WebM at 740×381 — the same animation typically lands under 200 kB — with a static WebP poster. If it must remain a GIF, at minimum resample it to display size.
- **Suggested command:** `/impeccable optimize`

**[P1-7] The newsletter and contact email field draws no focus indicator**

- **Location:** `input#nemaiil` on 7 routes (`ContactForm.astro:30`, `Newsletter.astro:26`). Cause is the same `legacy.css` layer: `form .form-row input:not([type=checkbox]):not([type=submit]):not([type=radio]){…outline:0…}`.
- **Category:** Accessibility
- **Impact:** A keyboard user tabbing to the newsletter or contact form cannot see that the email field is focused, and there is no caret hint until they type. The `:not([type=submit])` exclusion in that selector is exactly why the submit button beside it keeps its ring while the field does not — the inconsistency reads as a rendering bug rather than a style choice.
- **WCAG:** 2.4.7 Focus Visible, AA
- **Recommendation:** Add a `:focus-visible` border-colour change plus a ring to that same selector. The hand-built demo fields (`DemoSection.astro:335`) already do precisely this; reuse the treatment so the two form styles converge instead of diverging further.
- **Suggested command:** `/impeccable harden`

### P2 — Minor

**[P2-1] Contact links are 17 px tall, below the AA target floor**

- **Location:** `/kontakt/` and `/en/contact/` — six `a.btn.btn-text` links: `graffiti-erp.pl` (173.7×17), `caffeine-minds.com` (217.7×17), `dminvestments.pl` (202.2×17), `contact@caffeine-minds.com` (223.3×17), `Polityka prywatności` (164×17), `Read it (in Polish)` (138.2×17)
- **Category:** Responsive
- **Impact:** These are standalone links in a contact block, not inline links inside prose, so WCAG's inline exemption does not apply. On a phone they are a 17 px strip — a mis-tap lands on the neighbouring link, and the neighbouring link is a different company's website.
- **WCAG:** 2.5.8 Target Size (Minimum), AA — 24×24 required
- **Recommendation:** `padding-block: 6px` on `.btn-text` inside the contact block takes them to 29 px without changing the visual rhythm, since the padding is transparent.
- **Suggested command:** `/impeccable adapt`

**[P2-2] The logo link drops to 19.1 px tall at 320 px**

- **Location:** `a.logo.d-inline-block`, `small` viewport (320×700), every route
- **Category:** Responsive
- **Impact:** 88.4×19.1 — the home link becomes the smallest tap target on the page at exactly the viewport where taps are least precise.
- **WCAG:** 2.5.8 Target Size (Minimum), AA
- **Recommendation:** Give the anchor `min-height: 44px` and centre the mark inside it; the mark itself does not need to grow.
- **Suggested command:** `/impeccable adapt`

**[P2-3] The email field has no `autocomplete`**

- **Location:** `input#nemaiil` (`name="fields[email]"`), 7 routes
- **Category:** Accessibility
- **Impact:** Browsers and password managers cannot autofill it, so every visitor types their address by hand. For users with motor or cognitive impairments this is the difference between a one-tap signup and a typo-prone one.
- **WCAG:** 1.3.5 Identify Input Purpose, AA
- **Recommendation:** `autocomplete="email"` plus `inputmode="email"`. The MailerLite field name stays exactly as it is — this changes nothing about what gets posted.
- **Suggested command:** `/impeccable harden`

**[P2-4] Link text "here" carries no context**

- **Location:** `/en/pricing/`, an `<a>` whose entire text is "here"
- **Category:** Accessibility
- **Impact:** Screen-reader users commonly navigate by pulling up a list of a page's links; "here" tells them nothing. It is the only such link on the site, so it is a one-line fix.
- **WCAG:** 2.4.4 Link Purpose (In Context), A
- **Recommendation:** Replace with the destination — "read the Polish privacy policy", or whatever the target actually is.
- **Suggested command:** `/impeccable clarify`

**[P2-5] 216 hard-coded hex literals against 78 token references**

- **Location:** `src/components`, `src/pages`, `src/layouts` — 216 literals across 42 distinct values
- **Category:** Theming
- **Impact:** `DESIGN.md` names `tokens.css` the single source of truth, and it is genuinely well-built — but the component tree bypasses it nearly 3:1. Changing the brand green means editing 64 places in two different letter cases. Worse, 7 of the 42 values are not in the token file at all (`#ffc2c2`, `#ececf3`, `#e4e5ef`, `#6b6d84`, `#4ff0a8`, `#14152a`, `#ffd166`) — one-off colours nobody decided on twice.
- **Recommendation:** Mechanical substitution for the six values that already have tokens (45× `#0a0a12` → `--gi-bg-dark`, 64× `#27EA93`/`#27ea93` → `--gi-green`, 12× `#464861` → `--gi-bg-slate`, 9× `#097a53` → `--gi-green-deep`, 7× `#242538` → `--gi-bg-card-dark`, 5× `#f3f4fb`). Then decide, one at a time, whether each of the seven orphans becomes a token or collapses into an existing one.
- **Suggested command:** `/impeccable polish`

**[P2-6] 21 images are served far larger than they are displayed**

- **Location:** worst cases `etl-scaled.jpg` (natural 2560×711, shown 305×400), `kapitan-navi-gravity-integration-etl.png` (1920×1039 → 612×332), `heropricing.jpg` and `contact.png` (1440×400 → 305×400), and four partner logos on `/pobieranie/` shipped at 800×400 to be drawn at 68×34
- **Category:** Performance
- **Impact:** Bytes downloaded and then discarded, plus decode and rescale work on the main thread. The partner logos are the clearest case — roughly 137× more pixels than are painted.
- **Recommendation:** Route these through Astro's image pipeline with explicit `widths` and WebP output, or resample at source. The markup already carries correct `width`/`height` on every image, so nothing needs to change structurally.
- **Suggested command:** `/impeccable optimize`

**[P2-7] One stylesheet ships transitions with no reduced-motion escape**

- **Location:** `WhatIsEsb.9Z0uFwVl.css` — the only one of six built stylesheets with zero `prefers-reduced-motion` blocks, while shipping `transition: color .2s` and `transition: transform .25s`
- **Category:** Accessibility / Performance
- **Impact:** Small in absolute terms, but it is a hole in an otherwise complete policy: the other five stylesheets all honour the preference. A user with vestibular sensitivity gets a consistent experience everywhere except this one component.
- **Recommendation:** Add the same `@media (prefers-reduced-motion: reduce)` block the other stylesheets already use.
- **Suggested command:** `/impeccable animate`

**[P2-8] No skip link**

- **Location:** every route
- **Category:** Accessibility
- **Impact:** A keyboard user must tab through the full header — announcement-bar CTA, language switch, logo, hamburger — on every page before reaching content. `<main>` is present on every route, which is a recognised bypass mechanism for users on assistive tech that exposes landmarks, so this is not a hard failure. It is a gap for sighted keyboard users, who have no landmark navigation.
- **WCAG:** 2.4.1 Bypass Blocks, A (satisfied via landmarks; the skip link is the sighted-keyboard complement)
- **Recommendation:** A visually-hidden `<a href="#main">` as the first focusable element, revealed on `:focus`.
- **Suggested command:** `/impeccable harden`

### P3 — Polish

**[P3-1] Announcement-bar CTAs and header controls sit below the 44 px AAA target**

- **Location:** `Pobierz teraz` (127.5×28) and `Sprawdź zmiany` (144.8×28) on 10 routes; `Download now` (119.6×28) and `See what's new` (125.2×28) on 8; `button.hamburger` at 93.9×40; the language switcher and consent link at 38.8 px; the calculator sliders at 32 px
- **Category:** Responsive
- **Impact:** All clear the 24 px AA floor, so this is comfort rather than compliance. The 28 px bar CTAs are the ones worth raising — they sit at the very top edge of the screen, where thumbs are least accurate.
- **WCAG:** 2.5.5 Target Size (Enhanced), AAA
- **Recommendation:** Take the bar CTAs to 44 px on touch viewports only, via `@media (pointer: coarse)`, so the desktop bar keeps its slim proportions.
- **Suggested command:** `/impeccable adapt`

**[P3-2] Three images ship without `loading="lazy"`**

- **Location:** `linesdownload.svg` (`/`, `/en/`), `logo-dark.svg` (every route), `logo_small.svg` (`/cennik/`, `/en/pricing/`)
- **Category:** Performance
- **Impact:** Minor — all three are small SVGs, and `logo-dark.svg` is above the fold where eager loading is correct. Only `linesdownload.svg` is a genuine miss.
- **Recommendation:** Add `loading="lazy"` to `linesdownload.svg` and `logo_small.svg`; leave the header logo eager and consider `fetchpriority="high"` on it instead.
- **Suggested command:** `/impeccable optimize`

**[P3-3] The brand green is written in two letter cases**

- **Location:** 40 occurrences of `#27EA93`, 24 of `#27ea93`
- **Category:** Theming
- **Impact:** Same colour, so nothing renders wrong — but any grep-based refactor or token migration silently misses one of the two sets. It is the reason a mechanical fix for P2-5 has to be written case-insensitively.
- **Recommendation:** Resolved by P2-5; noted separately so the substitution is written to catch both.
- **Suggested command:** `/impeccable polish`

**[P3-4] Every page ships 172–189 kB of CSS**

- **Location:** `Site.oKJWfLLW.css` at 172 kB, loaded on all 18 routes
- **Category:** Performance
- **Impact:** Render-blocking on first visit, then cached. The bulk is the vendored Bootstrap layer inside `legacy.css`, most of which the ported design does not use. Not urgent — but it is the floor under every page, including the 381 kB privacy policy where it is nearly half the weight.
- **Recommendation:** Run a coverage pass in DevTools across the 18 routes and strip the unused Bootstrap utilities. Do this *after* the P1 focus-indicator work, not before — that work touches `legacy.css` and you want one edit to it, not two.
- **Suggested command:** `/impeccable optimize`

## Patterns & Systemic Issues

**Every accessibility gap is in ported code; every hand-built component is clean.** This is the strongest signal in the audit. `legacy.css` — the minified WordPress theme layer — sets `outline: 0` on `.hamburger` and on form inputs, and its `:not([type=submit])` exclusion is precisely why the submit button keeps a ring and the email field beside it does not. Nothing supplies a replacement, and `site.css` contains zero `:focus` rules of any kind. Meanwhile every component written for this rebuild — `Icons.astro`, `LangSwitch.astro`, `Footer.astro`, `DemoSection.astro`, `CookieConsent.astro`, `AnnouncementBar.astro`, `DownloadPage.astro`, `NotFound.astro`, `RoiCalculator.astro` — ships a real `:focus-visible` treatment. The same split explains the missing accessible name on the logo and the missing labels on the ported form controls. The fix is not scattered: it is one focus-visible pass over the legacy layer, and it resolves five of the seven P1s.

**Colour was ported before the token file existed.** 216 literals against 78 `var(--gi-*)` uses, with the brand green in two letter cases and seven values that appear nowhere in `tokens.css`. This is not a design problem — the palette is coherent and deliberate — it is a migration that stopped halfway. It matters now because the token file is where the next theme decision will be made, and today that decision would not propagate.

**Images went in at source resolution.** 21 oversized images and one 2.35 MB GIF, on a site whose markup is otherwise careful: every image carries `width` and `height`, which is the harder discipline. The asset pipeline was simply never pointed at the media.

**Touch targets cluster at exactly two heights, 17 px and 28 px.** The 17 px group is the `.btn-text` link style used through the contact block; the 28 px group is the announcement bar. Both are single style rules, so both are one-line fixes rather than a sweep.

## Positive Findings

**Responsive behaviour is genuinely clean.** Zero horizontal overflow at 320, 390, 768 and 1440 across all 18 routes. That is the most common failure in this category and it does not occur once — including on the widest-content pages and at 320 px, where most sites break. The previous audit's three responsive bugs are all gone.

**Zero JavaScript errors and zero console warnings** across every route in both locales.

**Semantic structure is correct throughout:** exactly one `<h1>` per page (the previous audit's missing-H1 finding is fixed), no heading-level skips anywhere, `<main>` on every route, no clickable `<div>`s, no images missing `alt`.

**`tokens.css` is a real design system, not a token file in name only** — a proper colour ramp, a genuine semantic z-index scale (`--gi-z-decor: 2` through `--gi-z-toast: 50`; the previous audit's arbitrary `9999` is gone from the new code), and layout tokens. The problem is adoption, not design.

**Every image carries explicit `width` and `height`,** so there is no layout shift from media. The discipline that is usually missing is present here; the one that is usually present — resampling — is the one that is missing.

**The honeypot is correctly implemented.** `.demo-hp` is off-screen positioned, 1×1, `overflow: hidden`, `tabindex="-1"` — invisible to both users and the tab order, which is what makes it a honeypot rather than a trap. It generated a contrast finding and two target-size findings in the raw sweep, all correctly false.

**Reduced motion is honoured in five of six stylesheets,** which means it was a policy rather than an accident. Only `WhatIsEsb` was missed.

**No `will-change` abuse, no unbounded blur or filter effects, no animation of layout properties.** The motion that exists is transform- and opacity-based.

**The two most recent fixes both still verify clean:** the header menu-control alignment (rings coincident and labels flush in all four states across three viewports, scrollbar gutter reserved, nothing overflowing sideways) and the consent-gated MailerLite pop-up.

## Suppressed false positives

Recorded so a re-run doesn't re-report them:

- **Ten "2.22:1" findings on the hero SVG captions** (`/`, `/en/`) — the harness read `color`, where SVG `<text>` takes its ink from `fill`. Real fills are `rgb(255,255,255)` and `rgb(39,234,147)`, measured at better than 11:1. *The harness has been fixed.*
- **`span.btn.btn-text` "MENU" at 1:1 on every route** — the fixed header is transparent, which defeats a CSS-only backdrop walk. Pixel-arbitrated at 19.72:1 over the hero and 8.90:1 over the open menu.
- **`label` "Leave this field empty" at 1.21:1 on 12 routes**, plus the target-size findings on `input#demo-website-url` (215×23) and `input#dl-website-url` (188×23) — all three are the honeypot, correctly implemented.
- **`NOLABEL input.wpcf7-submit` on 7 routes** — `<input type="submit" value="Zapisz się">` takes its accessible name from `value`.
- **All 27 "text over an image" cases** — pixel-arbitrated between 8.11:1 and 11.06:1. None fail.
- **11 of the 13 "no focus ring" findings** — the four demo fields, both download fields and all five calculator sliders do draw indicators under real keyboard focus. The slider thumb rings in particular are invisible to CDP's `CSS.forcePseudoState`, which cannot reach `::-webkit-slider-thumb`, and invisible to element-clipped screenshots, which crop away an outline drawn outside the element box.
- **`input#nemaiil` on `/kontakt/` initially read as "ok"** at 0.68% of pixels changed — that was the uppercase label above it reflowing by a pixel, not a ring. Viewing both crops side by side settled it: the field border is pixel-identical. Reported as a real failure under P1-7.

## Recommended Actions

1. **[P1] `/impeccable harden`** — the accessibility pass. Focus indicators for `button.hamburger` and `input#nemaiil` (both trace to `outline: 0` in `legacy.css` with no replacement), an accessible name for the logo link, labels and `aria-valuetext` for the five calculator sliders, the two contrast fixes on translucent white, `autocomplete="email"`, and a skip link. Seven P1s and two P2s, most of them in the same two files.
2. **[P1] `/impeccable optimize`** — page weight. Convert `tiptopol-dpd-integration.gif` (2.35 MB) to a looping muted MP4, route the 21 oversized images through the Astro image pipeline, fix the two genuine lazy-loading misses, and strip unused Bootstrap from the 172 kB stylesheet once the `legacy.css` edits above have landed.
3. **[P2] `/impeccable adapt`** — touch targets. The six 17 px contact links to 29 px via transparent padding, the logo link to 44 px at 320, and the 28 px announcement-bar CTAs to 44 px under `@media (pointer: coarse)`.
4. **[P2] `/impeccable animate`** — add the missing `prefers-reduced-motion` block to `WhatIsEsb`, matching the five stylesheets that already have one.
5. **[P2] `/impeccable clarify`** — replace the bare "here" link on `/en/pricing/` with its destination.
6. **[P2] `/impeccable polish`** — migrate the 216 hard-coded hex literals onto `tokens.css` (case-insensitively, so both spellings of the brand green are caught), and decide what happens to the seven orphan colours that have no token at all.
