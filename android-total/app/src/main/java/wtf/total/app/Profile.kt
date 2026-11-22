package wtf.total.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

private val bwPts = listOf(
    92f to 1131f, 150f to 1115f, 195f to 1107f, 250f to 1150f, 290f to 1135f, 355f to 1176f, 405f to 1163f, 455f to 1157f, 505f to 1175f,
)

@Composable
fun ProfileScreen(
    status: String, lifts: Triple<Int, Int, Int>, onBadge: () -> Unit, onStat: (Int) -> Unit,
    onWeight: () -> Unit, onCons: () -> Unit,
) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = topInset())) {
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth().height(30.dp).padding(horizontal = 30.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Ic.GEAR, 19.dp, Color(0xFF5A5A5A))
            Spacer(Modifier.weight(1f))
            Icon(Ic.BELL, 19.dp, Color(0xFF5A5A5A))
        }
        Spacer(Modifier.height(25.dp))
        Box(Modifier.align(Alignment.CenterHorizontally).size(width = 102.dp, height = 116.dp)) {
            Photo(R.drawable.av_me, 102.dp)
            Box(
                Modifier.align(Alignment.BottomCenter).size(width = 39.dp, height = 26.dp).clip(CircleShape)
                    .background(C.badge).tap(onBadge),
                contentAlignment = Alignment.Center
            ) { Txt("A", 14f, C.white, FontWeight.Bold) }
        }
        Spacer(Modifier.height(4.dp))
        Canvas(Modifier.fillMaxWidth().height(16.dp)) {
            val cx = size.width / 2
            drawCircle(C.bubble, 5.dp.toPx(), Offset(cx - 33.dp.toPx(), 11.dp.toPx()))
            drawCircle(C.bubble, 2.6.dp.toPx(), Offset(cx - 28.dp.toPx(), 3.dp.toPx()))
        }
        Box(
            Modifier.align(Alignment.CenterHorizontally).widthIn(max = 213.dp).card(20.dp, Color(0xFF444444))
                .padding(horizontal = 14.dp, vertical = 10.dp)
        ) { Txt(status, 14f, Color(0xFFE8E8E8), FontWeight.Medium, lh = 20f) }
        Spacer(Modifier.height(34.dp))
        Txt("theo.ward", 17f, C.white, FontWeight.Medium, Modifier.align(Alignment.CenterHorizontally))
        Spacer(Modifier.height(10.dp))
        Row(Modifier.align(Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
            Icon(Ic.GLOBE, 14.dp, Color(0xFF6E6E6E))
            Spacer(Modifier.width(5.dp))
            Txt("top 2.3%", 13f, C.g3)
            Txt("  ·  ", 13f, C.g4)
            FlagUS(14.dp)
            Spacer(Modifier.width(5.dp))
            Txt("#286", 13f, C.g3)
        }
        Spacer(Modifier.height(33.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            listOf("S" to lifts.first, "B" to lifts.second, "D" to lifts.third).forEachIndexed { i, (l, v) ->
                Box(Modifier.weight(1f).height(119.dp).card().tap { onStat(i) }) {
                    Wide(l, 10f, Color(0xFF474747), Modifier.padding(start = 14.dp, top = 13.dp))
                    Txt("$v LB", 15f, C.white, FontWeight.Medium, Modifier.align(Alignment.BottomEnd).padding(end = 14.dp, bottom = 11.dp))
                }
            }
        }
        Spacer(Modifier.height(3.dp))
        Box(Modifier.padding(horizontal = 16.dp).fillMaxWidth().height(158.dp).card().tap(onWeight)) {
            Txt("176.4 LB", 14f, C.white, FontWeight.Medium, Modifier.padding(start = 14.dp, top = 11.dp))
            Txt("-1.5 LB", 14f, C.g4, modifier = Modifier.padding(start = 14.dp, top = 31.dp))
            Txt("5d", 14f, C.g4, modifier = Modifier.align(Alignment.TopEnd).padding(end = 14.dp, top = 11.dp))
            Canvas(Modifier.padding(start = 14.dp, end = 14.dp, top = 59.dp).fillMaxWidth().height(85.dp)) {
                val gx = 9.3.dp.toPx(); var x = 0f
                while (x <= size.width) { drawLine(Color(0xFF141414), Offset(x, 0f), Offset(x, size.height), 1.dp.toPx()); x += gx }
                val x0 = 92f; val x1 = 505f; val y0 = 1085f
                val pts = bwPts.map { (px, py) -> Offset((px - x0) / (x1 - x0) * size.width, (py - y0) / 1.24f * 1.dp.toPx()) }
                val path = catmull(pts)
                drawPath(path, Color(0xFF858585), style = Stroke(1.6.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
        }
        Spacer(Modifier.height(3.dp))
        Box(Modifier.padding(horizontal = 16.dp).fillMaxWidth().height(130.dp).card().tap(onCons)) {
            Txt("consistency", 14f, C.white, FontWeight.Medium, Modifier.padding(start = 14.dp, top = 11.dp))
            val on = setOf(0, 2, 4, 5, 7, 9, 11, 14, 16, 18, 19, 21, 23, 25, 28, 30, 32)
            Canvas(Modifier.padding(start = 212.dp, end = 14.dp).fillMaxWidth().height(130.dp)) {
                val cols = 7; val rows = 5
                val gx = size.width / (cols - 1 + 0.4f)
                for (r in 0 until rows) for (c in 0 until cols) {
                    val cx = gx * 0.2f + c * gx; val cy = (18 + r * 19).dp.toPx()
                    val col = if (r * 7 + c in on) C.pink else Color(0xFF3A3A3A)
                    drawLine(col, Offset(cx - 4.5.dp.toPx(), cy), Offset(cx + 4.5.dp.toPx(), cy), 2.5.dp.toPx(), StrokeCap.Round)
                }
            }
        }
        Spacer(Modifier.height(3.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            listOf("weekly goal" to "4 / 5", "streak" to "6 weeks").forEach { (l, v) ->
                Box(Modifier.weight(1f).height(119.dp).card()) {
                    Txt(l, 14f, C.g4, modifier = Modifier.padding(start = 14.dp, top = 11.dp))
                    Txt(v, 15f, C.white, FontWeight.Medium, Modifier.align(Alignment.BottomStart).padding(start = 14.dp, bottom = 11.dp))
                }
            }
        }
        Spacer(Modifier.height(110.dp))
    }
}

@Composable
fun VerifiedSheet(lift: String, weight: Int, onClose: () -> Unit) {
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.9f)).tap(onClose)) {
        Column(Modifier.align(Alignment.BottomCenter).padding(horizontal = 24.dp).padding(bottom = 12.dp).tap {}) {
            Box(
                Modifier.fillMaxWidth().height(232.dp).clip(RoundedCornerShape(28.dp))
                    .background(Color(0xFF6A0007))
                    .drawBehind {
                        drawRect(Brush.radialGradient(listOf(Color(0xFFFF050B), Color(0x00E10006)), Offset(size.width * .42f, -size.height * .05f), size.width * .8f))
                        drawRect(Brush.verticalGradient(listOf(Color.Transparent, Color(0xCC200003)), startY = size.height * .35f))
                        drawRect(Brush.radialGradient(listOf(Color(0x66FF0A12), Color.Transparent), Offset(size.width * .95f, size.height * 1.05f), size.width * .5f))
                    }
            ) {
                Box(Modifier.padding(start = 24.dp, top = 24.dp).clip(RoundedCornerShape(50)).background(Color(0x66000000)).padding(horizontal = 12.dp, vertical = 5.dp)) {
                    Wide("${lift.uppercase()} FREAK", 11f, Color(0xFFFFE3E3))
                }
                Column(Modifier.align(Alignment.BottomStart).padding(start = 24.dp, bottom = 27.dp)) {
                    Txt("$weight LB", 28f, C.white, FontWeight.Normal)
                    Spacer(Modifier.height(5.dp))
                    Txt("you $lift what others ${if (lift == "bench") "squat" else "bench"}.", 14.5f, Color(0xFFE2A9AC))
                }
            }
            Spacer(Modifier.height(2.dp))
            Column(Modifier.fillMaxWidth().card(28.dp, C.sheet).padding(12.dp)) {
                Row(Modifier.fillMaxWidth().padding(start = 12.dp, top = 14.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Txt("$lift verified", 15f, C.white, FontWeight.Medium)
                        Spacer(Modifier.height(5.dp))
                        Txt("theo.ward", 15f, C.g3)
                    }
                    Box(Modifier.size(38.dp).clip(SquircleShapeSmall).background(Color(0xFF322F06)), contentAlignment = Alignment.Center) {
                        Icon(Ic.CHECK, 18.dp, Color(0xFFD9A800))
                    }
                    Photo(R.drawable.av_me_s, 38.dp, Modifier.offset(x = (-6).dp))
                }
                Spacer(Modifier.height(18.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    listOf(Triple("top", "2.3%", Ic.GLOBE), Triple("us", "#286", Ic.GLOBE), Triple("bw", "176.4 lb", Ic.KETTLE)).forEach { (l, v, ic) ->
                        Box(Modifier.weight(1f).height(106.dp).card(20.dp, C.card2)) {
                            Row(Modifier.padding(start = 14.dp, top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                                if (l == "us") FlagUS(14.dp) else Icon(ic, 14.dp, C.g2)
                                Spacer(Modifier.width(6.dp)); Txt(l, 14f, C.g2)
                            }
                            Txt(v, 15f, C.white, FontWeight.Medium, Modifier.align(Alignment.BottomStart).padding(start = 14.dp, bottom = 14.dp))
                        }
                    }
                }
                Spacer(Modifier.height(3.dp))
                Box(Modifier.fillMaxWidth().height(88.dp).card(20.dp, C.card2).padding(horizontal = 14.dp)) {
                    Row(Modifier.padding(top = 13.dp)) { Txt("3", 15f, C.white, FontWeight.Medium); Txt(" / 3", 15f, C.g3) }
                    Box(Modifier.align(Alignment.CenterStart).padding(top = 6.dp).fillMaxWidth().height(4.dp).clip(CircleShape).background(C.yellow))
                    Txt("fully ranked. your total rank is live.", 14f, C.g3, modifier = Modifier.align(Alignment.BottomStart).padding(bottom = 14.dp))
                }
            }
        }
    }
}

private val SquircleShapeSmall = SquircleShape()
