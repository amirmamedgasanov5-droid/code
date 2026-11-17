package app.orbit.core.net

import app.orbit.core.*
import app.orbit.core.mesh.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.*
import java.net.*
import java.util.concurrent.ConcurrentHashMap

/**
 * Same Wi-Fi / hotspot / Ethernet: UDP multicast+broadcast beacons find neighbours, TCP carries frames.
 * No internet is required; works on a phone hotspot with nobody else online.
 */
class LanTransport(
    private val myPub: ByteArray,
    private val scope: CoroutineScope,
    private val beaconPort: Int = 47474,
    private val onMulticastLock: (Boolean) -> Unit = {},
) : Transport {
    override val name = "LAN"
    private val _state = MutableStateFlow(TransportState.OFF)
    override val state: StateFlow<TransportState> = _state
    private var listener: LinkListener? = null
    private var server: ServerSocket? = null
    private var udp: MulticastSocket? = null
    private val jobs = mutableListOf<Job>()
    private val links = ConcurrentHashMap<String, TcpLink>()          // peerPubHex -> link (one per peer)
    private val dialing = ConcurrentHashMap.newKeySet<String>()
    private val seenBeacons = ConcurrentHashMap<String, Int>()
    val port: Int get() = server?.localPort ?: 0

    class TcpLink(val sock: Socket, override val label: String, val tag: String) : Link {
        override val linkId = "lan:$tag:${sock.remoteSocketAddress}"
        override val medium = "Wi-Fi"
        private val out = DataOutputStream(BufferedOutputStream(sock.getOutputStream(), 32_768))
        override suspend fun send(frame: ByteArray): Boolean = withContext(Dispatchers.IO) {
            try { synchronized(out) { out.writeInt(frame.size); out.write(frame); out.flush() }; true } catch (e: Exception) { close(); false }
        }
        override fun close() { try { sock.close() } catch (_: Exception) {} }
    }

    override fun start(listener: LinkListener) {
        if (server != null) return
        this.listener = listener; _state.value = TransportState.STARTING
        try {
            server = ServerSocket(0).also { it.reuseAddress = true }
            onMulticastLock(true)
            udp = MulticastSocket(null).apply {
                reuseAddress = true; broadcast = true; bind(InetSocketAddress(beaconPort))
                try { joinGroup(InetAddress.getByName(GROUP)) } catch (_: Exception) {}
                soTimeout = 1000
            }
        } catch (e: Exception) { _state.value = TransportState.UNAVAILABLE; return }
        _state.value = TransportState.ON
        jobs += scope.launch(Dispatchers.IO) { acceptLoop() }
        jobs += scope.launch(Dispatchers.IO) { beaconLoop() }
        jobs += scope.launch(Dispatchers.IO) { listenLoop() }
    }

    override fun stop() {
        jobs.forEach { it.cancel() }; jobs.clear()
        try { server?.close() } catch (_: Exception) {}; server = null
        try { udp?.close() } catch (_: Exception) {}; udp = null
        links.values.forEach { it.close() }; links.clear(); onMulticastLock(false); _state.value = TransportState.OFF
    }

    private suspend fun acceptLoop() {
        val s = server ?: return
        while (currentCoroutineContext().isActive) {
            val sock = try { s.accept() } catch (e: Exception) { break }
            scope.launch(Dispatchers.IO) { runLink(sock, null) }
        }
    }

    private suspend fun beaconLoop() {
        val msg = ByteWriter().raw("ORB1".utf8()).raw(myPub).u16(port).toByteArray()
        while (currentCoroutineContext().isActive) {
            try {
                val s = udp ?: break
                s.send(DatagramPacket(msg, msg.size, InetAddress.getByName(GROUP), beaconPort))
                try { s.send(DatagramPacket(msg, msg.size, InetAddress.getByName("255.255.255.255"), beaconPort)) } catch (_: Exception) {}
            } catch (_: Exception) {}
            delay(3500)
        }
    }

    private suspend fun listenLoop() {
        val buf = ByteArray(256)
        while (currentCoroutineContext().isActive) {
            val s = udp ?: break
            val p = DatagramPacket(buf, buf.size)
            try { s.receive(p) } catch (e: SocketTimeoutException) { continue } catch (e: Exception) { break }
            if (p.length < 4 + 32 + 2 || String(buf, 0, 4) != "ORB1") continue
            val pub = buf.copyOfRange(4, 36); if (pub.contentEquals(myPub)) continue
            val port = ((buf[36].toInt() and 0xff) shl 8) or (buf[37].toInt() and 0xff)
            val key = pub.hex()
            val n = (seenBeacons[key] ?: 0) + 1; seenBeacons[key] = n
            if (links.values.any { it.sock.inetAddress == p.address } || !dialing.add(key)) continue
            // Initiator rule: bigger key dials; smaller key waits 3 beacons in case the other side can't hear us.
            val iDial = ByteReader(myPub).i64() > ByteReader(pub).i64() || n >= 4
            if (!iDial) { dialing.remove(key); continue }
            val addr = p.address
            scope.launch(Dispatchers.IO) {
                try { connect(addr.hostAddress ?: return@launch, port, key) } finally { dialing.remove(key) }
            }
        }
    }

    /** Public so tests (and "add by IP") can dial directly. */
    fun connect(host: String, port: Int, tag: String = "$host:$port"): Boolean {
        return try {
            val sock = Socket(); sock.connect(InetSocketAddress(host, port), 4000)
            scope.launch(Dispatchers.IO) { runLink(sock, tag) }
            true
        } catch (e: Exception) { false }
    }

    private fun runLink(sock: Socket, tag0: String?) {
        sock.tcpNoDelay = true; sock.keepAlive = true
        val tag = tag0 ?: sock.inetAddress.hostAddress.orEmpty()
        val link = TcpLink(sock, sock.inetAddress.hostAddress ?: "lan", tag)
        links[link.linkId] = link
        listener?.onLinkUp(link)
        try {
            val inp = DataInputStream(BufferedInputStream(sock.getInputStream(), 32_768))
            while (true) {
                val n = inp.readInt(); if (n < 0 || n > 1_500_000) break
                val b = ByteArray(n); inp.readFully(b)
                listener?.onFrame(link, b)
            }
        } catch (_: Exception) {} finally {
            links.remove(link.linkId); link.close(); listener?.onLinkDown(link)
        }
    }

    companion object { const val GROUP = "239.255.42.99" }
}
