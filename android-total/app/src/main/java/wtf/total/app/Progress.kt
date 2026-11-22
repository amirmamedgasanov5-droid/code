package wtf.total.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import kotlin.math.roundToInt

private val lineGreen = Color(0xFF16D616)

// chart points as measured on the reference (x px, y px); tooltip data per point
private val progPts = listOf(
    93f to 909f, 120f to 909f, 145f to 877f, 170f to 907f, 200f to 907f, 222f to 877f, 247f to 907f, 300f to 905f,
    325f to 876f, 400f to 874f, 430f to 904f, 445f to 880f, 478f to 839f, 505f to 843f,
)
private val progInfo = listOf(
    "25 × 12" to "02 aug 2026", "25 × 12" to "05 aug 2026", "35 × 10" to "11 aug 2026", "30 × 12" to "17 aug 2026",
    "30 × 12" to "20 aug 2026", "40 × 10" to "28 aug 2026", "30 × 12" to "04 sep 2026", "30 × 12" to "08 sep 2026",
    "40 × 12" to "14 sep 2026", "40 × 12" to "20 sep 2026", "35 × 12" to "24 sep 2026", "35 × 12" to "27 sep 2026",
    "45 × 12" to "29 sep 2026", "45 × 11" to "02 oct 2026",
)

private fun pts(y: Float) = 14f + (909f - y) / 70f * 4f

@Composable
fun ProgressScreen(onBack: () -> Unit) {
    var seg by remember { mutableIntStateOf(0) }
    var sel by remember { mutableIntStateOf(12) }
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().padding(top = topInset())) {
            Spacer(Modifier.height(12.dp))
            TopBar(Ic.BACK, onBack) { Txt("?", 18f, Color(0xFF555555), FontWeight.Medium) }
            Spacer(Modifier.height(19.dp))
            Txt("lateral raise", 18f, C.white, modifier = Modifier.padding(start = 31.dp))
            Spacer(Modifier.height(6.dp))
            Column(Modifier.padding(start = 31.dp)) { Txt("p4p progression", 18f, Color(0xFF5A5A5A)); Spacer(Modifier.height(2.dp)); Box(Modifier.width(137.dp).height(1.dp).background(Color(0xFF262626))) }
            Spacer(Modifier.height(26.dp))
            Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                listOf("peak" to "18.0 pts", "latest" to "17.8 pts").forEach { (l, v) ->
                    Box(Modifier.weight(1f).height(180.dp).card()) {
                        Txt(l, 14f, Color(0xFF666666), modifier = Modifier.padding(start = 14.dp, top = 12.dp))
                        Txt(v, 14f, C.white, modifier = Modifier.align(Alignment.BottomStart).padding(start = 14.dp, bottom = 15.dp))
                    }
                }
            }
            Spacer(Modifier.height(30.dp))
            if (seg == 0) {
                Box(Modifier.fillMaxWidth().height(315.dp)) {
                    Canvas(
                        Modifier.fillMaxSize()
                            .pointerInput(Unit) {
                                detectTapGestures { o -> sel = nearest(o.x / size.width) }
                            }
                            .pointerInput(Unit) {
                                detectHorizontalDragGestures { ch, _ -> sel = nearest(ch.position.x / size.width) }
                            }
                    ) {
                        val gx = 9.dp.toPx(); var x = 14.dp.toPx()
                        while (x < size.width - 14.dp.toPx()) { drawLine(Color(0xFF141414), Offset(x, 0f), Offset(x, size.height), 1.dp.toPx()); x += gx }
                        val k = 1.dp.toPx() / 1.24f
                        fun m(p: Pair<Float, Float>) = Offset((p.first - 55f) * k, (p.second - 680f) * k)
                        val q = progPts.map(::m)
                        val last = q.size - 1
                        drawPath(catmull(q.subList(0, last)), lineGreen, style = Stroke(2.8.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
                        drawLine(lineGreen, Offset(q[last - 1].x + 9.dp.toPx(), q[last - 1].y + 1.dp.toPx()), q[last], 2.8.dp.toPx(), StrokeCap.Round)
                        val s = q[sel]
                        drawCircle(lineGreen, 5.5.dp.toPx(), s)
                    }
                    val dens = androidx.compose.ui.platform.LocalDensity.current
                    val sp = progPts[sel]
                    val tx = ((sp.first - 55f) / 1.24f).dp
                    val ty = ((sp.second - 680f) / 1.24f).dp
                    val tipX = (tx - 137.dp).coerceIn(10.dp, 210.dp)
                    Canvas(Modifier.offset(x = tx - 6.dp, y = ty - 24.dp).size(12.dp, 7.dp)) { drawPath(Path().apply { moveTo(0f, 0f); lineTo(size.width, 0f); lineTo(size.width / 2, size.height); close() }, Color(0xFF4A4A4A)) }
                    Box(Modifier.offset(x = tipX, y = ty - 109.dp).size(width = 170.dp, height = 85.dp).clip(RoundedCornerShape(16.dp)).background(Color(0xFF4A4A4A))) {
                        Txt(progInfo[sel].first, 15f, C.white, FontWeight.Medium, Modifier.padding(start = 14.dp, top = 8.dp))
                        Txt(progInfo[sel].second, 15f, C.white, FontWeight.Medium, Modifier.padding(start = 14.dp, top = 28.dp))
                        Txt("p4p:", 14f, Color(0xFF9A9A9A), modifier = Modifier.align(Alignment.BottomStart).padding(start = 14.dp, bottom = 10.dp))
                        Txt("%.1f pts".format(pts(sp.second)), 14f, C.white, FontWeight.Medium, Modifier.align(Alignment.BottomEnd).padding(end = 14.dp, bottom = 10.dp))
                    }
                }
            } else {
                Txt(
                    "p4p points scale the weight you lifted by your bodyweight and the rep count, so the line only goes up when you actually got stronger, not just heavier.",
                    16f, Color(0xFF8A8A8A), modifier = Modifier.padding(horizontal = 31.dp), lh = 24f
                )
            }
        }
        SegPill(listOf("progress", "how to"), seg, { seg = it }, Modifier.align(Alignment.BottomCenter).padding(bottom = 18.dp))
    }
}

private fun nearest(f: Float): Int {
    val x = 55f + f * 448f
    return progPts.indices.minByOrNull { abs(progPts[it].first - x) } ?: 0
}

// ---------- muscles ----------
private class Muscle(val name: String, val pct: String, val color: Color)

@Composable
fun MusclesScreen(onBack: () -> Unit) {
    var seg by remember { mutableIntStateOf(0) }
    val groups = listOf(Muscle("shoulders", "19.9", C.green), Muscle("back", "13.3", C.green), Muscle("core", "12.2", C.green))
    val exercises = listOf(Muscle("bb overhead press", "21.4", C.green), Muscle("db bench press", "14.0", C.green), Muscle("wt dips", "9.7", C.green))
    val list = if (seg == 0) groups else exercises
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = topInset(), bottom = 90.dp)) {
            Spacer(Modifier.height(12.dp))
            TopBar(Ic.BACK, onBack) { Txt("?", 18f, Color(0xFF555555), FontWeight.Medium) }
            Spacer(Modifier.height(19.dp))
            Txt("strength gains", 18f, C.white, modifier = Modifier.padding(start = 31.dp))
            Spacer(Modifier.height(8.dp))
            Row(Modifier.padding(start = 31.dp)) {
                Column(Modifier.width(IntrinsicSize.Max)) { Txt("p4p", 18f, Color(0xFF5A5A5A)); Spacer(Modifier.height(2.dp)); Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF262626))) }
                Txt(" vs ", 18f, C.white)
                Column(Modifier.width(IntrinsicSize.Max)) { Txt("since you started", 18f, Color(0xFF5A5A5A)); Spacer(Modifier.height(2.dp)); Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF262626))) }
            }
            Spacer(Modifier.height(26.dp))
            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(3.5.dp)) {
                list.forEachIndexed { i, m ->
                    Box(Modifier.fillMaxWidth().height(61.dp).card(20.dp)) {
                        Txt(m.name, 15f, Color(0xFFE5E5E5), modifier = Modifier.padding(start = 14.dp, top = 11.dp))
                        Txt("stronger by ${m.pct}%", 15f, Color(0xFF5F5F5F), modifier = Modifier.padding(start = 14.dp, top = 33.dp))
                        BodyIcon(i, Modifier.align(Alignment.CenterEnd).padding(end = 14.dp))
                    }
                }
            }
            Box(Modifier.fillMaxWidth().height(40.dp)) {
                Box(Modifier.align(Alignment.TopCenter).padding(top = 0.dp).width(340.dp).height(30.dp).card(16.dp, Color(0xFF0A0A0A)))
                Box(Modifier.align(Alignment.TopCenter).padding(top = 4.dp).width(314.dp).height(32.dp).card(16.dp, Color(0xFF070707)))
                Box(Modifier.align(Alignment.TopCenter).offset(y = (-16).dp).size(width = 40.dp, height = 24.dp).clip(RoundedCornerShape(50)).background(Color(0xFF3A3A3A)), contentAlignment = Alignment.Center) {
                    Wide("+9", 12f, C.white)
                }
            }
            Spacer(Modifier.height(30.dp))
            Txt("training split", 18f, C.white, modifier = Modifier.padding(start = 31.dp))
            Spacer(Modifier.height(29.dp))
            Box(Modifier.fillMaxWidth().height(260.dp)) {
                Flower(Modifier.align(Alignment.Center).offset(y = (-4).dp).size(190.dp))
                @Composable fun lab(n: String, p: String, x: Int, y: Int) {
                    Column(Modifier.align(Alignment.TopStart).offset(x = (x - 40).dp, y = y.dp).width(80.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Txt(n, 14f, C.white); Txt(p, 14f, Color(0xFF555555))
                    }
                }
                lab("chest", "16%", 196, 6); lab("arms", "28%", 86, 62); lab("back", "21%", 306, 62)
                lab("shoulders", "11%", 88, 178); lab("legs", "20%", 302, 178); lab("core", "4%", 196, 234)
            }
        }
        SegPill(listOf("groups", "exercises"), seg, { seg = it }, Modifier.align(Alignment.BottomCenter).padding(bottom = 18.dp))
    }
}

@Composable
private fun BodyIcon(i: Int, modifier: Modifier) {
    Canvas(modifier.size(46.dp, 44.dp)) {
        val body = Color(0xFF2E2E2E); val edge = Color(0xFF1A1A1A); val g = C.green
        val w = size.width; val h = size.height
        // head, torso, arms
        drawCircle(body, w * .09f, Offset(w * .5f, h * .1f))
        val torso = Path().apply {
            moveTo(w * .22f, h * .22f); lineTo(w * .78f, h * .22f); lineTo(w * .68f, h * .62f); lineTo(w * .6f, h * .95f)
            lineTo(w * .4f, h * .95f); lineTo(w * .32f, h * .62f); close()
        }
        drawPath(torso, body); drawPath(torso, edge, style = Stroke(1.2.dp.toPx(), join = StrokeJoin.Round))
        listOf(.12f, .88f).forEach { x ->
            drawRoundRect(body, Offset(w * x - w * .07f, h * .2f), androidx.compose.ui.geometry.Size(w * .14f, h * .5f), androidx.compose.ui.geometry.CornerRadius(w * .07f))
        }
        when (i) {
            0 -> listOf(.13f, .87f).forEach { x -> drawRoundRect(g, Offset(w * x - w * .09f, h * .18f), androidx.compose.ui.geometry.Size(w * .18f, h * .14f), androidx.compose.ui.geometry.CornerRadius(8f)) }
            1 -> {
                drawLine(g, Offset(w * .3f, h * .3f), Offset(w * .5f, h * .62f), 5.dp.toPx(), StrokeCap.Round)
                drawLine(g, Offset(w * .7f, h * .3f), Offset(w * .5f, h * .62f), 5.dp.toPx(), StrokeCap.Round)
                drawLine(g, Offset(w * .5f, h * .5f), Offset(w * .5f, h * .8f), 5.dp.toPx(), StrokeCap.Round)
            }
            else -> {
                val cx = w * .5f
                drawRoundRect(g, Offset(cx - w * .12f, h * .42f), androidx.compose.ui.geometry.Size(w * .24f, h * .42f), androidx.compose.ui.geometry.CornerRadius(w * .1f))
                for (k in 0..3) drawLine(Color(0xFF0B3A0B), Offset(cx - w * .12f, h * (.5f + .09f * k)), Offset(cx + w * .12f, h * (.5f + .09f * k)), 1.dp.toPx())
                drawLine(Color(0xFF0B3A0B), Offset(cx, h * .42f), Offset(cx, h * .84f), 1.dp.toPx())
            }
        }
    }
}

@Composable
private fun Flower(modifier: Modifier) {
    Canvas(modifier) {
        val c = Offset(size.width / 2, size.height / 2)
        val R = 60.dp.toPx()
        // angle (deg, 0 = up), value, color
        val petals = listOf(
            Triple(0f, .57f, Color(0xFFFF0010)), Triple(60f, .78f, C.purple), Triple(120f, .71f, Color(0xFFFF0A1A)),
            Triple(180f, .18f, C.yellow), Triple(240f, .42f, Color(0xFFFF5A0A)), Triple(300f, 1f, C.purple),
        )
        fun petal(scale: Float): Path = Path().apply {
            val r = R * scale; val wd = R * 0.36f * scale; val wi = R * 0.16f * scale; val r0 = R * 0.1f * scale
            moveTo(-wi, -r0); lineTo(wi, -r0); lineTo(wd, -r); lineTo(-wd, -r); close()
        }
        fun stroke(s: Float) = Stroke(R * 0.3f * s, join = StrokeJoin.Round)
        petals.forEach { (ang, v, col) ->
            translate(c.x, c.y) {
                rotate(ang, Offset.Zero) {
                    drawPath(petal(1f), Color(0xFF191919)); drawPath(petal(1f), Color(0xFF191919), style = stroke(1f))
                }
            }
        }
        petals.forEach { (ang, v, col) ->
            translate(c.x, c.y) {
                rotate(ang, Offset.Zero) {
                    val s = 0.3f + 0.7f * v
                    drawPath(petal(s), col); drawPath(petal(s), col, style = stroke(s))
                    listOf(0.72f, 0.46f).forEach { k ->
                        drawPath(petal(s * k), Color.Black.copy(alpha = .6f), style = Stroke(1.4.dp.toPx(), join = StrokeJoin.Round))
                    }
                }
            }
        }
        drawCircle(Color.Black, 4.dp.toPx(), c)
    }
}
