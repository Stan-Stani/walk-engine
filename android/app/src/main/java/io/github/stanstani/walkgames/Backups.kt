package io.github.stanstani.walkgames

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import org.json.JSONObject
import org.json.JSONTokener
import java.io.File
import java.security.MessageDigest
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/**
 * Rolling backups of every walk game's saves, in the games' own 저장 옮기기 format ({walkSaves:1, from, t, data}), kept in
 * Downloads/WalkGames: an uninstall deletes the app's own storage (saves included) but not Downloads. Written when you leave a
 * game, every 10 minutes while playing and when the list opens, only when something changed; the newest [KEEP] stay.
 * (Before Android 10 they go to the app's own external folder, which an uninstall does delete.)
 */
object Backups {
    const val KEEP = 10
    private const val DIR = "WalkGames"
    private const val PREFIX = "walk-saves-"

    /** Run in a page of the site: every walk key as 저장 옮기기's 내보내기 gives it (walk-count, this phone's 통계 opt-out, stays out). */
    const val EXPORT_JS = "(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k!=='walk-count')d[k]=localStorage.getItem(k)}" +
        "return JSON.stringify({walkSaves:1,from:location.host,t:new Date().toISOString(),data:d})})()"

    /** The page script that writes a backup's keys back (keys it doesn't have are left alone) and returns how many it wrote. */
    fun importJs(backup: String) =
        "(function(o){var n=0;for(var k in o.data){if(k==='walk-count')continue;localStorage.setItem(k,String(o.data[k]));n++}localStorage.setItem('walk-count','0');return n})($backup)"

    /** evaluateJavascript's result (a JSON string literal) → the text it holds. */
    fun unquote(result: String?): String? = runCatching { JSONTokener(result).nextValue() as? String }.getOrNull()

    /** A backup's text → its data (key → value), or null if it isn't one. */
    fun dataOf(text: String): JSONObject? = runCatching {
        val o = JSONObject(text.trim())
        if (o.optInt("walkSaves") != 1) null else o.getJSONObject("data").takeIf { d -> d.keys().asSequence().all { d.opt(it) is String } }
    }.getOrNull()

    private fun prefs(c: Context) = c.getSharedPreferences("backups", Context.MODE_PRIVATE)
    fun lastTime(c: Context): Long = prefs(c).getLong("time", 0)

    /** Writes the backup unless it holds nothing or the same as the last one. Returns true when it wrote one. Off the main thread. */
    @Synchronized
    fun save(c: Context, text: String): Boolean {
        val data = dataOf(text) ?: return false
        if (data.length() == 0) return false
        val sorted = data.keys().asSequence().sorted().joinToString("\u0000") { it + "\u0001" + data.getString(it) }
        val hash = MessageDigest.getInstance("SHA-256").digest(sorted.toByteArray()).joinToString("") { "%02x".format(it) }
        if (hash == prefs(c).getString("hash", null)) return false
        val name = PREFIX + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")) + ".json"
        val ok = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) writeDownloads(c, name, text) else writeAppFolder(c, name, text)
        if (ok) prefs(c).edit().putString("hash", hash).putLong("time", System.currentTimeMillis()).apply()
        return ok
    }

    private fun writeDownloads(c: Context, name: String, text: String): Boolean {
        val r = c.contentResolver
        val rel = Environment.DIRECTORY_DOWNLOADS + "/" + DIR + "/"
        val v = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, name)
            put(MediaStore.Downloads.MIME_TYPE, "application/json")
            put(MediaStore.Downloads.RELATIVE_PATH, rel)
        }
        val uri = r.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v) ?: return false
        try {
            r.openOutputStream(uri)?.use { it.write(text.toByteArray()) } ?: return false
        } catch (e: Exception) {
            r.delete(uri, null, null)
            return false
        }
        // the newest KEEP of this install's backups stay (the query only sees files this install wrote)
        val old = mutableListOf<Uri>()
        r.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, arrayOf(MediaStore.Downloads._ID),
            "${MediaStore.Downloads.RELATIVE_PATH}=? AND ${MediaStore.Downloads.DISPLAY_NAME} LIKE ?", arrayOf(rel, "$PREFIX%"),
            "${MediaStore.Downloads.DISPLAY_NAME} DESC")?.use { cur ->
            var i = 0
            while (cur.moveToNext()) if (i++ >= KEEP) old += Uri.withAppendedPath(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cur.getLong(0).toString())
        }
        old.forEach { runCatching { r.delete(it, null, null) } }
        return true
    }

    private fun writeAppFolder(c: Context, name: String, text: String): Boolean {
        val dir = File(c.getExternalFilesDir(null) ?: c.filesDir, DIR).apply { mkdirs() }
        File(dir, name).writeText(text)
        dir.listFiles { f -> f.name.startsWith(PREFIX) }?.sortedByDescending { it.name }?.drop(KEEP)?.forEach { it.delete() }
        return true
    }
}
