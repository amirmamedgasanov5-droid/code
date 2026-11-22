package wtf.total.app

import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

class SetRow(val label: String, val w: Int, val r: Int)

private fun loadSets(c: Context): List<SetRow>? = try {
    c.getSharedPreferences("total", Context.MODE_PRIVATE).getString("sets", null)?.split(";")?.filter { it.isNotBlank() }
        ?.map { val p = it.split(","); SetRow(p[0], p[1].toInt(), p[2].toInt()) }
} catch (e: Exception) { null }

private fun saveSets(c: Context, l: List<SetRow>) = try {
    c.getSharedPreferences("total", Context.MODE_PRIVATE).edit().putString("sets", l.joinToString(";") { "${it.label},${it.w},${it.r}" }).apply()
} catch (_: Exception) {}

@Composable
fun WorkoutScreen(onExercise: () -> Unit) {
    val ctx = LocalContext.current
    val preview = LocalInspectionMode.current
    val defaults = listOf(SetRow("01", 185, 5), SetRow("W", 135, 5), SetRow("W", 90, 8))
    val sets = remember { mutableStateListOf<SetRow>().apply { addAll((if (preview) null else loadSets(ctx)) ?: defaults) } }
    var w by remember { mutableIntStateOf(200) }
    var reps by remember { mutableIntStateOf(5) }
    var secs by remember { mutableIntStateOf(41 * 60 + 16) }
    var rest by remember { mutableIntStateOf(3 * 60 + 3) }
    if (!preview) LaunchedEffect(Unit) { while (true) { delay(1000); secs++; rest++ } }
    val best = sets.maxOf { it.w }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = topInset() + 24.dp, bottom = 340.dp)) {
            Row(Modifier.fillMaxWidth().height(27.dp).padding(start = 31.dp, end = 30.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.clip(RoundedCornerShape(50))) {
                    Box(Modifier.width(70.dp).fillMaxHeight().background(Color(0xFF151515)), contentAlignment = Alignment.Center) {
                        Wide("%d:%02d".format(secs / 60, secs % 60), 12f, Color(0xFF666666))
                    }
                    Box(Modifier.width(56.dp).fillMaxHeight().background(Color(0xFF2E2E2E)), contentAlignment = Alignment.Center) {
                        Wide("%d:%02d".format(rest / 60, rest % 60), 12f, Color(0xFFA0A0A0))
                    }
                }
                Spacer(Modifier.weight(1f))
                Icon(Ic.DOTS, 20.dp, Color(0xFF555555))
            }
            Spacer(Modifier.height(29.dp))
            Txt("bb overhead press", 16f, Color(0xFFB3B3B3), modifier = Modifier.padding(start = 31.dp).tap(onExercise))
            Spacer(Modifier.height(10.dp))
            Column(Modifier.fillMaxWidth().treeLines(sets.size + 2)) {
                TreeRow("+", null, null, 0, 0, false) { }
                val pr = w > best
                TreeRow(if (pr) "best ever...?" else "", if (pr) w else null, null, w, reps, true) { reps = if (reps >= 30) 1 else reps + 1 }
                sets.forEach { s -> TreeRow(s.label, null, null, s.w, s.r, false) { } }
            }
            Spacer(Modifier.height(21.dp))
            listOf("db skullcrusher", "wt dips", "db bench press").forEach {
                Row(Modifier.fillMaxWidth().height(41.dp).padding(horizontal = 31.dp).tap(onExercise), verticalAlignment = Alignment.CenterVertically) {
                    Txt(it, 16f, Color(0xFFEDEDED)); Spacer(Modifier.weight(1f)); Txt("3 sets", 14f, Color(0xFF444444), FontWeight.Medium)
                }
            }
        }
        LogSheet(Modifier.align(Alignment.BottomCenter), w, { w = it }) {
            val n = sets.count { it.label != "W" } + 1
            sets.add(0, SetRow("%02d".format(n), w, reps))
            if (!preview) saveSets(ctx, sets)
        }
    }
}

@Composable
private fun TreeRow(label: String, prW: Int?, unused: Any?, w: Int, r: Int, pending: Boolean, onReps: () -> Unit) {
    Row(Modifier.fillMaxWidth().height(41.dp).padding(start = 63.dp, end = 30.dp), verticalAlignment = Alignment.CenterVertically) {
        if (label == "+") Txt("+", 17f, Color(0xFF444444), FontWeight.Bold)
        else if (pending) Txt(label, 16f, C.white)
        else Wide(label, 15f, Color(0xFF444444))
        Spacer(Modifier.weight(1f))
        if (label != "+") {
            if (prW != null) {
                Box(Modifier.clip(RoundedCornerShape(8.dp)).background(Color(0xFF4A0000)).padding(horizontal = 6.dp, vertical = 2.dp)) {
                    Txt("$prW", 18f, C.red2, FontWeight.Bold)
                }
                Txt(" × %02d".format(r), 18f, C.white, FontWeight.Bold, Modifier.tap(onReps))
            } else {
                Txt("$w × %02d".format(r), 18f, C.white, FontWeight.Bold, Modifier.tap(onReps))
            }
        }
    }
}

private fun Modifier.treeLines(rows: Int) = drawBehind {
    val lx = 34.dp.toPx(); val bx = 51.dp.toPx(); val rh = 41.dp.toPx(); val r = 14.dp.toPx()
    val col = Color(0xFF3A3A3A)
    drawLine(col, Offset(lx, -6.dp.toPx()), Offset(lx, rh * (rows - 1) + rh / 2 - r), 2.dp.toPx())
    for (i in 0 until rows) {
        val cy = rh * i + rh / 2
        val p = Path().apply { moveTo(lx, cy - r); quadraticBezierTo(lx, cy, bx, cy) }
        drawPath(p, col, style = Stroke(2.dp.toPx(), cap = StrokeCap.Round))
    }
}

@Composable
private fun LogSheet(modifier: Modifier, w: Int, onW: (Int) -> Unit, onLog: () -> Unit) {
    var acc by remember { mutableFloatStateOf(0f) }
    val tick = 18f
    Box(modifier.fillMaxWidth().height(325.dp)) {
        Canvas(Modifier.fillMaxSize()) {
            val cardH = 129.dp.toPx(); val cx = size.width / 2; val cy = 133.dp.toPx()
            val card = Path().apply { addRoundRect(androidx.compose.ui.geometry.RoundRect(0f, -400.dp.toPx(), size.width, cardH, androidx.compose.ui.geometry.CornerRadius.Zero, androidx.compose.ui.geometry.CornerRadius.Zero, androidx.compose.ui.geometry.CornerRadius(38.dp.toPx()), androidx.compose.ui.geometry.CornerRadius(38.dp.toPx()))) }
            val hole = Path().apply { addOval(androidx.compose.ui.geometry.Rect(Offset(cx, cy), 66.dp.toPx())) }
            val shape = Path.combine(PathOperation.Difference, card, hole)
            drawPath(shape, Brush.verticalGradient(listOf(Color.Transparent, Color(0xFF120008), Color(0xFF3A000C)), 0f, cardH))
            drawPath(shape, Brush.radialGradient(listOf(Color(0x88FF0A30), Color.Transparent), Offset(size.width * .86f, cardH), 120.dp.toPx()))
            // bright lower edge
            drawLine(Brush.horizontalGradient(listOf(Color(0xFF700018), Color(0xFFB00028)), 0f, size.width), Offset(30.dp.toPx(), cardH - 1.dp.toPx()), Offset(cx - 70.dp.toPx(), cardH - 1.dp.toPx()), 2.dp.toPx())
            drawLine(Brush.horizontalGradient(listOf(Color(0xFFB00028), Color(0xFFD00030)), 0f, size.width), Offset(cx + 70.dp.toPx(), cardH - 1.dp.toPx()), Offset(size.width - 30.dp.toPx(), cardH - 1.dp.toPx()), 2.dp.toPx())
            // region under the card
            drawRect(Brush.verticalGradient(listOf(Color(0xFF14000A), Color(0xFF0A0004)), cardH, size.height), Offset(0f, cardH), Size(size.width, size.height - cardH))
            drawCircle(Color(0xFF0A0204), 64.dp.toPx(), Offset(cx, cy))
            drawCircle(Color(0xFF2A1A1D), 52.dp.toPx(), Offset(cx, cy))
            drawCircle(Brush.radialGradient(listOf(Color(0xFF3A2A2C), Color(0xFF2B1D1F)), Offset(cx, cy - 10.dp.toPx()), 54.dp.toPx()), 51.dp.toPx(), Offset(cx, cy))
            val t = Color.White
            fun tickLine(a: Offset, b: Offset) = drawLine(t, a, b, 2.6.dp.toPx(), StrokeCap.Round)
            tickLine(Offset(cx + 19.dp.toPx(), cy), Offset(cx + 31.dp.toPx(), cy)); tickLine(Offset(cx - 19.dp.toPx(), cy), Offset(cx - 31.dp.toPx(), cy))
            tickLine(Offset(cx, cy - 19.dp.toPx()), Offset(cx, cy - 31.dp.toPx())); tickLine(Offset(cx, cy + 19.dp.toPx()), Offset(cx, cy + 31.dp.toPx()))
            drawLine(Color(0xFF3A2428), Offset(cx - 12.dp.toPx(), 56.dp.toPx()), Offset(cx + 12.dp.toPx(), 56.dp.toPx()), 3.dp.toPx(), StrokeCap.Round)
        }
        // dial tap target
        Box(Modifier.align(Alignment.TopCenter).offset(y = 81.dp).size(104.dp).clip(CircleShape).tap(onLog))
        // ruler
        Canvas(
            Modifier.align(Alignment.TopCenter).offset(y = 210.dp).fillMaxWidth().height(50.dp)
                .pointerInput(w) {
                    detectHorizontalDragGestures { _, dx ->
                        acc -= dx
                        val steps = (acc / (tick.dp.toPx())).toInt()
                        if (steps != 0) { acc -= steps * tick.dp.toPx(); onW((w + steps * 5).coerceIn(5, 1500)) }
                    }
                }
        ) {
            val cx = size.width / 2; val cy = size.height / 2
            val step = tick.dp.toPx()
            for (i in -14..14) {
                val x = cx + i * step - acc
                val idx = w / 5 + i
                val major = idx % 5 == 0
                val h = if (i == 0) 32.dp.toPx() else if (major) 28.dp.toPx() else if (idx % 2 == 0) 14.dp.toPx() else 10.dp.toPx()
                val a = (1f - kotlin.math.abs(i) / 15f).coerceIn(0.1f, 1f)
                val col = if (i == 0) Color(0xFFEF0609) else Color(0xFF3A3A3A).copy(alpha = a)
                drawLine(col, Offset(x, cy - h / 2), Offset(x, cy + h / 2), (if (i == 0) 3.dp else 2.2.dp).toPx(), StrokeCap.Round)
            }
        }
    }
}
