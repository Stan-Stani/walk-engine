# walk-engine

The shared engine of the walk-around Korean games 성실호 (exodus-a), 형제 (expert-brother) and 방과 후 (sora-vocab).
- `engine.js` is the one engine. Each game has `src/game.js` (`var GAME={prefix, title, log, term, player}`), and its page decides
  the optional parts: talk portraits need `#face` in the dialogue box, and 나 꾸미기 needs `#mePanel`.
- `./sync.sh` copies `engine.js` into every game's `src/engine.js` (generated, with a header saying so). Then run each game's
  build and playtests before publishing.
