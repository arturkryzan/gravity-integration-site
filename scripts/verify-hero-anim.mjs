/* The home hero's animation (src/scripts/hero-fall.js), frame by frame.
 *
 * Playwright's clock drives the page's timers and requestAnimationFrame, so
 * every frame lands at an exact moment of the entrance and the loop. Writes
 * hero-only PNGs to OUT, and checks what can be checked without eyes:
 *   - before the hand-over the page is the static composition (reduced
 *     motion gets no data-anim at all, and no canvas or pause button);
 *   - the entrance ends at rest: no transform left on the mass, the H1 mint
 *     and back to a plain colour, data-anim="on";
 *   - on desktop the loop runs: the canvas is on, the pause button is
 *     shown and named, pressing it stops the clock (nothing changes on the
 *     canvas while time passes), pressing again resumes;
 *   - below 1000px there is no loop, no canvas and no pause button;
 *   - no page errors.
 *
 *   ORIGIN=http://127.0.0.1:8412 CHROME=… OUT=/tmp/hero node scripts/verify-hero-anim.mjs
 *   SIZES=1440x900,390x844 ROUTES=/ to narrow it down; FRAMES=0 skips the PNGs. */
import { chromium } from 'playwright';
import fs from 'node:fs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8412';
const OUT = process.env.OUT || '/tmp/hero-anim';
const FRAMES = process.env.FRAMES !== '0';
const ROUTES = (process.env.ROUTES || '/,/en/').split(',');
const SIZES = (process.env.SIZES || '1440x900,1280x720,1024x768,1000x700,1920x1080,390x844,320x640')
  .split(',')
  .map((s) => s.split('x').map(Number));
fs.mkdirSync(OUT, { recursive: true });

/* moments, ms after the entrance starts */
const INTRO_AT = [0, 250, 450, 560, 680, 800, 1000, 1400];
const LOOP_AT = [1250, 1500, 2000, 4000];
/* the first capture starts at 950 + enter + 4200 (the first hold) */
const CAPTURE_AFTER = [150, 450, 700, 850, 950, 1100, 1300, 1600, 1900, 2300];

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log('  FAIL', msg);
  }
};

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });

for (const route of ROUTES) {
  for (const [w, h] of SIZES) {
    const tag = `${route === '/' ? 'pl' : 'en'}-${w}x${h}`;
    /* ---- reduced motion: the static composition, untouched ---- */
    {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
      await ctx.addCookies([{ name: 'gi_consent', value: 'denied', url: ORIGIN }]);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(ORIGIN + route, { waitUntil: 'networkidle' });
      const st = await page.evaluate(() => {
        const hero = document.querySelector('.hero');
        return {
          anim: hero.getAttribute('data-anim'),
          fx: getComputedStyle(hero.querySelector('.hero-fx')).display,
          pause: getComputedStyle(hero.querySelector('.hero-pause')).display,
          h1: getComputedStyle(hero.querySelector('.hero-h1')).color,
        };
      });
      ok(st.anim === null, `${tag} reduced motion: data-anim is ${st.anim}`);
      ok(st.fx === 'none' && st.pause === 'none', `${tag} reduced motion: canvas/pause shown (${st.fx}/${st.pause})`);
      ok(st.h1 === 'rgb(1, 236, 144)', `${tag} reduced motion: H1 colour ${st.h1}`);
      ok(!errors.length, `${tag} reduced motion: page errors ${errors.join(' | ')}`);
      await ctx.close();
    }

    /* ---- the module never arrives: the hand-over, then the way back ---- */
    {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'no-preference' });
      await ctx.addCookies([{ name: 'gi_consent', value: 'denied', url: ORIGIN }]);
      const page = await ctx.newPage();
      await page.route(/HomeHero\.astro_astro_type_script/, (r) => r.abort());
      await page.clock.install({ time: new Date('2026-09-26T12:00:00Z') });
      await page.clock.pauseAt(new Date('2026-09-26T12:00:00.010Z'));
      await page.goto(ORIGIN + route, { waitUntil: 'load' });
      const st = () =>
        page.evaluate(() => {
          const hero = document.querySelector('.hero');
          return {
            anim: hero.getAttribute('data-anim'),
            h1: getComputedStyle(hero.querySelector('.hero-h1')).color,
            mass: getComputedStyle(hero.querySelector('.hero-mass')).visibility,
          };
        });
      const a = await st();
      ok(a.anim === 'pre', `${tag} no module: data-anim is ${a.anim}`);
      ok(a.h1 === 'rgb(30, 31, 51)' && a.mass === 'hidden', `${tag} no module: waits as ${a.h1} / mass ${a.mass}`);
      await page.clock.runFor(3100);
      const b = await st();
      ok(b.anim === null && b.mass === 'visible', `${tag} no module: after 3s ${b.anim} / mass ${b.mass}`);
      await ctx.close();
    }

    /* ---- motion, on the fake clock, paused until we move it ---- */
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'no-preference' });
    await ctx.addCookies([{ name: 'gi_consent', value: 'denied', url: ORIGIN }]);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.clock.install({ time: new Date('2026-09-26T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-09-26T12:00:00.010Z'));
    await page.goto(ORIGIN + route, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const anim = () => page.evaluate(() => document.querySelector('.hero').getAttribute('data-anim'));
    const hero = page.locator('.hero');
    const shot = async (name) => {
      if (FRAMES) await hero.screenshot({ path: `${OUT}/${tag}-${name}.png` });
    };
    let t = 0;
    for (let i = 0; i < 60 && (await anim()) !== 'in'; i++) await page.clock.runFor(10);
    ok((await anim()) === 'in', `${tag}: the entrance started`);
    await shot('i0000');
    for (const at of INTRO_AT.slice(1)) {
      await page.clock.runFor(at - t);
      t = at;
      await shot(`i${String(at).padStart(4, '0')}`);
    }
    await page.clock.runFor(200);
    t += 200;
    const rest = await page.evaluate(() => {
      const hero = document.querySelector('.hero');
      const h1 = hero.querySelector('.hero-h1');
      const cs = getComputedStyle(h1);
      return {
        anim: hero.getAttribute('data-anim'),
        transform: hero.querySelector('.hero-mass').style.transform,
        color: cs.color,
        bgImage: cs.backgroundImage,
        fx: getComputedStyle(hero.querySelector('.hero-fx')).display,
        pause: getComputedStyle(hero.querySelector('.hero-pause')).display,
        pauseName: hero.querySelector('.hero-pause').textContent.trim(),
      };
    });
    ok(rest.anim === 'on', `${tag}: at rest data-anim is ${rest.anim}`);
    ok(rest.transform === '', `${tag}: the mass keeps a transform at rest (${rest.transform})`);
    ok(rest.color === 'rgb(1, 236, 144)' && rest.bgImage === 'none', `${tag}: H1 at rest ${rest.color} / ${rest.bgImage}`);

    if (w >= 1000) {
      ok(rest.fx === 'block', `${tag}: canvas is ${rest.fx}`);
      ok(rest.pause !== 'none' && rest.pauseName.length > 5, `${tag}: pause button ${rest.pause} "${rest.pauseName}"`);
      for (const at of LOOP_AT) {
        if (at <= t) continue;
        await page.clock.runFor(at - t);
        t = at;
        await shot(`l${String(at).padStart(4, '0')}`);
      }
      /* the first capture: 950 (loop start) + the enter phase + 4200 */
      const n = await page.evaluate(
        () => JSON.parse(document.querySelector('.hero').dataset.tools)[0].replace(/ /g, '').length,
      );
      const capture = 950 + Math.max(700, 380 + (n - 1) * 22 + 240) + 4200;
      for (const d of CAPTURE_AFTER) {
        await page.clock.runFor(capture + d - t);
        t = capture + d;
        await shot(`c${String(d).padStart(4, '0')}`);
      }
      /* pause: time passes, nothing moves; resume: it moves again */
      const canvasData = () => page.evaluate(() => document.querySelector('.hero-fx').toDataURL());
      await page.clock.runFor(4000); // into the next cycle's enter/hold
      await page.locator('.hero-pause').click();
      const pressed = await page.locator('.hero-pause').getAttribute('aria-pressed');
      ok(pressed === 'true', `${tag}: aria-pressed after pause is ${pressed}`);
      const a = await canvasData();
      await page.clock.runFor(5000);
      const b = await canvasData();
      ok(a === b, `${tag}: the canvas changed while paused`);
      await page.locator('.hero-pause').click();
      await page.clock.runFor(5000);
      const c = await canvasData();
      ok(b !== c, `${tag}: the canvas did not move after resume`);
    } else {
      ok(rest.fx === 'none' && rest.pause === 'none', `${tag}: turned frame shows canvas/pause (${rest.fx}/${rest.pause})`);
    }
    ok(!errors.length, `${tag}: page errors ${errors.join(' | ')}`);
    await ctx.close();
    console.log(tag, 'done');
  }
}
/* ---- edge cases, 1440×900, Polish ---- */
if (!process.env.SKIP_EDGES) {
  const make = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
    await ctx.addCookies([{ name: 'gi_consent', value: 'denied', url: ORIGIN }]);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.clock.install({ time: new Date('2026-09-26T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-09-26T12:00:00.010Z'));
    return { ctx, page, errors };
  };
  const state = (page) =>
    page.evaluate(() => {
      const hero = document.querySelector('.hero');
      const c = hero.querySelector('.hero-fx');
      return {
        anim: hero.getAttribute('data-anim'),
        sat: hero.getAttribute('data-sat'),
        transform: hero.querySelector('.hero-mass').style.transform,
        h1: getComputedStyle(hero.querySelector('.hero-h1')).color,
        fx: getComputedStyle(c).display,
        pause: getComputedStyle(hero.querySelector('.hero-pause')).display,
        ink: (() => {
          if (!c.width) return 0;
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++;
          return n;
        })(),
      };
    });

  /* 1. loaded scrolled away from the hero: no entrance, the loop waits */
  {
    const { ctx, page, errors } = await make();
    await page.goto(ORIGIN + '/#section-demo', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400); // real time: the browser's (smooth) jump to the fragment
    await page.clock.runFor(600);
    const a = await state(page);
    ok(a.anim === 'on' && a.transform === '' && a.h1 === 'rgb(1, 236, 144)', `edge scrolled-away load: ${JSON.stringify(a)}`);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(300); // real time, for the IntersectionObserver
    await page.clock.runFor(2000);
    const b = await state(page);
    ok(b.ink > 50, `edge scrolled-away load: nothing drawn after scrolling back (${b.ink}px)`);
    ok(!errors.length, `edge scrolled-away load: page errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  /* 2. across the 1000px breakpoint mid-loop, and back */
  {
    const { ctx, page, errors } = await make();
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.clock.runFor(2500);
    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForTimeout(200);
    await page.clock.runFor(300);
    const a = await state(page);
    ok(a.fx === 'none' && a.pause === 'none' && a.sat === null, `edge turned mid-loop: ${JSON.stringify(a)}`);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);
    await page.clock.runFor(2500);
    const b = await state(page);
    ok(b.fx === 'block' && b.pause !== 'none' && b.sat === 'fx' && b.ink > 50, `edge back to desktop: ${JSON.stringify(b)}`);
    ok(!errors.length, `edge breakpoint: page errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  /* 3. click the satellite during the hold: the mass takes it at once */
  {
    const { ctx, page, errors } = await make();
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.clock.runFor(2500); // the first hold (4.2s) has just begun
    const sat = await page.evaluate(() => {
      const r = document.querySelector('.hero-satellite').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const before = await page.evaluate(() => document.querySelector('.hero-fx').toDataURL());
    await page.mouse.click(sat.x, sat.y);
    await page.clock.runFor(400);
    const after = await page.evaluate(() => document.querySelector('.hero-fx').toDataURL());
    ok(before !== after, 'edge click-to-capture: nothing moved 400ms after the click');
    ok(!errors.length, `edge click: page errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  /* 4. reduced motion switched on while it runs: the static composition */
  {
    const { ctx, page, errors } = await make();
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.clock.runFor(600); // mid-entrance
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(100);
    const a = await state(page);
    ok(
      a.anim === null && a.transform === '' && a.h1 === 'rgb(1, 236, 144)' && a.fx === 'none' && a.pause === 'none',
      `edge reduced motion at runtime: ${JSON.stringify(a)}`,
    );
    ok(!errors.length, `edge reduced motion: page errors ${errors.join(' | ')}`);
    await ctx.close();
  }
  console.log('edge cases done');
}

await browser.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
