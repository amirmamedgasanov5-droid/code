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

    private fun waitFor(ms: Long = 60000, c: () -> Boolean) = runBlocking { val t = System.currentTimeMillis(); while (!c() && System.currentTimeMillis() - t < ms) delay(20); assertTrue("timeout", c()) }

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
            waitFor(90000) { rb.got.size == 1 }
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

/** Tiny MQTT 3.1.1 broker (TCP and WebSocket) — enough for CONNECT/SUBSCRIBE/PUBLISH(QoS0/1)/PING + queueing for offline subscribers. */
class FakeMqtt : AutoCloseable {
    private val server = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
    val port get() = server.localPort
    @Volatile private var running = true
    private class Client(val out: java.io.OutputStream, val ws: Boolean) { val topics = java.util.concurrent.CopyOnWriteArraySet<String>() }
    private val clients = java.util.concurrent.CopyOnWriteArrayList<Client>()
    private val queued = ConcurrentHashMap<String, MutableList<ByteArray>>()
    init { Thread { while (running) { val s = try { server.accept() } catch (e: Exception) { break }; Thread { handle(s) }.also { it.isDaemon = true }.start() } }.also { it.isDaemon = true }.start() }

    private fun varlen(n: Int): ByteArray { var x = n; val o = java.io.ByteArrayOutputStream(); do { var b = x % 128; x /= 128; if (x > 0) b = b or 128; o.write(b) } while (x > 0); return o.toByteArray() }
    private fun send(c: Client, first: Int, body: ByteArray) {
        val pkt = byteArrayOf(first.toByte()) + varlen(body.size) + body
        synchronized(c.out) {
            if (!c.ws) c.out.write(pkt) else { val w = java.io.ByteArrayOutputStream(); w.write(0x82); if (pkt.size < 126) w.write(pkt.size) else if (pkt.size < 65536) { w.write(126); w.write(pkt.size shr 8); w.write(pkt.size) } else { w.write(127); for (i in 7 downTo 0) w.write((pkt.size.toLong() shr (8 * i)).toInt()) }; w.write(pkt); c.out.write(w.toByteArray()) }
            c.out.flush()
        }
    }
    private fun deliver(c: Client, topic: String, payload: ByteArray) { val t = topic.toByteArray(); send(c, 0x30, byteArrayOf((t.size shr 8).toByte(), t.size.toByte()) + t + payload) }

    private fun handle(sock: Socket) {
        try {
            val inp = sock.getInputStream().buffered(); val out = sock.getOutputStream()
            inp.mark(4); val first4 = ByteArray(4); inp.read(first4); inp.reset()
            val ws = String(first4) == "GET "
            if (ws) {
                val head = StringBuilder(); var l4 = 0
                while (true) { val ch = inp.read(); head.append(ch.toChar()); l4 = (l4 shl 8) or ch; if (l4 == 0x0d0a0d0a) break }
                val key = Regex("Sec-WebSocket-Key: (.*)\r\n", RegexOption.IGNORE_CASE).find(head)!!.groupValues[1].trim()
                val acc = java.util.Base64.getEncoder().encodeToString(java.security.MessageDigest.getInstance("SHA-1").digest((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").toByteArray()))
                out.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: $acc\r\nSec-WebSocket-Protocol: mqtt\r\n\r\n".toByteArray()); out.flush()
            }
            val me = Client(out, ws); clients.add(me)
            // byte source: raw, or unmasked websocket payloads
            var left = 0
            fun rb(): Int {
                if (!ws) return inp.read()
                while (left == 0) { val h = inp.read(); if (h < 0) return -1; val op = h and 15; var l = inp.read() and 127; if (l == 126) l = (inp.read() shl 8) or inp.read() else if (l == 127) { l = 0; repeat(8) { l = (l shl 8) or inp.read() } }
                    val m = ByteArray(4); inp.read(m); mask = m; mi = 0; if (op == 8) return -1; left = l }
                val b = inp.read() xor mask[mi++ % 4].toInt(); left--; return b and 0xff
            }
            while (running) {
                val b0 = rb(); if (b0 < 0) break
                var mult = 1; var len = 0; while (true) { val b = rb(); len += (b and 127) * mult; if (b and 128 == 0) break; mult *= 128 }
                val body = ByteArray(len); for (i in 0 until len) body[i] = rb().toByte()
                when (b0 shr 4) {
                    1 -> send(me, 0x20, byteArrayOf(0, 0))
                    8 -> { var off = 2; val ack = java.io.ByteArrayOutputStream(); ack.write(body, 0, 2)
                        while (off < body.size) { val tl = ((body[off].toInt() and 0xff) shl 8) or (body[off + 1].toInt() and 0xff); val t = String(body, off + 2, tl); off += 2 + tl + 1; me.topics.add(t); ack.write(1)
                            queued.remove(t)?.forEach { deliver(me, t, it) } }       // persistent-session style catch-up
                        send(me, 0x90, ack.toByteArray()) }
                    3 -> { val qos = (b0 shr 1) and 3; val tl = ((body[0].toInt() and 0xff) shl 8) or (body[1].toInt() and 0xff); val t = String(body, 2, tl); var off = 2 + tl
                        if (qos > 0) { send(me, 0x40, body.copyOfRange(off, off + 2)); off += 2 }
                        val payload = body.copyOfRange(off, body.size)
                        val subs = clients.filter { it !== me && t in it.topics }
                        if (subs.isEmpty()) queued.getOrPut(t) { java.util.concurrent.CopyOnWriteArrayList() }.add(payload) else subs.forEach { deliver(it, t, payload) } }
                    12 -> send(me, 0xD0, ByteArray(0))
                }
            }
        } catch (e: Exception) { }
        try { sock.close() } catch (_: Exception) {}
    }
    private var mask = ByteArray(4); private var mi = 0
    override fun close() { running = false; try { server.close() } catch (_: Exception) {} }
}

class MqttRelayTest {
    private fun run(schemeA: String, schemeB: String) = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        FakeMqtt().use { br ->
            val dead = ServerSocket(0).use { it.localPort }
            val a = Identity.generate(); val b = Identity.generate()
            val na = MeshNode(a, MemoryStore(), scope); val nb = MeshNode(b, MemoryStore(), scope)
            val rb = Recorder(b, listOf(Tags.user(b.signPub))); nb.handler = rb; na.handler = Recorder(a, emptyList())
            fun eps(sc: String) = listOf("tcp://127.0.0.1:$dead", "$sc://127.0.0.1:${br.port}/mqtt")
            val relA = MqttRelay(scope, eps(schemeA), { listOf(Tags.user(a.signPub)) }, { na.ingestExternal(it) }, "orbit-a")
            val relB = MqttRelay(scope, eps(schemeB), { listOf(Tags.user(b.signPub)) }, { nb.ingestExternal(it) }, "orbit-b")
            na.onLocalSubmit = { relA.publish(it) }
            relA.start()
            val t0 = System.currentTimeMillis(); while (!relA.online.value && System.currentTimeMillis() - t0 < 8000) delay(20)
            val photo = Rand.bytes(150_000)                                  // a whole photo in ONE message, no chunking
            na.submit(Envelope.direct(a, Peer(b.signPub, b.boxPub), photo))
            delay(400)
            relB.start()                                                    // B was offline: the broker queued it
            val t = System.currentTimeMillis(); while (rb.got.isEmpty() && System.currentTimeMillis() - t < 15000) delay(20)
            assertEquals(1, rb.got.size); assertArrayEquals(photo, rb.got[0])
            assertTrue("dead broker reported", relA.lastErrors().contains("127.0.0.1:$dead"))
            relA.stop(); relB.stop(); scope.cancel()
        }
    }
    @Test fun tcpBrokerDeliversPhotoToOfflineRecipientDespiteDeadBroker() = run("tcp", "tcp")
    @Test fun webSocketBrokerWorksToo() = run("ws", "ws")
    @Test fun mixedTransportsInterop() = run("tcp", "ws")
}


/** Fake Firebase Realtime Database: POST push, DELETE child, GET with Accept: text/event-stream (SSE put events). */
class FakeRtdb : AutoCloseable {
    private val server = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
    val port get() = server.localPort
    @Volatile private var running = true
    val store = ConcurrentHashMap<String, ConcurrentHashMap<String, String>>()   // topic -> id -> json
    private val n = java.util.concurrent.atomic.AtomicInteger()
    init { Thread { while (running) { val s = try { server.accept() } catch (e: Exception) { break }; Thread { handle(s) }.also { it.isDaemon = true }.start() } }.also { it.isDaemon = true }.start() }
    private fun handle(sock: Socket) {
        try {
            val inp = sock.getInputStream().buffered(); val out = sock.getOutputStream()
            fun line(): String { val sb = StringBuilder(); while (true) { val c = inp.read(); if (c < 0 || c == '\n'.code) break; if (c != '\r'.code) sb.append(c.toChar()) }; return sb.toString() }
            val req = line().split(" "); var len = 0
            while (true) { val h = line(); if (h.isEmpty()) break; if (h.lowercase().startsWith("content-length:")) len = h.substringAfter(":").trim().toInt() }
            val parts = req[1].substringBefore("?").trim('/').removeSuffix(".json").split("/")   // orbit/<topic>[/<id>]
            val topic = parts[1]
            when (req[0]) {
                "POST" -> { val body = ByteArray(len); var k = 0; while (k < len) { val r = inp.read(body, k, len - k); if (r < 0) break; k += r }
                    val id = "-N" + n.incrementAndGet(); store.getOrPut(topic) { ConcurrentHashMap() }[id] = String(body)
                    val resp = "{\"name\":\"$id\"}"; out.write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${resp.length}\r\nConnection: close\r\n\r\n$resp".toByteArray()); out.flush(); sock.close() }
                "DELETE" -> { if (parts.size > 2) store[topic]?.remove(parts[2]); out.write("HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\nnull".toByteArray()); out.flush(); sock.close() }
                else -> {
                    out.write("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n".toByteArray())
                    val snap = store[topic]?.toMap() ?: emptyMap()
                    val data = if (snap.isEmpty()) "null" else snap.entries.joinToString(",", "{", "}") { "\"${it.key}\":${it.value}" }
                    out.write("event: put\ndata: {\"path\":\"/\",\"data\":$data}\n\n".toByteArray()); out.flush()
                    val seen = HashSet(snap.keys)
                    while (running) {
                        store[topic]?.forEach { (id, json) -> if (seen.add(id)) { out.write("event: put\ndata: {\"path\":\"/$id\",\"data\":$json}\n\n".toByteArray()); out.flush() } }
                        Thread.sleep(30)
                    }
                }
            }
        } catch (e: Exception) { try { sock.close() } catch (_: Exception) {} }
    }
    override fun close() { running = false; try { server.close() } catch (_: Exception) {} }
}

class FirebaseRelayTest {
    @Test fun photoReachesOfflineRecipientThroughRealtimeDatabaseAndIsCleanedUp() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        FakeRtdb().use { db ->
            val a = Identity.generate(); val b = Identity.generate()
            val na = MeshNode(a, MemoryStore(), scope); val nb = MeshNode(b, MemoryStore(), scope)
            val rb = Recorder(b, listOf(Tags.user(b.signPub))); nb.handler = rb; na.handler = Recorder(a, emptyList())
            val base = "http://127.0.0.1:${db.port}"
            val fa = FirebaseRelay(scope, listOf(base), { listOf(Tags.user(a.signPub)) }, Tags.user(a.signPub), { na.ingestExternal(it) })
            val fb = FirebaseRelay(scope, listOf(base), { listOf(Tags.user(b.signPub)) }, Tags.user(b.signPub), { nb.ingestExternal(it) })
            na.onLocalSubmit = { fa.publish(it) }
            fa.start()
            val photo = Rand.bytes(150_000)
            na.submit(Envelope.direct(a, Peer(b.signPub, b.boxPub), photo))
            delay(500)
            assertEquals("stored for the offline recipient", 1, db.store[Tags.user(b.signPub).hex()]?.size)
            fb.start()                                                       // B comes online later and catches up
            val t = System.currentTimeMillis(); while (rb.got.isEmpty() && System.currentTimeMillis() - t < 15000) delay(20)
            assertEquals(1, rb.got.size); assertArrayEquals(photo, rb.got[0])
            val t2 = System.currentTimeMillis(); while ((db.store[Tags.user(b.signPub).hex()]?.size ?: 0) > 0 && System.currentTimeMillis() - t2 < 5000) delay(20)
            assertEquals("taken messages are deleted", 0, db.store[Tags.user(b.signPub).hex()]?.size ?: 0)
            fa.stop(); fb.stop(); scope.cancel()
        }
    }
    @Test fun firebaseLinesAreRecognised() {
        assertTrue(FirebaseRelay.isFirebase("https://my-app-default-rtdb.firebaseio.com"))
        assertTrue(FirebaseRelay.isFirebase("https://my-app-default-rtdb.europe-west1.firebasedatabase.app"))
        assertFalse(FirebaseRelay.isFirebase("https://ntfy.sh"))
    }
}
