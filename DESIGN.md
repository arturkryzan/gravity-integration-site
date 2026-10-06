# Design

The visual system of gravity-integration.com, v2: the site rebuilt onto the
**gravity.integration design system v2.0, "Mass"** (September 2026). The copy is
unchanged from v1. Everything visual was written again from scratch.

- **Reference:** `2_0/Gravity Design System.html`, which sits outside the repo
  next to it. Its sections are numbered 01–08, and this file cites them as
  §01…§08.
- **Source of truth in code:** `src/styles/tokens.css`. It holds the design
  system's own token block, copied verbatim, plus the site's layer on top. The
  surfaces, type classes and components live in `src/styles/base.css`, and
  component-specific CSS is scoped in each `.astro` file.
- **What v1 left behind:** the WordPress-era CSS (`legacy.css`, `site.css`,
  Bootstrap grid classes), the Telegraf and Inter fonts, the 3D renders, the
  two animated SVG hero scenes, SMIL blob morphs and hand-drawn line art. All
  of it has been removed from the build. A few v1-only files are still in
  `public/` and are listed under "Leftovers" at the end.

## The idea

One idea runs through the system: mass. **Mint is the field and ink is the
mass**, and nothing else competes with them. The design system has one graphic
device, a single circle cropped by its frame (the mass). It can be joined by at
most one small circle (the satellite). Surfaces are flat, with no gradients and
no shadows; depth comes from colour, such as ink over mist or ink-700 cards on
ink. There are no illustrations, patterns or renders. Icons appear only where
they carry meaning (Lucide, see Components).

## Colour

The palette, verbatim from §08:

| Token | Value | Role |
|---|---|---|
| `--mint-500` | `#01EC90` | the field; accent button; mint type on ink |
| `--mint-600` | `#00C878` | hover on mint |
| `--mint-800` | `#007F4D` | mint as text on **white** only |
| `--mint-100` | `#D9FCEB` | success tint |
| `--ink-900` | `#1E1F33` | the mass; text; primary button; ink sections |
| `--ink-700` | `#2E3048` | hover on ink; cards on ink; the consent toast |
| `--slate-600` | `#464862` | body text on light |
| `--slate-400` | `#8B8DA6` | captions on **ink-900** only |
| `--mist-100` | `#EEF0F4` | page tint, recessed panels |
| `--mist-200` | `#D9DBE3` | the one border: 1px on white |
| `--on-ink` | `#F4F5F8` | text on ink |
| `--red-500`, `--amber-500` | | tone dots, never fills |

The site's layer (`tokens.css`, below the verbatim block) names four values that
the design system's own page uses but never exported: `--muted #6E7089`,
`--on-ink-soft #C9CBD6`, `--red-700 #C2363B` and `--red-300 #FF8A8F`. Each one
was measured against the surfaces it is allowed on.

**Contrast, measured.** WCAG ratios for each colour on the surfaces it is
allowed on:

| Text colour | On white | On mist | On mint | On ink-900 | On ink-700 |
|---|---|---|---|---|---|
| ink-900 | 16.17 | 14.17 | 10.32 | | |
| slate-600 | 8.88 | 7.79 | | | |
| `--muted` | 4.84 | ✗ 4.24 | | | |
| mint-800 | 5.07 | ✗ 4.44 | | | |
| mint-500 | ✗ 1.57 | | | 10.32 | 8.21 |
| on-ink | | | | 14.83 | 11.80 |
| on-ink-soft | | | | 10.01 | 7.96 |
| slate-400 | | | | 4.97 | ✗ 3.96 |
| red-700 (error text) | 5.41 | | | | |
| red-300 (error text) | | | | 7.15 | |

The ✗ cells are the reason for the rules below. **Mint is never text on a light
surface.** Mint-800 appears on white only. `--muted` is used on white only, and
slate-600 takes that role on mist. Slate-400 is used on ink-900 only. The
numbered counters on the ink-700 cards use on-ink-soft for this reason; axe
flagged them at 3.95:1 when they used slate-400.

**Surfaces carry their own roles.** `.surface-white`, `.surface-mist`,
`.surface-mint` and `.surface-ink` (in `base.css`) set `--fg`, `--fg-muted`,
`--label`, `--rule`, `--underline`, `--link-hover`, `--dot`, `--focus-gap` and
`--focus-ring`. Components read these variables and never hard-code a colour
that depends on the surface underneath. A white card inside an ink panel (the
demo form, the download form) sets the light values on itself.

**Never type on a mass of its own colour.** Mint text never sits over the mint
mass, and ink text never sits over the ink mass. Where a frame carries both,
the text stays on the field side. When the viewport narrows, the frame opens
room above the text (extra padding) and the mass shrinks, so the two never
cross. This rule was measured, not eyeballed, in the home tech band, the
calculator, the newsletter card, the integrations stat, the pricing hot card,
the quiet hero, the footer and the menu.

## Focus

The design system's ring is `0 0 0 2px #fff, 0 0 0 5px mint` (§05). That is
right on ink. On a light surface, though, mint measures 1.57:1 and the white
gap disappears, so the ring is read from the surface:

- **On white and mist:** the inner 2px turns ink, giving element | ink |
  mint. The ring still reads as the brand's, and the ink carries the
  contrast.
- **On mint:** the ring is 3px ink and the gap is transparent.
- **On ink:** the ring is exactly as the design system specifies.

It is implemented once as `:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; box-shadow: 0 0 0 2px var(--focus-gap) }`.

The custom checkbox, radio and text-field rules read the same two variables.
When they were hard-coded to white + mint they measured 1.57:1 on white and
on mint, and `verify-harden-a11y.mjs` caught it. The calculator's slider
thumbs draw the design system's own ring, because they sit on ink.

## Typography

The fonts are **Epilogue** (300 for long copy on ink, 400 body, 600 for H3/H4
and buttons, 800 for display to H2) and **JetBrains Mono** (400/500). Both are
self-hosted through `@fontsource`, and the 400 and 800 Latin files are
preloaded.

**The scale is the design system's, made fluid.** `tokens.css` defines it once,
and headings use these values and nothing else:

| Token | Design system size | Fluid value | Used for |
|---|---|---|---|
| `--fs-display` | 96 · 800 · .84 | `clamp(52px, 7vw, 96px)` | page-hero titles (one to three words) |
| `--fs-h1` | 56 · 800 · .92 | `clamp(36px, 4.6vw, 56px)` | the home headline; section statements (tech band, TextBoxes, FAQ, quote bands, contact, 404, download) |
| `--fs-h2` | 40 · 800 · 1.0 | `clamp(28px, 3.4vw, 40px)` | content sections; headings inside panels (demo, newsletter, calculator, case studies, integration categories) |
| `--fs-h3` | 28 · 600 · 1.1 | `clamp(22px, 2.4vw, 28px)` | case-study stages, card headings, privacy-policy sections |
| `--fs-h4` | 20 · 600 · 1.2 | `20px` | card titles (technologies, licences, links, download steps) |
| `--fs-body-lg` | 18 · 400 · 1.6 | `18px` | ledes |
| `--fs-body` | 16 · 400 · 1.55 | `16px` | text, including text in cards |

Button labels are 14px at every size (§06). Mono follows the §03 rule: eyebrows,
labels, metrics, status and code, in capitals at 11–12px with +0.08em tracking,
and never for sentences. The hero proof line, the download form's note, the
spec line and both copyright lines are sentences, so they are set in Epilogue.

**Narrow screens.** The Polish copy binds phrases with no-break spaces. For
example, "których nie znajdziesz" is 347px at 34px, which is wider than a
320px phone's 280px column. Where that happens, the size below 600px follows
the viewport so the bound phrase fits:

- the tech band heading uses `clamp(26px, 8.2vw, 34px)`;
- the calculator heading uses `clamp(22px, 7.4vw, 30px)`;
- the demo heading uses `clamp(24px, 7.6vw, 30px)` for "gravity.integration";
- the download H1 uses `clamp(28px, 9.6vw, 56px)`.

As a last resort, h1–h3 carry `overflow-wrap: break-word`, and buttons may wrap
below 420px. That fallback fires only for the calculator's "Pobierz
gravity.integration za darmo".

**Line breaks in display headings** are handled by `typeset()` in `src/lib/html.ts`,
which `clean()` applies to every h1–h3 in the content. It makes two changes,
neither of which alters a character of the copy:

- A spaced dash never starts a line: the space before the dash becomes a
  no-break space. Without it, "ESB — integrate" broke into "ESB / — integrate".
- A hyphenated compound of 16 characters or fewer stays whole, so
  "next-generation" no longer breaks into "next- / generation".

The Polish copy that already binds its dash to the next word (`–&nbsp;`) is
left exactly as written.

## Space and layout

- **Container:** 1200px with 24px gutters (20px below 600px), as in §05.
  Reading measure is 68ch.
- **Section rhythm:** `--section-y: clamp(64px, 9vw, 120px)`. The design system
  specifies 88–120px, and phones step down to 64px.
- **Radii:** 6 (checks), 10 (inputs), 16 (cards), 24 (panels) and pill
  (buttons).
- **Grids** use `minmax(0, 1fr)` tracks. An `auto` or bare `1fr` track grows to
  the min-content of an unbreakable phrase, and the frame around it, which is
  `overflow: hidden` wherever a mass is cropped, then cuts the words off without
  any visible overflow. `verify-overflow.mjs` exists because of this.
- **Breakpoints:**
  - 480: the header's download button hides.
  - 600: phone restack.
  - 640/900: pricing, two cards per row with the odd one spanning.
  - 900: two-column splits; the page hero turns over.
  - 960: download page.
  - 1000: the home hero turns over.
  - 1100: the top bar becomes the menu; the technology grids go to four
    columns.

## The mass

**The design system's rules (§04):**

- One mass per frame, and one satellite at most.
- The satellite is 5–10% of the mass and sits on the side opposite the crop.
- Type sits on the mass, at least 8% in from its edge.
- The logo stays on the field.
- UI scales down: Quiet, or no mass at all.

**Variants:**

- **A · Corner fall:** mint field, ink mass bottom-right.
- **B · Horizon:** the mass rises from the bottom edge.
- **C · Inverted:** ink field, mint mass top-left. One per sequence.
- **D · Quiet:** mist field, mint mass, no satellite.

**Where each is used:**

| Place | Variant | Notes |
|---|---|---|
| Home hero | A, full bleed, animated | The H1 sits on the mass in mint. The animation that replaces v1's hero video is drawn from the frame itself (see Motion). Below 1000px the frame turns over: the mass falls from the top behind the headline, and there is no satellite. |
| Page heroes (`PageHero.astro`) | A, compact | Below 900px the mass is drawn from the title box itself: diameter 220%, centred at 66%, with 22% + 20px bottom padding. The arc therefore passes 48px under the title's last line at every width. When it was sized from the viewport, the start of the title stood on the mint field from about 420px up. |
| Privacy policy | D | |
| Home audience panels | C (developers), A (business) | Proportional: the type is sized in container units and the circles in percentages. The longest line in either language stays more than 8% inside the mass. |
| Home use-case panels | 01 A (mint, ink mass bottom-right) · 02 the horizon on D's colours (mist, mint) · 03 A on white (hairline) · 04 C (ink, mint mass top-left) | Animated; see "The use-case panels". Every field of the palette once, the inverted frame once, the masses alternating ink and mint down the page, and no mass in another product's corner. |
| Home tech band, `/technologia/` TextBoxes | ink band, mint mass top-right | A TextBoxes band that follows a quote drops its mass, because the quote's horizon already is one. |
| Quote bands | B | |
| Pricing: unlimited licence | "stat" card: ink + mass | The implementation offer card is plain mint, because the stat card above it already holds the frame's mass. |
| Newsletter card | mint + ink mass + satellite | |
| Calculator | ink panel, mint mass | Below 900px the panel opens 140px above the heading for it. |
| Integrations "139+" | small mint cap | |
| Contact claim ("FUTURE TECH FORMULA") | C, the words set live | |
| 404 | A as a rounded panel on white | The number is centred on the mass and sized from it. |
| Menu dialog | C | Hidden below 760px wide or 800px tall: it is pinned to the viewport's corner, and on those screens the links reached it. |
| Footer | ink, mint mass top-left | Fixed size. The wordmark starts 216px down (150px below 900px), so it always stands on the field. |

**No mass** in the case-study results panels, the demo panel, the download
page's demo band, or beside the `/technologia/` intro.

- An independent review counted eight masses on `/case-studies/`. Four of them
  were identical results panels, against a rule of one per frame.
- The demo panel sits right above the footer's mass.
- The `/technologia/` intro was a render with no words. As an empty frame it
  read as a missing thumbnail and put a second satellite in the hero's frame.

**Never two same-coloured masses across a section boundary.** A full-bleed mint
404, or a mint demo band, would have met the footer's mint mass. Both became
panels on white instead.

## Components

**Announcement bar.** Ink, in flow above the sticky header, so nothing measures
anything. It is a named `<aside>` landmark. Since October 2026 it is one line
and an X: the line is the link ("Nowa wersja już dostępna" → /pobieranie/,
"A new version is available" → /en/download/), mint on ink, 44px tall, its
arrow nudging on hover. Dismissal is scoped to the campaign:
`data-campaign="new-version-2610"` becomes the cookie
`gi_bar_hidden_new-version-2610`, which lasts one year. Bumping the campaign
re-shows the bar to everyone — this one did, to everyone who closed v4's.

**Header.** Sticky. At the top of a page it takes the hero's colour
(`body[data-hero]`). Once the page moves it turns white with a 1px mist-200
line, and it hides on the way down.

- At 1100px and wider it shows six links, the language switch, and one button,
  the download (primary).
- Below 1100px the links fold into a full-screen `<dialog>` opened with
  `showModal()`, which gives focus containment, an inert page and Escape. Its
  only accent button is the download.
- Below 480px the bar drops its download button, because the hero and the
  menu both carry it.
- With JavaScript off, the links become a horizontally scrolling row.

**Buttons.**

- Styles: primary (ink), accent (mint, one per view), secondary (ink
  outline), link. On ink, primary inverts to on-ink.
- Heights: 36, 44 and 52px. The label is Epilogue 600 at 14px for every size.
- States: hover steps the fill one level over 150ms; pressed is
  `scale(.97)`. The satellite appears inside a button as an 8px `.btn-dot`.
- The footer's download is secondary, because the demo button above it is
  already the view's accent.

**Forms.**

- Inputs are 44px, radius 10, white, with a mist-200 border. On focus the
  border turns ink and the ring is read from the surface.
- Error text is red-700 on light and red-300 on ink.
- The checkbox and radio are custom-drawn over real inputs.

**Cards.**

- Default: white, 1px mist-200, radius 16, padding 24. A card that is a link
  lifts 3px on hover.
- On ink, cards are ink-700.
- Stat and CTA cards are listed under The mass above.

**Grids.** The logo wall and the integrations directory are bordered-cell grids
(hairlines, no gaps), two columns on phones. The technologies are four across,
two by two, or one column, and never three plus one.

**FAQ.** A native `<details>` with a plus that turns into a minus. Its heading
is "FAQ" at H1 size: on `/cennik/` and `/kalkulator/` it used to be a small
label, and the ESB page already had the heading.

**Use-case panels.** `UseCaseAnim.astro`, radius 24, ratio 1440/804, one
field each; only the white one draws its hairline (the other three carry a
transparent 1px border so all four are the same size). See "The use-case
panels" below.

**Case studies.** Each study is a dossier:

- a logo plate, the client in mono and the title at H2;
- a sticky mist fact sheet beside the story, which is set at reading measure;
- the results on an ink panel with mint ticks.

**ESB explainer.** The point-to-point and bus diagrams are drawn as
design-system panels in SVG. The warning signs use amber dots (tone is a dot,
never a fill). The benefits sit in a card with mint ticks.

**Icons.** Lucide (`lucide-static`, imported `?raw`) at stroke 1.75.
`iconSvg()` rewrites only the root `<svg>` tag: stripping attributes from
child elements once deleted the rect geometry of two icons. LinkedIn is the
one custom glyph.

**Favicons and OG images.** `scripts/build-brand.mjs` generates the mark (mass
plus satellite, §01) as `mark.svg` and `mark-16`…`mark-512.png`, along with
`og-gravity.png` and `og-gravity-en.png`.

## Motion

The design system's motion rules (§05):

- **Entries** fall toward the core on `cubic-bezier(.55,0,.1,1)` over
  240–400ms.
- **Hover** takes 150ms.
- **Nothing bounces.**

On the site:

- **Reveal:** `[data-reveal]` rises 16px and fades in when it enters the view
  (IntersectionObserver). Content is visible by default and is hidden only once
  script is known to run. It is instant under `prefers-reduced-motion`, and
  print forces it visible.
- **Masses** drift into place on reveal over `--dur-slow` (400ms). v1-era
  durations of 600–900ms were brought down to the 400ms maximum.
- **Header** hides and shows on scroll; the menu fades and settles 12px.
- **Forms** draw their ticks with `stroke-dashoffset`. The submit spinner keeps
  turning under reduced motion, because it says "still working".

**The use-case panels** on the home page are animated from the same parts
(see "The use-case panels" below).

**The home hero** is the key visual in motion, "every tool falls in"
(`src/scripts/hero-fall.js`, with the states in `HomeHero.astro`). It is built
from the frame's own parts and puts the system's colour rule in motion: type on
the field is ink, type on the mass is mint, so whatever crosses the mass's edge
changes colour exactly on the edge, through the middle of a letter if that is
where the edge is.

- **The entrance.** The headline is there from the first paint, in ink on the
  empty field. The mass falls in from its crop corner (from the top below
  1000px) over 1400ms (1100ms) on the fall curve, and as its edge sweeps the
  headline, every letter turns mint along the line the edge cuts. The H1 is a
  single element throughout: a hard-stop radial gradient clipped to its glyphs,
  moved with the mass each frame, and plain mint again once the mass lands.
  This is the one motion longer than §05's 400ms, because it is the key visual
  playing, not an element entering.
- **The loop, 1000px and wider.** A satellite falls in from the frame's edge to
  the static design's place, with a connector's name beside it in the mono
  label (`ERP · SUBIEKT GT`). The 24 names are looked up in
  `src/data/integrations.json` at build time and the build fails on one the
  directory doesn't list; the first three are the headline's ERP, CRM and WMS.
  After 3.4s (4.2s the first time) the mass takes it: inverse-square gravity,
  integrated at 240 Hz, sized so the fall takes 0.9s at any width, with a
  sideways push that carries it over the crown. It crosses the edge ink outside
  and mint inside, and sinks out of sight at most halfway between the edge and
  the headline. The name follows, a letter at a time, nearest letter first.
  The mass never moves: it is the heavy one. One satellite at a time, so the
  frame never has two.
- **Drawing.** The moving parts are two canvas passes over the same shapes:
  ink clipped to the field, mint clipped to the mass. The canvas covers only
  the region they move through, which is found by simulating the paths when
  the layout changes.
- **Touch.** A pointer near the satellite draws it a little toward itself;
  clicking it hands it to the mass at once.
- **Cost.** It sleeps on a timer between movements (no frames while nothing
  moves), stops while the hero is off-screen or the tab hidden, and lands the
  entrance at once if the hero leaves the view mid-fall. Measured at 1440: about
  5% of one core while something moves, nothing while it waits.
- **Access.** The pause button on the mass stops the loop (WCAG 2.2.2), as the
  system's secondary button on ink with the system's focus ring. Reduced motion
  gets the static composition, never handed over. The inline script under the
  hero hands it to the animation before first paint and takes it back if the
  script hasn't arrived within 3s; an error in it puts the static composition
  back; print and forced colours get the static composition too.

## Behaviour carried over from v1

None of this changed in the redesign. The hooks, ids and classes the scripts
address were kept, so the v1 harnesses still apply (with the v2 selector
updates noted in `CLAUDE.md`).

**Form delivery** (`src/lib/mailerlite.ts`, `src/scripts/ml-forms.ts`). Every
surface posts straight to MailerLite's embedded-form endpoint, `POST
assets.mailerlite.com/jsonp/{account}/forms/{form}/subscribe`, with a
`URLSearchParams` body.

- **The body type is load-bearing.** A `URLSearchParams` body makes the request
  CORS-simple, so there is no preflight and no server of our own. Setting any
  custom header, including `Accept`, re-triggers the preflight and breaks it.
- **Forms and groups.** Separate forms (`Demo (www)`, `Kontakt (www)`,
  `Newsletter (www)`, plus the download form) feed one group, GRAVITY, so each
  surface reports its own conversions. The contact form's request type rides
  in the `typ_zapytania` field. Its values stay Polish in both languages,
  because they are data, not copy.
- **Response handling.** Three branches are handled separately:
  - success;
  - a field error, which appears as an inline tip next to the input;
  - a network failure, which falls back to a prefilled `mailto:`.
- **Without JavaScript** every form has a real `action` and posts natively.
- **Anti-spam.** An off-screen `website_url` honeypot and a form-open
  timestamp are stripped from the payload. When either is tripped, the form
  shows success and sends nothing.
- **v2 markup.** The message area is `.form-output` (with `data-tone`), and the
  submit is a `<button class="form-submit">` whose `.form-submit-label` holds
  the text. The e-mail field sits in a `.form-control` wrapper that receives
  `.form-tip`.

**Cookie consent** (`CookieConsent.astro`). The panel is a `<div
role="dialog">`, because ARIA does not allow that role on `<aside>`. It is an
ink-700 toast, the design system's "card on ink", so it still has an edge where
it floats over the hero's mass.

- **Nothing loads before the answer.** The tag is injected only after
  "Akceptuję". Consent Mode v2 defaults are declared as all denied.
- **Refusing costs exactly what accepting costs.** The two buttons sit in two
  equal grid columns, whichever label is longer, and each takes one click.
- **Withdrawal** is in the footer of every page. It clears the stored answer
  and deletes `_ga*` and `_gcl*`.
- **Duration.** The answer lasts six months.
- **Verified by** `consent.mjs`, with 56 assertions.

**Google tags.**

- **GA4** `G-EWVWPJGYVM` and **Ads** `AW-11029031415` are consent-gated
  together. One `gtag.js` load configures both ids.
- **Not ported:** `GT-K5LVDQD`, pending confirmation of its destinations.
  reCAPTCHA v3 and sitewide MailerLite Universal are also not ported.
- **MailerLite's pop-up tag** loads only on Polish pages, only after consent.
  `verify-mailerlite-consent.mjs` checks this.
- **Ads download conversion.** A successful download-form submission fires
  one `conversion` to `adsDownloadConversion` in `site.json`
  (`AW-11029031415/t7n0CKye-tocEPfThosp`, the "Pobranie gravity.integration
  (gated)" action) through `trackDownloadConversion()`. An empty value
  disables it. `verify-ads-conversion.mjs` checks both states.

**Lead events.** `trackLead()` fires `gtag('event','generate_lead',{send_to:
'G-EWVWPJGYVM', value: 1})` exactly once per successful submission from every
surface. It is addressed to GA4 so it does not fan out to the Ads tag.
Surface-specific `dataLayer` events (`newsletter_subscribed`,
`direct_download`, …) still fire alongside it.

**Outbound links** (`src/lib/links.ts`). `docs.gravity-integration.com` always
opens in a new tab, and that is the policy stated in `NEW_TAB_HOSTS`. Every
such link carries a visually hidden "(opens in a new tab)" note.
`initOutboundLinks()` in `main.js` sweeps up docs links authored into body
copy.

## The use-case panels

The four rows of "01–04" on the home page used to carry v1's rendered films
(`use_01`, `connect-systems`, `use_03`, `use_04`: marble spheres, a stopwatch,
a motorway interchange). They are now drawn live from the system's own parts
(`src/scripts/use-case-anims.js`, geometry in `src/lib/use-case-scenes.js`,
markup in `UseCaseAnim.astro`). Each translates its film and the copy beside
it, and **none of them draws any text**.

| Row | The copy says | The film showed | The panel shows |
|---|---|---|---|
| 01 | one tool instead of dozens of scripts; fewer errors | a cluster of small black spheres beside one green sphere | Mint field. Two dozen small ink pieces in three shapes (scripts, CSV files, manual exports) twitch on their own; a red error dot blinks among them. The mass falls into Gravity's corner and takes them nearest first, growing with each; what is left is the key visual, one mass and one satellite, still. Then it sinks out through its corner and the next lot appears. |
| 02 | connect every system, whatever it is; no more silos | a central sphere, six labelled systems lighting up | Mist field, the bus as a mint horizon. Systems of every shape and size travel an orbit above it; each arrives as an outline (a silo), and as it passes the bus reaches up, it fills with the bus's mint, and data moves system → bus → system. |
| 03 | partners and suppliers plugged in in hours, not months; orders, invoices, stock levels as they happen | a stopwatch | White field, ink mass in Gravity's corner. Partners' systems come in from outside the frame and plug into the mass's edge in one move (the half inside turns mint), and documents in three shapes sweep round inside the mass between them. |
| 04 | see every flow and every error; replace or switch off systems safely | a motorway interchange with light on its lanes | Ink field, mint mass top-left. Roads (ink-700 on ink) merge into the mass like ramps, traffic on each. An item turns red and stops; the lane queues, clears and moves. Then a system is switched off and a different one takes its place while every other road keeps flowing. |

**How they are built.**

- Every scene is a pure function of time: `draw(ctx, t)` paints the frame at
  `t` seconds. The loops cannot drift, the reduced-motion still is simply
  `poster`, and `verify-use-cases.mjs` seeks to exact moments. Randomness is
  seeded.
- The colour rule is a clip: whatever crosses the mass's edge is drawn twice,
  in the field's colour outside and in the mass's inside (03's partners).
- Sizes are in a 1440 × 804 frame. On small panels (phones) strokes, dots and
  tokens are drawn up to 35% heavier so they survive 350px.
- The system's signal red appears only as a dot, for an error (01, 04).

**Behaviour.**

- A panel runs only while it is on screen and the tab is visible, and it starts
  its story from the beginning each time it comes into view.
- Each has a stop button (WCAG 2.2.2), in whichever corner stays on one
  surface for the whole loop, described by its row's heading. Reduced motion
  gets the still and no button.
- Without JavaScript, and in print, the panel is its field and its mass (01
  also its satellite).
- They replaced about 1 MB of video and posters that every visitor downloaded;
  the panels are a few KB of script.

## Accessibility

The target is WCAG 2.2 AA. Four harnesses check it (listed in `CLAUDE.md`):

- `verify-axe.mjs`: axe-core over 20 routes at 1440 and 390, plus the consent
  panel and the open menu. Result: 0 violations.
- `verify-harden-a11y.mjs` with `measure-focus-pairs.py`: 18 focus
  indicators, each measured against its backdrop at 3:1 or more, reached with
  a real Tab.
- `verify-harden-names.mjs`: accessible names from Chrome's accessibility tree.
- `verify-overflow.mjs`: no clipped or cut text at 320–1440.

**Landmarks:**

- the announcement `<aside>`;
- the header, whose navigation carries a label;
- `<main>` with `tabindex="-1"`, the target of the skip link;
- the footer, whose navigation carries a label;
- the consent dialog.

## Leftovers

About 2.3MB of v1-only files are still in `public/` and are no longer
referenced by any page:

- `theme/static/*.svg`;
- the Telegraf fonts;
- the old favicon set (`mstile-*`, `apple-touch-icon-*`);
- `og-homehero.png` and `media/og-homehero.png`;
- `video/homehero.*`, v1's hero video;
- `uploads/etl-scaled.jpg`, `uploads/heropricing.webp` and
  `uploads/contact.webp`.

They were left in place so the redesign's diff stays about the redesign.
Deploys never delete anything on the server anyway (see `DEPLOY.md`), so
removing them from the repo only shrinks future deploy folders. Keep
`favicon.ico`: browsers request it by default.
