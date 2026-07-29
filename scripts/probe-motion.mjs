/* What is still moving at capture time, by DOM query rather than by reading a
 * crop of a diff.
 *
 * Three "video determinism" fixes in a row failed because the pixels that moved
 * were never video — they sat at y≈1000–2000, which on the homepage is inline
 * SVG driven by SMIL <animate>, while the four <video> elements start at
 * y≈2892. The lesson that keeps repeating is to ask the DOM what occupies the
 * coordinates instead of squinting at a picture, so this probe replicates the
 * harness sequence exactly (freeze stylesheet, scroll walk, SMIL park, video
 * park) and then dumps, for every element that carries a clock:
 *
 *   - its document-space box, so a diff band can be attributed to a named
 *     element instead of guessed at;
 *   - whether the park actually took (svg.animationsPaused(), video paused +
 *     currentTime);
 *   - the current value of every attribute an <animate> targets, which is the
 *     only direct evidence that a paused SMIL timeline is also at the SAME
 *     frame on two separate runs. `animationsPaused() === true` only says the
 *     clock stopped; it says nothing about where it stopped.
 *
 * Run it twice and diff the JSON: any attribute that differs is a source of
 * screenshot nondeterminism, named.
 *
 *   CHROME=… node scripts/probe-motion.mjs [route] [width] > /tmp/m1.json
 */
import { chromium } from 'playwright';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8601';
const ROUTE = process.argv[2] || '/';
const W = Number(process.argv[3] || 1440);

const FREEZE = `*,*::before,*::after{animation-play-state:paused!important;
  animation-delay:-1ms!important;animation-duration:1ms!important;
  transition-duration:0s!important;transition-delay:0s!important;
  caret-color:transparent!important;scroll-behavior:auto!important}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({
  viewport: { width: W, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
});
const page = await ctx.newPage();
await page.goto(ORIGIN + ROUTE, { waitUntil: 'load' });
await page.addStyleTag({ content: FREEZE });
await page.evaluate(async () => {
  const step = innerHeight * 0.8;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  scrollTo(0, 0);
});
await page.waitForTimeout(1500);

/* the harness's park, verbatim */
await page.evaluate(async () => {
  for (const svg of document.querySelectorAll('svg')) {
    try { svg.setCurrentTime(0); svg.pauseAnimations(); } catch {}
  }
  const vs = [...document.querySelectorAll('video')];
  HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  vs.forEach((v) => { try { v.pause(); } catch {} });
  const once = (v, ev, ms) =>
    new Promise((done) => {
      const give = setTimeout(done, ms);
      v.addEventListener(ev, () => { clearTimeout(give); done(); }, { once: true });
    });
  const painted = (v, ms) =>
    v.requestVideoFrameCallback
      ? new Promise((done) => { const give = setTimeout(done, ms); v.requestVideoFrameCallback(() => { clearTimeout(give); done(); }); })
      : new Promise((r) => setTimeout(r, 250));
  for (const v of vs) {
    if (v.readyState < 1) await once(v, 'loadedmetadata', 3000);
    if (v.currentTime !== 0) {
      const seeked = once(v, 'seeked', 3000);
      v.currentTime = 0;
      await seeked;
    }
    await painted(v, 1500);
    try { v.pause(); } catch {}
  }
});
await page.waitForTimeout(400);

const report = await page.evaluate(() => {
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return [Math.round(r.top + scrollY), Math.round(r.bottom + scrollY), Math.round(r.left), Math.round(r.right)];
  };
  const id = (el) =>
    el.tagName.toLowerCase() +
    (el.id ? '#' + el.id : '') +
    (el.getAttribute('class') ? '.' + el.getAttribute('class').trim().split(/\s+/).join('.') : '');

  const svgs = [...document.querySelectorAll('svg')].map((s, i) => ({
    i, id: id(s), box: box(s),
    paused: typeof s.animationsPaused === 'function' ? s.animationsPaused() : null,
    t: typeof s.getCurrentTime === 'function' ? Number(s.getCurrentTime().toFixed(4)) : null,
  }));

  /* The frame a paused SMIL timeline stopped on, read off the targets. */
  const animates = [...document.querySelectorAll('animate,animateTransform,animateMotion,set')].map((a, i) => {
    const t = a.parentElement;
    const attr = a.getAttribute('attributeName');
    return {
      i, tag: a.tagName, attr,
      target: t ? id(t) : null,
      box: t ? box(t) : null,
      /* animVal is what is painted; baseVal is the authored value. A parked
         timeline must report the same animVal on every run. */
      value: t && attr ? (t.getAttribute(attr) ?? null) : null,
      computed: t ? getComputedStyle(t).getPropertyValue(attr || '') || null : null,
      transform: t && t.transform && t.transform.animVal
        ? [...t.transform.animVal].map((x) => x.matrix && [x.matrix.a, x.matrix.b, x.matrix.c, x.matrix.d, x.matrix.e, x.matrix.f].map((n) => Number(n.toFixed(4))))
        : null,
    };
  });

  const videos = [...document.querySelectorAll('video')].map((v, i) => ({
    i, src: (v.currentSrc || '').split('/').pop(), box: box(v),
    t: Number(v.currentTime.toFixed(4)), paused: v.paused, rs: v.readyState,
    vis: getComputedStyle(v).visibility,
  }));

  /* Anything else with a running CSS animation the FREEZE sheet missed. */
  const running = [];
  for (const el of document.querySelectorAll('*')) {
    const anims = typeof el.getAnimations === 'function' ? el.getAnimations() : [];
    for (const a of anims)
      if (a.playState === 'running') running.push({ el: id(el), anim: a.animationName || a.constructor.name, box: box(el) });
  }

  return {
    doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    svgs, animates, videos, running,
  };
});

console.log(JSON.stringify(report, null, 1));
await ctx.close();
await browser.close();
