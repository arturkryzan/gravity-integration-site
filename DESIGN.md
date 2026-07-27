# Design

Visual system for gravity.integration, migrated from the WordPress "gravity" theme (madebymade) and unified during the Astro rebuild. Single source of truth for tokens lives in `src/styles/tokens.css`; the ported theme CSS is `src/styles/legacy.css` and rebuild-era overrides are `src/styles/site.css`.

## Theme

Dark-forward B2B, not dark-mode-everywhere. The **hero and menu are near-black** (`#0a0a12`) with 3D-render product imagery (matte pond/sphere scenes) and neon-green highlights; the **content body is light** (`#f3f4fb` / white) with dark slate text. The signature move is a saturated brand green used as an accent and, occasionally, as a full surface (the homepage tech-tiles band, pricing). Color strategy is **committed**: green carries identity at the edges (hero CTAs, accents, one green section) over a restrained light body — not drenched, not timid.

Physical scene: a Polish IT lead evaluating integration software on a desktop in an office, mid-workday — the site should read as engineered, fast, and trustworthy, closer to precision instrument than SaaS brochure.

## Color

Defined in `src/styles/tokens.css`. Green is unified to a single value (`#27EA93`); the legacy `#27EB93`/`#01EC90` variants are retired.

- Brand green — `#27EA93` (`--gi-green`). Primary accent: hero CTAs, links-on-dark hover, the tech-tiles band, the "139+" number, focus/active states.
- Deep green — `#0d9e6d` (`--gi-green-deep`). Green text on light backgrounds (links, list markers, badges) where `#27EA93` would fail contrast. Passes AA for normal text on white.
- Dark surfaces — `#0a0a12` (`--gi-bg-dark`, hero/menu/solid-header), `#111119` (alt), `#1a1b2e` (`--gi-bg-calc`, ROI calculator), `#242538` (`--gi-bg-card-dark`, calculator cards).
- Slate — `#464861` (`--gi-bg-slate`): the demo-form section background and the darkest of the menu's three tone columns; also the body text color inherited from the theme.
- Ink — `#14152a` / `#1a1b2e`: headings and integration/tile names (crisper than slate on light).
- Muted — `#6b6d84`: secondary text, captions, counts, category descriptions.
- Light surfaces — `#ffffff` and `#f3f4fb` (`--gi-bg-light` / theme `bg-light`); alternating section backgrounds.
- Hairlines — `#e4e5ef` / `#ececf3`: grid separators (integrations grid, clients wall), rules under headings.
- Fullscreen menu columns — a three-tone dark ramp: `#6b6d81` → `#565971` → `#464861` (primary / secondary / meta), white text throughout, green hover.

Contrast: body copy is dark slate/ink on light (well past AA); white text on the green tech band and on `#6b6d81`+ menu columns is used only at large sizes. Green-on-white is always `--gi-green-deep`, never `#27EA93`.

## Typography

One family, multiple weights — **Epilogue** (Google/Fontsource, self-hosted; weights 400/600/700/800), used for both headings and body. Inter is loaded for legacy SVG/UI text and Telegraf ships from the old theme, but Epilogue is the voice. No serif; the contrast axis is weight and size, not family.

- Display / h1: fluid `clamp()`, geometric, tight but not cramped (letter-spacing ≥ -0.02em); the homepage hero H1 is the ceiling. `text-wrap: balance` on headings.
- Section headings (h2): ~1.35–2.1rem `clamp()`, weight 700, ink color.
- Body / `.paragraph`: Epilogue 400, 1rem–1.0625rem, line-height 1.7; measure capped ~720px on prose (ESB article) for readability.
- Labels / counts / badges: 0.72–0.85rem, weight 600, muted or deep-green.
- The theme's small uppercase tracked breadcrumb links are retained only as the per-page section nav (a functional jump-nav under the hero), not as decorative eyebrows.

## Spacing & Layout

- Container: `max-width` 1140px (`--gi-container`), 1.5rem side padding; prose columns narrow to ~720px.
- Section rhythm: fluid vertical padding, `clamp(3rem, 6-7vw, 5-6rem)`, alternating light / green / dark bands for cadence.
- Radii: `--gi-radius` 10px (tiles, cards), `--gi-radius-lg` 16px (panels, diagram cards).
- Grids: breakpoint-free `repeat(auto-fill, minmax(...))`. The **bordered-cell grid** (hairline `#ececf3` separators, no gap) is the house grid — used identically for the homepage client-logo wall and the integrations directory. Card-with-gap grids are avoided.
- The site is built on Bootstrap 5 grid classes inherited from the theme (`container-fluid`, `col-*`, `.ratio` for aspect boxes). New components use native CSS grid/flex; `.ratio` aspect boxes must carry a **`%` unit** on `--bs-aspect-ratio` (see `src/lib/media.ts` `mediaRatio`).

## Components

- Announcement bar: fixed green top bar, cookie-dismissible; sets `--gi-bar-h` (44px) that offsets the header.
- Header: fixed, transparent over the dark hero, hides on scroll-down and returns on scroll-up with a solid `#0a0a12` background once scrolled off the hero (so it never floats transparent over light content). Contains the logo (adapts white→dark by context) and the MENU/CLOSE control.
- Fullscreen menu: three dark tone columns, staggered scaleX wipe-in, white text, green hover, scroll-locked, decorative sphere clipped; close-X and socials white over the dark columns.
- Hero: dark, autoplay-muted-loop video (re-encoded, poster + WebM/MP4, lazy below fold), H1 in a decorative "circle" outline, dual CTAs, trust line.
- Section renderer: ACF-derived layouts — `text_img_link`, `text_img`, `icons` (tech tiles with hand-drawn blob SVG backgrounds + the client-logo-wall variant), `quote`, `text_boxes`, `text_columns`, `pricing`, `faq`, `downloads`, `contact_form`, `links`.
- Two inline animated hero SVGs (developer orbital scene, business network scene) — self-contained, on the homepage.
- Integrations directory: intro ("139+" + protocol badges) then per-category bordered-cell grid of name/sub tiles.
- ROI calculator: dark island, `#1a1b2e` background, `#242538` cards, green KPI values, range sliders with green thumbs.
- ESB explainer (`/czym-jest-esb/`): editorial long-form — lede, point-to-point-vs-ESB SVG diagram, dark pull-quote band, green checklist, native `<details>` FAQ + FAQPage JSON-LD.
- Forms: demo (CF7 414 markup, honeypot+timestamp+token anti-spam client bootstrap), newsletter (CF7 48), MailerLite embed on `/pobieranie/`. Endpoints pending Phase 3.
- Footer: minimal — logo + dynamic-year copyright.

## Motion

Locomotive Scroll and GSAP are gone; motion is native. Reveal-on-view via IntersectionObserver toggling `.is-inview` on `[data-scroll-opacity]` (content is visible by default — reveals enhance, never gate). Header hide/show and background transition on scroll. Menu columns wipe in with staggered `scaleX` and a cubic ease-out; links and tiles use short color/opacity transitions; a light scroll-speed parallax on decorative elements. Every animation has a `prefers-reduced-motion: reduce` path (instant/opacity-1), and a no-JS fallback keeps everything visible. Curves are ease-out (no bounce/elastic).

## Accessibility

WCAG 2.1 AA. Dark slate/ink body text clears 4.5:1 on light; green text on light is always `--gi-green-deep`; white nav text sits only on sufficiently dark columns and at large sizes. Keyboard operable (native `<details>`, real `<a>`/`<button>`, Escape closes the menu, scroll-lock while open). `prefers-reduced-motion` honored throughout. `lang="pl"`; English kept i18n-ready. Alt text carried from the CMS on content and logo imagery.
