package app.orbit

import app.orbit.core.*
import app.orbit.core.crypto.*
import app.orbit.core.mesh.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import org.junit.Assert.*
import org.junit.Test

/** In-memory wire between two nodes, with optional drop to simulate partitions. */
class PipeLink(override val linkId: String, override val label: String = "pipe") : Link {
    override val medium = "test"
    @Volatile var remote: PipeLink? = null
    @Volatile var listener: LinkListener? = null
    @Volatile var closed = false
    @Volatile var ready = false
    override suspend fun send(frame: ByteArray): Boolean {
        while (!ready && !closed) delay(1)
        if (closed) return false
        val r = remote ?: return false
        r.listener!!.onFrame(r, frame); return true
    }
    override fun close() { closed = true; listener?.onLinkDown(this); remote?.let { if (!it.closed) { it.closed = true; it.listener?.onLinkDown(it) } } }
}

fun connect(a: MeshNode, b: MeshNode, name: String): Pair<PipeLink, PipeLink> {
    val la = PipeLink("$name-a"); val lb = PipeLink("$name-b")
    la.remote = lb; lb.remote = la; la.listener = a; lb.listener = b
    a.onLinkUp(la); b.onLinkUp(lb); la.ready = true; lb.ready = true
    return la to lb
}

class Recorder(val me: Identity, val tags: List<ByteArray>) : MeshHandler {
    val got = java.util.concurrent.CopyOnWriteArrayList<ByteArray>()
    override fun isMine(tag: ByteArray) = tags.any { it.contentEquals(tag) }
    override suspend fun onEnvelope(e: Envelope, via: Peer?): Boolean {
        val o = Envelope.openDirect(me, e) ?: return false
        got.add(o.payload); return true
    }
}

class CoreTest {
    @Test fun identityRecovery() {
        val a = Identity.generate()
        val b = Identity.fromRecoveryKey(a.recoveryKey())
        assertArrayEquals(a.address, b.address)
        assertEquals(a.id, b.id)
    }

    @Test fun base32AndVarint() {
        val d = Rand.bytes(33)
        assertArrayEquals(d, Base32.decode(Base32.encode(d)))
        val w = ByteWriter().varint(300).varint(0).varint(1L shl 40).str("привет")
        val r = ByteReader(w.toByteArray())
        assertEquals(300, r.varint()); assertEquals(0, r.varint()); assertEquals(1L shl 40, r.varint()); assertEquals("привет", r.str())
    }

    @Test fun directEnvelopeSealedAndSigned() {
        val alice = Identity.generate(); val bob = Identity.generate(); val eve = Identity.generate()
        val env = Envelope.direct(alice, Peer(bob.signPub, bob.boxPub), "hello".utf8())
        val wire = Envelope.decode(env.encode())!!
        val o = Envelope.openDirect(bob, wire)!!
        assertEquals("hello", o.payload.str()); assertEquals(alice.id, o.sender.id)
        assertNull("eve cannot open", Envelope.openDirect(eve, wire))
        // tampering the body must fail authentication
        val bad = Envelope(wire.id, wire.kind, wire.tag, wire.created, wire.expires, 0, null, wire.body.copyOf().also { it[40] = (it[40] + 1).toByte() })
        assertNull(Envelope.openDirect(bob, bad))
        // hops are mutable without breaking anything
        wire.hops = 17; assertNotNull(Envelope.openDirect(bob, wire))
    }

    @Test fun groupAndChannel() {
        val a = Identity.generate(); val gid = Rand.bytes(16); val key = Rand.bytes(32)
        val e = Envelope.group(a, gid, key, "gm".utf8())
        val (pub, p) = Envelope.openGroup(key, e)!!
        assertArrayEquals(a.signPub, pub); assertEquals("gm", p.str())
        assertNull(Envelope.openGroup(Rand.bytes(32), e))

        val chan = Identity.generate(); val ck = Rand.bytes(32)
        val post = Envelope.channel(chan.signPub, chan.signPub, chan::sign, ck, "post".utf8())
        assertEquals("post", Envelope.openChannel(post, ck)!!.payload.str())
        assertNull(Envelope.openChannel(post, null))
        val pub2 = Envelope.channel(chan.signPub, chan.signPub, chan::sign, null, "open".utf8())
        assertEquals("open", Envelope.openChannel(pub2, null)!!.payload.str())
        val forged = Envelope.channel(chan.signPub, a.signPub, a::sign, null, "x".utf8())
        assertArrayEquals("signer is reported so apps can reject non-owners", a.signPub, Envelope.openChannel(forged, null)!!.signerPub)
    }

    @Test fun ackRoundTrip() {
        val a = Identity.generate(); val b = Identity.generate()
        val m = Envelope.direct(a, Peer(b.signPub, b.boxPub), "x".utf8())
        val ack = Envelope.ack(b, Peer(a.signPub, a.boxPub), m.id)
        val o = Envelope.openAck(a, Envelope.decode(ack.encode())!!)!!
        assertArrayEquals(b.signPub, o.signerPub); assertArrayEquals(m.id, ack.refId)
    }

    @Test fun framerReassemblesOutOfOrderAndDuplicates() {
        val data = Rand.bytes(100_000)
        val parts = Framer.split(data, 1100)
        assertTrue(parts.size > 80)
        val re = Reassembler()
        var out: ByteArray? = null
        for (p in parts.shuffled() + parts.take(5)) { re.feed(p)?.let { out = it } }
        assertArrayEquals(data, out)
        assertArrayEquals(byteArrayOf(1, 2), Reassembler().feed(Framer.split(byteArrayOf(1, 2), 100)[0]))
    }

    private fun waitFor(ms: Long = 20000, cond: () -> Boolean) = runBlocking {
        val t = System.currentTimeMillis()
        while (!cond() && System.currentTimeMillis() - t < ms) delay(10)
        assertTrue("condition not met in time", cond())
    }

    @Test fun multiHopStoreAndForwardThroughRelayThatDoesNotKnowRecipient() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val a = Identity.generate(); val b = Identity.generate(); val c = Identity.generate()
        val storeB = MemoryStore()
        val na = MeshNode(a, MemoryStore(), scope); val nb = MeshNode(b, storeB, scope); val nc = MeshNode(c, MemoryStore(), scope)
        val ha = Recorder(a, listOf(Tags.user(a.signPub))); val hc = Recorder(c, listOf(Tags.user(c.signPub)))
        na.handler = ha; nb.handler = Recorder(b, listOf(Tags.user(b.signPub))); nc.handler = hc

        // A talks to B only. C is nowhere near.
        connect(na, nb, "ab")
        waitFor { na.peers.value.size == 1 }
        val msg = Envelope.direct(a, Peer(c.signPub, c.boxPub), "carry me".utf8())
        na.submit(msg)
        delay(200)
        assertEquals("relay stores the opaque blob", 1, nb.stored.value)
        assertTrue(hc.got.isEmpty())

        // Later B walks into C's range: delay tolerant delivery by inventory sync.
        connect(nb, nc, "bc")
        waitFor { hc.got.size == 1 }
        assertEquals("carry me", hc.got[0].str())

        // C replies with an ACK: B drops its copy, A (not connected to C) never saw it directly.
        val ack = Envelope.ack(c, Peer(a.signPub, a.boxPub), msg.id)
        nc.submit(ack)
        waitFor { storeB.get(msg.idHex) == null }
        scope.cancel()
    }

    @Test fun duplicateSuppressionAndLoopSafety() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val ids = List(3) { Identity.generate() }
        val nodes = ids.map { MeshNode(it, MemoryStore(), scope) }
        val recs = ids.mapIndexed { i, id -> Recorder(id, listOf(Tags.user(id.signPub))).also { nodes[i].handler = it } }
        // triangle
        connect(nodes[0], nodes[1], "01"); connect(nodes[1], nodes[2], "12"); connect(nodes[2], nodes[0], "20")
        delay(100)
        nodes[0].submit(Envelope.direct(ids[0], Peer(ids[2].signPub, ids[2].boxPub), "once".utf8()))
        delay(500)
        assertEquals(1, recs[2].got.size)
        scope.cancel()
    }
}

class GiftTest {
    @Test fun mintTransferVerifyAndTamper() {
        val a = Identity.generate(); val b = Identity.generate(); val c = Identity.generate()
        val g = app.orbit.gifts.GiftLogic.mint(a, "Alice", 3, 1)
        assertTrue(app.orbit.gifts.GiftLogic.verify(g))
        val g2 = app.orbit.gifts.GiftLogic.transfer(a, g, b.id)
        val g3 = app.orbit.gifts.GiftLogic.transfer(b, g2, c.id)
        assertTrue(app.orbit.gifts.GiftLogic.verify(g3)); assertEquals(c.id, g3.owner)
        // b cannot hand it over twice from stale state, thief cannot sign for b
        try { app.orbit.gifts.GiftLogic.transfer(a, g2, c.id); fail() } catch (e: IllegalArgumentException) {}
        val forged = g3.copy(transfers = listOf(g3.transfers[0].copy(toId = c.id), g3.transfers[1]))
        assertFalse(app.orbit.gifts.GiftLogic.verify(forged))
        assertFalse(app.orbit.gifts.GiftLogic.verify(g.copy(serial = 2)))
        // traits are deterministic
        assertEquals(app.orbit.gifts.GiftLogic.traits(g), app.orbit.gifts.GiftLogic.traits(g3))
        assertEquals(g.toJson().toString().length > 10, true)
    }
}

class LiveTest {
    class LiveHandler(val me: Identity) : MeshHandler {
        var core: app.orbit.live.LiveCore? = null
        override fun isMine(tag: ByteArray) = false
        override suspend fun onEnvelope(e: Envelope, via: Peer?) = false
        override fun onLive(from: Peer?, frame: ByteArray, link: Link) { if (frame.isNotEmpty() && frame[0].toInt() == 3) try { core?.onFrame(from, frame.copyOfRange(9, frame.size)) } catch (e: Throwable) { e.printStackTrace(System.out) } }
    }

    @Test fun roomWithRelayedListenerHandRaiseAndSpeakerPromotion() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val h = Identity.generate(); val s = Identity.generate(); val l = Identity.generate()
        val nh = MeshNode(h, MemoryStore(), scope); val ns = MeshNode(s, MemoryStore(), scope); val nl = MeshNode(l, MemoryStore(), scope)
        val hh = LiveHandler(h); val hs = LiveHandler(s); val hl = LiveHandler(l); nh.handler = hh; ns.handler = hs; nl.handler = hl
        connect(nh, ns, "hs"); connect(ns, nl, "sl")   // L is NOT adjacent to H
        delay(200)
        val rid = Rand.bytes(16); val key = Rand.bytes(32)
        fun card(n: String) = org.json.JSONObject().put("n", n).put("e", "").put("c", 1)
        val ch = app.orbit.live.LiveCore(h, nh, rid, key, h.id, "Town hall", { card("Host") }, 3)
        val cs = app.orbit.live.LiveCore(s, ns, rid, key, h.id, "", { card("Sam") }, 3)
        val cl = app.orbit.live.LiveCore(l, nl, rid, key, h.id, "", { card("Lee") }, 3)
        hh.core = ch; hs.core = cs; hl.core = cl
        val gotAtL = java.util.concurrent.CopyOnWriteArrayList<String>(); val gotAtH = java.util.concurrent.CopyOnWriteArrayList<String>()
        cl.onAudio = { who, q, f -> gotAtL.add(who.take(4) + ":" + f.str()) }; ch.onAudio = { who, q, f -> gotAtH.add(who.take(4) + ":" + f.str()) }

        cs.join(); cl.join()
        var step = 0
        fun waitFor(c: () -> Boolean) = runBlocking { step++; val t = System.currentTimeMillis(); while (!c() && System.currentTimeMillis() - t < 5000) delay(10); assertTrue("timeout at step $step host=${ch.state.value.participants.map { it.name + it.role }} L=${cl.state.value.participants.map { it.name }} S=${cs.state.value.participants.map { it.name }} gotH=$gotAtH", c()) }
        waitFor { ch.state.value.participants.size == 3 }             // L's JOIN hopped through S to the host
        waitFor { cl.state.value.participants.size == 3 }             // host STATE hopped back through S
        assertEquals(app.orbit.live.Role.LISTENER, cl.myRole)

        cl.raiseHand(true)
        waitFor { ch.state.value.me(l.id)?.hand == true }
        ch.hostSetRole(l.id, app.orbit.live.Role.SPEAKER)
        waitFor { cl.myRole == app.orbit.live.Role.SPEAKER }
        assertFalse("hand lowered on promotion", cl.state.value.me(l.id)!!.hand)

        // listener S (still LISTENER) cannot inject audio; speaker L can, and host hears it via S
        cs.sendAudio("nope".utf8(), 1)
        cl.sendAudio("hello".utf8(), 1); cl.sendAudio("world".utf8(), 2)
        waitFor { gotAtH.size >= 2 }
        assertTrue(gotAtH.all { it.startsWith(l.id.take(4)) }); assertEquals(listOf("hello", "world"), gotAtH.map { it.substringAfter(':') }.sorted())
        // duplicate suppression: replaying the same seq produces no duplicate
        cl.sendAudio("hello".utf8(), 1); delay(200); assertEquals(2, gotAtH.size)

        // a non-member with the wrong key learns nothing
        val eve = Identity.generate(); val ne = MeshNode(eve, MemoryStore(), scope); val he = LiveHandler(eve); ne.handler = he; connect(ns, ne, "se")
        val ce = app.orbit.live.LiveCore(eve, ne, rid, Rand.bytes(32), h.id, "", { card("Eve") }, 3); he.core = ce
        ch.broadcastState(); delay(300)
        assertTrue(ce.state.value.participants.isEmpty())

        ch.end(); waitFor { cl.state.value.ended }
        scope.cancel()
    }
}
