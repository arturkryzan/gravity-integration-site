/* Cookie-consent behaviour check.
   The container's browser can't reach googletagmanager.com, so the assertion
   that matters — "is a request even attempted?" — is made by intercepting the
   route and counting, which is exactly what we want to measure anyway. */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4321';
/* A regex, not a glob: `**​/googletagmanager.com/**` looks right and matches
   nothing, because the real host is `www.googletagmanager.com` and `**​/`
   demands a slash immediately before the literal. */
const GTM = /googletagmanager\.com/;

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

/** fresh context + a counter of every GTM request it attempts */
async function fresh(opts = {}) {
  const ctx = await browser.newContext({ locale: 'pl-PL', ...opts });
  const hits = [];
  await ctx.route(GTM, async (route) => {
    hits.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  const page = await ctx.newPage();
  return { ctx, page, hits };
}

const cookies = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      document.cookie
        .split(';')
        .filter(Boolean)
        .map((c) => c.split('=').map((s) => s.trim())),
    ),
  );

/* ================= 1. first visit ================= */
console.log('\n=== first visit ===');
{
  const { ctx, page, hits } = await fresh();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);

  assert('no analytics before a decision', hits.length, 0);
  assert('banner shown', await page.isVisible('#gi-consent'), true);
  assert('accept present', await page.isVisible('.gi-consent-accept'), true);
  assert('reject present', await page.isVisible('.gi-consent-reject'), true);

  const box = (s) => page.locator(s).boundingBox();
  const a = await box('.gi-consent-accept');
  const r = await box('.gi-consent-reject');
  assert('reject is same height as accept', Math.round(r.height), Math.round(a.height));
  assert('reject is same width as accept', Math.round(r.width), Math.round(a.width));
  assert('both clear the 44px target floor', a.height >= 44 && r.height >= 44, true);

  assert(
    'consent-mode default is denied',
    await page.evaluate(() => {
      const d = window.dataLayer.find((x) => x[0] === 'consent' && x[1] === 'default');
      return d && d[2].analytics_storage;
    }),
    'denied',
  );

  /* The Ads tag is the reason the banner names advertising, so the default has
     to deny all three ad signals, not just analytics_storage. */
  assert(
    'ad signals default to denied',
    await page.evaluate(() => {
      const d = window.dataLayer.find((x) => x[0] === 'consent' && x[1] === 'default')?.[2];
      return d && [d.ad_storage, d.ad_user_data, d.ad_personalization];
    }),
    ['denied', 'denied', 'denied'],
  );

  assert(
    'the copy names advertising, not just statistics',
    /reklam/i.test(await page.textContent('#gi-consent-body')),
    true,
  );

  assert(
    'does not overlap the announcement bar',
    await page.evaluate(() => {
      const bar = document.getElementById('gi-announce-bar').getBoundingClientRect();
      const con = document.getElementById('gi-consent').getBoundingClientRect();
      return con.top >= bar.bottom;
    }),
    true,
  );

  assert('links to the policy anchor', await page.getAttribute('#gi-consent a', 'href'),
    '/polityka-prywatnosci/#cookies');

  await ctx.close();
}

/* ================= 2. reject ================= */
console.log('\n=== "Tylko niezbędne" ===');
{
  const { ctx, page, hits } = await fresh();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.click('.gi-consent-reject');
  await page.waitForTimeout(900);

  assert('banner dismissed', await page.isVisible('#gi-consent'), false);
  assert('still no analytics', hits.length, 0);
  assert('choice remembered', (await cookies(page)).gi_consent, 'denied');

  // ...and it stays rejected across a reload
  await page.goto(BASE + '/kontakt/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  assert('no analytics on the next page', hits.length, 0);
  assert('banner does not reappear', await page.isVisible('#gi-consent'), false);

  await ctx.close();
}

/* ================= 3. accept ================= */
console.log('\n=== "Akceptuję" ===');
{
  const { ctx, page, hits } = await fresh();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  assert('nothing loaded yet', hits.length, 0);

  await page.click('.gi-consent-accept');
  await page.waitForTimeout(900);

  assert('banner dismissed', await page.isVisible('#gi-consent'), false);
  assert('choice remembered', (await cookies(page)).gi_consent, 'granted');
  assert('GA4 loaded exactly once', hits.length, 1);
  assert('correct property', hits[0].includes('G-EWVWPJGYVM'), true);
  assert(
    'consent updated to granted',
    await page.evaluate(() => {
      const u = window.dataLayer.filter((x) => x[0] === 'consent' && x[1] === 'update').pop();
      return u && u[2].analytics_storage;
    }),
    'granted',
  );
  assert(
    'ad signals updated to granted',
    await page.evaluate(() => {
      const u = window.dataLayer.filter((x) => x[0] === 'consent' && x[1] === 'update').pop()?.[2];
      return u && [u.ad_storage, u.ad_user_data, u.ad_personalization];
    }),
    ['granted', 'granted', 'granted'],
  );

  /* Both properties ride one gtag.js request — that is the whole reason the
     single "GA4 loaded exactly once" assertion above is still correct with a
     second tag in play. Assert the configs, not a second network hit. */
  assert(
    'both tag ids configured off one library',
    await page.evaluate(() =>
      window.dataLayer.filter((x) => x[0] === 'config').map((x) => x[1]).sort(),
    ),
    ['AW-11029031415', 'G-EWVWPJGYVM'],
  );

  // return visit: loads immediately, no banner
  await page.goto(BASE + '/technologia/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  assert('return visit loads GA4', hits.length, 2);
  assert('return visit shows no banner', await page.isVisible('#gi-consent'), false);

  await ctx.close();
}

/* ================= 4. withdrawing ================= */
console.log('\n=== withdrawal via the footer ===');
{
  const { ctx, page, hits } = await fresh();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.click('.gi-consent-accept');
  await page.waitForTimeout(600);
  // plant the cookies the real tags would — `_gcl*` is the Ads click-id family
  await page.evaluate(() => {
    document.cookie = '_ga=GA1.1.123.456;path=/';
    document.cookie = '_ga_EWVWPJGYVM=GS1.1.789;path=/';
    document.cookie = '_gcl_au=1.1.999.888;path=/';
  });
  assert('GA cookies present', '_ga' in (await cookies(page)), true);
  assert('Ads cookie present', '_gcl_au' in (await cookies(page)), true);

  assert('footer control is visible', await page.isVisible('.gi-consent-link'), true);
  await page.click('.gi-consent-link');
  await page.waitForTimeout(600);

  assert('banner reopened', await page.isVisible('#gi-consent'), true);
  const c = await cookies(page);
  assert('stored choice cleared', c.gi_consent, undefined);
  assert('_ga cleared', c._ga, undefined);
  assert('_ga_* cleared', c._ga_EWVWPJGYVM, undefined);
  assert('_gcl_au cleared', c._gcl_au, undefined);
  assert(
    'consent revoked in dataLayer',
    await page.evaluate(() => {
      const u = window.dataLayer.filter((x) => x[0] === 'consent' && x[1] === 'update').pop();
      return u && u[2].analytics_storage;
    }),
    'denied',
  );
  assert(
    'ad signals revoked in dataLayer',
    await page.evaluate(() => {
      const u = window.dataLayer.filter((x) => x[0] === 'consent' && x[1] === 'update').pop()?.[2];
      return u && [u.ad_storage, u.ad_user_data, u.ad_personalization];
    }),
    ['denied', 'denied', 'denied'],
  );
  assert('focus moved into the banner', await page.evaluate(
    () => document.activeElement?.className.includes('gi-consent-btn')), true);
  assert('no extra GA load on reopen', hits.length, 1);

  await ctx.close();
}

/* ================= 5. no JS ================= */
console.log('\n=== JS off ===');
{
  const { ctx, page, hits } = await fresh({ javaScriptEnabled: false });
  await page.goto(BASE + '/');
  await page.waitForTimeout(600);
  assert('no analytics without JS', hits.length, 0);
  assert('no banner without JS', await page.isVisible('#gi-consent'), false);
  assert('no dead footer control', await page.isVisible('.gi-consent-link'), false);
  await ctx.close();
}

/* ================= 6. mobile + reduced motion ================= */
console.log('\n=== 375px, reduced motion ===');
{
  const { ctx, page } = await fresh({
    viewport: { width: 375, height: 812 },
    reducedMotion: 'reduce',
  });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  assert('banner shown', await page.isVisible('#gi-consent'), true);

  const a = await page.locator('.gi-consent-accept').boundingBox();
  const r = await page.locator('.gi-consent-reject').boundingBox();
  assert('both buttons still 44px+', a.height >= 44 && r.height >= 44, true);
  assert('buttons fit the viewport', a.x >= 0 && r.x + r.width <= 375, true);
  assert(
    'no horizontal overflow',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  assert(
    'banner is not taller than a third of the screen',
    (await page.locator('#gi-consent').boundingBox()).height < 812 / 3,
    true,
  );
  await page.click('.gi-consent-reject');
  await page.waitForTimeout(120);
  assert('dismisses instantly with reduced motion', await page.isVisible('#gi-consent'), false);
  await ctx.close();
}

/* ================= 7. lead events ================= */
/* WordPress fired gtag('event','generate_lead') on wpcf7mailsent. The rebuild
   only pushed to dataLayer, and with no GTM container on the site nothing was
   consuming those pushes — GA4 would have recorded zero leads, which in turn
   breaks any Ads conversion imported from that event. These assertions are the
   regression net for that. */
console.log('\n=== generate_lead ===');
{
  const { ctx, page, hits } = await fresh();
  await ctx.route(/assets\.mailerlite\.com/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    }),
  );
  await page.goto(BASE + '/technologia/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.click('.gi-consent-accept');
  await page.waitForTimeout(600);
  assert('tag loaded before the submission', hits.length, 1);

  await page.fill('form[data-form="newsletter"] input[type="email"]', 'lead-test@example.com');
  // the theme visually hides checkboxes, so click() can't reach them
  await page.$eval('form[data-form="newsletter"] input[data-ml-consent]', (el) => {
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('form[data-form="newsletter"] .wpcf7-submit');
  await page.waitForTimeout(900);

  assert(
    'the submission succeeded',
    await page.getAttribute('form[data-form="newsletter"]', 'data-status'),
    'sent',
  );

  const lead = await page.evaluate(() =>
    window.dataLayer.filter((x) => x[0] === 'event' && x[1] === 'generate_lead').map((x) => x[2]),
  );
  assert('generate_lead fired exactly once', lead.length, 1);
  assert('addressed to the GA4 property', lead[0]?.send_to, 'G-EWVWPJGYVM');
  assert('carries a value', lead[0]?.value, 1);
  assert(
    'the surface-specific dataLayer event still fires',
    await page.evaluate(() =>
      window.dataLayer.some((x) => x && x.event === 'newsletter_subscribed'),
    ),
    true,
  );

  await ctx.close();
}

/* ...and refusing consent must not turn into silent measurement. The gtag shim
   always exists, so the call is made; what matters is that nothing was ever
   loaded to receive it. */
{
  const { ctx, page, hits } = await fresh();
  await ctx.route(/assets\.mailerlite\.com/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    }),
  );
  await page.goto(BASE + '/technologia/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.click('.gi-consent-reject');
  await page.waitForTimeout(400);

  await page.fill('form[data-form="newsletter"] input[type="email"]', 'lead-test2@example.com');
  await page.$eval('form[data-form="newsletter"] input[data-ml-consent]', (el) => {
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('form[data-form="newsletter"] .wpcf7-submit');
  await page.waitForTimeout(900);

  assert(
    'the lead still reaches MailerLite',
    await page.getAttribute('form[data-form="newsletter"]', 'data-status'),
    'sent',
  );
  assert('but no tag was ever loaded to receive the event', hits.length, 0);

  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  fails.forEach((f) => console.log(' ✗', f));
  process.exit(1);
}
