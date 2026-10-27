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
  **Restore…** on the list: pick a backup file (the picker opens in that folder), or paste text copied from a game's 저장 옮기기 in
  Chrome; your saves as they were are backed up first. (Android 9 and older keep them in the app's own folder, lost on uninstall.)
- **Sharing**: a game's 보내기 and 물어보기 open Android's share sheet (WebView has no navigator.share; boot.js adds one).
- Links to other sites (문제 알리기, a note's sources) open in the browser.

The list is `Games.kt`: add 소리 엽서 there once it's public.

## Build and install

```sh
cd android
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"   # or any JDK 17+
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

It is signed with the build machine's debug key (`~/.android/debug.keystore`). Android only updates an app with the key it
was installed with, so build updates on the same machine; an APK from another machine has to be installed after uninstalling
(which deletes the saves). A release key of your own (kept out of the repo) would make every machine's build an update.
