import { chromium } from 'playwright';

const BASE = process.env.ORIGIN || 'http://127.0.0.1:4321';
const EXEC = process.env.CHROME;
const STAMP = Date.now().toString(36);
const mail = (tag) => `artur.kryzan+ml-${tag}-${STAMP}@me.com`;

const out = [];
const log = (...a) => { console.log(...a); out.push(a.join(' ')); };

const browser = await chromium.launch({ executablePath: EXEC });
const ctx = await browser.newContext({ locale: 'pl-PL' });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const posts = [];
page.on('request', (r) => {
  if (r.url().includes('assets.mailerlite.com')) posts.push({ url: r.url(), body: r.postData() });
});

/* The theme hides the real radio/checkbox inputs off-canvas and styles the
   label instead, so Playwright can't click them. Set state directly and fire
   the same event a click would. */
const tick = (sel) => page.$eval(sel, (el) => {
  el.checked = true;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

/* ---------- 1. CONTACT ---------- */
log('\n===== /kontakt/ =====');
await page.goto(BASE + '/kontakt/', { waitUntil: 'networkidle' });

// a) submit with nothing filled — expect an inline tip, no network call
await page.click('form[data-form="contact"] .form-submit');
await page.waitForTimeout(300);
log('empty-email tip :', await page.textContent('form[data-form="contact"] .form-tip').catch(() => '(none)'));
log('requests so far :', posts.length);

// b) valid email, consent unchecked — expect the consent message in the output
const contactMail = mail('contact');
await page.fill('form[data-form="contact"] input[type=email]', contactMail);
await page.click('form[data-form="contact"] .form-submit');
await page.waitForTimeout(300);
log('no-consent msg  :', await page.textContent('form[data-form="contact"] .form-output'));
log('requests so far :', posts.length);

// c) full, valid submission
await tick('form[data-form="contact"] input[value="Darmowa konsultacja"]');
await tick('form[data-form="contact"] input[data-ml-consent]');
await page.click('form[data-form="contact"] .form-submit');
await page.waitForFunction(
  () => document.querySelector('form[data-form="contact"]')?.dataset.status !== 'submitting',
  null, { timeout: 20000 },
);
await page.waitForTimeout(500);
log('status          :', await page.getAttribute('form[data-form="contact"]', 'data-status'));
log('output          :', await page.textContent('form[data-form="contact"] .form-output'));
log('email reset     :', JSON.stringify(await page.inputValue('form[data-form="contact"] input[type=email]')));
log('submitted email :', contactMail);

/* ---------- 2. NEWSLETTER ---------- */
log('\n===== /kalkulator/ (newsletter) =====');
await page.goto(BASE + '/kalkulator/', { waitUntil: 'networkidle' });
const newsMail = mail('news');
await page.fill('form[data-form="newsletter"] input[type=email]', newsMail);
await tick('form[data-form="newsletter"] input[data-ml-consent]');
await page.click('form[data-form="newsletter"] .form-submit');
await page.waitForFunction(
  () => document.querySelector('form[data-form="newsletter"]')?.dataset.status !== 'submitting',
  null, { timeout: 20000 },
);
await page.waitForTimeout(500);
log('status          :', await page.getAttribute('form[data-form="newsletter"]', 'data-status'));
log('output          :', await page.textContent('form[data-form="newsletter"] .form-output'));
log('submitted email :', newsMail);

/* ---------- 3. DEMO ---------- */
log('\n===== / (demo) =====');
await page.goto(BASE + '/', { waitUntil: 'networkidle' });

// the fill-time trap needs >2s between init and submit — a real human clears
// this trivially, Playwright does not
await page.waitForTimeout(2500);

const demoMail = mail('demo');
await page.fill('#demo-your-name', 'Jan Testowy');
await page.fill('#demo-your-email', demoMail);
await page.fill('#demo-your-company', 'Acme Testy');
await page.fill('#demo-your-phone', '123456789');
await tick('#demo-consent');
log('phone formatted :', JSON.stringify(await page.inputValue('#demo-your-phone')));

await page.click('.demo-submit');
await page.waitForSelector('.demo-done:not([hidden])', { timeout: 20000 });
log('done heading    :', (await page.textContent('.demo-done-h'))?.trim());
log('done email      :', await page.textContent('.demo-done [data-done="email"]'));
log('form hidden     :', await page.getAttribute('form[data-form="demo"]', 'hidden'));
log('submitted email :', demoMail);

/* ---------- 4. honeypot ---------- */
log('\n===== honeypot (must NOT reach MailerLite) =====');
const before = posts.length;
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.fill('#demo-your-name', 'Bot Bot');
await page.fill('#demo-your-email', 'bot@example.com');
await page.fill('#demo-your-company', 'Bot Co');
await page.evaluate(() => {
  document.querySelector('input[name="website_url"]').value = 'http://spam.example';
});
await tick('#demo-consent');
await page.click('.demo-submit');
await page.waitForSelector('.demo-done:not([hidden])', { timeout: 5000 });
await page.waitForTimeout(800);
log('shows success   :', true);
log('new ML requests :', posts.length - before, '(expected 0)');

log('\n===== requests =====');
posts.forEach((p) => log(' →', p.url.split('/forms/')[1], '|', decodeURIComponent(p.body || '')));
log('\n===== js errors =====');
log(errors.length ? errors.join('\n') : '(none)');

await browser.close();
