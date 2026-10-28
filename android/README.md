# Walk Games (Android)

One app with every published walk game (점심 방송, 성실호, 형제, 단어 마을, ことばのむら), for the owner's phone.

- **The real games, at their real address.** Each game opens full screen at `https://stan-stani.github.io/<game>/`, so it is
  the published build and its saves are that site's localStorage, as in a browser. They are the app's own: progress in Chrome
  doesn't carry over, and uninstalling the app deletes it.
- **Offline.** Every file a game loads (its page, `version.json`, audio, Google Fonts) goes through `OfflineCache`: the site
  first, with the saved copy's ETag (an unchanged file costs a 304), and the saved copy when there's no network. Opening the
  app brings every game's copy up to date, so a game never opened yet still plays offline. A game's own update check
  (`version.json?t=…`) still reaches the site, so a new version arrives as it does in a browser. About 31 MB, mostly the
  Korean and Japanese font subsets (all of them, so any line looks the same offline).
- **Never counted in 통계.** Every game opens with `?count=0`, `assets/boot.js` sets `walk-count=0` before the game's own
  scripts run and drops a count beacon, and the app answers `/api/word-reports/count` itself (204) without sending it.
- **Voice.** Android's WebView has no `speechSynthesis`; `boot.js` provides one backed by the phone's text-to-speech
  (`Speech.kt`), so lines are read aloud and 듣기 문제 work as in Chrome.
- **Saves backup**: every walk game's saves (the 저장 옮기기 format) go to `Downloads/WalkGames/` when you leave a game, every 10
  minutes while playing and when the list opens, only when something changed; the newest 10 stay. Downloads outlives an uninstall.
  **Restore…** on the list: pick a backup file (the picker opens in that folder), or a game's 저장 옮기기 file from Chrome; your saves
  as they were are backed up first, and no game opens until the restore is written (it would load the old saves and keep them).
  Backups and restores have their own worker, never queued behind the offline downloads. A game's 저장 옮기기 works here too: the
  app gives the page a file picker and writes 내보내기's file to Downloads/WalkGames. (Android 9 and older keep them in the app's own folder, lost on uninstall.)
- **Sharing**: a game's 보내기 and 물어보기 open Android's share sheet (WebView has no navigator.share; boot.js adds one).
- **AnkiDroid**: a game's Anki button sends cards through AnkiDroid's content provider (`Anki.kt`, no library): note type "Walk
  Games (ko)" (front read aloud by AnkiDroid's TTS) and a deck per game, made on first use; AnkiDroid's permission is asked once.
- **Rotate icon** (`RotateHint.kt`): hold the phone the other way from the game and a rotate icon shows for 3 seconds; a tap
  turns the game that way and keeps it there whatever auto-rotate says (the games' own 가로 화면 needs page fullscreen, which
  WebView lacks, so it isn't offered in the app).
- Links to other sites (문제 알리기, a note's sources) open in the browser.

The list is `Games.kt`: add 소리 엽서 there once it's public.

## Build and install

```sh
cd android
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"   # or any JDK 17+
export WALK_KEYSTORE=~/.config/walk/walk-release.jks                             # the release key, never in the repo
read -rs WALK_KEYSTORE_PASSWORD && export WALK_KEYSTORE_PASSWORD                 # typed, kept out of shell history
./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

Every machine that has the same `walk-release.jks` (and its password) builds APKs that update each other's installs. Make the
key once with `keytool -genkeypair -v -keystore walk-release.jks -alias walk -keyalg RSA -keysize 4096 -validity 10000`, keep
the file and password in a password manager, and copy the file to the other machine yourself. Lose it and the next install
has to uninstall first (export saves beforehand: 저장 옮기기 → 내보내기, then Restore… after).

Without `WALK_KEYSTORE`, `assembleRelease` makes `app-release-unsigned.apk`, which won't install; `assembleDebug` still builds
one signed with the machine's debug key (`~/.android/debug.keystore`), which only updates installs from that same machine.
