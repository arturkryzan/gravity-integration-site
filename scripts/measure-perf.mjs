/* Per-route weight and Core Web Vitals, measured against a served dist/.
 *
 * The audit's page-weight numbers came from summing the assets a route
 * references. That over-counts anything the browser never actually requests
 * (a `srcset` candidate it did not pick, an image below the fold that lazy
 * loading defers past the load event) and under-counts nothing. So the number
 * this script reports is smaller than the audit's by construction, and the
 * two are not directly comparable — what IS comparable is this script's own
 * before and after, which is why it writes a JSON file rather than printing
 * a verdict.
 *
 * Bytes are counted from `encodedDataLength` on Network.loadingFinished via
 * CDP, not from Content-Length: that is the number that crosses the wire,
 * after compression, including headers. python3 -m http.server does not gzip,
 * so text assets read at their raw size here — deliberately, since the real
 * server's mod_deflate config is not this script's to assume. Images and
 * video are already compressed, so for them the two agree.
 *
 * LCP and CLS come from PerformanceObserver, read after a settle window. CLS
 * needs the window because layout shifts arrive late — a font swap or a lazy
 * image landing without reserved space both shift after load.
 *
 * Run: CHROME=… ORIGIN=http://127.0.0.1:8600 node scripts/measure-perf.mjs out.json
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8600';
const OUT = process.argv[2] || '/tmp/perf.json';

const ROUTES = [
  '/', '/case-studies/', '/cennik/', '/czym-jest-esb/', '/integracje/',
  '/kalkulator/', '/kontakt/', '/pobieranie/', '/polityka-prywatnosci/',
  '/technologia/',
  '/en/', '/en/case-studies/', '/en/contact/', '/en/download/',
  '/en/integrations/', '/en/pricing/', '/en/technology/', '/en/what-is-esb/',
];

/* Reading vitals cannot wait for `load` alone: LCP is only final once the
   browser stops finding larger candidates, and CLS accumulates for as long as
   things move. 2.5s of quiet after load is the settle window used throughout. */
const SETTLE = 2500;

const kind = (url, type) => {
  if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url)) return 'image';
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return 'video';
  if (/\.(woff2?|ttf|otf)(\?|$)/i.test(url)) return 'font';
  if (/\.css(\?|$)/i.test(url)) return 'css';
  if (/\.m?js(\?|$)/i.test(url)) return 'js';
  if (type === 'Document') return 'html';
  return 'other';
};

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const results = [];

for (const route of ROUTES) {
  // a fresh context per route so nothing is served from cache — first-visit
  // weight is the number that matters, and a warm cache would hide all of it
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');

  const byId = new Map();
  const assets = [];
  cdp.on('Network.requestWillBeSent', (e) => byId.set(e.requestId, { url: e.request.url, type: e.type }));
  cdp.on('Network.responseReceived', (e) => {
    const r = byId.get(e.requestId);
    if (r) { r.type = e.type || r.type; r.status = e.response.status; }
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = byId.get(e.requestId);
    if (!r) return;
    assets.push({ url: r.url, bytes: e.encodedDataLength, kind: kind(r.url, r.type), status: r.status });
  });

  await page.addInitScript(() => {
    window.__lcp = 0; window.__lcpUrl = ''; window.__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) { window.__lcp = e.startTime; window.__lcpUrl = e.url || e.element?.tagName || ''; }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      // only shifts with no recent input count toward CLS
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });

  await page.goto(ORIGIN + route, { waitUntil: 'load' });
  await page.waitForTimeout(SETTLE);
  const vitals = await page.evaluate(() => ({
    lcp: Math.round(window.__lcp),
    lcpUrl: window.__lcpUrl,
    cls: +window.__cls.toFixed(4),
    dom: document.querySelectorAll('*').length,
  }));

  const byKind = {};
  let total = 0;
  for (const a of assets) {
    byKind[a.kind] = (byKind[a.kind] || 0) + a.bytes;
    total += a.bytes;
  }
  const heaviest = assets.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 3)
    .map((a) => ({ url: a.url.replace(ORIGIN, ''), bytes: a.bytes }));

  results.push({ route, total, requests: assets.length, byKind, heaviest, ...vitals });
  console.log(
    `  ${route.padEnd(24)} ${(total / 1024).toFixed(0).padStart(6)} kB  ` +
      `${String(assets.length).padStart(3)} req  LCP ${String(vitals.lcp).padStart(5)}ms  ` +
      `CLS ${vitals.cls.toFixed(3)}  ${heaviest[0] ? heaviest[0].url : ''}`
  );
  await ctx.close();
}

await browser.close();

const sum = results.reduce((a, r) => a + r.total, 0);
const worst = results.slice().sort((a, b) => b.total - a.total)[0];
const maxCls = results.slice().sort((a, b) => b.cls - a.cls)[0];
writeFileSync(OUT, JSON.stringify({ origin: ORIGIN, results }, null, 2));
console.log(
  `\n  ${results.length} routes, ${(sum / 1024 / 1024).toFixed(2)} MB total, ` +
    `mean ${(sum / results.length / 1024).toFixed(0)} kB/route\n` +
    `  heaviest route: ${worst.route} at ${(worst.total / 1024).toFixed(0)} kB\n` +
    `  worst CLS:      ${maxCls.route} at ${maxCls.cls.toFixed(4)}\n` +
    `  written to ${OUT}`
);
