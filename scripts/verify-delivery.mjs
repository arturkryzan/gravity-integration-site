/* Click through the ZIP, not the build.
 *
 * The last delivery of this site failed on exactly one point: "the preview
 * does not contain en". The build was fine. What reached the user wasn't.
 * Verifying dist/ would not have caught that, because dist/ was never the
 * thing that was wrong — the packaging step was.
 *
 * So this walks the extracted archive: it starts at the Polish home page,
 * follows the language switcher across, and from there visits every English
 * URL the way a person would. It asserts what a person would notice — the
 * page loaded, it's in English, it has a body, and the switcher points back
 * at the page you came from rather than dumping you on the home page.
 *
 * Run: CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *      ORIGIN=http://127.0.0.1:8414 node scripts/verify-delivery.mjs
 */
import { chromium } from 'playwright';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8414';

/* [english url, the polish url its switcher must point back to] */
const PAIRS = [
  ['/en/', '/'],
  ['/en/what-is-esb/', '/czym-jest-esb/'],
  ['/en/technology/', '/technologia/'],
  ['/en/integrations/', '/integracje/'],
  ['/en/pricing/', '/cennik/'],
  ['/en/roi-calculator/', '/kalkulator/'],
  ['/en/case-studies/', '/case-studies/'],
  ['/en/contact/', '/kontakt/'],
  ['/en/download/', '/pobieranie/'],
];

const problems = [];
const note = (url, msg) => problems.push(`${url}  ${msg}`);

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

/* Step one is the one that actually failed last time: can a visitor who
   starts on the Polish home page reach English at all, without knowing the
   URL? If the switcher isn't there, nothing else matters. */
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' });
const entry = await page.locator('footer a.gi-lang').first().getAttribute('href');
if (entry !== '/en/') note('/', `footer switcher points at ${entry ?? 'nothing'}, expected /en/`);

for (const [url, back] of PAIRS) {
  const res = await page.goto(ORIGIN + url, { waitUntil: 'networkidle' });
  if (!res || res.status() !== 200) {
    note(url, `HTTP ${res ? res.status() : 'no response'}`);
    continue;
  }

  const lang = await page.locator('html').getAttribute('lang');
  if (lang !== 'en') note(url, `html lang="${lang}", expected "en"`);

  /* A page that renders its shell but drops its content still "loads". The
     h1 and a word count are the cheapest proof that something is in it. */
  const h1 = (await page.locator('h1').first().textContent().catch(() => null))?.trim();
  if (!h1) note(url, 'no h1');
  const words = await page.evaluate(() => document.body.innerText.trim().split(/\s+/).length);
  if (words < 120) note(url, `only ${words} words of body text`);

  /* Polish groups thousands with a non-breaking space; English uses a comma.
     But NBSP is legitimate in English too — "sp. z o.o.", "2,999 PLN",
     "Book the demo →", "KRS: 0000500700" all use one to stop a bad line
     break, and an earlier version of this check flagged forty of those to
     find one real bug. Digit-NBSP-digit is the shape that can only be Polish
     grouping, so that is what it looks for now: it found "1 500" on the ROI
     calculator, and it says nothing about the forty it should never have
     mentioned. A check that cries wolf is a check nobody reads. */
  const grouped = await page.evaluate(() =>
    document.body.innerText.match(/\d\u00a0\d[\d\u00a0]*/g) || []);
  for (const hit of grouped.slice(0, 3)) note(url, `Polish thousands grouping left in: "${hit}"`);

  const backHref = await page.locator('footer a.gi-lang').first().getAttribute('href');
  if (backHref !== back) note(url, `switcher returns to ${backHref ?? 'nothing'}, expected ${back}`);

  /* Untranslated copy is the failure that looks like success — the page is
     there, it just isn't English. Polish diacritics in visible text are the
     giveaway, minus the proper nouns that stay Polish on purpose. */
  const stray = await page.evaluate(() => {
    /* Proper nouns stay Polish by policy — company names, product names,
       client names, place names. Every entry here was a hit that turned out
       to be correct; the list grew by triage, not by guessing in advance. */
    const KEEP = /Bielsko|Biała|Graffiti|Caffeine|Kryzan|Śląsk|Pozna[nń]|POZNA[NŃ]|Wrocław|Kraków|Gdańsk|Łódź|Prestiż|Trzebiatów|sp\. z o\.o\./i;
    return document.body.innerText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(l) && !KEEP.test(l));
  });
  for (const line of stray.slice(0, 4)) note(url, `Polish text left in: "${line.slice(0, 90)}"`);
}

/* The English 404 is a plain file, not a route — the server maps it. Over a
   dumb static server it can only be checked directly, which is still worth
   doing: it proves the file survived packaging and renders. */
const r404 = await page.goto(ORIGIN + '/en/404.html', { waitUntil: 'networkidle' });
if (!r404 || r404.status() !== 200) note('/en/404.html', 'missing from the archive');
else if ((await page.locator('html').getAttribute('lang')) !== 'en') note('/en/404.html', 'not in English');

await browser.close();

console.log(problems.length ? problems.join('\n') : `clean — ${PAIRS.length} English pages, switcher round-trips, 404 present`);
process.exit(problems.length ? 1 : 0);
