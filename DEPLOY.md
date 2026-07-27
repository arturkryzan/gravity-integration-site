# Deploying gravity-integration.com

The site is a fully static Astro build — no Node, no PHP, no database **on the
server**. Deployment is: upload a folder of files, done.

---

## Step 0 — which folder am I in?

This is where the previous version of this run-book went wrong: it opened with
`npm ci` without saying *where*. Run that in `~/Desktop/GRAVITY.nosync/` and npm
fails with `EUSAGE … can only install with an existing package-lock.json`,
because that folder is not the project — it's just where the files were dropped.

On your Desktop, under `GRAVITY.nosync/`, you have two separate things:

| | What it is | Node needed? |
|---|---|---|
| `gravity-preview/` | the **finished build** — upload this | no |
| `gravity-site-code-predeploy.tar.gz` | the **source**, still compressed | yes, to rebuild |

---

## Path A — deploy now (no Node, no npm, nothing to build)

`gravity-preview/` is already the built site. It is what `npm run build` would
produce, plus the server files. Upload the **contents** of that folder (not the
folder itself) into the docroot and you're live.

```bash
cd ~/Desktop/GRAVITY.nosync/gravity-preview
rsync -av --delete ./ user@server:/var/www/gravity-integration.com/
```

Two things rsync/SFTP clients silently skip unless told otherwise — check both
landed on the server:

- `.htaccess` (leading dot — most GUI clients hide it)
- `.well-known/security.txt`

Everything the server needs is in there:

| File | Purpose |
|---|---|
| `.htaccess` | Apache: https+www canonicalization, legacy WP 301s, caching, security headers, gzip, 404 wiring |
| `404.html` | Branded 404 page, Polish (`ErrorDocument` points here) |
| `en/404.html` | The same page in English, served for anything under `/en/` |
| `robots.txt` | Allows everything, points at the sitemap |
| `sitemap-index.xml` + `sitemap-0.xml` | Regenerated on every build — 19 URLs, both languages |
| `.well-known/security.txt` | Security contact (expires 2027-07-31 — bump it then) |

## Path B — rebuild from source (only when the site changes)

Get the source, then work **inside** the project folder. The `cd` is the part
that matters.

```bash
# from GitHub (preferred — you get history and can commit changes back)
git clone https://github.com/arturkryzan/gravity-integration-site.git
cd gravity-integration-site

# or, offline, from the tarball on your Desktop
cd ~/Desktop/GRAVITY.nosync
tar -xzf gravity-site-code-predeploy.tar.gz     # → creates gravity-site/
cd gravity-site                                 # ← npm only works from here
```

Then, from inside whichever folder you ended up in:

```bash
npm ci                                          # needs Node 22.12+ (Astro 7)
npm run build                                   # → dist/
```

Check your Node first — `node -v`. Astro 7 hard-requires **22.12.0 or newer**;
on Node 20 the install fails an engine check rather than building something
subtly broken, which is the good outcome, but it does stop you.

`npm ci` works because `package-lock.json` is committed in the project root
(lockfileVersion 3). If you ever see the `EUSAGE` error again, it means the
lockfile isn't next to you — you're in the wrong directory, or the file got
dropped in a copy. `npm install` is the fallback: it builds the same site and
regenerates the lockfile, it just doesn't guarantee identical dependency
versions.

Then upload the **contents** of `dist/` exactly as in Path A — `dist/` already
contains `.htaccess`, `404.html`, `robots.txt` and `.well-known/`, because
Astro copies `public/` verbatim.

---

## What's in the docroot — two languages, one build

The site ships 19 pages. There is no second deploy and no second server: the
English site is a subtree of the same build output.

| Polish | English |
|---|---|
| `/` | `/en/` |
| `/czym-jest-esb/` | `/en/what-is-esb/` |
| `/technologia/` | `/en/technology/` |
| `/integracje/` | `/en/integrations/` |
| `/cennik/` | `/en/pricing/` |
| `/kalkulator/` | `/en/roi-calculator/` |
| `/case-studies/` | `/en/case-studies/` |
| `/kontakt/` | `/en/contact/` |
| `/pobieranie/` | `/en/download/` |
| `/polityka-prywatnosci/` | *(none — Polish only, by decision)* |
| `/404.html` | `/en/404.html` |

The English slugs are translated, not transliterated, so the two trees do not
mirror each other path-for-path. What pairs them is a language-neutral key in
the content files, which is also what drives the switcher, the `hreflang` tags
and the sitemap. Renaming a URL means changing the `url` field; it does **not**
mean changing the key, and changing the key by accident is what silently breaks
a pair.

Prices stay in PLN on both sites, with an approximate euro figure alongside on
the English pages. That is deliberate: one currency to invoice in, one number
to keep up to date.

---

## Server configuration

**Apache** (current TurnKey/OVH setup): the vhost must allow `.htaccess` to
work, otherwise the file is ignored and the redirects, caching and security
headers all silently do nothing:

```apache
<Directory /var/www/gravity-integration.com>
    AllowOverride All
    Require all granted
</Directory>
```

Modules used — every block is wrapped in `<IfModule>`, so a missing module
degrades quietly instead of 500-ing the site, but enable all three for full
behavior:

```bash
a2enmod rewrite headers deflate && systemctl reload apache2
```

One block in `.htaccess` is deliberately **not** wrapped in `<IfModule>` — the
`<If "%{REQUEST_URI} =~ m#^/en/#">` that points `ErrorDocument` at the English
404. `<If>` is Apache 2.4 core, not a module, so there is nothing to test for;
on 2.4 it works, and on anything older Apache refuses the config outright. That
refusal is the failure you want. The alternative — a silently ignored block —
means English visitors land on a Polish 404 and nobody notices for months.

**nginx** (if the box runs nginx instead): use `deploy/nginx-gravity.conf` from
the source tarball — it mirrors the `.htaccess` 1:1. `.htaccess` is then inert
and can stay in the upload.

**HTTPS**: Let's Encrypt (`certbot --apache` or `--nginx`) for
`gravity-integration.com` **and** `www.gravity-integration.com`. The www cert
matters — the www→apex redirect happens *after* the TLS handshake, so without a
cert covering www, visitors hit a certificate warning before the redirect can
help them.

---

## Redirects that must keep working (verify after deploy)

```bash
curl -sI https://gravity-integration.com/atomy/          | grep -i location   # → /technologia/
curl -sI https://gravity-integration.com/atomy-wiedzy/   | grep -i location   # → /technologia/
curl -sI https://gravity-integration.com/wiecej-niz-etl/ | grep -i location   # → /technologia/
curl -sI https://gravity-integration.com/feed/           | grep -i location   # → /
curl -sI http://gravity-integration.com/                 | grep -i location   # → https://
curl -sI https://www.gravity-integration.com/            | grep -i location   # → apex
curl -sI https://gravity-integration.com/nie-ma-takiej/  | head -1            # → 404

# and the English 404 must be English, not the Polish one
curl -s  https://gravity-integration.com/en/no-such-page/ | grep -o 'lang="[a-z]*"' | head -1   # → lang="en"
```

The ten Polish page URLs are byte-identical with the WordPress site, so no
further redirect map is needed. The nine English URLs are new — nothing ever
lived at `/en/`, so there is nothing to redirect from. Anchors in active use
elsewhere (ads, e-mails): `/case-studies/#section0…#section6`,
`/#section-demo`.

Nothing auto-redirects by language. A visitor who lands on a Polish URL stays
on it; the switcher in the header and footer is the only way across, and
`hreflang` is what tells Google the pair exists. If you ever add an
`Accept-Language` redirect, it will fight the `hreflang` and Google will index
one language for both.

If the three legacy redirects return the 404 page instead of a `Location`
header, `AllowOverride` is not `All` — `.htaccess` is being ignored.

---

## Post-deploy checklist

1. Click through all 19 pages on the live domain — 10 Polish, 9 English (nav,
   menu overlay, footer). The privacy policy is Polish-only by decision, which
   is why the counts differ by one.
2. Use the language switcher on every page that has a pair. It sits in the
   header menu and in the footer, and it should land you on the *same* page in
   the other language, not on the home page. If it drops you on the home page,
   that page's `slug` doesn't match its counterpart's.
3. Submit each form once for real — demo, kontakt, newsletter, pobieranie — and
   confirm the subscriber lands in MailerLite group GRAVITY as **active**.
   Reminder: double opt-in is still ON for Demo/Kontakt/Newsletter — switch it
   off in the MailerLite dashboard or those subscribers stay *unconfirmed* and
   never receive anything.
4. Submit one English form too. It posts to the **same** MailerLite form IDs as
   the Polish one and lands in the **same** GRAVITY group — the English pages
   translate the labels, not the wiring. The `typ_zapytania` values stay Polish
   on the wire on purpose, so the CRM sees one vocabulary rather than two.
5. Watch GA4 Realtime while clicking; confirm `generate_lead` fires on a form
   submit (with consent accepted), and that the `page_language` parameter reads
   `pl` on Polish pages and `en` on English ones.
6. Google Search Console: submit
   `https://gravity-integration.com/sitemap-index.xml`. Then check
   International Targeting for `hreflang` errors — every English page must name
   its Polish counterpart and be named back by it. One-directional tags are
   ignored wholesale, so a single missing return tag silently disables the
   pairing for that page.
7. Lighthouse the homepage and `/pobieranie/` on the live server (target: green
   Core Web Vitals).
8. Keep the WordPress export/backup until GSC traffic looks normal for 2–3
   weeks; the old hosting can be decommissioned after that.

## Rollback

The deploy is a folder of files. Keep the previous docroot as
`dist-YYYYMMDD/` on the server and swap the symlink (or re-upload the old
folder) to roll back instantly.
