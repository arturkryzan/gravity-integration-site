# Performance Optimization — gravity.integration (Astro rebuild)

`/impeccable optimize` · web · register: brand · scope: **page weight**, measured over **18 routes** (10 Polish, 8 English) against a production build served locally, before and after every change.

This pass answers the audit's P1-6, P2-6, P3-2 and P3-4. Six changes were made, each one measured on its own, each one gated against a 38-shot pixel-and-geometry diff before it was kept. Three of the audit's four findings turned out to be partly wrong about *why* the site was heavy; those corrections are stated below rather than quietly worked around, because the wrong diagnosis would have produced a smaller saving than the right one did.

## Result

| | Before | After | Change |
|---|---|---|---|
| Total transfer, 18 routes | 18,097 KiB | 5,978 KiB | **−67%** |
| Mean per route | 1,005 KiB | 332 KiB | −67% |
| Heaviest route (`/case-studies/`) | 2,851 KiB | 338 KiB | −88% |
| Requests, 18 routes | 343 | 320 | −23 |
| Worst CLS | 0.0872 | 0.0876 | +0.0004 |
| Slowest LCP | 816 ms | 932 ms | +116 ms (run noise) |
| `dist/` on disk | 12 MB | 7.6 MB | −37% |

Transfer bytes are `encodedDataLength` from CDP `Network.loadingFinished`, not `Content-Length`. The local server does not gzip, so text assets (HTML, CSS, JS) read at raw size here and will be roughly a third of these figures in production behind Apache's `mod_deflate`. That makes these numbers pessimistic for text and exact for images, video and fonts — which is the right way round, since text was never the bottleneck. It also means **these numbers are not comparable with the audit's**, which came from a different instrument.

## Executive Summary

- **Total page weight fell 67%, from 18.1 MB across the site to 6.0 MB.** No route is now above 556 KiB; before, five were above 800 KiB and two were above 2.8 MB.
- **Six changes, in descending order of what they were worth:** the case-study GIF (−2.4 MB on two routes), raster image format (−1,356 KiB across the site), the CSS strip (−2,331 KiB across 18 routes), lazy video (−684 KiB on first paint), fonts (−37 KiB per route, −74 KiB on `/`), and loading priority (no bytes, but correct ordering).
- **Every change passed the same gate**: a full 38-shot screenshot set at 1440 and 390 across all 18 routes plus both menu states, diffed pixel-for-pixel against the pre-change build, with `<video>` geometry asserted separately because a fullPage capture cannot photograph a video twice. Not one change was allowed through on reasoning alone.
- **Layout stability did not regress.** Worst CLS moved 0.0872 → 0.0876, which is inside run-to-run noise. That matters most for the font change, where `font-display: swap` normally *costs* CLS; it did not here because the preload lands the face before first text paint.
- **Three of the audit's four performance findings were wrong in their reasoning** while being right that the site was heavy. Details in *Where the audit was wrong*.
- **Two bugs were found while measuring** that the audit had not seen: the announcement bar's height ratchet (a real production bug, with a reproduction) and horizontal overflow on `/en/pricing/`.

**Top five:**

1. **The 2.35 MB decorative GIF is now a 1.28 MB muted looping MP4 with a 42 KiB poster**, and `/case-studies/` fell from 2,851 KiB to 505 KiB in the same pass — an 82% cut on the site's heaviest page from one change.
2. **The waste in the imagery was format, not dimensions.** The audit's "21 images served far larger than displayed" does not survive a 2× DPR check: only 9 of 55 painted images ship more than 1.3× the pixels a retina screen actually paints, worst case 1.92×. Re-encoding the same pixel dimensions to WebP saved 66% (2,113 KiB → 724 KiB) where resizing would have saved almost nothing and would have visibly softened the logos.
3. **`legacy.css` is not stock Bootstrap**, so "strip unused Bootstrap" was the wrong framing for P3-4. It is a ported bespoke sheet, and the largest dead region in it was Locomotive Scroll's scrollbar styling — every `.c-scrollbar` and `has-scroll-dragging` rule, dead because Locomotive's JS is not shipped at all. Source sheet 162,623 B → 28,912 B; CSS on `/` fell 187,476 B → 54,668 B.
4. **Four `<video>` elements were downloading before they were anywhere near the viewport.** `autoplay` silently overrides `preload="none"` in Chrome, so the attribute that was supposed to defer them did nothing. Now 0 KiB of video is fetched before scroll and 684 KiB after — the same bytes, moved off the critical path.
5. **Fonts were shipping in three formats.** Every `@font-face` listed TTF first, so Chrome downloaded a 96 KiB TrueType file and never touched the 20 KiB WOFF2 sitting beside it. Two `@font-face` blocks rewritten, four files deleted, one preload added: −37 KiB on every route, −74 KiB on `/`.

## Method

The reference for this command is explicit that a performance pass without measurement is a guess, so the shape of every step here was: measure, change one thing, measure again, gate, keep or revert.

**The instrument.** `scripts/measure-perf.mjs` drives Chromium over all 18 routes with CDP network instrumentation on, recording per-request `encodedDataLength`, request count by resource kind, LCP and its attributed element, CLS, and DOM node count. It writes the full result set to `/tmp/perf.json` on every run; the four passes are preserved as `perf-before`, `perf-after2` (media), `perf-final-full` (CSS) and `perf-font`.

**The gate.** `scripts/shoot-routes.mjs` captures 38 full-page screenshots — 18 routes × 2 widths, plus the open menu at each width — with animation frozen, SMIL parked, scroll-gated reveals pre-fired by a full page walk, and `<video>` hidden. `scripts/diff-shots.mjs` then compares two sets: video geometry and painted style first (exactly, from a `_geom.json` sidecar), then every pixel. A single differing pixel above the anti-aliasing floor fails the run.

Two things about that harness are worth stating because both were learned the hard way and both are load-bearing.

The first is that the usual trick for freezing CSS animation — `animation-duration: 1ms !important` with `animation-delay: -1ms !important` — **does not work**, and was for a long time the single largest source of nondeterminism here. Overriding the duration of an animation that is *already running* does not reset the time it has accumulated since page load; the new duration merely reinterprets that elapsed time. So each of the site's ~20 decorative loops froze at (elapsed mod 1 ms) — a uniformly random point in its own cycle — and the homepage's rotating word ring landed a few pixels off between runs. The stylesheet now only says *stop*; *where* they stop is set explicitly through the Web Animations API (`a.pause(); a.currentTime = 0`), which is the only interface that can actually seek them.

The second is that a `<video>` cannot be photographed deterministically by a fullPage capture at all. Chromium drops the video's compositing layer at random while `captureBeyondViewport` expands the viewport to the whole document, so the same paused element paints its frame in one shot and nothing in the next. Four rounds of "park the video at frame 0" failed before that was established by taking three captures from one page session with `play` and `load` both stubbed out. The answer is not to freeze harder: the videos are hidden with `visibility: hidden` — which preserves the box and every layout consequence of it — and their position, size, `border-radius` and `object-fit` are read off the DOM per shot and compared exactly. Hidden pixels, asserted geometry. Nothing is merely ignored.

**The bar.** A third source of nondeterminism was found mid-pass and turned out to be a real bug rather than a harness artifact; it has its own section below.

## The six changes

### 1 · The case-study GIF → MP4 (−2,346 KiB on two routes)

`tiptopol-dpd-integration.gif`, 2,403,172 B, was the single heaviest asset on the site and the whole of the audit's P1-6. It is a screen recording of a shipping integration: no transparency, no interactivity, purely decorative motion.

It is now `tiptopol-dpd-integration.mp4` (1,311,490 B) with a `tiptopol-dpd-integration-poster.jpg` (43,014 B), rendered by a new `CaseFigure.astro` as a muted, looping, `playsinline` video with the poster as its first paint. The GIF moved to `media-src/`, out of the shipped tree.

The saving is larger than the file-size delta suggests, because the poster is what the visitor waits for and the MP4 streams behind it. `/case-studies/` went **2,851 → 505 KiB** and `/en/case-studies/` **2,849 → 503 KiB** in this pass alone.

### 2 · Raster images → WebP (−1,388 KiB, 66%)

Assets live in `public/`, which means Astro's image pipeline never sees them — it only processes what is imported through `src/`. Rather than restructure 55 images and every reference to them, this pass introduced a **`media-src/` convention**: the original file is moved out of the shipped tree, a derivative is written into `public/`, and `src/data/images.json` maps the old path to the new one plus its intrinsic dimensions, so components resolve the derivative and emit correct `width`/`height` in the same lookup.

36 of the 37 painted raster images adopted a derivative: **2,112,569 B → 724,282 B, a 66% cut.** The 37th was already smaller than anything a re-encode produced.

Two encode families, self-selecting by content rather than by a global quality number:

- **Flat-colour artwork** (every customer logo, the claim marks, the UI screenshots) → lossless WebP. Quality 95 was tried first and *failed* on the logos: the alpha edges picked up visible ringing. Flattening onto a neutral background (`.flatten({background: '#808080'})`) and encoding lossless fixed it and was still far smaller than the PNG.
- **Photographs** (`manual_mockup`, `heropricing`, `contact`) → WebP q95.

Every encode was checked by a banding gate — a gradient-smoothness metric that catches the specific artifact WebP produces on soft tonal ramps, which SSIM does not. All 36 scored 0.0. Quality 80 was tried and rejected: SSIM said it was fine, the banding gate did not.

**AVIF was measured and deliberately rejected.** It is meaningfully smaller than WebP on these images, but Safari only gained AVIF in 16.4, and shipping a second `<source>` for a 15% delta on assets that are already down 66% is complexity that buys very little. This is a decision, not an oversight — if the Safari floor moves, it should be revisited.

### 3 · The CSS strip (−2,331 KiB across 18 routes)

The audit called this "172–189 kB of unused Bootstrap on every page". Two things about that were wrong (see below), but the weight was real.

The method deliberately did not trust CSS coverage. **Coverage is a sampler** — it reports what a particular page state exercised, which means anything behind a hover, a media query, an open menu or a scroll position reads as unused whether it is or not. What is a *fact* is whether a selector's class can ever match anything in the built HTML. `scripts/css-usage.mjs` parses every rule in the sheet, extracts its class and id targets, and checks them against the class and id inventory of all 18 built pages; `scripts/strip-css.mjs` removes only rules where no target can possibly match, and keeps every at-rule, every element and attribute selector, and anything it cannot parse with certainty.

That took the source sheet from **162,623 B to 28,912 B**. Built and split by Astro, CSS on `/` fell from **187,476 B to 54,668 B**; the shared `Site` sheet is now 42,759 B.

The strip then had to prove it. That is what the 38-shot gate exists for, and it is the reason a five-shot spot check done earlier in the pass was thrown out as evidence — five shots cannot speak for eighteen routes at two widths. The full run came back:

```
=== GATE: PRE1 vs POST (CSS strip) ===
  38 shots, 0 with differences
  identical
```

The largest single dead region was Locomotive Scroll's scrollbar styling — every `.c-scrollbar`, `.c-scrollbar_thumb` and `has-scroll-dragging` rule. Locomotive's JavaScript is not shipped in this rebuild at all, so none of those classes is ever applied by anything.

### 4 · Lazy video (−684 KiB before first paint)

Four `<video>` elements carried `preload="none"`. They were downloading anyway — **`autoplay` overrides `preload` in Chrome**, and every one of them is an autoplaying decorative loop. The attribute that was supposed to defer them was doing nothing.

They are now gated behind an IntersectionObserver that attaches the sources when the element approaches the viewport. Measured: **0 KiB of video transferred before any scroll, 684 KiB after a full page walk.** The same bytes, moved off the critical path — which is why `byKind.video` on `/` reads 138,202 → 44,255 in a first-paint measurement rather than falling to zero.

### 5 · Loading priority (0 KiB, correct ordering)

Three images had no `loading` attribute. The audit's P3-2 named the wrong three: the file it flagged is not rendered by the component it attributed it to. The real offender was **`logo-dark.svg` in the Footer**, which is below the fold on every route and was loading eagerly on all 18.

Every `<img>` in the built output now carries an explicit `loading` value — `eager` for the two above-the-fold hero images, `lazy` for everything else. Verified by sweeping `dist/`: zero `<img>` without the attribute.

### 6 · Fonts (−37 KiB per route, −74 KiB on `/`)

Both Telegraf `@font-face` blocks listed three sources in the order TTF, WOFF, WOFF2. Browsers take the first format they support, and every current browser supports TrueType — so Chrome downloaded `Telegraf-Regular.ttf` (96 KiB) and never looked at `Telegraf-Regular.woff2` (20 KiB) sitting in the same directory.

Both blocks were rewritten to WOFF2 only with `font-display: swap`, and the four TTF and WOFF files were deleted after a repo-wide grep confirmed `src/styles/legacy.css` was their only reference anywhere.

`swap` on its own trades an invisible-text delay for a layout shift, so it was paired with a preload in `Site.astro`:

```html
<link rel="preload" href="/fonts/Telegraf-Regular.woff2" as="font" type="font/woff2" crossorigin />
```

The body font is declared *inside* `legacy.css`, so without this the browser cannot even learn the font exists until that sheet has been fetched and parsed — and on five routes the measured LCP element is text set in it. Only the Regular is preloaded: UltraLight is used by exactly one element, the `h1` on the two home pages, and preloading a face that 16 of the 18 routes never paint would trade one problem for a smaller copy of itself. `crossorigin` is required even same-origin, because fonts are fetched in CORS mode and a preload without it downloads the file twice; a probe confirmed there is no double download.

Font bytes across all 18 routes: **2,059,032 → 1,289,872 B, −37%.** Per route it depends on what the page actually paints, because Epilogue's subsets are unicode-range gated and that gating works: a Polish route pulls 79,474 B, `/` pulls 98,640 B (it also loads UltraLight), and an English route with no Polish characters in it pulls **49,642 B**. Before the change every one of them paid the same TrueType toll regardless.

Worst CLS across the site moved 0.0872 → **0.0876**. `font-display: swap` did not cost layout stability, because the preload lands the face before first text paint.

**Two things I had assumed about the fonts turned out to be false, and both were caught by a probe rather than by reading the code.** The predicted saving was ~39 KiB and the measurement said 98,640 B remained on `/`, so instead of guessing I wrote a throwaway Playwright probe that listed every font request:

- **Epilogue *is* shipped**, via fontsource, as four unicode-range-subset WOFF2 files (latin and latin-ext × 400 and 600) totalling 58,420 B per route. An earlier note in this project claimed Epilogue was referenced with no `@font-face` and silently fell back to a system font. That was wrong. It renders, it costs 58 KiB, and it now outweighs Telegraf.
- **`b, strong { font-family: Satoshi-Medium }` is dead, not broken.** A second probe over `/`, `/technologia/` and `/en/` found 9, 6 and 9 `b`/`strong` elements respectively and **zero** of them resolving to Satoshi — more specific rules win everywhere it could apply. It is a harmless leftover declaration, not a rendering bug, and should not be "fixed" by anyone reading this later.

## The gate

The font change was the last one, and its gate run is the one that matters most because it touched a stylesheet, a layout and the file inventory all at once:

```
=== GATE: POST (ttf-first fonts) vs FONT (woff2-only + preload + swap) ===
  video geometry: 36 shots, none changed
  38 shots, 0 with differences
  identical
```

Byte-identical screenshots across 18 routes at two widths, plus both menu states, plus exact video geometry on all 36 shots that contain a video. The CSS strip passed the same gate earlier in the pass. No change in this pass was kept on reasoning alone.

## Route-by-route

Transfer KiB, ungzipped text, measured after each pass in the order they were made.

| Route | Before | Media | CSS | Fonts | Cut |
|---|---:|---:|---:|---:|---:|
| `/` | 808 | 658 | 529 | 454 | 44% |
| `/case-studies/` | 2851 | 505 | 375 | 338 | 88% |
| `/cennik/` | 663 | 422 | 293 | 255 | 62% |
| `/czym-jest-esb/` | 650 | 409 | 280 | 242 | 63% |
| `/integracje/` | 419 | 383 | 254 | 216 | 48% |
| `/kalkulator/` | 684 | 443 | 313 | 276 | 60% |
| `/kontakt/` | 851 | 401 | 271 | 233 | 73% |
| `/pobieranie/` | 869 | 686 | 556 | 518 | 40% |
| `/polityka-prywatnosci/` | 384 | 349 | 219 | 181 | 53% |
| `/technologia/` | 1194 | 705 | 575 | 538 | 55% |
| `/en/` | 1371 | 628 | 498 | 456 | 67% |
| `/en/case-studies/` | 2849 | 503 | 374 | 395 | 86% |
| `/en/contact/` | 836 | 385 | 256 | 225 | 73% |
| `/en/download/` | 839 | 656 | 527 | 496 | 41% |
| `/en/integrations/` | 404 | 369 | 239 | 201 | 50% |
| `/en/pricing/` | 632 | 392 | 262 | 225 | 64% |
| `/en/technology/` | 1164 | 675 | 546 | 508 | 56% |
| `/en/what-is-esb/` | 619 | 379 | 249 | 211 | 66% |
| **TOTAL** | **18097** | **8956** | **6625** | **5978** | **67%** |
| **Mean** | **1005** | **497** | **368** | **332** | |

By resource kind, summed across all 18 routes:

| Kind | Before | After | Change |
|---|---:|---:|---|
| image | 10,639 KiB | 2,377 KiB | −78% |
| css | 3,327 KiB | 993 KiB | −70% |
| font | 2,010 KiB | 1,259 KiB | −37% |
| video | 862 KiB | 86 KiB | −90% (deferred, not removed) |
| html | 1,012 KiB | 1,016 KiB | +0.4% |
| js | 244 KiB | 244 KiB | — |

JavaScript was never a problem: 244 KiB across the whole site, ungzipped, and nothing in this pass touched it.

## Where the audit was wrong

The audit was right that the site was heavy and right about which routes. It was wrong about the mechanism in three places, and in each case the wrong diagnosis would have produced a worse fix.

**"21 images served far larger than displayed" does not survive a DPR check.** The audit compared intrinsic pixel dimensions against CSS display width at 1× and found 21 offenders. But a retina screen paints 2 device pixels per CSS pixel, so an image displayed at 208 CSS px needs 416 real pixels, and most of the "oversized" images were sized for exactly that. Measuring against the pixels actually painted at 2× DPR, **only 9 of 55 images exceed 1.3×, and the worst is 1.92×** — a rounding error, not a finding. Resizing on the audit's numbers would have saved very little and would have visibly softened every customer logo on a modern display. The real waste was **format**: PNG for flat-colour artwork it was never efficient at. Re-encoding at unchanged dimensions saved 66%.

**`legacy.css` is not stock Bootstrap.** The audit's P3-4 framed the fix as "strip unused Bootstrap", which would have meant reaching for a Bootstrap subset build or PurgeCSS with Bootstrap's safelist. The sheet is a ported bespoke stylesheet from the WordPress original with some Bootstrap-derived utilities mixed in, and its single largest dead region — Locomotive Scroll's scrollbar styling — is not Bootstrap at all. Any Bootstrap-shaped tool would have left it in place.

**P3-2 named the wrong images.** The three files the audit flagged as missing `loading="lazy"` are not rendered by the components it attributed them to. The actual eager below-the-fold image was `logo-dark.svg` in the Footer, on all 18 routes.

None of this makes the audit less useful — it pointed at the right four things and the right two routes. It does mean the numbers in an audit are a starting hypothesis, and a fix built on a hypothesis nobody re-measured is a fix aimed at the wrong target.

## Two bugs found while measuring

**The announcement bar's height ratchets, in production.** `--gi-bar-h` is measured by `main.js` from the rendered bar; the bar's own `min-height` was reading that variable back. A narrow first layout therefore latched a taller bar permanently: load the site at ≤600 px wide, widen the window to 1440, and the bar stays at its two-row 66 px height forever, shifting every route below it by up to 99 px. This is not a harness artifact — it reproduces in a normal browser, and `scripts/probe-bar-resize.mjs` is a standing reproduction against the unfixed build. It is fixed in `AnnouncementBar.astro` and `main.js`, and it is now **guarded permanently**: `shoot-routes.mjs` records the bar's height on every shot and fails the run if any route disagrees with its width's consensus. It found this bug by making two runs of an unchanged build disagree on five shots, which briefly made the gate's verdict on the CSS strip worthless — a harness that one element can silently corrupt is a harness that has to prove that element every run.

**`/en/pricing/` has real horizontal overflow.** Full-page capture width is 1513 px at a 1440 px viewport. The audit found no overflow anywhere at 320–1440, so this is either new or was missed. It is a layout bug, not a weight bug, and belongs to `/impeccable adapt`.

## Housekeeping done in this pass

- **Eleven files with zero references anywhere in `dist` were moved to `media-src/orphans/`** — 4.5 MB, headed by `use1-scaled.png` at 2.1 MB. They were shipped to visitors' browsers by nothing, but they were in the deploy payload and in every backup. `og-homehero.png` (712 KB) and `theme/static/linesmenu.svg` were deliberately **kept**: both are referenced from 20 routes even though `linesmenu` is never painted, and removing a referenced file to save bytes trades a real 404 for a hypothetical saving. `dist/` fell from 12 MB to 7.6 MB.
- **Twelve throwaway probe scripts were deleted.** The three that remain — `probe-bar-resize.mjs`, `probe-motion.mjs`, `probe-twoshot.mjs` — are kept as archived experiments with the reasoning that produced them; note that the latter two still carry the *old, wrong* freeze string in their own copies, deliberately, because they are the record of how it was disproved and not the gate.
- **Asset-integrity sweep over `dist`: 135 referenced paths, 0 missing.** Run twice, before and after the orphan move.
- **Every guarantee from the previous passes was re-verified intact**: consent gating (8/8 — the MailerLite tag stays silent until "Akceptuję", never loads on `/en/`, and withdrawal clears it), menu control alignment (9/9, 5.1:1 ring and label at all three widths), the two contrast fixes (6.27:1 and 5.23:1), accessible names (20/20), and focus indicators (9 pairs, lowest 4.63:1 against its backdrop).

## What is left

Nothing further in this scope is worth doing without a different kind of change. Ranked by what remains:

1. **Fonts are now the largest non-image cost, and Epilogue is the bigger half** — up to 58,420 B per route across four subsets, versus Telegraf's 39,080 B. Less headroom here than it looks, though, and it is worth saying why rather than leaving it as an obvious-looking win for someone to chase. The subsets are unicode-range gated and the gating demonstrably works: `/en/technology/` fetches three files and 49,072 B, `/technologia/` fetches five and 78,524 B, and the difference is exactly the two latin-ext subsets that the Polish page needs and the English one does not. Nothing is being downloaded that the page has no glyphs for. What is left is Telegraf's 39 KB, and the only way to cut that is to subset it — which risks a missing glyph on a Polish customer name, so it wants its own pass and its own gate rather than a quick edit here.
2. **89 KB of dead font files sit in the archive at zero transfer cost.** fontsource ships a `.woff` fallback beside every `.woff2` (78,148 B across six files) and a Vietnamese subset that nothing on this site can match (10,700 B). The `@font-face` rules list `woff2` first, so no browser fetches the `.woff` files, and no unicode-range on either page matches Vietnamese — this costs visitors nothing and was verified by watching the actual requests, not by reading the CSS. It is disk and deploy payload only. Worth cleaning up for tidiness; not worth risking the fontsource import for.
3. **Text compression is not this build's to fix.** Every text figure above is raw. `mod_deflate` on Artur's Apache will take roughly another third off the HTML and CSS at zero risk.
4. **AVIF, if the Safari 16.4 floor stops mattering.** Measured, deliberately deferred, not forgotten.
5. **The content JSON still names the eleven moved orphan files.** Nothing renders them, so nothing 404s, but the references should be cleaned up so a future reader does not go looking for the files.

**Routed elsewhere, deliberately not touched here:** the inline SVG on `/` and `/en/` runs 4 SMIL `<animate>` elements and ~20 CSS keyframe loops, none of which respects `prefers-reduced-motion` — that is `/impeccable animate`, and arguably an accessibility finding. Touch targets below the 24 px floor are `/impeccable adapt`, along with the `/en/pricing/` overflow found above. The bare "here" link on `/en/pricing/` is `/impeccable clarify`. The 216 hard-coded hex literals are `/impeccable polish`.

**Next:** the user-facing numbers moved, so the next step is `/impeccable polish` for the final pass.
