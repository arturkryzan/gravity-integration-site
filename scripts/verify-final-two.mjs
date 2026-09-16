/* Verifies the two final changes against a production build, in a real engine.
 *
 * Change 1: the Pobieranie / Download item in the fullscreen nav-big menu is
 *           the brand green, and inverts to white on hover and on keyboard
 *           focus. Measured as computed colour + real contrast against the
 *           colour actually painted behind it, at three viewports.
 * Change 2: the direct-download link exists in the post-submit panel of both
 *           locales, points at the installer, is on-screen and in flow, and
 *           its dataLayer push fires exactly once per click without touching
 *           generate_lead.
 *
 * Nothing here is read off a screenshot: every claim is a DOM measurement.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8677';
const OUT = process.argv[2] || '/tmp/final-two';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'phone', width: 390, height: 844 },
];

const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);

const results = [];
const fail = (m) => results.push({ ok: false, m });
const pass = (m) => results.push({ ok: true, m });

const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--no-sandbox'],
});

/* ---- Change 1: the green nav item ---- */
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' });

  // Open the fullscreen menu the way a visitor does, then settle the animation.
  await page.click('button.hamburger');
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    for (const a of document.getAnimations()) { a.pause(); a.currentTime = 1e6; }
  });

  const m = await page.evaluate(() => {
    const a = document.querySelector('.nav-main .nav-big a.nav-download');
    if (!a) return { found: false };
    const r = a.getBoundingClientRect();
    // Walk up for the first non-transparent painted background.
    let el = a, bg = 'rgba(0, 0, 0, 0)';
    while (el) {
      const c = getComputedStyle(el).backgroundColor;
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) { bg = c; break; }
      el = el.parentElement;
    }
    const sibs = [...document.querySelectorAll('.nav-main .nav-big a')].map((x) => ({
      text: x.textContent.trim(),
      color: getComputedStyle(x).color,
      size: getComputedStyle(x).fontSize,
    }));
    return {
      found: true,
      color: getComputedStyle(a).color,
      fontSize: getComputedStyle(a).fontSize,
      bg,
      visible: r.width > 0 && r.height > 0 && r.top < innerHeight && r.left >= 0,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      sibs,
    };
  });

  if (!m.found) { fail(`[${vp.name}] a.nav-download NOT FOUND in the open menu`); await page.close(); continue; }
  if (!m.visible) fail(`[${vp.name}] a.nav-download not on screen: ${JSON.stringify(m.rect)}`);

  const cr = ratio(parse(m.color), parse(m.bg));
  const px = parseFloat(m.fontSize);
  const need = px >= 24 ? 3 : 4.5; // 18.66px bold / 24px = "large text"
  const greens = m.sibs.filter((s) => s.color === m.color).length;
  console.log(`[${vp.name}] rest=${m.rect.w}x${m.rect.h} color=${m.color} on ${m.bg} @${m.fontSize} → ${cr.toFixed(2)}:1 (need ${need})`);
  console.log(`          siblings: ${m.sibs.map((s) => `${s.text}=${s.color}`).join(' | ')}`);

  if (!/39, 234, 147/.test(m.color)) fail(`[${vp.name}] nav-download colour is ${m.color}, expected rgb(39, 234, 147)`);
  else pass(`[${vp.name}] nav-download is brand green`);
  if (cr < need) fail(`[${vp.name}] green fails contrast: ${cr.toFixed(2)}:1 < ${need}`);
  else pass(`[${vp.name}] green contrast ${cr.toFixed(2)}:1 ≥ ${need}`);
  if (greens !== 1) fail(`[${vp.name}] ${greens} nav-big items share the green — it must be the only one`);
  else pass(`[${vp.name}] green is unique in the list`);

  // Hover and keyboard focus must both invert to white.
  await page.hover('.nav-main .nav-big a.nav-download');
  await page.waitForTimeout(300);
  const hover = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.nav-main .nav-big a.nav-download')).color);
  const focus = await page.evaluate(() => {
    const a = document.querySelector('.nav-main .nav-big a.nav-download');
    a.focus();
    return { color: getComputedStyle(a).color, isFocus: a === document.activeElement };
  });
  console.log(`          hover=${hover} focus=${focus.color} (focused=${focus.isFocus})`);
  if (hover === m.color) fail(`[${vp.name}] hover does not change colour — no pointer feedback`);
  else pass(`[${vp.name}] hover inverts to ${hover}`);
  if (!focus.isFocus) fail(`[${vp.name}] nav-download could not take focus`);
  else if (focus.color === m.color) fail(`[${vp.name}] :focus-visible does not invert (${focus.color})`);
  else pass(`[${vp.name}] focus inverts to ${focus.color}`);

  await page.screenshot({ path: `${OUT}/menu-${vp.name}.png` });
  await page.close();
}

/* ---- Change 2: the direct-download link ---- */
const ROUTES = [
  { path: '/pobieranie/?dl-preview=success', locale: 'pl', label: 'Pobierz instalator teraz' },
  { path: '/en/download/?dl-preview=success', locale: 'en', label: 'Download the installer now' },
];

for (const r of ROUTES) {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(ORIGIN + r.path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.evaluate(() => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = 1e6; } });

    /* Two conditions have to be cleared before a hit test means anything, and
       both were measured before being dismissed rather than waved away:
       (1) The consent panel is anchored to the bottom of the VIEWPORT — its
           rect bottom equals innerHeight at 1440, 768 and 390 alike — so it
           covers the lowest 178-249px of every route until it is answered.
           At 768 that band happens to contain this link. It is a global,
           one-time, dismissible condition, not something this paragraph
           introduced; answering it is what a real visitor does first.
       (2) At 390 the link starts below the fold, so elementFromPoint returns
           null for coordinates that are simply off-screen. Scrolling is not
           cheating the test; it is the test. */
    const consent = await page.$('.gi-consent-accept, .gi-consent-btn');
    if (consent) { await consent.click(); await page.waitForTimeout(400); }
    await page.evaluate(() => {
      document.querySelector('.dl-done .dl-done-exe')
        ?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
    await page.waitForTimeout(200);

    const m = await page.evaluate(() => {
      const a = document.querySelector('.dl-done .dl-done-exe');
      if (!a) return { found: false };
      const rect = a.getBoundingClientRect();
      const p = a.closest('p');
      const note = document.querySelector('.dl-done .dl-done-note');
      const pr = p.getBoundingClientRect();
      const nr = note ? note.getBoundingClientRect() : null;
      const done = document.querySelector('.dl-done');
      let el = a, bg = 'rgba(0, 0, 0, 0)';
      while (el) {
        const c = getComputedStyle(el).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) { bg = c; break; }
        el = el.parentElement;
      }
      /* What actually occupies the link? Never infer from a crop — and never
         probe the bounding rect of a wrapped inline: when the text runs onto
         two lines, the bounding box's centre falls in the leading BETWEEN the
         line boxes, where no element's text lives. Test each line box. */
      const boxes = [...a.getClientRects()];
      const hit = boxes.length && boxes.every((b) => {
        const el = document.elementFromPoint(b.x + Math.min(b.width / 2, 20), b.y + b.height / 2);
        return el === a || a.contains(el);
      });
      return {
        found: true,
        href: a.getAttribute('href'),
        download: a.hasAttribute('download'),
        hook: a.hasAttribute('data-direct-download'),
        text: a.textContent.trim(),
        sentence: p.textContent.trim(),
        color: getComputedStyle(a).color,
        bg,
        fontSize: getComputedStyle(p).fontSize,
        underline: getComputedStyle(a).textDecorationLine,
        opacity: getComputedStyle(done).opacity,
        doneHidden: done.hidden,
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        aboveNote: nr ? pr.bottom <= nr.top + 1 : null,
        lines: a.getClientRects().length,
        hitIsLink: hit,
        inViewport: rect.x >= 0 && rect.right <= innerWidth,
      };
    });

    if (!m.found) { fail(`[${r.locale}/${vp.name}] .dl-done-exe NOT FOUND`); await page.close(); continue; }

    const cr = ratio(parse(m.color), parse(m.bg));
    console.log(`[${r.locale}/${vp.name}] "${m.text}" ${m.rect.w}x${m.rect.h} ${m.color} on ${m.bg} → ${cr.toFixed(2)}:1, ${m.lines} line box(es), hit=${m.hitIsLink}`);

    if (m.href !== 'https://gravity-integration.com/downloads/GravityInstaller.exe')
      fail(`[${r.locale}/${vp.name}] wrong href: ${m.href}`);
    else pass(`[${r.locale}/${vp.name}] href points at the installer`);
    if (!m.download) fail(`[${r.locale}/${vp.name}] missing download attribute`);
    if (!m.hook) fail(`[${r.locale}/${vp.name}] missing data-direct-download hook`);
    if (m.text !== r.label) fail(`[${r.locale}/${vp.name}] label is "${m.text}", expected "${r.label}"`);
    else pass(`[${r.locale}/${vp.name}] label is in the right language`);
    if (m.doneHidden || Number(m.opacity) < 0.99)
      fail(`[${r.locale}/${vp.name}] panel not actually revealed (hidden=${m.doneHidden} opacity=${m.opacity})`);
    else pass(`[${r.locale}/${vp.name}] panel revealed`);
    if (cr < 4.5) fail(`[${r.locale}/${vp.name}] link contrast ${cr.toFixed(2)}:1 < 4.5`);
    else pass(`[${r.locale}/${vp.name}] link contrast ${cr.toFixed(2)}:1`);
    if (!/underline/.test(m.underline)) fail(`[${r.locale}/${vp.name}] link is not underlined — colour alone can't carry it`);
    if (m.aboveNote === false) fail(`[${r.locale}/${vp.name}] direct link sits below the spam note`);
    else pass(`[${r.locale}/${vp.name}] sits above the spam note`);
    if (!m.hitIsLink) fail(`[${r.locale}/${vp.name}] something else occupies the link's centre`);
    else pass(`[${r.locale}/${vp.name}] link is the topmost thing at its own centre`);
    if (!m.inViewport) fail(`[${r.locale}/${vp.name}] link overflows horizontally: ${JSON.stringify(m.rect)}`);
    else pass(`[${r.locale}/${vp.name}] no horizontal overflow`);

    // The dataLayer push: exactly one, and never generate_lead.
    if (vp.name === 'desktop') {
      const events = await page.evaluate(async () => {
        const w = window;
        w.dataLayer = w.dataLayer || [];
        const before = w.dataLayer.length;
        const a = document.querySelector('.dl-done .dl-done-exe');
        a.removeAttribute('download');           // don't start a real navigation
        a.setAttribute('href', 'javascript:void 0');
        a.click();
        /* Count only what the site pushes. When the real gtag.js loads (the
           harness accepts consent and this environment can reach Google),
           GA4's enhanced measurement adds its own `gtm.linkClick` on every
           anchor click — Google's bookkeeping, not ours, and not a second
           lead. Without this filter the assertion passes only in sandboxes
           that cannot reach googletagmanager.com, which is the wrong thing
           to depend on. */
        return w.dataLayer
          .slice(before)
          .filter((e) => !(e && typeof e.event === 'string' && e.event.startsWith('gtm.')))
          .map((e) => JSON.stringify(e));
      });
      console.log(`          dataLayer after click: ${JSON.stringify(events)}`);
      if (events.length !== 1) fail(`[${r.locale}] click pushed ${events.length} events, expected 1`);
      else if (!/direct_download/.test(events[0])) fail(`[${r.locale}] wrong event: ${events[0]}`);
      else pass(`[${r.locale}] click pushes exactly one direct_download`);
      if (events.some((e) => /generate_lead/.test(e))) fail(`[${r.locale}] click fired generate_lead — double-counts the lead`);
    }

    await page.screenshot({ path: `${OUT}/done-${r.locale}-${vp.name}.png` });
    await page.close();
  }
}

/* ---- Reduced motion: the new paragraph must not be gated on an animation ---- */
{
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  await page.goto(`${ORIGIN}/pobieranie/?dl-preview=success`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const a = document.querySelector('.dl-done .dl-done-exe');
    const cs = getComputedStyle(a.closest('p'));
    const r = a.getBoundingClientRect();
    return { opacity: cs.opacity, dur: cs.animationDuration, w: r.width, h: r.height };
  });
  console.log(`[reduced-motion] opacity=${m.opacity} animation-duration=${m.dur} box=${Math.round(m.w)}x${Math.round(m.h)}`);
  if (Number(m.opacity) < 0.99 || m.w === 0) fail(`[reduced-motion] direct link invisible: ${JSON.stringify(m)}`);
  else pass('[reduced-motion] direct link renders without the animation');
  await page.close();
}

await browser.close();

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
for (const b of bad) console.log(`  FAIL ${b.m}`);
process.exit(bad.length ? 1 : 0);
