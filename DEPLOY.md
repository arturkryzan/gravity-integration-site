# Deploying gravity-integration.com

The site is a fully static Astro build — no Node, no PHP, no database **on the
server**. Deployment is: upload a folder of files.

That is the easy half. The hard half is that you are not uploading into an empty
docroot. You are uploading into a live WordPress install that is sharing its
folder with nine other things that have nothing to do with this site, and the
whole risk of this deploy is concentrated in that one fact.

---

## Read this before you touch anything

**Do not run `rsync --delete`, and do not use your FTP client's "mirror" or
"sync" mode.** An earlier version of this run-book told you to. It was written
against an imagined `/var/www/gravity-integration.com/` containing nothing but
the site, and against that server it was correct. Against the actual server it
would delete `downloads`, `fonts`, `licencje`, `mailing`, `manual`, `old`,
`supabase`, `tatoo`, `test` and `gravity_old` — because mirroring means "make
the destination look exactly like the source", and none of those folders exist
in the source.

Every step below is additive or a move. Nothing in this document deletes
anything, and the one thing that gets overwritten (`.htaccess`) gets backed up
first.

---

## What is on the server now

Thirty-one entries in the docroot, and they fall into three groups that need
three different treatments.

**Group 1 — WordPress. Retire it (step 2).** `index.php`, `license.txt`,
`readme.html`, `xmlrpc.php`, `wp-activate.php`, `wp-blog-header.php`,
`wp-comments-post.php`, `wp-config.php`, `wp-config-sample.php`, `wp-cron.php`,
`wp-links-opml.php`, `wp-load.php`, `wp-login.php`, `wp-mail.php`,
`wp-settings.php`, `wp-signup.php`, `wp-trackback.php`, `wp-admin/`,
`wp-content/`, `wp-includes/`.

**Group 2 — shared, and replaced.** `.htaccess`. WordPress wrote it; the new
build ships its own. Back it up before it goes (step 1).

**Group 3 — not yours to touch. Nine folders that must come through
untouched:** `downloads/`, `fonts/`, `licencje/`, `mailing/`, `manual/`,
`old/`, `supabase/`, `tatoo/`, `test/`, plus `gravity_old/`.

`fonts/` is the one that needs a second look, because the new build also has a
top-level `fonts/` folder. It contains six files — the Telegraf webfont in three
formats, regular and ultralight. Uploading it **merges** into the folder that is
already there: those six names get written, anything else in there is left
alone. That is the intended outcome, but it is the one place in this deploy
where new files land inside an existing folder rather than beside it, so if that
folder holds something you care about, look in it first.

---

## Step 1 — back up the two things you cannot re-create

Download these to your machine before anything else. Both are one file each and
both are gone the moment you start.

    /.htaccess          → keep as htaccess-wordpress.txt
    /wp-config.php      → keep somewhere outside the docroot

`.htaccess` is your record of what WordPress was doing at the server level —
any redirect, block or hack added over the years lives there and nowhere else.
Read it once before you replace it. If it contains a rule you didn't know about,
that rule needs a home in the new `.htaccess`, and it is far easier to notice
now than to reconstruct from a bug report in November.

`wp-config.php` holds the database name, user and password. You want it because
it is the key to the old content, and you want it **off the web server** because
a folder rename is not access control: a file that is not being executed as PHP
any more is a file that can be read as text.

Also worth ten seconds: look inside `gravity_old/` and confirm you know what it
is. It was modified the same day as this deploy, which usually means it is
already a copy of the current site — in which case your rollback story is better
than you think, and if it is something else entirely you want to know that
before you start moving folders around.

---

## Step 2 — retire WordPress

Make a folder in the docroot called `_wp-retired/` and **move** the twenty
Group 1 entries into it. Move, not delete: in an FTP client this is a
server-side rename, so it is instant regardless of how large `wp-content/` is,
and it means the entire old site is one drag away from coming back.

Then put a file called `.htaccess` inside `_wp-retired/`, containing exactly
this:

```apache
Require all denied
```

Without it, `/_wp-retired/wp-config.php` is a URL, and the only thing standing
between it and the internet is Apache's willingness to keep executing PHP in a
folder you have stopped thinking about. One line, and the whole subtree is
unreachable. (Better still: once you have the local copy from step 1, delete
`wp-config.php` from the server outright. It is the one file in there with a
password in it.)

Two consequences to know about rather than discover:

The WordPress database is still there and still costing you nothing. Leave it.
It is the other half of the backup, and dropping it is a decision for a quiet
afternoon in a month, not part of a deploy.

If anything on the server runs `wp-cron.php` on a schedule — a system cron
entry, an external uptime pinger — it will start failing silently. Nothing
breaks, but if you get cron mail you will now know why.

---

## Step 3 — upload the site

`gravity-preview/` is already the built site: exactly what `npm run build`
produces, plus the server files. There is nothing to compile and no Node needed.
Upload the **contents** of that folder — not the folder itself — into the
docroot. Twenty-five entries, 15 MB, 176 files:

```
.htaccess          czym-jest-esb/     kontakt/           sitemap-0.xml
.well-known/       en/                media/             sitemap-index.xml
404.html           favicons/          og-homehero.png    technologia/
_assets/           fonts/             pobieranie/        theme/
case-studies/      index.html         polityka-prywatnosci/   uploads/
cennik/            integracje/        robots.txt         video/
                   kalkulator/
```

If you have shell access, this is the safe form of the command that used to be
here — same `rsync`, no `--delete`:

```bash
cd ~/Desktop/GRAVITY.nosync/gravity-preview
rsync -av ./ user@server:/path/to/docroot/
```

The `-a` copies recursively and preserves timestamps; leaving `--delete` off is
the entire point. Files present on the server and absent from the build are left
exactly where they are, which is what you want for all nine of them.

**Do it at a quiet hour.** For the few minutes the upload takes, the site is a
mix of old and new: each page directory flips from WordPress to static the
moment its folder lands, because Apache serves a real directory directly rather
than routing it through WordPress. Nothing 404s and nothing is lost, but a
visitor mid-upload can get a new page before its stylesheet has arrived. The
window closes when the last file lands.

---

## Step 4 — the two files your FTP client is hiding from you

```
.htaccess
.well-known/security.txt
```

Leading dots. Most GUI clients hide dotfiles by default and will upload the
other twenty-three entries without a word of complaint. Turn hidden files on and
confirm both landed.

This matters more than it sounds. A missing `.htaccess` doesn't break the site
visibly — every page still loads. What silently stops working is the legacy
redirects, the caching, the security headers, the English 404 routing and the
http→https canonicalisation. It is the failure mode that looks like success.

---

## What the new .htaccess does to the folders that aren't this site

The new `.htaccess` sits at the docroot, so its rules apply to `manual/`,
`downloads/`, `mailing/` and the rest as much as to the site. It contains no
catch-all rewrite — unlike WordPress's, which routed every unmatched URL to
`index.php` — so those folders keep serving their own files exactly as before.
Four rules do reach them, though, and three are improvements:

`Options -Indexes` **turns off directory listings for the whole docroot.** This
is the one that can actually break something. If any of those folders is used as
a browsable index — you send someone `/downloads/` and they pick a file off the
generated listing — that page will start returning 403. The fix is one line in
that folder's own `.htaccess` (`Options +Indexes`), and it is much better to
decide this now than to hear about it from whoever was relying on it.

Everything under the docroot now redirects to `https://gravity-integration.com`
with no `www`, gets `X-Frame-Options: SAMEORIGIN` and a one-year HSTS header,
and serves the site's own 404 page for anything missing. The redirect and the
HSTS are unambiguously good. `SAMEORIGIN` is the one to think about for a
second: if anything in `mailing/` or `licencje/` is meant to be embedded in an
iframe on another domain, it will stop rendering there.

---

## Server configuration — most of it is already proven

The previous version of this section told you to configure Apache from scratch.
You don't need to, and you can confirm that without root: **WordPress is
currently serving pretty permalinks over HTTPS on this domain.** That single
observation establishes what would otherwise be three separate checks.

Pretty permalinks are implemented by a `RewriteRule` in the docroot `.htaccess`.
For that to be working at all, `mod_rewrite` must be enabled and the vhost must
already be granting `AllowOverride` at least `FileInfo`. And the site answering
on `https://` means the certificate exists and TLS terminates correctly. So the
new build's redirects and 404 wiring will work for the same reason WordPress's
permalinks do.

Three things are still worth confirming, in descending order of likelihood:

`AllowOverride All`, rather than the narrower `FileInfo`. `FileInfo` is enough
for the redirects and `ErrorDocument`; `Options -Indexes` needs `Options`, and
the `Header` directives need... nothing extra, but `mod_headers` has to be
loaded. If you have root, this settles it:

```apache
<Directory /path/to/docroot>
    AllowOverride All
    Require all granted
</Directory>
```

```bash
a2enmod rewrite headers deflate && systemctl reload apache2
```

If you don't have root, the curl block below tells you the answer anyway: a
missing `Cache-Control` header means `mod_headers` isn't loaded, and a legacy
redirect returning the 404 page instead of a `Location` means `.htaccess` is
being ignored entirely.

**The certificate must cover `www.` as well as the apex.** WordPress may have
been handling the www case in PHP, which the static site cannot do. The
www→apex redirect happens *after* the TLS handshake, so without a cert covering
www a visitor gets a browser security warning before the redirect can help them.
`certbot --apache -d gravity-integration.com -d www.gravity-integration.com`
covers both.

**Apache must be 2.4.** The `<If "%{REQUEST_URI} =~ m#^/en/#">` block that routes
the English 404 is 2.4 core, not a module, and is deliberately not wrapped in
`<IfModule>`: on 2.4 it works, and on anything older Apache refuses to start
rather than ignoring it. A refused restart is the failure you want here — the
alternative is English visitors quietly getting a Polish 404 page for months.
If Apache does refuse to reload after this deploy, that block is the first thing
to look at, and `apachectl -v` will tell you in one line.

**If the box runs nginx instead**, use `deploy/nginx-gravity.conf` from the
source — it mirrors the `.htaccess` 1:1, and `.htaccess` is then inert and can
stay in the upload.

---

## Verify

```bash
# the site itself
curl -sI https://gravity-integration.com/                | head -1            # → 200
curl -s  https://gravity-integration.com/ | grep -o 'lang="[a-z]*"' | head -1  # → lang="pl"
curl -s  https://gravity-integration.com/en/ | grep -o 'lang="[a-z]*"' | head -1  # → lang="en"

# legacy redirects — these are the .htaccess canary
curl -sI https://gravity-integration.com/atomy/          | grep -i location   # → /technologia/
curl -sI https://gravity-integration.com/atomy-wiedzy/   | grep -i location   # → /technologia/
curl -sI https://gravity-integration.com/wiecej-niz-etl/ | grep -i location   # → /technologia/
curl -sI https://gravity-integration.com/feed/           | grep -i location   # → /
curl -sI http://gravity-integration.com/                 | grep -i location   # → https://
curl -sI https://www.gravity-integration.com/            | grep -i location   # → apex

# 404s, in both languages
curl -sI https://gravity-integration.com/nie-ma-takiej/  | head -1            # → 404
curl -s  https://gravity-integration.com/en/no-such-page/ | grep -o 'lang="[a-z]*"' | head -1   # → lang="en"

# headers (proves mod_headers is loaded)
curl -sI https://gravity-integration.com/_assets/ -o /dev/null -w '%{http_code}\n'
curl -sI https://gravity-integration.com/ | grep -i 'cache-control\|strict-transport'

# WordPress is gone, and stayed gone
curl -sI https://gravity-integration.com/wp-login.php    | head -1            # → 404
curl -sI https://gravity-integration.com/_wp-retired/wp-config.php | head -1  # → 403

# the nine folders that had to survive
for d in downloads fonts licencje mailing manual old supabase tatoo test gravity_old; do
  printf '%-12s %s\n' "$d" "$(curl -sI https://gravity-integration.com/$d/ | head -1)"
done
```

That last loop is the one to actually run. `403` is a fine answer for a folder
that has no index page — it means the folder is there and `Options -Indexes` is
working. `404` on a folder that used to respond is the failure this whole
document is built around, and if you see one, stop and check `_wp-retired/`
before uploading anything else.

The ten Polish page URLs are byte-identical with the WordPress site, so no
redirect map is needed for them. The eight English URLs are new — nothing ever
lived at `/en/`, so there is nothing to redirect from. Anchors in active use
elsewhere (ads, e-mails): `/case-studies/#section0…#section6`, `/#section-demo`.

Nothing auto-redirects by language. A visitor who lands on a Polish URL stays on
it; the switcher in the header and footer is the only way across, and `hreflang`
is what tells Google the pair exists. If you ever add an `Accept-Language`
redirect it will fight the `hreflang`, and Google will index one language for
both.

---

## Post-deploy checklist

1. Click through all 18 pages on the live domain — 10 Polish, 8 English (nav,
   menu overlay, footer). The counts differ because two Polish pages have no
   English twin by decision: the privacy policy and the ROI calculator.
2. Use the language switcher on every page that has a pair. It sits in the
   header menu and in the footer, and it should land you on the *same* page in
   the other language. On `/kalkulator/` and `/polityka-prywatnosci/` it lands
   on `/en/` instead — that is the intended fallback for a page with no twin,
   not a bug. Anywhere else, a jump to the home page means that page's `slug`
   doesn't match its counterpart's.
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
8. Keep `_wp-retired/` and the WordPress database until GSC traffic looks normal
   for two to three weeks.

---

## Rollback

The deploy is a folder of files and a folder move, so the rollback is the same
two things in reverse: move the twenty entries back out of `_wp-retired/`, and
put `htaccess-wordpress.txt` back as `.htaccess`. WordPress is then serving
again, because nothing was ever deleted and the database was never touched.

The new site's files can stay where they are while you do it — WordPress's
`.htaccess` routes unmatched URLs to `index.php`, but a real directory like
`/cennik/` still gets served directly, so leaving them in place would give you a
confusing hybrid. If you are rolling back for real rather than testing, move the
twenty-five new entries into a `_new/` folder in the same motion. It costs one
extra drag and leaves the docroot in a state you can reason about.

Do it in that order — WordPress back first, new site aside second — so the
window where neither is serving is as short as the two operations, rather than
as long as your confidence.

---

## What is in the build — two languages, one folder

Eighteen pages. There is no second deploy and no second server: the English site
is a subtree of the same build output.

| Polish | English |
|---|---|
| `/` | `/en/` |
| `/czym-jest-esb/` | `/en/what-is-esb/` |
| `/technologia/` | `/en/technology/` |
| `/integracje/` | `/en/integrations/` |
| `/cennik/` | `/en/pricing/` |
| `/case-studies/` | `/en/case-studies/` |
| `/kontakt/` | `/en/contact/` |
| `/pobieranie/` | `/en/download/` |
| `/kalkulator/` | *(none — Polish only, by decision)* |
| `/polityka-prywatnosci/` | *(none — Polish only, by decision)* |
| `/404.html` | `/en/404.html` |

The English slugs are translated, not transliterated, so the two trees do not
mirror each other path-for-path. What pairs them is a language-neutral key in
the content files, which is also what drives the switcher, the `hreflang` tags
and the sitemap. Renaming a URL means changing the `url` field; it does **not**
mean changing the key, and changing the key by accident is what silently breaks
a pair.

The two Polish-only pages are Polish-only for different reasons, and the
difference is visible in the nav. The privacy policy **is** linked from the
English menu, labelled "(in Polish)" — it says the same thing in any language.
The ROI calculator is not linked at all, because its sliders are scaled to
Polish contractor day rates and an English visitor is better served by no
calculator than by a confident wrong one.

Prices differ by language on purpose: the Polish site quotes 0 / 2999 / 7999
PLN, the English site 0 / 799 / 1,799 EUR. One thing to know before you announce
it — the English Buy buttons still point at the PLN-priced Stripe checkouts,
because the euro prices are set up in Stripe by hand and that hasn't happened
yet.

The server files that ship inside the build:

| File | Purpose |
|---|---|
| `.htaccess` | https+apex canonicalisation, legacy WP 301s, caching, security headers, gzip, 404 wiring |
| `404.html` | Branded 404 page, Polish (`ErrorDocument` points here) |
| `en/404.html` | The same page in English, served for anything under `/en/` |
| `robots.txt` | Allows everything, points at the sitemap |
| `sitemap-index.xml` + `sitemap-0.xml` | Regenerated on every build — 18 URLs, both languages |
| `.well-known/security.txt` | Security contact (expires 2027-07-31 — bump it then) |

---

## Rebuilding from source

Only when the site changes. Nothing above needs this.

```bash
# from GitHub (preferred — you get history and can commit changes back)
git clone https://github.com/arturkryzan/gravity-integration-site.git
cd gravity-integration-site

# or, offline, from the tarball
tar -xzf gravity-site-code-predeploy.tar.gz     # → creates gravity-site/
cd gravity-site                                 # ← npm only works from here
```

The `cd` is the part that matters. Run `npm ci` one directory too high and it
fails with `EUSAGE … can only install with an existing package-lock.json`,
because the lockfile is in the project root and nowhere else.

```bash
npm ci                                          # needs Node 22.12+ (Astro 7)
npm run build                                   # → dist/
```

Check `node -v` first. Astro 7 hard-requires **22.12.0 or newer**; on Node 20
the install fails an engine check rather than building something subtly broken,
which is the good outcome, but it does stop you.

`npm install` is the fallback if `npm ci` refuses: same site, regenerated
lockfile, no guarantee of identical dependency versions.

Then upload the contents of `dist/` exactly as in step 3 — `dist/` already
contains `.htaccess`, `404.html`, `robots.txt` and `.well-known/`, because Astro
copies `public/` verbatim.
