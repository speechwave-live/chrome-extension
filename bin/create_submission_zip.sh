#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
cd "$ROOT"

VERSION="$(jq -r '.version' manifest.json)"
OUTPUT="speechwave-v${VERSION}.zip"

# The exact set of files Chrome loads at runtime: manifest.json, the files
# it directly references (service worker, popup, icons, content scripts),
# plus two runtime dependencies the manifest doesn't declare itself —
# popup/popup.js (loaded via a <script> tag in popup.html) and
# lib/phoenix.js (loaded via importScripts() inside background.js). No
# tests/, docs/, node_modules/, or dev tooling — this mirrors the file set
# from speechwave.zip, the actual 1.0.0 submission (2026-07-02).
#
# Keep this in sync with manifest.json. The check below will fail loudly if
# a manifest-referenced file is missing from this list.
FILES=(
  manifest.json
  LICENSE
  background/background.js
  content/content.js
  popup/popup.html
  popup/popup.js
  lib/phoenix.js
  lib/fireworks.js
  lib/default_remote_config.js
  adapters/google_slides.js
  adapters/index.js
  icons/icon16.png
  icons/icon48.png
  icons/icon128.png
)

for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "error: expected file missing: $f" >&2
    exit 1
  fi
done

# Drift check: confirm every file manifest.json actually references
# (service worker, popup, icons, content script sources) is included above.
# Catches the case where a new file gets added to manifest.json but this
# script isn't updated to match.
mapfile -t MANIFEST_REFERENCED < <(
  jq -r '
    [.background.service_worker, .action.default_popup]
    + (.icons // {} | to_entries | map(.value))
    + (.action.default_icon // {} | to_entries | map(.value))
    + (.content_scripts // [] | map(.js[]))
    | .[]
  ' manifest.json | sort -u
)
for f in "${MANIFEST_REFERENCED[@]}"; do
  if ! printf '%s\n' "${FILES[@]}" | grep -qxF "$f"; then
    echo "error: manifest.json references '$f' but it's not in this script's FILES list" >&2
    exit 1
  fi
done

rm -f "$OUTPUT"
zip -X -q "$OUTPUT" "${FILES[@]}"

echo "Created $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
