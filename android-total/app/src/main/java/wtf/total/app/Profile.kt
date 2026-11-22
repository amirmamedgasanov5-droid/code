package wtf.total.app

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun ProfileScreen(onTiers: () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Avatar(104, "T", "A")
            Spacer(Modifier.height(14.dp))
            Bubble("on a cut guys, don't judge my recent workouts")
            Spacer(Modifier.height(14.dp))
            T("theo.ward", 18, weight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            T("top 2.3%  ·  🇺🇸 #286", 12, C.muted)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Stat("s", "545 lb", Modifier.weight(1f))
            Stat("b", "365 lb", Modifier.weight(1f))
            Stat("d", "675 lb", Modifier.weight(1f))
        }
        Panel(Modifier.fillMaxWidth()) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                T("176.4 lb", 15, weight = FontWeight.SemiBold); T("5d", 12, C.muted)
            }
            T("-1.5 lb", 12, C.muted)
            LineChart(
                listOf(178f, 177.8f, 178.1f, 177.4f, 177.6f, 177f, 176.9f, 176.6f, 176.4f),
                C.muted, Modifier.fillMaxWidth().height(80.dp).padding(top = 8.dp), 3f
            )
        }
        Panel(Modifier.fillMaxWidth()) {
            T("consistency", 13, C.muted)
            Spacer(Modifier.height(10.dp))
            val on = setOf(0, 2, 3, 5, 7, 9, 10, 12, 14, 16, 17, 19, 21, 23, 24, 26, 28, 30, 31, 33)
            for (r in 0 until 5) Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                for (c in 0 until 7) Box(
                    Modifier.size(width = 22.dp, height = 8.dp).clip(RoundedCornerShape(4.dp))
                        .background(if ((r * 7 + c) in on) C.red else Color(0xFF2A2A2A))
                )
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                T("weekly goal 4/5", 12, C.muted); T("streak 6 weeks", 12, C.muted)
            }
        }
        // Verified lift card
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
                .background(Brush.linearGradient(listOf(Color(0xFFB3141A), Color(0xFFE3262B), Color(0xFF7A0D12))))
                .padding(18.dp).height(120.dp)
        ) {
            Box(Modifier.clip(RoundedCornerShape(6.dp)).background(Color(0x55000000)).padding(horizontal = 8.dp, vertical = 3.dp)) {
                T("BENCH FREAK", 10, weight = FontWeight.Bold)
            }
            Column(Modifier.align(Alignment.BottomStart)) {
                T("365 lb", 26, weight = FontWeight.Bold)
                T("you bench what others squat.", 12, Color(0xFFFFD0D0))
            }
        }
        Panel(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    T("bench verified", 14, weight = FontWeight.SemiBold)
                    T("theo.ward", 12, C.muted)
                }
                Box(Modifier.size(32.dp).clip(CircleShape).background(C.orange))
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Stat("top", "2.3%", Modifier.weight(1f), 74)
            Stat("🇺🇸 us", "#286", Modifier.weight(1f), 74)
            Stat("bw", "176.4 lb", Modifier.weight(1f), 74)
        }
        Panel(Modifier.fillMaxWidth()) {
            T("3 / 3", 13, weight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            Box(Modifier.fillMaxWidth().height(4.dp).background(C.orange))
            Spacer(Modifier.height(8.dp))
            T("fully ranked. your total rank is live.", 12, C.muted)
        }
        Panel(Modifier.fillMaxWidth(), onClick = onTiers) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                T("seven tiers", 14, weight = FontWeight.SemiBold); T("see all  ›", 13, C.muted)
            }
            T("you are freak. 2 tiers to go.", 12, C.muted)
        }
        Spacer(Modifier.height(8.dp))
    }
}
