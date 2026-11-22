package wtf.total.app

import android.graphics.Color as AColor
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(AColor.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(AColor.TRANSPARENT),
        )
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(background = C.bg, surface = C.bg, primary = C.red)) { App() }
        }
    }
}

enum class Route { HOME, TIERS, PROGRESS, MUSCLES, SUMMARY }

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun App() {
    var route by remember { mutableStateOf(Route.HOME) }
    var sheet by remember { mutableIntStateOf(-1) }
    val pager = rememberPagerState(initialPage = 1) { 5 }
    BackHandler(enabled = sheet >= 0 || route != Route.HOME) { if (sheet >= 0) sheet = -1 else route = Route.HOME }
    val lifts = Triple(545, 365, 675)
    Box(Modifier.fillMaxSize().background(C.bg)) {
        when (route) {
            Route.HOME -> {
                HorizontalPager(pager, Modifier.fillMaxSize()) { page ->
                    when (page) {
                        0 -> FeedScreen()
                        1 -> ProfileScreen(
                            "on a cut guys, don't judge my recent workouts", lifts,
                            onBadge = { route = Route.TIERS }, onStat = { sheet = it },
                            onWeight = { route = Route.MUSCLES }, onCons = { route = Route.SUMMARY },
                        )
                        2 -> RanksScreen()
                        3 -> WorkoutScreen(onExercise = { route = Route.PROGRESS })
                        else -> EatScreen()
                    }
                }
                Row(
                    Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    repeat(5) { Box(Modifier.size(5.dp).clip(CircleShape).background(if (it == pager.currentPage) Color(0xFF6A6A6A) else Color(0xFF262626))) }
                }
            }
            Route.TIERS -> TiersScreen { route = Route.HOME }
            Route.PROGRESS -> ProgressScreen { route = Route.HOME }
            Route.MUSCLES -> MusclesScreen { route = Route.HOME }
            Route.SUMMARY -> SummaryScreen { route = Route.HOME }
        }
        if (sheet >= 0 && route == Route.HOME) {
            val (n, w) = listOf("squat" to lifts.first, "bench" to lifts.second, "deadlift" to lifts.third)[sheet]
            VerifiedSheet(n, w) { sheet = -1 }
        }
    }
}
