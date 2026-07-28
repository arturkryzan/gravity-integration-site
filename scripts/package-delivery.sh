#!/bin/bash
# Rebuild the two archives that get handed to Artur.
#
# Why this exists: both zips were assembled by hand, three sessions running,
# from prose files that lived in /tmp. /tmp does not survive the container
# being reclaimed, so every session that wanted to ship a build started by
# rewriting a README it could no longer read. The prose now lives in
# packaging/ under version control, and this script is the assembly step that
# used to be a dozen remembered commands.
#
#   dist/gravity-site-pl-en.zip      the clickable site + run-book + preview
#   dist/gravity-en-patches-v2.zip   the English work as a replayable series
#
# Usage:  bash scripts/package-delivery.sh [BASE_NEW] [BASE_FULL]
#
# BASE_NEW  is the commit Artur's clone already has; patches after it go in
#           new/. Default 44208ba, "Translate the rest of the content".
# BASE_FULL is the commit before any English work; everything after it goes in
#           full/. Default 4129cd0, "Teach the codebase about locales".
#
# Both defaults are correct until he pushes; once he has, re-derive BASE_NEW
# from what his branch actually contains or the series will replay work he
# already has. `git am --skip` recovers from getting it wrong, but knowing the
# base is cheaper than recovering.

set -euo pipefail
cd "$(dirname "$0")/.."

BASE_NEW="${1:-44208ba}"
BASE_FULL="${2:-4129cd0}"
OUT="$PWD/dist-delivery"

if [ -n "$(git status --porcelain)" ]; then
  echo "refusing to package a dirty tree — commit or stash first" >&2
  git status --short >&2
  exit 1
fi

echo "→ building"
npm run build --silent

rm -rf "$OUT"
mkdir -p "$OUT/stage" "$OUT/patches/new" "$OUT/patches/full"

echo "→ staging the site archive"
cp -r dist "$OUT/stage/gravity-preview"
cp packaging/README.txt packaging/PREVIEW.command DEPLOY.md "$OUT/stage/"
chmod +x "$OUT/stage/PREVIEW.command"

# zip APPENDS to an existing archive rather than replacing it, so every target
# is removed first. A stale entry inside a 13 MB zip is not something you
# notice by looking at the file size.
rm -f "$OUT/gravity-site-pl-en.zip"
( cd "$OUT/stage" && zip -qr "$OUT/gravity-site-pl-en.zip" \
    README.txt DEPLOY.md PREVIEW.command gravity-preview )

echo "→ generating patches"
git format-patch -q "$BASE_NEW..HEAD"  -o "$OUT/patches/new"
git format-patch -q "$BASE_FULL..HEAD" -o "$OUT/patches/full"
# APPLY.txt quotes the patch counts and the tree hash they replay to. Those
# were literals once, and they were wrong within one commit of being written —
# a document that confidently states a stale hash is worse than one that omits
# it, because the reader checks the hash, sees a mismatch, and stops trusting
# the rest. They are placeholders now, filled in from what was actually
# generated a few lines above.
NNEW=$(ls "$OUT/patches/new" | wc -l | tr -d ' ')
NFULL=$(ls "$OUT/patches/full" | wc -l | tr -d ' ')
sed -e "s/@@TREE@@/$(git rev-parse 'HEAD^{tree}')/g" \
    -e "s/@@NNEW@@/$NNEW/g" \
    -e "s/@@NFULL@@/$NFULL/g" \
    packaging/APPLY.txt > "$OUT/patches/APPLY.txt"
if grep -q '@@' "$OUT/patches/APPLY.txt"; then
  echo "APPLY.txt still has unfilled placeholders" >&2; exit 1
fi
# The counts are derived but the annotated list under "new/" is hand-written,
# because the useful half of it is the commentary — which patch turns the
# English site on, which one touches a Polish page. Nothing stops the two from
# drifting apart except this: if you add a commit and don't describe it, the
# highest number the prose mentions falls behind the count and the build stops.
if ! grep -q "^  $(printf '%04d' "$NNEW")  " "$OUT/patches/APPLY.txt"; then
  echo "APPLY.txt describes fewer patches than new/ contains ($NNEW)." >&2
  echo "Add the missing entry to packaging/APPLY.txt and re-run." >&2
  exit 1
fi

rm -f "$OUT/gravity-en-patches-v2.zip"
( cd "$OUT/patches" && zip -qr "$OUT/gravity-en-patches-v2.zip" APPLY.txt new full )

# The point of the series is that it reproduces the tree that was tested, so
# the script proves that rather than asserting it. A patch that applies but
# lands somewhere else is the failure mode worth catching, and it is invisible
# in the git am output.
echo "→ replaying both series into throwaway clones"
HEADTREE=$(git rev-parse 'HEAD^{tree}')
fail=0
for pair in "new:$BASE_NEW" "full:$BASE_FULL"; do
  set -- ${pair//:/ }
  name=$1; base=$2
  work="$OUT/replay-$name"
  rm -rf "$work"
  git clone -q . "$work"
  ( cd "$work" && git checkout -q "$base" && git am -q "$OUT/patches/$name"/*.patch ) 2>/dev/null
  got=$(cd "$work" && git rev-parse 'HEAD^{tree}')
  if [ "$got" = "$HEADTREE" ]; then
    echo "   $name/  → $got  matches HEAD"
  else
    echo "   $name/  → $got  DOES NOT MATCH $HEADTREE" >&2
    fail=1
  fi
  rm -rf "$work"
done
rm -rf "$OUT/stage" "$OUT/patches"
[ "$fail" -eq 0 ] || { echo "replay mismatch — do not ship these patches" >&2; exit 1; }

echo
ls -lh "$OUT"/*.zip
echo
echo "Next: extract the site zip, serve it on 8414, and run"
echo "  CHROME=/opt/pw-browsers/chromium-*/chrome-linux/chrome node scripts/verify-delivery.mjs"
echo "That harness walks the ARCHIVE, not dist/ — which is where the one"
echo "packaging bug this project has actually shipped would have been caught."
