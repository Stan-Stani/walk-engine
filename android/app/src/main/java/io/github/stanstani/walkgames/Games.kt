package io.github.stanstani.walkgames

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * The games come from walk-engine's games.json (those with app:true and a Pages site): the copy built into the app, or a newer one
 * fetched from GitHub at launch ([refreshGames]), so a newly published game shows up without reinstalling.
 */
data class Game(val slug: String, val title: String, val blurb: String) {
    val url get() = "$SITE/$slug/"
}

const val SITE_HOST = "stan-stani.github.io"
const val SITE = "https://$SITE_HOST"
private const val LIST_URL = "https://raw.githubusercontent.com/Stan-Stani/walk-engine/main/games.json"

@Volatile var GAMES: List<Game> = emptyList()
    private set

private fun parse(json: String): List<Game> {
    val a = JSONObject(json).getJSONArray("games")
    return (0 until a.length()).map { a.getJSONObject(it) }
        .filter { it.optBoolean("app") && it.optString("site").isNotEmpty() && it.optString("site") != "null" }
        .map { Game(it.getString("site"), it.getString("title"), it.optString("blurb")) }
}

/** The list as last fetched, else the one built into the app. */
fun loadGames(context: Context) {
    if (GAMES.isNotEmpty()) return
    val saved = File(context.filesDir, "games.json")
    GAMES = runCatching { parse(saved.readText()) }.getOrNull()?.takeIf { it.isNotEmpty() }
        ?: parse(context.assets.open("games.json").use { String(it.readBytes()) })
}

/** Fetches the current list from GitHub (off the main thread); true when it changed. A bad or empty list is ignored. */
fun refreshGames(context: Context): Boolean {
    val c = URL(LIST_URL).openConnection() as HttpURLConnection
    c.connectTimeout = 4000
    c.readTimeout = 10000
    val text = try {
        if (c.responseCode != 200) return false
        c.inputStream.use { String(it.readBytes()) }
    } catch (e: Exception) {
        return false
    } finally {
        c.disconnect()
    }
    val list = runCatching { parse(text) }.getOrNull()?.takeIf { it.isNotEmpty() } ?: return false
    File(context.filesDir, "games.json").writeText(text)
    if (list == GAMES) return false
    GAMES = list
    return true
}

fun gameOf(slug: String?) = GAMES.firstOrNull { it.slug == slug }
