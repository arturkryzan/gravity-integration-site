import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4321';
const URL = process.env.PATH_ ?? '/case-studies/';
const TAG = process.env.TAG ?? 'before';

const browser = await chromium.launch({ executablePath: process.env.CHROME });
for (const [name, w, h] of [
  ['desk', 1440, 900],
  ['tab', 768, 1024],
  ['mob', 375, 812],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.addInitScript(() => {
    document.cookie = 'gi_consent=denied;path=/';
  });
  await page.goto(BASE + URL, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);
  // scroll through to trigger any reveal observers
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/tmp/cs-${TAG}-${name}.png`, fullPage: true });
  const hh = await page.evaluate(() => document.body.scrollHeight);
  console.log(name, w + 'x' + h, 'docHeight=' + hh);
  await page.close();
}
await browser.close();
