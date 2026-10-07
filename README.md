# walk-engine

The shared engine of the walk-around Korean games 성실호 (exodus-a), 형제 (expert-brother) and 방과 후 (sora-vocab).
- `engine.js` is the one engine. Each game has `src/game.js` (`var GAME={prefix, title, log, term, player}`), and its page decides
  the optional parts: talk portraits need `#face` in the dialogue box, and 나 꾸미기 needs `#mePanel`.
- `./sync.sh` copies `engine.js` into every game's `src/engine.js` (generated, with a header saying so). Then run each game's
  build and playtests before publishing.
- Scripted walks: a dialogue step with `walk:{npc:'id', from:[x,y]}` makes that NPC, once the conversation closes, appear at
  `from` and walk the shortest path to its own spot (`x`,`y`). It already counts as standing there for talking and collisions. If
  someone blocks the way in, it walks as close as it can and then steps in.
- `leave:{npc:'id', to:[x,y]}` on the step whose flag hides that NPC (the line that narrates the exit): it walks from its spot to
  `to` (a door, the map edge, up a tree) right away, during that line, and is gone. Put it on the line that says they leave, not
  a later one, or they linger after the text says they left. Both take one object or a list.
- 문제 알리기 (START menu, added by the engine): game or Korean problem, plus a note. Context is attached automatically: chapter, room, position, objective, the last lines and the last looked-up word. 보내기 links to the word-reports inbox (`https://seldoncortex.com/word-reports/#…`); see the word-reports repo.
- Front layer: a legend entry can name `front:'tileName'`. That tile function runs after the characters, without clipping, so a tree canopy can overhang the row above and cover the player walking behind it.
- Choices that aren't quizzes: a step with `choose:[[label, fn|null], …]` shows buttons, closes the conversation and runs `fn`. An inspect line (spots/things) may be `{steps:[…]}`. `nextChapterAsk(line)` builds the end-of-chapter "go on to the next one?" prompt for a gate.
- Sitting: an NPC with `sit:true` (or a function) is drawn seated and doesn't turn to talk; `chair:` names a look (custom art) to sit on.
  A dialogue step `sit:{npc:'chairId'}` sits the player on that chair facing its direction (`sit:{x,y,dir,chair}` anywhere); the first
  arrow key stands them up, and the save keeps where they stood. Chair art options: `back` (bottom rows redrawn over the sitter: the
  backrest of a chair facing away), `keep` (sitter rows kept, default 12 = head to belt), `drop` (px the sitter sinks, default 2),
  `lift` (px the whole seat rises, e.g. a stool pulled up to the table in the row above).
- Camera: a step with `cam:[x,y]` glides the camera to that tile; `cam:null` (or the end of the conversation) brings it back.
  During any conversation the camera also glides (never jumps) so the player and the speaker stay above the dialogue box. It
  only moves when they would be covered, only ever further (no bobbing as the box grows line to line), may scroll past the
  bottom map edge by what the box covers, and holds for a moment after the end so a follow-up note doesn't make it dip.
- The ! / ? marker of the character you're talking to is hidden while you talk.
- Review questions (the ? marker) are asked by the narrator, not in the NPC's voice: the sentences are generic examples.
- Praise after an answer: a question step's NPC repeats the line with "맞아요!" (or `ok:`) in front, as a reply to you. When the
  line is the speaker's own words (their question, their broadcast), mark the step `own:1`: the praise is a toast and the line
  stays clean. Word-order tiles always work that way (the assembled sentence is someone speaking).
- Word-order tiles never start in the solved order.
- NPC options: `proxy:()=>npc` — talking to this one talks to another (e.g. a table that hands the conversation to whoever's turn
  it is; it may stand on furniture); `look:null` — draw no body, only its marker; `nomark` (true or a function) — hide its
  marker; `markDx` / `markDy` — move its marker (px), e.g. into the middle of a two-tile table.
- Step `turn:{npc:'id', dir:'left'}` (or a list): turns an NPC to face that way and keeps it there (someone looks at the speaker).
- Art transforms: `ART.rot(rows, q)` turns a pixel grid (array of strings of palette keys) clockwise by quarter turns (`-1` =
  counter-clockwise), `ART.flipH` / `ART.flipV` mirror it, `ART.put(rows, pal, X, Y)` draws it top-down (no bottom-alignment, for
  pieces of a tile). Draw a picture once, upright, and turn it to fit: e.g. 방과 후's 방송실 east windows show an upright street
  turned with `ART.rot(street, 1)` (sky to the outer edge, road to the room); a west wall would use `-1`.
- Word help (tap a word) stays open until ×, A, B or the next line. Word-order tiles: after a 4 s pause or a wrong tile, the next right
  tile gets the `hint` class (bobbing, via each game's shell CSS); no instruction text.
- 디버그 (START menu, saved per game): adds a 건너뛰기 button to every conversation. It runs the conversation to the end with right
  answers and all its effects, and stops at a real choice (`choose`). For testing.

## Tools
- `tools/ctl.mjs`: hands-on controller for playing a game like a player would (one phone-sized Chrome; each command presses keys,
  walks, taps, or looks, then saves a screenshot and prints the visible text). From a game's repo root:
  `node ../walk-engine/tools/ctl.mjs start ch1`, then `walk`, `key`, `tap`, `tapword`, `shot`, `stop`. `look` (around the player),
  `look all`, or `look <col> <row> [w] [h]` save a close-up of the live game screen, pixel for pixel, unsmoothed: what a player
  sees by holding the phone closer. Blind playtesters get this, not zoom.mjs (whose save-state specs need the chapter's internals).
- `tools/zoom.mjs`: pixel inspector for sprite and tile art. From a game's repo root, after its build:
  `node ../walk-engine/tools/zoom.mjs spec.json out/`. The spec lists scenes (a chapter save to load, optional setup JS, a tile
  rectangle); each is read straight off the game canvas and blown up without smoothing (default 8×), plus a labelled `sheet.png`.
  Phone-sized screenshots hide overlaps and odd shapes; use this to check any art change. Example spec:
  `{"ch":"ch1","scale":8,"scenes":[{"name":"seat","save":{"zone":"class","x":14,"y":11,"dir":"left","f":{"paidFine":1}},"setup":"sitDown({npc:'seat'});1","tiles":[9,9,14,12]}]}`
