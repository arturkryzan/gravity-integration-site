import { chromium } from 'playwright';
const pages = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
for (const spec of pages) {
  const [name, url] = spec.split('|');
  const p = await ctx.newPage();
  try { await p.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); } catch (e) { console.log('goto warn', name, e.message.slice(0,80)); }
  await p.evaluate(() => document.querySelectorAll('[data-scroll],[data-scroll-opacity]').forEach(el => el.classList.add('is-inview')));
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `/root/shots/${name}.png`, fullPage: true });
  console.log('shot', name);
  await p.close();
}
await browser.close();
