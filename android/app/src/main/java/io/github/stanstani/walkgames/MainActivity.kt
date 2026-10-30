package io.github.stanstani.walkgames

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.provider.DocumentsContract
import android.util.TypedValue
import android.view.WindowInsets
import android.widget.FrameLayout
import android.widget.Toast
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.concurrent.Executors

/**
 * Every game in one list. Opening the app brings each game's offline copy up to date (when there's internet); tap one to play.
 * Under the games: the 통계 dashboard ([StatsActivity]), the saves backup (see [Backups]) and Restore, from a backup file or from text copied from a game's 저장 옮기기.
 */
class MainActivity : Activity() {
    private lateinit var cache: OfflineCache
    private val status = mutableMapOf<String, TextView>()
    private val pool = Executors.newSingleThreadExecutor()
    private val saver = Executors.newSingleThreadExecutor()  // backups and restores: never behind the offline downloads in [pool]
    @Volatile private var restoring = false  // a restore under way: no game opens until it's written (it would load the old saves)
    private lateinit var site: SitePage
    private lateinit var saves: TextView

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
                setOnClickListener {
                    if (restoring) Toast.makeText(this@MainActivity, "Restoring…", Toast.LENGTH_SHORT).show()
                    else startActivity(Intent(this@MainActivity, GameActivity::class.java).putExtra(GameActivity.EXTRA_GAME, g.slug))
                }
            }
            card.addView(text(g.title, 22f, 0xFFFFFFFF, bold = true))
            card.addView(text(g.blurb, 14f, 0xFFC4CAD6))
            card.addView(text("", 12f, 0xFF8EE3A6).apply { setPadding(0, dp(6), 0, 0); status[g.slug] = this })
            list.addView(card, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(12) })
        }
        val stats = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(14))
            background = GradientDrawable().apply { setColor(0xFF181B26.toInt()); setStroke(dp(1), 0xFF2E3448.toInt()); cornerRadius = dp(12).toFloat() }
            isClickable = true
            isFocusable = true
            setOnClickListener { startActivity(Intent(this@MainActivity, StatsActivity::class.java)) }
        }
        stats.addView(text("통계", 18f, 0xFFFFFFFF, bold = true))
        stats.addView(text("Play counts on seldoncortex.com (login needed the first time)", 13f, 0xFF9AA3B5).apply { setPadding(0, dp(4), 0, 0) })
        list.addView(stats, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8); bottomMargin = dp(12) })
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(14))
            background = GradientDrawable().apply { setColor(0xFF181B26.toInt()); setStroke(dp(1), 0xFF2E3448.toInt()); cornerRadius = dp(12).toFloat() }
        }
        box.addView(text("Saves", 18f, 0xFFFFFFFF, bold = true))
        saves = text("", 13f, 0xFF9AA3B5).apply { setPadding(0, dp(4), 0, dp(10)) }
        box.addView(saves)
        box.addView(text("Restore…", 15f, 0xFF12141C, bold = true).apply {
            setPadding(dp(14), dp(8), dp(14), dp(8))
            background = GradientDrawable().apply { setColor(0xFFF2B450.toInt()); cornerRadius = dp(8).toFloat() }
            isClickable = true
            setOnClickListener { chooseRestore() }
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        list.addView(box, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8) })
        site = SitePage(this)
        val root = FrameLayout(this).apply {
            setBackgroundColor(0xFF12141C.toInt())
            addView(site.view, FrameLayout.LayoutParams(1, 1).also { site.view.alpha = 0f })  // the saves' page: present, never seen
            addView(ScrollView(this@MainActivity).apply { addView(list) })
        }
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
        backup { showSaves() }  // back from a game: its saves as they are now
        showSaves()
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

    /** Takes a backup of the saves as they are now (nothing is written when they haven't changed), then [then] on the main thread. */
    private fun backup(then: () -> Unit) = site.run(Backups.EXPORT_JS) { r ->
        saver.execute { Backups.unquote(r)?.let { Backups.save(this, it) }; runOnUiThread(then) }
    }

    private fun showSaves() {
        val t = Backups.lastTime(this)
        saves.text = if (t == 0L) "Backed up automatically to Downloads/WalkGames when you leave a game. No backup yet."
        else "Backed up automatically to Downloads/WalkGames (the last ${Backups.KEEP} are kept). Last: " +
            DateTimeFormatter.ofPattern("MMM d, HH:mm").withZone(ZoneId.systemDefault()).format(Instant.ofEpochMilli(t))
    }

    private fun chooseRestore() = startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
        .putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/plain", "application/octet-stream"))
        .putExtra(DocumentsContract.EXTRA_INITIAL_URI, DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:Download/WalkGames")), PICK)  // opens where the backups are

    @Deprecated("framework Activity result")
    override fun onActivityResult(request: Int, result: Int, data: Intent?) {
        super.onActivityResult(request, result, data)
        val uri = data?.data
        if (request != PICK || result != RESULT_OK || uri == null) return
        confirmRestore(runCatching { contentResolver.openInputStream(uri)?.use { String(it.readBytes()) } }.getOrNull().orEmpty())
    }

    private fun confirmRestore(text: String) {
        val data = Backups.dataOf(text)
        if (data == null) {
            Toast.makeText(this, "That isn't a walk games backup.", Toast.LENGTH_LONG).show()
            return
        }
        val o = JSONObject(text.trim())
        val from = runCatching { DateTimeFormatter.ofPattern("MMM d, yyyy HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(o.optString("t"))) }.getOrNull()
        AlertDialog.Builder(this).setTitle("Restore these saves?")
            .setMessage("${data.length()} saved items" + (from?.let { ", from $it" } ?: "") + ".\n\nThey replace the same saves on this phone; " +
                "anything not in the backup stays. Your saves as they are now are backed up first.")
            .setPositiveButton("Restore") { _, _ ->
                restoring = true
                backup {  // so a restore can be undone
                    site.run(Backups.importJs(o.toString())) { n ->
                        restoring = false
                        Toast.makeText(this, "Restored ${n ?: 0} saved items.", Toast.LENGTH_LONG).show()
                        showSaves()
                    }
                }
            }.setNegativeButton("Cancel", null).show()
    }

    private fun text(s: String, sp: Float, color: Long, bold: Boolean = false) = TextView(this).apply {
        text = s
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
        setTextColor(color.toInt())
        if (bold) typeface = Typeface.DEFAULT_BOLD
    }

    companion object {
        private const val PICK = 1
    }

    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()

    override fun onDestroy() {
        site.destroy()
        pool.shutdownNow()
        saver.shutdown()
        super.onDestroy()
    }
}
