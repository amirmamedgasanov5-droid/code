package wtf.total.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object C {
    val bg = Color(0xFF000000)
    val card = Color(0xFF141414)
    val card2 = Color(0xFF1F1F1F)
    val text = Color(0xFFFFFFFF)
    val muted = Color(0xFF8A8A8A)
    val red = Color(0xFFE3262B)
    val green = Color(0xFF39D353)
    val purple = Color(0xFFA855F7)
    val orange = Color(0xFFF59E0B)
    val dots = Color(0xFFD08A3C)
}

@Composable
fun T(
    text: String, size: Int = 14, color: Color = C.text, weight: FontWeight = FontWeight.Normal,
    modifier: Modifier = Modifier, align: TextAlign? = null,
) = Text(text, color = color, fontSize = size.sp, fontWeight = weight, modifier = modifier, textAlign = align)

@Composable
fun Panel(
    modifier: Modifier = Modifier, onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    var m = modifier.clip(RoundedCornerShape(18.dp)).background(C.card)
    if (onClick != null) m = m.clickable(onClick = onClick)
    Column(m.padding(14.dp), content = content)
}

@Composable
fun Segmented(opts: List<String>, sel: Int, onSel: (Int) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.clip(RoundedCornerShape(50)).background(C.card2).padding(3.dp)) {
        opts.forEachIndexed { i, o ->
            Box(
                Modifier.clip(RoundedCornerShape(50))
                    .background(if (i == sel) Color(0xFF4A4A4A) else Color.Transparent)
                    .clickable { onSel(i) }
                    .padding(horizontal = 16.dp, vertical = 7.dp)
            ) { T(o, 13, if (i == sel) C.text else C.muted) }
        }
    }
}

@Composable
fun LineChart(pts: List<Float>, color: Color, modifier: Modifier = Modifier, strokeW: Float = 4f) {
    Canvas(modifier) {
        val mn = pts.min(); val mx = pts.max(); val r = (mx - mn).coerceAtLeast(0.001f)
        val path = Path()
        pts.forEachIndexed { i, v ->
            val x = size.width * i / (pts.size - 1)
            val y = size.height * 0.05f + size.height * 0.9f * (1 - (v - mn) / r)
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(path, color, style = Stroke(strokeW, cap = StrokeCap.Round, join = StrokeJoin.Round))
        val lx = size.width; val ly = size.height * 0.05f + size.height * 0.9f * (1 - (pts.last() - mn) / r)
        drawCircle(color, 6f, Offset(lx - 4f, ly))
    }
}

@Composable
fun Avatar(size: Int, initial: String, badge: String? = null) {
    Box(Modifier.size(size.dp)) {
        Box(
            Modifier.fillMaxSize().clip(CircleShape)
                .background(Brush.linearGradient(listOf(Color(0xFF6B4A3A), Color(0xFF2B2B2B)))),
            contentAlignment = Alignment.Center
        ) { T(initial, (size / 2.4).toInt(), C.text, FontWeight.Bold) }
        if (badge != null) Box(
            Modifier.align(Alignment.BottomCenter).offset(y = 6.dp).clip(CircleShape)
                .background(C.purple).padding(horizontal = 9.dp, vertical = 2.dp)
        ) { T(badge, 11, C.text, FontWeight.Bold) }
    }
}

@Composable
fun Bubble(text: String, modifier: Modifier = Modifier) {
    Box(modifier.clip(RoundedCornerShape(16.dp)).background(Color(0xFF3A3A3A)).padding(horizontal = 12.dp, vertical = 8.dp)) {
        T(text, 12, Color(0xFFDDDDDD))
    }
}

@Composable
fun Stat(label: String, value: String, modifier: Modifier = Modifier, height: Int = 86) {
    Column(
        modifier.height(height.dp).clip(RoundedCornerShape(16.dp)).background(C.card).padding(12.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        T(label, 12, C.muted)
        T(value, 15, C.text, FontWeight.SemiBold)
    }
}

/** 6-petal radar-ish "training split" chart. */
@Composable
fun SplitChart(values: List<Float>, colors: List<Color>, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val c = Offset(size.width / 2, size.height / 2)
        val maxR = size.minDimension / 2
        val n = values.size
        for (i in 0 until n) {
            val sweep = 360f / n
            val rad = maxR * (0.35f + 0.65f * values[i])
            drawArc(
                colors[i], startAngle = -90f + i * sweep + 2f, sweepAngle = sweep - 4f, useCenter = true,
                topLeft = Offset(c.x - rad, c.y - rad), size = Size(rad * 2, rad * 2), alpha = 0.9f
            )
        }
        drawCircle(Color(0xFF111111), maxR * 0.18f, c)
        drawCircle(C.orange, maxR * 0.1f, c)
    }
}
