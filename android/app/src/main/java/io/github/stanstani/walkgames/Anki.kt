package io.github.stanstani.walkgames

import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import org.json.JSONObject

/**
 * Notes for AnkiDroid, through its content provider (FlashCardsContract; no library needed): a note type per language, "Walk Games
 * (ko)" (front: the line, read aloud by AnkiDroid's own TTS; back: the word, its meaning, the English and where it came from), and a
 * deck per game, "Walk Games::<game>", both made on first use. A game's 사전 sends what to add ([GameActivity]'s WalkAnki) and keeps
 * track of what it sent, so nothing is added twice.
 */
object Anki {
    const val PACKAGE = "com.ichi2.anki"
    const val PERMISSION = "com.ichi2.anki.permission.READ_WRITE_DATABASE"
    private val AUTHORITY = Uri.parse("content://com.ichi2.anki.flashcards")
    private val NOTES = Uri.withAppendedPath(AUTHORITY, "notes")
    private val MODELS = Uri.withAppendedPath(AUTHORITY, "models")
    private val DECKS = Uri.withAppendedPath(AUTHORITY, "decks")
    private const val SEP = "\u001f"  // between fields, as Anki stores them
    private val FIELDS = listOf("Front", "Word", "Meaning", "English", "Source")
    private val TTS = mapOf("ko" to "ko_KR", "ja" to "ja_JP")
    private const val CSS = ".card{font-family:sans-serif;font-size:24px;line-height:1.5;text-align:center}.front b{color:#d9534f}" +
        ".word{font-size:24px;font-weight:bold;margin-top:10px}.meaning{margin-top:4px}.english{opacity:.7;font-size:18px;margin-top:10px}" +
        ".source{opacity:.5;font-size:13px;margin-top:14px}"

    fun installed(c: Context) = runCatching { c.packageManager.getPackageInfo(PACKAGE, 0); true }.getOrDefault(false)

    /** Adds the notes in [payload] ({lang, deck, tag, notes:[{front, word, meaning, english, source}]}); how many were added. */
    fun add(c: Context, payload: JSONObject): Int {
        val r = c.contentResolver
        val model = modelId(r, payload.optString("lang", "ko")) ?: error("couldn't make the note type")
        val deck = deckId(r, "Walk Games::" + payload.getString("deck")) ?: error("couldn't make the deck")
        val tags = listOf("walk-games", payload.optString("tag")).filter { it.isNotEmpty() }.joinToString(" ")
        val notes = payload.getJSONArray("notes")
        var added = 0
        for (i in 0 until notes.length()) {
            val o = notes.getJSONObject(i)
            val v = ContentValues().apply {
                put("mid", model)
                put("flds", FIELDS.joinToString(SEP) { o.optString(it.lowercase()) })
                put("tags", tags)
            }
            val note = r.insert(NOTES, v) ?: continue
            val cards = Uri.withAppendedPath(note, "cards")  // new cards go to the note type's deck: move them to this game's
            r.query(cards, null, null, null, null)?.use { cur ->
                while (cur.moveToNext()) {
                    val ord = cur.getString(cur.getColumnIndexOrThrow("ord"))
                    r.update(Uri.withAppendedPath(cards, ord), ContentValues().apply { put("deck_id", deck) }, null, null)
                }
            }
            added++
        }
        return added
    }

    private fun modelId(r: ContentResolver, lang: String): Long? {
        val name = "Walk Games ($lang)"
        r.query(MODELS, null, null, null, null)?.use { cur ->
            while (cur.moveToNext()) if (cur.getString(cur.getColumnIndexOrThrow("name")) == name) return cur.getLong(cur.getColumnIndexOrThrow("_id"))
        }
        val uri = r.insert(MODELS, ContentValues().apply {
            put("name", name)
            put("field_names", FIELDS.joinToString(SEP))
            put("num_cards", 1)
            put("css", CSS)
            put("sort_field_index", 0)
        }) ?: return null
        val tts = TTS[lang]?.let { "{{tts $it:Front}}" } ?: ""
        r.update(Uri.withAppendedPath(Uri.withAppendedPath(uri, "templates"), "0"), ContentValues().apply {
            put("card_template_name", "Read")
            put("question_format", "<div class=\"front\">{{Front}}</div>$tts")
            put("answer_format", "{{FrontSide}}<hr id=\"answer\">{{#Word}}<div class=\"word\">{{Word}}</div>{{/Word}}" +
                "{{#Meaning}}<div class=\"meaning\">{{Meaning}}</div>{{/Meaning}}<div class=\"english\">{{English}}</div><div class=\"source\">{{Source}}</div>")
        }, null, null)
        return uri.lastPathSegment?.toLongOrNull()
    }

    private fun deckId(r: ContentResolver, name: String): Long? {
        r.query(DECKS, null, null, null, null)?.use { cur ->
            while (cur.moveToNext()) if (cur.getString(cur.getColumnIndexOrThrow("deck_name")) == name) return cur.getLong(cur.getColumnIndexOrThrow("deck_id"))
        }
        return r.insert(DECKS, ContentValues().apply { put("deck_name", name) })?.lastPathSegment?.toLongOrNull()
    }
}
