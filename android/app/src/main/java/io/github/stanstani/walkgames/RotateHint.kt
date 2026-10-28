package io.github.stanstani.walkgames

import android.app.Activity
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.OrientationEventListener
import android.widget.FrameLayout
import android.widget.ImageView

/**
 * Like Android's own rotate button (which can't show here: the game hides the navigation bar it lives in): hold the phone the other
 * way from how the game is shown for half a second and a rotate icon fades in for 3 seconds; a tap turns the game that way and keeps
 * it there whatever auto-rotate says (landscape follows whichever side is down). The choice carries to the next game opened.
 */
class RotateHint(private val a: Activity, root: FrameLayout) {
    private val prefs = a.getSharedPreferences("rotate", Activity.MODE_PRIVATE)
    private val dp = a.resources.displayMetrics.density
    private val icon = ImageView(a).apply {
        setImageResource(R.drawable.rotate)
        val pad = (14 * dp).toInt()
        setPadding(pad, pad, pad, pad)
        background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(0xCC222222.toInt()) }
        contentDescription = "Rotate"
        alpha = 0f
        visibility = ImageView.GONE
        setOnClickListener { target?.let { a.requestedOrientation = it; prefs.edit().putInt("lock", it).apply() }; hide() }
    }
    private var target: Int? = null   // what a tap would lock: portrait or landscape (either side)
    private var pending: Int? = null  // the way the phone is held, waiting to be held long enough
    private val offer = Runnable { show() }
    private val fade = Runnable { hide() }

    private val tilt = object : OrientationEventListener(a) {
        override fun onOrientationChanged(deg: Int) {
            if (deg == ORIENTATION_UNKNOWN) return  // flat on a table
            val held = when (deg) {
                in 0..30, in 330..359 -> Configuration.ORIENTATION_PORTRAIT
                in 60..120, in 240..300 -> Configuration.ORIENTATION_LANDSCAPE
                else -> return  // in between, or upside down
            }
            if (held == pending) return
            pending = held
            icon.removeCallbacks(offer)
            if (held != a.resources.configuration.orientation) icon.postDelayed(offer, 500) else hide()
        }
    }

    init {
        val size = (56 * dp).toInt()
        root.addView(icon, FrameLayout.LayoutParams(size, size, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply { bottomMargin = (32 * dp).toInt() })
        prefs.getInt("lock", ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED).let { if (it != ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED) a.requestedOrientation = it }
    }

    private fun show() {
        target = if (pending == Configuration.ORIENTATION_LANDSCAPE) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                 else ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        icon.removeCallbacks(fade)
        icon.visibility = ImageView.VISIBLE
        icon.animate().alpha(1f).setDuration(200).start()
        icon.postDelayed(fade, 3000)
    }

    private fun hide() {
        icon.removeCallbacks(fade)
        if (icon.visibility != ImageView.VISIBLE) return
        icon.animate().alpha(0f).setDuration(400).withEndAction { icon.visibility = ImageView.GONE }.start()
    }

    fun start() { if (tilt.canDetectOrientation()) tilt.enable() }
    fun stop() { tilt.disable(); icon.removeCallbacks(offer); pending = null; hide() }
}
