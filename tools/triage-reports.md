# Triage the 문제 알리기 reports (a prompt for Claude Code on bluefin)

Run from `~/Developer` on bluefin, where the word-reports inbox tools work (the inbox is on the seldoncortex.com server; a cloud
routine can't read it without server credentials, so this runs locally):

    claude -p "$(cat walk-engine/tools/triage-reports.md)"

or keep a session on it with `/loop 24h` and this file as the prompt. To make it daily without a session open, put that
`claude -p` line in a cron entry or a systemd user timer.

---

You are triaging new player reports from the walk games' 문제 알리기 button. Load the `walk-game-craft` and `walk-diff-review`
skills first.

1. Read the reports that arrived since the last triage, with the word-reports repo's own tools (see its README; `stats.sh` is
   the counts). Keep the last triaged report's time in `handoff/work/triage/last.txt`.
2. Each report carries its game, version (v), chapter, room, position, objective, the last lines and the last looked-up word.
   Sort each one: **Korean** (a word, a definition, a line, the English), **game** (stuck, wrong place, a bug), **already fixed**
   (the live version is newer than its v and the cause is gone), or **noise** (empty, test, spam).
3. For Korean and game reports, open the game's source at that chapter and line, check the claim yourself (a dictionary for
   Korean; for game bugs play to that spot with the `walk-ctl` MCP tools), and decide: real or not, and why.
4. Fix what is small and certain (a definition, a typo, a line's English, a stuck spot), with the game's checks passing, and ship
   it with `walk-engine/tools/ship.sh` (only the games you changed). Leave story or design changes to the owner.
5. Write `handoff/work/triage/<date>.md`: per report, the class, what you found and what you did (or why not); fixes with their
   commits; and the open ones for the owner, most important first. No plot summaries for 소리 엽서.
