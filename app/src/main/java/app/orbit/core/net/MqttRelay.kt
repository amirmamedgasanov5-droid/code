package app.orbit.core.net

import app.orbit.core.*
import app.orbit.core.mesh.Envelope
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.*
import java.net.InetSocketAddress
import java.net.Socket
import java.util.Base64
import javax.net.ssl.SSLSocketFactory

/**
 * Second kind of relay: public MQTT brokers (HiveMQ, EMQX, Mosquitto…). Same idea as the ntfy relay (opaque, already
 * end-to-end encrypted envelopes in a topic named after the recipient's routing tag) but a different protocol and
 * different hosts/ports, so a network that blocks one usually lets another through. Whole envelopes fit in one MQTT
 * message (no chunking, no 1-request-per-5-seconds limit). Supports tcp://, tls://, ws:// and wss:// endpoints.
 * A persistent session + QoS 1 lets the broker queue messages while the phone is offline (broker-dependent).
 */
class MqttRelay(
    private val scope: CoroutineScope,
    endpoints: List<String>,
    private val tags: () -> List<ByteArray>,
    private val onEnvelope: suspend (Envelope) -> Unit,
    private val clientId: String,
    private val maxEnvelope: Int = 200_000,
) {
    class Ep(val url: String) {
        val scheme = url.substringBefore("://"); private val rest = url.substringAfter("://")
        val host = rest.substringBefore(":").substringBefore("/")
        val port = rest.substringAfter(":", "").substringBefore("/").toIntOrNull() ?: when (scheme) { "tls" -> 8883; "wss" -> 443; "ws" -> 80; else -> 1883 }
        val path = "/" + rest.substringAfter("/", "mqtt")
        @Volatile var online = false; @Volatile var lastError = ""; @Volatile var pausedUntil = 0L; @Volatile var sent = 0
        @Volatile internal var out: OutputStream? = null
        internal val subscribed = HashSet<String>()
        val name get() = "$host:$port ($scheme)"
    }
    val servers: List<Ep> = endpoints.map { it.trim() }.filter { Regex("^(tcp|tls|ws|wss)://.+").matches(it) }.distinct().map { Ep(it) }
    private val jobs = mutableListOf<Job>()
    private val _online = MutableStateFlow(false); val online: StateFlow<Boolean> = _online
    @Volatile var published = 0; @Volatile var received = 0
    private val pid = java.util.concurrent.atomic.AtomicInteger(1)
    val healthy: Boolean get() = servers.any { it.online }
    private fun refresh() { _online.value = servers.any { it.online } }
    private fun topic(tag: ByteArray) = "orbit1/" + tag.hex()

    fun start() {
        if (jobs.isNotEmpty()) return
        for (s in servers) jobs += scope.launch(Dispatchers.IO) {
            var backoff = 2_000L
            delay((servers.indexOf(s) * 700L))                                    // do not open every connection in the same instant
            while (isActive) {
                val began = System.currentTimeMillis()
                try { session(s); backoff = 2_000L }
                catch (e: CancellationException) { throw e }
                catch (e: Exception) {
                    s.online = false; s.out = null; refresh(); s.lastError = (e.javaClass.simpleName + ": " + (e.message ?: "")).take(110)
                    val m = e.message ?: ""
                    // Brokers ban clients that reconnect too fast ("flapping"): connect refused (code 5) = banned/not authorized.
                    val wait = when {
                        m.contains("connect refused") -> 10 * 60_000L
                        e is java.net.UnknownHostException || e is javax.net.ssl.SSLException -> 10 * 60_000L
                        e is java.net.SocketTimeoutException || e is java.net.ConnectException -> maxOf(backoff, 30_000L)
                        System.currentTimeMillis() - began > 60_000 -> 3_000L           // it was fine for a while: quick comeback
                        else -> backoff
                    }
                    delay(wait + (Math.random() * 1000).toLong()); backoff = (backoff * 2).coerceAtMost(60_000)
                }
            }
        }
    }
    fun stop() { jobs.forEach { it.cancel() }; jobs.clear(); servers.forEach { it.online = false; it.out = null }; refresh() }
    fun kick() { stop(); start() }

    // ------------------------------------------------------------------ wire helpers
    private fun varlen(n: Int): ByteArray { var x = n; val o = ByteArrayOutputStream(); do { var b = x % 128; x /= 128; if (x > 0) b = b or 128; o.write(b) } while (x > 0); return o.toByteArray() }
    private fun str(s: String): ByteArray { val b = s.toByteArray(); return byteArrayOf((b.size shr 8).toByte(), b.size.toByte()) + b }
    private fun packet(first: Int, body: ByteArray) = byteArrayOf(first.toByte()) + varlen(body.size) + body
    private fun u16(v: Int) = byteArrayOf((v shr 8).toByte(), v.toByte())

    private fun readPacket(inp: InputStream): Pair<Int, ByteArray> {
        val first = inp.read(); if (first < 0) throw EOFException("closed by broker")
        var mult = 1; var len = 0
        while (true) { val b = inp.read(); if (b < 0) throw EOFException(); len += (b and 127) * mult; if (b and 128 == 0) break; mult *= 128; if (mult > 128 * 128 * 128) throw IOException("bad length") }
        val body = ByteArray(len); var n = 0
        while (n < len) { val r = inp.read(body, n, len - n); if (r < 0) throw EOFException(); n += r }
        return first to body
    }

    private fun write(s: Ep, bytes: ByteArray) { val o = s.out ?: throw IOException("not connected"); synchronized(o) { o.write(bytes); o.flush() } }

    // ------------------------------------------------------------------ one connection
    private suspend fun session(s: Ep) = withContext(Dispatchers.IO) {
        val sock = openSocket(s)
        try {
            val (inp, out) = if (s.scheme == "ws" || s.scheme == "wss") wsHandshake(sock, s) else sock.getInputStream().buffered() to sock.getOutputStream()
            s.out = out; s.subscribed.clear()
            sock.soTimeout = 75_000
            // CONNECT: MQTT 3.1.1, persistent session (clean=0), keepalive 30 s
            write(s, packet(0x10, str("MQTT") + byteArrayOf(4, 0) + u16(30) + str(clientId + "-" + Integer.toHexString(s.url.hashCode()))))
            val (t, b) = readPacket(inp)
            if (t shr 4 != 2 || b.size < 2 || b[1].toInt() != 0) throw IOException("connect refused (code ${b.getOrNull(1)})")
            s.online = true; s.lastError = ""; refresh()
            val ticker = launch {
                while (isActive) {
                    val want = tags().map { topic(it) }.distinct().take(40).filter { it !in s.subscribed }
                    if (want.isNotEmpty()) { write(s, packet(0x82, u16(pid.incrementAndGet() and 0xffff) + want.fold(ByteArray(0)) { a, x -> a + str(x) + byteArrayOf(1) })); s.subscribed.addAll(want) }
                    delay(if (want.isEmpty()) 15_000 else 500)
                    if (System.currentTimeMillis() % 20_000 < 15_500) try { write(s, byteArrayOf(0xC0.toByte(), 0)) } catch (_: Exception) {}
                }
            }
            try {
                while (isActive) {
                    val (type, body) = readPacket(inp)
                    if (type shr 4 == 3) {                                   // PUBLISH
                        val qos = (type shr 1) and 3
                        val tl = ((body[0].toInt() and 0xff) shl 8) or (body[1].toInt() and 0xff)
                        var off = 2 + tl
                        if (qos > 0) { write(s, packet(0x40, body.copyOfRange(off, off + 2))); off += 2 }   // PUBACK
                        val env = Envelope.decode(body.copyOfRange(off, body.size)) ?: continue
                        received++
                        try { onEnvelope(env) } catch (_: Exception) {}
                    }
                }
            } finally { ticker.cancel() }
        } finally { s.online = false; s.out = null; refresh(); try { sock.close() } catch (_: Exception) {} }
    }

    private fun openSocket(s: Ep): Socket {
        val raw = Socket(); raw.tcpNoDelay = true; raw.keepAlive = true
        raw.connect(InetSocketAddress(s.host, s.port), 8_000)
        if (s.scheme == "tls" || s.scheme == "wss") {
            val ssl = (SSLSocketFactory.getDefault() as SSLSocketFactory).createSocket(raw, s.host, s.port, true) as javax.net.ssl.SSLSocket
            ssl.soTimeout = 10_000; ssl.startHandshake(); return ssl
        }
        raw.soTimeout = 10_000; return raw
    }

    // ------------------------------------------------------------------ minimal RFC 6455 client (binary frames only)
    private fun wsHandshake(sock: Socket, s: Ep): Pair<InputStream, OutputStream> {
        val key = Base64.getEncoder().encodeToString(Rand.bytes(16))
        val rawOut = sock.getOutputStream(); val rawIn = sock.getInputStream().buffered()
        rawOut.write(("GET ${s.path} HTTP/1.1\r\nHost: ${s.host}:${s.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: $key\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: mqtt\r\n\r\n").toByteArray()); rawOut.flush()
        val head = StringBuilder(); var last4 = 0
        while (true) { val c = rawIn.read(); if (c < 0) throw EOFException("closed during websocket handshake"); head.append(c.toChar()); last4 = (last4 shl 8) or c; if (last4 == 0x0d0a0d0a) break; if (head.length > 8192) throw IOException("bad handshake") }
        if (!head.startsWith("HTTP/1.1 101")) throw IOException("websocket upgrade refused: " + head.lineSequence().first().take(40))
        val input = object : InputStream() {
            var left = 0
            override fun read(): Int { val b = ByteArray(1); return if (read(b, 0, 1) < 0) -1 else b[0].toInt() and 0xff }
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                while (left == 0) {
                    val h1 = rawIn.read(); if (h1 < 0) return -1
                    val op = h1 and 0x0f; var l = rawIn.read() and 0x7f
                    if (l == 126) l = (rawIn.read() shl 8) or rawIn.read() else if (l == 127) { l = 0; repeat(8) { l = (l shl 8) or rawIn.read() } }
                    if (op == 8) return -1
                    if (op == 9 || op == 10) { val p = ByteArray(l); var n = 0; while (n < l) n += rawIn.read(p, n, l - n); if (op == 9) wsSend(rawOut, 10, p); continue }
                    left = l
                }
                val r = rawIn.read(b, off, minOf(len, left)); if (r > 0) left -= r; return r
            }
        }
        val output = object : OutputStream() {
            override fun write(b: Int) { write(byteArrayOf(b.toByte())) }
            override fun write(b: ByteArray, off: Int, len: Int) { wsSend(rawOut, 2, b.copyOfRange(off, off + len)) }
        }
        return input to output
    }
    private fun wsSend(o: OutputStream, op: Int, p: ByteArray) {
        val mask = Rand.bytes(4); val w = ByteArrayOutputStream(p.size + 14)
        w.write(0x80 or op)
        when { p.size < 126 -> w.write(0x80 or p.size); p.size < 65536 -> { w.write(0x80 or 126); w.write(p.size shr 8); w.write(p.size) }; else -> { w.write(0x80 or 127); for (i in 7 downTo 0) w.write((p.size.toLong() shr (8 * i)).toInt()) } }
        w.write(mask); for (i in p.indices) w.write(p[i].toInt() xor mask[i % 4].toInt())
        synchronized(o) { o.write(w.toByteArray()); o.flush() }
    }

    // ------------------------------------------------------------------ publish
    fun publish(e: Envelope) {
        val bytes = e.encode(); if (bytes.size > maxEnvelope) return
        val t = topic(e.tag)
        val id = (pid.incrementAndGet() and 0xfffe) + 1
        val pkt = packet(0x32, str(t) + u16(id) + bytes)
        scope.launch(Dispatchers.IO) {
            var any = false
            for (s in servers) {
                // a broker that is not connected right now cannot take it; the persistent QoS-1 session + normal retry cover the rest
                try { write(s, pkt); s.sent++; any = true } catch (_: Exception) {}
            }
            if (any) published++
        }
    }
    fun lastErrors(): String = servers.filter { it.lastError.isNotEmpty() }.joinToString("\n") { "${it.name}: ${it.lastError}" }
}
