/* Is the page still moving, or is it the page LOAD that varies?
 *
 * Every determinism fix so far has been aimed at "something is still animating
 * at capture time" — video, then video again, then video a third time, then
 * SMIL. Each was measured and each failed, and the motion probe then showed why
 * the last one could not have been right: the four <animate> elements live at
 * y≈2569–2730, while the diff bands were y≈1046–2040. Nothing that carries a
 * clock is in that range.
 *
 * So stop guessing at WHICH clock and ask whether there is a clock at all. This
 * takes two full-page screenshots from the SAME page session, a second apart,
 * with no navigation in between:
 *
 *   - if they differ, something really is still moving after the park, and the
 *     difference names the region to look at;
 *   - if they are byte-identical, the page is static once parked and the
 *     variance is in the LOAD — layout, font, reveal, or decode state that
 *     settles differently on different runs — and no amount of freezing at
 *     capture time will ever close it.
 *
 * Those two answers need completely different fixes, which is why this has to
 * be settled before another one is attempted.
 *
 *   CHROME=… node scripts/probe-twoshot.mjs [route] [width]
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8601';
const ROUTE = process.argv[2] || '/';
const W = Number(process.argv[3] || 1440);
const TAG = process.env.TAG || 'ts';

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
await page.evaluate(async () => {
  for (const svg of document.querySelectorAll('svg')) {
    try { svg.setCurrentTime(0); svg.pauseAnimations(); } catch {}
  }
  const vs = [...document.querySelectorAll('video')];
  HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  vs.forEach((v) => { try { v.pause(); } catch {} });
  for (const v of vs) {
    if (v.readyState >= 1 && v.currentTime !== 0) v.currentTime = 0;
    try { v.pause(); } catch {}
  }
  /* The candidate under test. A fullPage screenshot expands the viewport to the
     whole document, which makes every lazy <video> intersect at once and re-arms
     TextImgLink's observer; its `v.load()` then tears the element back down to
     readyState 0, so the next capture paints the poster where the previous one
     painted frame 0. Stubbing play was never enough because load is the half
     that resets. */
  if (!globalThis.__noLoad) HTMLMediaElement.prototype.load = function () {};
});
await page.waitForTimeout(400);

const shots = [];
for (let i = 0; i < 3; i++) {
  const buf = await page.screenshot({ fullPage: true });
  shots.push(buf);
  writeFileSync(`/tmp/${TAG}-${i}.png`, buf);
  if (i < 2) await page.waitForTimeout(1000);
}
const h = shots.map((b) => createHash('sha1').update(b).digest('hex').slice(0, 12));
console.log(`${ROUTE} @${W}  shot hashes: ${h.join('  ')}`);
console.log(h.every((x) => x === h[0]) ? '  SAME session: identical — nothing is moving after the park' : '  SAME session: DIFFER — something is still moving');

await ctx.close();
await browser.close();
