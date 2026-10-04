#!/usr/bin/env bash
# Copy the shared engine into each game (src/engine.js is generated — edit walk-engine/engine.js instead).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
games=("$@"); [ ${#games[@]} -eq 0 ] && games=(exodus-a expert-brother sora-vocab)
for g in "${games[@]}"; do
  dst="$here/../$g/src/engine.js"
  { echo "/* GENERATED from walk-engine/engine.js ($(git -C "$here" rev-parse --short HEAD 2>/dev/null || echo uncommitted)) — do not edit here; edit walk-engine and run its sync.sh. */"; cat "$here/engine.js"; } > "$dst"
  echo "synced → $g/src/engine.js"
done
