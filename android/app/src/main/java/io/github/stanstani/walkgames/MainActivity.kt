package io.github.stanstani.walkgames

import android.app.Activity
import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.util.TypedValue
import android.view.WindowInsets
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.concurrent.Executors

/** Every game in one list. Opening the app brings each game's offline copy up to date (when there's internet); tap one to play. */
class MainActivity : Activity() {
    private lateinit var cache: OfflineCache
    private val status = mutableMapOf<String, TextView>()
    private val pool = Executors.newSingleThreadExecutor()

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        loadGames(this)
        cache = OfflineCache(this)
        val list = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(20))
        }
        list.addView(text("Walk Games", 26f, 0xFFFFFFFF, bold = true))
        list.addView(text("Saved for offline play whenever there's internet · never counted in 통계", 13f, 0xFF9AA3B5).apply { setPadding(0, dp(4), 0, dp(12)) })
        for (g in GAMES) {
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(16), dp(14), dp(16), dp(14))
                background = GradientDrawable().apply { setColor(0xFF1E2230.toInt()); cornerRadius = dp(12).toFloat() }
                isClickable = true
                isFocusable = true
                setOnClickListener { startActivity(Intent(this@MainActivity, GameActivity::class.java).putExtra(GameActivity.EXTRA_GAME, g.slug)) }
            }
            card.addView(text(g.title, 22f, 0xFFFFFFFF, bold = true))
            card.addView(text(g.blurb, 14f, 0xFFC4CAD6))
            card.addView(text("", 12f, 0xFF8EE3A6).apply { setPadding(0, dp(6), 0, 0); status[g.slug] = this })
            list.addView(card, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(12) })
        }
        val root = ScrollView(this).apply { setBackgroundColor(0xFF12141C.toInt()); addView(list) }
        root.setOnApplyWindowInsetsListener { v, insets ->  // edge to edge on Android 15: keep the list clear of the bars
            @Suppress("DEPRECATION")
            v.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            insets
        }
        setContentView(root)
    }

    override fun onResume() {
        super.onResume()
        pool.execute { if (refreshGames(this)) runOnUiThread { recreate() } }  // a game added to games.json since
        for (g in GAMES) {
            val have = cache.read(android.net.Uri.parse(g.url + "version.json"))?.let { runCatching { JSONObject(String(it.body)) }.getOrNull() }
            show(g, if (cache.read(android.net.Uri.parse(g.url)) != null) have ?: JSONObject() else null, updating = true)
            pool.execute {
                val v = cache.refresh(g)
                runOnUiThread { show(g, v, updating = false) }
            }
        }
    }

    private fun show(g: Game, v: JSONObject?, updating: Boolean) {
        val when_ = v?.optString("t")?.let { t ->
            runCatching { DateTimeFormatter.ofPattern("MMM d, HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(t.replace(Regex("T(\\d\\d:\\d\\d)Z$"), "T$1:00Z"))) }.getOrNull()
        }
        status[g.slug]?.apply {
            text = when {
                v != null -> "Offline ready" + (when_?.let { " · updated $it" } ?: "") + (if (updating) " · checking…" else "")
                updating -> "Downloading…"
                else -> "Not saved yet (needs internet once)"
            }
            setTextColor(if (v != null) 0xFF8EE3A6.toInt() else 0xFFF2B450.toInt())
        }
    }

    private fun text(s: String, sp: Float, color: Long, bold: Boolean = false) = TextView(this).apply {
        text = s
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
        setTextColor(color.toInt())
        if (bold) typeface = Typeface.DEFAULT_BOLD
    }

    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()

    override fun onDestroy() {
        pool.shutdownNow()
        super.onDestroy()
    }
}
