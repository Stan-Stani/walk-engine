package io.github.stanstani.walkgames

import android.content.Context
import android.net.Uri
import android.webkit.WebSettings
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Offline copies of the games. Every GET a game page makes to the site (and to Google Fonts) comes through here: the site is asked
 * first, with the copy's ETag (an unchanged file costs a 304), and the copy answers when there is no network. Font files never change
 * at a URL, so their copy answers first. Copies live in the app's own files, keyed by URL; the site's without its query, so ?count=0,
 * ?v=… and version.json?t=… are the same file.
 */
class OfflineCache(context: Context) {
    private val dir = File(context.filesDir, "offline").apply { mkdirs() }
    private val userAgent = WebSettings.getDefaultUserAgent(context)  // the WebView's own: Google Fonts' CSS depends on it

    class Copy(val type: String, val charset: String?, val headers: Map<String, String>, val body: ByteArray, val etag: String?, val saved: Long)

    /** The requests kept offline: a game's own files and its fonts. */
    fun covers(u: Uri) = when (u.host) {
        SITE_HOST -> gameOf(u.pathSegments.firstOrNull()) != null
        "fonts.googleapis.com", "fonts.gstatic.com" -> true
        else -> false
    }

    private fun name(u: Uri): String {
        val key = if (u.host == SITE_HOST) u.buildUpon().clearQuery().fragment(null).build().toString() else u.buildUpon().fragment(null).build().toString()
        return MessageDigest.getInstance("SHA-1").digest(key.toByteArray()).joinToString("") { "%02x".format(it) }
    }

    fun read(u: Uri): Copy? {
        val n = name(u)
        val meta = File(dir, "$n.json")
        val body = File(dir, "$n.bin")
        if (!meta.exists() || !body.exists()) return null
        return try {
            val m = JSONObject(meta.readText())
            val h = m.optJSONObject("headers")
            Copy(
                m.getString("type"), m.optString("charset").ifEmpty { null },
                h?.keys()?.asSequence()?.associateWith { h.getString(it) } ?: emptyMap(),
                body.readBytes(), m.optString("etag").ifEmpty { null }, m.optLong("saved"),
            )
        } catch (e: Exception) {
            null
        }
    }

    private fun write(u: Uri, c: Copy) {
        val n = name(u)
        val m = JSONObject().put("url", u.toString()).put("type", c.type).put("charset", c.charset ?: "").put("etag", c.etag ?: "")
            .put("saved", c.saved).put("headers", JSONObject(c.headers))
        // body first, then the meta that points at it, each written whole and renamed into place: a copy is never half a file
        for ((file, bytes) in listOf(File(dir, "$n.bin") to c.body, File(dir, "$n.json") to m.toString().toByteArray())) {
            val tmp = File(dir, file.name + ".tmp")
            tmp.writeBytes(bytes)
            tmp.renameTo(file)
        }
    }

    /** The site first (or the copy first when [copyFirst]), the copy when the site can't be reached; null when there's neither. */
    fun fetch(u: Uri, copyFirst: Boolean = false): Copy? {
        val old = read(u)
        if (old != null && copyFirst) return old
        val c = try {
            URL(u.toString()).openConnection() as HttpURLConnection
        } catch (e: IOException) {
            return old
        }
        c.connectTimeout = 4000
        c.readTimeout = 20000
        c.setRequestProperty("User-Agent", userAgent)
        old?.etag?.let { c.setRequestProperty("If-None-Match", it) }
        return try {
            when (c.responseCode) {
                HttpURLConnection.HTTP_NOT_MODIFIED -> old
                in 200..299 -> {
                    val body = c.inputStream.use { it.readBytes() }  // gzip is undone by HttpURLConnection itself
                    val parts = (c.contentType ?: "application/octet-stream").split(';').map { it.trim() }
                    val charset = parts.drop(1).firstOrNull { it.startsWith("charset=", true) }?.substringAfter('=')?.trim('"')
                    val headers = listOf("Access-Control-Allow-Origin").mapNotNull { h -> c.getHeaderField(h)?.let { h to it } }.toMap()  // fonts load cross-origin
                    Copy(parts[0].lowercase(), charset, headers, body, c.getHeaderField("ETag"), System.currentTimeMillis()).also { write(u, it) }
                }
                else -> old
            }
        } catch (e: IOException) {
            old
        } finally {
            c.disconnect()
        }
    }

    /**
     * Brings one game's offline copy up to date: its version.json, and when that changed (or there's no copy yet) its page and
     * what the page loads (audio, fonts). Returns the version it now has, as {v, t}, or null if there's no copy at all.
     */
    fun refresh(g: Game): JSONObject? {
        val verUri = Uri.parse(g.url + "version.json")
        val before = read(verUri)?.let { String(it.body) }
        val now = fetch(verUri)?.let { String(it.body) }
        val page = Uri.parse(g.url)
        if (now != before || read(page) == null) {
            val html = fetch(page)?.let { String(it.body, Charsets.UTF_8) }
            if (html != null) {
                Regex("""["'`(](audio/[\w./-]+\.(?:m4a|mp3|ogg|wav))""").findAll(html).map { it.groupValues[1] }.distinct()
                    .forEach { fetch(Uri.parse(g.url + it)) }
                Regex("""https://fonts\.googleapis\.com/css2?\?[^"'\s<>]+""").findAll(html).map { it.value.replace("&amp;", "&") }.distinct()
                    .forEach { css ->
                        val sheet = fetch(Uri.parse(css))?.let { String(it.body) } ?: return@forEach
                        Regex("""url\((https://fonts\.gstatic\.com/[^)]+)\)""").findAll(sheet).forEach { fetch(Uri.parse(it.groupValues[1]), copyFirst = true) }
                    }
            }
        }
        if (read(page) == null) return null
        return try {
            JSONObject(now ?: before ?: "{}")
        } catch (e: Exception) {
            JSONObject()
        }
    }
}
