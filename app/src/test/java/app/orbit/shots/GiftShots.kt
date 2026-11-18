package app.orbit.shots

import androidx.compose.foundation.layout.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import app.orbit.core.crypto.Identity
import app.orbit.gifts.Gift3D
import app.orbit.gifts.GiftLogic
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w420dp-h900dp-xhdpi")
class GiftShots {
    @get:Rule val rule = createComposeRule()

    private fun row(path: String, models: List<Int>) {
        val id = Identity.fromSeed(ByteArray(32) { (it + 7).toByte() })
        rule.setContent { Column(Modifier.fillMaxSize()) { for ((idx, m) in models.withIndex()) Box(Modifier.weight(1f).fillMaxWidth()) { Gift3D(GiftLogic.mint(Identity.fromSeed(ByteArray(32) { (it + 7 + idx * 37).toByte() }), "T", m, m + idx), animate = false, modelScale = 0.82f) } } }
        rule.onRoot().captureRoboImage(path)
    }
    @Test fun diamondVariants() = row("/tmp/shots/variants_diamond.png", listOf(13, 14, 15))
    @Test fun plush() = row("/tmp/shots/variants_plush.png", listOf(19, 19, 19))
    @Test fun notebooksOpen() {
        val id = Identity.fromSeed(ByteArray(32) { (it + 11).toByte() })
        rule.setContent { Column(Modifier.fillMaxSize()) { for (k in 20..24) Box(Modifier.weight(1f).fillMaxWidth()) { Gift3D(GiftLogic.mint(id, "Anna", k, k - 19, if (k == 22) "Happy birthday, Dasha! Keep this diary safe." else ""), animate = false, modelScale = 0.92f, nbOpen = 1f, nbInk = 0.62f) } } }
        rule.onRoot().captureRoboImage("/tmp/shots/notebooks_open.png")
    }
    @Test fun notebookStages() {
        val id = Identity.fromSeed(ByteArray(32) { (it + 11).toByte() })
        val g = GiftLogic.mint(id, "Anna", 20, 7)
        rule.setContent { Column(Modifier.fillMaxSize()) { for (o in listOf(0f, 0.35f, 0.7f, 1f)) Box(Modifier.weight(1f).fillMaxWidth()) { Gift3D(g, animate = false, modelScale = 0.92f, nbOpen = o, nbInk = if (o >= 1f) 0.45f else 0f) } } }
        rule.onRoot().captureRoboImage("/tmp/shots/notebook_stages.png")
    }
    @Test fun luxuryVariants() = row("/tmp/shots/variants_luxury.png", listOf(16, 17, 18))

    @Test fun allModels() {
        val id = Identity.fromSeed(ByteArray(32) { it.toByte() })
        rule.setContent {
            Column(Modifier.fillMaxSize()) {
                for (r in 0 until 4) Row(Modifier.weight(1f)) {
                    for (c in 0 until 3) { val m = (r * 3 + c) % 10
                        Box(Modifier.weight(1f).fillMaxHeight()) { Gift3D(GiftLogic.mint(id, "T", m, r * 3 + c + 1), animate = false) } }
                }
            }
        }
        rule.onRoot().captureRoboImage("/tmp/shots/gifts_all.png")
    }
}
