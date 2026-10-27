package io.github.stanstani.walkgames

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream

/**
 * An empty page at the games' own address (https://stan-stani.github.io/__walk__/, answered by the app, never fetched), so the list
 * screen can read and write the games' saves (the site's localStorage) without opening a game. [run] waits until it has loaded.
 */
@SuppressLint("SetJavaScriptEnabled")
class SitePage(context: Context) {
    val view = WebView(context)
    private var ready = false
    private val waiting = mutableListOf<Pair<String, (String?) -> Unit>>()

    init {
        view.settings.javaScriptEnabled = true
        view.settings.domStorageEnabled = true
        view.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(v: WebView, req: WebResourceRequest): WebResourceResponse? =
                if (req.url.host == SITE_HOST && req.url.path.orEmpty().startsWith("/__walk__"))
                    WebResourceResponse("text/html", "utf-8", ByteArrayInputStream("<!doctype html><title>walk</title>".toByteArray()))
                else WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)))

            override fun onPageFinished(v: WebView, url: String?) {
                ready = true
                waiting.forEach { (js, then) -> v.evaluateJavascript(js, then) }
                waiting.clear()
            }
        }
        view.loadUrl("$SITE/__walk__/")
    }

    /** Runs a script in the page (on the main thread) and hands its result to [then]. */
    fun run(js: String, then: (String?) -> Unit) {
        if (ready) view.evaluateJavascript(js, then) else waiting += js to then
    }

    fun destroy() = view.destroy()
}
