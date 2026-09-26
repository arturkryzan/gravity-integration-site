/* Text that doesn't fit, at the widths where it is most likely not to:
 *
 *   offscreen — a text-bearing element whose box sticks out of the viewport
 *   clipped   — text wider than a box with overflow hidden/clip (the frames
 *               around masses are overflow:hidden, so an unbreakable word in
 *               them is cut off silently: documentElement.scrollWidth stays
 *               equal to the viewport and no overflow check notices)
 *   spill     — text wider than its own visible box by more than 4px
 *   cut       — a line of text that runs past the edge of a clipping
 *               ancestor (the case the element checks cannot see: the demo
 *               panel's heading overflowed its grid track, the track
 *               widened the heading with it, and the panel cut the word)
 *
 * scrollWidth alone missed every one of the three real cases this found
 * (a no-break-space phrase in the home tech band, "gravity.integration" in
 * the calculator heading, a nowrap button in the 404 panel), because the
 * overflow was inside a clipping frame. Hence the element walk.
 *
 * Known non-findings are excluded explicitly: visually-hidden text (1px
 * clipped boxes by design), and the calculator's bar fills from the element
 * checks (they are translated inside their track to show a percentage) —
 * the value printed in a fill is still held to the "cut" check.
 *
 * Before trusting a clean run, prove the probe can see: INJECT_CSS below
 * re-creates a fault this found (both examples fail as they should).
 *
 *   CHROME=… ORIGIN=http://127.0.0.1:8412 WIDTHS=320,390 node scripts/verify-overflow.mjs
 */
import { chromium } from 'playwright';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8412';
const WIDTHS = (process.env.WIDTHS || '320,360,390,768,1024,1440').split(',').map(Number);
const ROUTES = (process.env.ROUTES ||
  '/,/technologia/,/integracje/,/cennik/,/case-studies/,/czym-jest-esb/,/pobieranie/,/kontakt/,/kalkulator/,/polityka-prywatnosci/,/404.html,' +
  '/en/,/en/technology/,/en/integrations/,/en/pricing/,/en/case-studies/,/en/what-is-esb/,/en/download/,/en/contact/,/en/404.html').split(',');

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
let total = 0;
for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'gi_consent', value: 'denied', url: ORIGIN }]);
  const page = await ctx.newPage();
  for (const r of ROUTES) {
    await page.goto(ORIGIN + r, { waitUntil: 'networkidle' });
    /* INJECT_CSS re-creates a known fault, to prove the probe can see it
       before trusting a clean result — e.g. the old demo heading at 320:
       INJECT_CSS='.demo-h2{font-size:30px!important}.demo-panel{padding:32px!important}' */
    if (process.env.INJECT_CSS) await page.addStyleTag({ content: process.env.INJECT_CSS });
    const found = await page.evaluate((vw) => {
      const out = [];
      /* The calculator's bar fills are translated inside their track, so the
         fill's own box sticks out by design — exempt from the element checks
         only. The value printed in a fill is still measured line by line by
         the "cut" check below, against the track that clips it. */
      const hiddenByDesign = (el, boxCheck = true) => {
        for (let a = el; a; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (a.matches('.visually-hidden, [aria-hidden="true"], [hidden], dialog:not([open])')) return true;
          if (boxCheck && a.matches('.gi-bar-fill')) return true;
          if (cs.clipPath && cs.clipPath !== 'none') return true;
          if (cs.display === 'none' || cs.visibility === 'hidden') return true;
        }
        return false;
      };
      /* Text cut by a clipping ancestor: every text node under a box with
         overflow hidden/clip, measured line box by line box (a Range), not
         by its element — an overflowing grid track widens the element with
         it, so element boxes can all "fit" while the words are cut. */
      for (const box of document.querySelectorAll('body *')) {
        const bcs = getComputedStyle(box);
        if (bcs.overflowX !== 'hidden' && bcs.overflowX !== 'clip') continue;
        if (hiddenByDesign(box, false)) continue;
        const br = box.getBoundingClientRect();
        if (!br.width || !br.height) continue;
        const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent.trim() || hiddenByDesign(n.parentElement, false)) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const r of range.getClientRects()) {
            if (!r.width) continue;
            if (r.right > br.right + 1 || r.left < br.left - 1) {
              out.push(`cut ${box.tagName.toLowerCase()}.${String(box.className).split(' ')[0]} "${n.textContent.trim().slice(0, 40)}" [${Math.round(r.left)}→${Math.round(r.right)} in ${Math.round(br.left)}→${Math.round(br.right)}]`);
              break;
            }
          }
        }
      }
      for (const el of document.querySelectorAll('body *')) {
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!hasText) continue;
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        if (hiddenByDesign(el)) continue;
        const cs = getComputedStyle(el);
        const t = el.textContent.trim().slice(0, 50);
        const tag = `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`;
        if (rect.right > vw + 1 || rect.left < -1) out.push(`offscreen ${tag} [${Math.round(rect.left)}→${Math.round(rect.right)}] "${t}"`);
        else if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1)
          out.push(`clipped ${tag} ${el.scrollWidth}>${el.clientWidth} "${t}"`);
        else if (cs.overflowX === 'visible' && cs.display !== 'inline' && el.clientWidth && el.scrollWidth > el.clientWidth + 4)
          out.push(`spill ${tag} ${el.scrollWidth}>${el.clientWidth} "${t}"`);
      }
      return out;
    }, w);
    total += found.length;
    if (found.length) {
      console.log(`  FAIL ${r} @${w}`);
      for (const f of found.slice(0, 6)) console.log(`         ${f}`);
    }
  }
  console.log(`  — ${w}px done`);
  await ctx.close();
}
await browser.close();
console.log(`\n${total} problems`);
process.exit(total ? 1 : 0);
