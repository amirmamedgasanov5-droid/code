package wtf.total.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

private class SetRow(val tag: String, val w: Int, val r: Int)

@Composable
fun TrainScreen() {
    var seg by remember { mutableIntStateOf(0) }
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Segmented(listOf("log", "progress", "muscles", "last"), seg, { seg = it })
        Spacer(Modifier.height(12.dp))
        when (seg) {
            0 -> LogTab()
            1 -> ProgressTab()
            2 -> MusclesTab()
            else -> LastWorkoutTab()
        }
    }
}

@Composable
private fun LogTab() {
    var secs by remember { mutableIntStateOf(41 * 60 + 16) }
    LaunchedEffect(Unit) { while (true) { delay(1000); secs++ } }
    val sets = remember {
        mutableStateListOf(SetRow("01", 185, 5), SetRow("W", 135, 5), SetRow("W", 90, 8))
    }
    var w by remember { mutableIntStateOf(200) }
    var r by remember { mutableIntStateOf(5) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.clip(RoundedCornerShape(50)).background(C.card2).padding(horizontal = 10.dp, vertical = 5.dp)) {
                T("%d:%02d".format(secs / 60, secs % 60), 12, C.muted, FontWeight.SemiBold)
            }
            Box(Modifier.clip(RoundedCornerShape(50)).background(Color(0xFF3A3A3A)).padding(horizontal = 10.dp, vertical = 5.dp)) {
                T("3:03", 12, C.text, FontWeight.SemiBold)
            }
        }
        T("bb overhead press", 15, weight = FontWeight.SemiBold)
        sets.forEachIndexed { i, s ->
            Row(Modifier.fillMaxWidth().padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                if (s.tag == "pr") {
                    Box(Modifier.clip(RoundedCornerShape(6.dp)).background(C.red).padding(horizontal = 6.dp, vertical = 2.dp)) { T("${s.w}", 12, weight = FontWeight.Bold) }
                    Spacer(Modifier.width(8.dp))
                    T("best ever…?", 12, C.muted, modifier = Modifier.weight(1f))
                } else T(s.tag, 13, C.muted, modifier = Modifier.weight(1f))
                T("${s.w} × ${"%02d".format(s.r)}", 14, weight = FontWeight.SemiBold)
            }
        }
        listOf("db skullcrusher", "wt dips", "db bench press").forEach {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                T(it, 14, C.muted); T("3 sets", 12, C.muted)
            }
        }
        Spacer(Modifier.height(10.dp))
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
                .background(Brush.verticalGradient(listOf(Color(0xFF111111), Color(0xFF3A0A0C)))).padding(16.dp)
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    Stepper("lb", w, 5) { w = (w + it).coerceIn(0, 1500) }
                    Stepper("reps", r, 1) { r = (r + it).coerceIn(1, 100) }
                }
                Spacer(Modifier.height(14.dp))
                Box(
                    Modifier.clip(CircleShape).background(Color(0xFF2A2A2A)).clickable {
                        val pr = w >= 200
                        sets.add(0, SetRow(if (pr) "pr" else "%02d".format(sets.size + 1), w, r))
                    }.padding(horizontal = 36.dp, vertical = 16.dp)
                ) { T("log set  ＋", 15, weight = FontWeight.SemiBold) }
            }
        }
    }
}

@Composable
private fun Stepper(label: String, value: Int, step: Int, change: (Int) -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        T(label, 11, C.muted)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            T("−", 24, C.muted, modifier = Modifier.clickable { change(-step) }.padding(8.dp))
            T("$value", 26, weight = FontWeight.Bold)
            T("＋", 22, C.muted, modifier = Modifier.clickable { change(step) }.padding(8.dp))
        }
    }
}

@Composable
private fun ProgressTab() {
    var seg by remember { mutableIntStateOf(0) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        T("lateral raise", 18, weight = FontWeight.SemiBold)
        T("p4p progression", 13, C.muted)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Stat("peak", "18.0 pts", Modifier.weight(1f), 110)
            Stat("latest", "17.8 pts", Modifier.weight(1f), 110)
        }
        if (seg == 0) {
            Panel(Modifier.fillMaxWidth()) {
                T("45 × 12", 14, weight = FontWeight.SemiBold)
                T("29 sep 2026", 12, C.muted)
                T("p4p: 18.0 pts", 12, C.muted)
            }
            LineChart(
                listOf(14f, 15f, 14.2f, 16f, 14.5f, 16.5f, 15f, 17f, 17.5f, 18f, 17.8f), C.green,
                Modifier.fillMaxWidth().height(160.dp)
            )
        } else {
            Panel(Modifier.fillMaxWidth()) {
                T("how to", 14, weight = FontWeight.SemiBold)
                Spacer(Modifier.height(6.dp))
                T("p4p points adjust the weight you lifted for your bodyweight, so a number going up means you got stronger, not just heavier.", 13, C.muted)
            }
        }
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Segmented(listOf("progress", "how to"), seg, { seg = it })
        }
    }
}

@Composable
private fun MusclesTab() {
    var seg by remember { mutableIntStateOf(0) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        T("strength gains", 18, weight = FontWeight.SemiBold)
        T("p4p vs since you started", 13, C.muted)
        val groups = listOf(
            Triple("shoulders", "19.9", C.green), Triple("back", "13.3", C.green), Triple("core", "12.2", C.green),
        )
        val exercises = listOf(
            Triple("bb bench press", "21.4", C.green), Triple("lateral raise", "9.1", C.green), Triple("wt dips", "7.7", C.green),
        )
        (if (seg == 0) groups else exercises).forEach { (n, p, c) ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(C.card).padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) { T(n, 14); T("stronger by $p%", 12, C.muted) }
                Box(Modifier.size(26.dp).clip(CircleShape).background(c.copy(alpha = 0.35f)))
            }
        }
        T("training split", 15, weight = FontWeight.SemiBold, modifier = Modifier.padding(top = 10.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                T("chest 16%", 12, C.muted); T("arms 28%", 12, C.muted); T("shoulders 11%", 12, C.muted)
            }
            SplitChart(
                listOf(0.5f, 0.7f, 0.65f, 0.6f, 0.35f, 0.9f),
                listOf(C.red, C.red, C.orange, C.orange, Color(0xFF444444), C.purple),
                Modifier.size(150.dp)
            )
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                T("back 21%", 12, C.muted); T("legs 20%", 12, C.muted); T("core 4%", 12, C.muted)
            }
        }
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Segmented(listOf("groups", "exercises"), seg, { seg = it })
        }
    }
}

@Composable
private fun LastWorkoutTab() {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.size(width = 64.dp, height = 64.dp).clip(RoundedCornerShape(14.dp)).background(C.card2), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            T("TUE", 10, C.muted); T("6", 22, weight = FontWeight.Bold)
        }
        T("27,115 lb moved", 20, weight = FontWeight.SemiBold)
        T("in 1:07:55", 14, C.muted)
        T("♥ peak hr 163 bpm", 12, C.muted)
        T("🔥 calories 441", 12, C.muted)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Stat("trucks", "0.68", Modifier.weight(1f), 110)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Stat("reps", "170", Modifier.weight(1f), 50); Stat("sets", "21", Modifier.weight(1f), 50)
                }
                Stat("exercises", "6", Modifier.fillMaxWidth(), 50)
            }
        }
        T("pr's", 15, weight = FontWeight.SemiBold, modifier = Modifier.padding(top = 6.dp))
        listOf("p4p pr" to ("db bench press" to "90 × 10"), "best ever" to ("bb bench press" to "335 × 05")).forEach { (k, v) ->
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(C.card).padding(12.dp)) {
                Box(Modifier.size(width = 3.dp, height = 34.dp).background(if (k == "best ever") C.red else C.orange))
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) { T(k, 13); T(v.first, 12, C.muted) }
                T(v.second, 14, weight = FontWeight.SemiBold)
            }
        }
    }
}

private class Food(val name: String, val kcal: Int, val p: Int, val c: Int, val f: Int)

@Composable
fun EatScreen() {
    val foods = remember { mutableStateListOf(Food("oats + whey", 520, 48, 62, 9), Food("chicken rice bowl", 710, 58, 80, 14)) }
    var draft by remember { mutableStateOf("") }
    val goal = 2400
    val eaten = foods.sumOf { it.kcal }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        T("eat", 22, weight = FontWeight.Bold)
        Panel(Modifier.fillMaxWidth()) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                T("$eaten kcal", 20, weight = FontWeight.Bold); T("goal $goal", 12, C.muted)
            }
            Spacer(Modifier.height(8.dp))
            Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(C.card2)) {
                Box(Modifier.fillMaxWidth((eaten.toFloat() / goal).coerceIn(0f, 1f)).height(6.dp).background(C.red))
            }
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                T("protein ${foods.sumOf { it.p }}g", 12, C.green)
                T("carbs ${foods.sumOf { it.c }}g", 12, C.orange)
                T("fat ${foods.sumOf { it.f }}g", 12, C.purple)
            }
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(C.card).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) {
                if (draft.isEmpty()) T("type a food…", 14, C.muted)
                BasicTextField(draft, { draft = it }, textStyle = TextStyle(color = C.text, fontSize = 14.sp), cursorBrush = SolidColor(C.red), modifier = Modifier.fillMaxWidth())
            }
            if (draft.isNotBlank()) Box(Modifier.clip(RoundedCornerShape(50)).background(C.red).clickable {
                foods.add(Food(draft.trim(), 400, 25, 40, 12)); draft = ""
            }.padding(horizontal = 14.dp, vertical = 6.dp)) { T("add", 13, weight = FontWeight.SemiBold) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf("🎙 talk", "📷 scan label", "▥ barcode").forEach {
                Box(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(C.card2).padding(vertical = 12.dp), contentAlignment = Alignment.Center) { T(it, 12, C.muted) }
            }
        }
        foods.forEach {
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(C.card).padding(14.dp)) {
                Column(Modifier.weight(1f)) { T(it.name, 14); T("p ${it.p} · c ${it.c} · f ${it.f}", 12, C.muted) }
                T("${it.kcal}", 14, weight = FontWeight.SemiBold)
            }
        }
    }
}
