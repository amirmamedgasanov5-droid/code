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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

private val warm = Color(0xFF100B0A)
private val warmCard = Color(0xFF151010)
private val warmTile = Color(0xFF130E0E)

@Composable
fun SummaryScreen(onBack: () -> Unit) {
    Column(Modifier.fillMaxSize().background(warm).verticalScroll(rememberScrollState())) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(bottomStart = 30.dp, bottomEnd = 30.dp)).background(warmCard).padding(top = topInset())) {
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth().height(30.dp).padding(horizontal = 24.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(30.dp).tap(onBack), contentAlignment = Alignment.CenterStart) { Icon(Ic.BACK, 17.dp, Color(0xFF5A5A5A)) }
                Spacer(Modifier.weight(1f))
                Row(Modifier.height(28.dp).clip(RoundedCornerShape(50)).background(C.yellow).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Ic.FLAME, 13.dp, C.white); Spacer(Modifier.width(5.dp)); Txt("8", 14f, C.white, FontWeight.Bold)
                }
                Spacer(Modifier.width(6.dp))
                Photo(R.drawable.av_me_s, 28.dp)
                Spacer(Modifier.width(20.dp))
                Icon(Ic.DOTS, 20.dp, Color(0xFF555555))
            }
            Spacer(Modifier.height(38.dp))
            Column(Modifier.padding(start = 31.dp).size(63.dp).clip(RoundedCornerShape(16.dp)).background(Color(0xFF333030)), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.fillMaxWidth().height(24.dp).background(Color(0xFF474444)), contentAlignment = Alignment.Center) { Wide("TUE", 10f, Color(0xFFB0B0B0)) }
                Spacer(Modifier.height(2.dp))
                Txt("6", 22f, C.white, FontWeight.Bold)
                Spacer(Modifier.height(1.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    Box(Modifier.size(4.dp).clip(CircleShape).background(C.red)); Box(Modifier.size(4.dp).clip(CircleShape).background(C.yellow))
                }
            }
            Spacer(Modifier.height(30.dp))
            Txt("27,115 lb moved", 18f, C.white, modifier = Modifier.padding(start = 31.dp), lh = 28f)
            Txt("in 1:07:55", 18f, C.white, modifier = Modifier.padding(start = 31.dp), lh = 28f)
            Spacer(Modifier.height(58.dp))
            Row(Modifier.padding(start = 38.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Ic.HEART, 14.dp, Color(0xFF6A6A6A)); Spacer(Modifier.width(8.dp)); Txt("peak hr 163 bpm", 15f, Color(0xFF6A6A6A))
            }
            Spacer(Modifier.height(9.dp))
            Row(Modifier.padding(start = 38.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Ic.FLAME, 14.dp, Color(0xFF6A6A6A)); Spacer(Modifier.width(8.dp)); Txt("calories 441", 15f, Color(0xFF6A6A6A))
            }
            Spacer(Modifier.height(28.dp))
        }
        Spacer(Modifier.height(3.dp))
        Row(Modifier.fillMaxWidth().height(194.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            Box(Modifier.weight(1f).fillMaxHeight()) {
                Canvas(Modifier.fillMaxSize()) {
                    val d = size.minDimension
                    val circle = Path().apply { addOval(androidx.compose.ui.geometry.Rect(Offset(size.width / 2, size.height / 2), d / 2)) }
                    clipPath(circle) {
                        drawRect(Color(0xFF1F1919))
                        val wave = Path().apply {
                            moveTo(0f, 0f); lineTo(size.width, 0f); lineTo(size.width, 70.dp.toPx())
                            cubicTo(size.width * .8f, 58.dp.toPx(), size.width * .62f, 80.dp.toPx(), size.width * .45f, 66.dp.toPx())
                            cubicTo(size.width * .3f, 54.dp.toPx(), size.width * .12f, 70.dp.toPx(), 0f, 62.dp.toPx()); close()
                        }
                        clipPath(wave) {
                            drawRect(Color(0xFF191313))
                            var x = -size.height
                            while (x < size.width) { drawLine(Color(0xFF241D1D), Offset(x, size.height), Offset(x + size.height, 0f), 1.dp.toPx()); x += 5.dp.toPx() }
                        }
                    }
                }
                Column(Modifier.align(Alignment.Center).offset(y = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Txt("trucks", 14f, Color(0xFF8A8A8A)); Spacer(Modifier.height(4.dp)); Txt("0.68", 20f, C.white, FontWeight.Bold)
                }
            }
            Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    listOf("reps" to "170", "sets" to "21").forEach { (l, v) ->
                        Box(Modifier.weight(1f).fillMaxHeight().card(20.dp, warmTile)) {
                            Txt(l, 14f, Color(0xFF6A6A6A), modifier = Modifier.padding(start = 14.dp, top = 12.dp))
                            Txt(v, 14f, Color(0xFFDDDDDD), modifier = Modifier.align(Alignment.BottomStart).padding(start = 14.dp, bottom = 14.dp))
                        }
                    }
                }
                Box(Modifier.weight(1f).fillMaxWidth().card(20.dp, warmTile)) {
                    Txt("exercises", 14f, Color(0xFF6A6A6A), modifier = Modifier.padding(start = 14.dp, top = 12.dp))
                    Txt("6", 14f, Color(0xFFDDDDDD), modifier = Modifier.align(Alignment.BottomStart).padding(start = 14.dp, bottom = 14.dp))
                }
            }
        }
        Spacer(Modifier.height(3.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(warmCard).padding(start = 31.dp, end = 31.dp, top = 32.dp, bottom = 24.dp)) {
            Txt("pr's", 17f, C.white)
            Spacer(Modifier.height(28.dp))
            listOf(Triple("p4p pr", "db bench press" to "90 × 10", Color(0xFFFF9A00)), Triple("best ever", "bb flat bench" to "335 × 05", C.red)).forEach { (k, v, c) ->
                Row(Modifier.fillMaxWidth().padding(bottom = 22.dp), verticalAlignment = Alignment.Top) {
                    Box(Modifier.size(width = 2.5.dp, height = 40.dp).background(c))
                    Spacer(Modifier.width(16.dp))
                    Column(Modifier.weight(1f)) {
                        Txt(k, 15f, C.white); Spacer(Modifier.height(5.dp)); Txt(v.first, 15f, Color(0xFF6A6A6A))
                    }
                    Txt(v.second, 16f, C.white, FontWeight.Bold)
                }
            }
        }
        Spacer(Modifier.height(30.dp))
    }
}
