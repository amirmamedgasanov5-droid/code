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

    @Test fun premiumModels() {
        val id = Identity.fromSeed(ByteArray(32) { (it + 7).toByte() })
        rule.setContent {
            Row(Modifier.fillMaxSize()) { for (m in 10..12) Box(Modifier.weight(1f).fillMaxHeight()) { Gift3D(GiftLogic.mint(id, "T", m, m), animate = false) } }
        }
        rule.onRoot().captureRoboImage("/tmp/shots/gifts_premium.png")
    }

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
