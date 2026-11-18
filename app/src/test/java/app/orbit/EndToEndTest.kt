package app.orbit

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import app.orbit.core.*
import app.orbit.core.crypto.Identity
import app.orbit.data.*
import app.orbit.engine.Engine
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Two complete app engines that are never directly connected: the only path is the (local fake) cloud relay. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class EndToEndTest {
    private fun wait(ms: Long = 20000, what: String, c: () -> Boolean) = runBlocking { val t = System.currentTimeMillis(); while (!c() && System.currentTimeMillis() - t < ms) delay(25); assertTrue("timeout: $what", c()) }

    @Test fun firstMessageArrivesAndGetsDeliveredReceipt() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        FakeNtfy().use { srv ->
            val url = "http://127.0.0.1:${srv.port}"
            val a = Engine(app, "a.db"); val b = Engine(app, "b.db")
            a.db.setKv("t.relay", "0"); b.db.setKv("t.relay", "0")
            val ia = Identity.generate(); val ib = Identity.generate()
            a.attachIdentityForTest(ia, Profile("Alice", "", "🦊", 1, "")); b.attachIdentityForTest(ib, Profile("Bob", "", "🐼", 2, ""))
            a.setRelay(true, url); b.setRelay(true, url)

            // Alice adds Bob from his link and writes the very first message
            val chatId = runBlocking { a.openLink(b.myLink()) }
            assertEquals(ib.id, chatId)
            a.send(chatId!!, MsgKind.TEXT, "Hello Bob, first message!")

            wait(what = "bob gets a chat from alice") { b.chats.value.any { it.id == ia.id && it.lastPreview.contains("first message") } }
            val got = b.messages(ia.id).value.single { it.kind == MsgKind.TEXT }
            assertEquals("Hello Bob, first message!", got.text)
            assertTrue("stranger until accepted", b.contacts.value[ia.id]!!.stranger)
            assertEquals("Alice", b.contacts.value[ia.id]!!.displayName)

            // receipt flows back through the relay
            wait(what = "alice sees DELIVERED") { a.messages(chatId).value.any { it.mine && it.status >= Status.DELIVERED } }

            // Bob replies and reads
            b.acceptStranger(ia.id); b.send(ia.id, MsgKind.TEXT, "Got it!")
            wait(what = "alice gets reply") { a.messages(chatId).value.any { it.text == "Got it!" } }
            b.markRead(ia.id); a.markRead(chatId)
            wait(what = "alice sees READ") { a.messages(chatId).value.any { it.mine && it.status == Status.READ } }

            // a gift bought with coins travels the same way
            assertEquals(Engine.WELCOME_COINS, a.coins.value)
            var gift: Gift? = null
            a.buyGift(3, "enjoy", chatId) { gift = it }
            wait(what = "gift minted") { gift != null }
            assertEquals(Engine.WELCOME_COINS - a.price(3), a.coins.value)
            wait(what = "bob owns the gift") { b.myGifts().any { it.id == gift!!.id } }
            a.shutdown(); b.shutdown()
        }
    }

    @Test fun usernameIsFoundOverRelayAndContactCardCanBeShared() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        FakeNtfy().use { srv ->
            val url = "http://127.0.0.1:${srv.port}"
            val a = Engine(app, "ua.db"); val b = Engine(app, "ub.db"); val c = Engine(app, "uc.db")
            listOf(a, b, c).forEach { it.db.setKv("t.relay", "0") }
            val ia = Identity.generate(); val ib = Identity.generate(); val ic = Identity.generate()
            a.attachIdentityForTest(ia, Profile("Alice", "", "🦊", 1, "")); b.attachIdentityForTest(ib, Profile("Bob", "", "🐼", 2, "")); c.attachIdentityForTest(ic, Profile("Carol", "", "🦉", 3, ""))
            listOf(a, b, c).forEach { it.setRelay(true, url) }
            // Alice claims @alice_x; no direct link anywhere, the announcement travels through the relay
            a.updateProfile(Profile("Alice", "", "🦊", 1, "alice_x"))
            wait(what = "bob sees @alice_x in the directory") { b.directory.value.any { it.username == "alice_x" } }
            val id = runBlocking { b.openUsername("@alice_x") }
            assertEquals(ia.id, id)
            assertNull(runBlocking { b.openUsername("@nobody_here") })

            // Alice knows Carol and shares her card with Bob; Bob can open it
            val carolId = runBlocking { a.openLink(c.myLink()) }!!
            val bobChat = runBlocking { a.openLink(b.myLink()) }!!
            a.sendContact(bobChat, carolId)
            wait(what = "bob receives the contact card") { b.messages(ia.id).value.any { it.kind == MsgKind.CONTACT } }
            val card = b.messages(ia.id).value.first { it.kind == MsgKind.CONTACT }
            assertEquals("Carol", card.extra.optString("name"))
            val opened = runBlocking { b.openLink("orbit://u/" + card.extra.optString("addr")) }
            assertEquals(ic.id, opened)
            a.shutdown(); b.shutdown(); c.shutdown()
        }
    }

    @Test fun wheelPaysOutOncePerDay() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        val e = Engine(app, "w.db"); e.db.setKv("t.relay", "0")
        e.attachIdentityForTest(Identity.generate(), Profile("W", "", "🙂", 0, ""))
        assertTrue(e.canSpin())
        val before = e.coins.value
        val idx = e.spinWheel()
        assertTrue(idx in e.wheelPrizes.indices)
        assertEquals(before + e.wheelPrizes[idx].first, e.coins.value)
        assertFalse(e.canSpin()); assertEquals(-1, e.spinWheel())
        // distribution sanity: expected value around 18
        val ev = e.wheelPrizes.sumOf { it.first * it.second } / e.wheelPrizes.sumOf { it.second }.toDouble()
        assertTrue(ev in 15.0..22.0)
        // can't buy what you can't afford
        e.addCoins(-e.coins.value)
        var r: Gift? = GiftLogicDummy.g
        e.buyGift(0, "", null) { r = it }
        wait(what = "buy rejected") { r == null }
    }
}
object GiftLogicDummy { val g: Gift? = Gift("0".repeat(32), 0, "", "", 1, 1, "0".repeat(32), 0, "", emptyList()) }
