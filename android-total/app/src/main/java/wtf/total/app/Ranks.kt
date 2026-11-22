package wtf.total.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

private class Rk(val name: String, val dots: Int, val img: Int, val country: String, val bubble: String? = null)

private val board = listOf(
    Rk("jmercer", 612, R.drawable.r_jmercer, "us", "it's quiet up here."),
    Rk("renn.ito", 528, R.drawable.r_renn, "jp"),
    Rk("kaloyan.p", 526, R.drawable.r_kaloyan, "bg", "2 dots, renn."),
    Rk("saeed_kh", 525, R.drawable.r_saeed, "ae"),
    Rk("azer", 523, R.drawable.r_azer, "az"),
)

@Composable
fun RanksScreen() {
    var tab by remember { mutableIntStateOf(0) }
    val list = when (tab) { 0 -> board; 1 -> board.filter { it.country == "us" }; else -> board.take(3) }
    val place = listOf("#1,174", "#286", "#2")[tab]
    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = topInset(), bottom = 110.dp)) {
            item {
                Spacer(Modifier.height(14.dp))
                Row(Modifier.fillMaxWidth().height(30.dp).padding(start = 31.dp, end = 30.dp), verticalAlignment = Alignment.CenterVertically) {
                    listOf("world", "country", "friends").forEachIndexed { i, t ->
                        Txt(t, 18f, if (i == tab) C.white else Color(0xFF454545), FontWeight.Medium, Modifier.tap { tab = i })
                        Spacer(Modifier.width(16.dp))
                    }
                    Spacer(Modifier.weight(1f))
                    Icon(Ic.SEARCH, 18.dp, Color(0xFF5A5A5A))
                    Spacer(Modifier.width(30.dp))
                    Icon(Ic.FILTER, 18.dp, Color(0xFF5A5A5A))
                }
                Spacer(Modifier.height(24.dp))
                Row(
                    Modifier.padding(horizontal = 16.dp).fillMaxWidth().height(66.dp).card().padding(horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    RankAvatar(R.drawable.r_you)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Txt("you", 14f, C.white, FontWeight.Medium)
                        Spacer(Modifier.height(4.dp))
                        Txt("theo.ward", 14f, C.g3)
                    }
                    Txt(place, 20f, C.white, FontWeight.Medium, Modifier.align(Alignment.Top).padding(top = 10.dp))
                }
                Spacer(Modifier.height(3.dp))
                Row(Modifier.padding(horizontal = 16.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    listOf("place" to "top 2.3%", "total" to "491 dots").forEach { (l, v) ->
                        Box(Modifier.weight(1f).height(178.dp).card()) {
                            Txt(l, 17f, Color(0xFF3A3A3A), modifier = Modifier.padding(start = 14.dp, top = 12.dp))
                            Txt(v, 18f, C.white, FontWeight.Medium, Modifier.align(Alignment.BottomEnd).padding(end = 14.dp, bottom = 11.dp))
                        }
                    }
                }
                Spacer(Modifier.height(23.dp))
            }
            items(list.size) { i ->
                val r = list[i]
                Row(Modifier.fillMaxWidth().height(54.dp).padding(start = 30.dp, end = 30.dp), verticalAlignment = Alignment.CenterVertically) {
                    RankAvatar(r.img)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Txt(r.name, 14f, C.white, FontWeight.Medium)
                        Spacer(Modifier.height(4.dp))
                        Txt("${r.dots} dots", 14f, Color(0xFF5A5A5A))
                    }
                    Txt("#${i + 1}", 22f, C.white, FontWeight.Medium)
                }
                if (r.bubble != null && tab == 0) {
                    Box(Modifier.padding(start = 30.dp)) {
                        Canvas(Modifier.size(30.dp, 20.dp).offset(x = 44.dp, y = (-2).dp)) {
                            drawCircle(Color(0xFF373737), 3.2.dp.toPx(), Offset(2.dp.toPx(), 4.dp.toPx()))
                            drawCircle(Color(0xFF373737), 5.dp.toPx(), Offset(13.dp.toPx(), 14.dp.toPx()))
                        }
                        Box(Modifier.padding(start = 57.dp, top = 10.dp).card(16.dp, Color(0xFF373737)).padding(horizontal = 18.dp, vertical = 11.dp)) {
                            Txt(r.bubble, 15f, Color(0xFFD0D0D0))
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                }
            }
        }
        BottomFade(Modifier.align(Alignment.BottomCenter), 140.dp)
    }
}

@Composable
private fun RankAvatar(res: Int) =
    androidx.compose.foundation.Image(androidx.compose.ui.res.painterResource(res), null, Modifier.size(39.dp))
