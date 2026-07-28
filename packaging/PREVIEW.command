#!/bin/bash
# Double-click this file in Finder to preview the site locally.
#
# Why a server and not just opening index.html: every URL on this site ends
# in a slash (/cennik/, /en/pricing/) and resolves to an index.html inside
# that folder. A browser opening a file:// path has no rule that turns a
# folder into its index.html, so half the links dead-end. A server does.
#
# Nothing is installed and nothing leaves your machine — python3 ships with
# macOS, and this serves only to 127.0.0.1.

cd "$(dirname "$0")/gravity-preview" || exit 1

PORT=8765
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT + 1)); done

echo ""
echo "  gravity-integration.com — local preview"
echo ""
echo "  Polish   http://127.0.0.1:$PORT/"
echo "  English  http://127.0.0.1:$PORT/en/"
echo ""
echo "  Close this window (or press Ctrl-C) when you're done."
echo ""

sleep 1 && open "http://127.0.0.1:$PORT/" &
python3 -m http.server "$PORT" --bind 127.0.0.1
