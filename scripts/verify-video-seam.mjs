/* The use-case videos on the home page sit in a rounded 55.82% box on
 * section.bg-light. They are meant to have no visible frame: the video's own
 * edge has to decode to the page background, rgb(243,244,251), or the box and
 * its 8px radius show as a faint rectangle. The old use_02 missed by up to 4
 * levels (edge ≈ rgb(239,241,247)); this harness is what keeps the new one
 * honest.
 *
 * For the target video it seeks to several moments of the loop, screenshots
 * the slot with a margin of page around it, and measures a ring 3 device px
 * inside the video's edge against the page background just outside it. It
 * also re-checks the slot geometry the encode was sized for.
 *
 * Note: Playwright's Chromium has no H.264, so this exercises the WebM (VP9)
 * source — the first <source>, i.e. what Chrome, Edge and Firefox play. The
 * MP4 fallback's edge is checked at encode time by decoding it with ffmpeg.
 *
 *   CHROME=... ORIGIN=http://127.0.0.1:8412 node scripts/verify-video-seam.mjs
 */
import { chromium } from 'playwright';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8412';
const VIDEO = process.env.VIDEO || 'connect-systems';
const BG = [243, 244, 251];
const TOL = Number(process.env.TOL ?? 1);
const TIMES = [1, 2, 3, 4, 5, 'restart'];    // ~1.15 s apart while playing, then the wrap
const DEBUG = !!process.env.DEBUG;
const log = (...a) => DEBUG && console.log('   ·', ...a);

let pass = 0;
const fails = [];
const ok = (m) => { pass++; console.log('  ok  ', m); };
const bad = (m) => { fails.push(m); console.log('  FAIL', m); };

const browser = await chromium.launch({ executablePath: process.env.CHROME });

for (const path of ['/', '/en/']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  log('goto', path);
  await page.goto(ORIGIN + path, { waitUntil: 'networkidle' });
  log('loaded');
  const sel = `section video:has(source[src="/video/${VIDEO}.webm"])`;
  const v = page.locator(sel);
  if ((await v.count()) !== 1) { bad(`[${path}] ${VIDEO} video not found exactly once`); await ctx.close(); continue; }
  await v.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);

  // wait for the IntersectionObserver to load + start it
  await page.waitForFunction((s) => {
    const el = document.querySelector(s);
    return el && el.readyState >= 3 && el.currentTime > 0.2;
  }, sel, { timeout: 20000 }).then(() => ok(`[${path}] ${VIDEO} loads and plays`),
    () => bad(`[${path}] ${VIDEO} never started playing`));

  const info = await page.evaluate((s) => {
    const el = document.querySelector(s);
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, loop: el.loop, src: el.currentSrc, vw: el.videoWidth, vh: el.videoHeight,
             radius: getComputedStyle(el).borderRadius, dur: el.duration };
  }, sel);
  console.log(`        slot ${info.w.toFixed(1)}x${info.h.toFixed(1)} css, intrinsic ${info.vw}x${info.vh}, ${info.dur.toFixed(2)}s, src ${info.src.replace(ORIGIN, '')}`);
  if (info.loop) ok(`[${path}] loop attribute set`); else bad(`[${path}] not looping`);
  if (Math.abs(info.vw / info.vh - info.w / info.h) < 0.004) ok(`[${path}] intrinsic aspect matches the slot (no cover crop)`);
  else bad(`[${path}] aspect ${(info.vw / info.vh).toFixed(4)} vs slot ${(info.w / info.h).toFixed(4)}`);
  if (info.vw >= info.w * 2 * 0.98) ok(`[${path}] ${info.vw}px covers the 2x slot (${Math.round(info.w * 2)} device px)`);
  else bad(`[${path}] ${info.vw}px under-resolves the 2x slot (${Math.round(info.w * 2)} device px)`);

  /* Sample while it plays. Pausing and seeking looked cleaner and was wrong:
     headless Chromium does not repaint a paused <video> after a seek, so five
     "different" moments were one photographed frame. The checksum below is
     what caught it, and stays as the guard. */
  const frameSums = new Set();
  for (const t of TIMES) {
    if (t === 'restart') {
      /* the first frame after the loop wraps: Chromium composites it through a
         different path, and it was the one moment the timed samples missed */
      await page.waitForFunction((s) => document.querySelector(s).currentTime < 0.06, sel,
                                 { timeout: 9000, polling: 5 });
    } else {
      await page.waitForTimeout(1150);
    }
    const ct = await page.evaluate((s) => document.querySelector(s).currentTime, sel);
    log('sample at currentTime', ct.toFixed(2));
    const box = await v.boundingBox();
    const m = 12;
    const shot = await page.screenshot({ clip: { x: box.x - m, y: box.y - m, width: box.width + 2 * m, height: box.height + 2 * m } });
    log('shot', shot.length);
    // Measure inside the page and return numbers, not pixels: shipping a
    // 1377x790 RGBA array to Node took ~25 s per sample.
    const r = await page.evaluate(async ([b64, M, BG]) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      const W = img.width, H = img.height;
      const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
      const inset = M + 3;
      let worst = 0, where = null;
      const probe = (x, y) => {
        const px = at(x, y);
        const dd = Math.max(...px.map((ch, k) => Math.abs(ch - BG[k])));
        if (dd > worst) { worst = dd; where = px; }
      };
      for (let x = inset + 20; x < W - inset - 20; x += 2) { probe(x, inset); probe(x, H - inset - 1); }
      for (let y = inset + 20; y < H - inset - 20; y += 2) { probe(inset, y); probe(W - inset - 1, y); }
      // a checksum of the picture's centre, to prove each seek shows a new frame
      let sum = 0;
      for (let y = Math.floor(H * 0.3); y < H * 0.7; y += 3)
        for (let x = Math.floor(W * 0.3); x < W * 0.7; x += 3) { const i = (y * W + x) * 4; sum = (sum * 31 + d[i] + 7 * d[i + 1] + 13 * d[i + 2]) % 1000000007; }
      return { worst, where, outside: at(4, 4), sum };
    }, [shot.toString('base64'), m * 2, BG]);
    const worst = r.worst, where = r.where ? [0, 0, r.where] : null;
    frameSums.add(r.sum);
    log('centre checksum', r.sum);
    const outside = r.outside;
    const outOk = outside.every((ch, k) => ch === BG[k]);
    const msg = `[${path}] sample ${t} @${ct.toFixed(2)}s edge ring max|Δ| vs bg = ${worst}` + (where ? ` (e.g. rgb(${where[2]}))` : '');
    if (worst <= TOL && outOk) ok(msg); else bad(msg + (outOk ? '' : ` — page outside reads rgb(${outside})`));
  }
  // guards against a frozen capture (a paused-and-seeked <video> repaints nothing);
  // two samples may legitimately share a frame, so allow one repeat
  if (frameSums.size >= TIMES.length - 1) ok(`[${path}] samples are live frames (${frameSums.size} distinct of ${TIMES.length})`);
  else bad(`[${path}] only ${frameSums.size} distinct frames across ${TIMES.length} seeks — the samples are not independent`);
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
