#!/usr/bin/env bash
# Claude Code Stop hook for a walk game repo (its .claude/settings.json runs it): before Claude stops with uncommitted changes in
# src/, build and validate. A failure, or an edited line that silently dropped its English, blocks the stop (exit 2) and the message
# goes back to Claude to fix. Nothing in src/ changed, or Claude is already answering this hook: nothing runs.
# Python: $WALK_PYTHON (ことばのむら's build needs fugashi), else python3.
in=$(cat)
case "$in" in *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0;; esac
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -f build.py ] && [ -n "$(git status --porcelain -- src 2>/dev/null)" ] || exit 0
if ! out=$("${WALK_PYTHON:-python3}" build.py 2>&1); then
  { echo "build.py failed after your changes in src/:"; echo "$out" | tail -25; } >&2; exit 2; fi
if echo "$out" | grep -qE '(^|[^0-9])[1-9][0-9]* English entries no longer in the game'; then
  { echo "An edited line lost its English (lines-en.json is keyed by the exact Korean):"; echo "$out" | grep -E 'English entries'
    echo "Translate the edited lines again (src/lines-todo.json gives was / was_en) and delete the old entries."; } >&2; exit 2; fi
if ! v=$(node tests/validate.mjs 2>&1); then
  { echo "tests/validate.mjs failed after your changes in src/:"; echo "$v" | tail -25; } >&2; exit 2; fi
exit 0
