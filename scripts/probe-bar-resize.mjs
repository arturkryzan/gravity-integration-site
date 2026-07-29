/* Reproduce the announcement bar's height ratchet by resizing.
 *
 * The font-delay hypothesis (probe-bar.mjs) failed and the all-routes sweep
 * (probe-bar-all.mjs) found every route settled at 47px, so the transient is
 * not the webfont and not route-specific. The remaining candidate is width:
 * at a narrow viewport the message takes its own row and the two pills wrap,
 * so the bar is legitimately tall. main.js measures that height into
 * --gi-bar-h; while the bar's own min-height *read* that variable, widening
 * the viewport afterwards could not shrink the box again, because min-height
 * now held the narrow height as a floor and the ResizeObserver had nothing
 * left to observe.
 *
 * That is the whole ratchet, and it is reachable by any real user who rotates
 * a phone or drags a window wider — not only by the screenshot harness.
 *
 *   node scripts/probe-bar-resize.mjs /en/pricing/
 * A fixed build reports the same height at 1440 regardless of where it
 * started; a broken one reports the narrow height latched. */
import { chromium } from 'playwright';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8601';
const ROUTE = process.argv[2] || '/en/pricing/';

const read = (page) =>
  page.evaluate(() => {
    const bar = document.getElementById('gi-announce-bar');
    return {
      w: innerWidth,
      h: Math.round(bar.getBoundingClientRect().height),
      min: getComputedStyle(bar).minHeight,
      v: getComputedStyle(document.documentElement).getPropertyValue('--gi-bar-h').trim(),
      doc: document.documentElement.scrollHeight,
    };
  });

const browser = await chromium.launch({ executablePath: process.env.CHROME });

/* control: straight to 1440, never narrow */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(ORIGIN + ROUTE, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const o = await read(page);
  console.log(`control   @${o.w}  bar=${o.h}  min=${o.min}  var=${o.v}  doc=${o.doc}`);
  await ctx.close();
}

/* the ratchet path: load narrow, then widen */
for (const start of [360, 480, 600, 900]) {
  const ctx = await browser.newContext({ viewport: { width: start, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(ORIGIN + ROUTE, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const narrow = await read(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1200);
  const wide = await read(page);
  const flag = wide.h === 47 ? '   ' : '!! ';
  console.log(
    `${flag}start=${String(start).padStart(4)}  narrow bar=${narrow.h} (var=${narrow.v})  ->  wide bar=${wide.h}  min=${wide.min}  var=${wide.v}  doc=${wide.doc}`,
  );
  await ctx.close();
}
await browser.close();
