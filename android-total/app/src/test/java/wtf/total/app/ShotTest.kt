package wtf.total.app

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.android.resources.Density
import com.android.ide.common.rendering.api.SessionParams
import org.junit.Rule
import org.junit.Test

class ShotTest {
    private val dev = DeviceConfig(
        screenHeight = 2556, screenWidth = 1179, xdpi = 460, ydpi = 460, density = Density.XXHIGH,
        softButtons = false, nightMode = com.android.resources.NightMode.NOTNIGHT,
    )
    @get:Rule val paparazzi = Paparazzi(deviceConfig = dev, theme = "android:Theme.Material.NoActionBar", renderingMode = SessionParams.RenderingMode.NORMAL, showSystemUi = false)

    private fun shot(name: String, c: @Composable () -> Unit) =
        paparazzi.snapshot(name) { Box(Modifier.fillMaxSize().background(C.bg)) { c() } }

    @Test fun profile() = shot("profile") { ProfileScreen("on a cut guys, don't judge my recent workouts", Triple(545, 365, 675), {}, {}, {}, {}) }
    @Test fun sheet() = shot("sheet") {
        ProfileScreen("on a cut guys, don't judge my recent workouts", Triple(545, 365, 675), {}, {}, {}, {})
        VerifiedSheet("bench", 365) {}
    }
    @Test fun feed() = shot("feed") { FeedScreen() }
    @Test fun ranks() = shot("ranks") { RanksScreen() }
    @Test fun workout() = shot("workout") { WorkoutScreen {} }
    @Test fun progress() = shot("progress") { ProgressScreen {} }
    @Test fun muscles() = shot("muscles") { MusclesScreen {} }
    @Test fun summary() = shot("summary") { SummaryScreen {} }
    @Test fun tiers() = shot("tiers") { TiersScreen(6) {} }
    @Test fun eat() = shot("eat") { EatScreen() }
}
