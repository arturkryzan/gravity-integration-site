/* gravity.integration v2 — the home hero in motion: "every tool falls in."
 *
 * Built from the design system's own parts and nothing else: the mass, one
 * satellite, mint and ink. What it animates is the system's colour rule —
 * type on the field is ink, type on the mass is mint (§02, §04) — so
 * anything that crosses the mass's edge changes colour exactly on the edge,
 * through the middle of a letter if that is where the edge is.
 *
 * 1. The entrance. The mass falls into the frame from its crop corner (from
 *    the top, in the frame below 1000px) on the fall curve. The headline is
 *    already there, ink on the field; as the edge sweeps over it, every
 *    letter turns mint along the line the edge cuts.
 * 2. The loop, 1000px and wider. A satellite falls in from the frame's edge,
 *    toward the core, and stops where the static design puts it. Beside it,
 *    in the system's mono label, the name of a real connector (HomeHero.astro
 *    reads them from the directory at build time). Then the mass takes it:
 *    it swings, accelerates — inverse-square gravity, integrated at 240 Hz —
 *    crosses the edge, ink outside and mint inside, and sinks. The name
 *    follows it in, a letter at a time. The mass doesn't move; it is the
 *    heavy one. Then the next connector.
 *
 * Nothing waits on this. The page is complete without it: the inline script
 * in HomeHero.astro hands the hero over before first paint and takes it back
 * after 3s if this file never ran, reduced motion never hands it over, and an
 * error here puts the static composition back. The loop stops while the hero
 * is off-screen or the tab is hidden, the pause button stops it for good
 * (WCAG 2.2.2), and between movements it sleeps on a timer rather than
 * running frames. */

const hero = document.querySelector('section.hero[data-anim="pre"]');
if (hero) run(hero);

/* timing, ms */
const INTRO = 1400; // the mass falls into the frame
const INTRO_TURNED = 1100; // … from the top, below 1000px
const LOOP_AT = 950; // the first satellite falls in while the mass settles
const ENTER = 700; // a satellite, from the frame's edge to its place
const LABEL_AT = 380; // its name starts to set during the fall …
const GLYPH_STAGGER = 22; // … a letter at a time
const GLYPH_IN = 240; // each letter's own entry (--dur-base)
const HOLD_FIRST = 4200; // time to read; longer the first time
const HOLD = 3400;
const LETGO = 110; // the name lets go after the satellite,
const LETGO_STAGGER = 24; // nearest letter first
const REST = 800; // an empty field between two falls

/* physics */
const FALL = 0.9; // s: from the satellite's place to the mass's edge, straight down the well
const DRAG = 5; // 1/s: what the mass does to anything inside it
const STEP = 1 / 240; // s
const TAU = Math.PI * 2;

/* --ease-fall, cubic-bezier(.55, 0, .1, 1), as a function of time. */
const EASE = bezier(0.55, 0, 0.1, 1);

function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t;
  const Y = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 32; i++) {
      const v = X(t);
      if (Math.abs(v - x) < 1e-5) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return Y(t);
  };
}

function run(hero) {
  const mass = hero.querySelector('.hero-mass');
  const satEl = hero.querySelector('.hero-satellite');
  const h1 = hero.querySelector('.hero-h1');
  const copy = hero.querySelector('.hero-copy');
  const canvas = hero.querySelector('.hero-fx');
  const pauseBtn = hero.querySelector('.hero-pause');
  const ctx = canvas && canvas.getContext('2d');
  if (
    !mass ||
    !satEl ||
    !h1 ||
    !copy ||
    !ctx ||
    !pauseBtn ||
    !('IntersectionObserver' in window) ||
    !('ResizeObserver' in window)
  ) {
    hero.removeAttribute('data-anim');
    return;
  }
  hero.dataset.anim = 'ready';

  const css = getComputedStyle(hero);
  const INK = css.getPropertyValue('--ink-900').trim() || '#1e1f33';
  const MINT = css.getPropertyValue('--mint-500').trim() || '#01ec90';
  const FONT = `500 12px ${css.getPropertyValue('--font-mono').trim() || 'monospace'}`;
  const TRACK = 12 * 0.08; // --track-label
  let tools = [];
  try {
    tools = JSON.parse(hero.dataset.tools || '[]');
  } catch (e) {
    tools = [];
  }
  if (document.fonts && document.fonts.load) document.fonts.load(FONT, tools.join('')).catch(() => {});

  const mqTurned = matchMedia('(max-width: 999.98px)');
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---- geometry, in the hero's coordinates ------------------------------ */
  let W = 0;
  let HH = 0;
  let C = { x: 0, y: 0 }; // the mass's centre at rest
  let R = 0;
  let h1Box = { x: 0, y: 0, w: 0, h: 0 };
  let turned = false;
  let loopOK = false; // is there a frame for the loop at this size?
  let home = { x: 0, y: 0 }; // the satellite's place
  let sr = 0;
  let entry = { x: 0, y: 0 }; // where a satellite enters the frame
  let gap = 0; // label ↔ satellite
  let pullMax = 0;
  let adv = 8; // one mono letter plus tracking
  let capH = 8.6;
  let labelMode = 'none'; // 'left' of the satellite, 'above' it, or none
  let GM = 1;
  let K = 0.3; // the swing: tangential speed at let-go, as a share of orbital speed
  let sink = 1; // how deep into the mass a body travels before it is gone
  let box = { x: 0, y: 0, w: 1, h: 1 }; // the canvas, in hero coordinates
  let dpr = 1;
  let geomKey = '';

  const rel = (r, hr) => ({ x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height });
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const inflate = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });

  function measure() {
    const hr = hero.getBoundingClientRect();
    W = hr.width;
    HH = hr.height;
    const keep = mass.style.transform;
    mass.style.transform = 'none';
    const m = rel(mass.getBoundingClientRect(), hr);
    mass.style.transform = keep;
    R = m.w / 2;
    C = { x: m.x + R, y: m.y + R };
    h1Box = rel(h1.getBoundingClientRect(), hr);
    turned = mqTurned.matches;
    loopOK = false;
    if (turned || !tools.length) return;

    const sb = rel(satEl.getBoundingClientRect(), hr);
    sr = sb.w / 2;
    home = { x: sb.x + sr, y: sb.y + sr };
    /* Its place must be whole inside the frame (on very wide screens the
       static design puts it above the top edge). */
    if (sr < 4 || home.y - sr < 4 || home.x - sr < 4) return;

    ctx.font = FONT;
    adv = ctx.measureText('0').width + TRACK;
    capH = ctx.measureText('H').actualBoundingBoxAscent || 8.6;
    gap = Math.max(14, sr * 0.7);
    pullMax = Math.min(18, gap * 0.6);

    /* The label sits left of the satellite if the longest name fits on the
       field there; else above it; else there is no label. */
    const longest = tools.reduce((a, b) => (b.length > a.length ? b : a), '');
    const copyBox = inflate(rel(copy.getBoundingClientRect(), hr), 16);
    const onField = (r) =>
      [
        [r.x, r.y],
        [r.x + r.w, r.y],
        [r.x, r.y + r.h],
        [r.x + r.w, r.y + r.h],
      ].every(([x, y]) => Math.hypot(x - C.x, y - C.y) > R + 8);
    const fits = (r) =>
      r.x >= 8 &&
      r.y >= 6 &&
      r.x + r.w <= W - 8 &&
      !overlaps(r, copyBox) &&
      !overlaps(r, inflate(h1Box, 16)) &&
      onField(r);
    labelMode = 'none';
    for (const mode of ['left', 'above']) {
      const r = labelRect(longest, mode);
      if (fits(r)) {
        labelMode = mode;
        break;
      }
    }

    /* A new satellite enters along the line from the core through its
       place, from wherever that line leaves the frame. */
    const d = Math.hypot(home.x - C.x, home.y - C.y);
    const u = { x: (home.x - C.x) / d, y: (home.y - C.y) / d };
    let t = d;
    if (u.y < 0) t = Math.min(t, (home.y + sr + 2) / -u.y);
    if (u.x < 0) t = Math.min(t, (home.x + sr + 2) / -u.x);
    entry = { x: home.x + u.x * t, y: home.y + u.y * t };

    /* Gravity sized so the straight fall from its place to the edge takes
       FALL seconds at any size (free fall in 1/r², solved for GM). */
    const x = R / d;
    const f = Math.sqrt(x * (1 - x)) + Math.acos(Math.sqrt(x));
    GM = ((d * d * d) / (2 * FALL * FALL)) * f * f;

    /* The swing: as wide as the frame allows. A wider swing meets the mass
       higher up, further from the headline, but it must not leave the frame
       through the top. */
    const sample = layoutGlyphs(longest);
    const far = sample.length ? sample[0] : null;
    K = 0.1;
    for (let k = 0.34; k >= 0.1; k -= 0.02) {
      const a = simulate(home.x, home.y, k, 0.16 * R, sr);
      const b = far ? simulate(far.hx, far.hy, k, 0.16 * R, 9) : a;
      if (a.top >= 4 && b.top >= 4) {
        K = k;
        break;
      }
    }
    /* Everything sinks out of sight at most halfway from the edge to the
       headline's first line. */
    const probe = simulate(home.x, home.y, K, 0.16 * R, sr);
    sink = Math.max(0.07 * R, Math.min(0.16 * R, 0.5 * (h1Box.y - probe.cross.y)));

    /* The canvas covers every place anything is drawn, and no more. */
    const bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const grow = (x0, y0, x1, y1) => {
      bb.x0 = Math.min(bb.x0, x0);
      bb.y0 = Math.min(bb.y0, y0);
      bb.x1 = Math.max(bb.x1, x1);
      bb.y1 = Math.max(bb.y1, y1);
    };
    simulate(home.x, home.y, K, sink, sr, grow);
    for (const g of [sample[0], sample[sample.length >> 1], sample[sample.length - 1]]) {
      if (g) simulate(g.hx, g.hy, K, sink, 9, grow);
    }
    const p = pullMax + sr + 2;
    grow(home.x - p, home.y - p, home.x + p, home.y + p);
    grow(entry.x - sr, entry.y - sr, entry.x + sr, entry.y + sr);
    if (labelMode !== 'none') {
      const r = inflate(labelRect(longest, labelMode), 14);
      grow(r.x, r.y, r.x + r.w, r.y + r.h);
    }
    const x0 = Math.max(0, Math.floor(bb.x0 - 4));
    const y0 = Math.max(0, Math.floor(bb.y0 - 4));
    const x1 = Math.min(W, Math.ceil(bb.x1 + 4));
    const y1 = Math.min(HH, Math.ceil(bb.y1 + 4));
    box = { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
    loopOK = true;
  }

  function labelRect(text, mode) {
    const w = text.length * adv - TRACK;
    if (mode === 'left') {
      const right = home.x - sr - gap;
      return { x: right - w, y: home.y - 7, w, h: 14 };
    }
    return { x: home.x + sr - w, y: home.y - sr - 25, w, h: 14 };
  }

  function layoutGlyphs(text) {
    if (labelMode === 'none') return [];
    const r = labelRect(text, labelMode);
    const y = r.y + 7;
    const out = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === ' ') continue;
      const hx = r.x + i * adv + (adv - TRACK) / 2;
      const d = Math.hypot(C.x - hx, C.y - y);
      out.push({
        ch,
        hx,
        hy: y,
        ux: (C.x - hx) / d,
        uy: (C.y - y) / d,
        ...body(hx, y),
        tin: 0,
      });
    }
    return out;
  }

  function sizeCanvas() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.left = `${box.x}px`;
    canvas.style.top = `${box.y}px`;
    canvas.style.width = `${box.w}px`;
    canvas.style.height = `${box.h}px`;
    canvas.width = Math.max(1, Math.round(box.w * dpr));
    canvas.height = Math.max(1, Math.round(box.h * dpr));
  }

  /* ---- bodies ----------------------------------------------------------- */
  function body(x, y) {
    return { x, y, vx: 0, vy: 0, s: 1, t0: 0, live: false, inside: false, gone: false };
  }

  /* Let go with a sideways push, clockwise: from the top-left that carries
     a body up and over, so it meets the mass on its crown. */
  function launch(b, k) {
    const rx = b.x - C.x;
    const ry = b.y - C.y;
    const r = Math.hypot(rx, ry) || 1;
    const v = k * Math.sqrt(GM / r);
    b.vx = (-ry / r) * v;
    b.vy = (rx / r) * v;
    b.live = true;
  }

  function step(b, dt, sk) {
    const rx = b.x - C.x;
    const ry = b.y - C.y;
    const r = Math.hypot(rx, ry) || 1e-3;
    const a = GM / (r * r);
    b.vx -= (rx / r) * a * dt;
    b.vy -= (ry / r) * a * dt;
    if (r < R) {
      const f = Math.exp(-DRAG * dt);
      b.vx *= f;
      b.vy *= f;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const r2 = Math.hypot(b.x - C.x, b.y - C.y);
    b.inside = r2 < R;
    b.s = b.inside ? Math.max(0, 1 - (R - r2) / sk) : 1;
    if (b.s <= 0) b.gone = true;
  }

  function simulate(x, y, k, sk, rad, grow) {
    const b = body(x, y);
    launch(b, k);
    let top = y - rad;
    let cross = null;
    for (let i = 0; i < 240 * 6 && !b.gone; i++) {
      step(b, STEP, sk);
      if (!cross && b.inside) cross = { x: b.x, y: b.y };
      top = Math.min(top, b.y - rad * b.s);
      if (grow) grow(b.x - rad, b.y - rad, b.x + rad, b.y + rad);
    }
    return { top, cross: cross || { x: b.x, y: b.y } };
  }

  /* ---- the clock ----------------------------------------------------------
     `vt` is the animation's own time. It runs while there is something to
     run (the entrance, or the loop in view and not paused), frame by frame
     while something moves, and on a single timer while nothing does. */
  let vt = 0;
  let lastReal = -1;
  let raf = 0;
  let timer = 0;
  let dead = false;
  let started = false;
  let settled = false; // the entrance is over (or was skipped)

  let introOn = false;
  let introT0 = 0;
  let introDur = INTRO;
  let introFrom = { x: 0, y: 0 };
  let massOff = { x: 0, y: 0 };

  let loopOn = false;
  let phase = 'idle'; // rest → enter → hold → capture → rest …
  let phaseT0 = 0;
  let enterDur = ENTER;
  let holdDur = HOLD_FIRST;
  let firstHold = true;
  let toolIdx = 0;
  let glyphs = [];
  let sat = null;
  let physT = 0;
  let pointer = null;
  let pull = { x: 0, y: 0 };
  let pullTo = { x: 0, y: 0 };
  let paused = false;
  let inView = true;
  let dirty = true;

  const loopRuns = () => loopOn && !paused && inView && !document.hidden;
  const clockRuns = () => !dead && ((introOn && !document.hidden) || loopRuns());

  function needsFrames() {
    if (introOn) return true;
    if (!loopRuns()) return false;
    if (phase === 'enter' || phase === 'capture') return true;
    if (phase === 'hold') return Math.hypot(pullTo.x - pull.x, pullTo.y - pull.y) > 0.15;
    return false;
  }
  function nextWake() {
    if (phase === 'hold') return phaseT0 + holdDur;
    if (phase === 'rest') return phaseT0 + REST;
    return Infinity;
  }
  function sync() {
    if (lastReal < 0) return;
    const now = performance.now();
    vt += Math.max(0, now - lastReal);
    lastReal = now;
  }
  function kick() {
    if (raf) cancelAnimationFrame(raf);
    if (timer) clearTimeout(timer);
    raf = 0;
    timer = 0;
    if (!clockRuns()) {
      lastReal = -1;
      return;
    }
    if (lastReal < 0) lastReal = performance.now();
    if (needsFrames()) raf = requestAnimationFrame(frame);
    else {
      const wake = nextWake();
      if (wake < Infinity) timer = setTimeout(() => frame(performance.now()), Math.max(0, wake - vt) + 1);
    }
  }
  function frame(now) {
    raf = 0;
    timer = 0;
    try {
      const before = vt;
      if (lastReal >= 0) vt += Math.max(0, now - lastReal);
      lastReal = now;
      update(vt - before);
      draw();
      kick();
    } catch (e) {
      teardown();
      throw e;
    }
  }

  /* ---- the entrance ------------------------------------------------------ */
  /* Where the mass starts: on the diagonal out of the crop corner, just
     touching the frame's corner (desktop), or wholly above the frame. */
  function introStart() {
    if (turned) return { x: 0, y: -(C.y + R) - 12 };
    const ux = 0.8;
    const uy = 0.6;
    const dx = C.x - W;
    const dy = C.y - HH;
    const b = dx * ux + dy * uy;
    const c = dx * dx + dy * dy - R * R;
    const t = -b + Math.sqrt(Math.max(0, b * b - c));
    return { x: ux * t, y: uy * t };
  }
  function setMass(o) {
    mass.style.transform = o.x || o.y ? `translate3d(${o.x.toFixed(2)}px, ${o.y.toFixed(2)}px, 0)` : '';
  }
  function setH1(o) {
    h1.style.setProperty('--hx', `${(C.x + o.x - h1Box.x).toFixed(2)}px`);
    h1.style.setProperty('--hy', `${(C.y + o.y - h1Box.y).toFixed(2)}px`);
    h1.style.setProperty('--hr', `${R.toFixed(2)}px`);
  }
  function clearH1() {
    h1.style.removeProperty('--hx');
    h1.style.removeProperty('--hy');
    h1.style.removeProperty('--hr');
  }
  function startIntro() {
    introOn = true;
    introT0 = vt;
    introDur = turned ? INTRO_TURNED : INTRO;
    introFrom = introStart();
    massOff = { ...introFrom };
    setMass(massOff);
    setH1(massOff);
    hero.dataset.anim = 'in';
    if (loopOK) startLoop(vt + LOOP_AT - REST);
  }
  function endIntro() {
    introOn = false;
    settled = true;
    massOff = { x: 0, y: 0 };
    setMass(massOff);
    clearH1();
    hero.dataset.anim = 'on';
    if (loopOn) pauseBtn.hidden = false;
  }

  /* ---- the loop ---------------------------------------------------------- */
  function startLoop(restFrom) {
    loopOn = true;
    canvas.hidden = false;
    hero.dataset.sat = 'fx';
    phase = 'rest';
    phaseT0 = restFrom;
    glyphs = [];
    sat = null;
    dirty = true;
    if (settled) pauseBtn.hidden = false;
  }
  function stopLoop() {
    loopOn = false;
    phase = 'idle';
    glyphs = [];
    sat = null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.hidden = true;
    pauseBtn.hidden = true;
    delete hero.dataset.sat;
  }
  function beginEnter(t) {
    phase = 'enter';
    phaseT0 = t;
    const text = tools[toolIdx % tools.length];
    toolIdx += 1;
    glyphs = layoutGlyphs(text);
    glyphs.forEach((g, i) => {
      g.tin = t + LABEL_AT + i * GLYPH_STAGGER;
    });
    enterDur = Math.max(ENTER, glyphs.length ? LABEL_AT + (glyphs.length - 1) * GLYPH_STAGGER + GLYPH_IN : 0);
    sat = body(entry.x, entry.y);
    pull = { x: 0, y: 0 };
    pullTo = { x: 0, y: 0 };
  }
  function beginHold(t) {
    phase = 'hold';
    phaseT0 = t;
    holdDur = firstHold ? HOLD_FIRST : HOLD;
    firstHold = false;
  }
  function beginCapture(t) {
    phase = 'capture';
    phaseT0 = t;
    physT = t;
    sat.x = home.x + pull.x;
    sat.y = home.y + pull.y;
    sat.t0 = t;
    launch(sat, K);
    glyphs
      .slice()
      .sort((a, b) => Math.hypot(a.hx - home.x, a.hy - home.y) - Math.hypot(b.hx - home.x, b.hy - home.y))
      .forEach((g, k) => {
        g.t0 = t + LETGO + k * LETGO_STAGGER;
      });
  }
  function runPhysics(to) {
    const ms = STEP * 1000;
    let n = 0;
    while (physT + ms <= to) {
      if (++n > 48) {
        physT = to; // fell behind (a long task): drop the time rather than spiral
        break;
      }
      physT += ms;
      if (!sat.gone) step(sat, STEP, sink);
      for (const g of glyphs) {
        if (g.gone || physT < g.t0) continue;
        if (!g.live) launch(g, K);
        step(g, STEP, sink);
      }
    }
    if ((sat.gone && glyphs.every((g) => g.gone)) || to - phaseT0 > 6000) {
      phase = 'rest';
      phaseT0 = Math.min(to, physT);
      glyphs = [];
      sat = null;
    }
  }
  function aimPull() {
    pullTo = { x: 0, y: 0 };
    if (!pointer) return;
    const dx = pointer.x - home.x;
    const dy = pointer.y - home.y;
    const d = Math.hypot(dx, dy);
    if (d < 1 || d > 220) return;
    const w = d <= 60 ? 1 : 1 - (d - 60) / 160;
    const m = Math.min(d, pullMax * w * w * (3 - 2 * w));
    pullTo = { x: (dx / d) * m, y: (dy / d) * m };
  }

  function update(dt) {
    if (introOn) {
      const p = Math.min(1, (vt - introT0) / introDur);
      const e = EASE(p);
      massOff = { x: introFrom.x * (1 - e), y: introFrom.y * (1 - e) };
      setMass(massOff);
      setH1(massOff);
      if (p >= 1) endIntro();
    }
    if (!loopOn) return;
    for (let guard = 0; guard < 4; guard++) {
      if (phase === 'rest' && vt >= phaseT0 + REST) beginEnter(phaseT0 + REST);
      else if (phase === 'enter' && vt >= phaseT0 + enterDur) beginHold(phaseT0 + enterDur);
      else if (phase === 'hold' && vt >= phaseT0 + holdDur) beginCapture(phaseT0 + holdDur);
      else break;
    }
    if (phase === 'hold') {
      aimPull();
      const k = 1 - Math.exp(-dt / 120);
      pull.x += (pullTo.x - pull.x) * k;
      pull.y += (pullTo.y - pull.y) * k;
    }
    if (phase === 'capture') runPhysics(vt);
    dirty = true;
  }

  /* ---- drawing ------------------------------------------------------------
     Two passes over the same shapes: ink, clipped to the field; mint,
     clipped to the mass. That is the whole colour rule. */
  function draw() {
    if (!loopOn || !dirty) return;
    dirty = false;
    ctx.setTransform(dpr, 0, 0, dpr, -box.x * dpr, -box.y * dpr);
    ctx.clearRect(box.x, box.y, box.w, box.h);
    const items = [];
    if (phase === 'enter') {
      const e = EASE(Math.min(1, (vt - phaseT0) / ENTER));
      items.push([entry.x + (home.x - entry.x) * e, entry.y + (home.y - entry.y) * e, 1, null]);
      for (const g of glyphs) {
        if (vt < g.tin) continue;
        const q = 1 - EASE(Math.min(1, (vt - g.tin) / GLYPH_IN));
        items.push([g.hx - g.ux * 10 * q, g.hy - g.uy * 10 * q, 1, g.ch]);
      }
    } else if (phase === 'hold') {
      items.push([home.x + pull.x, home.y + pull.y, 1, null]);
      for (const g of glyphs) items.push([g.hx, g.hy, 1, g.ch]);
    } else if (phase === 'capture') {
      if (!sat.gone) items.push([sat.x, sat.y, sat.s, null]);
      for (const g of glyphs) {
        if (!g.gone) items.push(g.live ? [g.x, g.y, g.s, g.ch] : [g.hx, g.hy, 1, g.ch]);
      }
    }
    if (!items.length) return;
    const cx = C.x + massOff.x;
    const cy = C.y + massOff.y;
    const base = [dpr, 0, 0, dpr, -box.x * dpr, -box.y * dpr];
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (let pass = 0; pass < 2; pass++) {
      ctx.save();
      ctx.beginPath();
      if (pass === 0) {
        ctx.rect(box.x, box.y, box.w, box.h);
        ctx.arc(cx, cy, R, 0, TAU);
        ctx.clip('evenodd');
        ctx.fillStyle = INK;
      } else {
        ctx.arc(cx, cy, R, 0, TAU);
        ctx.clip();
        ctx.fillStyle = MINT;
      }
      for (const [x, y, s, ch] of items) {
        if (s <= 0) continue;
        if (ch === null) {
          ctx.beginPath();
          ctx.arc(x, y, sr * s, 0, TAU);
          ctx.fill();
        } else {
          ctx.setTransform(dpr * s, 0, 0, dpr * s, (x - box.x) * dpr, (y - box.y) * dpr);
          ctx.fillText(ch, 0, capH / 2);
          ctx.setTransform(...base);
        }
      }
      ctx.restore();
    }
  }

  /* ---- layout changes ------------------------------------------------------ */
  function relayout() {
    measure();
    /* Only a real change counts: resizing the canvas clears it, and a
       ResizeObserver report with nothing moved must not wipe a satellite
       that is sitting still between frames. */
    const key = [W, HH, C.x, C.y, R, home.x, home.y, sr, turned, loopOK, labelMode, K, sink]
      .concat(Object.values(box))
      .map((v) => (typeof v === 'number' ? v.toFixed(1) : String(v)))
      .join('|');
    if (key === geomKey) return;
    geomKey = key;
    if (loopOK) sizeCanvas();
    dirty = true;
    if (!started) return;
    if (introOn) introFrom = introStart();
    if (!loopOK) {
      if (loopOn) stopLoop();
      return;
    }
    /* A resize under a running loop starts the cycle over rather than move
       bodies in flight into a different frame; one that makes room for the
       loop starts it. */
    if (loopOn || settled || introOn) startLoop(introOn ? Math.max(vt, introT0 + LOOP_AT - REST) : vt);
  }

  function teardown() {
    if (dead) return;
    dead = true;
    if (raf) cancelAnimationFrame(raf);
    if (timer) clearTimeout(timer);
    io.disconnect();
    ro.disconnect();
    hero.removeAttribute('data-anim');
    delete hero.dataset.sat;
    mass.style.transform = '';
    clearH1();
    canvas.hidden = true;
    pauseBtn.hidden = true;
  }

  function begin(visible) {
    if (dead) return;
    if (!hero.hasAttribute('data-anim')) {
      teardown();
      return;
    }
    relayout();
    started = true;
    if (!visible) {
      /* Loaded scrolled away from the hero: no entrance nobody sees. */
      hero.dataset.anim = 'on';
      settled = true;
      if (loopOK) startLoop(vt);
      kick();
      return;
    }
    /* Don't start the fall under a font swap: wait for the fonts, briefly. */
    let go = false;
    const once = guard(() => {
      if (go) return;
      go = true;
      sync();
      startIntro();
      kick();
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(once, once);
    setTimeout(once, 400);
  }

  /* ---- wiring ---------------------------------------------------------------- */
  /* Any error puts the static composition back, then surfaces. */
  const guard =
    (fn) =>
    (...args) => {
      if (dead) return;
      try {
        fn(...args);
      } catch (e) {
        teardown();
        throw e;
      }
    };
  let seen = false;
  const io = new IntersectionObserver(
    guard(([e]) => {
      sync();
      inView = e.isIntersecting;
      if (!seen) {
        seen = true;
        begin(inView);
        return;
      }
      /* Scrolled away mid-fall (or the browser jumped to a #fragment after
         the first report): land it now, nobody is watching. */
      if (!inView && introOn) endIntro();
      kick();
    }),
  );
  const ro = new ResizeObserver(
    guard(() => {
      sync();
      relayout();
      kick();
    }),
  );
  io.observe(hero);
  ro.observe(hero);
  ro.observe(h1);

  document.addEventListener(
    'visibilitychange',
    guard(() => {
      sync();
      kick();
    }),
  );
  mqReduce.addEventListener('change', () => {
    if (mqReduce.matches) teardown();
  });

  const at = (e) => {
    const r = hero.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  hero.addEventListener(
    'pointermove',
    guard((e) => {
      if (e.pointerType !== 'mouse' || !loopOn) return;
      pointer = at(e);
      if (phase === 'hold') {
        sync();
        aimPull();
        kick();
      }
    }),
    { passive: true },
  );
  hero.addEventListener(
    'pointerleave',
    guard(() => {
      pointer = null;
      if (phase === 'hold') {
        sync();
        aimPull();
        kick();
      }
    }),
  );
  /* Click the satellite and the mass takes it now. */
  hero.addEventListener(
    'pointerdown',
    guard((e) => {
      if (phase !== 'hold' || !loopRuns() || e.target.closest('a, button')) return;
      const p = at(e);
      if (Math.hypot(p.x - (home.x + pull.x), p.y - (home.y + pull.y)) > sr + 12) return;
      sync();
      phaseT0 = vt - holdDur;
      kick();
    }),
  );

  pauseBtn.addEventListener(
    'click',
    guard(() => {
      sync();
      paused = !paused;
      pauseBtn.setAttribute('aria-pressed', String(paused));
      kick();
    }),
  );
}
