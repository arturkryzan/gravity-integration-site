/* Re-verify the previous audit's remaining findings against the current build.
 * Every one is re-measured. A finding is never carried forward as "fixed"
 * because a commit claimed to fix it. */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8414';
const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (r, g, b) => 0.2126 * srgb(r/255) + 0.7152 * srgb(g/255) + 0.0722 * srgb(b/255);
const cr = (a, b) => { const [x, y] = [a, b].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });

/* Composite a possibly-translucent colour down onto its painted ancestry, then
   contrast against that same ground. Reading .color alone is what produced the
   original 22 phantom contrast failures. */
const COMPOSITE = `(el) => {
  const cs = getComputedStyle(el);
  const fg = (cs.color.match(/[\\d.]+/g) || []).map(Number);
  let ground = [255,255,255];
  for (let n = el; n; n = n.parentElement) {
    const b = (getComputedStyle(n).backgroundColor.match(/[\\d.]+/g) || []).map(Number);
    if (b.length >= 3 && (b[3] === undefined || b[3] > 0.9)) { ground = b.slice(0,3); break; }
  }
  const a = fg[3] === undefined ? 1 : fg[3];
  const eff = [0,1,2].map(i => Math.round(fg[i]*a + ground[i]*(1-a)));
  return { raw: cs.color, size: cs.fontSize, weight: cs.fontWeight, eff, ground };
}`;

console.log('P1-1 / P1-2 — the two contrast findings, re-measured with alpha composited\n');
for (const [route, sel, label] of [
  ['/', '.hero-proof, .home-hero .proof, [class*="proof"]', 'hero social-proof line'],
  ['/', '.demo-optional, .demo-form .optional, label .optional, .field-hint', '"(optional)" hint'],
]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(ORIGIN + route, { waitUntil: 'networkidle' });
  const els = await page.$$(sel);
  if (!els.length) { console.log(`  ${label}: selector matched nothing — element renamed or removed`); await page.close(); continue; }
  for (const el of els.slice(0, 3)) {
    const m = await el.evaluate(eval(`(${COMPOSITE})`));
    const ratio = cr(lum(...m.eff), lum(...m.ground));
    const px = parseFloat(m.size);
    const large = px >= 24 || (px >= 18.66 && Number(m.weight) >= 700);
    const need = large ? 3 : 4.5;
    console.log(`  ${label}: ${m.raw} over rgb(${m.ground}) → effective rgb(${m.eff}) = ${ratio.toFixed(2)}:1`
      + ` at ${m.size}/${m.weight} (needs ${need}) ${ratio >= need ? 'PASS' : 'FAIL'}`);
  }
  await page.close();
}

console.log('\nP1-3 / P1-7 — focus indicators on the hamburger and the footer newsletter field\n');
for (const [route, sel, label] of [
  ['/', 'button.hamburger', 'hamburger'],
  ['/', 'footer input[type="email"], .footer input[type="email"]', 'footer newsletter email'],
  ['/kontakt/', 'form input[type="email"]', 'contact email'],
]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(ORIGIN + route, { waitUntil: 'networkidle' });
  const c = await page.$('.gi-consent-accept, .gi-consent-btn');
  if (c) { await c.click(); await page.waitForTimeout(300); }
  const el = await page.$(sel);
  if (!el) { console.log(`  ${label}: NOT PRESENT on ${route}`); await page.close(); continue; }
  await el.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(200);
  const box = await el.evaluate((e) => { const r = e.getBoundingClientRect(); const p = 10;
    return { x: Math.max(0, Math.floor(r.x-p)), y: Math.max(0, Math.floor(r.y-p)),
             width: Math.ceil(r.width+p*2), height: Math.ceil(r.height+p*2) }; });
  const before = await page.screenshot({ clip: box });
  await el.evaluate((e) => { const b = document.createElement('button');
    b.tabIndex = 0; b.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0';
    e.parentElement.insertBefore(b, e); b.focus(); b.dataset.tmpPrev = '1'; });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  const focused = await el.evaluate((e) => document.activeElement === e);
  const after = await page.screenshot({ clip: box });
  await page.evaluate(() => document.querySelector('[data-tmp-prev]')?.remove());
  const A = PNG.sync.read(before), B = PNG.sync.read(after);
  let n = 0, ground = new Map(), ind = null, best = -1;
  for (let i = 0; i < A.data.length; i += 4) {
    const bef = [A.data[i],A.data[i+1],A.data[i+2]], aft = [B.data[i],B.data[i+1],B.data[i+2]];
    if (Math.abs(bef[0]-aft[0])+Math.abs(bef[1]-aft[1])+Math.abs(bef[2]-aft[2]) > 24) n++;
    else ground.set(bef.join(','), (ground.get(bef.join(',')) || 0) + 1);
  }
  const g = ground.size ? [...ground.entries()].sort((a,b)=>b[1]-a[1])[0][0].split(',').map(Number) : [0,0,0];
  const gL = lum(...g);
  for (let i = 0; i < A.data.length; i += 4) {
    const bef = [A.data[i],A.data[i+1],A.data[i+2]], aft = [B.data[i],B.data[i+1],B.data[i+2]];
    if (Math.abs(bef[0]-aft[0])+Math.abs(bef[1]-aft[1])+Math.abs(bef[2]-aft[2]) <= 24) continue;
    const v = Math.abs(lum(...aft) - gL); if (v > best) { best = v; ind = aft; }
  }
  const ratio = ind ? cr(lum(...ind), gL) : 0;
  console.log(`  ${label} @ ${route}: keyboard-focused=${focused}  ${n}px changed`
    + (ind ? `  indicator rgb(${ind}) on rgb(${g}) = ${ratio.toFixed(2)}:1 ${ratio >= 3 ? '(AA ok)' : '(under 3:1)'}` : '  NO INDICATOR'));
  await page.close();
}

console.log('\nP1-5 — accessible names on the five ROI sliders\n');
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${ORIGIN}/kalkulator/`, { waitUntil: 'networkidle' });
  const names = await page.evaluate(() => [...document.querySelectorAll('input[type=range]')].map((r) => {
    const lab = r.labels && r.labels[0];
    const by = r.getAttribute('aria-labelledby');
    return { id: r.id,
      ariaLabel: r.getAttribute('aria-label'),
      labelFor: lab ? lab.textContent.trim().slice(0, 40) : null,
      labelledby: by ? [...document.querySelectorAll('#' + by.split(/\s+/).join(',#'))].map(n=>n.textContent.trim()).join(' ').slice(0,40) : null,
      valuetext: r.getAttribute('aria-valuetext') };
  }));
  for (const n of names) {
    const name = n.ariaLabel || n.labelledby || n.labelFor || '';
    console.log(`  #${n.id}: ${name ? 'NAMED ' + JSON.stringify(name) : 'NO ACCESSIBLE NAME'}`
      + (n.ariaLabel ? ' (aria-label)' : n.labelledby ? ' (aria-labelledby)' : n.labelFor ? ' (<label for>)' : ''));
  }
  await page.close();
}
await browser.close();
