#!/usr/bin/env python3
"""Measure the off/on screenshot pairs written by verify-harden-a11y.mjs.

Three instruments, in order of how much they can be fooled:

  1. "Did any bytes change?" — fooled during the audit on /kontakt/
     input#nemaiil: 0.68% of pixels differed, but the pill border was
     pixel-identical and the whole delta was a label above it reflowing a
     pixel. Byte-compare cannot tell reflow from a focus ring.

  2. "Did pixels change in a ring around the control?" — fixes that, and it
     is what this script checked first. It still passed a ring drawn in the
     brand green ON the brand-green contact panel, because pixels genuinely
     did change: the field's dark border turned green and the input vanished.
     Presence is not visibility.

  3. What is actually checked below: sample the indicator's ink and the panel
     it is drawn on, and compute WCAG contrast between them. WCAG 1.4.11 asks
     3:1 of a focus indicator against adjacent colour. A green ring on a green
     panel is 1:1 and fails here, which is the correct answer.

Note that the WCAG 2.2 SC 2.4.13 test — 3:1 between the same pixels focused
and unfocused — would have PASSED the broken green-on-green case at 5.6:1,
because a dark border turning green is a large pixel change. It is measured
and printed for completeness, but it is not the gate. The gate is contrast
against the backdrop, because that is what decides whether a human can see
the control.
"""
import json
import sys
from collections import Counter
from pathlib import Path

from PIL import Image, ImageChops

OUT = Path("/tmp/harden-focus")
PAD_CSS = 16  # matches PAD in the harness
DSF = 2
PAD = PAD_CSS * DSF
MIN_INK_PX = 100  # ~a 2px-wide perimeter segment; stops one stray antialiased
# pixel from carrying the verdict
GATE = 3.0  # WCAG 1.4.11


def lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum(rgb):
    r, g, b = rgb
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def contrast(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def modal(img, coords):
    c = Counter(img.getpixel(p) for p in coords)
    return c.most_common(1)[0][0] if c else None


manifest = json.loads((OUT / "manifest.json").read_text())
failures = []

for rec in manifest:
    key, route, sel = rec["key"], rec["route"], rec["sel"]
    label = f"{route}{sel}"
    if rec.get("note"):
        print(f"  SKIP        {label}  ({rec['note']})")
        continue
    if not rec["reached"]:
        print(f"  UNREACHED   {label}  — keyboard never landed on it")
        failures.append((label, "unreachable by Tab"))
        continue

    off = Image.open(OUT / f"{key}-off.png").convert("RGB")
    on = Image.open(OUT / f"{key}-on.png").convert("RGB")
    if off.size != on.size:
        print(f"  SIZE-DIFF   {label}  {off.size} vs {on.size}")
        failures.append((label, "crop size changed between captures"))
        continue

    w, h = off.size
    diff = ImageChops.difference(off, on).convert("L")
    mask = diff.point(lambda v: 255 if v > 12 else 0)
    changed = [
        (x, y)
        for x in range(w)
        for y in range(h)
        if mask.getpixel((x, y))
    ]
    pct = 100.0 * len(changed) / (w * h)

    if not changed:
        print(f"  NONE        {label}  0 px changed — no indicator drawn")
        failures.append((label, "no focus indicator drawn"))
        continue

    # the panel the control sits on: the outermost frame of the crop in the
    # unfocused shot, which is well outside the control (PAD is 32 device px)
    if rec["mode"] == "clip":
        frame = (
            [(x, y) for x in range(w) for y in (0, 1, 2, 3, h - 4, h - 3, h - 2, h - 1)]
            + [(x, y) for y in range(h) for x in (0, 1, 2, 3, w - 4, w - 3, w - 2, w - 1)]
        )
    else:
        xs = [p[0] for p in changed]
        ys = [p[1] for p in changed]
        frame = [
            (x, y)
            for x in range(max(0, min(xs) - 6), min(w, max(xs) + 6))
            for y in (max(0, min(ys) - 6), min(h - 1, max(ys) + 5))
        ]
    backdrop = modal(off, frame)

    # every distinct ink the indicator paints, with enough area to count
    inks = Counter(on.getpixel(p) for p in changed)
    candidates = [(c, n) for c, n in inks.items() if n >= MIN_INK_PX]
    if not candidates:
        candidates = [inks.most_common(1)[0]]
    best_ink, best_n, best_cr = None, 0, 0.0
    for c, n in candidates:
        cr = contrast(c, backdrop)
        if cr > best_cr:
            best_ink, best_n, best_cr = c, n, cr

    # SC 2.4.13's focused-vs-unfocused pixel test, reported but not the gate
    state_cr = max(
        (contrast(on.getpixel(p), off.getpixel(p)) for p in changed[:: max(1, len(changed) // 4000)]),
        default=0.0,
    )

    ok = best_cr >= GATE
    verdict = "ok" if ok else "FAIL"
    if not ok:
        failures.append(
            (
                label,
                f"indicator rgb{best_ink} on backdrop rgb{backdrop} = {best_cr:.2f}:1, "
                f"under the {GATE}:1 WCAG 1.4.11 floor",
            )
        )
    print(
        f"  {verdict:<6}  {label}  {pct:5.2f}% changed  "
        f"ink=rgb{best_ink}({best_n}px) on rgb{backdrop}  "
        f"vs-backdrop={best_cr:5.2f}:1  vs-unfocused={state_cr:5.2f}:1"
    )

print()
if failures:
    print(f"{len(failures)} problem(s):")
    for label, why in failures:
        print(f"  - {label}: {why}")
    sys.exit(1)
print(f"all focus indicators verified at >= {GATE}:1 against their backdrop")
