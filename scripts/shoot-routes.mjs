/* Full-page screenshots of every route at two widths, made repeatable enough
 * to diff. Several things vary between two runs of the same build; each is
 * silenced by a mechanism chosen for what it actually is, and the ones that
 * cannot be silenced are asserted instead of ignored.
 *
 *   CSS animation and transition state — frozen by the FREEZE stylesheet.
 *   Scroll-triggered reveals — the page is walked to the bottom and back, so
 *     everything that ever appears has appeared before anything is captured.
 *   SMIL — the homepages' illustrations are inline SVG driven by <animate>,
 *     which `animation-play-state` does not touch; parked with pauseAnimations().
 *   Video — NOT frozen, hidden. See the note on the FREEZE constant: a fullPage
 *     capture cannot photograph a <video> deterministically at all, so the
 *     pixels are dropped and the boxes are asserted instead.
 *
 * A fourth thing moved and was NOT silenced for a long time: the announcement
 * bar's height. `--gi-bar-h` is measured by main.js and was, at one point, also
 * read back by the bar's own min-height, so a narrow first layout latched a
 * taller bar permanently and shifted every route below it by up to 99px. Two
 * runs of an unchanged build then disagreed on five shots, and the gate's
 * verdict on an unrelated CSS strip was worthless. The mechanism is fixed in
 * AnnouncementBar.astro, but a harness that can be silently corrupted by one
 * element is a harness that has to prove that element every run — so the bar's
 * height is recorded per shot and any route that disagrees with its width's
 * consensus is reported and exits non-zero. A latch fails loudly now instead
 * of quietly poisoning a diff.
 *
 * Run: CHROME=… ORIGIN=… node scripts/shoot-routes.mjs <outdir>
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8601';
const OUT = process.argv[2] || 'shots';
const ALL_ROUTES = [
  '/', '/case-studies/', '/cennik/', '/czym-jest-esb/', '/integracje/',
  '/kalkulator/', '/kontakt/', '/pobieranie/', '/polityka-prywatnosci/',
  '/technologia/',
  '/en/', '/en/case-studies/', '/en/contact/', '/en/download/',
  '/en/integrations/', '/en/pricing/', '/en/technology/', '/en/what-is-esb/',
];
/* ONLY=/,/en/ narrows a run to named routes. A full pass is ~4 minutes, which
   is too slow a loop when the thing being debugged is the harness itself; a
   determinism question about one section only needs the routes that have it. */
const ROUTES = process.env.ONLY ? process.env.ONLY.split(',').filter(Boolean) : ALL_ROUTES;
const ALL_WIDTHS = [
  { name: 'desk', width: 1440, height: 900 },
  { name: 'mob', width: 390, height: 844 },
];
const WIDTHS = process.env.ONLY_W ? ALL_WIDTHS.filter((w) => w.name === process.env.ONLY_W) : ALL_WIDTHS;

/* `video{visibility:hidden}` is the one silencing here that costs something, so
   it is worth saying exactly what was measured before choosing it.
   Four rounds of "park the video at frame 0" all failed. probe-twoshot.mjs then
   took three fullPage screenshots from ONE page session, with the videos paused,
   currentTime 0, `play` and `load` both stubbed out, and nothing left running:
   the shots still disagreed, and the crops showed the video painting its frame
   in one and painting NOTHING — not the poster, blank background — in the next.
   That is Chromium dropping the video's compositing layer while
   captureBeyondViewport expands the viewport to the whole document; the page has
   no say in it, so no amount of freezing inside the page can fix it.
   `visibility:hidden` keeps the box, its size, and every surrounding layout
   effect while making the one region that cannot be photographed twice paint
   the same thing every time. What it costs is sight of the video's own painted
   style — border-radius, object-fit — so those are read off the DOM per shot and
   compared between runs by diff-shots.mjs. Hidden pixels, asserted geometry;
   nothing is merely ignored. */
/* `animation-duration:1ms` + `animation-delay:-1ms` used to be in here, as the
   usual "collapse every animation onto its end frame" trick. It is wrong, and it
   was the single largest source of nondeterminism in this harness. Overriding
   the duration of an animation that is ALREADY RUNNING does not reset its
   elapsed time — the animation keeps the time it has accumulated since page
   load, and the new duration merely reinterprets it. So `paused` froze each of
   the ~20 decorative SVG loops at (elapsed mod 1ms), which is to say at a
   uniformly random point in its cycle, and the homepage's rotating word ring
   landed a few pixels off between runs. The sheet now only says "stop"; WHERE
   they stop is set explicitly below, through the Web Animations API, which is
   the only interface that can actually seek them. */
const FREEZE = `*,*::before,*::after{animation-play-state:paused!important;
  transition-duration:0s!important;transition-delay:0s!important;
  caret-color:transparent!important;scroll-behavior:auto!important}
  video{visibility:hidden!important}`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const bars = new Map(); // width name -> [[route, barHeight], …]
const shotGeom = {}; // shot name -> [video geometry, …], written beside the PNGs

for (const w of WIDTHS) {
  for (const route of ROUTES) {
    const ctx = await browser.newContext({
      viewport: { width: w.width, height: w.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    await page.goto(ORIGIN + route, { waitUntil: 'load' });
    await page.addStyleTag({ content: FREEZE });

    // walk the whole page so every scroll-gated reveal and lazy asset fires
    await page.evaluate(async () => {
      const step = innerHeight * 0.8;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      scrollTo(0, 0);
    });
    await page.waitForTimeout(1500);

    /* SMIL. The illustrations on the homepages are inline SVG driven by
       <animate> elements, not CSS keyframes, so `animation-play-state: paused`
       does not touch them and they are still running at capture time.
       `pauseAnimations()` plus `setCurrentTime(0)` parks them at a defined frame
       rather than a wall-clock one. Unlike video this really does hold:
       probe-motion.mjs reads back animationsPaused() === true, getCurrentTime()
       === 0, and an identical `d` on every target across runs. */
    const geom = await page.evaluate(() => {
      /* CSS animations, seeked rather than merely stopped. Frame 0 and not the
         end frame on purpose: every animation on this site is either a
         decorative loop, where any fixed frame is as good as another, or a
         reveal whose visible default is the un-animated element (the register's
         rule that reveals must enhance something already painted). Frame 0 is
         therefore the state the page is designed to be readable in, and it is
         reachable without knowing any animation's duration. */
      for (const a of document.getAnimations()) {
        try { a.pause(); a.currentTime = 0; } catch {}
      }
      for (const svg of document.querySelectorAll('svg')) {
        try { svg.setCurrentTime(0); svg.pauseAnimations(); } catch {}
      }
      /* Video pixels are hidden (see FREEZE), so this is the only thing standing
         between a stylesheet edit and an unnoticed change to the players. Round
         to whole pixels: sub-pixel layout jitter is not what this is looking for,
         a moved or resized or restyled video is. */
      return [...document.querySelectorAll('video')].map((v) => {
        const r = v.getBoundingClientRect();
        const cs = getComputedStyle(v);
        return {
          src: (v.currentSrc || v.getAttribute('src') || '').split('/').pop(),
          box: [Math.round(r.top + scrollY), Math.round(r.left), Math.round(r.width), Math.round(r.height)],
          radius: cs.borderRadius,
          fit: cs.objectFit,
          display: cs.display,
        };
      });
    });
    shotGeom[(route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replace(/\//g, '_')) + `.${w.name}`] = geom;
    await page.waitForTimeout(400);

    /* Measured at capture time, not before the scroll walk — the latch this
       guards against happened during layout, so an early reading would miss
       exactly the case it exists for. */
    const barH = await page.evaluate(() => {
      const bar = document.getElementById('gi-announce-bar');
      return bar ? Math.round(bar.getBoundingClientRect().height) : -1;
    });
    if (!bars.has(w.name)) bars.set(w.name, []);
    bars.get(w.name).push([route, barH]);

    const name = (route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replace(/\//g, '_')) + `.${w.name}.png`;
    await page.screenshot({ path: join(OUT, name), fullPage: true });
    await ctx.close();
  }
  console.log(`  ${w.name} (${w.width}px): ${ROUTES.length} routes`);
}

/* The menu is the one state a URL crawl cannot reach, and it is also where a
   stylesheet edit is most likely to go unnoticed — so it gets its own shots. */
for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w.width, height: w.height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(ORIGIN + '/', { waitUntil: 'load' });
  await page.addStyleTag({ content: FREEZE });
  const btn = page.locator('.hamburger, [class*=hamburger]').first();
  if (await btn.count()) {
    await btn.click({ force: true });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(OUT, `menu.${w.name}.png`) });
    console.log(`  menu ${w.name}: shot`);
  } else console.log(`  menu ${w.name}: no trigger found`);
  await ctx.close();
}

await browser.close();

/* Written into the shot directory, not /tmp, so a set of screenshots always
   travels with the assertions that cover what the screenshots cannot see. */
writeFileSync(join(OUT, '_geom.json'), JSON.stringify(shotGeom, null, 1));

/* Consensus, not a hard-coded number: the bar is legitimately one row at 1440
   and two at 390, and a future campaign string could change both. What is never
   legitimate is one route in a width disagreeing with the other seventeen. */
let latched = 0;
for (const [width, rows] of bars) {
  const tally = new Map();
  for (const [, h] of rows) tally.set(h, (tally.get(h) || 0) + 1);
  const [consensus] = [...tally].sort((a, b) => b[1] - a[1])[0];
  const odd = rows.filter(([, h]) => h !== consensus);
  latched += odd.length;
  console.log(`  bar ${width}: consensus ${consensus}px` + (odd.length ? '' : ' (all routes agree)'));
  for (const [route, h] of odd) console.log(`  !! bar ${width}: ${route} = ${h}px — height latched, this run's shots are not comparable`);
}
if (latched) process.exitCode = 1;

console.log(`  → ${OUT}`);
