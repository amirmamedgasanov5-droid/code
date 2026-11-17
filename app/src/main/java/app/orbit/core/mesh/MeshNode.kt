package app.orbit.core.mesh

import app.orbit.core.*
import app.orbit.core.crypto.*
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

object FrameType {
    const val HELLO = 1; const val INV = 2; const val WANT = 3; const val ENV = 4
    const val PING = 5; const val LIVE = 6; const val PEX = 7
}

/** Persistence for envelopes carried on behalf of the whole network. */
interface EnvelopeStore {
    fun put(e: Envelope)
    fun get(idHex: String): Envelope?
    fun remove(idHex: String)
    fun ids(limit: Int): List<ByteArray>
    fun count(): Int
    fun purge(now: Long): Int
    fun trim(max: Int)
}

class MemoryStore : EnvelopeStore {
    private val m = LinkedHashMap<String, Envelope>()
    @Synchronized override fun put(e: Envelope) { m[e.idHex] = e }
    @Synchronized override fun get(idHex: String) = m[idHex]
    @Synchronized override fun remove(idHex: String) { m.remove(idHex) }
    @Synchronized override fun ids(limit: Int) = m.values.take(limit).map { it.id }
    @Synchronized override fun count() = m.size
    @Synchronized override fun purge(now: Long): Int { val dead = m.values.filter { it.expires < now }.map { it.idHex }; dead.forEach { m.remove(it) }; return dead.size }
    @Synchronized override fun trim(max: Int) { while (m.size > max) m.remove(m.keys.first()) }
}

data class PeerInfo(val peerId: String, val signPub: ByteArray, val boxPub: ByteArray, val media: Set<String>, val since: Long, val labels: List<String>)

interface MeshHandler {
    /** Fast check: is this routing tag one we read (my user tag, my groups, my channels)? */
    fun isMine(tag: ByteArray): Boolean
    /**
     * Called once per new envelope. Return true when the envelope is addressed ONLY to us
     * (so there is no point carrying it further).
     */
    suspend fun onEnvelope(e: Envelope, via: Peer?): Boolean
    fun onLive(from: Peer?, frame: ByteArray, link: Link) {}
    fun onPeerUp(peer: Peer) {}
    fun onPeerDown(peer: Peer) {}
}

class MeshNode(
    private val me: Identity,
    private val store: EnvelopeStore,
    private val scope: CoroutineScope,
    private val maxStore: Int = 6000,
    private val maxHops: Int = 64,
) : LinkListener {
    var handler: MeshHandler? = null
    /** Called for every envelope created on this device (used by the optional cloud relay). */
    var onLocalSubmit: ((Envelope) -> Unit)? = null

    private class LS(val link: Link) {
        @Volatile var peer: Peer? = null
        @Volatile var since = now()
        val has: MutableSet<Long> = ConcurrentHashMap.newKeySet()
        val q = Channel<ByteArray>(Channel.UNLIMITED)
        /** inbound control/envelope frames are handled strictly in arrival order per link */
        val inbox = Channel<ByteArray>(Channel.UNLIMITED)
        val queued = AtomicInteger(0)
        var job: Job? = null
        var helloSent = false
    }

    private val links = ConcurrentHashMap<String, LS>()
    private val seen = object : LinkedHashMap<Long, Boolean>(1024, 0.75f, false) {
        override fun removeEldestEntry(e: MutableMap.MutableEntry<Long, Boolean>?) = size > 60_000
    }
    private val tombstones = ConcurrentHashMap.newKeySet<Long>()

    private val _peers = MutableStateFlow<List<PeerInfo>>(emptyList())
    val peers: StateFlow<List<PeerInfo>> = _peers
    private val _linkCount = MutableStateFlow(0)
    val linkCount: StateFlow<Int> = _linkCount
    private val _stored = MutableStateFlow(0)
    val stored: StateFlow<Int> = _stored
    val relayed = AtomicLong(); val received = AtomicLong(); val sent = AtomicLong()
    private val _counters = MutableStateFlow(Triple(0L, 0L, 0L))
    val counters: StateFlow<Triple<Long, Long, Long>> = _counters

    init {
        scope.launch {
            while (isActive) {
                delay(60_000)
                store.purge(now()); _stored.value = store.count()
            }
        }
    }

    // ------------------------------------------------------------------ API for the engine
    /** Inject a locally created envelope: store it, push to every neighbour. */
    suspend fun submit(e: Envelope) {
        synchronized(seen) { seen[e.idKey] = true }
        sent.incrementAndGet()
        store.put(e); store.trim(maxStore); _stored.value = store.count()
        val target = linkToTag(e.tag)
        if (target != null) { target.enqueue(frameEnv(e)); target.has.add(e.idKey) }
        for (ls in links.values) if (ls !== target && ls.peer != null && ls.has.add(e.idKey)) ls.enqueue(frameEnv(e))
        publishCounters()
        try { onLocalSubmit?.invoke(e) } catch (_: Exception) {}
    }

    private val externalLink = object : Link {
        override val linkId = "relay"; override val medium = "Cloud relay"; override val label = "relay"
        override suspend fun send(frame: ByteArray) = false
        override fun close() {}
    }
    private val externalState by lazy { LS(externalLink) }

    /** Envelope that arrived through a non-link path (cloud relay). Same pipeline as a neighbour's. */
    suspend fun ingestExternal(e: Envelope) { received.incrementAndGet(); ingest(e, externalState) }

    fun isConnected(peerId: String) = links.values.any { it.peer?.id == peerId }
    fun linksTo(peerId: String): List<Link> = links.values.filter { it.peer?.id == peerId }.map { it.link }

    /** Unreliable direct frame (live audio, typing...). Returns false if nobody is reachable. */
    fun sendLive(peerId: String, frame: ByteArray): Boolean {
        val ls = links.values.firstOrNull { it.peer?.id == peerId } ?: return false
        if (ls.queued.get() > 40) return true // congested: drop quietly, audio is perishable
        ls.enqueue(byteArrayOf(FrameType.LIVE.toByte()) + frame); return true
    }
    fun broadcastLive(frame: ByteArray, except: String? = null) {
        for (ls in links.values) { val p = ls.peer ?: continue; if (p.id != except) sendLive(p.id, frame) }
    }

    fun forget(idHex: String) { store.remove(idHex) ; _stored.value = store.count() }

    /** Ask every neighbour what it has: used after we gain a new group key / channel. */
    fun resync() { for (ls in links.values) if (ls.peer != null) sendInv(ls) }

    // ------------------------------------------------------------------ LinkListener
    override fun onLinkUp(link: Link) {
        val ls = LS(link)
        links[link.linkId]?.let { it.job?.cancel() }
        links[link.linkId] = ls
        ls.job = scope.launch(Dispatchers.IO) {
            try {
                for (f in ls.q) { ls.queued.decrementAndGet(); if (!link.send(f)) break }
            } catch (_: CancellationException) {} catch (_: Exception) {}
        }
        scope.launch(Dispatchers.Default) {
            for (f in ls.inbox) { try { handleFrame(ls, f) } catch (e: Exception) { /* malformed frame from neighbour: ignore */ } }
        }
        _linkCount.value = links.size
        ls.enqueue(helloFrame()); ls.helloSent = true
    }

    override fun onLinkDown(link: Link) {
        val ls = links.remove(link.linkId) ?: return
        ls.job?.cancel(); ls.q.close(); ls.inbox.close()
        _linkCount.value = links.size
        publishPeers()
        ls.peer?.let { p -> if (!isConnected(p.id)) handler?.onPeerDown(p) }
    }

    override fun onFrame(link: Link, frame: ByteArray) {
        val ls = links[link.linkId] ?: return
        if (frame.isEmpty()) return
        if (frame[0].toInt() == FrameType.LIVE) scope.launch(Dispatchers.Default) { try { handleFrame(ls, frame) } catch (_: Exception) {} }  // perishable audio: never queue behind slow work
        else ls.inbox.trySend(frame)
    }

    // ------------------------------------------------------------------ protocol
    private suspend fun handleFrame(ls: LS, f: ByteArray) {
        val r = ByteReader(f, 1)
        when (f[0].toInt()) {
            FrameType.HELLO -> {
                val ver = r.u8(); val sp = r.raw(32); val bp = r.raw(32); val ts = r.i64(); val nonce = r.raw(8); val sig = r.raw(64)
                if (ver != 1) return
                val body = ByteWriter().raw("orbit.hello".utf8()).raw(sp).raw(bp).i64(ts).raw(nonce).toByteArray()
                if (!Sig.verify(sp, body, sig)) return
                if (sp.contentEquals(me.signPub)) { ls.link.close(); return } // talked to ourselves
                val peer = Peer(sp, bp)
                val first = !isConnected(peer.id)
                ls.peer = peer
                publishPeers()
                if (first) handler?.onPeerUp(peer)
                sendInv(ls)
            }
            FrameType.INV -> {
                if (ls.peer == null) return
                val n = r.varint().toInt()
                val want = ByteWriter()
                var wanted = 0
                repeat(minOf(n, 6000)) {
                    val k = r.i64()
                    ls.has.add(k)
                    val isSeen = synchronized(seen) { seen.containsKey(k) }
                    if (!isSeen && !tombstones.contains(k) && wanted < 400) { want.i64(k); wanted++ }
                }
                if (wanted > 0) ls.enqueue(byteArrayOf(FrameType.WANT.toByte()) + want.toByteArray())
            }
            FrameType.WANT -> {
                if (ls.peer == null) return
                val rem = r.remaining / 8
                val wantKeys = HashSet<Long>(); repeat(rem) { wantKeys.add(r.i64()) }
                if (wantKeys.isEmpty()) return
                for (id in store.ids(maxStore)) {
                    val k = ByteReader(id).i64()
                    if (k in wantKeys) store.get(id.hex())?.let { e -> if (e.expires > now()) { ls.has.add(k); ls.enqueue(frameEnv(e)) } }
                }
            }
            FrameType.ENV -> {
                val e = Envelope.decode(f.copyOfRange(1, f.size)) ?: return
                received.incrementAndGet(); publishCounters()
                ingest(e, ls)
            }
            FrameType.LIVE -> handler?.onLive(ls.peer, f.copyOfRange(1, f.size), ls.link)
            FrameType.PING -> {}
        }
    }

    private suspend fun ingest(e: Envelope, from: LS) {
        val k = e.idKey
        from.has.add(k)
        if (e.expires < now() || e.created > now() + 3600_000L * 24) return
        if (tombstones.contains(k)) return
        val fresh = synchronized(seen) { if (seen.containsKey(k)) false else { seen[k] = true; true } }
        if (!fresh) return
        if (e.kind == Kind.ACK && e.refId != null) {
            val rk = ByteReader(e.refId).i64()
            tombstones.add(rk); store.remove(e.refId.hex())
            if (tombstones.size > 40_000) tombstones.clear()
        }
        e.hops++
        val mine = handler?.isMine(e.tag) == true
        val onlyUs = if (mine) handler!!.onEnvelope(e, from.peer) else false
        if (onlyUs) return
        // carry & forward
        if (e.hops >= maxHops) return
        store.put(e); store.trim(maxStore); _stored.value = store.count()
        val dst = linkToTag(e.tag)
        for (ls in links.values) {
            if (ls === from || ls.peer == null) continue
            if (dst != null && ls !== dst && e.kind == Kind.DIRECT) continue // known direct route: don't spray DMs
            if (ls.has.add(k)) { ls.enqueue(frameEnv(e)); relayed.incrementAndGet() }
        }
        publishCounters()
    }

    private fun linkToTag(tag: ByteArray): LS? = links.values.firstOrNull { it.peer?.tag?.contentEquals(tag) == true }

    private fun sendInv(ls: LS) {
        val ids = store.ids(4000)
        val w = ByteWriter(ids.size * 8 + 8)
        val ks = ids.map { ByteReader(it).i64() }.filter { !ls.has.contains(it) }
        w.varint(ks.size.toLong()); ks.forEach { w.i64(it) }
        ls.enqueue(byteArrayOf(FrameType.INV.toByte()) + w.toByteArray())
    }

    private fun LS.enqueue(frame: ByteArray) { queued.incrementAndGet(); q.trySend(frame) }
    private fun frameEnv(e: Envelope) = byteArrayOf(FrameType.ENV.toByte()) + e.encode()

    private fun helloFrame(): ByteArray {
        val ts = now(); val nonce = Rand.bytes(8)
        val body = ByteWriter().raw("orbit.hello".utf8()).raw(me.signPub).raw(me.boxPub).i64(ts).raw(nonce).toByteArray()
        return ByteWriter(200).u8(FrameType.HELLO).u8(1).raw(me.signPub).raw(me.boxPub).i64(ts).raw(nonce).raw(me.sign(body)).toByteArray()
    }

    private fun publishPeers() {
        val byPeer = links.values.mapNotNull { ls -> ls.peer?.let { it to ls } }.groupBy { it.first.id }
        _peers.value = byPeer.map { (id, l) ->
            PeerInfo(id, l[0].first.signPub, l[0].first.boxPub, l.map { it.second.link.medium }.toSet(), l.minOf { it.second.since }, l.map { it.second.link.label })
        }.sortedBy { it.since }
    }
    private fun publishCounters() { _counters.value = Triple(sent.get(), received.get(), relayed.get()) }

    fun shutdown() { for (ls in links.values) { ls.job?.cancel(); ls.link.close() }; links.clear(); _linkCount.value = 0; publishPeers() }
}
