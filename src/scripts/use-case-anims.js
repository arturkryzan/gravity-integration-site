/* gravity.integration v2 — the four use-case panels on the home page.
 *
 * They replace v1's four rendered films with the design system's own parts:
 * one cropped mass per frame, mint and ink (plus the system's signal red as
 * a dot, for errors), flat shapes, entries on the fall curve, nothing that
 * bounces. No text is drawn in any of them. Each translates its film and
 * the copy beside it:
 *
 * 01 consolidate — "One tool instead of dozens of scripts". The film: a
 *    cluster of small black spheres beside one green sphere. Here: two dozen
 *    small pieces in three shapes (scripts, CSV files, manual exports)
 *    twitching on their own, a red error dot blinking among them; the mass
 *    falls into Gravity's corner and takes them, nearest first, growing with
 *    each; what is left is the key visual — one mass, one satellite, still.
 * 02 connect — "Connect every system". The film: a central sphere and six
 *    labelled systems lighting up. Here: the bus is a horizon; systems of
 *    every shape and size travel an orbit above it, arrive as outlines
 *    (silos), and as each passes the bus reaches up, it fills, and data
 *    moves system → bus → system.
 * 03 partners — "Partners and suppliers in hours, not months". The film: a
 *    stopwatch. Here: partners' systems come in from outside the frame and
 *    plug into the mass's edge in one move — the half inside turns mint —
 *    and documents (orders, invoices, stock levels: three small shapes)
 *    sweep around inside the mass between them like a stopwatch's hand.
 * 04 control — "Full visibility and control over data flows". The film: a
 *    motorway interchange with light on its lanes. Here: roads merge into
 *    the mass like ramps, traffic on every one; an item turns red and stops
 *    (the error is visible at once), the lane holds, clears, moves; then a
 *    system is switched off and another takes its place while every other
 *    road keeps flowing.
 *
 * The field and the mass are the panel's own CSS (UseCaseAnim.astro), never
 * repainted; `under` paints what is static but lies beneath the mass once
 * per size, and `draw` paints only what moves, on a clear canvas above it.
 * A scene whose mass moves (01) returns it, and the player moves the CSS
 * mass to match with a composited transform.
 *
 * Every scene is a pure function of time: `draw(ctx, t)` paints the frame at
 * t seconds, so the loop never drifts, any moment can be drawn exactly (the
 * reduced-motion still is `poster`), and the harness can seek. A panel runs
 * only while it is on screen, the tab is visible and nobody pressed its stop
 * button; a panel that comes into view starts its story from the beginning.
 * Reduced motion gets the poster and no button. Without this file the panel
 * shows its field and its mass (UseCaseAnim.astro). */
import { FRAME, SCENES as GEOM } from '../lib/use-case-scenes.js';

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const outCubic = (p) => 1 - (1 - clamp01(p)) ** 3;
const inPow = (p, e = 2) => clamp01(p) ** e;
const smooth = (p) => {
  const q = clamp01(p);
  return q * q * (3 - 2 * q);
};
const mod = (a, n) => ((a % n) + n) % n;

/* --ease-fall, cubic-bezier(.55, 0, .1, 1), as a function of time. */
const FALL = (() => {
  const [x1, y1, x2, y2] = [0.55, 0, 0.1, 1];
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 30; i++) {
      const v = ((ax * t + bx) * t + cx) * t;
      if (Math.abs(v - x) < 1e-5) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return ((ay * t + by) * t + cy) * t;
  };
})();

/* Seeded randomness: the same frame every time, in every browser. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(a, b = 0, c = 0) {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35);
  x ^= Math.imul((c + 0x27d4eb2f) | 0, 0x165667b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  x = Math.imul(x, 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

/* ---- drawing ------------------------------------------------------------- */
/* A shape added to the current path: a dot, a rounded square or a pill. */
function shape(ctx, kind, x, y, a, b, rot, s = 1) {
  if (s <= 0.001) return;
  if (kind === 'dot') {
    ctx.moveTo(x + a * s, y);
    ctx.arc(x, y, a * s, 0, TAU);
    return;
  }
  const hw = a * s;
  const hh = b * s;
  const r = kind === 'pill' ? Math.min(hw, hh) : Math.min(hw, hh) * 0.32;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.moveTo(-hw + r, -hh);
  ctx.arcTo(hw, -hh, hw, hh, r);
  ctx.arcTo(hw, hh, -hw, hh, r);
  ctx.arcTo(-hw, hh, -hw, -hh, r);
  ctx.arcTo(-hw, -hh, hw, -hh, r);
  ctx.closePath();
  ctx.restore();
}
function fillDisc(ctx, x, y, r, color) {
  if (r <= 0) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}
/* The colour rule, as a clip: what `paint` draws inside the mass, or on the
   field around it. */
function onMass(ctx, m, paint) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(m.x, m.y, m.r, 0, TAU);
  ctx.clip();
  paint();
  ctx.restore();
}
function onField(ctx, m, paint) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(-200, -200, FRAME.w + 400, FRAME.h + 400);
  ctx.arc(m.x, m.y, m.r, 0, TAU);
  ctx.clip('evenodd');
  paint();
  ctx.restore();
}
/* A pill looks the same turned half a turn: the shortest way to line it up. */
const alignDelta = (from, to) => mod(to - from + Math.PI / 2, Math.PI) - Math.PI / 2;

/* =============================================================================
   01 · consolidate
   ========================================================================== */
const C1 = {
  PERIOD: 10.4,
  MASS_AT: 2.7, // the mass falls in (lands at +0.62)
  FALL_AT: 3.4, // the first piece lets go; one every 70ms after it
  SAT_AT: 5.5, // the satellite comes in once the last piece has
  EXIT_AT: 8.9, // the mass sinks out through its corner…
  SAT_OUT_AT: 9.05, // …and the satellite falls after it
};

function hop(id, k) {
  if (k < 0) return { x: 0, y: 0, r: 0 };
  return { x: (hash(id, k, 1) - 0.5) * 22, y: (hash(id, k, 2) - 0.5) * 22, r: (hash(id, k, 3) - 0.5) * 0.28 };
}
/* Restless: every piece hops somewhere near its place on its own beat. */
function jitter(p, t) {
  const e = t - p.tp;
  if (e <= 0) return { x: 0, y: 0, r: 0 };
  const k = Math.floor(e / p.jt);
  const q = outCubic((e - k * p.jt) / 0.12);
  const a = hop(p.id, k - 1);
  const b = hop(p.id, k);
  return { x: lerp(a.x, b.x, q), y: lerp(a.y, b.y, q), r: lerp(a.r, b.r, q) };
}

const consolidate = {
  start: 0,
  poster: 3.35, // the mass has landed, nothing has let go: many beside one
  setup(g) {
    const R = rng(11);
    const C = { x: g.mass.x, y: g.mass.y };
    const R1 = g.mass.r;
    const R0 = R1 * 0.6;
    const S = { x: g.sat.x, y: g.sat.y };
    const pieces = [];
    for (let guard = 0; pieces.length < 22 && guard < 8000; guard++) {
      const x = 90 + R() * 940;
      const y = 80 + R() * 650;
      if (Math.hypot(x - C.x, y - C.y) < R1 + 90) continue;
      if (Math.hypot(x - S.x, y - S.y) < 150) continue;
      if (pieces.some((p) => Math.hypot(p.x - x, p.y - y) < 116)) continue;
      const u = R();
      const kind = u < 0.45 ? 'dot' : u < 0.75 ? 'square' : 'pill';
      const a = kind === 'dot' ? 16 + R() * 16 : kind === 'square' ? 17 + R() * 10 : 34 + R() * 18;
      const b = kind === 'pill' ? 13 + R() * 4 : a;
      const rot = kind === 'dot' ? 0 : (R() - 0.5) * (kind === 'pill' ? 1.4 : 0.8);
      pieces.push({ id: pieces.length, x, y, kind, a, b, rot, jt: 0.26 + R() * 0.34 });
    }
    /* They appear in no particular order… */
    const order = pieces.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((pi, k) => {
      pieces[pi].tp = 0.12 + k * 0.045;
    });
    /* …and fall in the order gravity would take them: nearest first. */
    const N = pieces.length;
    pieces
      .slice()
      .sort((p, q) => Math.hypot(p.x - 1440, p.y - 804) - Math.hypot(q.x - 1440, q.y - 804))
      .forEach((p, j) => {
        p.tf = C1.FALL_AT + j * 0.07;
        const o = jitter(p, p.tf);
        p.fx = p.x + o.x;
        p.fy = p.y + o.y;
        p.frot = p.rot + o.r;
        p.d0 = Math.hypot(C.x - p.fx, C.y - p.fy);
        p.travel = p.d0 - (R0 - 50);
        p.D = 0.44 + 0.3 * Math.min(1, (p.d0 - R0) / 700);
        p.dir = Math.atan2(C.y - p.fy, C.x - p.fx);
        /* when its near edge meets the rim (the mass grows as it takes them) */
        const rim = R0 + ((R1 - R0) * j) / N;
        p.ta = p.tf + p.D * Math.pow(clamp01((p.d0 - rim - p.a) / p.travel), 1 / 2.2);
      });
    /* Where a satellite enters: along the line from the core through its
       place, from wherever that line leaves the frame. */
    const d = Math.hypot(S.x - C.x, S.y - C.y);
    const su = { x: (S.x - C.x) / d, y: (S.y - C.y) / d };
    const sL = Math.min((S.y + g.sat.r + 4) / -su.y, (S.x + g.sat.r + 4) / -su.x);
    const errs = [
      [pieces.find((p) => p.kind === 'square'), [[1.3, 2.05], [2.4, 2.95]]],
      [pieces.find((p) => p.kind === 'pill'), [[1.75, 2.6]]],
    ].filter(([p]) => p);
    return { C, R0, R1, S, SR: g.sat.r, su, sL, pieces, N, errs };
  },
  draw(ctx, time, d, P) {
    const t = mod(time, C1.PERIOD);

    /* the mass (the panel's own element, moved by the player): falls in,
       grows with each piece, sinks out */
    let mx = d.C.x;
    let my = d.C.y;
    let mr = 0;
    if (t >= C1.MASS_AT) {
      const e = FALL((t - C1.MASS_AT) / 0.62);
      mx += 560 * (1 - e);
      my += 420 * (1 - e);
      let grown = 0;
      for (const p of d.pieces) grown += outCubic((t - p.ta) / 0.32);
      mr = d.R0 + ((d.R1 - d.R0) * grown) / d.N;
      if (t >= C1.EXIT_AT) {
        const q = inPow((t - C1.EXIT_AT) / 0.85, 2);
        mx += 800 * q;
        my += 600 * q;
      }
    }

    /* the pieces */
    ctx.fillStyle = P.ink;
    ctx.beginPath();
    const at = new Map();
    for (const p of d.pieces) {
      if (t < p.tp) continue;
      const s = outCubic((t - p.tp) / 0.26);
      let x;
      let y;
      let rot;
      if (t < p.tf) {
        const o = jitter(p, t);
        x = p.x + o.x;
        y = p.y + o.y;
        rot = p.rot + o.r;
      } else {
        const u = (t - p.tf) / p.D;
        if (u >= 1) continue;
        const f = (inPow(u, 2.2) * p.travel) / p.d0;
        x = p.fx + (d.C.x - p.fx) * f;
        y = p.fy + (d.C.y - p.fy) * f;
        rot =
          p.kind === 'pill'
            ? p.frot + alignDelta(p.frot, p.dir) * outCubic(u * 1.6)
            : p.frot + 0.5 * outCubic(u);
      }
      shape(ctx, p.kind, x, y, p.a, p.b, rot, s);
      at.set(p, { x, y, rot });
    }
    ctx.fill();

    /* errors: a red dot on a piece, now and then, until it is taken */
    for (const [p, spans] of d.errs) {
      const q = at.get(p);
      if (!q || t >= p.tf || !spans.some(([a, b]) => t >= a && t < b)) continue;
      const ox = p.a * 0.95 + 12;
      const oy = -(p.b * 0.95 + 12);
      const c = Math.cos(q.rot);
      const sn = Math.sin(q.rot);
      fillDisc(ctx, q.x + ox * c - oy * sn, q.y + ox * sn + oy * c, 12, P.red);
    }

    /* the satellite: in from the edge, still, then after the mass */
    if (t >= C1.SAT_AT && t < C1.SAT_OUT_AT + 0.75) {
      let sx;
      let sy;
      if (t < C1.SAT_OUT_AT) {
        const e = 1 - FALL((t - C1.SAT_AT) / 0.55);
        sx = d.S.x + d.su.x * d.sL * e;
        sy = d.S.y + d.su.y * d.sL * e;
      } else {
        const q = inPow((t - C1.SAT_OUT_AT) / 0.7, 2.2);
        sx = lerp(d.S.x, mx, q);
        sy = lerp(d.S.y, my, q);
      }
      fillDisc(ctx, sx, sy, d.SR, P.ink);
    }
    return { mass: { x: mx, y: my, r: mr } };
  },
};

/* =============================================================================
   02 · connect
   ========================================================================== */
const connect = {
  start: 8.0, // a few systems already connected when it first comes into view
  poster: 11.4,
  setup(g) {
    const C = { x: g.mass.x, y: g.mass.y };
    const R = g.mass.r;
    const RO = R + 215; // the orbit
    const KINDS = [
      { kind: 'dot', a: 46, b: 46 },
      { kind: 'square', a: 31, b: 31 },
      { kind: 'pill', a: 55, b: 22 },
      { kind: 'dot', a: 30, b: 30 },
      { kind: 'square', a: 38, b: 38 },
      { kind: 'dot', a: 23, b: 23 },
      { kind: 'pill', a: 42, b: 19 },
    ];
    const W = 0.092; // rad/s
    const GAP = 0.265; // rad between two systems
    const thL = -Math.asin(Math.min(1, (C.x + 70) / RO));
    return { C, R, RO, KINDS, W, GAP, thL, thR: -thL, thC: thL + 0.36, th0: thL - 0.05, PM: 0.55 };
  },
  draw(ctx, t, d, P, detail) {
    const { C, R, RO, W, GAP } = d;
    const mass = { x: C.x, y: C.y, r: R };

    const theta = (n, at) => d.th0 + W * at - n * GAP;
    const tConn = (n) => (d.thC - d.th0 + n * GAP) / W;
    const kind = (n) => d.KINDS[mod(n, d.KINDS.length)];
    const ext = (k) => (k.kind === 'pill' ? k.b : k.kind === 'square' ? k.a * 1.08 : k.a);
    const pos = (th, r) => ({ x: C.x + r * Math.sin(th), y: C.y - r * Math.cos(th) });
    const nLo = (at, pad) => Math.ceil((d.th0 + W * at - d.thR - pad) / GAP);
    const nHi = (at, pad) => Math.floor((d.th0 + W * at - d.thL + pad) / GAP);

    /* spokes, and the messages on them, stop at the bus's edge (the mass is
       under this canvas) */
    ctx.save();
    ctx.beginPath();
    ctx.rect(-200, -200, FRAME.w + 400, FRAME.h + 400);
    ctx.arc(mass.x, mass.y, mass.r, 0, TAU);
    ctx.clip('evenodd');

    /* spokes: the bus reaching up to every connected system */
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 4 * detail;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let n = nLo(t, 0.2); n <= nHi(t, 0.2); n++) {
      const reach = outCubic((t - tConn(n)) / 0.3);
      if (reach <= 0) continue;
      const th = theta(n, t);
      const a = pos(th, R - 10);
      const b = pos(th, lerp(R - 10, RO - ext(kind(n)), reach));
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    /* messages: down one spoke, through the bus, up another */
    ctx.fillStyle = P.ink;
    ctx.beginPath();
    const dotR = 11 * detail;
    for (let m = Math.floor((t - 1.35) / d.PM); m <= Math.floor(t / d.PM); m++) {
      const tm = m * d.PM;
      const tau = t - tm;
      if (tau < 0 || tau > 1.3) continue;
      const cands = [];
      for (let n = nLo(tm, 0); n <= nHi(tm, 0); n++) {
        if (tConn(n) + 0.55 > tm) continue;
        if (theta(n, tm) > d.thR - 0.12 || theta(n, tm + 1.3) > d.thR + 0.04) continue;
        cands.push(n);
      }
      if (cands.length < 2) continue;
      const src = cands[Math.floor(hash(m, 1) * cands.length)];
      const rest = cands.filter((n) => n !== src);
      const dst = rest[Math.floor(hash(m, 2) * rest.length)];
      let p;
      if (tau < 0.62) {
        const th = theta(src, t);
        const top = RO - ext(kind(src));
        p = pos(th, lerp(top, R - 30, inPow(tau / 0.62, 2)));
      } else if (tau >= 0.7) {
        const th = theta(dst, t);
        const top = RO - ext(kind(dst));
        const q = (tau - 0.7) / 0.6;
        if (q >= 1) continue;
        p = pos(th, lerp(R - 30, top, outCubic(q)));
      } else continue;
      ctx.moveTo(p.x + dotR, p.y);
      ctx.arc(p.x, p.y, dotR, 0, TAU);
    }
    ctx.fill();
    ctx.restore();

    /* the systems: an outline, a silo, until the bus reaches them; then
       they take the bus's colour */
    ctx.lineWidth = 4.5 * detail;
    ctx.lineJoin = 'round';
    ctx.fillStyle = P.mint;
    for (let n = nLo(t, 0.2); n <= nHi(t, 0.2); n++) {
      const k = kind(n);
      const th = theta(n, t);
      const c = pos(th, RO);
      ctx.beginPath();
      shape(ctx, k.kind, c.x, c.y, k.a, k.b, th);
      ctx.stroke();
      const fill = outCubic((t - tConn(n) - 0.2) / 0.26);
      if (fill > 0) {
        ctx.beginPath();
        shape(ctx, k.kind, c.x, c.y, k.a, k.b, th, fill);
        ctx.fill();
      }
    }
  },
};

/* =============================================================================
   03 · partners
   ========================================================================== */
const P3 = { PERIOD: 9.0, DOCK: 0.55, SINK: 0.5 };
const DOC_KINDS = [
  { kind: 'dot', a: 14, b: 14 },
  { kind: 'square', a: 12, b: 12 },
  { kind: 'pill', a: 21, b: 8 },
];
const partners = {
  start: 0,
  poster: 4.2,
  setup(g) {
    const C = { x: g.mass.x, y: g.mass.y };
    const R = g.mass.r;
    const PR = 46;
    const RIN = R - 118;
    const ps = [-153, -139, -125, -111, -99].map((deg, k) => {
      const a = (deg * Math.PI) / 180;
      const u = { x: Math.cos(a), y: Math.sin(a) };
      const at = { x: C.x + R * u.x, y: C.y + R * u.y };
      let L = Infinity;
      if (u.y < 0) L = Math.min(L, (at.y + PR + 4) / -u.y);
      if (u.x < 0) L = Math.min(L, (at.x + PR + 4) / -u.x);
      return { a, u, at, L, td: 0.25 + k * 0.32, ts: 7.3 + k * 0.1 };
    });
    const n = ps.length;
    const docs = [];
    for (let m = 0; ; m++) {
      const tm = 1.0 + m * 0.15;
      if (tm > 7.0) break;
      const src = Math.floor(hash(m, 1) * n);
      const dst = (src + 1 + Math.floor(hash(m, 2) * (n - 1))) % n;
      const k = DOC_KINDS[Math.floor(hash(m, 3) * DOC_KINDS.length)];
      const sweep = Math.max(0.2, Math.abs(ps[dst].a - ps[src].a) / 2.0);
      docs.push({ tm, src, dst, k, sweep });
    }
    return { C, R, RIN, PR, ps, docs };
  },
  draw(ctx, time, d, P) {
    const t = mod(time, P3.PERIOD);
    const { C, R, RIN } = d;
    const mass = { x: C.x, y: C.y, r: R };

    const docked = (p, at) => at >= p.td + P3.DOCK && at < p.ts;

    /* documents: dive in at one partner, sweep round inside, rise at another */
    ctx.fillStyle = P.mint;
    ctx.beginPath();
    for (const doc of d.docs) {
      const tau = t - doc.tm;
      const total = 0.26 + doc.sweep;
      if (tau < 0 || tau > total) continue;
      const s = d.ps[doc.src];
      const e = d.ps[doc.dst];
      if (!docked(s, doc.tm) || !docked(e, doc.tm) || !docked(e, doc.tm + total)) continue;
      let ang;
      let r;
      if (tau < 0.13) {
        ang = s.a;
        r = lerp(R, RIN, outCubic(tau / 0.13));
      } else if (tau < 0.13 + doc.sweep) {
        ang = lerp(s.a, e.a, smooth((tau - 0.13) / doc.sweep));
        r = RIN;
      } else {
        ang = e.a;
        r = lerp(RIN, R, inPow((tau - 0.13 - doc.sweep) / 0.13, 1.5));
      }
      shape(ctx, doc.k.kind, C.x + r * Math.cos(ang), C.y + r * Math.sin(ang), doc.k.a, doc.k.b, ang + Math.PI / 2);
    }
    ctx.fill();

    /* partners: in from outside, plugged into the edge, then taken in */
    const discs = [];
    for (const p of d.ps) {
      if (t < p.td || t >= p.ts + P3.SINK) continue;
      let x = p.at.x;
      let y = p.at.y;
      let r = d.PR;
      if (t < p.td + P3.DOCK) {
        const e = 1 - FALL((t - p.td) / P3.DOCK);
        x += p.u.x * p.L * e;
        y += p.u.y * p.L * e;
      } else if (t >= p.ts) {
        const q = inPow((t - p.ts) / P3.SINK, 2);
        x -= p.u.x * 2.4 * d.PR * q;
        y -= p.u.y * 2.4 * d.PR * q;
        r *= 1 - 0.85 * q;
      }
      discs.push([x, y, r]);
    }
    const paint = (color) => () => {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const [x, y, r] of discs) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
      ctx.fill();
    };
    onField(ctx, mass, paint(P.ink));
    onMass(ctx, mass, paint(P.mint));
  },
};

/* =============================================================================
   04 · control
   ========================================================================== */
const P4 = {
  CYCLE: 10,
  ERR_LANE: 1,
  ERR_AT: 3.1, // an item turns red and stops…
  ERR_CLEAR: 4.85, // …turns back…
  ERR_GO: 5.0, // …and the lane moves again
  SWAP_LANE: 3,
  OFF_AT: 6.2, // a system is switched off…
  QUIET: [6.0, 7.7], // (nothing new leaves it meanwhile)
  ON_AT: 7.2, // …and another takes its place
  GAPQ: 34, // how close queued items stand
};

function bezierLane(p0, p1, p2, p3, n = 160) {
  const pts = [];
  const len = [0];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const m = 1 - t;
    const x = m * m * m * p0.x + 3 * m * m * t * p1.x + 3 * m * t * t * p2.x + t * t * t * p3.x;
    const y = m * m * m * p0.y + 3 * m * m * t * p1.y + 3 * m * t * t * p2.y + t * t * t * p3.y;
    if (i) len.push(len[i - 1] + Math.hypot(x - pts[i - 1].x, y - pts[i - 1].y));
    pts.push({ x, y });
  }
  return { pts, len, L: len[n] };
}

const control = {
  start: 0,
  poster: 4.4, // the error on screen, the queue behind it, traffic elsewhere
  setup(g) {
    const C = { x: g.mass.x, y: g.mass.y };
    const R = g.mass.r;
    const lanes = [
      { beta: 29, node: { x: 1320, y: 196 }, c1: { x: -300, y: -30 }, v: 300, p: 0.625 },
      { beta: 39, node: { x: 1250, y: 430 }, c1: { x: -330, y: -60 }, v: 260, p: 0.5 },
      { beta: 49, node: { x: 1090, y: 640 }, c1: { x: -260, y: -120 }, v: 320, p: 0.8333333 },
      { beta: 58, node: { x: 800, y: 712 }, c1: { x: -150, y: -170 }, v: 280, p: 1.0 },
      { beta: 67, node: { x: 480, y: 728 }, c1: { x: -60, y: -190 }, v: 250, p: 0.9090909 },
    ].map((l) => {
      const b = (l.beta * Math.PI) / 180;
      const u = { x: Math.cos(b), y: Math.sin(b) };
      const E = { x: C.x + R * u.x, y: C.y + R * u.y };
      const lane = bezierLane(
        l.node,
        { x: l.node.x + l.c1.x, y: l.node.y + l.c1.y },
        { x: E.x + u.x * 260, y: E.y + u.y * 260 },
        E,
      );
      return { ...l, u, E, ...lane };
    });
    return { C, R, lanes };
  },
  /* the roads, painted once: ink-700 on ink, the system's depth from colour */
  under(ctx, d, P) {
    ctx.strokeStyle = P.ink7;
    ctx.lineWidth = 30;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const lane of d.lanes) {
      ctx.moveTo(lane.pts[0].x, lane.pts[0].y);
      for (let i = 1; i < lane.pts.length; i++) ctx.lineTo(lane.pts[i].x, lane.pts[i].y);
    }
    ctx.stroke();
  },
  draw(ctx, time, d, P, detail) {
    const { lanes } = d;

    const at = (lane, s) => {
      if (s >= lane.L) return { x: lane.E.x - lane.u.x * (s - lane.L), y: lane.E.y - lane.u.y * (s - lane.L) };
      let lo = 0;
      let hi = lane.len.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (lane.len[mid] < s) lo = mid;
        else hi = mid;
      }
      const f = (s - lane.len[lo]) / (lane.len[hi] - lane.len[lo] || 1);
      return { x: lerp(lane.pts[lo].x, lane.pts[hi].x, f), y: lerp(lane.pts[lo].y, lane.pts[hi].y, f) };
    };

    /* traffic (whatever reaches the mass goes under it: same colour) */
    const cyc = Math.floor(time / P4.CYCLE);
    const tl = time - cyc * P4.CYCLE;
    const tokR = 12 * detail;
    const mint = [];
    let red = null;
    lanes.forEach((lane, li) => {
      const jHi = Math.floor(time / lane.p);
      const jLo = Math.floor((time - (lane.L + 80) / lane.v - 3) / lane.p);
      const free = (j) => lane.v * (time - j * lane.p);
      const quiet = (j) => {
        if (li !== P4.SWAP_LANE) return false;
        const e = j * lane.p - cyc * P4.CYCLE;
        return e >= P4.QUIET[0] && e < P4.QUIET[1];
      };
      /* the jam: the red item holds, those behind it close up */
      let jRed = null;
      let sRed = 0;
      if (li === P4.ERR_LANE && tl >= P4.ERR_AT) {
        const tE = cyc * P4.CYCLE + P4.ERR_AT;
        const tGo = cyc * P4.CYCLE + P4.ERR_GO;
        jRed = Math.round((tE - (0.45 * lane.L) / lane.v) / lane.p);
        const sFreeze = lane.v * (tE - jRed * lane.p);
        sRed = time <= tGo ? sFreeze : sFreeze + lane.v * (time - tGo);
      }
      let prev = null;
      for (let j = jLo; j <= jHi; j++) {
        if (quiet(j)) continue;
        let s = free(j);
        if (jRed !== null) {
          if (j === jRed) s = sRed;
          else if (j > jRed && prev !== null) s = Math.min(s, prev - P4.GAPQ);
        }
        prev = s;
        if (s < 0 || s > lane.L + 60) continue;
        const q = at(lane, s);
        if (j === jRed && tl < P4.ERR_CLEAR) red = q;
        else mint.push(q);
      }
    });
    ctx.fillStyle = P.mint;
    ctx.beginPath();
    for (const q of mint) {
      ctx.moveTo(q.x + tokR, q.y);
      ctx.arc(q.x, q.y, tokR, 0, TAU);
    }
    ctx.fill();
    if (red) fillDisc(ctx, red.x, red.y, 15 * detail, P.red);

    /* the systems at the start of each road */
    ctx.fillStyle = P.onInk;
    ctx.beginPath();
    lanes.forEach((lane, li) => {
      const { x, y } = lane.node;
      if (li !== P4.SWAP_LANE) {
        shape(ctx, 'dot', x, y, 21, 21, 0);
        return;
      }
      /* switched off, then replaced by another kind of system */
      const before = cyc % 2 === 0 ? 'dot' : 'square';
      const after = before === 'dot' ? 'square' : 'dot';
      const size = (k) => (k === 'dot' ? 21 : 19);
      if (tl < P4.OFF_AT) shape(ctx, before, x, y, size(before), size(before), 0);
      else if (tl < P4.OFF_AT + 0.28) {
        shape(ctx, before, x, y, size(before), size(before), 0, 1 - inPow((tl - P4.OFF_AT) / 0.28, 2));
      } else if (tl >= P4.ON_AT) {
        const e = 1 - FALL((tl - P4.ON_AT) / 0.45);
        shape(ctx, after, x, y + (FRAME.h + 30 - y) * e, size(after), size(after), 0);
      }
    });
    ctx.fill();
  },
};

const IMPL = { consolidate, connect, partners, control };

/* ---- the players --------------------------------------------------------- */
function player(el, P, mqReduce) {
  const impl = IMPL[el.dataset.scene];
  const geo = GEOM[el.dataset.scene];
  const canvas = el.querySelector('.uc-over');
  const underCanvas = el.querySelector('.uc-under');
  const massEl = el.querySelector('.uc-mass');
  const btn = el.querySelector('.uc-pause');
  const ctx = canvas && canvas.getContext('2d');
  const uctx = underCanvas && underCanvas.getContext('2d');
  if (!impl || !geo || !ctx || !uctx || !massEl || !btn) return null;
  const data = impl.setup(geo);
  let t = impl.start;
  let last = -1;
  let raf = 0;
  let inView = false;
  let paused = false;
  let reduce = mqReduce.matches;
  let dead = false;
  let w = 0;
  let h = 0;
  let dpr = 1;
  const running = () => !dead && inView && !paused && !reduce && !document.hidden;

  function fail(e) {
    dead = true;
    if (raf) cancelAnimationFrame(raf);
    delete el.dataset.live;
    canvas.hidden = true;
    underCanvas.hidden = true;
    btn.hidden = true;
    massEl.style.transform = '';
    massEl.style.visibility = '';
    throw e;
  }
  /* small panels (phones) draw the fine parts a little heavier */
  const detail = () => Math.min(1.35, Math.max(1, Math.pow(650 / w, 0.4)));
  /* the CSS mass follows a scene whose mass moves */
  function place(m) {
    if (!m) return;
    if (m.r <= 0) {
      massEl.style.visibility = 'hidden';
      return;
    }
    const k = w / FRAME.w;
    massEl.style.visibility = '';
    massEl.style.transform = `translate3d(${((m.x - geo.mass.x) * k).toFixed(2)}px, ${((m.y - geo.mass.y) * k).toFixed(2)}px, 0) scale(${(m.r / geo.mass.r).toFixed(4)})`;
  }
  function paint() {
    if (!w || dead) return;
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform((w * dpr) / FRAME.w, 0, 0, (h * dpr) / FRAME.h, 0, 0);
      const out = impl.draw(ctx, reduce ? impl.poster : t, data, P, detail());
      place(out && out.mass);
    } catch (e) {
      fail(e);
    }
  }
  function resize() {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = cw;
    h = ch;
    for (const c of [canvas, underCanvas]) {
      c.width = Math.round(cw * dpr);
      c.height = Math.round(ch * dpr);
    }
    if (impl.under) {
      try {
        uctx.setTransform((w * dpr) / FRAME.w, 0, 0, (h * dpr) / FRAME.h, 0, 0);
        impl.under(uctx, data, P, detail());
      } catch (e) {
        fail(e);
      }
    }
    paint();
  }
  function frame(now) {
    raf = 0;
    if (last >= 0) t += Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    paint();
    kick();
  }
  function kick() {
    if (running()) {
      if (!raf) raf = requestAnimationFrame(frame);
    } else {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = -1;
    }
  }
  btn.addEventListener('click', () => {
    paused = !paused;
    btn.setAttribute('aria-pressed', String(paused));
    kick();
  });

  el.dataset.live = '';
  btn.hidden = reduce;
  resize();
  return {
    el,
    resize,
    kick,
    setInView(v) {
      /* coming into view starts the story over, unless it was stopped */
      if (v && !inView && !paused) t = impl.start;
      inView = v;
      kick();
    },
    setReduce(r) {
      reduce = r;
      btn.hidden = r;
      paint();
      kick();
    },
  };
}

function boot(els) {
  const css = getComputedStyle(document.documentElement);
  const col = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const P = {
    mint: col('--mint-500', '#01ec90'),
    ink: col('--ink-900', '#1e1f33'),
    ink7: col('--ink-700', '#2e3048'),
    mist: col('--mist-100', '#eef0f4'),
    white: col('--white', '#ffffff'),
    onInk: col('--on-ink', '#f4f5f8'),
    red: col('--red-500', '#e5484d'),
  };
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const players = els.map((el) => player(el, P, mqReduce)).filter(Boolean);
  const byEl = new Map(players.map((p) => [p.el, p]));
  const io = new IntersectionObserver((es) => es.forEach((e) => byEl.get(e.target)?.setInView(e.isIntersecting)));
  const ro = new ResizeObserver((es) => es.forEach((e) => byEl.get(e.target)?.resize()));
  for (const p of players) {
    io.observe(p.el);
    ro.observe(p.el);
  }
  document.addEventListener('visibilitychange', () => players.forEach((p) => p.kick()));
  mqReduce.addEventListener('change', () => players.forEach((p) => p.setReduce(mqReduce.matches)));
}

const els = [...document.querySelectorAll('.uc[data-scene]')];
if (els.length && 'IntersectionObserver' in window && 'ResizeObserver' in window) boot(els);
