package app.orbit

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import app.orbit.core.*
import app.orbit.core.crypto.Identity
import app.orbit.data.*
import app.orbit.engine.Engine
import app.orbit.gifts.GiftCatalog
import app.orbit.gifts.GiftLogic
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

    @Test fun promoCodeGivesTwoMillionOnceAndPremiumGiftsAreBuyable() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        val e = Engine(app, "promo.db"); e.db.setKv("t.relay", "0")
        e.attachIdentityForTest(Identity.generate(), Profile("P", "", "🙂", 0, ""))
        assertEquals(Engine.PromoResult.INVALID, e.redeemPromo("12345678").first)
        val before = e.coins.value
        val (r, n) = e.redeemPromo("18021953")
        assertEquals(Engine.PromoResult.OK, r); assertEquals(2_000_000, n); assertEquals(before + 2_000_000, e.coins.value)
        assertEquals("only once", Engine.PromoResult.USED, e.redeemPromo(" 18021953 ").first)
        assertEquals(before + 2_000_000, e.coins.value)
        // every premium model is buyable, expensive, verified and always rare-material
        var bought = 0
        for (m in GiftCatalog.PREMIUM_FROM until GiftCatalog.models.size) {
            assertTrue(e.price(m) >= 50_000)
            var g: Gift? = null
            e.buyGift(m, "", null) { g = it }
            wait(what = "buy premium $m") { g != null }
            assertTrue(GiftLogic.verify(g!!))
            assertTrue(GiftLogic.traits(g!!).material >= 6)
            bought++
        }
        assertEquals(3, bought)
        assertEquals(before + 2_000_000 - 50_000 - 150_000 - 500_000, e.coins.value)
    }

    @Test fun adminTokenOnceMarketSaleAndMoreCodes() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        FakeNtfy().use { srv ->
            val url = "http://127.0.0.1:${srv.port}"
            val a = Engine(app, "ma.db"); val b = Engine(app, "mb.db")
            a.db.setKv("t.relay", "0"); b.db.setKv("t.relay", "0")
            a.attachIdentityForTest(Identity.generate(), Profile("Seller", "", "🦊", 1, "")); b.attachIdentityForTest(Identity.generate(), Profile("Buyer", "", "🐼", 2, ""))
            // test authority
            val kp = com.google.crypto.tink.subtle.Ed25519Sign.KeyPair.newKeyPair()
            a.adminPub = kp.publicKey; b.adminPub = kp.publicKey
            fun token(): String { val id = Rand.bytes(12); return Base32.encode(id + com.google.crypto.tink.subtle.Ed25519Sign(kp.privateKey).sign("orbit.admin.token".utf8() + id)) }
            a.setRelay(true, url); b.setRelay(true, url)

            // several promo codes, each once
            val c0 = b.coins.value
            for ((code, amt) in listOf("20252025" to 1_000_000, "giftS500k" to 500_000, "ORBIT250K" to 250_000, "LUCKY100K" to 100_000)) {
                assertEquals(Engine.PromoResult.OK, b.redeemCode(code).first); assertEquals(amt, b.redeemCode(code.uppercase()).let { amt }.also { })
            }
            assertEquals(c0 + 1_850_000, b.coins.value)
            assertEquals(Engine.PromoResult.USED, b.redeemCode("20252025").first)

            // admin token: valid once, tampered/foreign rejected, gossip blocks re-use on another phone
            val t = token()
            assertEquals(Engine.PromoResult.INVALID, a.redeemCode(t.dropLast(3) + "aaa").first)
            assertEquals(Engine.PromoResult.ADMIN, a.redeemCode(t).first); assertTrue(a.isAdmin.value)
            assertEquals(Engine.PromoResult.USED, a.redeemCode(t).first)
            wait(what = "claim gossiped to b") { b.db.getKv("tokused." + Base32.decode(t).copyOf(12).hex()) != null }
            assertEquals(Engine.PromoResult.USED, b.redeemCode(t).first); assertFalse(b.isAdmin.value)

            // admin mints 3 premium gifts for free, lists one
            val before = a.coins.value
            var made = 0
            a.adminMint(12, 3, null, "") { made = it }
            wait(what = "admin mint") { made == 3 }
            assertEquals(before, a.coins.value)
            val g = a.myGifts().first { it.model == 12 }
            assertTrue(a.listGift(g.id, 750_000))
            wait(what = "buyer sees listing") { b.directory.value.any { it.kind == "gift" && it.id == g.id && it.desc == "750000" } }

            // buyer purchases over the relay; seller phone hands the gift over automatically
            val sellerCoins = a.coins.value; val buyerCoins = b.coins.value
            var res = ""
            b.buyListing(b.directory.value.first { it.id == g.id }) { res = it }
            wait(what = "buyer owns it") { b.myGifts().any { it.id == g.id } }
            assertEquals(buyerCoins - 750_000, b.coins.value)
            wait(what = "seller paid") { a.coins.value == sellerCoins + 750_000 }
            assertTrue(a.myGifts().none { it.id == g.id }); assertNull(a.listedPrice(g.id))
            wait(what = "listing disappears for buyer") { b.directory.value.none { it.kind == "gift" && it.id == g.id } }
            a.shutdown(); b.shutdown()
        }
    }

    @Test fun wornGiftShowsOnProfileForContactsAndCannotBeFaked() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        FakeNtfy().use { srv ->
            val url = "http://127.0.0.1:${srv.port}"
            val a = Engine(app, "wa.db"); val b = Engine(app, "wb.db"); a.db.setKv("t.relay", "0"); b.db.setKv("t.relay", "0")
            val ia = Identity.generate(); val ib = Identity.generate()
            a.attachIdentityForTest(ia, Profile("Alice", "", "🦊", 1, "")); b.attachIdentityForTest(ib, Profile("Bob", "", "🐼", 2, ""))
            a.setRelay(true, url); b.setRelay(true, url)
            val chat = runBlocking { a.openLink(b.myLink()) }!!
            wait(what = "bob knows alice") { b.contacts.value.containsKey(ia.id) }
            var g: Gift? = null; a.buyGift(3, "", null) { g = it }; wait(what = "bought") { g != null }
            assertNull(b.contactWorn(ia.id))
            b.acceptStranger(ia.id); a.acceptStranger(chat)
            a.wearGift(g!!.id)
            wait(what = "bob sees alice's worn gift") { b.contactWorn(ia.id)?.id == g!!.id }
            assertEquals(g!!.id, a.worn.value?.id)
            // a gift Alice does not own cannot be worn
            a.wearGift("00".repeat(16)); Thread.sleep(200); assertEquals(g!!.id, a.worn.value?.id)
            a.wearGift(null); wait(what = "bob sees it removed") { b.contactWorn(ia.id) == null }
            a.shutdown(); b.shutdown()
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
