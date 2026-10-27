package io.github.stanstani.walkgames

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import java.io.ByteArrayInputStream

/**
 * One game, full screen, at its real address (https://stan-stani.github.io/<game>/), so its saves are the site's localStorage like in a
 * browser (but this app's own: progress in Chrome doesn't carry over). Files come through [OfflineCache]; play counts never leave.
 */
class GameActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var speech: Speech
    private lateinit var cache: OfflineCache
    private val boot by lazy { "<script>" + assets.open("boot.js").use { String(it.readBytes()) } + "</script>" }

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        loadGames(this)
        val game = gameOf(intent.getStringExtra(EXTRA_GAME)) ?: return finish()
        cache = OfflineCache(this)
        WebView.setWebContentsDebuggingEnabled(applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0)
        web = WebView(this)
        web.setBackgroundColor(0xFF000000.toInt())
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
        }
        speech = Speech(this) { voices -> web.post { web.evaluateJavascript("window.__walkVoices&&__walkVoices($voices)", null) } }
        web.addJavascriptInterface(speech, "WalkTTS")
        web.addJavascriptInterface(Share(), "WalkShare")
        web.addJavascriptInterface(AnkiBridge(), "WalkAnki")
        web.webChromeClient = WebChromeClient()
        web.webViewClient = Client()
        setContentView(web)
        fullScreen()
        web.loadUrl(game.url + "?count=0")
    }

    private inner class Client : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? {
            val u = req.url
            if (u.host == "seldoncortex.com" && u.path.orEmpty().startsWith("/api/word-reports/count")) {
                return WebResourceResponse("text/plain", "utf-8", 204, "No Content", emptyMap(), ByteArrayInputStream(ByteArray(0)))
            }
            if (req.method != "GET" || !cache.covers(u)) return null
            val c = cache.fetch(u, copyFirst = u.host == "fonts.gstatic.com") ?: return null
            val body = if (c.type == "text/html" && u.host == SITE_HOST) withBoot(c.body) else c.body
            return WebResourceResponse(c.type, c.charset, 200, "OK", c.headers + ("Cache-Control" to "no-store"), ByteArrayInputStream(body))
        }

        /** Other sites (문제 알리기, a note's sources) open in the browser; the games stay here. */
        override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
            val u = req.url
            if (u.host == SITE_HOST && gameOf(u.pathSegments.firstOrNull()) != null) return false
            try {
                startActivity(Intent(Intent.ACTION_VIEW, u))
            } catch (e: ActivityNotFoundException) {
            }
            return true
        }

        /** The speech engine may get ready while the page loads, between boot.js asking for voices and defining __walkVoices. */
        override fun onPageFinished(view: WebView, url: String?) {
            view.evaluateJavascript("window.__walkVoices&&__walkVoices(${speech.voices()})", null)
        }

        override fun onReceivedError(view: WebView, req: WebResourceRequest, error: WebResourceError) {
            if (!req.isForMainFrame) return
            view.loadDataWithBaseURL(null, OFFLINE_PAGE, "text/html", "utf-8", null)
        }
    }

    /** The page's navigator.share (boot.js; WebView has none): Android's share sheet, so the player picks the app and the conversation. */
    private inner class Share {
        @JavascriptInterface
        fun share(text: String) = runOnUiThread {
            startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), null))
        }
    }

    /** The 사전's Anki button: AnkiDroid installed? and add these notes (asking for AnkiDroid's permission the first time). */
    private var ankiPending: String? = null

    private inner class AnkiBridge {
        @JavascriptInterface
        fun available() = Anki.installed(this@GameActivity)

        @JavascriptInterface
        fun add(payload: String) = runOnUiThread {
            ankiPending = payload
            if (checkSelfPermission(Anki.PERMISSION) == PackageManager.PERMISSION_GRANTED) sendAnki() else requestPermissions(arrayOf(Anki.PERMISSION), ANKI)
        }
    }

    override fun onRequestPermissionsResult(code: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, permissions, results)
        if (code != ANKI) return
        if (results.firstOrNull() == PackageManager.PERMISSION_GRANTED) sendAnki() else ankiDone(-1, "no permission")
    }

    private fun sendAnki() {
        val p = ankiPending ?: return
        ankiPending = null
        val c = applicationContext
        Thread {
            val r = runCatching { Anki.add(c, JSONObject(p)) }
            runOnUiThread { ankiDone(r.getOrDefault(-1), r.exceptionOrNull()?.message ?: "") }
        }.start()
    }

    private fun ankiDone(n: Int, err: String) = web.evaluateJavascript("window.__ankiDone&&__ankiDone($n,${JSONObject.quote(err)})", null)

    /** boot.js goes first in <head>, before any of the game's own scripts. */
    private fun withBoot(html: ByteArray): ByteArray {
        val s = String(html, Charsets.UTF_8)
        val head = Regex("<head[^>]*>", RegexOption.IGNORE_CASE).find(s)
        val at = head?.range?.last?.plus(1) ?: 0
        return (s.substring(0, at) + boot + s.substring(at)).toByteArray(Charsets.UTF_8)
    }

    /** No status or navigation bar while playing (a swipe from the edge shows them); the game keeps clear of a camera cutout. */
    private fun fullScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.apply {
                hide(WindowInsets.Type.systemBars())
                systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
            web.setOnApplyWindowInsetsListener { v, insets ->
                val i = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                v.setPadding(i.left, i.top, i.right, i.bottom)
                insets
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        }
    }

    /** A backup of the saves while playing (every 10 minutes) and on leaving the game; [Backups] skips one that changed nothing. */
    private val backupTick = object : Runnable {
        override fun run() {
            backup()
            web.postDelayed(this, 10 * 60_000L)
        }
    }

    private fun backup() {
        if (Uri.parse(web.url ?: "").host != SITE_HOST) return
        val c = applicationContext
        web.evaluateJavascript(Backups.EXPORT_JS) { r -> Backups.unquote(r)?.let { t -> Thread { Backups.save(c, t) }.start() } }
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        web.postDelayed(backupTick, 10 * 60_000L)
    }

    override fun onPause() {
        web.removeCallbacks(backupTick)
        backup()
        speech.stop()
        web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        if (::speech.isInitialized) speech.shutdown()
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_GAME = "game"
        private const val ANKI = 7
        private const val OFFLINE_PAGE = """<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="background:#111;color:#ddd;font:16px/1.5 sans-serif;padding:24px">
<p>This game hasn't been saved for offline play yet.</p><p>Open the app once with internet and it downloads every game.</p></body>"""
    }
}
