// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// gravity-integration.com — Astro rebuild
// PL is the default locale served at the root (URL parity with the old WP site).
// EN is pre-wired: add content under src/pages/en/ when ready; hreflang comes free.
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
      i18n: {
        defaultLocale: 'pl',
        locales: { pl: 'pl-PL', en: 'en-US' },
      },
    }),
  ],
  build: {
    // hashed assets → safe to cache forever at the Apache level
    assets: '_assets',
  },
});
