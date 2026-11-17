@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package app.orbit.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.orbit.ui.theme.AvatarGradients
import app.orbit.ui.theme.OrbitTheme

/** Soft press feedback used by every tappable surface. */
@OptIn(ExperimentalFoundationApi::class)
fun Modifier.pressable(onClick: () -> Unit, onLong: (() -> Unit)? = null, enabled: Boolean = true): Modifier = composed {
    val src = remember { MutableInteractionSource() }
    val pressed by src.collectIsPressedAsState()
    val s by animateFloatAsState(if (pressed) 0.97f else 1f, spring(dampingRatio = 0.6f, stiffness = 600f), label = "press")
    val haptic = LocalHapticFeedback.current
    this.scale(s).combinedClickable(interactionSource = src, indication = null, enabled = enabled, onClick = onClick, onLongClick = onLong?.let { l -> { haptic.performHapticFeedback(HapticFeedbackType.LongPress); l() } })
}

@Composable
fun Avatar(title: String, emoji: String, color: Int, size: Dp, online: Boolean = false, modifier: Modifier = Modifier, saved: Boolean = false) {
    val (c1, c2) = AvatarGradients[((color % 8) + 8) % 8]
    Box(modifier.size(size)) {
        Box(Modifier.fillMaxSize().clip(CircleShape).background(Brush.linearGradient(listOf(c1, c2))), contentAlignment = Alignment.Center) {
            val label = emoji.ifBlank { initials(title) }
            androidx.compose.material3.Text(label, color = Color.White, fontSize = (if (emoji.isNotBlank()) size.value * 0.5f else size.value * 0.4f).sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
        if (online) Box(Modifier.align(Alignment.BottomEnd).size(size * 0.3f).clip(CircleShape).background(OrbitTheme.p.bg).padding(size * 0.05f).clip(CircleShape).background(OrbitTheme.p.success))
    }
}

fun initials(name: String): String {
    val parts = name.trim().split(" ").filter { it.isNotBlank() }
    return when { parts.isEmpty() -> "?"; parts.size == 1 -> parts[0].take(1).uppercase(); else -> (parts[0].take(1) + parts[1].take(1)).uppercase() }
}

@Composable
fun GradientButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, icon: ImageVector? = null) {
    Box(modifier.height(52.dp).clip(RoundedCornerShape(16.dp)).alpha(if (enabled) 1f else 0.45f).background(OrbitTheme.p.accentBrush).pressable(onClick, enabled = enabled).padding(horizontal = 20.dp), contentAlignment = Alignment.Center) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (icon != null) Icon(icon, null, tint = Color.White, modifier = Modifier.size(20.dp))
            Text(text, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        }
    }
}

@Composable
fun TonalButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null, danger: Boolean = false) {
    val p = OrbitTheme.p
    Box(modifier.height(48.dp).clip(RoundedCornerShape(14.dp)).background(if (danger) p.danger.copy(alpha = 0.14f) else p.accent.copy(alpha = 0.14f)).pressable(onClick).padding(horizontal = 18.dp), contentAlignment = Alignment.Center) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (icon != null) Icon(icon, null, tint = if (danger) p.danger else p.accent, modifier = Modifier.size(20.dp))
            Text(text, color = if (danger) p.danger else p.accent, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
fun TopBar(title: String, onBack: (() -> Unit)?, modifier: Modifier = Modifier, subtitle: String? = null, actions: @Composable RowScope.() -> Unit = {}) {
    val p = OrbitTheme.p
    Row(modifier.fillMaxWidth().background(p.surface).statusBarsPadding().height(56.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        if (onBack != null) IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back", tint = p.text) } else Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = p.textDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        actions()
    }
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(text.uppercase(), modifier.padding(start = 20.dp, top = 18.dp, bottom = 6.dp), style = MaterialTheme.typography.labelSmall, color = OrbitTheme.p.accent, letterSpacing = 0.8.sp)
}

@Composable
fun SettingsRow(title: String, subtitle: String? = null, icon: ImageVector? = null, tint: Color = OrbitTheme.p.accent, onClick: (() -> Unit)? = null, trailing: @Composable (() -> Unit)? = null) {
    val p = OrbitTheme.p
    Row(Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(horizontal = 16.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
        if (icon != null) { Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(tint.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) { Icon(icon, null, tint = tint, modifier = Modifier.size(20.dp)) }; Spacer(Modifier.width(14.dp)) }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = p.textDim)
        }
        if (trailing != null) trailing()
    }
}

@Composable
fun OrbitSwitch(checked: Boolean, onChange: (Boolean) -> Unit) {
    val p = OrbitTheme.p
    Switch(checked = checked, onCheckedChange = onChange, colors = SwitchDefaults.colors(checkedTrackColor = p.accent, checkedThumbColor = Color.White, uncheckedTrackColor = p.surfaceHigh, uncheckedThumbColor = p.textDim, uncheckedBorderColor = Color.Transparent))
}

@Composable
fun Card(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.padding(horizontal = 12.dp).clip(RoundedCornerShape(18.dp)).background(OrbitTheme.p.surface), content = content)
}

@Composable
fun Divider(inset: Dp = 0.dp) { Box(Modifier.padding(start = inset).fillMaxWidth().height(0.5.dp).background(OrbitTheme.p.divider)) }

@Composable
fun UnreadBadge(n: Int, muted: Boolean) {
    val p = OrbitTheme.p
    if (n <= 0) return
    Box(Modifier.defaultMinSize(minWidth = 22.dp).height(22.dp).clip(RoundedCornerShape(11.dp)).background(if (muted) p.textDim.copy(alpha = 0.6f) else p.accent).padding(horizontal = 7.dp), contentAlignment = Alignment.Center) {
        Text(if (n > 999) "999+" else "$n", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun EmptyState(emoji: String, title: String, text: String, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Column(modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        val inf = rememberInfiniteTransition(label = "float")
        val dy by inf.animateFloat(-6f, 6f, infiniteRepeatable(tween(1800, easing = EaseInOutSine), RepeatMode.Reverse), label = "dy")
        Text(emoji, fontSize = 64.sp, modifier = Modifier.offset(y = dy.dp))
        Spacer(Modifier.height(14.dp))
        Text(title, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(6.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, color = OrbitTheme.p.textDim, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        if (action != null) { Spacer(Modifier.height(18.dp)); action() }
    }
}

fun fmtTime(ts: Long): String = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date(ts))
fun fmtDay(ts: Long): String {
    val now = java.util.Calendar.getInstance(); val c = java.util.Calendar.getInstance().apply { timeInMillis = ts }
    return when {
        now.get(java.util.Calendar.YEAR) == c.get(java.util.Calendar.YEAR) && now.get(java.util.Calendar.DAY_OF_YEAR) == c.get(java.util.Calendar.DAY_OF_YEAR) -> "Today"
        now.get(java.util.Calendar.YEAR) == c.get(java.util.Calendar.YEAR) && now.get(java.util.Calendar.DAY_OF_YEAR) - c.get(java.util.Calendar.DAY_OF_YEAR) == 1 -> "Yesterday"
        else -> java.text.SimpleDateFormat("d MMMM", java.util.Locale.getDefault()).format(java.util.Date(ts))
    }
}
fun fmtListTime(ts: Long): String {
    if (ts == 0L) return ""
    val now = java.util.Calendar.getInstance(); val c = java.util.Calendar.getInstance().apply { timeInMillis = ts }
    val sameDay = now.get(java.util.Calendar.YEAR) == c.get(java.util.Calendar.YEAR) && now.get(java.util.Calendar.DAY_OF_YEAR) == c.get(java.util.Calendar.DAY_OF_YEAR)
    return if (sameDay) fmtTime(ts) else if (now.timeInMillis - ts < 6 * 86400_000L) java.text.SimpleDateFormat("EEE", java.util.Locale.getDefault()).format(java.util.Date(ts)) else java.text.SimpleDateFormat("d MMM", java.util.Locale.getDefault()).format(java.util.Date(ts))
}
fun fmtLastSeen(ts: Long, online: Boolean): String {
    if (online) return "online"
    if (ts == 0L) return "last seen a long time ago"
    val d = System.currentTimeMillis() - ts
    return when { d < 60_000 -> "last seen just now"; d < 3600_000 -> "last seen ${d / 60_000} min ago"; d < 86400_000 -> "last seen ${d / 3600_000} h ago"; else -> "last seen ${fmtListTime(ts)}" }
}
