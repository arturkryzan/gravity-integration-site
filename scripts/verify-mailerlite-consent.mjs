/* Does the MailerLite pop-up tag actually obey the consent bar?
 *
 * Everything about this feature is a claim about *when* a network request
 * happens, and no amount of reading the built HTML settles it — the snippet is
 * inert text until something calls it, and the interesting question is whether
 * anything does before the visitor has answered. So this watches the wire.
 *
 * Four states, because three of them are ways to get it wrong:
 *
 *   1. Polish page, no answer yet          → no request. This is the promise
 *                                            the cookie banner makes in words.
 *   2. Polish page, "Tylko niezbędne"      → still no request. The failure mode
 *                                            worth guarding: a tag that fires on
 *                                            any interaction rather than on yes.
 *   3. Polish page, "Akceptuję"            → request fires.
 *   4. Polish page, returning with consent → request fires before any click,
 *                                            or people who already said yes
 *                                            silently stop seeing the pop-up.
 *
 * Plus the language gate: an English page with consent granted must stay quiet,
 * because MailerLite scopes the pop-up by hostname and would happily show a
 * Polish pop-up on /en/ if the tag were there to ask.
 *
 * assets.mailerlite.com is unreachable from this container, which does not
 * matter: a request that is attempted is recorded whether or not it resolves,
 * and "was it attempted" is the whole question.
 *
 * Run: CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *      ORIGIN=http://127.0.0.1:8412 node scripts/verify-mailerlite-consent.mjs
 */
import { chromium } from 'playwright';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8412';
const TAG = 'assets.mailerlite.com';

const problems = [];
const note = (msg) => problems.push(msg);

const browser = await chromium.launch({ executablePath: process.env.CHROME });

/* A fresh context per case: consent lives in a cookie, and a leaked cookie
   would turn case 1 into case 4 without saying so. */
async function visit(url, { grant = false, click = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (grant) {
    /* `url` and `path` are mutually exclusive in Playwright's cookie shape —
       the url form derives the path itself. */
    await ctx.addCookies([{ name: 'gi_consent', value: 'granted', url: ORIGIN }]);
  }
  const page = await ctx.newPage();
  const hits = [];
  page.on('request', (r) => {
    if (r.url().includes(TAG)) hits.push(r.url());
  });
  await page.goto(ORIGIN + url, { waitUntil: 'networkidle' });

  if (click) {
    /* The bar reveals itself on a 700ms timer, so it is not clickable the
       instant the page settles. */
    await page.locator(`#gi-consent [data-consent="${click}"]`).click({ timeout: 5000 });
  }

  /* The tag is injected synchronously by the enable function, but the request
     it triggers is async — give the browser a beat to actually issue it before
     concluding that it never did. A false "clean" here is the expensive kind. */
  await page.waitForTimeout(1200);
  await ctx.close();
  return hits;
}

const cases = [
  ['/', {}, false, 'Polish page, no answer yet'],
  ['/', { click: 'denied' }, false, 'Polish page, "Tylko niezbędne"'],
  ['/', { click: 'granted' }, true, 'Polish page, "Akceptuję"'],
  ['/', { grant: true }, true, 'Polish page, returning visitor with consent'],
  ['/cennik/', { grant: true }, true, 'Polish inner page, returning with consent'],
  ['/en/', { grant: true }, false, 'English page, consent granted'],
  ['/en/pricing/', { click: 'granted' }, false, 'English inner page, "Accept"'],
];

for (const [url, opts, shouldFire, label] of cases) {
  const hits = await visit(url, opts);
  const fired = hits.length > 0;
  if (fired !== shouldFire) {
    note(
      `${label} (${url}) — ${fired ? 'loaded' : 'did not load'} ${TAG}, expected ${shouldFire ? 'it to load' : 'silence'}`,
    );
  } else {
    console.log(`  ok  ${label} → ${fired ? 'tag loads' : 'no request'}`);
  }
}

/* Withdrawal has to mean something. Reopening the bar from the footer link
   clears the answer; if the pop-up's own state survived that, the next visit
   would still be inside its "not for another day" window — consent withdrawn,
   consequences retained. */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([
    { name: 'gi_consent', value: 'granted', url: ORIGIN },
    { name: 'ml_test_state', value: 'seen', url: ORIGIN },
  ]);
  const page = await ctx.newPage();
  await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    window.localStorage.setItem('ml_popup_shown', '1');
    window.giOpenConsent();
  });
  await page.waitForTimeout(300);
  const left = await page.evaluate(() => ({
    cookie: /(?:^|;\s*)ml_test_state=/.test(document.cookie),
    ls: window.localStorage.getItem('ml_popup_shown'),
    consent: /(?:^|;\s*)gi_consent=/.test(document.cookie),
  }));
  if (left.cookie) note('withdrawal left an ml_ cookie behind');
  if (left.ls !== null) note('withdrawal left MailerLite localStorage behind');
  if (left.consent) note('withdrawal did not clear gi_consent');
  if (!left.cookie && left.ls === null && !left.consent) {
    console.log('  ok  withdrawal clears MailerLite cookie, localStorage and the answer');
  }
  await ctx.close();
}

await browser.close();

console.log(
  problems.length
    ? '\n' + problems.join('\n')
    : `\nclean — tag stays silent until "Akceptuję", never loads on /en/, and withdrawal clears it`,
);
process.exit(problems.length ? 1 : 0);
