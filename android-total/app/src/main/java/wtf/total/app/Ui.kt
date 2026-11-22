package wtf.total.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sign
import kotlin.math.sin

val Inter = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_medium, FontWeight.Medium),
    Font(R.font.inter_semibold, FontWeight.SemiBold),
    Font(R.font.inter_bold, FontWeight.Bold),
)

object C {
    val bg = Color(0xFF000000)
    val card = Color(0xFF0D0D0D)
    val card2 = Color(0xFF1F1F1F)
    val sheet = Color(0xFF161616)
    val white = Color(0xFFFFFFFF)
    val g1 = Color(0xFFB8B8B8)
    val g2 = Color(0xFF8A8A8A)
    val g3 = Color(0xFF626262)
    val g4 = Color(0xFF444444)
    val g5 = Color(0xFF2B2B2B)
    val bubble = Color(0xFF383838)
    val red = Color(0xFFE10006)
    val red2 = Color(0xFFFF1A1A)
    val yellow = Color(0xFFFEB403)
    val purple = Color(0xFFB742FF)
    val badge = Color(0xFF773CA6)
    val green = Color(0xFF1ED91E)
    val tan = Color(0xFF9B7B62)
    val pink = Color(0xFFFF2D78)
}

@Composable
fun Txt(
    text: String, sp: Float = 14f, color: Color = C.white, w: FontWeight = FontWeight.Normal,
    modifier: Modifier = Modifier, align: TextAlign? = null, ls: Float = 0f, lh: Float = 0f,
    maxLines: Int = Int.MAX_VALUE, underline: Boolean = false,
) = Text(
    text, modifier, color, (sp * 0.94f).sp, null, w, Inter, ls.sp,
    if (underline) TextDecoration.Underline else null, align,
    if (lh > 0f) lh.sp else TextUnit.Unspecified, maxLines = maxLines,
)

/** Wide, bold, tracked label used by the app for tiny captions (S / B / D, timer, tags). */
@Composable
fun Wide(text: String, sp: Float = 10f, color: Color = C.g4, modifier: Modifier = Modifier) =
    Txt(text, sp, color, FontWeight.Bold, modifier, ls = sp * 0.12f)

fun Modifier.card(r: Dp = 22.dp, color: Color = C.card) = clip(RoundedCornerShape(r)).background(color)

fun Modifier.tap(onClick: () -> Unit) = clickable(
    interactionSource = MutableInteractionSource(), indication = null, onClick = onClick
)

class SquircleShape(private val n: Float = 4.2f) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val p = Path(); val steps = 96
        for (i in 0..steps) {
            val t = 2.0 * Math.PI * i / steps
            val c = cos(t).toFloat(); val s = sin(t).toFloat()
            val x = size.width / 2 * (1 + sign(c) * abs(c).pow(2f / n))
            val y = size.height / 2 * (1 + sign(s) * abs(s).pow(2f / n))
            if (i == 0) p.moveTo(x, y) else p.lineTo(x, y)
        }
        p.close()
        return Outline.Generic(p)
    }
}

@Composable
fun Photo(res: Int, size: Dp, modifier: Modifier = Modifier, dim: Float = 0f) {
    Box(modifier.size(size).clip(SquircleShape())) {
        Image(painterResource(res), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        if (dim > 0f) Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = dim)))
    }
}

// ---------- icons (canvas drawn) ----------
enum class Ic { BACK, GEAR, BELL, BOOKMARK, HEART, SEARCH, FILTER, GLOBE, FLAME, DOTS, UNDO, QUESTION, CHECK, KETTLE, HEARTBEAT }

@Composable
fun Icon(kind: Ic, size: Dp, color: Color, modifier: Modifier = Modifier) {
    Canvas(modifier.size(size)) { drawIcon(kind, color) }
}

private fun DrawScope.drawIcon(kind: Ic, color: Color) {
    val w = size.width; val h = size.height; val st = w * 0.1f
    when (kind) {
        Ic.BACK -> {
            val p = Path().apply { moveTo(w * .92f, h * .5f); lineTo(w * .1f, h * .5f); moveTo(w * .46f, h * .1f); lineTo(w * .08f, h * .5f); lineTo(w * .46f, h * .9f) }
            drawPath(p, color, style = Stroke(w * .13f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
        Ic.GEAR -> {
            val p = Path()
            for (i in 0 until 6) {
                val a = Math.toRadians(60.0 * i - 90)
                val x = w / 2 + (w * .48f) * cos(a).toFloat(); val y = h / 2 + (h * .48f) * sin(a).toFloat()
                if (i == 0) p.moveTo(x, y) else p.lineTo(x, y)
            }
            p.close()
            drawPath(p, color); drawCircle(Color.Black, w * .17f, Offset(w / 2, h / 2))
        }
        Ic.BELL -> {
            val p = Path().apply {
                moveTo(w * .5f, h * .08f)
                cubicTo(w * .25f, h * .08f, w * .2f, h * .3f, w * .2f, h * .52f)
                lineTo(w * .1f, h * .72f); lineTo(w * .9f, h * .72f); lineTo(w * .8f, h * .52f)
                cubicTo(w * .8f, h * .3f, w * .75f, h * .08f, w * .5f, h * .08f); close()
            }
            drawPath(p, color); drawCircle(color, w * .13f, Offset(w / 2, h * .86f))
        }
        Ic.BOOKMARK -> {
            val p = Path().apply { moveTo(w * .2f, h * .05f); lineTo(w * .8f, h * .05f); lineTo(w * .8f, h * .95f); lineTo(w * .5f, h * .68f); lineTo(w * .2f, h * .95f); close() }
            drawPath(p, color)
        }
        Ic.HEART -> {
            val p = Path().apply {
                moveTo(w * .5f, h * .92f)
                cubicTo(w * -.15f, h * .5f, w * .12f, h * .02f, w * .5f, h * .3f)
                cubicTo(w * .88f, h * .02f, w * 1.15f, h * .5f, w * .5f, h * .92f); close()
            }
            drawPath(p, color)
        }
        Ic.SEARCH -> {
            drawCircle(color, w * .32f, Offset(w * .43f, h * .43f), style = Stroke(w * .12f))
            drawLine(color, Offset(w * .66f, h * .66f), Offset(w * .92f, h * .92f), w * .13f, StrokeCap.Round)
        }
        Ic.FILTER -> {
            drawLine(color, Offset(w * .1f, h * .22f), Offset(w * .9f, h * .22f), w * .1f, StrokeCap.Round)
            drawLine(color, Offset(w * .25f, h * .5f), Offset(w * .75f, h * .5f), w * .1f, StrokeCap.Round)
            drawLine(color, Offset(w * .4f, h * .78f), Offset(w * .6f, h * .78f), w * .1f, StrokeCap.Round)
        }
        Ic.GLOBE -> {
            drawCircle(color, w * .48f, Offset(w / 2, h / 2))
            val p = Path().apply { moveTo(w * .15f, h * .45f); quadraticBezierTo(w * .4f, h * .3f, w * .6f, h * .5f); quadraticBezierTo(w * .75f, h * .7f, w * .9f, h * .62f) }
            drawPath(p, Color.Black, style = Stroke(w * .1f, cap = StrokeCap.Round))
        }
        Ic.FLAME -> {
            val p = Path().apply {
                moveTo(w * .5f, h * .02f)
                cubicTo(w * .55f, h * .3f, w * .92f, h * .45f, w * .85f, h * .7f)
                cubicTo(w * .8f, h * .92f, w * .6f, h * .98f, w * .5f, h * .98f)
                cubicTo(w * .3f, h * .98f, w * .12f, h * .88f, w * .15f, h * .66f)
                cubicTo(w * .17f, h * .5f, w * .3f, h * .4f, w * .38f, h * .25f)
                cubicTo(w * .42f, h * .16f, w * .45f, h * .08f, w * .5f, h * .02f); close()
            }
            drawPath(p, color)
        }
        Ic.DOTS -> {
            for (i in 0..2) drawCircle(color, w * .09f, Offset(w * (.16f + .34f * i), h / 2))
        }
        Ic.UNDO -> {
            val p = Path().apply { moveTo(w * .2f, h * .45f); lineTo(w * .65f, h * .45f); cubicTo(w * .95f, h * .45f, w * .95f, h * .85f, w * .62f, h * .85f); lineTo(w * .4f, h * .85f) }
            drawPath(p, color, style = Stroke(w * .11f, cap = StrokeCap.Round, join = StrokeJoin.Round))
            val a = Path().apply { moveTo(w * .38f, h * .2f); lineTo(w * .14f, h * .45f); lineTo(w * .38f, h * .7f) }
            drawPath(a, color, style = Stroke(w * .11f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
        Ic.QUESTION -> {}
        Ic.CHECK -> {
            val p = Path().apply { moveTo(w * .22f, h * .52f); lineTo(w * .43f, h * .72f); lineTo(w * .78f, h * .3f) }
            drawPath(p, color, style = Stroke(w * .14f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
        Ic.KETTLE -> {
            drawRoundRect(color, Offset(w * .1f, h * .3f), Size(w * .8f, h * .62f), androidx.compose.ui.geometry.CornerRadius(w * .22f))
            drawArc(color, 180f, 180f, false, Offset(w * .28f, h * .05f), Size(w * .44f, h * .44f), style = Stroke(w * .1f))
        }
        Ic.HEARTBEAT -> drawIcon(Ic.HEART, color)
    }
}

@Composable
fun FlagUS(size: Dp) {
    Canvas(Modifier.size(size).clip(CircleShape)) {
        val sh = this.size.height / 7f
        for (i in 0 until 7) drawRect(if (i % 2 == 0) Color(0xFFD22B3A) else Color.White, Offset(0f, i * sh), Size(this.size.width, sh))
        drawRect(Color(0xFF3C4A9E), Offset.Zero, Size(this.size.width * .5f, sh * 4))
    }
}

fun catmull(q: List<Offset>): Path {
    val p = Path(); p.moveTo(q[0].x, q[0].y)
    for (i in 0 until q.size - 1) {
        val p0 = q.getOrElse(i - 1) { q[i] }; val p1 = q[i]; val p2 = q[i + 1]; val p3 = q.getOrElse(i + 2) { q[i + 1] }
        p.cubicTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y)
    }
    return p
}

/** top inset: iOS screen starts content under a 59pt status area; keep geometry identical. */
@Composable
fun topInset(): Dp {
    val t = with(androidx.compose.ui.platform.LocalDensity.current) { WindowInsets.statusBars.getTop(this).toDp() }
    return if (t > 59.dp) t else 59.dp
}

@Composable
fun BottomFade(modifier: Modifier = Modifier, h: Dp = 90.dp) {
    Box(modifier.fillMaxWidth().height(h).background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black))))
}

@Composable
fun SegPill(opts: List<String>, sel: Int, onSel: (Int) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier.height(46.dp).clip(RoundedCornerShape(50)).background(Color(0xFF1B1B1B)),
        verticalAlignment = Alignment.CenterVertically
    ) {
        opts.forEachIndexed { i, o ->
            Box(
                Modifier.fillMaxHeight().clip(RoundedCornerShape(50))
                    .background(if (i == sel) Color(0xFF2E2E2E) else Color.Transparent)
                    .tap { onSel(i) }.width(95.dp),
                contentAlignment = Alignment.Center
            ) { Txt(o, 14f, if (i == sel) C.white else C.g3, FontWeight.Medium) }
        }
    }
}

@Composable
fun TopBar(left: Ic?, onLeft: () -> Unit = {}, right: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().height(30.dp).padding(horizontal = 24.dp), verticalAlignment = Alignment.CenterVertically) {
        if (left != null) Box(Modifier.size(30.dp).tap(onLeft), contentAlignment = Alignment.CenterStart) { Icon(left, 17.dp, C.g3) }
        Spacer(Modifier.weight(1f))
        right()
    }
}
