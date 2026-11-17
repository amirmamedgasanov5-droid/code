package app.orbit.core.net

import app.orbit.core.*
import app.orbit.core.mesh.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Semaphore
import java.net.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Worldwide, serverless: the public BitTorrent mainline DHT is used purely as a phonebook
 * (infohash = SHA1(topic) -> ip:port). Peers then hole-punch UDP to each other and speak a tiny
 * reliable datagram protocol. No server of ours is involved; if two phones are both behind
 * symmetric / carrier-grade NAT the direct path can fail, then the mesh falls back to any
 * other path (relay peers, Bluetooth, LAN).
 */
class InetTransport(
    private val scope: CoroutineScope,
    private val bootstrap: List<Pair<String, Int>> = DEFAULT_BOOTSTRAP,
    private val localPort: Int = 0,
    /** infohashes (20B) we want to be found under */
    private val announceTopics: () -> List<ByteArray>,
    /** infohashes (20B) of people we want to reach */
    private val seekTopics: () -> List<ByteArray>,
    /** how often to re-query the DHT for contacts while we have no links (ms) */
    private val retryMs: Long = 8_000,
) : Transport {
    override val name = "Internet"
    private val _state = MutableStateFlow(TransportState.OFF)
    override val state: StateFlow<TransportState> = _state
    private var listener: LinkListener? = null
    private var sock: DatagramSocket? = null
    private val jobs = mutableListOf<Job>()
    private val myNodeId = Rand.bytes(20)
    private val table = ConcurrentHashMap<String, DNode>()
    private val pending = ConcurrentHashMap<String, CompletableDeferred<Map<String, Any?>?>>()
    private val links = ConcurrentHashMap<String, UdpLink>()
    private val tidCounter = AtomicInteger(Rand.sr.nextInt(60000))
    val port: Int get() = sock?.localPort ?: 0
    val knownNodes: Int get() = table.size

    private class OutPkt(val pkt: ByteArray, var sent: Long, var tries: Int, var rto: Long)
    private class DNode(val id: ByteArray, val addr: InetSocketAddress, var seen: Long)

    // ============================================================ lifecycle
    override fun start(listener: LinkListener) {
        if (sock != null) return
        this.listener = listener; _state.value = TransportState.STARTING
        try { sock = DatagramSocket(localPort).also { it.soTimeout = 0; it.receiveBufferSize = 1 shl 20 } } catch (e: Exception) { _state.value = TransportState.UNAVAILABLE; return }
        jobs += scope.launch(Dispatchers.IO) { recvLoop() }
        jobs += scope.launch(Dispatchers.IO) { timerLoop() }
        jobs += scope.launch(Dispatchers.IO) { dhtLoop() }
        _state.value = TransportState.ON
    }

    override fun stop() {
        jobs.forEach { it.cancel() }; jobs.clear()
        try { sock?.close() } catch (_: Exception) {}; sock = null
        links.values.forEach { it.dead = true; listener?.onLinkDown(it) }; links.clear(); table.clear(); _state.value = TransportState.OFF
    }

    /** Dial a known endpoint (used by DHT results, manual "connect by IP", and tests). */
    fun punch(host: String, port: Int) { val a = InetSocketAddress(host, port); if (!links.containsKey(a.toString())) newLink(a, initiator = true) }

    // ============================================================ receive
    private suspend fun recvLoop() {
        val buf = ByteArray(2048)
        while (currentCoroutineContext().isActive) {
            val s = sock ?: break
            val p = DatagramPacket(buf, buf.size)
            try { s.receive(p) } catch (e: Exception) { if (s.isClosed) break else continue }
            val data = buf.copyOf(p.length)
            val from = InetSocketAddress(p.address, p.port)
            try {
                if (data.isEmpty()) continue
                when (data[0].toInt() and 0xff) {
                    0xA7 -> onPeerPacket(from, data)
                    'd'.code -> onDht(from, data)
                }
            } catch (_: Exception) {}
        }
    }

    @Volatile var testDropRate = 0.0
    val dropped = java.util.concurrent.atomic.AtomicInteger(); val retransmits = java.util.concurrent.atomic.AtomicInteger()
    private fun raw(to: SocketAddress, b: ByteArray) { if (testDropRate > 0 && (b[0].toInt() and 0xff) == 0xA7 && Rand.sr.nextDouble() < testDropRate) { dropped.incrementAndGet(); return }; try { sock?.send(DatagramPacket(b, b.size, to)) } catch (_: Exception) {} }

    // ============================================================ reliable datagram links
    private object T { const val SYN = 0; const val SYNACK = 1; const val DATA = 2; const val ACK = 3; const val PING = 4; const val FIN = 5 }

    private inner class UdpLink(val addr: InetSocketAddress, var id: Int, var established: Boolean) : Link {
        override val linkId = "udp:$addr"
        override val medium = "Internet"
        override val label = addr.address.hostAddress ?: "peer"
        @Volatile var dead = false
        @Volatile var lastRx = System.currentTimeMillis()
        @Volatile var lastTx = System.currentTimeMillis()
        val born = System.currentTimeMillis()
        val window = Semaphore(64)
        val nextSeq = AtomicInteger(0)
        val inflight = ConcurrentHashMap<Int, OutPkt>()
        val rxSeen = HashSet<Int>(); var rxFloor = 0
        val reasm = Reassembler()

        override suspend fun send(frame: ByteArray): Boolean {
            if (dead) return false
            for (chunk in Framer.split(frame, 1100)) {
                var waited = 0
                while (!window.tryAcquire()) { delay(5); if (dead || ++waited > 4000) return false }
                val seq = nextSeq.getAndIncrement()
                val pkt = ByteWriter(chunk.size + 10).u8(0xA7).u8(T.DATA).u32(id.toLong() and 0xffffffffL).u32(seq.toLong()).raw(chunk).toByteArray()
                inflight[seq] = OutPkt(pkt, System.currentTimeMillis(), 0, 450)
                raw(addr, pkt); lastTx = System.currentTimeMillis()
            }
            return true
        }
        override fun close() { if (!dead) { raw(addr, header(T.FIN, id)); kill() } }
        fun kill() { if (dead) return; dead = true; links.remove(addr.toString(), this); if (established) listener?.onLinkDown(this) }
        fun up() { if (!established) { established = true; listener?.onLinkUp(this) } }
    }

    private fun header(type: Int, id: Int) = ByteWriter(8).u8(0xA7).u8(type).u32(id.toLong() and 0xffffffffL).toByteArray()

    private fun newLink(a: InetSocketAddress, initiator: Boolean, id: Int = Rand.sr.nextInt(), established: Boolean = false): UdpLink {
        val l = UdpLink(a, id, established)
        links[a.toString()] = l
        if (established) listener?.onLinkUp(l)
        if (initiator) scope.launch(Dispatchers.IO) {
            // hole punching: keep knocking for 30 s
            var n = 0
            while (!l.established && !l.dead && n++ < 30) { raw(a, header(T.SYN, l.id)); delay(1000) }
            if (!l.established) l.kill()
        }
        return l
    }

    private fun onPeerPacket(from: InetSocketAddress, d: ByteArray) {
        if (d.size < 6) return
        val r = ByteReader(d, 1); val type = r.u8(); val id = r.u32().toInt()
        val key = from.toString()
        var l = links[key]
        when (type) {
            T.SYN -> {
                if (l == null) { l = newLink(from, false, id, true) }
                else if (!l.established) { l.id = minOf(l.id, id); l.up() }
                else if (l.id != id && System.currentTimeMillis() - l.lastRx > 20_000) { l.kill(); l = newLink(from, false, id, true) }
                l.lastRx = System.currentTimeMillis()
                raw(from, header(T.SYNACK, l.id))
            }
            T.SYNACK -> { l ?: return; if (!l.established) { l.id = minOf(l.id, id); l.up() }; l.lastRx = System.currentTimeMillis() }
            T.DATA -> {
                l ?: return; if (id != l.id) return
                l.lastRx = System.currentTimeMillis(); l.up()
                val seq = r.u32().toInt()
                raw(from, ByteWriter(12).u8(0xA7).u8(T.ACK).u32(id.toLong() and 0xffffffffL).u8(1).u32(seq.toLong()).toByteArray())
                val fresh = synchronized(l.rxSeen) {
                    if (seq < l.rxFloor || !l.rxSeen.add(seq)) false else {
                        while (l.rxSeen.remove(l.rxFloor)) l.rxFloor++
                        if (l.rxSeen.size > 4096) { l.rxSeen.clear(); l.rxFloor = seq + 1 }
                        true
                    }
                }
                if (fresh) l.reasm.feed(d.copyOfRange(10, d.size))?.let { listener?.onFrame(l, it) }
            }
            T.ACK -> {
                l ?: return; if (id != l.id) return
                l.lastRx = System.currentTimeMillis()
                val n = r.u8(); repeat(n) { val s = r.u32().toInt(); if (l.inflight.remove(s) != null) l.window.release() }
            }
            T.PING -> { l ?: return; if (id == l.id) l.lastRx = System.currentTimeMillis() }
            T.FIN -> { l ?: return; if (id == l.id) l.kill() }
        }
    }

    private suspend fun timerLoop() {
        while (currentCoroutineContext().isActive) {
            delay(100)
            val t = System.currentTimeMillis()
            for (l in links.values) {
                if (l.dead) continue
                if (l.established) {
                    for ((seq, o) in l.inflight) if (t - o.sent > o.rto) {
                        if (++o.tries > 14) { l.kill(); break }
                        o.sent = t; o.rto = (o.rto * 3 / 2).coerceAtMost(4000); retransmits.incrementAndGet(); raw(l.addr, o.pkt)
                    }
                    if (t - l.lastTx > 12_000) { raw(l.addr, header(T.PING, l.id)); l.lastTx = t }
                    if (t - l.lastRx > 45_000) l.kill()
                }
            }
        }
    }

    // ============================================================ DHT (BEP 5)
    private fun newTid(): ByteArray { val n = tidCounter.incrementAndGet(); return byteArrayOf((n shr 8).toByte(), n.toByte()) }

    private suspend fun query(to: InetSocketAddress, q: String, args: Map<String, Any?>, timeoutMs: Long = 2500): Map<String, Any?>? {
        val tid = newTid(); val key = tid.hex()
        val d = CompletableDeferred<Map<String, Any?>?>(); pending[key] = d
        raw(to, Bencode.encode(mapOf("t" to tid, "y" to "q", "q" to q, "a" to (args + ("id" to myNodeId)))))
        val r = withTimeoutOrNull(timeoutMs) { d.await() }
        pending.remove(key)
        return r
    }

    private fun onDht(from: InetSocketAddress, data: ByteArray) {
        val m = Bencode.decode(data).asMap() ?: return
        val tid = m["t"].asBytes() ?: return
        when (String(m["y"].asBytes() ?: return)) {
            "r" -> {
                val r = m["r"].asMap() ?: return
                r["id"].asBytes()?.takeIf { it.size == 20 }?.let { table[it.hex()] = DNode(it, from, System.currentTimeMillis()) }
                pending[tid.hex()]?.complete(r.plus("_from" to from.toString()))
            }
            "e" -> pending[tid.hex()]?.complete(null)
            "q" -> {
                val a = m["a"].asMap() ?: return
                val id = a["id"].asBytes()?.takeIf { it.size == 20 } ?: return
                table[id.hex()] = DNode(id, from, System.currentTimeMillis())
                val resp = mutableMapOf<String, Any?>("id" to myNodeId)
                when (String(m["q"].asBytes() ?: return)) {
                    "find_node" -> resp["nodes"] = compactNodes(closest(a["target"].asBytes() ?: id, 8))
                    "get_peers" -> { resp["token"] = Rand.bytes(4); resp["nodes"] = compactNodes(closest(a["info_hash"].asBytes() ?: id, 8)) }
                    "announce_peer", "ping" -> {}
                    else -> return
                }
                raw(from, Bencode.encode(mapOf("t" to tid, "y" to "r", "r" to resp)))
            }
        }
    }

    private fun xor(a: ByteArray, b: ByteArray) = ByteArray(20) { (a[it].toInt() xor b[it].toInt()).toByte() }
    private fun cmpDist(target: ByteArray): Comparator<DNode> = Comparator { x, y ->
        val dx = xor(x.id, target); val dy = xor(y.id, target)
        for (i in 0 until 20) { val c = (dx[i].toInt() and 0xff).compareTo(dy[i].toInt() and 0xff); if (c != 0) return@Comparator c }
        0
    }
    private fun closest(target: ByteArray, n: Int) = table.values.sortedWith(cmpDist(target)).take(n)
    private fun compactNodes(l: List<DNode>): ByteArray {
        val w = ByteWriter(l.size * 26)
        for (n in l) { val ip = n.addr.address.address; if (ip.size == 4) w.raw(n.id).raw(ip).u16(n.addr.port) }
        return w.toByteArray()
    }
    private fun parseNodes(b: ByteArray?): List<DNode> {
        if (b == null) return emptyList()
        val out = ArrayList<DNode>()
        var i = 0
        while (i + 26 <= b.size) {
            val id = b.copyOfRange(i, i + 20)
            val ip = InetAddress.getByAddress(b.copyOfRange(i + 20, i + 24))
            val port = ((b[i + 24].toInt() and 0xff) shl 8) or (b[i + 25].toInt() and 0xff)
            if (port > 0) out.add(DNode(id, InetSocketAddress(ip, port), 0))
            i += 26
        }
        return out
    }
    private fun parsePeers(l: Any?): List<InetSocketAddress> {
        val out = ArrayList<InetSocketAddress>()
        for (e in (l as? List<*>) ?: return out) {
            val b = e as? ByteArray ?: continue
            if (b.size != 6) continue
            val port = ((b[4].toInt() and 0xff) shl 8) or (b[5].toInt() and 0xff)
            if (port > 0) out.add(InetSocketAddress(InetAddress.getByAddress(b.copyOfRange(0, 4)), port))
        }
        return out
    }

    private suspend fun bootstrapDht() {
        for ((h, p) in bootstrap) {
            try {
                val a = InetSocketAddress(InetAddress.getByName(h), p)
                query(a, "find_node", mapOf("target" to myNodeId))?.let { r -> parseNodes(r["nodes"].asBytes()).forEach { n -> table.putIfAbsent(n.id.hex(), n) } }
            } catch (_: Exception) {}
        }
        // widen the table a little
        repeat(3) {
            val t = Rand.bytes(20)
            coroutineScope { closest(t, 6).map { n -> async { query(n.addr, "find_node", mapOf("target" to t))?.let { r -> parseNodes(r["nodes"].asBytes()).forEach { x -> table.putIfAbsent(x.id.hex(), x) } } } }.awaitAll() }
        }
        if (table.size > 600) table.values.sortedBy { it.seen }.take(table.size - 400).forEach { table.remove(it.id.hex()) }
    }

    data class LookupResult(val peers: Set<InetSocketAddress>, val tokens: List<Pair<InetSocketAddress, ByteArray>>)

    /** Iterative get_peers. Also returns the closest responders with write tokens (for announce). */
    suspend fun lookup(info: ByteArray): LookupResult {
        val peers = HashSet<InetSocketAddress>(); val asked = HashSet<String>(); val tokens = ArrayList<Pair<InetSocketAddress, ByteArray>>()
        var cands = closest(info, 8)
        if (cands.isEmpty()) cands = bootstrap.mapNotNull { (h, p) -> try { DNode(Rand.bytes(20), InetSocketAddress(InetAddress.getByName(h), p), 0) } catch (e: Exception) { null } }
        repeat(5) {
            val batch = cands.filter { asked.add(it.addr.toString()) }.take(8)
            if (batch.isEmpty()) return@repeat
            val results = coroutineScope { batch.map { n -> async { n to query(n.addr, "get_peers", mapOf("info_hash" to info)) } }.awaitAll() }
            val fresh = ArrayList<DNode>()
            for ((n, r) in results) {
                r ?: continue
                peers += parsePeers(r["values"]); r["token"].asBytes()?.let { tokens += n.addr to it }
                fresh += parseNodes(r["nodes"].asBytes())
            }
            fresh.forEach { table.putIfAbsent(it.id.hex(), it) }
            cands = (cands + fresh).distinctBy { it.addr.toString() }.sortedWith(cmpDist(info)).take(12)
        }
        return LookupResult(peers, tokens.take(8))
    }

    suspend fun announce(info: ByteArray) {
        val r = lookup(info)
        for ((addr, token) in r.tokens) query(addr, "announce_peer", mapOf("info_hash" to info, "port" to port.toLong(), "implied_port" to 1L, "token" to token), 1500)
    }

    private suspend fun dhtLoop() {
        bootstrapDht()
        var lastAnnounce = 0L; var round = 0
        while (currentCoroutineContext().isActive) {
            if (table.isEmpty()) { delay(retryMs); bootstrapDht(); continue }
            val t = System.currentTimeMillis()
            if (t - lastAnnounce > 8 * 60_000) { lastAnnounce = t; for (tp in announceTopics()) try { announce(tp) } catch (_: Exception) {} }
            val seeks = seekTopics()
            if (seeks.isNotEmpty()) {
                val slice = seeks.drop((round * 6) % seeks.size).take(6)
                round++
                coroutineScope { slice.map { tp -> async { try { lookup(tp).peers.forEach { a -> if (!isSelf(a)) punch(a.address.hostAddress ?: return@forEach, a.port) } } catch (_: Exception) {} } }.awaitAll() }
            }
            delay(if (links.isEmpty()) retryMs else retryMs * 5)
            if (round % 30 == 0) bootstrapDht()
        }
    }
    private fun isSelf(a: InetSocketAddress) = a.port == port && (a.address.isLoopbackAddress && false)

    companion object {
        val DEFAULT_BOOTSTRAP = listOf("router.bittorrent.com" to 6881, "router.utorrent.com" to 6881, "dht.transmissionbt.com" to 6881, "dht.libtorrent.org" to 25401)
        fun topicHash(signPub: ByteArray): ByteArray = sha1("orbit.v1/u/".utf8() + signPub)
        fun channelTopic(chanPub: ByteArray): ByteArray = sha1("orbit.v1/c/".utf8() + chanPub)
    }
}
