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
| `404.html` | Branded 404 page (`ErrorDocument` points here) |
| `robots.txt` | Allows everything, points at the sitemap |
| `sitemap-index.xml` + `sitemap-0.xml` | Regenerated on every build |
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
```

All 10 page URLs are byte-identical with the WordPress site, so no further
redirect map is needed. Anchors in active use elsewhere (ads, e-mails):
`/case-studies/#section0…#section6`, `/#section-demo`.

If the three legacy redirects return the 404 page instead of a `Location`
header, `AllowOverride` is not `All` — `.htaccess` is being ignored.

---

## Post-deploy checklist

1. Click through all 10 pages on the live domain (nav, menu overlay, footer).
2. Submit each form once for real — demo, kontakt, newsletter, pobieranie — and
   confirm the subscriber lands in MailerLite group GRAVITY as **active**.
   Reminder: double opt-in is still ON for Demo/Kontakt/Newsletter — switch it
   off in the MailerLite dashboard or those subscribers stay *unconfirmed* and
   never receive anything.
3. Watch GA4 Realtime while clicking; confirm `generate_lead` fires on a form
   submit (with consent accepted).
4. Google Search Console: submit
   `https://gravity-integration.com/sitemap-index.xml`.
5. Lighthouse the homepage and `/pobieranie/` on the live server (target: green
   Core Web Vitals).
6. Keep the WordPress export/backup until GSC traffic looks normal for 2–3
   weeks; the old hosting can be decommissioned after that.

## Rollback

The deploy is a folder of files. Keep the previous docroot as
`dist-YYYYMMDD/` on the server and swap the symlink (or re-upload the old
folder) to roll back instantly.
