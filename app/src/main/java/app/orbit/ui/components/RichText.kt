package app.orbit.ui.components

import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.sp

/**
 * Telegram-style inline formatting: **bold**  __italic__  `mono`  ~~strike~~  ||spoiler||  plus tappable links.
 */
object RichText {
    private val rx = Regex("""\*\*(.+?)\*\*|__(.+?)__|`([^`\n]+)`|~~(.+?)~~|\|\|(.+?)\|\||((?:https?|orbit)://[^\s<>"]+)|(@[A-Za-z0-9_]{3,24})""", RegexOption.DOT_MATCHES_ALL)

    fun build(text: String, base: Color, link: Color, codeBg: Color, revealSpoilers: Boolean, onLink: (String) -> Unit): AnnotatedString = buildAnnotatedString {
        var last = 0
        for (m in rx.findAll(text)) {
            if (m.range.first > last) append(text.substring(last, m.range.first))
            val g = m.groupValues
            when {
                g[1].isNotEmpty() -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(g[1]) }
                g[2].isNotEmpty() -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(g[2]) }
                g[3].isNotEmpty() -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = codeBg, fontSize = 14.sp)) { append(" ${g[3]} ") }
                g[4].isNotEmpty() -> withStyle(SpanStyle(textDecoration = TextDecoration.LineThrough)) { append(g[4]) }
                g[5].isNotEmpty() -> if (revealSpoilers) withStyle(SpanStyle(background = codeBg)) { append(g[5]) } else withStyle(SpanStyle(color = Color.Transparent, background = base.copy(alpha = 0.35f))) { append(g[5]) }
                g[6].isNotEmpty() -> {
                    val url = g[6].trimEnd('.', ',', ')', '!', '?')
                    pushStringAnnotation("link", url); withStyle(SpanStyle(color = link, textDecoration = TextDecoration.Underline)) { append(url) }; pop()
                    append(g[6].substring(url.length))
                }
                g[7].isNotEmpty() -> { pushStringAnnotation("link", g[7]); withStyle(SpanStyle(color = link, fontWeight = FontWeight.Medium, textDecoration = TextDecoration.Underline)) { append(g[7]) }; pop() }
            }
            last = m.range.last + 1
        }
        if (last < text.length) append(text.substring(last))
    }

    fun hasSpoiler(t: String) = t.contains("||")
}
