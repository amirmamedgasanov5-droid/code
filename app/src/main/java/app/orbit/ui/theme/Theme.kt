package app.orbit.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

enum class ThemeMode { SYSTEM, LIGHT, DARK, AMOLED }

@Immutable
class Palette(
    val dark: Boolean,
    val bg: Color, val surface: Color, val surfaceHigh: Color, val text: Color, val textDim: Color,
    val accent: Color, val accent2: Color, val bubbleIn: Color, val bubbleOutA: Color, val bubbleOutB: Color,
    val onOut: Color, val divider: Color, val success: Color, val danger: Color, val chatBgA: Color, val chatBgB: Color,
) {
    val accentBrush get() = Brush.linearGradient(listOf(accent, accent2))
    val outBrush get() = Brush.linearGradient(listOf(bubbleOutA, bubbleOutB))
}

class Accent(val name: String, val a: Color, val b: Color)
val Accents = listOf(
    Accent("Azure", Color(0xFF2F8CFF), Color(0xFF22D3EE)), Accent("Violet", Color(0xFF7C5CFF), Color(0xFFB66CFF)),
    Accent("Rose", Color(0xFFFF4D8D), Color(0xFFFF8A5B)), Accent("Emerald", Color(0xFF12B981), Color(0xFF5CE1A8)),
    Accent("Amber", Color(0xFFF5A524), Color(0xFFFFCF5C)), Accent("Coral", Color(0xFFFF6B5E), Color(0xFFFF9A6B)),
    Accent("Indigo", Color(0xFF4F46E5), Color(0xFF60A5FA)), Accent("Mono", Color(0xFF64748B), Color(0xFF94A3B8)),
)

val AvatarGradients = listOf(
    Color(0xFFFF885E) to Color(0xFFFF516A), Color(0xFFFFCD6A) to Color(0xFFFFA85C), Color(0xFF82B1FF) to Color(0xFF665FFF),
    Color(0xFFA0DE7E) to Color(0xFF54CB68), Color(0xFF53EDD6) to Color(0xFF28C9B7), Color(0xFF72D5FD) to Color(0xFF2A9EF1),
    Color(0xFFE0A2F3) to Color(0xFFD669ED), Color(0xFFFF9DB4) to Color(0xFFFF5C93),
)

fun palette(dark: Boolean, amoled: Boolean, accent: Accent): Palette = if (dark) Palette(
    true, if (amoled) Color.Black else Color(0xFF0E1621), if (amoled) Color(0xFF0B0B0D) else Color(0xFF17212B), if (amoled) Color(0xFF17171B) else Color(0xFF1F2C3A),
    Color(0xFFF1F5F9), Color(0xFF8A9BAE), accent.a, accent.b, if (amoled) Color(0xFF1B1B20) else Color(0xFF1F2C3A),
    accent.a, lerp2(accent.a, accent.b, 0.35f), Color.White, Color(0x1FFFFFFF), Color(0xFF4FD07F), Color(0xFFFF5C6C),
    if (amoled) Color.Black else Color(0xFF0B131C), if (amoled) Color(0xFF050507) else Color(0xFF111B27),
) else Palette(
    false, Color(0xFFF4F6FA), Color.White, Color(0xFFEDF1F7), Color(0xFF0F172A), Color(0xFF6B7A90),
    accent.a, accent.b, Color.White, accent.a, lerp2(accent.a, accent.b, 0.4f), Color.White, Color(0x14000000), Color(0xFF16A34A), Color(0xFFE5484D),
    Color(0xFFE6ECF5), Color(0xFFEEF2F9),
)

private fun lerp2(a: Color, b: Color, t: Float) = androidx.compose.ui.graphics.lerp(a, b, t)

val LocalPalette = staticCompositionLocalOf { palette(true, false, Accents[0]) }
object OrbitTheme { val p: Palette @Composable get() = LocalPalette.current }

@Composable
fun OrbitTheme(mode: ThemeMode, accentIdx: Int, content: @Composable () -> Unit) {
    val dark = when (mode) { ThemeMode.SYSTEM -> isSystemInDarkTheme(); ThemeMode.LIGHT -> false; else -> true }
    val p = remember(mode, dark, accentIdx) { palette(dark, mode == ThemeMode.AMOLED, Accents[accentIdx.coerceIn(0, Accents.lastIndex)]) }
    val scheme = if (dark) darkColorScheme(primary = p.accent, background = p.bg, surface = p.surface, onSurface = p.text, onBackground = p.text, surfaceVariant = p.surfaceHigh, onSurfaceVariant = p.textDim, secondary = p.accent2, error = p.danger, outline = p.divider)
    else lightColorScheme(primary = p.accent, background = p.bg, surface = p.surface, onSurface = p.text, onBackground = p.text, surfaceVariant = p.surfaceHigh, onSurfaceVariant = p.textDim, secondary = p.accent2, error = p.danger, outline = p.divider)
    val base = TextStyle(fontFamily = FontFamily.SansSerif, color = p.text)
    val ty = Typography(
        titleLarge = base.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.2).sp),
        titleMedium = base.copy(fontSize = 17.sp, fontWeight = FontWeight.SemiBold),
        titleSmall = base.copy(fontSize = 15.sp, fontWeight = FontWeight.SemiBold),
        bodyLarge = base.copy(fontSize = 16.sp, lineHeight = 21.sp),
        bodyMedium = base.copy(fontSize = 14.5.sp, lineHeight = 19.sp),
        bodySmall = base.copy(fontSize = 12.5.sp, lineHeight = 16.sp),
        labelLarge = base.copy(fontSize = 14.sp, fontWeight = FontWeight.Medium),
        labelMedium = base.copy(fontSize = 12.sp, fontWeight = FontWeight.Medium),
        labelSmall = base.copy(fontSize = 11.sp, fontWeight = FontWeight.Medium),
    )
    CompositionLocalProvider(LocalPalette provides p) { MaterialTheme(colorScheme = scheme, typography = ty, content = content) }
}
