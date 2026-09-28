/* The four animated use-case panels on the home page (UseCaseAnim.astro,
 * src/scripts/use-case-anims.js), frame by frame on Playwright's clock.
 *
 * Checks, per panel, size and locale:
 *   - the canvas is live (data-live), covers the frame, and draws;
 *   - no text anywhere in the panel (nothing but the canvas, two discs and
 *     the stop button's visually-hidden name);
 *   - the stop button is shown, named, described by the row's heading, and
 *     stops the panel (nothing changes while time passes), and restarts it;
 *   - a panel off screen does not move;
 *   - reduced motion: a still is drawn, no button;
 *   - without the script: the field and its mass (the static key visual);
 *   - no page errors.
 * With FRAMES≠0 it also writes each panel at the moments in AT to OUT.
 *
 *   ORIGIN=http://127.0.0.1:8412 CHROME=… OUT=/tmp/uc node scripts/verify-use-cases.mjs */
import { chromium } from 'playwright';
import fs from 'node:fs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8412';
const OUT = process.env.OUT || '/tmp/use-cases';
const FRAMES = process.env.FRAMES !== '0';
const ROUTES = (process.env.ROUTES || '/,/en/').split(',');
const SIZES = (process.env.SIZES || '1440x900,390x844').split(',').map((s) => s.split('x').map(Number));
const AT = {
  consolidate: [0.3, 1.0, 1.6, 2.2, 3.35, 3.9, 4.4, 5.0, 5.6, 6.3, 8.0, 9.2, 9.7],
  connect: [0, 0.8, 1.6, 2.4, 3.2, 4.0, 5.6, 7.2],
  partners: [0.3, 0.6, 1.0, 1.5, 2.2, 3.0, 4.0, 5.0, 7.4, 7.7, 8.4],
  control: [0.5, 2.0, 3.3, 4.0, 4.6, 5.2, 5.8, 6.4, 6.9, 7.5, 8.2, 9.5],
};
fs.mkdirSync(OUT, { recursive: true });

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
const newPage = async (w, h, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: opts.reduce ? 'reduce' : 'no-preference' });
  await ctx.addCookies([{ name: 'gi_consent', value: 'denied', url: ORIGIN }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (opts.block) await page.route(/use-case-anims|UseCaseAnim\.astro_astro_type_script/, (r) => r.abort());
  if (opts.clock) {
    await page.clock.install({ time: new Date('2026-09-28T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-09-28T12:00:00.010Z'));
  }
  await page.goto(ORIGIN + opts.route, { waitUntil: 'load' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  return { ctx, page, errors };
};
/* how much of the canvas is not the field colour: something is drawn */
const inked = (page, i) =>
  page.evaluate((i) => {
    const c = document.querySelectorAll('.uc .uc-over')[i];
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const f = [d[0], d[1], d[2]];
    let n = 0;
    for (let k = 0; k < d.length; k += 16) if (Math.abs(d[k] - f[0]) + Math.abs(d[k + 1] - f[1]) + Math.abs(d[k + 2] - f[2]) > 30) n++;
    return n / (d.length / 16);
  }, i);
const snap = (page, i) => page.evaluate((i) => document.querySelectorAll('.uc .uc-over')[i].toDataURL(), i);

for (const route of ROUTES) {
  for (const [w, h] of SIZES) {
    const tag = `${route === '/' ? 'pl' : 'en'}-${w}`;

    /* ---- motion, on the clock ---- */
    const { ctx, page, errors } = await newPage(w, h, { route, clock: true });
    const scenes = await page.evaluate(() => [...document.querySelectorAll('.uc')].map((e) => e.dataset.scene));
    ok(scenes.join() === 'consolidate,connect,partners,control', `${tag}: panels ${scenes.join()}`);
    for (let i = 0; i < scenes.length; i++) {
      const name = scenes[i];
      const el = page.locator('.uc').nth(i);
      /* off screen first, so it starts its story from zero when it comes back */
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150); // real time: the IntersectionObserver
      await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const info = await page.evaluate((i) => {
        const e = document.querySelectorAll('.uc')[i];
        const c = e.querySelector('.uc-over');
        const b = e.querySelector('.uc-pause');
        const r = e.getBoundingClientRect();
        const cr = c.getBoundingClientRect();
        const heading = b.getAttribute('aria-describedby');
        const text = [...e.querySelectorAll('*')]
          .filter((n) => !n.closest('.visually-hidden') && n.childNodes.length)
          .flatMap((n) => [...n.childNodes].filter((t) => t.nodeType === 3 && t.textContent.trim()).map((t) => t.textContent.trim()));
        return {
          live: e.hasAttribute('data-live'),
          cover: Math.abs(cr.width - e.clientWidth) < 1 && Math.abs(cr.height - e.clientHeight) < 1,
          ratio: +(r.width / r.height).toFixed(3),
          btn: !b.hidden && getComputedStyle(b).display !== 'none',
          name: b.querySelector('.visually-hidden')?.textContent.trim(),
          described: !!(heading && document.getElementById(heading)?.tagName === 'H2'),
          text,
        };
      }, i);
      ok(info.live && info.cover, `${tag} ${name}: live ${info.live}, canvas covers ${info.cover}`);
      ok(Math.abs(info.ratio - 1440 / 804) < 0.02, `${tag} ${name}: ratio ${info.ratio}`);
      ok(info.btn && info.name && info.described, `${tag} ${name}: button ${info.btn} "${info.name}" described ${info.described}`);
      ok(!info.text.length, `${tag} ${name}: text in the panel: ${info.text.join(' | ')}`);
      let t = 0;
      let most = 0;
      for (const at of AT[name]) {
        await page.clock.runFor(Math.round((at - t) * 1000));
        t = at;
        most = Math.max(most, await inked(page, i));
        if (FRAMES) await el.screenshot({ path: `${OUT}/${tag}-${name}-${String(Math.round(at * 100)).padStart(4, '0')}.png` });
      }
      ok(most > 0.01, `${tag} ${name}: nothing drawn`);
      /* stop and go */
      await el.locator('.uc-pause').click();
      const a = await snap(page, i);
      await page.clock.runFor(3000);
      ok(a === (await snap(page, i)), `${tag} ${name}: moved while stopped`);
      ok((await el.locator('.uc-pause').getAttribute('aria-pressed')) === 'true', `${tag} ${name}: aria-pressed`);
      await el.locator('.uc-pause').click();
      await page.clock.runFor(1500);
      ok(a !== (await snap(page, i)), `${tag} ${name}: did not move after restart`);
    }
    /* off screen: the first panel does not move while the last is in view */
    const first = await snap(page, 0);
    await page.clock.runFor(2000);
    ok(first === (await snap(page, 0)), `${tag}: an off-screen panel moved`);
    ok(!errors.length, `${tag}: page errors ${errors.join(' | ')}`);
    await ctx.close();

    /* ---- reduced motion: a still, no button ---- */
    {
      const { ctx, page, errors } = await newPage(w, h, { route, reduce: true });
      for (let i = 0; i < 4; i++) {
        await page.locator('.uc').nth(i).scrollIntoViewIfNeeded();
        await page.waitForTimeout(100);
        ok((await inked(page, i)) > 0.01, `${tag} reduced ${i}: no still drawn`);
        const btn = await page.locator('.uc-pause').nth(i).isVisible();
        ok(!btn, `${tag} reduced ${i}: button shown`);
        if (FRAMES && w >= 1000) await page.locator('.uc').nth(i).screenshot({ path: `${OUT}/${tag}-reduced-${i}.png` });
      }
      ok(!errors.length, `${tag} reduced: page errors ${errors.join(' | ')}`);
      await ctx.close();
    }

    /* ---- without the script: field and mass ---- */
    {
      const { ctx, page } = await newPage(w, h, { route, block: true });
      const st = await page.evaluate(() =>
        [...document.querySelectorAll('.uc')].map((e) => ({
          live: e.hasAttribute('data-live'),
          discs: [...e.querySelectorAll('.uc-disc')].filter((d) => getComputedStyle(d).display !== 'none').length,
          btn: getComputedStyle(e.querySelector('.uc-pause')).display,
        })),
      );
      ok(st.every((s) => !s.live && s.discs >= 1 && s.btn === 'none'), `${tag} no script: ${JSON.stringify(st)}`);
      if (FRAMES && w >= 1000) {
        for (let i = 0; i < 4; i++) {
          await page.locator('.uc').nth(i).scrollIntoViewIfNeeded();
          await page.waitForTimeout(700); // the page's own scroll reveal
          await page.locator('.uc').nth(i).screenshot({ path: `${OUT}/${tag}-nojs-${i}.png` });
        }
      }
      await ctx.close();
    }
    console.log(tag, 'done');
  }
}
await browser.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
