package io.github.stanstani.walkgames

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.webkit.HttpAuthHandler
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebViewDatabase
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout

/**
 * The 통계 dashboard (https://seldoncortex.com/stats/), full screen. It sits behind the server's login (HTTP basic auth): asked the
 * first time, then kept in WebView's own store on this phone (never in the repo); a rejected login asks again.
 */
class StatsActivity : Activity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        web = WebView(this)
        web.setBackgroundColor(0xFF12141C.toInt())
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webViewClient = Client()
        val root = FrameLayout(this).apply { addView(web) }
        root.setOnApplyWindowInsetsListener { v, insets ->  // edge to edge on Android 15: keep the page clear of the bars
            @Suppress("DEPRECATION")
            v.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            insets
        }
        setContentView(root)
        web.loadUrl(STATS_URL)
    }

    private inner class Client : WebViewClient() {
        private var triedSaved = false  // the saved login was sent once this visit; asked again means it was rejected

        override fun onReceivedHttpAuthRequest(view: WebView, handler: HttpAuthHandler, host: String, realm: String) {
            val db = WebViewDatabase.getInstance(this@StatsActivity)
            val saved = db.getHttpAuthUsernamePassword(host, realm)
            if (!triedSaved && saved != null && saved.size == 2 && saved[0] != null && saved[1] != null) {
                triedSaved = true
                handler.proceed(saved[0], saved[1])
                return
            }
            askLogin(host, retry = saved != null) { user, pass ->
                if (user == null || pass == null) {
                    handler.cancel()
                    finish()
                } else {
                    db.setHttpAuthUsernamePassword(host, realm, user, pass)
                    triedSaved = true
                    handler.proceed(user, pass)
                }
            }
        }

        /** Links to other sites open in the browser; the dashboard's own pages stay here. */
        override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
            if (req.url.host == STATS_HOST) return false
            try {
                startActivity(Intent(Intent.ACTION_VIEW, req.url))
            } catch (e: ActivityNotFoundException) {
            }
            return true
        }

        override fun onReceivedError(view: WebView, req: WebResourceRequest, error: WebResourceError) {
            if (!req.isForMainFrame) return
            view.loadDataWithBaseURL(null, OFFLINE_PAGE, "text/html", "utf-8", null)
        }
    }

    /** The login dialog; [then] gets nulls on Cancel. */
    private fun askLogin(host: String, retry: Boolean, then: (String?, String?) -> Unit) {
        val user = EditText(this).apply { hint = "Username"; inputType = InputType.TYPE_CLASS_TEXT; setSingleLine() }
        val pass = EditText(this).apply { hint = "Password"; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD; setSingleLine() }
        val form = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = (20 * resources.displayMetrics.density).toInt()
            setPadding(p, p / 2, p, 0)
            addView(user)
            addView(pass)
        }
        AlertDialog.Builder(this).setTitle(if (retry) "통계 login didn't work — try again" else "통계 login")
            .setMessage(host).setView(form).setCancelable(false)
            .setPositiveButton("Log in") { _, _ -> then(user.text.toString(), pass.text.toString()) }
            .setNegativeButton("Cancel") { _, _ -> then(null, null) }
            .show()
    }

    @Deprecated("framework back")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    companion object {
        private const val STATS_HOST = "seldoncortex.com"
        private const val STATS_URL = "https://$STATS_HOST/stats/"
        private const val OFFLINE_PAGE = """<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="background:#111;color:#ddd;font:16px/1.5 sans-serif;padding:24px">
<p>통계 needs internet.</p></body>"""
    }
}
