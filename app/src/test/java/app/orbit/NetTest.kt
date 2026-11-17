package app.orbit

import app.orbit.core.*
import app.orbit.core.crypto.*
import app.orbit.core.mesh.*
import app.orbit.core.net.*
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import java.net.*
import java.util.concurrent.ConcurrentHashMap

/** A tiny stand-in for a BEP5 DHT node so the whole internet path can be tested on loopback. */
class FakeDht : AutoCloseable {
    val sock = DatagramSocket(0, InetAddress.getByName("127.0.0.1"))
    val id = Rand.bytes(20)
    val peers = ConcurrentHashMap<String, MutableSet<InetSocketAddress>>()
    @Volatile var running = true
    val t = Thread {
        val buf = ByteArray(2048)
        while (running) {
            try {
                val p = DatagramPacket(buf, buf.size); sock.receive(p)
                val m = Bencode.decode(buf.copyOf(p.length)).asMap()!!
                val a = m["a"].asMap()!!
                val from = InetSocketAddress(p.address, p.port)
                val resp = mutableMapOf<String, Any?>("id" to id)
                when (String(m["q"].asBytes()!!)) {
                    "find_node" -> resp["nodes"] = ByteArray(0)
                    "get_peers" -> {
                        resp["token"] = byteArrayOf(1, 2, 3, 4); resp["nodes"] = ByteArray(0)
                        val vs = peers[a["info_hash"].asBytes()!!.hex()]
                        if (vs != null) resp["values"] = vs.map { x -> x.address.address + byteArrayOf((x.port shr 8).toByte(), x.port.toByte()) }
                    }
                    "announce_peer" -> peers.getOrPut(a["info_hash"].asBytes()!!.hex()) { java.util.concurrent.ConcurrentHashMap.newKeySet() }.add(from)
                }
                val out = Bencode.encode(mapOf("t" to m["t"], "y" to "r", "r" to resp))
                sock.send(DatagramPacket(out, out.size, p.socketAddress))
            } catch (e: Exception) { }
        }
    }.also { it.isDaemon = true; it.start() }
    override fun close() { running = false; sock.close() }
}

class NetTest {
    @Test fun bencodeRoundTrip() {
        val v = mapOf("a" to 5L, "b" to listOf(1L, "xy".toByteArray()), "c" to mapOf("z" to ByteArray(3)))
        val d = Bencode.decode(Bencode.encode(v)).asMap()!!
        assertEquals(5L, d["a"]); assertEquals(2, (d["b"] as List<*>).size)
        assertEquals("d1:ai5ee", String(Bencode.encode(mapOf("a" to 5L))))
    }

    private fun waitFor(ms: Long = 20000, c: () -> Boolean) = runBlocking { val t = System.currentTimeMillis(); while (!c() && System.currentTimeMillis() - t < ms) delay(20); assertTrue("timeout", c()) }

    @Test fun twoPhonesFindEachOtherThroughDhtAndExchangeMessagesOverLossyUdp() {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        FakeDht().use { dht ->
            val a = Identity.generate(); val b = Identity.generate()
            val na = MeshNode(a, MemoryStore(), scope); val nb = MeshNode(b, MemoryStore(), scope)
            val ra = Recorder(a, listOf(Tags.user(a.signPub))); val rb = Recorder(b, listOf(Tags.user(b.signPub)))
            na.handler = ra; nb.handler = rb
            val boot = listOf("127.0.0.1" to dht.sock.localPort)
            val ta = InetTransport(scope, boot, 0, { listOf(InetTransport.topicHash(a.signPub)) }, { listOf(InetTransport.topicHash(b.signPub)) }, 400)
            val tb = InetTransport(scope, boot, 0, { listOf(InetTransport.topicHash(b.signPub)) }, { listOf(InetTransport.topicHash(a.signPub)) }, 400)
            ta.testDropRate = 0.25; tb.testDropRate = 0.25
            ta.start(na); tb.start(nb)
            waitFor { na.peers.value.size == 1 && nb.peers.value.size == 1 }
            assertEquals(b.id, na.peers.value[0].peerId)

            // a 300 KB "photo" through 25% packet loss must arrive intact
            val big = Rand.bytes(300_000)
            runBlocking { na.submit(Envelope.direct(a, Peer(b.signPub, b.boxPub), big)) }
            waitFor(40000) { rb.got.size == 1 }
            assertArrayEquals(big, rb.got[0])
            println("LOSSY: dropped=${ta.dropped.get() + tb.dropped.get()} retransmits=${ta.retransmits.get() + tb.retransmits.get()}")
            assertTrue("loss must really happen", ta.dropped.get() + tb.dropped.get() > 20)
            assertTrue("and be repaired by retransmission", ta.retransmits.get() + tb.retransmits.get() > 0)
            ta.stop(); tb.stop(); scope.cancel()
        }
    }

    @Test fun lanTcpLinkCarriesMessages() {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val a = Identity.generate(); val b = Identity.generate()
        val na = MeshNode(a, MemoryStore(), scope); val nb = MeshNode(b, MemoryStore(), scope)
        val rb = Recorder(b, listOf(Tags.user(b.signPub))); nb.handler = rb; na.handler = Recorder(a, emptyList())
        val la = LanTransport(a.signPub, scope, 47999); val lb = LanTransport(b.signPub, scope, 47998)
        la.start(na); lb.start(nb)
        assertTrue(la.connect("127.0.0.1", lb.port))
        waitFor { na.peers.value.size == 1 && nb.peers.value.size == 1 }
        runBlocking { na.submit(Envelope.direct(a, Peer(b.signPub, b.boxPub), "over tcp".utf8())) }
        waitFor { rb.got.size == 1 }
        assertEquals("over tcp", rb.got[0].str())
        la.stop(); lb.stop(); scope.cancel()
    }
}
