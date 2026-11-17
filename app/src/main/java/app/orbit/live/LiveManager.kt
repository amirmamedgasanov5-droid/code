package app.orbit.live

import android.content.Context
import app.orbit.core.*
import app.orbit.core.crypto.Aead
import app.orbit.core.crypto.Peer
import app.orbit.data.MsgKind
import app.orbit.engine.Engine
import app.orbit.engine.LiveSub
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicLong

enum class CallStatus { RINGING, CONNECTING, ACTIVE, ENDED }
class CallState(val peerId: String, val outgoing: Boolean, val status: CallStatus, val startedAt: Long, val reason: String = "")

class LiveInfo(val rid: String, val key: String, val host: String, val title: String, val chatId: String)

/** Owns the (single) active live room and the walkie-talkie; wires audio hardware to the protocol cores. */
class LiveManager(private val ctx: Context, private val engine: Engine) {
    val audio = LiveAudio()
    private val _room = MutableStateFlow<LiveCore?>(null); val room: StateFlow<LiveCore?> = _room
    private val _info = MutableStateFlow<LiveInfo?>(null); val info: StateFlow<LiveInfo?> = _info
    private val _mic = MutableStateFlow(false); val mic: StateFlow<Boolean> = _mic
    private val seq = AtomicLong(0)
    private var job: Job? = null

    private val _call = MutableStateFlow<CallState?>(null); val call: StateFlow<CallState?> = _call
    private val _speaker = MutableStateFlow(false); val speaker: StateFlow<Boolean> = _speaker
    private var callJob: Job? = null
    private var callRid = ""
    private var autoMic = false
    private val am = ctx.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager

    fun setSpeaker(on: Boolean) { _speaker.value = on; try { am.mode = android.media.AudioManager.MODE_IN_COMMUNICATION; @Suppress("DEPRECATION") am.isSpeakerphoneOn = on } catch (_: Exception) {} }

    /** Outgoing 1:1 voice call: a private room + a short-lived ring signal sent as a DM (also reachable through the relay). */
    fun startCall(peerId: String) {
        if (_call.value != null && _call.value?.status != CallStatus.ENDED) return
        leave()
        val rid = Rand.bytes(16); val key = Rand.bytes(32); val me = engine.identity ?: return
        callRid = rid.hex(); autoMic = true
        val core = LiveCore(me, engine.mesh, rid, key, me.id, "call", ::card, LiveSub.ROOM, autoSpeaker = true)
        attach(core, LiveInfo(callRid, key.hex(), me.id, "call", peerId))
        setSpeaker(false)
        _call.value = CallState(peerId, true, CallStatus.RINGING, now())
        engine.sendCallSignal(peerId, JSONObject().put("t", "call").put("rid", callRid).put("key", key.hex()).put("host", me.id))
        setMic(true)
        watchCall(peerId, true)
    }

    fun acceptCall(inc: Engine.IncomingCall) {
        engine.dismissIncomingCall()
        leave(); callRid = inc.rid; autoMic = true
        join(inc.rid, inc.key, inc.from, "call", inc.from)
        setSpeaker(false)
        _call.value = CallState(inc.from, false, CallStatus.CONNECTING, now())
        watchCall(inc.from, false)
    }

    fun declineCall(inc: Engine.IncomingCall) { engine.dismissIncomingCall(); engine.sendCallSignal(inc.from, JSONObject().put("t", "call_decline").put("rid", inc.rid)) }

    fun hangup(reason: String = "") {
        val c = _call.value ?: return
        if (c.status == CallStatus.ENDED) return
        if (c.outgoing && c.status == CallStatus.RINGING) { engine.sendCallSignal(c.peerId, JSONObject().put("t", "call_cancel").put("rid", callRid)); engine.logCall(c.peerId, "Cancelled call") }
        else { engine.sendCallSignal(c.peerId, JSONObject().put("t", "call_end").put("rid", callRid)); if (c.status == CallStatus.ACTIVE) engine.logCall(c.peerId, "Call · ${(now() - c.startedAt) / 1000 / 60}:${"%02d".format((now() - c.startedAt) / 1000 % 60)}") }
        finishCall(c, reason)
    }

    private fun finishCall(c: CallState, reason: String) {
        callJob?.cancel(); autoMic = false
        _call.value = CallState(c.peerId, c.outgoing, CallStatus.ENDED, c.startedAt, reason)
        leave(); try { am.mode = android.media.AudioManager.MODE_NORMAL; @Suppress("DEPRECATION") am.isSpeakerphoneOn = false } catch (_: Exception) {}
        engine.scope.launch { delay(2500); if (_call.value?.status == CallStatus.ENDED) _call.value = null }
    }

    private fun watchCall(peer: String, outgoing: Boolean) {
        callJob?.cancel()
        callJob = engine.scope.launch {
            val started = now()
            launch { engine.callEvents.collect { (type, from) ->
                val c = _call.value ?: return@collect
                if (from == c.peerId && c.status != CallStatus.ENDED) { if (type == "call_decline") { engine.logCall(peer, "Declined call"); finishCall(c, "Declined") } else finishCall(c, "Ended") }
            } }
            while (isActive) {
                delay(500)
                val c = _call.value ?: break; if (c.status == CallStatus.ENDED) break
                val st = _room.value?.state?.value
                val together = st != null && st.participants.size >= 2
                if (together && c.status != CallStatus.ACTIVE) _call.value = CallState(c.peerId, c.outgoing, CallStatus.ACTIVE, now())
                if (st?.ended == true) { finishCall(c, "Ended"); break }
                if (c.status == CallStatus.RINGING && now() - started > 45_000) { hangup("No answer"); break }
                if (c.status == CallStatus.CONNECTING && now() - started > 30_000) { engine.logCall(peer, "Call failed — no direct connection"); finishCall(c, "No direct connection"); break }
            }
        }
    }

    init { engine.liveHandler = { peer, frame, _ -> onLive(peer, frame) } }

    private fun card() = JSONObject().put("n", engine.profile.value.name).put("e", engine.profile.value.emoji).put("c", engine.profile.value.color)

    /** Host: create a room and announce it in the chat as a message everyone can tap to join. */
    fun start(chatId: String, title: String): String {
        val rid = Rand.bytes(16); val key = Rand.bytes(32)
        val me = engine.identity!!
        val core = LiveCore(me, engine.mesh, rid, key, me.id, title, ::card, LiveSub.ROOM)
        attach(core, LiveInfo(rid.hex(), key.hex(), me.id, title, chatId))
        engine.send(chatId, MsgKind.LIVE, title, extra = JSONObject().put("rid", rid.hex()).put("key", key.hex()).put("host", me.id))
        return rid.hex()
    }

    fun join(rid: String, key: String, host: String, title: String, chatId: String) {
        if (_info.value?.rid == rid) return
        leave()
        val core = LiveCore(engine.identity!!, engine.mesh, rid.unhex(), key.unhex(), host, title, ::card, LiveSub.ROOM)
        attach(core, LiveInfo(rid, key, host, title, chatId))
        core.join()
    }

    private fun attach(core: LiveCore, i: LiveInfo) {
        _room.value = core; _info.value = i
        core.onAudio = { who, s, f -> audio.play(who, s, f) }
        job = engine.scope.launch {
            var tick = 0
            while (isActive) {
                delay(1000); tick++
                if (core.isHost) { if (tick % 4 == 0) core.broadcastState() }
                else { if (core.state.value.me(engine.myId) == null && tick % 3 == 0) core.join(); core.tickLiveness() }
                // keep the mic aligned with the role the host gave us
                val role = core.myRole; val muted = core.state.value.me(engine.myId)?.muted == true
                if ((role == Role.LISTENER || muted) && _mic.value) setMic(false)
                if (autoMic && role != Role.LISTENER && !muted && !_mic.value) setMic(true)
            }
        }
    }

    fun setMic(on: Boolean): Boolean {
        val core = _room.value ?: return false
        if (on) {
            if (core.myRole == Role.LISTENER) return false
            val ok = audio.startCapture { f -> core.sendAudio(f, seq.incrementAndGet()) }
            _mic.value = ok; return ok
        }
        audio.stopCapture(); _mic.value = false; return true
    }

    fun leave() {
        job?.cancel(); setMic(false); audio.stopPlayback()
        _room.value?.leave(); _room.value = null; _info.value = null
    }

    fun endForAll() { _room.value?.end(); leave() }

    // ------------------------------------------------------------ Walkie-talkie (push to talk)
    @Volatile var walkieKey: ByteArray = sha256("orbit.walkie.open".utf8())
    @Volatile var walkieTag: ByteArray = walkieKey.copyOf(4)
    private val walkieSeq = AtomicLong(0)
    private val _walkieActive = MutableStateFlow<Pair<String, Long>?>(null); val walkieActive: StateFlow<Pair<String, Long>?> = _walkieActive
    private val _walkieTx = MutableStateFlow(false); val walkieTx: StateFlow<Boolean> = _walkieTx
    private val walkieSeen = HashMap<String, Long>()

    /** Empty code = the open channel everyone nearby hears. A code makes a private channel. */
    fun setWalkieCode(code: String) {
        walkieKey = if (code.isBlank()) sha256("orbit.walkie.open".utf8()) else sha256("orbit.walkie.code".utf8(), code.trim().lowercase().utf8())
        walkieTag = walkieKey.copyOf(4)
    }

    fun walkieStart(): Boolean {
        val me = engine.identity ?: return false
        val key = walkieKey; val tag = walkieTag; val sp = me.signPub.copyOf(8)
        val ok = audio.startCapture { f ->
            val s = walkieSeq.incrementAndGet()
            val frame = ByteWriter(f.size + 40).u8(LiveSub.PTT).raw(tag).raw(sp).u32(s).u8(0).raw(Aead.seal(key, f, tag + sp)).toByteArray()
            engine.mesh.broadcastLive(frame)
        }
        _walkieTx.value = ok; return ok
    }
    fun walkieStop() { audio.stopCapture(); _walkieTx.value = false }

    private fun onLive(peer: Peer, frame: ByteArray) {
        if (frame.isEmpty()) return
        when (frame[0].toInt()) {
            LiveSub.ROOM -> {
                if (frame.size < 10) return
                val core = _room.value ?: return
                if (!core.roomId.copyOf(8).contentEquals(frame.copyOfRange(1, 9))) return
                core.onFrame(peer, frame.copyOfRange(9, frame.size))
            }
            LiveSub.PTT -> try {
                val r = ByteReader(frame, 1); val tag = r.raw(4); if (!tag.contentEquals(walkieTag)) return
                val sp = r.raw(8); val seq = r.u32(); val hops = r.u8(); val sealed = r.rest()
                val k = sp.hex()
                synchronized(walkieSeen) { val last = walkieSeen[k] ?: -1; if (seq <= last && last - seq < 1000) return; walkieSeen[k] = seq }
                val pcm = Aead.open(walkieKey, sealed, tag + sp) ?: return
                if (sp.contentEquals(engine.identity!!.signPub.copyOf(8))) return
                audio.play("w$k", seq, pcm)
                _walkieActive.value = k to now()
                if (hops < 2) engine.mesh.broadcastLive(ByteWriter(frame.size).u8(LiveSub.PTT).raw(tag).raw(sp).u32(seq).u8(hops + 1).raw(sealed).toByteArray(), peer.id)
            } catch (_: Exception) {}
        }
    }
}
