package noodle.app

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    private var count = 0
    private lateinit var value: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.BLACK
        window.navigationBarColor = Color.BLACK
        val prefs = getSharedPreferences("app", MODE_PRIVATE)
        count = prefs.getInt("count", 0)

        value = TextView(this).apply {
            textSize = 96f
            setTextColor(Color.WHITE)
            typeface = Typeface.create("sans-serif-thin", Typeface.NORMAL)
            gravity = Gravity.CENTER
        }
        fun render() {
            value.text = count.toString()
            prefs.edit().putInt("count", count).apply()
        }
        val minus = pill("−") { count--; render() }
        val plus = pill("+") { count++; render() }
        val reset = pill("Сбросить") { count = 0; render() }

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            addView(minus, LinearLayout.LayoutParams(dp(84), dp(84)).apply { marginEnd = dp(16) })
            addView(plus, LinearLayout.LayoutParams(dp(84), dp(84)))
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.BLACK)
            addView(value)
            addView(row, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(32); bottomMargin = dp(32) })
            addView(reset, LinearLayout.LayoutParams(-2, dp(48)))
        }
        setContentView(root)
        render()
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun pill(label: String, onTap: () -> Unit): Button = Button(this).apply {
        text = label
        textSize = 22f
        isAllCaps = false
        setTextColor(Color.WHITE)
        background = GradientDrawable().apply {
            setColor(Color.BLACK)
            setStroke(dp(1), Color.WHITE)
        }
        setOnClickListener { onTap() }
    }
}
