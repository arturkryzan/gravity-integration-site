// @ts-check
import { rename, rmdir } from 'node:fs/promises';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { draftUrls, alternatesByUrl } from './src/i18n/sitemap-data.mjs';

// gravity-integration.com — Astro rebuild
// PL is the default locale served at the root (URL parity with the old WP site).
// EN is prefixed under /en/ with translated slugs; the pairing that links a page
// to its translation is the language-neutral `slug` field, not the path.

// Read once at config load. See src/i18n/sitemap-data.mjs for why the content
// collection can't be reached from here.
const drafts = draftUrls();
const alternates = alternatesByUrl();

/* Astro only special-cases the ROOT 404: src/pages/404.astro becomes
   dist/404.html, which is what Apache's ErrorDocument needs. Any other 404 page
   is an ordinary route, so under `trailingSlash: 'always'` + the directory build
   format src/pages/en/404.astro emits dist/en/404/index.html — a real, crawlable
   URL, and NOT a path ErrorDocument can point at.

   So we move it after the build and delete the directory it leaves behind. The
   sitemap filter below drops the same URL, because otherwise the file Google is
   told to crawl is one we just moved out from under it. The two belong together:
   change one and the other stops making sense. */
const EN_404_URL = '/en/404/';
const enErrorPage = {
  name: 'gi:en-404',
  hooks: {
    'astro:build:done': async ({ dir, logger }) => {
      const from = new URL('en/404/index.html', dir);
      const to = new URL('en/404.html', dir);
      try {
        await rename(from, to);
        await rmdir(new URL('en/404/', dir));
        logger.info('moved en/404/index.html → en/404.html (Apache ErrorDocument target)');
      } catch (err) {
        /* Loud, not silent. If this ever stops firing the English 404 quietly
           reverts to the Polish one, which is exactly the class of bug nobody
           notices for months. */
        logger.error(`could not place en/404.html: ${err.message}`);
        throw err;
      }
    },
  },
};

export default defineConfig({
  site: 'https://gravity-integration.com',
  trailingSlash: 'always', // WP URLs all end with / — keep byte-identical URLs
  i18n: {
    defaultLocale: 'pl',
    locales: ['pl', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    sitemap({
      // Scaffolded-but-untranslated pages build — that's how they get reviewed —
      // but they carry `noindex`, so listing them would be asking Google to
      // crawl a URL that then turns it away. The English 404 goes the same way,
      // and doubly so: the enErrorPage integration above moves that file, so the
      // URL stops existing the moment the build finishes.
      filter: (page) => {
        const path = new URL(page).pathname;
        return !drafts.has(path) && path !== EN_404_URL;
      },
      // The integration's own `i18n` option pairs pages by the path left after
      // the locale prefix, so it only finds /foo/ ↔ /en/foo/. Our English slugs
      // are translated, so the pairing comes from the content instead.
      serialize: (item) => {
        const links = alternates.get(new URL(item.url).pathname);
        return links
          ? { ...item, links: links.map((l) => ({ ...l, url: new URL(l.url, item.url).href })) }
          : item;
      },
    }),
    enErrorPage,
  ],
  build: {
    // hashed assets → safe to cache forever at the Apache level
    assets: '_assets',
  },
});
