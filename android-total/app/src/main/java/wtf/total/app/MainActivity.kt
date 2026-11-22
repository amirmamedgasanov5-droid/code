package wtf.total.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

enum class Tab(val label: String) { YOU("you"), FEED("feed"), RANKS("ranks"), TRAIN("train"), EAT("eat") }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(background = C.bg, surface = C.bg, primary = C.red)) {
                App()
            }
        }
    }
}

@Composable
fun App() {
    var tab by remember { mutableStateOf(Tab.YOU) }
    var tiers by remember { mutableStateOf(false) }
    BackHandler(enabled = tiers) { tiers = false }
    Column(Modifier.fillMaxSize().background(C.bg).statusBarsPadding()) {
        Box(Modifier.weight(1f)) {
            if (tiers) TiersScreen { tiers = false } else when (tab) {
                Tab.YOU -> ProfileScreen { tiers = true }
                Tab.FEED -> FeedScreen()
                Tab.RANKS -> RanksScreen()
                Tab.TRAIN -> TrainScreen()
                Tab.EAT -> EatScreen()
            }
        }
        if (!tiers) Row(
            Modifier.fillMaxWidth().background(Color0).navigationBarsPadding().padding(vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceAround
        ) {
            Tab.values().forEach { t ->
                Column(
                    Modifier.clickable { tab = t }.padding(horizontal = 12.dp, vertical = 4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        Modifier.size(width = 18.dp, height = 3.dp)
                            .background(if (t == tab) C.red else androidx.compose.ui.graphics.Color.Transparent)
                    )
                    Spacer(Modifier.height(6.dp))
                    T(t.label, 14, if (t == tab) C.text else C.muted, if (t == tab) FontWeight.SemiBold else FontWeight.Normal)
                }
            }
        }
    }
}

private val Color0 = androidx.compose.ui.graphics.Color(0xFF0B0B0B)
