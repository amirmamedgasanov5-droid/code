package app.orbit.shots

import android.app.Application
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.background
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.core.app.ApplicationProvider
import app.orbit.core.*
import app.orbit.core.crypto.*
import app.orbit.core.mesh.Envelope
import app.orbit.data.*
import app.orbit.engine.*
import app.orbit.gifts.GiftLogic
import app.orbit.gifts.LocalAnimateGifts
import app.orbit.live.LiveManager
import app.orbit.ui.*
import app.orbit.ui.screens.*
import app.orbit.ui.theme.OrbitTheme
import com.github.takahirom.roborazzi.captureRoboImage
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w412dp-h880dp-xxhdpi")
class ScreenShots {
    @get:Rule val rule = createComposeRule()
    lateinit var engine: Engine
    val me = Identity.fromSeed(ByteArray(32) { (it + 1).toByte() })
    val alice = Identity.fromSeed(ByteArray(32) { (it + 50).toByte() })
    val bob = Identity.fromSeed(ByteArray(32) { (it + 90).toByte() })

    private fun deliver(from: Identity, j: JSONObject, blob: ByteArray? = null) = runBlocking {
        val env = Envelope.direct(from, Peer(me.signPub, me.boxPub), Pay.enc(j, blob))
        engine.onEnvelope(Envelope.decode(env.encode())!!, null)
    }
    private fun msg(text: String, ts: Long, from: JSONObject, id: String = Rand.bytes(16).hex(), k: Int = 0) = JSONObject().put("t", "m").put("i", id).put("k", k).put("x", text).put("ts", ts).put("from", from)
    private fun card(n: String, e: String, c: Int) = JSONObject().put("n", n).put("e", e).put("c", c).put("u", n.lowercase())

    @Before fun setup() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        engine = Engine(app)
        engine.attachIdentityForTest(me, Profile("Amir", "Building serverless things", "🚀", 2, "amir"))
        runBlocking { engine.openLink("orbit://u/" + Base32.encode(alice.address) + "?n=Alice"); engine.openLink("orbit://u/" + Base32.encode(bob.address) + "?n=Bob") }
        val t = System.currentTimeMillis()
        val ac = card("Alice", "🦊", 1); val bc = card("Bob", "🐼", 3)
        val rid = Rand.bytes(16).hex()
        deliver(alice, msg("Hey! Did the message really come through Bluetooth? 📡", t - 3600_000 * 5, ac))
        deliver(alice, msg("I was on the train with zero signal and it **still** arrived.", t - 3600_000 * 5 + 20_000, ac))
        val m1 = msg("Yes — it hopped through two strangers' phones to reach you ✨", t - 3600_000 * 4, ac).put("r", "")
        deliver(bob, msg("Check out the new `gift shop`, you can mint animated collectibles", t - 60_000 * 50, bc))
        engine.send(alice.id, MsgKind.TEXT, "That is wild. The relays can't read anything, right?")
        // a gift from Bob
        val g0 = GiftLogic.mint(bob, "Bob", 3, 7, "For the bug you found!")
        val g = GiftLogic.transfer(bob, g0, me.id, "For the bug you found!")
        deliver(bob, JSONObject().put("t", "gift").put("i", Rand.bytes(16).hex()).put("k", MsgKind.GIFT).put("x", "For the bug you found!").put("ts", t - 120_000).put("gift", g.toJson()).put("from", bc))
        val g2 = GiftLogic.transfer(alice, GiftLogic.mint(alice, "Alice", 8, 12), me.id, "")
        deliver(alice, JSONObject().put("t", "gift").put("i", Rand.bytes(16).hex()).put("k", MsgKind.GIFT).put("x", "").put("ts", t - 60_000).put("gift", g2.toJson()).put("from", ac))
        deliver(alice, msg("No — sealed boxes. Relays only see a routing tag. 🔐", t - 30_000, ac))
        Thread.sleep(300)
    }

    private fun shoot(path: String, content: @Composable () -> Unit) {
        val app = ApplicationProvider.getApplicationContext<Application>()
        val prefs = UiPrefs({ null }, { _, _ -> })
        rule.setContent {
            OrbitTheme(prefs.themeMode, prefs.accent) {
                val nav = remember { Navigator() }
                CompositionLocalProvider(LocalAnimateGifts provides false, LocalEngine provides engine, LocalTransports provides TransportManager(app, engine), LocalLive provides LiveManager(app, engine), LocalNav provides nav, LocalPrefs provides prefs) {
                    Box(Modifier.fillMaxSize().background(OrbitTheme.p.bg)) { content() }
                }
            }
        }
        rule.waitForIdle()
        rule.onRoot().captureRoboImage(path)
    }

    @Test fun chatList() = shoot("/tmp/shots/01_chats.png") { MainScreen() }
    @Test fun chat() = shoot("/tmp/shots/02_chat.png") { ChatScreen(alice.id) }
    @Test fun giftChat() = shoot("/tmp/shots/03_chat_gifts.png") { ChatScreen(bob.id) }
    @Test fun shop() = shoot("/tmp/shots/04_shop.png") { GiftShopScreen(null) }
    @Test fun inventory() = shoot("/tmp/shots/05_inventory.png") { InventoryScreen() }
    @Test fun mesh() = shoot("/tmp/shots/06_mesh.png") { MeshTab() }
    @Test fun explore() = shoot("/tmp/shots/07_explore.png") { ExploreTab() }
    @Test fun me() = shoot("/tmp/shots/08_me.png") { MeTab() }
    @Test fun onboarding() = shoot("/tmp/shots/09_onboarding.png") { Onboarding {} }
    @Test fun addContact() = shoot("/tmp/shots/10_add.png") { AddContactScreen() }
    @Test fun myQr() = shoot("/tmp/shots/11_qr.png") { MyQrScreen() }
    @Test fun appearance() = shoot("/tmp/shots/12_appearance.png") { AppearanceScreen() }
    @Test fun giftDetail() { val g = engine.myGifts().firstOrNull(); shoot("/tmp/shots/13_giftdetail.png") { GiftDetailScreen(g?.id ?: "") } }
    @Test fun walkie() = shoot("/tmp/shots/14_walkie.png") { WalkieScreen() }
}
