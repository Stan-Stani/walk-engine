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
- Follower: a chapter's `FOLLOW:{name, look, when, talk}` walks one square behind you while `when()` is true (talk to it like
  anyone). When it starts in a talk with the person of that `name` (who hides on the same flag: "가자. 앞장서."), it starts from
  where they stood, so they don't blink out.
- 문제 알리기 (START menu, added by the engine): game or Korean problem, plus a note. Context is attached automatically: chapter, room, position, objective, the last lines and the last looked-up word. 보내기 links to the word-reports inbox (`https://seldoncortex.com/word-reports/#…`); see the word-reports repo.
- Front layer: a legend entry can name `front:'tileName'`. That tile function runs after the characters, without clipping, so a tree canopy can overhang the row above and cover the player walking behind it.
- Choices that aren't quizzes: a step with `choose:[[label, fn|null], …]` shows buttons, closes the conversation and runs `fn`. An inspect line (spots/things) may be `{steps:[…]}`. `nextChapterAsk(line)` builds the end-of-chapter "go on to the next one?" prompt for a gate.
- Sitting: an NPC with `sit:true` (or a function) is drawn seated and doesn't turn to talk; `chair:` names a look (custom art) to sit on.
  A dialogue step `sit:{npc:'chairId'}` sits the player on that chair facing its direction (`sit:{x,y,dir,chair}` anywhere); the first
  arrow key stands them up, and the save keeps where they stood. Chair art options: `back` (bottom rows redrawn over the sitter: the
  backrest of a chair facing away), `keep` (sitter rows kept, default 12 = head to belt), `drop` (px the sitter sinks, default 2),
  `lift` (px the whole seat rises, e.g. a stool pulled up to the table in the row above).
- Dialogue box: as tall as its line, never taller than it needs. The typing lays the whole line out first (the untyped rest
  invisible), so the box never grows mid-line and words never jump down a line. Its side is chosen once per conversation, when it
  opens, as Undertale's own dialogue code does: at the bottom unless the tallest box (three lines) would cover you or whoever
  you're talking to, then at the top (`.dlg.attop`; toasts and word help move down). The camera doesn't move for talk.
  `tools/linecheck.mjs` lays out every Korean string at phone width and lists any over three lines. Choices and word tiles are
  the one time the box grows, away from the edge it sits on.
- Camera: a step with `cam:[x,y]` glides the camera to that tile; `cam:null` (or the end of the conversation) brings it back. A
  camera cut chooses the box's side again, for the tile it shows, and frames that tile in the space the box leaves free. The
  camera never scrolls past the map.
- Phone screen (opt-in: shell has `#phonePanel` with `#pscr` inside `#screen`): a step's `phone:{app, post, by, when, count,
  comments:[[name,text],…], time, battery, culture}` shows an app on someone's phone filling the game view on that line. The D-pad
  scrolls it, A finishes the line and then closes it, B closes it; its words are tappable; it closes with the conversation.
- 문화 노트 (opt-in: shell has `#notes` and `#noteCard` in the journal; data in `globalThis.CULTURE_NOTES`): real-world culture behind a
  story moment, `{id:{t, lines:[[korean, english, [source numbers]]…], src:[[title, url]…]}}`. A step's `culture:'id'` (or a phone's,
  when it closes) adds it with a toast; the journal lists them; each line shows its source numbers and the sources are links.
- Answer choices (shell CSS): side by side when they fit, three short answers on one line, else two per row; toasts at the top edge.
- The ! / ? marker of the character you're talking to is hidden while you talk.
- Review questions (the ? marker) are asked by the narrator, not in the NPC's voice: the sentences are generic examples.
- Praise after an answer: a question step's NPC repeats the line with "맞아요!" (or `ok:`) in front, as a reply to you. When the
  line is the speaker's own words (their question, their broadcast), mark the step `own:1`: the praise is a toast and the line
  stays clean. Word-order tiles always work that way (the assembled sentence is someone speaking).
- Word-order tiles never start in the solved order.
- NPC options: `proxy:()=>npc` — talking to this one talks to another (e.g. a table that hands the conversation to whoever's turn
  it is; it may stand on furniture); `look:null` — draw no body, only its marker; `nomark` (true or a function) — hide its
  marker; `markDx` / `markDy` — move its marker (px), e.g. into the middle of a two-tile table.
  `fixed:1` — never turns to face you when you talk to it (furniture: a chair keeps facing its desk).
- Step `turn:{npc:'id', dir:'left'}` (or a list): turns an NPC to face that way and keeps it there (someone looks at the speaker).
- Art transforms: `ART.rot(rows, q)` turns a pixel grid (array of strings of palette keys) clockwise by quarter turns (`-1` =
  counter-clockwise), `ART.flipH` / `ART.flipV` mirror it, `ART.put(rows, pal, X, Y)` draws it top-down (no bottom-alignment, for
  pieces of a tile). Draw a picture once, upright, and turn it to fit: e.g. 방과 후's 방송실 east windows show an upright street
  turned with `ART.rot(street, 1)` (sky to the outer edge, road to the room); a west wall would use `-1`.
- Word help (tap a word) stays open until ×, A, B or the next line. Word-order tiles have no instruction text: only in the very first
  word-order question a player ever meets (per game, saved), after a 4 s pause the first right tile gets the `hint` class (bobbing,
  via each game's shell CSS). Never again after that, and never past the first tile. Number keys 1–9 place the nth tile still on the
  table, as 1–4 answer choices; arrows + A work too.
- 듣기 문제: review sometimes asks a word by sound alone (only with sound on). A shell button `#listenBtn` (START menu) turns that
  off, saved per game; `?listen=0` in the URL does the same. `tools/ctl.mjs` opens games with it off (testers can't hear).
- While a question waits with nothing selected (choices start unselected so A can't answer by accident), the A button dims.
- 디버그 (START menu, saved per game): adds a 건너뛰기 button to every conversation. It runs the conversation to the end with right
  answers and all its effects, and stops at a real choice (`choose`). For testing.

- Floor layer (opt-in): a zone's `floor:'tileName'`, or a legend entry's `floor:`, is drawn under each object (non-walkable tile)
  before the object's own tile, so object tiles draw only the object and look right in any room. A walkable tile is a floor itself
  unless its legend names one. Zones without `floor` are drawn exactly as before.
- Review computer: the `terminal` tile, or any legend entry with `term:1` (so a laptop can look different and still open review).
  Its name and lines come from the game's `term`; a chapter's own `term:{name,…}` overrides them (a paper 복습 노트 in one chapter,
  the 방송실's 복습 노트북 in the next).
- Grammar questions: a question step with `gram:1` tests a pattern (척, -대, -다 보니) asked under some word, not the word itself.
  It is asked in conversations as usual; review asks a word's own questions and skips these, so they never give that word a ★.
- Step `move:{npc:'id', to:[x,y], dir}` (or a list): mid-conversation, on that line, the NPC walks from where it stands to `to` and
  stays (someone crosses the room to apologise). The spot lasts until the chapter reloads; give the NPC `pos()` if it must survive one.
- NPC `hold:'phone'` (or a function of the story returning a prop name or null): a prop drawn in its hands, hidden when it faces
  away. The engine has `phone`; a chapter adds its own as `PROPS:{name:(X,Y,dir,t)=>…}`.
- Conversation pairs: `chat:'openerId'` on the NPC who answers; when both are present, talking to either plays the opener's lines,
  then the answerer's (each with its own portrait via a step's `look`), and the pair keeps facing each other.

## Tools
- `tools/ctl.mjs`: hands-on controller for playing a game like a player would (one phone-sized Chrome; each command presses keys,
  walks, taps, or looks, then saves a screenshot and prints the visible text). From a game's repo root:
  `node ../walk-engine/tools/ctl.mjs start ch1`, then `walk`, `key`, `tap`, `tapword`, `shot`, `stop`. `look` (around the player),
  `look all`, or `look <col> <row> [w] [h]` save a close-up of the live game screen, pixel for pixel, unsmoothed: what a player
  sees by holding the phone closer. Blind playtesters get this, not zoom.mjs (whose save-state specs need the chapter's internals).
  `CTL_SESSION=name` gives a tester its own Chrome (profile, port, screenshots), so two can play at once (never more than two).
- `tools/zoom.mjs`: pixel inspector for sprite and tile art. From a game's repo root, after its build:
  `node ../walk-engine/tools/zoom.mjs spec.json out/`. The spec lists scenes (a chapter save to load, optional setup JS, a tile
  rectangle); each is read straight off the game canvas and blown up without smoothing (default 8×), plus a labelled `sheet.png`.
  Phone-sized screenshots hide overlaps and odd shapes; use this to check any art change. Example spec:
  `{"ch":"ch1","scale":8,"scenes":[{"name":"seat","save":{"zone":"class","x":14,"y":11,"dir":"left","f":{"paidFine":1}},"setup":"sitDown({npc:'seat'});1","tiles":[9,9,14,12]}]}`
- `tools/zonedump.mjs` + `tools/zonediff.py`: pixel-checked refactors. `node ../walk-engine/tools/zonedump.mjs out/ [ch1,ch2]` draws every
  zone of every chapter whole (no people), with the story flags off, all on and in two fixed random mixes, at two clock moments, with
  Math.random seeded (deterministic: two dumps of the same build are identical). `python3 ../walk-engine/tools/zonediff.py before/ after/
  [diff/]` lists every changed 16×16 tile by chapter, zone and flag mix, writes before|after images with the changes boxed, and exits 1
  on any change. Take a dump before a refactor; after it, every changed tile should be one you meant to change.
