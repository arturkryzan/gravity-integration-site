/* The gated-download Ads conversion, verified end to end.
 *
 * What must be true after DownloadPage's success path calls
 * trackDownloadConversion():
 *
 *   1. With `adsDownloadConversion` unset (the shipped default), a successful
 *      download-form submit fires generate_lead exactly once and NO `conversion`
 *      event — the empty-config guard, not an accident.
 *   2. With a send_to value present, the same submit fires exactly one
 *      `conversion` event addressed at that value, and generate_lead still
 *      fires exactly once — the two channels stay separate.
 *   3. The tripped anti-spam path (submit under 2s) shows success but fires
 *      NEITHER event — a bot must not become a paid conversion.
 *
 * MailerLite is stubbed (`{"success":true}`), so nothing is ever written to the
 * real account; googletagmanager.com is stubbed the same way consent.mjs does
 * it. The events are read from `window.dataLayer`, which is where the gtag shim
 * queues them — the same place the real tag reads them from.
 *
 *   ORIGIN=http://127.0.0.1:8412 node scripts/verify-ads-conversion.mjs
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.ORIGIN || 'http://127.0.0.1:8412';
const GTM = /googletagmanager\.com/;
const ML = /assets\.mailerlite\.com/;
const TEST_SEND_TO = 'AW-11029031415/TESTLABEL';

/* The expected send_to comes from site.json itself, so this harness states the
   truth in either era: before the conversion action existed the value was ""
   and scenario 1 asserted the no-op guard; now it asserts the real label. */
const CONFIGURED = JSON.parse(
  readFileSync(new URL('../src/data/site.json', import.meta.url), 'utf8'),
).adsDownloadConversion;

let pass = 0;
const fails = [];
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log('  ok  ', name);
  } else {
    fails.push(name);
    console.log('  FAIL', name, '\n       expected:', expected, '\n       actual:  ', actual);
  }
}

const browser = await chromium.launch({ executablePath: process.env.CHROME });

async function fresh() {
  const ctx = await browser.newContext({ locale: 'pl-PL' });
  await ctx.route(GTM, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  );
  /* Count only subscribe POSTs. The same host also serves universal.js — the
     consent-gated pop-up script Site.astro loads on accept on Polish pages —
     and counting that GET would make "nothing sent to MailerLite" unfailable
     to pass. Everything else from the host is stubbed to an empty script. */
  const mlHits = [];
  await ctx.route(ML, (route) => {
    const req = route.request();
    if (req.method() === 'POST' && req.url().includes('/subscribe')) {
      mlHits.push(req.url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: '{"success":true}',
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  const page = await ctx.newPage();
  return { ctx, page, mlHits };
}

/* dataLayer entries are `arguments` objects — array-likes serialised as
   {"0":"event","1":"generate_lead","2":{…}} — so read them positionally. */
const events = (page, name) =>
  page.evaluate(
    (n) =>
      (window.dataLayer || [])
        .filter((x) => x[0] === 'event' && x[1] === n)
        .map((x) => x[2] || null),
    name,
  );

async function submitDownloadForm(page, { patient, sendTo }) {
  await page.goto(BASE + '/pobieranie/', { waitUntil: 'networkidle' });
  /* The label is injected after load, not via addInitScript: Site.astro's
     inline script assigns `window.giAdsDownloadTo = adsDl || ''` at parse time,
     which would overwrite anything an init script planted. The handler reads
     the value at submit time, so setting it here exercises the real path. */
  if (sendTo) await page.evaluate((v) => { window.giAdsDownloadTo = v; }, sendTo);
  await page.click('.gi-consent-accept');
  await page.fill('#dl-email', 'probe@firma-testowa.pl');
  await page.fill('#dl-company', 'Firma Testowa');
  await page.check('#dl-consent');
  if (patient) {
    /* The anti-spam trap rejects anything under 2s from page load. */
    await page.waitForTimeout(2300);
  }
  await page.click('.dl-submit');
  await page.waitForSelector('.dl-done[data-in]', { timeout: 5000 });
  await page.waitForTimeout(300);
}

/* ============ 1. the build as configured in site.json ============ */
console.log(`\n=== site.json label: ${JSON.stringify(CONFIGURED)} ===`);
{
  const { ctx, page, mlHits } = await fresh();
  await submitDownloadForm(page, { patient: true });

  assert('MailerLite got the submission', mlHits.length >= 1, true);
  assert('build carries the configured send_to', await page.evaluate(() => window.giAdsDownloadTo), CONFIGURED);
  const conv = await events(page, 'conversion');
  const lead = await events(page, 'generate_lead');
  if (CONFIGURED) {
    assert('conversion fired exactly once', conv.length, 1);
    assert('addressed at the download conversion action', conv[0]?.send_to, CONFIGURED);
  } else {
    assert('no conversion event without a label', conv.length, 0);
  }
  assert('generate_lead fired exactly once', lead.length, 1);
  assert('generate_lead addressed at GA4', lead[0]?.send_to, 'G-EWVWPJGYVM');
  await ctx.close();
}

/* ============ 2. the empty-config guard stays honest ============ */
console.log('\n=== empty label → no conversion (guard) ===');
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + '/pobieranie/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { window.giAdsDownloadTo = ''; });
  await page.click('.gi-consent-accept');
  await page.fill('#dl-email', 'probe@firma-testowa.pl');
  await page.fill('#dl-company', 'Firma Testowa');
  await page.check('#dl-consent');
  await page.waitForTimeout(2300);
  await page.click('.dl-submit');
  await page.waitForSelector('.dl-done[data-in]', { timeout: 5000 });
  await page.waitForTimeout(300);

  assert('generate_lead fired exactly once', (await events(page, 'generate_lead')).length, 1);
  assert('no conversion event without a label', (await events(page, 'conversion')).length, 0);
  await ctx.close();
}

/* ============ 3. anti-spam path counts nothing ============ */
console.log('\n=== tripped anti-spam (fast submit) ===');
{
  const { ctx, page, mlHits } = await fresh();
  await submitDownloadForm(page, { patient: false, sendTo: TEST_SEND_TO });

  assert('success panel shown anyway', await page.isVisible('.dl-done'), true);
  assert('nothing sent to MailerLite', mlHits.length, 0);
  assert('no generate_lead', (await events(page, 'generate_lead')).length, 0);
  assert('no conversion', (await events(page, 'conversion')).length, 0);
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
