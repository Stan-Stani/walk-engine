#!/usr/bin/env bash
# Ship the committed engine to every game, from walk-engine:   tools/ship.sh [--dry-run] [game folder …]
#  1. each repo (walk-engine and the games) on its default branch, clean, fast-forwarded to GitHub (stops if one diverged or is dirty)
#  2. engine.js parses and the engine's own tests pass (tests/run.mjs)
#  3. sync.sh, then per game: build, validate, play.mjs --fast on its smoke chapter (games.json); the first failure stops everything
#  4. a game whose files changed gets the "Engine sync (walk-engine <hash>: <subject>)" commit
#  5. push walk-engine and the games, tools/sync_public.sh for the twins, then wait until every published game's live
#     version.json is this build. --dry-run stops before step 5.
# Python: $WALK_PYTHON (one with kiwipiepy/fugashi for the analyzers), else python3. No arguments = every game in games.json.
set -euo pipefail
eng="$(cd "$(dirname "$0")/.." && pwd)"; top="$(dirname "$eng")"; py="${WALK_PYTHON:-python3}"
dry=0; [ "${1:-}" = --dry-run ] && { dry=1; shift; }
field(){ node -e "const g=require('$eng/games.json').games.find(g=>g.dir==='$1');console.log((g&&g['$2'])||'')"; }
games=("$@"); [ ${#games[@]} -eq 0 ] && read -r -a games <<< "$(node -e "console.log(require('$eng/games.json').games.map(g=>g.dir).join(' '))")"
say(){ printf '\n== %s\n' "$*"; }
fail(){ printf '\nSTOPPED: %s\n' "$*" >&2; exit 1; }

say "1/5 repos up to date"
for r in walk-engine "${games[@]}"; do
  d="$top/$r"; [ -d "$d/.git" ] || [ -f "$d/.git" ] || fail "$r: no clone at $d"
  b=$([ "$r" = walk-engine ] && echo main || field "$r" branch)
  [ "$(git -C "$d" branch --show-current)" = "$b" ] || fail "$r: not on $b"
  git -C "$d" diff --quiet && git -C "$d" diff --cached --quiet || fail "$r: uncommitted changes"
  git -C "$d" fetch -q origin && git -C "$d" merge -q --ff-only "origin/$b" || fail "$r: can't fast-forward to origin/$b"
  echo "$r: $b at $(git -C "$d" rev-parse --short HEAD)"
done

say "2/5 engine checks"
node --check "$eng/engine.js"
node "$eng/tests/run.mjs" || fail "engine tests"

say "3/5 sync, build, validate, smoke"
"$eng/sync.sh" "${games[@]}"
for g in "${games[@]}"; do
  echo "-- $g"
  (cd "$top/$g" && "$py" build.py | tail -2 && node tests/validate.mjs | tail -1) || fail "$g: build or validate"
  (cd "$top/$g" && node "$eng/tools/play.mjs" "$(field "$g" smoke)" --fast | tail -2) || fail "$g: smoke playtest"
done

say "4/5 commit"
ver=$(git -C "$eng" log -1 --format=%h -- engine.js); subj=$(git -C "$eng" log -1 --format=%s -- engine.js)
for g in "${games[@]}"; do
  d="$top/$g"; git -C "$d" add -u -- src/engine.js index.html version.json 2>/dev/null || git -C "$d" add -u -- src/engine.js
  if git -C "$d" diff --cached --quiet; then echo "$g: nothing to commit"; else
    git -C "$d" commit -q -m "Engine sync (walk-engine $ver: $subj)"; echo "$g: $(git -C "$d" log --oneline -1)"; fi
done
[ $dry = 1 ] && { say "dry run: stopped before pushing"; exit 0; }

say "5/5 push and publish"
for r in walk-engine "${games[@]}"; do
  d="$top/$r"; b=$(git -C "$d" branch --show-current)
  if [ -n "$(git -C "$d" log --oneline "origin/$b..$b")" ]; then git -C "$d" push -q origin "$b"; echo "$r: pushed"; else echo "$r: up to date"; fi
done
for g in "${games[@]}"; do [ -n "$(field "$g" twin)" ] && (cd "$top/$g" && tools/sync_public.sh); done
pending=(); for g in "${games[@]}"; do [ -n "$(field "$g" site)" ] && pending+=("$g"); done
for i in $(seq 1 40); do
  left=()
  for g in "${pending[@]}"; do
    want=$(node -e "console.log(require('$top/$g/version.json').v)")
    live=$(curl -s "https://stan-stani.github.io/$(field "$g" site)/version.json?t=$RANDOM" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).v)}catch(e){console.log('')}})")
    [ "$want" = "$live" ] && echo "$g: live ($want)" || left+=("$g")
  done
  [ ${#left[@]} -eq 0 ] && { say "shipped"; exit 0; }
  pending=("${left[@]}"); sleep 15
done
fail "not live after 10 minutes: ${pending[*]}"
