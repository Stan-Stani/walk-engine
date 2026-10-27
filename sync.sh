#!/usr/bin/env bash
# Copy the shared engine into each game (src/engine.js is generated — edit walk-engine/engine.js instead).
# No arguments: every game in games.json; or name the folders: ./sync.sh sora-vocab daneo-maul
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
games=("$@"); [ ${#games[@]} -eq 0 ] && read -r -a games <<< "$(node -e "console.log(require('$here/games.json').games.map(g=>g.dir).join(' '))")"
# the last commit that changed engine.js (not walk-engine's HEAD: a README or app commit doesn't touch the games); "uncommitted" if it has local edits
ver=$(git -C "$here" log -1 --format=%h -- engine.js 2>/dev/null || true); git -C "$here" diff --quiet HEAD -- engine.js 2>/dev/null || ver=uncommitted
for g in "${games[@]}"; do
  dst="$here/../$g/src/engine.js"
  { echo "/* GENERATED from walk-engine/engine.js ($ver) — do not edit here; edit walk-engine and run its sync.sh. */"; cat "$here/engine.js"; } > "$dst"
  echo "synced → $g/src/engine.js"
done
