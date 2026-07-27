# Technical Audit — gravity.integration (Astro rebuild)

`/impeccable audit all pages` · web · register: brand · scope: 10 routes at 1440px (desktop) and 390px (mobile)
Checks: WCAG contrast, alt text, heading hierarchy, touch targets, horizontal overflow, image dimensions, console errors, theming consistency, anti-patterns.

## Audit Health Score

| Dimension | Score | Notes |
|---|---|---|
| Accessibility | 2 / 4 | Alt text, lang, keyboard, reduced-motion all solid; but systemic contrast failures + one missing H1 |
| Performance | 3 / 4 | Static Astro, no framework JS, lazy media; CLS risk from images without dimensions |
| Theming | 3 / 4 | Strong token system; announcement bar still on retired legacy green + one arbitrary z-index |
| Responsive Design | 2 / 4 | Three real breakpoint bugs (mobile H1 overflow, desktop horizontal scroll, mobile table) |
| Anti-Patterns | 3 / 4 | No AI-slop signature; committed palette + custom house grid; loses a point for z-index 9999 |
| **Total** | **13 / 20** | **Needs work — solid foundation, held back by contrast + responsive bugs** |

## Anti-Patterns Verdict

**PASS — does not look AI-generated.** The site avoids the current tells: no per-section uppercase eyebrows, no numbered `01/02/03` scaffolding, no identical icon-heading-text card grids, no gradient text, no cream/beige "AI default" palette. Color strategy is committed (dark hero + light body + one green accent), and the bordered-cell house grid is a deliberate, reused system. The problems below are craft and accessibility bugs, not a generic-AI signature.

## Executive Summary

- **P0:** 0 · **P1:** 4 · **P2:** 5 · **P3:** 3
- The single biggest issue is **contrast**, and it is systemic: the fixed announcement bar (all 10 pages) puts white text and a green CTA at ~1.57:1, and the deep-green link/badge color `#0d9e6d` measures ~3.45:1 — below the 4.5:1 AA floor for normal text, not above it as `DESIGN.md` currently claims.
- Three **responsive** bugs: the `/integracje/` H1 overflows the mobile viewport, `/cennik/` and `/kalkulator/` scroll horizontally on desktop (decorative `.circle` bleeding past the edge), and the ROI breakdown table overflows on mobile.
- `/polityka-prywatnosci/` ships with **no H1** (headings start at H2).
- Everything else is healthy: 0 missing alt attributes across 118 images, correct `lang="pl"`, clean heading order on 9/10 pages, no console/page errors, one H1 per page (except the policy page).

## Detailed Findings

### P1 — Announcement bar contrast (all 10 pages)
- **Location:** `#gi-announce-bar` (rendered in the site layout, present on every route).
- **Category:** Accessibility / Contrast.
- **Impact:** White heading text on `rgb(1,236,144)` green = **1.57:1**. The "Pobierz teraz" CTA is bright-green text on a white pill = **1.57:1**. "Sprawdź zmiany" (white text + white border on green) is equally low. This is the first thing every visitor sees and it is effectively unreadable at the AA level.
- **WCAG:** 1.4.3 Contrast (Minimum) — AA fail.
- **Recommendation:** Darken the bar (e.g. the dark hero surface `#0a0a12` with green accents) or use ink text; if the bar stays green, text must be near-black. Fix the CTA to a solid dark-on-green or green-on-dark pairing.
- **Suggested command:** `/impeccable polish`

### P1 — Deep-green link/badge color below AA (systemic)
- **Location:** `--gi-green-deep` `#0d9e6d` used for inline links, list markers, integration protocol badges (`/integracje/`), "Zobacz case study →" links (home), ESB inline links (`/czym-jest-esb/`), pricing accents.
- **Category:** Accessibility / Contrast.
- **Impact:** Measures **3.45:1 on white** — passes 3:1 for large text but **fails 4.5:1 for normal-size text**, which is where it is mostly used (12–13px links and badges). `DESIGN.md` states this color "Passes AA for normal text on white," which is incorrect and should be corrected so the assumption doesn't propagate.
- **WCAG:** 1.4.3 — AA fail for normal text.
- **Recommendation:** Darken the deep green one step (target ≥4.5:1 on white — roughly `#0a8a5f` or darker) for any text below 18.66px, or reserve `#0d9e6d` strictly for large text / non-text accents.
- **Suggested command:** `/impeccable polish`

### P1 — `/integracje/` H1 overflows the mobile viewport
- **Location:** `/integracje/` hero H1 (`h1` inside `.d-inline-block`), 390px viewport.
- **Category:** Responsive / Overflow.
- **Impact:** Document is **206px wider than the viewport**; "gravity.integration" is clipped off the right edge and the page scrolls sideways on phones. Verified in screenshot.
- **WCAG:** 1.4.10 Reflow — AA fail.
- **Recommendation:** Reduce the H1 `clamp()` max, allow wrapping (`overflow-wrap:anywhere` / `text-wrap:balance`), or shorten the mobile heading. The `.d-inline-block` circle wrapper is forcing a single unwrapped line.
- **Suggested command:** `/impeccable adapt /integracje/`

### P1 — `/polityka-prywatnosci/` has no H1
- **Location:** `/polityka-prywatnosci/` — heading sequence is `2,2,2,2,...` with zero H1.
- **Category:** Accessibility / Document structure (also SEO).
- **Impact:** Screen-reader users lose the top-level page title in the heading map; search engines see no H1 on a real indexable page.
- **WCAG:** 1.3.1 Info and Relationships; 2.4.6 Headings and Labels.
- **Recommendation:** Add a visible H1 ("Polityka prywatności") as the page's first heading; demote the current H2s one level if they were standing in for it.
- **Suggested command:** `/impeccable polish`

### P2 — Desktop horizontal scroll on `/cennik/` and `/kalkulator/`
- **Location:** decorative `.circle` in the page hero; both pages scroll ~**88px** past 1440px.
- **Category:** Responsive / Overflow.
- **Impact:** Root cause is the global `html, body { overflow: visible !important }` rule in `site.css` (added earlier to undo Locomotive Scroll's `overflow:hidden`). With clamping removed, the absolutely-positioned decorative circles bleed past the right edge and create a horizontal scrollbar on desktop.
- **WCAG:** 1.4.10 Reflow.
- **Recommendation:** Switch the body rule from `overflow: visible` to `overflow-x: clip` (clips horizontally without re-breaking sticky/scroll behavior the way `overflow:hidden` did), or wrap the hero in a `overflow:hidden` container so the circle is contained.
- **Suggested command:** `/impeccable adapt /cennik/ /kalkulator/`

### P2 — Large display text below 3:1
- **Location:** "139+" green number `/integracje/` (**1.58:1**); "PLN" gray `rgb(155,156,174)` at 64px `/cennik/` (**2.71:1**).
- **Category:** Accessibility / Contrast (large text).
- **Impact:** Even at the relaxed 3:1 large-text threshold these fail. The "139+" is the page's headline proof point and is hard to read.
- **WCAG:** 1.4.3 (large text 3:1).
- **Recommendation:** Use `--gi-green-deep` (or darker) for "139+"; darken the "PLN" unit toward ink.
- **Suggested command:** `/impeccable polish`

### P2 — ROI breakdown table overflows on mobile
- **Location:** `table.gi-breakdown` on `/kalkulator/`, 390px — extends to 414px.
- **Category:** Responsive / Overflow.
- **Impact:** Table pushes ~24px past the viewport; minor sideways scroll in the results panel on phones.
- **Recommendation:** Wrap the table in an `overflow-x:auto` container, or restack it to a definition-list layout under ~480px.
- **Suggested command:** `/impeccable adapt /kalkulator/`

### P2 — Small touch targets on mobile
- **Location:** "Zobacz case study →" links (home) render **124×13px**; "POBIERZ" (`/pobieranie/`) renders **57×10px**.
- **Category:** Accessibility / Target size.
- **Impact:** Below the 24×24px minimum; hard to tap accurately.
- **WCAG:** 2.5.8 Target Size (Minimum), AA.
- **Recommendation:** Add vertical padding / min-height to these links so the hit area clears 24px, even if the visible text stays small.
- **Suggested command:** `/impeccable adapt /pobieranie/`

### P2 — Images without explicit dimensions (CLS risk)
- **Location:** 24 of 30 `<img>` on the homepage (and a handful on other pages) lack `width`/`height` and are not inside a `.ratio` aspect box.
- **Category:** Performance / Layout stability.
- **Impact:** Browser can't reserve space before load → cumulative layout shift, especially on the client-logo wall.
- **Recommendation:** Add intrinsic `width`/`height` (or wrap in `.ratio`) so space is reserved; the media pipeline already knows the dimensions.
- **Suggested command:** `/impeccable optimize /`

### P3 — Arbitrary z-index on announcement bar
- **Location:** `#gi-announce-bar` uses `z-index: 9999`.
- **Category:** Anti-pattern / Theming.
- **Impact:** Breaks the semantic z-index scale; the kind of magic number the design guidance explicitly flags.
- **Recommendation:** Introduce a named z-index scale (bar/header/menu/modal) and slot the bar into it.
- **Suggested command:** `/impeccable polish`

### P3 — Retired legacy green still in use
- **Location:** announcement bar background `rgb(1,236,144)` = `#01EC90`.
- **Category:** Theming / Consistency.
- **Impact:** `DESIGN.md` states the `#01EC90` / `#27EB93` variants are retired in favor of the unified `#27EA93`, but the bar still ships the old value — a visible palette drift on every page.
- **Recommendation:** Move the bar to the unified green (and re-check contrast per the P1 finding — the unified green on white/white-on-green is also low, so pair it with a dark surface).
- **Suggested command:** `/impeccable polish`

### P3 — Minor edge overflow (home, pobieranie)
- **Location:** homepage `.hero-decorative` image 5px past edge; `/pobieranie/` Bootstrap `.row`/`.col-md-6` 16px past on desktop (negative-margin gutter).
- **Category:** Responsive / Overflow (cosmetic).
- **Impact:** Negligible; no visible scrollbar in practice but worth tidying with the P2 overflow fix.
- **Suggested command:** `/impeccable adapt /pobieranie/`

## Patterns & Systemic Issues

1. **Green-on-light contrast is the recurring theme.** Both the announcement bar and the `--gi-green-deep` token fail their respective AA thresholds, and the design doc encodes the wrong assumption. Fixing the token (and the doc) resolves findings across integracje, ESB, case-studies, cennik, and home at once.
2. **The `overflow: visible !important` escape hatch has a cost.** It rescued the homepage from Locomotive Scroll's clipping, but by disabling horizontal clamping globally it now lets decorative circles trigger desktop horizontal scroll. `overflow-x: clip` on the body is the targeted replacement.
3. **Hero heading scaling isn't tested against the longest copy at 390px.** integracje is the failure; the same `.d-inline-block` circle-wrapper pattern should be checked on every hero.

## Positive Findings

- **0 missing alt attributes** across 118 images on 10 pages — alt text carried cleanly from the CMS.
- Correct `lang="pl"`, one H1 per page (9/10), and **no heading-level skips** anywhere.
- **No console or page errors** on any route.
- No AI-slop anti-patterns: committed dark/light theme, single deliberate accent, custom bordered-cell grid reused as a system, no eyebrows, no gradient text, no hero-metric template.
- Static Astro output, no client framework, lazy-loaded media — the performance floor is genuinely high, matching the "fast, clean site as proof of engineering" positioning.

## Recommended Actions

Run these in any order; each is scoped so you can take them one at a time. Re-run `/impeccable audit` after fixes to watch the score climb.

1. `/impeccable adapt /integracje/ /cennik/ /kalkulator/ /pobieranie/` — mobile H1 overflow, desktop horizontal scroll, mobile table, touch targets.
2. `/impeccable polish` — announcement bar contrast + green-deep token + missing H1 + z-index scale + legacy-green cleanup (and correct the `DESIGN.md` contrast note).
3. `/impeccable optimize /` — add image dimensions to kill CLS on the logo wall.
4. `/impeccable polish` — final quality pass once the above land.
