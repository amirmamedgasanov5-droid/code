package wtf.total.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

class PollOpt(val label: String, val votes: Int, val total: String, val avg: Int, val share: Float, val fill: Color, val accent: Color)
class Post(
    val user: String, val dots: String, val dotColor: Color, val ago: String, val text: String, val av: Int, val likes: String,
    val poll: List<PollOpt>? = null, val replies: String = "no replies", val reply: Post? = null,
)

private val brown = Color(0xFF8E6C55)
val feedSeed = listOf(
    Post("kyle.no.deads", "176 dots", brown, "12m", "deadlifts are bad for your back. change my mind", R.drawable.av_kyle, "1.2K",
        replies = "5 replies",
        reply = Post("manljus", "513 dots", C.purple, "9m", "mine's fine.", R.drawable.av_manljus, "38.9K")),
    Post("dyl.anderson", "231 dots", brown, "41m", "settle this. is sumo cheating?", R.drawable.av_dyl, "8.9K",
        poll = listOf(
            PollOpt("yes", 1284, "297.6k", 232, .749f, Color(0xFF1F1A17), brown),
            PollOpt("no", 214, "99.9k", 467, .251f, Color(0xFF2E1116), C.red2),
        ), replies = "1 reply",
        reply = Post("jmercer", "??\$_&!?", C.green, "30m", "check the avg dots on each option and you have your answer", R.drawable.av_jmercer, "27.3K")),
    Post("kaloyan.p", "526 dots", C.purple, "1h", "675, judges took 9 hours. longest 9 hours of my life", R.drawable.av_manljus, "14.8K"),
    Post("renn.ito", "528 dots", C.purple, "2h", "cut day 40. rice cakes are a personality now", R.drawable.av_kyle, "3.4K"),
)

@Composable
private fun HeartDot(likes: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Txt(likes, 14f, C.g5.copy(alpha = 1f).let { Color(0xFF454545) })
        Spacer(Modifier.width(10.dp))
        Icon(Ic.HEART, 20.dp, Color(0xFF4A4A4A))
    }
}

@Composable
private fun NameRow(p: Post) {
    Row(Modifier.fillMaxWidth().height(22.dp), verticalAlignment = Alignment.CenterVertically) {
        Txt(p.user, 14f, C.white, FontWeight.Medium)
        Spacer(Modifier.width(5.dp))
        Txt(p.dots, 14f, p.dotColor)
        Spacer(Modifier.weight(1f))
        Txt(p.ago, 14f, Color(0xFF454545))
        Spacer(Modifier.width(10.dp))
        Icon(Ic.DOTS, 18.dp, Color(0xFF555555))
    }
}

@Composable
private fun PollView(opts: List<PollOpt>) {
    var sel by remember { mutableIntStateOf(-1) }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        opts.forEachIndexed { i, o ->
            Box(
                Modifier.fillMaxWidth().height(57.dp).clip(RoundedCornerShape(16.dp)).background(Color(0xFF111111)).tap { sel = i }
            ) {
                Box(Modifier.fillMaxWidth(o.share).fillMaxHeight().background(o.fill))
                Row(Modifier.fillMaxSize().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(12.dp).clip(CircleShape).background(if (sel == i) C.white else Color.Transparent)
                        .let { it }) {
                        Canvas(Modifier.fillMaxSize()) { if (sel != i) drawCircle(Color(0xFF777777), size.minDimension / 2 - 1f, style = Stroke(2f)) }
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Txt(o.label, 14f, C.white, FontWeight.Medium)
                        Spacer(Modifier.height(3.dp))
                        Txt("%,d • %s dots".format(o.votes + if (sel == i) 1 else 0, o.total), 13f, C.g2)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Txt("${o.avg} dots", 14f, o.accent, FontWeight.Medium)
                        Spacer(Modifier.height(3.dp))
                        Txt("avg", 13f, C.g3)
                    }
                }
            }
        }
    }
}

@Composable
private fun Thread(p: Post) {
    val childY = (if (p.poll != null) 97 + 146 else 97)
    Column(
        Modifier.fillMaxWidth().drawBehind2(p.reply != null, childY, p.poll != null)
    ) {
        Row(Modifier.fillMaxWidth().padding(start = 22.dp, end = 24.dp)) {
            Box(Modifier.padding(top = 5.dp)) { Photo(p.av, 30.dp) }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                NameRow(p)
                Txt(p.text, 14f, C.white, modifier = Modifier.heightIn(min = 22.dp).padding(top = 2.dp), lh = 18f)
                if (p.poll != null) { Spacer(Modifier.height(16.dp)); PollView(p.poll) }
            }
        }
        Spacer(Modifier.height(if (p.poll != null) 20.dp else 12.dp))
        MetaRow(p, withStack = p.reply != null && p.poll == null)
        p.reply?.let { r ->
            Spacer(Modifier.height(13.dp))
            Row(Modifier.fillMaxWidth().padding(start = 66.dp, end = 24.dp)) {
                Box(Modifier.padding(top = 5.dp)) { Photo(r.av, 30.dp) }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    NameRow(r)
                    Txt(r.text, 14f, Color(0xFFD0D0D0), modifier = Modifier.padding(top = 2.dp), lh = 22f)
                }
            }
            Spacer(Modifier.height(12.dp))
            MetaRow(r, withStack = false, start = 66.dp)
        }
        Spacer(Modifier.height(17.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF161616)))
        Spacer(Modifier.height(17.dp))
    }
}

private fun Modifier.drawBehind2(has: Boolean, childY: Int, poll: Boolean) = if (!has) this else this.drawBehind3(childY, poll)

private fun Modifier.drawBehind3(childY: Int, poll: Boolean) = this.drawBehind {
    val lx = 37.dp.toPx()
    val top = (if (poll) 44 else 66).dp.toPx()
    val cy = (childY + 20).dp.toPx()
    val p = Path().apply {
        moveTo(lx, top); lineTo(lx, cy - 16.dp.toPx())
        quadraticBezierTo(lx, cy, lx + 16.dp.toPx(), cy)
    }
    drawPath(p, Color(0xFF2A2A2A), style = Stroke(1.8.dp.toPx()))
}

@Composable
private fun MetaRow(p: Post, withStack: Boolean, start: androidx.compose.ui.unit.Dp = 22.dp) {
    Row(Modifier.fillMaxWidth().height(28.dp).padding(start = start, end = 24.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(44.dp)) {
            if (withStack) {
                Photo(R.drawable.av_jmercer, 20.dp, Modifier.offset(x = 0.dp), dim = .3f)
                Photo(R.drawable.av_manljus, 16.dp, Modifier.offset(x = 14.dp, y = 8.dp), dim = .4f)
            }
        }
        Txt(p.replies, 14f, Color(0xFF454545))
        Spacer(Modifier.weight(1f))
        HeartDot(p.likes)
    }
}

@Composable
fun FeedScreen() {
    val posts = remember { mutableStateListOf<Post>().apply { addAll(feedSeed) } }
    var draft by remember { mutableStateOf("") }
    var saved by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = topInset(), bottom = 110.dp)) {
            item {
                Spacer(Modifier.height(14.dp))
                Row(Modifier.fillMaxWidth().padding(start = 22.dp, end = 24.dp).height(30.dp), verticalAlignment = Alignment.CenterVertically) {
                    Photo(R.drawable.av_me_s, 30.dp)
                    Spacer(Modifier.width(14.dp))
                    Box(Modifier.weight(1f)) {
                        if (draft.isEmpty()) Txt("new post...", 15f, Color(0xFF3C3C3C))
                        BasicTextField(
                            draft, { draft = it }, singleLine = true,
                            textStyle = TextStyle(color = C.white, fontSize = 15.sp, fontFamily = Inter),
                            cursorBrush = SolidColor(C.red), modifier = Modifier.fillMaxWidth(),
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                            keyboardActions = KeyboardActions(onSend = {
                                if (draft.isNotBlank()) { posts.add(0, Post("theo.ward", "412 dots", C.purple, "now", draft.trim(), R.drawable.av_me_s, "0")); draft = "" }
                            })
                        )
                    }
                    Box(Modifier.tap { saved = !saved }.padding(4.dp)) { Icon(Ic.BOOKMARK, 16.dp, if (saved) C.white else Color(0xFF4A4A4A)) }
                }
                Spacer(Modifier.height(33.dp))
            }
            items(posts.size) { Thread(posts[it]) }
        }
        BottomFade(Modifier.align(Alignment.BottomCenter), 140.dp)
    }
}
