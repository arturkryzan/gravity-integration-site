/* The container's headless Chromium can't reach assets.mailerlite.com
   (ERR_CONNECTION_RESET; curl from the same container is fine, so it's the
   sandbox's egress path, not the code). The endpoint contract was already
   proven for real against this account from a networked browser, so what's
   left to verify is *this* client: the exact request each form builds, and
   how it renders each of the three responses MailerLite can give.

   So: intercept the endpoint, assert the request, and script the reply. */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4321';
const ENDPOINT = '**/assets.mailerlite.com/**';

const FORM = {
  demo: '194146032952542470',
  contact: '194146035162940448',
  newsletter: '194146037587248808',
};

const REPLY = {
  ok: { success: true },
  badEmail: {
    success: false,
    errors: { fields: { email: ['The email field must be a valid email address.'] } },
  },
};

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [];
let fail = 0;

function assert(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) console.log(`       expected: ${expected}\n       actual:   ${actual}`);
}

async function session(mode) {
  const ctx = await browser.newContext({ locale: 'pl-PL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  const seen = [];
  await page.route(ENDPOINT, async (route) => {
    const req = route.request();
    seen.push({
      url: req.url(),
      body: Object.fromEntries(new URLSearchParams(req.postData() || '')),
      ct: (await req.allHeaders())['content-type'],
    });
    if (mode === 'down') return route.abort('failed');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mode === 'badEmail' ? REPLY.badEmail : REPLY.ok),
    });
  });

  const tick = (sel) =>
    page.$eval(sel, (el) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

  return { page, ctx, seen, tick };
}

/* ================= 1. happy path, all three forms ================= */
console.log('\n=== happy path ===');
{
  const { page, ctx, seen, tick } = await session('ok');

  // -- contact
  await page.goto(BASE + '/kontakt/', { waitUntil: 'networkidle' });
  await page.fill('form[data-form="contact"] input[type=email]', 'kontakt@firma.pl');
  await tick('form[data-form="contact"] input[value="Darmowa konsultacja"]');
  await tick('form[data-form="contact"] input[data-ml-consent]');
  await page.click('form[data-form="contact"] .wpcf7-submit');
  await page.waitForFunction(
    () => document.querySelector('form[data-form="contact"]')?.dataset.status === 'sent',
    null, { timeout: 10000 },
  );
  console.log(' contact');
  assert('endpoint form id', seen[0].url.split('/forms/')[1].split('/')[0], FORM.contact);
  assert('content-type', seen[0].ct, 'application/x-www-form-urlencoded;charset=UTF-8');
  assert('fields[email]', seen[0].body['fields[email]'], 'kontakt@firma.pl');
  assert('fields[typ_zapytania]', seen[0].body['fields[typ_zapytania]'], 'Darmowa konsultacja');
  assert('ml-submit', seen[0].body['ml-submit'], '1');
  assert('anticsrf', seen[0].body['anticsrf'], 'true');
  assert('no consent leak', seen[0].body['acceptance-500'], undefined);
  assert(
    'success message',
    await page.textContent('form[data-form="contact"] .wpcf7-response-output'),
    'Dziękujemy — zapytanie do nas dotarło. Odezwiemy się w ciągu jednego dnia roboczego.',
  );
  assert('field cleared', await page.inputValue('form[data-form="contact"] input[type=email]'), '');
  assert(
    'output visible',
    await page.$eval('form[data-form="contact"] .wpcf7-response-output', (el) =>
      getComputedStyle(el).display !== 'none' && !el.hidden),
    true,
  );

  // the radio default must ride along when the user doesn't touch it
  await page.goto(BASE + '/kontakt/', { waitUntil: 'networkidle' });
  await page.fill('form[data-form="contact"] input[type=email]', 'domyslny@firma.pl');
  await tick('form[data-form="contact"] input[data-ml-consent]');
  await page.click('form[data-form="contact"] .wpcf7-submit');
  await page.waitForFunction(
    () => document.querySelector('form[data-form="contact"]')?.dataset.status === 'sent',
    null, { timeout: 10000 },
  );
  assert('default radio sent', seen[1].body['fields[typ_zapytania]'], 'Użytek komercyjny');

  // -- newsletter
  await page.goto(BASE + '/kalkulator/', { waitUntil: 'networkidle' });
  await page.fill('form[data-form="newsletter"] input[type=email]', 'news@firma.pl');
  await tick('form[data-form="newsletter"] input[data-ml-consent]');
  await page.click('form[data-form="newsletter"] .wpcf7-submit');
  await page.waitForFunction(
    () => document.querySelector('form[data-form="newsletter"]')?.dataset.status === 'sent',
    null, { timeout: 10000 },
  );
  console.log(' newsletter');
  assert('endpoint form id', seen[2].url.split('/forms/')[1].split('/')[0], FORM.newsletter);
  assert('fields[email]', seen[2].body['fields[email]'], 'news@firma.pl');
  assert('nothing else', Object.keys(seen[2].body).sort().join(','), 'anticsrf,fields[email],ml-submit');
  assert(
    'success message',
    await page.textContent('form[data-form="newsletter"] .wpcf7-response-output'),
    'Jesteś na liście. Do zobaczenia w skrzynce raz w miesiącu.',
  );

  // -- demo
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200); // clear the fill-time trap
  await page.fill('#demo-your-name', 'Jan Testowy');
  await page.fill('#demo-your-email', 'jan@acme-polska.com.pl');
  await page.fill('#demo-your-phone', '123456789');
  await tick('#demo-consent');
  console.log(' demo');
  assert('phone auto-format', await page.inputValue('#demo-your-phone'), '+48 123 456 789');
  // the company offer inferred from the domain
  await page.click('.demo-fill');
  assert('company from domain', await page.inputValue('#demo-your-company'), 'Acme Polska');

  await page.click('.demo-submit');
  await page.waitForSelector('.demo-done:not([hidden])', { timeout: 10000 });
  const d = seen[3];
  assert('endpoint form id', d.url.split('/forms/')[1].split('/')[0], FORM.demo);
  assert('fields[name]', d.body['fields[name]'], 'Jan Testowy');
  assert('fields[email]', d.body['fields[email]'], 'jan@acme-polska.com.pl');
  assert('fields[company]', d.body['fields[company]'], 'Acme Polska');
  assert('fields[phone]', d.body['fields[phone]'], '+48 123 456 789');
  assert('no honeypot leak', d.body['website_url'], undefined);
  assert('no timestamp leak', d.body['_demo_ts'], undefined);
  assert('done panel shown', await page.isVisible('.demo-done'), true);
  assert('done email', await page.textContent('.demo-done [data-done="email"]'), 'jan@acme-polska.com.pl');
  assert('greets by first name', (await page.textContent('.demo-done-h'))?.trim(), 'Dzięki, Jan.');
  assert('form hidden', await page.getAttribute('form[data-form="demo"]', 'hidden'), '');

  await ctx.close();
}

/* ================= 2. MailerLite rejects the address ================= */
console.log('\n=== rejected address ===');
{
  const { page, ctx, tick } = await session('badEmail');

  await page.goto(BASE + '/kontakt/', { waitUntil: 'networkidle' });
  // passes our own regex, so only the server can reject it
  await page.fill('form[data-form="contact"] input[type=email]', 'ktos@niemadomeny.xx');
  await tick('form[data-form="contact"] input[data-ml-consent]');
  await page.click('form[data-form="contact"] .wpcf7-submit');
  await page.waitForFunction(
    () => document.querySelector('form[data-form="contact"]')?.dataset.status === 'invalid',
    null, { timeout: 10000 },
  );
  console.log(' contact');
  assert(
    'inline tip',
    await page.textContent('form[data-form="contact"] .wpcf7-not-valid-tip'),
    'Ten adres e-mail wygląda na nieprawidłowy. Sprawdź go i spróbuj ponownie.',
  );
  assert('aria-invalid', await page.getAttribute('form[data-form="contact"] input[type=email]', 'aria-invalid'), 'true');
  assert('value kept', await page.inputValue('form[data-form="contact"] input[type=email]'), 'ktos@niemadomeny.xx');
  assert('submit re-enabled', await page.isEnabled('form[data-form="contact"] .wpcf7-submit'), true);

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await page.fill('#demo-your-name', 'Jan Testowy');
  await page.fill('#demo-your-email', 'ktos@niemadomeny.xx');
  await page.fill('#demo-your-company', 'Acme');
  await tick('#demo-consent');
  await page.click('.demo-submit');
  await page.waitForSelector('#demo-your-email-err:not([hidden])', { timeout: 10000 });
  console.log(' demo');
  assert(
    'field-level error',
    await page.textContent('#demo-your-email-err'),
    'Ten adres e-mail wygląda na nieprawidłowy. Sprawdź go i spróbuj ponownie.',
  );
  assert('done panel NOT shown', await page.isVisible('.demo-done'), false);
  assert('form still shown', await page.isVisible('form[data-form="demo"]'), true);
  assert('no form-level error', await page.isVisible('.demo-formerr'), false);

  await ctx.close();
}

/* ================= 3. network down ================= */
console.log('\n=== network failure ===');
{
  const { page, ctx, tick } = await session('down');

  await page.goto(BASE + '/kalkulator/', { waitUntil: 'networkidle' });
  await page.fill('form[data-form="newsletter"] input[type=email]', 'news@firma.pl');
  await tick('form[data-form="newsletter"] input[data-ml-consent]');
  await page.click('form[data-form="newsletter"] .wpcf7-submit');
  await page.waitForFunction(
    () => document.querySelector('form[data-form="newsletter"]')?.dataset.status === 'failed',
    null, { timeout: 10000 },
  );
  console.log(' newsletter');
  assert(
    'fallback message',
    await page.textContent('form[data-form="newsletter"] .wpcf7-response-output'),
    'Nie udało się wysłać formularza. Napisz do nas na contact@caffeine-minds.com — odpowiemy tak samo szybko.',
  );
  assert('value kept', await page.inputValue('form[data-form="newsletter"] input[type=email]'), 'news@firma.pl');
  assert('submit re-enabled', await page.isEnabled('form[data-form="newsletter"] .wpcf7-submit'), true);
  assert('label restored', await page.inputValue('form[data-form="newsletter"] .wpcf7-submit'), 'Zapisz się');

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await page.fill('#demo-your-name', 'Jan Testowy');
  await page.fill('#demo-your-email', 'jan@firma.pl');
  await page.fill('#demo-your-company', 'Acme');
  await tick('#demo-consent');
  await page.click('.demo-submit');
  await page.waitForSelector('.demo-formerr:not([hidden])', { timeout: 10000 });
  console.log(' demo');
  assert(
    'mailto fallback offered',
    await page.$eval('.demo-formerr a', (a) => a.getAttribute('href')),
    'mailto:contact@caffeine-minds.com?subject=Demo%20gravity.integration',
  );
  assert('done panel NOT shown', await page.isVisible('.demo-done'), false);
  assert('button not stuck busy', await page.getAttribute('.demo-submit', 'aria-busy'), null);

  await ctx.close();
}

/* ================= 4. spam traps ================= */
console.log('\n=== spam traps ===');
{
  const { page, ctx, seen, tick } = await session('ok');

  // honeypot filled → success shown, nothing sent
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await page.fill('#demo-your-name', 'Bot');
  await page.fill('#demo-your-email', 'bot@example.com');
  await page.fill('#demo-your-company', 'Bot Co');
  await page.$eval('input[name="website_url"]', (el) => { el.value = 'http://spam.example'; });
  await tick('#demo-consent');
  await page.click('.demo-submit');
  await page.waitForSelector('.demo-done:not([hidden])', { timeout: 10000 });
  await page.waitForTimeout(500);
  assert('honeypot: 0 requests', seen.length, 0);
  assert('honeypot: shows success anyway', await page.isVisible('.demo-done'), true);

  // submitted inside 2s → same. Playwright's own fill/click latency is close
  // enough to the 2s threshold to make a wall-clock race flaky, so re-stamp
  // the form's start time immediately before the click: that is exactly what
  // an instant bot submission looks like, and it tests the branch, not the
  // harness's typing speed.
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.fill('#demo-your-name', 'Bot');
  await page.fill('#demo-your-email', 'bot@example.com');
  await page.fill('#demo-your-company', 'Bot Co');
  await tick('#demo-consent');
  await page.$eval('[data-key="_demo_ts"]', (el) => { el.value = String(Date.now()); });
  await page.click('.demo-submit');
  await page.waitForSelector('.demo-done:not([hidden])', { timeout: 10000 });
  await page.waitForTimeout(500);
  assert('too-fast: 0 requests', seen.length, 0);

  await ctx.close();
}

/* ================= 5. no-JS fallback ================= */
console.log('\n=== no-JS fallback (markup posts natively) ===');
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  const sent = [];
  await page.route(ENDPOINT, async (route) => {
    sent.push({
      url: route.request().url(),
      body: Object.fromEntries(new URLSearchParams(route.request().postData() || '')),
    });
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });

  for (const [path, form, key] of [
    ['/kontakt/', 'contact', FORM.contact],
    ['/kalkulator/', 'newsletter', FORM.newsletter],
    ['/', 'demo', FORM.demo],
  ]) {
    await page.goto(BASE + path);
    const before = sent.length;
    // native constraint validation must block an empty required form
    await page.$eval(`form[data-form="${form}"]`, (f) => f.querySelector('[type=submit]')?.click());
    await page.waitForTimeout(400);
    assert(`${form}: required blocks empty submit`, sent.length, before);

    await page.$eval(`form[data-form="${form}"]`, (f) => {
      f.querySelectorAll('input[required]').forEach((el) => {
        if (el.type === 'checkbox') el.checked = true;
        else if (el.type === 'email') el.value = 'nojs@firma.pl';
        else el.value = 'x';
      });
      f.target = '_self';
      f.querySelector('[type=submit]')?.click();
    });
    await page.waitForTimeout(600);
    assert(`${form}: posts to MailerLite`, sent.length, before + 1);
    if (sent.length > before) {
      const s = sent[sent.length - 1];
      assert(`${form}: correct form id`, s.url.split('/forms/')[1].split('/')[0], key);
      assert(`${form}: carries email`, s.body['fields[email]'], 'nojs@firma.pl');
      assert(`${form}: carries ml-submit`, s.body['ml-submit'], '1');
    }
  }
  await ctx.close();
}

console.log('\n=== js errors ===');
console.log(errors.length ? errors.join('\n') : ' (none)');
console.log(`\n${fail === 0 ? 'ALL ASSERTIONS PASSED' : fail + ' ASSERTION(S) FAILED'}`);

await browser.close();
process.exit(fail === 0 ? 0 : 1);
