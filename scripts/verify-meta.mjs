/* Titles, descriptions, share tags, structured data and /llms.txt, on every
 * published route — checked against what the page itself shows.
 *
 * Per route:
 *   - a title and a description, each unique across the site; the title
 *     within Google's ~600px desktop width (Arial 20px; Liberation Sans has
 *     Arial's metrics) and the description 110–160 characters;
 *   - og:title / og:description equal to them, canonical and og:url equal;
 *   - every JSON-LD block parses, no HTML or entities leaked into it;
 *   - one graph with the Organization, the WebSite and this page's node,
 *     which carries this page's URL, title, description and language;
 *   - on the product pages, the SoftwareApplication, its offers in the
 *     page's currency at the prices its pricing page prints;
 *   - where the page has an FAQ, an FAQPage whose questions are exactly the
 *     questions on the page, in order;
 * and /llms.txt: served, lists every published page, and every link in it on
 * this site answers 200.
 *
 *   ORIGIN=http://127.0.0.1:8412 CHROME=… node scripts/verify-meta.mjs */
import { chromium } from 'playwright';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8412';
const SITE = 'https://gravity-integration.com';
const ROUTES = {
  pl: ['/', '/czym-jest-esb/', '/technologia/', '/integracje/', '/cennik/', '/case-studies/', '/pobieranie/', '/kontakt/', '/kalkulator/', '/polityka-prywatnosci/'],
  en: ['/en/', '/en/what-is-esb/', '/en/technology/', '/en/integrations/', '/en/pricing/', '/en/case-studies/', '/en/download/', '/en/contact/'],
};
const PRODUCT = ['/', '/technologia/', '/integracje/', '/cennik/', '/pobieranie/', '/en/', '/en/technology/', '/en/integrations/', '/en/pricing/', '/en/download/'];
const PRICING = { pl: '/cennik/', en: '/en/pricing/' };
const CURRENCY = { pl: 'PLN', en: 'EUR' };

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log('  FAIL', msg);
  }
};
const norm = (s) => String(s ?? '').replace(/[  ]/g, ' ').replace(/‑/g, '-').replace(/\s+/g, ' ').trim();

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext();
await ctx.addCookies([{ name: 'gi_consent', value: 'denied', url: ORIGIN }]);
const page = await ctx.newPage();

/* the prices each pricing page prints, as numbers */
const printed = {};
for (const [lang, route] of Object.entries(PRICING)) {
  await page.goto(ORIGIN + route, { waitUntil: 'domcontentloaded' });
  printed[lang] = await page.evaluate(() =>
    [...document.querySelectorAll('.pr-price')]
      .map((e) => e.textContent.replace(/[^\d]/g, ''))
      .filter((d) => d !== '')
      .map(Number),
  );
}

const titles = new Map();
const descriptions = new Map();
for (const [lang, routes] of Object.entries(ROUTES)) {
  for (const route of routes) {
    const res = await page.goto(ORIGIN + route, { waitUntil: 'domcontentloaded' });
    ok(res && res.status() === 200, `${route}: HTTP ${res && res.status()}`);
    const h = await page.evaluate(() => {
      const meta = (sel) => document.querySelector(sel)?.getAttribute('content') ?? null;
      const c = document.createElement('canvas').getContext('2d');
      c.font = '20px "Liberation Sans", Arial';
      const title = document.title;
      return {
        lang: document.documentElement.lang,
        title,
        titlePx: Math.round(c.measureText(title).width),
        description: meta('meta[name="description"]'),
        ogTitle: meta('meta[property="og:title"]'),
        ogDescription: meta('meta[property="og:description"]'),
        ogUrl: meta('meta[property="og:url"]'),
        canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
        ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
        faq: [...document.querySelectorAll('details > summary')].map((s) => s.textContent),
      };
    });
    const url = SITE + route;

    ok(h.lang === lang, `${route}: <html lang="${h.lang}">`);
    ok(h.title && h.titlePx <= 600, `${route}: title ${h.titlePx}px "${h.title}"`);
    ok(h.description && h.description.length >= 110 && h.description.length <= 160, `${route}: description ${h.description?.length} chars`);
    ok(!titles.has(h.title), `${route}: title shared with ${titles.get(h.title)}`);
    ok(!descriptions.has(h.description), `${route}: description shared with ${descriptions.get(h.description)}`);
    titles.set(h.title, route);
    descriptions.set(h.description, route);
    ok(h.ogTitle === h.title && h.ogDescription === h.description, `${route}: og:title/description differ from title/description`);
    ok(h.canonical === url && h.ogUrl === url, `${route}: canonical ${h.canonical}, og:url ${h.ogUrl}`);

    /* structured data */
    let blocks = [];
    try {
      blocks = h.ld.map((t) => JSON.parse(t));
    } catch (e) {
      ok(false, `${route}: JSON-LD does not parse: ${e.message}`);
    }
    ok(!h.ld.some((t) => /&nbsp;|&#\d+;|<[a-z/]/i.test(t)), `${route}: HTML or entities in JSON-LD`);
    const graph = blocks.find((b) => b['@graph'])?.['@graph'] ?? [];
    const node = (type) => graph.find((n) => n['@type'] === type);
    const org = node('Organization');
    ok(org && org.legalName === 'Caffeine Minds sp. z o.o.' && org.taxID && org.address?.addressLocality, `${route}: Organization incomplete`);
    ok(node('WebSite')?.publisher?.['@id'] === org?.['@id'], `${route}: WebSite not published by the Organization`);
    const wp = graph.find((n) => n['@id'] === `${url}#webpage`);
    ok(wp, `${route}: no node for this page`);
    if (wp) {
      ok(wp.url === url && wp.name === h.title && wp.description === h.description, `${route}: page node disagrees with the head`);
      ok(wp.inLanguage === (lang === 'en' ? 'en-US' : 'pl-PL'), `${route}: page node language ${wp.inLanguage}`);
    }
    if (route.includes('kontakt') || route.includes('contact')) ok(wp?.['@type'] === 'ContactPage', `${route}: not a ContactPage`);

    const app = node('SoftwareApplication');
    if (PRODUCT.includes(route)) {
      ok(app && wp?.about?.['@id'] === app['@id'], `${route}: product missing or not what the page is about`);
      const offers = app?.offers ?? [];
      ok(offers.length === 3 && offers.every((o) => o.priceCurrency === CURRENCY[lang]), `${route}: offers ${JSON.stringify(offers.map((o) => o.price + ' ' + o.priceCurrency))}`);
      const prices = offers.map((o) => Number(o.price));
      ok(prices.every((p) => printed[lang].includes(p)), `${route}: offer prices ${prices} not all printed on ${PRICING[lang]} (${printed[lang]})`);
      ok(app?.operatingSystem === 'Windows' && app?.featureList?.length >= 3, `${route}: product facts incomplete`);
    } else {
      ok(!app, `${route}: product on a page that is not about it`);
    }

    /* FAQ: the markup asks exactly the questions the page shows */
    const faq = blocks.find((b) => b['@type'] === 'FAQPage');
    if (h.faq.length) {
      const asked = (faq?.mainEntity ?? []).map((q) => norm(q.name));
      ok(JSON.stringify(asked) === JSON.stringify(h.faq.map(norm)), `${route}: FAQPage questions differ from the page's\n    ${asked.join(' | ')}\n    ${h.faq.map(norm).join(' | ')}`);
      ok((faq?.mainEntity ?? []).every((q) => norm(q.acceptedAnswer?.text).length > 20), `${route}: an FAQ answer is empty`);
    } else {
      ok(!faq, `${route}: FAQPage without an FAQ on the page`);
    }
  }
}

/* /llms.txt */
const res = await page.goto(ORIGIN + '/llms.txt');
ok(res && res.status() === 200 && /^text\/plain/.test(res.headers()['content-type'] ?? ''), `/llms.txt: HTTP ${res?.status()} ${res?.headers()['content-type']}`);
const text = (await res.text()) ?? '';
ok(text.startsWith('# gravity.integration\n\n> '), '/llms.txt: not the llms.txt shape (H1, then a blockquote)');
const links = [...text.matchAll(/https:\/\/gravity-integration\.com(\/[^\s)]*)/g)].map((m) => m[1]);
for (const route of [...ROUTES.pl, ...ROUTES.en]) ok(links.includes(route), `/llms.txt: ${route} not listed`);
for (const path of new Set(links.map((l) => l.replace(/[.,;:]+$/, '')))) {
  const r = await page.request.get(ORIGIN + path);
  ok(r.status() === 200, `/llms.txt links ${path}: HTTP ${r.status()}`);
}
ok(!/ |&nbsp;|<[a-z/]/i.test(text), '/llms.txt: HTML or no-break spaces in it');

await browser.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
