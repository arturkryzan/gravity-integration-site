/* Verifies the two final changes against a production build, in a real engine.
 *
 * Change 1: the download is the site's one highlighted action — v1 marked it
 *           brand green in the fullscreen menu; v2 makes it the top bar's
 *           only button and the menu dialog's only accent button. Measured
 *           as computed colour + real contrast against its own fill, hover
 *           and keyboard-focus feedback, and the dialog's modal behaviour,
 *           at three viewports.
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

/* ---- Change 1, v2: the download is the one highlighted action ----
   v1 hid the site behind a MENU overlay and marked its Download item brand
   green. v2 has a visible top bar whose only button is the download; below
   1100px the links fold into a <dialog> menu whose only accent button is,
   again, the download. What carries over, measured the same way: the action
   is reachable at every viewport, it is the single highlighted item, its
   label has >= 4.5:1 against its own fill, and pointer and keyboard both get
   feedback. New in v2, because the menu is now a modal: opening it moves
   focus inside, Escape closes it, focus returns to the button that opened
   it, and aria-expanded tells a screen reader which state it is in. */
const DL_HREF = '/pobieranie/';
const keyboardFocus = async (page, selector, max = 40) => {
  await page.evaluate(() => document.activeElement?.blur());
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((sel) => document.activeElement?.matches(sel), selector)) return true;
  }
  return false;
};
const paint = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    color: cs.color,
    bg: cs.backgroundColor,
    fontSize: cs.fontSize,
    outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
    outlineW: parseFloat(cs.outlineWidth) || 0,
    outlineStyle: cs.outlineStyle,
    visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && r.top < innerHeight && r.left >= 0 && r.right <= innerWidth,
    href: el.getAttribute('href'),
  };
};

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' });
  const consent = await page.$('.gi-consent-accept');
  if (consent) { await consent.click(); await page.waitForTimeout(300); }
  await page.mouse.move(0, vp.height - 1);

  /* The bar. At 1440 and 768 the download is on it and is its only button;
     on a phone the bar is too narrow and hides it by design — the hero and
     the menu both carry it there. */
  const cta = await page.evaluate(`(${paint.toString()})('.site-header .site-cta')`);
  const barButtons = await page.evaluate(() => [...document.querySelectorAll('.site-header .btn')].filter((b) => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0).length);
  const expectOnBar = vp.width >= 480;
  if (!cta) fail(`[${vp.name}] .site-cta NOT FOUND`);
  else if (expectOnBar) {
    if (!cta.visible) fail(`[${vp.name}] the download is not on the bar`);
    else pass(`[${vp.name}] the download is on the bar`);
    if (barButtons !== 1) fail(`[${vp.name}] ${barButtons} buttons on the bar — the download must be the only one`);
    else pass(`[${vp.name}] it is the bar's only button`);
    if (cta.href !== DL_HREF) fail(`[${vp.name}] bar download points at ${cta.href}`);
    const cr = ratio(parse(cta.color), parse(cta.bg));
    console.log(`[${vp.name}] bar CTA ${cta.color} on ${cta.bg} @${cta.fontSize} → ${cr.toFixed(2)}:1`);
    if (cr < 4.5) fail(`[${vp.name}] bar CTA label ${cr.toFixed(2)}:1 < 4.5`);
    else pass(`[${vp.name}] bar CTA label ${cr.toFixed(2)}:1`);
    await page.hover('.site-header .site-cta');
    await page.waitForTimeout(250);
    const hov = await page.evaluate(`(${paint.toString()})('.site-header .site-cta')`);
    await page.mouse.move(0, vp.height - 1);
    await page.waitForTimeout(250);
    if (hov.bg === cta.bg) fail(`[${vp.name}] bar CTA: hover changes nothing`);
    else pass(`[${vp.name}] bar CTA hover ${cta.bg} → ${hov.bg}`);
    const got = await keyboardFocus(page, '.site-header .site-cta');
    const foc = await page.evaluate(`(${paint.toString()})('.site-header .site-cta')`);
    console.log(`          focus-visible outline: ${foc.outline}`);
    if (!got) fail(`[${vp.name}] bar CTA unreachable by Tab`);
    else if (foc.outlineStyle === 'none' || foc.outlineW < 2) fail(`[${vp.name}] bar CTA has no focus ring (${foc.outline})`);
    else pass(`[${vp.name}] bar CTA shows a ${foc.outlineW}px focus ring`);
  } else {
    if (cta.visible) fail(`[${vp.name}] the bar CTA shows on a phone bar that has no room for it`);
    else pass(`[${vp.name}] phone bar leaves the download to the hero and the menu`);
  }

  /* The menu, below 1100px. */
  if (vp.width < 1100) {
    const btn = '.site-header [data-menu-open]';
    const before = await page.$eval(btn, (b) => b.getAttribute('aria-expanded'));
    await page.mouse.move(0, vp.height - 1);
    await page.focus(btn);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    await page.evaluate(() => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = 1e6; } });
    const open = await page.evaluate(() => {
      const d = document.getElementById('site-menu');
      const accents = [...d.querySelectorAll('.btn--accent')];
      return {
        open: d.open,
        modal: d.matches(':modal'),
        focusInside: d.contains(document.activeElement),
        expanded: document.querySelector('.site-header [data-menu-open]').getAttribute('aria-expanded'),
        accents: accents.length,
        dlHref: accents[0]?.getAttribute('href'),
      };
    });
    if (!open.open || !open.modal) fail(`[${vp.name}] menu did not open as a modal dialog (open=${open.open} modal=${open.modal})`);
    else pass(`[${vp.name}] menu opens as a modal dialog`);
    if (!open.focusInside) fail(`[${vp.name}] focus did not move into the menu`);
    else pass(`[${vp.name}] focus moves into the menu`);
    if (before !== 'false' || open.expanded !== 'true') fail(`[${vp.name}] aria-expanded ${before} → ${open.expanded}`);
    else pass(`[${vp.name}] aria-expanded false → true`);
    if (open.accents !== 1) fail(`[${vp.name}] ${open.accents} accent buttons in the menu — the download must be the only one`);
    else if (open.dlHref !== DL_HREF) fail(`[${vp.name}] the menu's accent button points at ${open.dlHref}`);
    else pass(`[${vp.name}] the download is the menu's one accent button`);
    const m = await page.evaluate(`(${paint.toString()})('#site-menu .btn--accent')`);
    const cr = ratio(parse(m.color), parse(m.bg));
    console.log(`[${vp.name}] menu CTA ${m.color} on ${m.bg} → ${cr.toFixed(2)}:1, visible=${m.visible}`);
    if (!m.visible) fail(`[${vp.name}] the menu's download is off screen`);
    if (cr < 4.5) fail(`[${vp.name}] menu CTA label ${cr.toFixed(2)}:1 < 4.5`);
    else pass(`[${vp.name}] menu CTA label ${cr.toFixed(2)}:1`);
    await page.screenshot({ path: `${OUT}/menu-${vp.name}.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const closed = await page.evaluate(() => ({
      open: document.getElementById('site-menu').open,
      back: document.activeElement?.matches('.site-header [data-menu-open]'),
      expanded: document.querySelector('.site-header [data-menu-open]').getAttribute('aria-expanded'),
    }));
    if (closed.open) fail(`[${vp.name}] Escape did not close the menu`);
    else if (!closed.back) fail(`[${vp.name}] focus did not return to the menu button`);
    else if (closed.expanded !== 'false') fail(`[${vp.name}] aria-expanded stayed ${closed.expanded}`);
    else pass(`[${vp.name}] Escape closes it, focus returns, aria-expanded false`);
  } else {
    const hidden = await page.$eval('.site-header [data-menu-open]', (b) => getComputedStyle(b).display === 'none');
    if (!hidden) fail(`[${vp.name}] the menu button shows beside a full bar`);
    else pass(`[${vp.name}] no menu button beside the full bar`);
    await page.screenshot({ path: `${OUT}/bar-${vp.name}.png` });
  }
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
