# Final Polish — gravity.integration (Astro rebuild)

`/impeccable polish` · web · register: brand · scope: the whole site — 18 routes, 10 Polish and 8 English, at 1440 and 390, plus both menu states.

This pass began with Design System Discovery, as the command requires, and the discovery is what shaped everything after it. Every deviation found is classified below as a **missing token**, a **one-off implementation**, or a **conceptual misalignment**, because naming the cause is the only thing that stops the same drift reappearing next quarter.

Two scoping decisions were taken with the user before any code changed: token unification covers stylesheets and component `<style>` blocks but **not** the 110 inline SVG artwork fills, and the Polish menu control's `CLOSE` label becomes `ZAMKNIJ`.

## Result

| | Before | After |
|---|---|---|
| Hex literals duplicating a token, in CSS and components | 32 | 0 |
| Multi-line prose over 75ch | 6 patterns, 20 blocks | 0 |
| Interactive elements with no pointer feedback | 5 | 0 |
| Routes with a truthful `aria-current` | 1 of 18 | 18 of 18 |
| Design tokens | 9 | 15 |
| Components declaring `--gi-*` privately | 1 | 0 |
| Console errors/warnings across 36 route×width combinations | 0 | 0 |

16 files changed, 358 insertions, 158 deletions. No dependency added, no markup restructured, no copy rewritten.

## Executive summary

- **Six new tokens closed three real gaps in the system** — there was no name for a measure, none for the light-panel tint or its hairline, and no name for the slate ramp the components kept re-deriving by eye.
- **Three near-identical colours were resolved into one each.** Two different near-blacks were doing the single job of "ink on light"; three different muted slates were doing the job of "secondary text", and the one that shipped most widely (`#6b6d84`) measured 5.07:1 where the comment next to it claimed better. All now point at one token apiece.
- **`aria-current="page"` was hard-coded on the home link**, so it was true on one route and a lie on the other seventeen. A screen reader on `/cennik/` was told it was on the home page. Replaced with a URL-derived helper; verified in built output as exactly one per route, on the right link, and zero on `404.html`.
- **The five ROI sliders were the only controls on the site that did not answer a pointer.** Fixed with the same ring the keyboard reader already got, at lower alpha, gated on `hover: hover` and with a reduced-motion escape.
- **Every prose measure cap on the site was wrong in one of three ways**, and all three had previously been written off as acceptable. Details below — this was the most interesting finding of the pass.
- **Seven separate instrument bugs were found and corrected**, each of which had manufactured or hidden findings. Two of them invalidated conclusions this pass had already reached. That section is the longest one here on purpose.

---

## Design system discovery

The system as found: nine `--gi-*` tokens in `tokens.css`, a real prose class (`.paragraph`, defined in the minified legacy layer as Epilogue/1rem/1.7 and used 19 times), and a convention — established by `DownloadPage.astro` — of aliasing global tokens to short local names inside a component's `<style>` block.

The convention was sound. The problem was that five components had written the alias blocks as bare hex literals rather than as `var(--gi-*)`, so the same eight values were being re-decided in five places. That is a **one-off implementation** repeated until it looks like a system.

### Missing tokens

Three concepts were in use everywhere and had no name.

**Measure.** `.paragraph` never carried a width, so running copy took whatever the Bootstrap column happened to be: 111ch on `/kontakt/` (`col-lg-9`), 99ch on the newsletter blurb and the home intro (`col-lg-8`). Now `--gi-measure: 68ch`, applied to `.paragraph`'s children rather than to the container — the container also holds `<h2>`s, which want the full column, and `.paragraph` is used on link boxes and the menu's legal column, which hold no `<p>` at all.

**The light tint and its hairline.** `#f3f4fb` and `#e4e5ef` appeared across FAQ rows, callouts, cards and category rules with no name between them. Now `--gi-bg-tint` and `--gi-line`.

**The slate ramp.** Components kept lightening `--gi-bg-slate` by eye for hover and lift states. Two named steps, `--gi-bg-slate-lift-1` and `--gi-bg-slate-lift-2`, replace the guessing.

### Conceptual misalignments

**Two near-blacks for one role.** `#1a1a2e` and `#14152a` were both "ink on light", differing by (−6, −5, −4). Unified on `#14152a`.

**Three muted slates and no name for the concept.** `#6b6d84`, `#5f6178` and `#9b9cae` were all "secondary text on a light surface". `#9b9cae` measures 2.71:1 on white — under the 3:1 large-text floor even at the 64px the pricing currency unit renders at. All three now resolve to `--gi-text-muted-slate: #5f6178` (6.06:1).

**A component claiming the system's namespace.** `RoiCalculator.astro` declared `--gi-border`, `--gi-text`, `--gi-green`, `--gi-white`, `--gi-card` and `--gi-dark` inside an `is:global` block. The names meant one thing globally and something else inside that component — the most expensive kind of drift, because it is invisible until someone trusts the name. Renamed to `--roi-*`, and `verify-polish.mjs` now carries a permanent guard against any recurrence.

That guard has exactly one carve-out, and the distinction it draws is worth stating: `site.css` declares `--gi-focus-ink` and `--gi-focus-halo` on `:root` and **rebinds** them on `.bg-green` / `.bg-light`, because a green focus ring is literally invisible on the brand green and measures 1.44:1 on the light panel. Rebinding a token to its correct value for a surface is the system working; claiming a system name for a private meaning is the system breaking. The guard allow-lists those two by name, so anything else still fails.

---

## The measure story

This is the part of the pass worth reading, because all three defects had already been examined and dismissed.

The site had four places that capped prose width. **Every one of them was wrong, in a different way, and each had a comment explaining why it was fine.**

**Two were pixel widths standing in for a concept.** `IntegrationsGrid`'s category description said `max-width: 780px` — at that component's 15.68px Epilogue, 88ch, across thirteen descriptions. The calculator's disclaimer said `max-width: 640px` — 78ch at 14.4px. A pixel width is a measure frozen against a font size it does not know about; change the type scale and the cap silently becomes wrong. Both now use `var(--gi-measure)`.

**One was the right unit on the wrong element.** The cookie panel's copy column said `max-width: 68ch` with a comment reading *"keeps the paragraph inside the 65–75ch band on wide screens"*. It did not. `ch` resolves against the font of the element it is written on — the wrapper inherits the panel's 16px, while the paragraph inside sets at 14px. So a box sized to 68 of the *wrapper's* characters handed the paragraph 78 of its own. The rule said 68 and delivered 78, and the measurement kept reporting 78 against a rule that plainly said otherwise, which was written off as a rounding quibble for weeks. Fixed by capping the children, the same shape `.paragraph > p` already used.

That last fix costs 26px: at 1440 the consent body goes from 78ch/4 lines to 68ch/5, and the bar from 154px to 180px. It is worth paying and it is not a close call — this is the one paragraph on the site the reader is being asked to make a *decision* about, so its legibility outranks 26px of a panel dismissed with one click. Below 1024 the cap never binds (the column is 340–459px), so every mobile layout is untouched.

**And one apparent defect was not one.** The hero's client-names line boxes at 88ch. Measure is a property of the *return sweep* — the eye travelling back for the start of the next line and landing on the wrong one — and that line renders as a single 12.8px line. There is no next line. Capping it would have inserted a hard wrap into the middle of a list of customer names in order to satisfy a number. `verify-polish.mjs` now counts line boxes from a Range's client rects and skips single-line blocks.

`CaseStudies` keeps a deliberate local override at `--measure: 72ch`, documented as such: it is a wide single-column article and reads well a few characters longer. It had been `39rem` — the same frozen-pixel mistake — and converting it to `ch` is what changed the case-study page heights in the pixel diff.

---

## Where the instruments lied

Seven harness bugs were found this pass. This section exists because `reference/polish.md` is explicit that *"a clean script result is never proof that the design is strong"*, and because two of these had already produced conclusions that were acted on.

**1. `CSSStyleRule` also exposes `.cssRules`.** In Chromium every style rule carries an empty `cssRules` list, for CSS nesting. A walk shaped `if (r.cssRules) { walk(r.cssRules); continue; }` therefore descends into every style rule and never reads a single `selectorText`. It reported **zero `:hover` rules on a Bootstrap-based page** and manufactured 135 false "no hover feedback" defects. Correct shape: test `selectorText` first, recurse only when there isn't one. The sweep now also fails loudly if it finds zero hover rules on any route, because that is the signature of the walk being broken rather than of a site with no hover states.

**2. "Visible" has to mean *on the page*.** The MailerLite honeypots sit at x ≈ −9566 inside a 1×1 wrapper with `tabindex="-1"`. A width/height/visibility test calls them visible inputs.

**3. `<input type="submit">`'s accessible name is its `value` attribute**, not its `textContent`.

**4. A pseudo-class only counts if it sits on the selector's subject.** `a:hover .icon {}` gives the anchor feedback, not the icon.

**5. …but the subject rule is necessary, not sufficient.** It also has to credit *ancestor*-hover selectors whose subject **is** the element. `legacy.css` carries `.btn-arrow:hover input { color:#fff }`, and the submit input is a direct child filling the wrapper, so hovering the input always hovers the ancestor. `input.wpcf7-submit` on 14 shots was a **false positive that was one edit away from being "fixed"**. The correct rule follows from how `:hover` works — it matches an element *and all of its ancestors* — so an ancestor `:hover` is guaranteed live whenever the pointer is over the subject. The only combinator that breaks the guarantee is a sibling one.

**6. `el.matches()` can never match a pseudo-element.** Range thumbs are styled the only way they can be, on `::-webkit-slider-thumb`, so a correctly implemented `.gi-range:hover::-webkit-slider-thumb` still read as *missing* hover feedback — after the fix had already shipped. The subject selector has to have its trailing pseudo-element stripped before it is matched.

**7. pixelmatch at `threshold: 0.1` is blind to small uniform colour shifts, and the CSSOM is blind to other engines' rules.** Two variants of the same lesson, and the most consequential findings of the pass:

- `diff-shots.mjs` runs pixelmatch at `threshold: 0.1`, i.e. a YIQ delta ceiling of 35215 × 0.1 = **3521.5**. `#6b6d84 → #5f6178` is exactly −12 on every channel, so Δi = Δq = 0 and the delta is ≈ **73**. `#1a1a2e → #14152a` scores ≈ **14**. Both sit ~50× and ~250× below the threshold. The pixel diff reported "no difference" on `/cennik/` and that was **within a hair of being accepted as proof the colour edits had landed**. It is not evidence of anything; it is the instrument being blind by design.
- The CSSOM is the engine's *parsed* view of a stylesheet, not its text. Chromium does not know `::-moz-range-thumb`, so it drops that rule and the harness's assertion of "2 hover rules" could never pass. Asserting 2 was asking a Chromium DOM to confirm a Firefox rule. The Chromium half is now asserted against the CSSOM and the Firefox half against the built CSS text, where it is a fact rather than a rendering.

The answer to all seven is `scripts/verify-polish.mjs`: a harness that asserts by DOM query everything the pixel diff cannot see — computed colours, resolved token values, the namespace guard, real-`ch` measure across 12 routes, four-state header alignment at three widths, and the hover rules. It passes.

---

## Verification

Nothing here was accepted on reasoning alone.

**`scripts/verify-polish.mjs` — all checks passed.** Computed currency-unit colour, five token values, the namespace guard, zero multi-line prose over 75ch across 12 routes, four-state ring/gap equality at 1440/900/390 with `ZAMKNIJ` in place, both slider hover rules, and a demonstration that the submit button does change colour on hover.

**`scripts/polish-sweep.mjs` — 36 route×width combinations, clean.** No unnamed interactive elements, no dead links, no duplicate ids, no heading skips, no missing focus ring, no missing `alt`, no long lines, **no elements without hover feedback**, and zero console errors or warnings.

**38-shot pixel-and-geometry diff, twice.** Every changed pixel is accounted for:

- Nineteen desktop shots changed in rows 695–874 only — full width, near-identical pixel counts on pages ranging from 900px to 6529px tall. That constant-size signature is a fixed element, and measuring the bounding box of the changed region confirmed it: the consent bar, 154px → 180px. Nothing else on any of those pages moved.
- `/integracje/` +51px and `/en/integrations/` +101px: the thirteen category descriptions reflowing from 88ch to 68ch.
- `/kalkulator/` +25px: the disclaimer reflowing from 78ch.
- `/case-studies/` −260px and `/en/case-studies/` −205px, with the video's **top** rising 59px in both locales: the `.cs` measure converting from `39rem` (624px) to `72ch`, which resolves to 654.9px at that component's 17px Epilogue. Measured, not assumed. The video's *left* never moved — the geometry sidecar records `[top, left, width, height]`, and reading that tuple as `[x, y, …]` briefly turned a vertical reflow into a phantom horizontal shift.
- Zero mobile shots changed, which is correct: at 390px prose is already under 68ch everywhere.
- The announcement-bar height consensus assertion passed identically to baseline: 47px desktop, 66px mobile, all routes agreeing.

---

## Deliberately not changed

- **The 110 inline SVG artwork fills**, per the agreed scope.
- **`legacy.css`.** A 6-line minified vendor blob. All 22 of its token-duplicate hits are on line 6.
- **`var(--gi-x, #literal)` fallbacks** (~30). The literal is the fallback's whole job.
- **Hex quoted inside contrast comments.** Documentation, not values.
- **`b, strong { font-family: Satoshi-Medium }`.** Dead, not broken; "fixing" it would change type on every bolded word on the site.
- **The English `CLOSE` label.** Only the Polish dictionary was translated, by agreement.

## Routed elsewhere

- 31 small touch targets, all inline prose links and all WCAG 2.5.8-exempt, plus the `/en/pricing/` overflow → **`/impeccable adapt`**.
- Missing `prefers-reduced-motion` on the home-page SVG → **`/impeccable animate`**.
- The bare "here" link on `/en/pricing/` → **`/impeccable clarify`**.
