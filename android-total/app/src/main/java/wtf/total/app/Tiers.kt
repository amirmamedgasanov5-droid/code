package wtf.total.app

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PageSize
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.random.Random

private class TierInfo(val name: String, val pts: String, val c1: Color, val c2: Color, val text: String)

private val tiers = listOf(
    TierInfo("casual", "0+", Color(0xFF3A3A3A), Color(0xFF1A1A1A), "you showed up. that already beats most people. the bar is still on the rack."),
    TierInfo("lifter", "150+", Color(0xFF2E6BFF), Color(0xFF0A1B52), "plates are moving and people notice. you now have a real number to defend."),
    TierInfo("threat", "250+", Color(0xFF12B886), Color(0xFF04281F), "gym regulars start asking about your total. spotters stop being optional."),
    TierInfo("problem", "350+", Color(0xFFFF9500), Color(0xFF3A1F00), "your warm-up is somebody else's pr. meets stop being a hobby."),
    TierInfo("freak", "430+", Color(0xFFE10006), Color(0xFF3A0004), "the judges stop checking twice. you bench what others squat."),
    TierInfo("alien", "500+", Color(0xFF9B00FF), Color(0xFF3A0070), "scoreboards get redrawn around you. the leaderboard has a gap and then you."),
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TiersScreen(startPage: Int = 4, onBack: () -> Unit) {
    val state = rememberPagerState(initialPage = startPage) { 7 }
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().padding(top = topInset())) {
            Spacer(Modifier.height(8.dp))
            Box(Modifier.padding(start = 28.dp).size(30.dp).tap(onBack), contentAlignment = Alignment.CenterStart) { Icon(Ic.BACK, 17.dp, Color(0xFF333333)) }
            Spacer(Modifier.height(101.dp))
            HorizontalPager(
                state, Modifier.fillMaxWidth(), contentPadding = PaddingValues(horizontal = 29.dp),
                pageSize = PageSize.Fixed(334.dp), pageSpacing = 15.dp
            ) { page ->
                if (page == 6) MatrixCard() else TierCard(tiers[page], page == 4)
            }
        }
        Box(
            Modifier.align(Alignment.BottomCenter).padding(bottom = 19.dp).size(47.dp).clip(CircleShape)
                .background(Color(0xFF2A2A2A)).tap(onBack), contentAlignment = Alignment.Center
        ) { Icon(Ic.UNDO, 18.dp, C.white) }
    }
}

@Composable
private fun TierCard(t: TierInfo, me: Boolean) {
    Box(
        Modifier.fillMaxWidth().height(487.dp).clip(RoundedCornerShape(32.dp))
            .background(Brush.verticalGradient(listOf(t.c1, t.c2)))
    ) {
        Row(Modifier.fillMaxWidth().padding(start = 21.dp, end = 21.dp, top = 22.dp)) {
            Wide("${t.pts.uppercase()} PTS", 12f, C.white)
            Spacer(Modifier.weight(1f))
            if (me) Wide("YOU ARE HERE", 12f, Color(0xB3FFFFFF))
        }
        Column(Modifier.align(Alignment.BottomStart).padding(start = 21.dp, end = 21.dp, bottom = 30.dp)) {
            Txt(t.name, 34f, C.white, FontWeight.SemiBold)
            Spacer(Modifier.height(10.dp))
            Txt(t.text, 17f, Color(0xDDFFFFFF), lh = 23f)
        }
    }
}

@Composable
private fun MatrixCard() {
    val glyphs = remember { "&\$!.?_".toList() }
    val rows = remember {
        val rnd = Random(11)
        List(27) { r -> List(17) { if (rnd.nextInt(100) < (6 + r * 2)) ' ' else glyphs[rnd.nextInt(glyphs.size)] } }
    }
    Box(Modifier.fillMaxWidth().height(487.dp).clip(RoundedCornerShape(32.dp)).background(Color(0xFF1B1B1B))) {
        Row(Modifier.fillMaxWidth().padding(start = 21.dp, end = 21.dp, top = 22.dp)) {
            Wide("530+ PTS", 12f, C.white); Spacer(Modifier.weight(1f)); Wide("YOU WON'T", 12f, Color(0xFF555555))
        }
        Box(Modifier.padding(top = 53.dp).fillMaxWidth().height(400.dp).clip(RoundedCornerShape(topStart = 14.dp, topEnd = 14.dp)).background(Color(0xFF1E1E1E))) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 6.dp)) {
                rows.forEachIndexed { r, line ->
                    Row(Modifier.fillMaxWidth().height(14.5.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        line.forEach { ch ->
                            val al = if (r < 9) 1f - r * 0.03f else (0.75f - (r - 9) * 0.05f).coerceAtLeast(0.06f)
                            androidx.compose.material3.Text(
                                ch.toString(), color = Color(0xFFA0A0A0).copy(alpha = al), fontSize = 11.sp, fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace, modifier = Modifier.width(18.dp),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    }
                }
            }
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xFF1B1B1B)), startY = 100f, endY = 1100f)))
        }
        Column(Modifier.align(Alignment.BottomStart).padding(start = 21.dp, end = 21.dp, bottom = 18.dp)) {
            Txt("??\$_&!?", 16f, Color(0xFF777777))
            Spacer(Modifier.height(14.dp))
            Txt(
                "we triple-checked your videos thinking something was wrong. nothing was, except you. this tier is a string of symbols because no human was supposed to reach it. you are so far past the line that it no longer matters.",
                17f, Color(0xFFE6E6E6), lh = 24.5f
            )
        }
    }
}
