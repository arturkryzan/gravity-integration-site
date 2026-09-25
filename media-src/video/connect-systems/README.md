# connect-systems — the "Połącz każdy system" loop

A 6.0-second seamless loop (180 frames, 30 fps) for home section 2, row 1
("Połącz każdy system — ERP, CRM, WMS i więcej" / "Connect every system").
Rendered in Blender 5 / Cycles, finished in a small Python post pipeline.

| File | What it is |
|---|---|
| `connect-systems-fhd.mp4` | 1920×1080 master, H.264 CRF 14 — the untouched full frame |
| `gi_scene.py` | the whole shot: scene, materials, lights, camera, animation |
| `post.py`, `exrio.py` | EXR → finished frames: bloom, label chips, edge dissolve |
| `encode.sh` | frames → FHD master, site MP4/WebM (1440×804), poster |

The site files are `public/video/connect-systems.{webm,mp4}` and
`connect-systems-poster.jpg`. The rules any replacement has to meet are in
`DESIGN.md` → "Use-case loops".

## The shot

The light edition of the new hero's language — the satin gravity well, the
glossy green core, dark satellites, ripples — re-lit for `section.bg-light`
so it belongs with the other three loops in the section.

Six systems (ERP, CRM, WMS, API, SQL, EDI) sit on the rim of the well around
the green hub. Three beats, two seconds apart:

1. Two systems send. Their pulses **accelerate** as they spiral down into the
   well — gravity, `ease-in^2.3` — and trail streaks whose length follows their
   speed.
2. The hub squashes 1.6% in anticipation, catches both pulses, pops (a damped
   spring, 4%), flashes, and throws a ripple across the satin with a faint
   green glow riding its crest.
3. Two new pulses **decelerate** as they climb out. The wavefront is timed to
   reach the rim at the same instant, so each receiver lights green and rides
   the wave up together. Label chips carry a status dot that lights with it.

Every system sends once and receives once per loop:
`ERP+WMS → CRM+SQL`, `CRM+API → EDI+WMS`, `SQL+EDI → ERP+API`.
Two small satellites orbit the hub half a turn per loop (they are identical,
so they swap places); their phase was chosen by sweep so no pulse ever passes
within 0.28 units of one. The camera drifts ±2.6° on the same 6 s period.

Everything that moves is a function of time summed over the event's copies at
t−6, t and t+6, so frame 180 is frame 0: on the final frames the wrap step
179→0 measures +0.10 sd from an ordinary frame-to-frame step.

## Re-rendering

```bash
python3.11 -m venv bvenv && bvenv/bin/pip install bpy==5.0.1 "numpy<2"
python3.11 -m venv pvenv && pvenv/bin/pip install numpy pillow OpenEXR opencv-python-headless fonttools brotli
# Epilogue 700 as TTF for the chips (from @fontsource/epilogue):
pvenv/bin/python -c "from fontTools.ttLib import TTFont; f=TTFont('node_modules/@fontsource/epilogue/files/epilogue-latin-700-normal.woff2'); f.flavor=None; f.save('fonts/Epilogue-700.ttf')"

bvenv/bin/python gi_scene.py --out final --res 1920x1080 --frames 0-179      # ~46 s/frame on 2 cores
pvenv/bin/python post.py --src final --dst final/post
PY=pvenv/bin/python bash encode.sh final/post out connect-systems
```

Useful while iterating: `--times 1.0,1.95 --res 640x360 --spp 12` renders
single moments; `--set key_energy=9000` (any key in `DEFAULTS`) overrides a
parameter without editing the file. Renders resume — existing frames are
skipped.

Render settings that matter: 6 spp + OpenImageDenoise with albedo/normal
passes and the FAST prefilter (ACCURATE cost 17 s/frame and was
indistinguishable at 100%), and a fixed seed so the denoiser doesn't boil
between frames.

## The edge

The dissolve completes at 95.5% of a squircle (`post.py --edge 0.70,0.955`), so
the outer 16 px top/bottom and 28 px at the sides of the 1440×804 cut are the
page background on every frame — deep enough that no compositor rounding can
reach picture. At 98.5% the band was exact at the ring but Chromium, for the
single frame after each loop restart, sampled ~10 rows in and read one extra
level. Measured on the delivered files: MP4 exact, WebM within 1, Chromium
`(243,244,250)` everywhere including the restart (`scripts/verify-video-seam.mjs`).

## Things that cost time

- **Blender 5's Mix node has one `A`/`B`/`Result` socket per data type.**
  `mix.inputs["A"]` returns the disabled *float* socket; colours set there do
  nothing. `gi_scene.sock()` resolves sockets by identifier (`A_Color`).
- **Green is ~15× brighter than the navy.** A linear glow value leaves a
  resting sphere visibly teal for a second after its flash ends; both the tint
  and the emission go through `glow³`.
- **Labels are 2D, on purpose.** They are drawn in post from each sphere's
  projected position (`screen.json`, written by the render), scaled by depth
  and softened by the sphere's circle of confusion, so they sit in the shot —
  and can be restyled, translated or dropped without re-rendering. They are
  language-neutral, because the same file plays on `/` and `/en/`.
