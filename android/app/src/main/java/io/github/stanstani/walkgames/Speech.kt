package io.github.stanstani.walkgames

import android.content.Context
import android.speech.tts.TextToSpeech
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * The games' voice on Android: the page's speechSynthesis (assets/boot.js) calls this as window.WalkTTS. The voices offered are the
 * languages the phone's speech engine can say (Korean, Japanese, English); [onVoices] hands them to the page once it's ready.
 * It only speaks and stops, so any page in the game view may use it.
 */
class Speech(context: Context, private val onVoices: (String) -> Unit) : TextToSpeech.OnInitListener {
    private val tts = TextToSpeech(context.applicationContext, this)
    @Volatile private var ready = false
    @Volatile private var voices = "[]"

    override fun onInit(status: Int) {
        if (status != TextToSpeech.SUCCESS) return
        val list = JSONArray()
        for (tag in listOf("ko-KR", "ja-JP", "en-US")) {
            if (tts.isLanguageAvailable(Locale.forLanguageTag(tag)) >= TextToSpeech.LANG_AVAILABLE) {
                list.put(JSONObject().put("name", "Android $tag").put("lang", tag).put("voiceURI", "android:$tag").put("localService", true).put("default", false))
            }
        }
        voices = list.toString()
        ready = true
        onVoices(voices)
    }

    @JavascriptInterface
    fun voices() = voices

    @JavascriptInterface
    fun speak(text: String, lang: String, rate: Double, pitch: Double) {
        if (!ready) return
        if (lang.isNotEmpty()) tts.language = Locale.forLanguageTag(lang)
        tts.setSpeechRate(rate.toFloat())
        tts.setPitch(pitch.toFloat())
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "walk")
    }

    @JavascriptInterface
    fun stop() {
        if (ready) tts.stop()
    }

    fun shutdown() = tts.shutdown()
}
