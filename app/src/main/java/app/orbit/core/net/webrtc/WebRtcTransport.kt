package app.orbit.core.net.webrtc

import android.content.Context
import app.orbit.core.Rand
import app.orbit.core.crypto.Tags
import app.orbit.core.hex
import app.orbit.core.mesh.*
import app.orbit.core.unhex
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.webrtc.*
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentHashMap

/**
 * Direct phone-to-phone channel over WebRTC: Firestore only carries the offer / answer / ICE candidates, STUN tells each
 * phone its public address, then everything (messages, photos, voice, calls) flows through an encrypted DataChannel
 * as an ordinary mesh Link. The peer with the smaller id always makes the offer, so two phones never collide.
 * Behind symmetric / carrier-grade NAT a STUN-only setup can fail (that needs a TURN relay).
 */
class WebRtcTransport(
    private val ctx: Context,
    private val scope: CoroutineScope,
    private val myId: String,
    private val signaling: Signaling,
    private val stun: List<String> = listOf("stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"),
    /** TURN relays: needed when both phones sit behind mobile-carrier / symmetric NAT (different networks). */
    private val turn: List<TurnServer> = DEFAULT_TURN,
) : Transport {
    class TurnServer(val urls: List<String>, val user: String, val pass: String)
    companion object {
        /** Public Open Relay (metered.ca) free TURN, UDP + TCP + TLS/443 so it also passes strict firewalls. */
        val DEFAULT_TURN = listOf(TurnServer(listOf(
            "turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443",
            "turn:openrelay.metered.ca:80?transport=tcp", "turn:openrelay.metered.ca:443?transport=tcp",
            "turns:openrelay.metered.ca:443?transport=tcp"), "openrelayproject", "openrelayproject"))
    }
    override val name = "WebRTC"
    private val _state = MutableStateFlow(TransportState.OFF)
    override val state: StateFlow<TransportState> = _state
    private var listener: LinkListener? = null
    private var factory: PeerConnectionFactory? = null
    private val sessions = ConcurrentHashMap<String, Session>()
    @Volatile var lastEvent = ""
    @Volatile var relayCands = 0  // >0 means the TURN relay answered us
    val activeLinks: Int get() = sessions.values.count { it.link != null }

    private inner class Session(val peerId: String, val offerer: Boolean) {
        var pc: PeerConnection? = null; var dc: DataChannel? = null; var link: RtcLink? = null
        val pendingIce = ArrayList<IceCandidate>(); @Volatile var remoteSet = false
        val born = System.currentTimeMillis(); val reasm = Reassembler()
        fun close() { try { dc?.close() } catch (_: Exception) {}; try { pc?.close() } catch (_: Exception) {}; link?.let { listener?.onLinkDown(it) }; link = null }
    }

    private inner class RtcLink(val s: Session) : Link {
        override val linkId = "webrtc:${s.peerId}:${s.born}"
        override val medium = "WebRTC"
        override val label = "direct"
        override suspend fun send(frame: ByteArray): Boolean {
            val ch = s.dc ?: return false
            return try {
                for (part in Framer.split(frame, 15_000)) {
                    var waited = 0
                    while (ch.bufferedAmount() > 2_000_000) { delay(5); if (++waited > 3000) return false }
                    if (!ch.send(DataChannel.Buffer(ByteBuffer.wrap(part), true))) return false
                }
                true
            } catch (e: Exception) { false }
        }
        override fun close() { drop(s) }
    }

    override fun start(listener: LinkListener) {
        if (factory != null) return
        this.listener = listener; _state.value = TransportState.STARTING
        try {
            PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(ctx.applicationContext).createInitializationOptions())
            factory = PeerConnectionFactory.builder().createPeerConnectionFactory()
        } catch (e: Throwable) { lastEvent = "init failed: ${e.message}"; _state.value = TransportState.UNAVAILABLE; return }
        signaling.start { sig -> scope.launch(Dispatchers.Default) { onSignal(sig) } }
        _state.value = TransportState.ON
        scope.launch { while (isActive && factory != null) { delay(10_000); sessions.values.filter { it.link == null && System.currentTimeMillis() - it.born > 40_000 }.forEach { drop(it) } } }
    }

    override fun stop() {
        signaling.stop(); sessions.values.toList().forEach { drop(it) }
        try { factory?.dispose() } catch (_: Throwable) {}; factory = null; _state.value = TransportState.OFF
    }

    private fun tagOf(peerId: String) = Tags.user(peerId.unhex()).hex()
    private fun send(peerId: String, type: String, a: String = "", b: String = "", n: Int = 0) = signaling.send(tagOf(peerId), Signal(myId, type, a, b, n))
    private fun drop(s: Session) { if (sessions.remove(s.peerId, s)) s.close() }

    /** Ask for a direct connection to this contact (call, pending message...). Safe to call repeatedly. */
    fun connect(peerId: String) {
        if (factory == null || peerId == myId) return
        val ex = sessions[peerId]
        if (ex != null && (ex.link != null || System.currentTimeMillis() - ex.born < 25_000)) return
        ex?.let { drop(it) }
        if (myId < peerId) startOffer(peerId) else send(peerId, "want")
    }

    // ------------------------------------------------------------------ negotiation
    private fun newSession(peerId: String, offerer: Boolean): Session? {
        val f = factory ?: return null
        sessions[peerId]?.let { drop(it) }
        val s = Session(peerId, offerer)
        val servers = stun.map { PeerConnection.IceServer.builder(it).createIceServer() } +
            turn.map { t -> PeerConnection.IceServer.builder(t.urls).setUsername(t.user).setPassword(t.pass).createIceServer() }
        val cfg = PeerConnection.RTCConfiguration(servers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            tcpCandidatePolicy = PeerConnection.TcpCandidatePolicy.ENABLED
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
            iceCandidatePoolSize = 2
        }
        s.pc = f.createPeerConnection(cfg, object : PeerConnection.Observer {
            override fun onIceCandidate(c: IceCandidate) { if (c.sdp.contains(" typ relay")) relayCands++; send(peerId, "ice", c.sdp, c.sdpMid ?: "0", c.sdpMLineIndex) }
            override fun onDataChannel(ch: DataChannel) { attach(s, ch) }
            override fun onConnectionChange(st: PeerConnection.PeerConnectionState) {
                lastEvent = "$peerId: $st"
                if (st == PeerConnection.PeerConnectionState.FAILED || st == PeerConnection.PeerConnectionState.CLOSED) drop(s)
                // DISCONNECTED is often a short blip on mobile networks: give it time to recover
                else if (st == PeerConnection.PeerConnectionState.DISCONNECTED) scope.launch { delay(10_000); if (s.pc?.connectionState() != PeerConnection.PeerConnectionState.CONNECTED) drop(s) }
            }
            override fun onSignalingChange(p0: PeerConnection.SignalingState?) {}
            override fun onIceConnectionChange(p0: PeerConnection.IceConnectionState?) {}
            override fun onIceConnectionReceivingChange(p0: Boolean) {}
            override fun onIceGatheringChange(p0: PeerConnection.IceGatheringState?) {}
            override fun onIceCandidatesRemoved(p0: Array<out IceCandidate>?) {}
            override fun onAddStream(p0: MediaStream?) {}
            override fun onRemoveStream(p0: MediaStream?) {}
            override fun onRenegotiationNeeded() {}
        })
        if (s.pc == null) return null
        sessions[peerId] = s
        return s
    }

    private fun startOffer(peerId: String) {
        val s = newSession(peerId, true) ?: return
        val ch = s.pc!!.createDataChannel("orbit", DataChannel.Init().apply { ordered = true })
        attach(s, ch)
        s.pc!!.createOffer(object : SdpAdapter() {
            override fun onCreateSuccess(d: SessionDescription) {
                s.pc?.setLocalDescription(object : SdpAdapter() { override fun onSetSuccess() { send(peerId, "offer", d.description) } }, d)
            }
            override fun onCreateFailure(e: String?) { lastEvent = "offer failed: $e" }
        }, MediaConstraints())
    }

    private fun onSignal(sig: Signal) {
        val peerId = sig.from
        when (sig.type) {
            "want" -> if (myId < peerId && sessions[peerId]?.link == null) startOffer(peerId)
            "offer" -> {
                val s = newSession(peerId, false) ?: return
                s.pc!!.setRemoteDescription(object : SdpAdapter() {
                    override fun onSetSuccess() {
                        s.remoteSet = true; flushIce(s)
                        s.pc?.createAnswer(object : SdpAdapter() {
                            override fun onCreateSuccess(d: SessionDescription) { s.pc?.setLocalDescription(object : SdpAdapter() { override fun onSetSuccess() { send(peerId, "answer", d.description) } }, d) }
                            override fun onCreateFailure(e: String?) { lastEvent = "answer failed: $e" }
                        }, MediaConstraints())
                    }
                    override fun onSetFailure(e: String?) { lastEvent = "offer rejected: $e" }
                }, SessionDescription(SessionDescription.Type.OFFER, sig.a))
            }
            "answer" -> sessions[peerId]?.let { s -> s.pc?.setRemoteDescription(object : SdpAdapter() { override fun onSetSuccess() { s.remoteSet = true; flushIce(s) } }, SessionDescription(SessionDescription.Type.ANSWER, sig.a)) }
            "ice" -> sessions[peerId]?.let { s ->
                val c = IceCandidate(sig.b, sig.n, sig.a)
                if (s.remoteSet) s.pc?.addIceCandidate(c) else synchronized(s.pendingIce) { s.pendingIce.add(c) }
            }
        }
    }

    private fun flushIce(s: Session) { synchronized(s.pendingIce) { s.pendingIce.forEach { s.pc?.addIceCandidate(it) }; s.pendingIce.clear() } }

    private fun attach(s: Session, ch: DataChannel) {
        s.dc = ch
        ch.registerObserver(object : DataChannel.Observer {
            override fun onBufferedAmountChange(p0: Long) {}
            override fun onStateChange() {
                when (ch.state()) {
                    DataChannel.State.OPEN -> { val l = RtcLink(s); s.link = l; lastEvent = "${s.peerId}: direct link up"; listener?.onLinkUp(l) }
                    DataChannel.State.CLOSED -> drop(s)
                    else -> {}
                }
            }
            override fun onMessage(b: DataChannel.Buffer) {
                val bytes = ByteArray(b.data.remaining()); b.data.get(bytes)
                val l = s.link ?: return
                s.reasm.feed(bytes)?.let { listener?.onFrame(l, it) }
            }
        })
    }

    open class SdpAdapter : SdpObserver {
        override fun onCreateSuccess(d: SessionDescription) {}
        override fun onSetSuccess() {}
        override fun onCreateFailure(e: String?) {}
        override fun onSetFailure(e: String?) {}
    }
}
