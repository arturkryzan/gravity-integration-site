// @ts-check
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
      // crawl a URL that then turns it away.
      filter: (page) => !drafts.has(new URL(page).pathname),
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
  ],
  build: {
    // hashed assets → safe to cache forever at the Apache level
    assets: '_assets',
  },
});
