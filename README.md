# gravity-integration.com

The marketing site for **gravity.integration**, an enterprise service bus /
integration platform. Polish-first, EN-ready (i18n routing is pre-wired but not
yet populated).

This is a rebuild: the site ran on WordPress with a pile of accumulated code
snippets, and was moved to a static Astro build served as plain files from our
own Apache box. There is no Node, no PHP and no database on the server — a
deploy is `rsync` of a folder.

## Stack

- **Astro 7**, static output, `@astrojs/sitemap`
- **Node 22.12+** required (Astro 7 engine constraint — `npm ci` refuses older)
- **Fonts:** Epilogue + Inter, self-hosted via Fontsource. No Google Fonts CDN,
  so no third-party request on first paint.
- **Content:** git-based JSON collections, migrated 1:1 from WordPress/ACF.
  Editing copy means editing a JSON file and rebuilding — no CMS to keep alive.
- **URL policy:** `trailingSlash: 'always'`. All 10 WordPress-era URLs are
  byte-identical, so the rebuild needed no redirect map beyond four legacy
  paths that predate them.

## Getting started

```bash
npm ci
npm run dev          # http://localhost:4321
npm run build        # → dist/
npm run preview      # serve the built output
```

## Layout

```
src/
  pages/                    routes; [...slug] renders the JSON page collection
  layouts/Site.astro        head, SEO, GA4/consent, JSON-LD shell
  components/               17 section components (hero, pricing, ROI calc, …)
  content/pages/*.json      10 pages: sections, verbatim SEO meta, h1
  content/case-studies/     4 case studies (anchors #section0…#section6 kept)
  data/                     clients, 139 integrations, site config, redirects,
                            intrinsic image dimensions (CLS guard)
  lib/                      case-study parser, media resolver, MailerLite,
                            link helpers
  scripts/ml-forms.ts       shared form runtime: submit, validation, GA4 events
  styles/tokens.css         design tokens (brand green #27EA93)
public/                     copied verbatim into dist/ — media, video, fonts,
                            favicons, .htaccess, robots.txt, .well-known/
deploy/nginx-gravity.conf   nginx equivalent of public/.htaccess
scripts/                    one-off Playwright harnesses used during the
                            rebuild (audits, form e2e, screenshots) — not part
                            of the build
```

## Forms

All four forms (demo, contact, newsletter, download) post directly to
MailerLite's JSONP subscribe endpoint from the browser. There is no backend and
no API key in the bundle — the endpoint is public per-form and takes a
form-encoded body, deliberately kept CORS-simple so no preflight is needed.
Every form feeds the same **GRAVITY** subscriber group. Submissions fire a GA4
`generate_lead` event, gated on cookie consent.

Form IDs live in `src/lib/mailerlite.ts`.

## Design system

`DESIGN.md` documents the visual system — tokens, type scale, section
patterns, motion rules — and `PRODUCT.md` captures the product context behind
it. `AUDIT.md` is the accessibility/performance audit from the pre-launch pass.

## Deploying

See **[DEPLOY.md](DEPLOY.md)**. Short version: `npm run build`, then upload the
contents of `dist/` to the docroot. `dist/` already contains `.htaccess`,
`404.html`, `robots.txt` and `.well-known/security.txt` because Astro copies
`public/` verbatim.

CI (`.github/workflows/build.yml`) builds every push and attaches `dist/` as a
downloadable artifact, so a green check means the tree still builds. It does
not deploy — that stays a deliberate manual step.

## Known open items

- Kontakt city conflict: Bielsko-Biała (meta/copy) vs Poznań (KRS registration)
- NAC case study: industry, city, metrics and quote still to be supplied
- Double opt-in is still ON for the demo/contact/newsletter MailerLite forms;
  until it's switched off those subscribers stay *unconfirmed*
