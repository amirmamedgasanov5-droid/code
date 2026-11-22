package wtf.total.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.random.Random

class PollOpt(val label: String, val votes: Int, val avg: Int, val color: Color)
class Post(
    val user: String, val dots: Int, val ago: String, val text: String,
    val replies: List<Pair<String, String>> = emptyList(), val likes: String = "0",
    val poll: List<PollOpt>? = null,
)

private val seedPosts = listOf(
    Post("kyle.no.deads", 176, "12m", "deadlifts are bad for your back. change my mind",
        listOf("manljus · 513 dots" to "mine's fine."), "1.2K"),
    Post("dyl.anderson", 231, "41m", "settle this. is sumo cheating?",
        listOf("jmercer · ??\$_&!?" to "check the avg dots on each option and you have your answer"), "8.9K",
        listOf(PollOpt("yes", 1284, 232, C.orange), PollOpt("no", 214, 467, C.red))),
    Post("kaloyan.p", 526, "1h", "675, judges took 9 hours. longest 9 hours of my life", emptyList(), "27.3K"),
    Post("renn.ito", 528, "2h", "cut day 40. rice cakes are a personality now", emptyList(), "3.4K"),
)

@Composable
fun FeedScreen() {
    val posts = remember { mutableStateListOf<Post>().apply { addAll(seedPosts) } }
    var draft by remember { mutableStateOf("") }
    val voted = remember { mutableStateMapOf<Int, Int>() }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(C.card).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(30, "T")
                Spacer(Modifier.width(10.dp))
                Box(Modifier.weight(1f)) {
                    if (draft.isEmpty()) T("new post…", 14, C.muted)
                    BasicTextField(draft, { draft = it }, textStyle = TextStyle(color = C.text, fontSize = 14.sp), cursorBrush = SolidColor(C.red), modifier = Modifier.fillMaxWidth())
                }
                if (draft.isNotBlank()) Box(Modifier.clip(RoundedCornerShape(50)).background(C.red).clickable {
                    posts.add(0, Post("theo.ward", 412, "now", draft.trim(), emptyList(), "0")); draft = ""
                }.padding(horizontal = 14.dp, vertical = 6.dp)) { T("post", 13, weight = FontWeight.SemiBold) }
            }
        }
        items(posts.size) { i ->
            val p = posts[i]
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(34, p.user.first().uppercase())
                    Spacer(Modifier.width(10.dp))
                    T(p.user, 13, weight = FontWeight.SemiBold)
                    Spacer(Modifier.width(6.dp))
                    T("${p.dots} dots", 12, C.dots)
                    Spacer(Modifier.weight(1f))
                    T(p.ago, 12, C.muted)
                }
                T(p.text, 15)
                p.poll?.let { opts ->
                    val total = opts.sumOf { it.votes }
                    val mine = voted[i]
                    opts.forEachIndexed { oi, o ->
                        Box(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(C.card2)
                                .clickable { voted[i] = oi }
                        ) {
                            if (mine != null) Box(
                                Modifier.fillMaxWidth((o.votes + if (mine == oi) 1 else 0).toFloat() / (total + 1)).height(46.dp)
                                    .background(o.color.copy(alpha = 0.25f))
                            )
                            Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                T(o.label, 14, modifier = Modifier.weight(1f))
                                if (mine != null) T("${o.votes + if (mine == oi) 1 else 0} · avg ${o.avg} dots", 12, o.color)
                            }
                        }
                    }
                }
                p.replies.forEach { (u, t) ->
                    Row(Modifier.padding(start = 20.dp), verticalAlignment = Alignment.Top) {
                        Avatar(24, u.first().uppercase()); Spacer(Modifier.width(8.dp))
                        Column { T(u, 12, C.green); T(t, 13, Color(0xFFDDDDDD)) }
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    T(if (p.replies.isEmpty()) "no replies" else "${p.replies.size} replies", 12, C.muted)
                    T("♥ ${p.likes}", 12, C.muted)
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF1C1C1C)))
            }
        }
    }
}

private class Rank(val name: String, val dots: Int, val flag: String)

private val world = listOf(
    Rank("jmercer", 612, "🇺🇸"), Rank("renn.ito", 528, "🇯🇵"), Rank("kaloyan.p", 526, "🇧🇬"),
    Rank("saeed_kh", 525, "🇮🇷"), Rank("azer", 523, "🇦🇿"), Rank("manljus", 513, "🇱🇹"),
    Rank("dyl.anderson", 231, "🇺🇸"), Rank("kyle.no.deads", 176, "🇨🇦"),
)

@Composable
fun RanksScreen() {
    var seg by remember { mutableIntStateOf(0) }
    val list = when (seg) {
        0 -> world
        1 -> world.filter { it.flag == "🇺🇸" || it.flag == "🇨🇦" }
        else -> world.take(3)
    }
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Segmented(listOf("world", "country", "friends"), seg, { seg = it })
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(C.card).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Avatar(34, "T"); Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) { T("you", 13, weight = FontWeight.SemiBold); T("theo.ward", 12, C.muted) }
            T(if (seg == 0) "#1,174" else if (seg == 1) "#286" else "#2", 15, weight = FontWeight.Bold)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Stat("place", "top 2.3%", Modifier.weight(1f), 90)
            Stat("total", "491 dots", Modifier.weight(1f), 90)
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(14.dp), contentPadding = PaddingValues(top = 6.dp)) {
            items(list.size) { i ->
                val r = list[i]
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(38, r.name.first().uppercase()); Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        T("${r.flag} ${r.name}", 14, weight = FontWeight.SemiBold)
                        T("${r.dots} dots", 12, C.muted)
                    }
                    T("#${i + 1}", 15, C.text, FontWeight.Bold)
                }
            }
        }
    }
}

private class Tier(val name: String, val pts: String)

private val tiers = listOf(
    Tier("casual", "0+"), Tier("lifter", "100+"), Tier("threat", "200+"), Tier("problem", "300+"),
    Tier("freak", "400+"), Tier("alien", "500+"), Tier("??\$_&!?", "530+"),
)

@Composable
fun TiersScreen(onBack: () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        T("←", 22, C.muted, modifier = Modifier.clickable(onClick = onBack).padding(4.dp))
        T("seven tiers", 22, weight = FontWeight.Bold)
        T("every verified lift turns into one score.", 13, C.muted)
        tiers.forEachIndexed { i, t ->
            val me = t.name == "freak"
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(if (me) Color(0xFF2A0F10) else C.card).padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                T("${i + 1}", 13, C.muted, modifier = Modifier.width(24.dp))
                T(t.name, 16, if (i == 6) C.green else C.text, FontWeight.SemiBold, Modifier.weight(1f))
                if (me) T("you · ", 12, C.red)
                T("${t.pts} pts", 12, C.muted)
            }
        }
        Spacer(Modifier.height(6.dp))
        // matrix rain card
        val rnd = remember { Random(7) }
        val glyphs = remember { "&\$!.?_@#%".toList() }
        val rain = remember { List(14) { String(CharArray(30) { glyphs[rnd.nextInt(glyphs.size)] }.map { c -> if (rnd.nextInt(3) == 0) ' ' else c }.toCharArray()) } }
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Color(0xFF0E0E0E))) {
            Column(Modifier.padding(16.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    T("530+ PTS", 11, C.muted, FontWeight.Bold); T("YOU WON'T", 11, C.muted, FontWeight.Bold)
                }
                Spacer(Modifier.height(8.dp))
                rain.forEachIndexed { i, line ->
                    Text2(line, 11, C.green.copy(alpha = 0.15f + 0.05f * (i % 6)))
                }
                Spacer(Modifier.height(10.dp))
                T("??\$_&!?", 13, C.green, FontWeight.SemiBold)
                Spacer(Modifier.height(4.dp))
                T(
                    "we triple-checked your videos thinking something was wrong. nothing was, except you. this tier is a string of symbols because no human was supposed to reach it. you are so far past the line that it no longer matters.",
                    13, Color(0xFFCCCCCC)
                )
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun Text2(s: String, size: Int, color: Color) =
    androidx.compose.material3.Text(s, color = color, fontSize = size.sp, fontFamily = FontFamily.Monospace)
