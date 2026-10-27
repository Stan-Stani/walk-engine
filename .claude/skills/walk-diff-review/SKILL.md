---
name: walk-diff-review
description: Review a change to walk-engine or a walk game (점심 방송, 성실호, 형제, 단어 마을, ことばのむら, 소리 엽서) before it ships — the engine/game rules, line English, saves, tests. Use when asked to review a diff, a commit, or work an agent (Codex, a subagent) just did in these repos.
---

# Reviewing a walk-engine / walk game change

If the `walk-game-craft` skill is installed, load it too: its story, teaching and review rules (and the owner's settled decisions)
come first. This one is the mechanical checklist for a diff. Report findings most-severe first, each with file:line and what breaks
for a player; don't report what the owner settled (listed in each game's CLAUDE.md).

## 1. What changed, and is it in the right place
- `git diff` (or the commits) in every repo touched. `src/engine.js` and `index.html` are generated: a hand edit there is a finding
  (edit `walk-engine/engine.js` and run `sync.sh`; edit `src/` and run `build.py`).
- An engine change must be synced to every game in `walk-engine/games.json`, each built, and each `src/engine.js` header must name
  the last commit that changed `engine.js`.

## 2. Things that silently break
- **Saves:** a chapter's save key (`CH.save`), `GAME.prefix`, or a key a released game reads (`KEY('taps')`, `KEY('lineQ')`,
  `KEY('looks')`, `KEY('lv')`, `walk-hints`, `walk-count`) renamed or reshaped without reading the old form. Players lose progress.
- **Line English:** `src/lines-en.json` is keyed by the exact Korean. An edited line (even a particle) drops its English with no
  error; build.py must report `0 English entries no longer in the game`, and each edited line needs new English.
- **Dictionary:** new words need definitions (`lexicon/extract.py .` → `0 without a definition`).
- **School / maps:** a 교시 that redraws the school, or a tile drawn its own way outside `VARIANTS` (점심 방송's validate checks).
- **Engine field names:** a new step field colliding with an existing one (e.g. `look` is a step's portrait).
- **Japanese (ことばのむら):** new UI text needs a `GAME.ui` entry; text read from the page must drop furigana (`shownText`).
- **소리 엽서:** no plot summaries anywhere the owner will read (reports, commit messages); it stays private.

## 3. Run the checks
- Engine: `node walk-engine/tests/run.mjs` (builds the test games with the working engine; real taps).
- Each touched game: `python3 build.py && node tests/validate.mjs`, `node tests/coverage.mjs <ch>`, `node tests/play.mjs <ch> --fast`.
- Play a changed scene yourself through the `walk-ctl` MCP tools (start, walk, tapword, look) and look at the screenshots.
- `walk-engine/tools/ship.sh --dry-run` runs the whole chain without pushing.
