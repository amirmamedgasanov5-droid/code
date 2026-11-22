package wtf.total.app

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private class Food(val name: String, val kcal: Int, val p: Int, val c: Int, val f: Int)

@Composable
fun EatScreen() {
    val foods = remember { mutableStateListOf(Food("oats + whey", 520, 48, 62, 9), Food("chicken rice bowl", 710, 58, 80, 14)) }
    var draft by remember { mutableStateOf("") }
    val goal = 2400
    val eaten = foods.sumOf { it.kcal }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = topInset(), bottom = 110.dp)) {
        item {
            Spacer(Modifier.height(14.dp))
            Txt("eat", 17f, C.white, FontWeight.Medium, Modifier.padding(start = 31.dp).height(30.dp))
            Spacer(Modifier.height(24.dp))
            Box(Modifier.padding(horizontal = 16.dp).fillMaxWidth().height(180.dp).card()) {
                Txt("calories", 17f, Color(0xFF3A3A3A), modifier = Modifier.padding(start = 14.dp, top = 12.dp))
                Txt("goal $goal", 14f, Color(0xFF3A3A3A), modifier = Modifier.align(Alignment.TopEnd).padding(end = 14.dp, top = 14.dp))
                Column(Modifier.align(Alignment.BottomStart).padding(14.dp)) {
                    Txt("$eaten kcal", 18f, C.white, FontWeight.Medium)
                    Spacer(Modifier.height(10.dp))
                    Box(Modifier.fillMaxWidth().height(4.dp).clip(CircleShape).background(Color(0xFF1F1F1F))) {
                        Box(Modifier.fillMaxWidth((eaten.toFloat() / goal).coerceIn(0f, 1f)).fillMaxHeight().background(C.yellow))
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Txt("protein ${foods.sumOf { it.p }}g", 14f, C.green)
                        Txt("carbs ${foods.sumOf { it.c }}g", 14f, C.yellow)
                        Txt("fat ${foods.sumOf { it.f }}g", 14f, C.purple)
                    }
                }
            }
            Spacer(Modifier.height(3.dp))
            Row(
                Modifier.padding(horizontal = 16.dp).fillMaxWidth().height(60.dp).card().padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(Modifier.weight(1f)) {
                    if (draft.isEmpty()) Txt("type, talk or scan a food", 15f, Color(0xFF3C3C3C))
                    BasicTextField(
                        draft, { draft = it }, singleLine = true,
                        textStyle = TextStyle(color = C.white, fontSize = 15.sp, fontFamily = Inter),
                        cursorBrush = SolidColor(C.red), modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = {
                            if (draft.isNotBlank()) { foods.add(0, Food(draft.trim(), 400, 25, 40, 12)); draft = "" }
                        })
                    )
                }
                if (draft.isNotBlank()) Txt("add", 15f, C.red2, FontWeight.Medium, Modifier.tap {
                    foods.add(0, Food(draft.trim(), 400, 25, 40, 12)); draft = ""
                })
            }
            Spacer(Modifier.height(3.dp))
        }
        items(foods.size) { i ->
            val f = foods[i]
            Row(
                Modifier.padding(horizontal = 16.dp).padding(bottom = 3.dp).fillMaxWidth().height(66.dp).card().padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Txt(f.name, 14f, C.white, FontWeight.Medium)
                    Spacer(Modifier.height(4.dp))
                    Txt("p ${f.p} · c ${f.c} · f ${f.f}", 14f, Color(0xFF5A5A5A))
                }
                Txt("${f.kcal}", 18f, C.white, FontWeight.Medium)
            }
        }
    }
}
