gravity-integration.com — Polish + English, built and ready to upload
=====================================================================

  gravity-preview/     the finished site. Upload the CONTENTS of this
                       folder into the docroot. Nothing to build.
  PREVIEW.command      double-click to click through it locally first.
  DEPLOY.md            the run-book, updated for the English site.


Click through it first
----------------------
Double-click PREVIEW.command. It opens your browser at the Polish home
page; /en/ is one click away in the header menu or the footer.

macOS may refuse to run it the first time ("cannot be opened because it
is from an unidentified developer"). Right-click → Open → Open, once.
Or skip the file entirely and run this in Terminal:

    cd /path/to/gravity-preview && python3 -m http.server 8765

then open http://127.0.0.1:8765/


What to look at, in order
-------------------------
1. The English home page, /en/ — it should look exactly like the Polish
   one with different words in it. Nothing should have moved.
2. The language switcher, in the header menu and in the footer. From any
   page it lands on the SAME page in the other language, not on the home
   page. The privacy policy is the one exception: it is Polish-only by
   decision, so it offers no switch.
3. The English forms — demo, contact, newsletter, download. The labels,
   the placeholders, the validation messages and the thank-you states are
   all English. What they post is unchanged: same MailerLite form IDs,
   same GRAVITY group, same automations. No new field, no new group,
   nothing to reconfigure on the MailerLite side.
4. /en/pricing/ — the cards now read 0 EUR, 799 EUR and 1,799 EUR. The
   Polish /cennik/ is untouched at 0, 2999 and 7999 PLN; that split is
   deliberate. Two things to know before you click anything: the Buy
   buttons still go to the PLN-priced Stripe checkouts, because you're
   setting up the euro prices there yourself; and the ROI calculator on
   the next page still asks for a day rate in PLN. See "The calculator
   still says PLN" below.
5. The ROI calculator at /en/roi-calculator/ — the table headers and the
   totals row are translated, and the numbers use English grouping
   (12,000 rather than 12 000). Its own currency is the exception noted
   below.
6. /en/nonsense/ — should give you the English 404, not the Polish one.
   This only works over a real server with the .htaccess active; in the
   local preview above you'll get python's own plain 404 instead.


The calculator still says PLN
-----------------------------
The English ROI calculator asks for a "Day rate (PLN net)", starts at
1500, and prints its results in PLN. That is on purpose, and it is the
one place on the English site where the currency doesn't match the
pricing page.

Renaming the labels to EUR takes a minute. Making them mean something
takes a decision: the day-rate slider runs 500 to 4000, which is a range
of Polish contractor rates. Relabel it without rescaling it and the
calculator starts asking an English visitor whether their people cost
4,000 EUR a day, then multiplies that by their headcount and shows them
the total with a straight face. Wrong currency with right arithmetic is
recoverable; right currency with nonsense arithmetic is not.

So: tell me the euro day-rate default and the range you want (and the
same for the tools/licences slider, currently 0–200,000), and it's a
small change.


The nineteen URLs
-----------------
  /                        /en/
  /czym-jest-esb/          /en/what-is-esb/
  /technologia/            /en/technology/
  /integracje/             /en/integrations/
  /cennik/                 /en/pricing/
  /kalkulator/             /en/roi-calculator/
  /case-studies/           /en/case-studies/
  /kontakt/                /en/contact/
  /pobieranie/             /en/download/
  /polityka-prywatnosci/   (Polish only)

The English slugs are translated rather than transliterated, so the two
trees don't mirror each other path-for-path. What pairs them is a
language-neutral key inside the content files — that key is what drives
the switcher, the hreflang tags and the sitemap.


Two things upload tools quietly skip
------------------------------------
Check both landed on the server after you deploy:

  gravity-preview/.htaccess
  gravity-preview/.well-known/security.txt

Leading dots — most GUI SFTP clients hide them by default, and a missing
.htaccess means the redirects, the caching, the security headers and the
English 404 routing all silently do nothing.


One thing to know about the server
----------------------------------
The English 404 is routed by an <If> block in .htaccess. <If> is Apache
2.4 core, so it is deliberately NOT wrapped in <IfModule>: on 2.4 it
works, and on anything older Apache refuses to start rather than ignoring
it. A refused restart is the failure you want here — the alternative is
English visitors getting a Polish 404 page for months without anyone
noticing.


What was checked before this was packaged
-----------------------------------------
- The Polish site did not move. Every Polish page was screenshotted at
  two widths before and after the English work and compared pixel by
  pixel: 20 of 22 renders are identical. The two misses are the home
  page, which has floating spheres and a scroll-linked hero zoom and is
  not pixel-identical to itself between two runs — confirmed by diffing
  the build against its own screenshots.
- The Polish text is unchanged at the codepoint level, including the
  non-breaking spaces the Polish typographic rule depends on.
- The MailerLite wiring in the English subtree is byte-for-byte what the
  Polish one sends: same account, same four form IDs, same field names,
  same values.
- Every English page was audited at three widths against its Polish
  counterpart: no finding appears on an English page that doesn't
  already appear on the Polish one.
- hreflang reciprocates on all 18 paired pages; the sitemap lists 19
  URLs and neither 404.
- This archive itself was extracted, served, and clicked through by a
  script that starts on the Polish home page, follows the language
  switcher across, and visits all nine English pages — checking each one
  loads, is in English, has real content, and switches back to the right
  Polish page. That check exists because the previous delivery's only
  fault was in the packaging, not the build.


One Polish page changed, on purpose
-----------------------------------
/kalkulator/ — the day-rate slider now starts at "1500" rather than
"1 500". That looks like a typo and isn't. Polish only groups thousands
from five digits up, so the calculator's own output has always rendered
1500 the moment you touch the slider; only the static starting label
disagreed with it. Both now come from the same formatter. Above five
digits the grouping is back: 12 000.
