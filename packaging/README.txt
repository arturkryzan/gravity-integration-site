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
   page. Two Polish pages have no English twin by decision — the privacy
   policy and the ROI calculator — and on those the switcher falls back to
   the English home page rather than disappearing. One click from where
   you were beats a dead end.
3. The English forms — demo, contact, newsletter, download. The labels,
   the placeholders, the validation messages and the thank-you states are
   all English. What they post is unchanged: same MailerLite form IDs,
   same GRAVITY group, same automations. No new field, no new group,
   nothing to reconfigure on the MailerLite side.
4. /en/pricing/ — the cards now read 0 EUR, 799 EUR and 1,799 EUR. The
   Polish /cennik/ is untouched at 0, 2999 and 7999 PLN; that split is
   deliberate. One thing to know before you click: the Buy buttons still
   go to the PLN-priced Stripe checkouts, because you're setting up the
   euro prices there yourself.
5. The English header menu is one item shorter than the Polish one — no
   ROI Calculator. See "There is no English calculator" below.
6. /en/nonsense/ — should give you the English 404, not the Polish one.
   This only works over a real server with the .htaccess active; in the
   local preview above you'll get python's own plain 404 instead.


There is no English calculator
------------------------------
/en/roi-calculator/ is gone, at your call, and the Polish /kalkulator/ is
untouched. Worth writing down why, because the page did exist in the last
preview and its absence is the change you're most likely to notice.

The calculator quotes PLN, and that is the smaller half of the problem.
Its day-rate slider runs 500 to 4000 with a default of 1500 — a range of
Polish contractor rates. Relabel that in euro without rescaling it and it
asks an English visitor whether their people cost 4,000 EUR a day,
multiplies by headcount, and presents the total as a finding. An English
reader gets no calculator rather than a confident wrong one.

Removing it took more than deleting the page. The English nav is built by
asking for each item's URL, and for a page with no English version that
lookup deliberately falls back to the Polish URL — which is right for a
page still awaiting translation, and wrong for one that will never have
an English version. So the site now distinguishes the two, and asking for
a URL that doesn't exist raises an error instead of quietly handing back
the Polish one. The privacy policy is the other side of that judgement:
also Polish-only, but still linked from the English nav, labelled "(in
Polish)" — a privacy policy says the same thing in any language, and a
calculator in the wrong currency does not.

Two consequences you can see. The English menu drops to Home, Download
and Contact; Pricing was already in the secondary menu in both languages,
so nothing became unreachable, but say the word if you'd rather it were
promoted. And the second button under the "for business" block on the
English home page is gone, because it pointed at the calculator.

Bringing it back is a content decision, not a code one: a euro default
and range for each of the two sliders. The page itself is still wired for
English underneath — the translated labels and the English FAQ markup are
all still in the codebase, waiting.


The eighteen URLs
-----------------
  /                        /en/
  /czym-jest-esb/          /en/what-is-esb/
  /technologia/            /en/technology/
  /integracje/             /en/integrations/
  /cennik/                 /en/pricing/
  /case-studies/           /en/case-studies/
  /kontakt/                /en/contact/
  /pobieranie/             /en/download/
  /kalkulator/             (Polish only)
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
- hreflang reciprocates on all 16 paired pages; the sitemap lists 18
  URLs and neither 404. /kalkulator/ no longer advertises an English
  version, which it stopped doing by itself the moment the English page
  was removed — checked rather than assumed.
- This archive itself was extracted, served, and clicked through by a
  script that starts on the Polish home page, follows the language
  switcher across, and visits all eight English pages — checking each one
  loads, is in English, has real content, and switches back to the right
  Polish page. That check exists because the previous delivery's only
  fault was in the packaging, not the build.
- No English page links to the calculator, and /en/roi-calculator/ is
  actually absent from the archive rather than merely unlinked. Unlinked
  is not gone: a page still sitting on the server is one Google can still
  find and one a stale bookmark still opens.


One Polish page changed, on purpose
-----------------------------------
/kalkulator/ — the day-rate slider now starts at "1500" rather than
"1 500". That looks like a typo and isn't. Polish only groups thousands
from five digits up, so the calculator's own output has always rendered
1500 the moment you touch the slider; only the static starting label
disagreed with it. Both now come from the same formatter. Above five
digits the grouping is back: 12 000.
