# gravity-integration.com — Astro rebuild

Rebuild of the WordPress site as a static Astro project. Polish-first, EN-ready (i18n routing pre-wired), deployed as static files to own Apache server.

## Stack

- **Astro 7** + `@astrojs/sitemap`, static output
- **Fonts:** Epilogue + Inter self-hosted via Fontsource (no Google Fonts CDN)
- **Content:** Git-based — JSON content collections migrated 1:1 from WP/ACF (edited via Cowork/Claude or any editor)
- **URL policy:** `trailingSlash: 'always'`, all 10 WP-era URLs byte-identical

## Structure

```
src/
  content/pages/*.json        10 pages: sections (normalized ACF), verbatim SEO meta, h1
  content/case-studies/*.json 4 case studies (anchors section0/2/4/6 preserved)
  data/clients.json           22 client logos, homepage order
  data/integrations.json      139 integrations / 13 categories (from snippet 31)
  data/site.json              company/KRS, GA4 id, links, open TODOs
  data/redirects.json         legacy 301s → generate .htaccess at deploy
  assets/media/               52 content images (resolved from WP attachment IDs)
  assets/svg/                 2 animated hero SVGs (from snippet 30)
  assets/brand/, assets/icons/  logo + theme icons
  styles/tokens.css           design tokens (green unified to #27EA93)
  layouts/Base.astro          head/SEO/GA4/JSON-LD shell
  components/PageSkeleton.astro  Phase-1 placeholder (replaced in Phase 2)
public/
  video/                      re-encoded MP4+WebM+posters (13.7 MB → ~1 MB)
  favicons/                   from the old theme
```

## Content conventions

- Snippet 10's live rebrand (ETL→ESB except on /czym-jest-esb/, naming → `gravity.integration`) is **baked into content** — no runtime rewriting.
- SEO titles/descriptions are byte-identical with the live WP output (verified 10/10).
- Reference material (original snippets, ACF dumps, rendered WP snapshots for parity diffing): `GRAVITY.nosync/rebuild-extract/`.

## Commands

```
npm install
npm run dev
npm run build    # → dist/
```

## Phase status

- [x] Phase 0 — extraction (see rebuild-extract/)
- [x] Phase 1 — scaffold, content model, migration, tokens, fonts, build green
- [ ] Phase 2 — real components & pages (hero, announcement bar, SVG heroes, tiles, videos, forms, integracje grid, ROI calculator, case studies)
- [ ] Phase 3 — form endpoint → MailerLite + GA4 events
- [ ] Phase 4 — SEO parity gate (full diff vs rendered snapshots)
- [ ] Phase 5 — deploy pipeline + launch

## Open TODOs (content)

- Kontakt city conflict: Bielsko-Biała (meta/copy) vs Poznań (KRS) — awaiting decision
- NAC case study: branża, city, metrics, quote
