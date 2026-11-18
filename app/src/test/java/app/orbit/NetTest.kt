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

/** Minimal ntfy-compatible server (publish + streaming JSON subscribe) on loopback, raw sockets. */
class FakeNtfy : AutoCloseable {
    private val server = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
    private val log = java.util.concurrent.CopyOnWriteArrayList<Triple<String, Long, String>>()
    @Volatile private var running = true
    @Volatile var rejectPosts = false
    val port get() = server.localPort
    init {
        Thread { while (running) { val s = try { server.accept() } catch (e: Exception) { break }; Thread { handle(s) }.also { it.isDaemon = true }.start() } }.also { it.isDaemon = true }.start()
    }
    private fun handle(s: Socket) {
        try {
            val inp = s.getInputStream().buffered(); val out = s.getOutputStream()
            fun line(): String { val sb = StringBuilder(); while (true) { val c = inp.read(); if (c < 0 || c == '\n'.code) break; if (c != '\r'.code) sb.append(c.toChar()) }; return sb.toString() }
            val req = line().split(" "); var len = 0
            while (true) { val h = line(); if (h.isEmpty()) break; if (h.lowercase().startsWith("content-length:")) len = h.substringAfter(":").trim().toInt() }
            val path = req[1].substringBefore("?").trim('/')
            if (req[0] == "POST" && rejectPosts) { out.write("HTTP/1.1 429 Too Many Requests\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray()); out.flush(); s.close(); return }
            if (req[0] == "POST") {
                val body = ByteArray(len); var n = 0; while (n < len) { val r = inp.read(body, n, len - n); if (r < 0) break; n += r }
                log.add(Triple(path, System.currentTimeMillis() / 1000, String(body)))
                out.write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}".toByteArray()); out.flush(); s.close()
            } else {
                val topics = path.removeSuffix("/json").split(",").toSet()
                out.write("HTTP/1.1 200 OK\r\nContent-Type: application/x-ndjson\r\nConnection: close\r\n\r\n{\"event\":\"open\"}\n".toByteArray()); out.flush()
                var sent = 0
                while (running) {
                    while (sent < log.size) { val (t, ts, m) = log[sent++]; if (t in topics) { out.write((org.json.JSONObject().put("event", "message").put("topic", t).put("time", ts).put("message", m).toString() + "\n").toByteArray()); out.flush() } }
                    Thread.sleep(30)
                }
            }
        } catch (e: Exception) { try { s.close() } catch (_: Exception) {} }
    }
    override fun close() { running = false; try { server.close() } catch (_: Exception) {} }
}

class RelayFailoverTest {
    @Test fun oneBlockedServerDoesNotStopDelivery() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        FakeNtfy().use { good ->
            val dead = java.net.ServerSocket(0).use { it.localPort }          // nothing listens here: connection refused
            val a = Identity.generate(); val b = Identity.generate()
            val na = MeshNode(a, MemoryStore(), scope); val nb = MeshNode(b, MemoryStore(), scope)
            val rb = Recorder(b, listOf(Tags.user(b.signPub))); nb.handler = rb; na.handler = Recorder(a, emptyList())
            val servers = listOf("http://127.0.0.1:$dead", "http://127.0.0.1:${good.port}")
            val relA = CloudRelay(scope, servers, { listOf(Tags.user(a.signPub)) }, { na.ingestExternal(it) })
            val relB = CloudRelay(scope, servers, { listOf(Tags.user(b.signPub)) }, { nb.ingestExternal(it) })
            na.onLocalSubmit = { relA.publish(it) }
            relA.start(); relB.start()
            na.submit(Envelope.direct(a, Peer(b.signPub, b.boxPub), "through the good server".utf8()))
            val t = System.currentTimeMillis()
            while (rb.got.isEmpty() && System.currentTimeMillis() - t < 20000) delay(20)
            assertEquals("through the good server", rb.got.single().str())
            assertTrue(relB.online.value)
            assertTrue("the dead server is reported", relA.lastError.contains("127.0.0.1"))
            assertTrue(relA.healthy)
            relA.stop(); relB.stop(); scope.cancel()
        }
    }
}

class RelayLimitTest {
    @Test fun rateLimitIsReportedAndPublishingPauses() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        FakeNtfy().use { srv ->
            srv.rejectPosts = true
            val a = Identity.generate(); val b = Identity.generate()
            val rel = CloudRelay(scope, "http://127.0.0.1:${srv.port}", { listOf(Tags.user(a.signPub)) }, { })
            rel.publish(Envelope.direct(a, Peer(b.signPub, b.boxPub), "x".utf8()))
            val t = System.currentTimeMillis()
            while (!rel.lastError.contains("429") && System.currentTimeMillis() - t < 10000) delay(20)
            assertTrue(rel.lastError, rel.lastError.contains("429"))
            assertFalse(rel.healthy)
            val posts = rel.published
            rel.publish(Envelope.direct(a, Peer(b.signPub, b.boxPub), "y".utf8())); delay(300)   // paused: must not retry/post
            assertEquals(posts, rel.published)
            scope.cancel()
        }
    }
}

class RelayTest {
    @Test fun messageCrossesPhonesThatNeverConnectDirectly() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        FakeNtfy().use { srv ->
            val a = Identity.generate(); val b = Identity.generate()
            val na = MeshNode(a, MemoryStore(), scope); val nb = MeshNode(b, MemoryStore(), scope)
            val ra = Recorder(a, listOf(Tags.user(a.signPub))); val rb = Recorder(b, listOf(Tags.user(b.signPub))); na.handler = ra; nb.handler = rb
            val base = "http://127.0.0.1:${srv.port}"
            val relA = CloudRelay(scope, base, { listOf(Tags.user(a.signPub)) }, { na.ingestExternal(it) })
            val relB = CloudRelay(scope, base, { listOf(Tags.user(b.signPub)) }, { nb.ingestExternal(it) })
            na.onLocalSubmit = { relA.publish(it) }; nb.onLocalSubmit = { relB.publish(it) }
            relA.start()                       // B is OFFLINE (relay not started yet): store-and-forward on the relay
            val photo = Rand.bytes(60_000)     // chunked across many relay messages
            na.submit(Envelope.direct(a, Peer(b.signPub, b.boxPub), photo))
            na.submit(Envelope.direct(a, Peer(b.signPub, b.boxPub), "short".utf8()))
            delay(800)
            relB.start()                       // B comes online later and catches up
            val t = System.currentTimeMillis()
            while (rb.got.size < 2 && System.currentTimeMillis() - t < 15000) delay(20)
            assertEquals(2, rb.got.size)
            assertTrue(rb.got.any { it.contentEquals(photo) }); assertTrue(rb.got.any { it.str() == "short" })
            // delivery receipt comes back the same way
            nb.submit(Envelope.ack(b, Peer(a.signPub, a.boxPub), Rand.bytes(16)))
            delay(500)
            relA.stop(); relB.stop(); scope.cancel()
        }
    }
}
