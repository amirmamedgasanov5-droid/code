package app.orbit.live

import app.orbit.core.*
import app.orbit.core.crypto.*
import app.orbit.core.mesh.MeshNode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject

object Role { const val LISTENER = 0; const val SPEAKER = 1; const val HOST = 2 }

data class Participant(val id: String, val name: String, val emoji: String, val color: Int, val role: Int, val hand: Boolean, val muted: Boolean)
data class RoomState(val title: String, val ended: Boolean, val participants: List<Participant>, val lastHostSeen: Long, val speaking: Set<String> = emptySet()) {
    fun me(id: String) = participants.firstOrNull { it.id == id }
}

/**
 * Transport-agnostic live room. Control messages are signed (host authority), everything is sealed with the
 * room key. Audio frames are flooded across the overlay of directly connected participants with
 * (speaker, seq) de-duplication, so a listener only needs a link to *any* participant, not to the host.
 */
class LiveCore(
    private val me: Identity,
    private val mesh: MeshNode,
    val roomId: ByteArray,
    private val key: ByteArray,
    val hostId: String,
    title: String,
    private val myCard: () -> JSONObject,
    private val sub: Int,
    /** 1:1 calls: whoever joins is allowed to talk immediately. */
    private val autoSpeaker: Boolean = false,
) {
    val isHost = hostId == me.id
    private val _state = MutableStateFlow(RoomState(title, false, if (isHost) listOf(selfParticipant(Role.HOST)) else emptyList(), if (isHost) now() else 0))
    val state: StateFlow<RoomState> = _state
    /** Frames may arrive slightly out of order (parallel links); the audio sink reorders by seq. */
    var onAudio: (speakerId: String, seq: Long, frame: ByteArray) -> Unit = { _, _, _ -> }
    private val seenCtl = LinkedHashSet<Long>()
    private class SeqWindow { var high = -1L; val seen = HashSet<Long>() }
    private val seenAudio = HashMap<String, SeqWindow>()  // speaker prefix -> recent sequence numbers
    private val roster = LinkedHashMap<String, Participant>().also { if (isHost) it[me.id] = selfParticipant(Role.HOST) }
    private val speakingUntil = HashMap<String, Long>()
    private var stateSeq = 0L; @Volatile private var lastAppliedSeq = -1L
    private val rid8 get() = roomId.copyOf(8)

    private fun selfParticipant(role: Int, hand: Boolean = false, muted: Boolean = false): Participant {
        val c = myCard(); return Participant(me.id, c.optString("n"), c.optString("e"), c.optInt("c"), role, hand, muted)
    }
    val myRole: Int get() = _state.value.me(me.id)?.role ?: Role.LISTENER
    fun idPrefix(id: String) = id.take(16)  // 8 bytes hex

    // -------------------------------------------------------------- outgoing
    private object Op { const val JOIN = 1; const val STATE = 2; const val HAND = 3; const val SET_ROLE = 4; const val MUTE = 5; const val AUDIO = 6; const val LEAVE = 7 }

    private fun seal(op: Int, body: ByteArray, signed: Boolean): ByteArray {
        val msgId = Rand.bytes(8)
        val w = ByteWriter(body.size + 120).u8(op).raw(msgId)
        if (signed) {
            val sig = me.sign("orbit.live".utf8() + roomId + byteArrayOf(op.toByte()) + msgId + body)
            w.u8(1).raw(me.signPub).raw(sig)
        } else w.u8(0)
        w.bytes(body)
        val sealed = Aead.seal(key, w.toByteArray(), roomId)
        return byteArrayOf(sub.toByte()) + rid8 + sealed
    }

    private fun flood(frame: ByteArray, except: String? = null) = mesh.broadcastLive(frame, except)

    fun join() { if (!isHost) flood(seal(Op.JOIN, JSONObject().put("card", myCard()).toString().utf8(), true)) }
    fun leave() { if (!isHost) flood(seal(Op.LEAVE, ByteArray(0), true)) else end() }
    fun raiseHand(on: Boolean) { flood(seal(Op.HAND, byteArrayOf(if (on) 1 else 0), true)) }

    fun hostSetRole(peerId: String, role: Int) { if (!isHost) return; roster[peerId]?.let { roster[peerId] = it.copy(role = role, hand = false, muted = false) }; broadcastState() }
    fun hostMute(peerId: String, muted: Boolean) { if (!isHost) return; roster[peerId]?.let { roster[peerId] = it.copy(muted = muted) }; broadcastState() }
    fun hostKick(peerId: String) { if (!isHost) return; roster.remove(peerId); broadcastState() }
    fun end() { if (!isHost) return; broadcastState(ended = true); _state.value = _state.value.copy(ended = true) }

    /** Called by host every few seconds and on any change. Also relayed by everyone so far-away listeners get it. */
    fun broadcastState(ended: Boolean = _state.value.ended) {
        if (!isHost) return
        val arr = JSONArray(); roster.values.forEach { p -> arr.put(JSONObject().put("i", p.id).put("n", p.name).put("e", p.emoji).put("c", p.color).put("r", p.role).put("h", p.hand).put("m", p.muted)) }
        val body = JSONObject().put("title", _state.value.title).put("ended", ended).put("parts", arr).put("ts", now()).put("sq", ++stateSeq).toString().utf8()
        publish(roster.values.toList(), ended, now())
        flood(seal(Op.STATE, body, true))
    }
    private fun publish(parts: List<Participant>, ended: Boolean, hostSeen: Long, title: String = _state.value.title) {
        _state.value = RoomState(title, ended, parts, hostSeen, speakingNow())
    }
    private fun speakingNow(): Set<String> { val t = now(); return speakingUntil.filterValues { it > t }.keys }

    /** Only speakers and the host may talk (receivers enforce this too). */
    fun sendAudio(frame: ByteArray, seq: Long) {
        val r = myRole; if (r == Role.LISTENER) return
        if (_state.value.me(me.id)?.muted == true) return
        val body = ByteWriter(frame.size + 16).raw(me.signPub.copyOf(8)).u32(seq).raw(frame).toByteArray()
        flood(seal(Op.AUDIO, body, false))
    }

    // -------------------------------------------------------------- incoming
    /** `payload` = frame after [sub][roomId8]. */
    fun onFrame(from: Peer?, payload: ByteArray) {
        val plain = Aead.open(key, payload, roomId) ?: return
        val r = ByteReader(plain)
        val op = r.u8(); val msgId = r.raw(8)
        var signer: ByteArray? = null
        if (r.u8() == 1) { signer = r.raw(32); val sig = r.raw(64); val body = r.bytes(); if (!Sig.verify(signer, "orbit.live".utf8() + roomId + byteArrayOf(op.toByte()) + msgId + body, sig)) return; handle(op, msgId, signer, body, from, plain, payload) }
        else handle(op, msgId, null, r.bytes(), from, plain, payload)
    }

    private fun dupCtl(msgId: ByteArray): Boolean {
        val k = ByteReader(msgId).i64()
        synchronized(seenCtl) { if (!seenCtl.add(k)) return true; if (seenCtl.size > 4000) seenCtl.remove(seenCtl.first()) }
        return false
    }

    private fun handle(op: Int, msgId: ByteArray, signer: ByteArray?, body: ByteArray, from: Peer?, plain: ByteArray, rawFrame: ByteArray) {
        when (op) {
            Op.AUDIO -> {
                val r = ByteReader(body); val sp = r.raw(8).hex(); val seq = r.u32(); val frame = r.rest()
                synchronized(seenAudio) {
                    val w = seenAudio.getOrPut(sp) { SeqWindow() }
                    if (w.high >= 0 && seq < w.high - 256 && w.high - seq < 5000) return      // far too old
                    if (!w.seen.add(seq)) return                                              // duplicate
                    if (seq > w.high) { w.high = seq; if (w.seen.size > 600) w.seen.removeAll { it < w.high - 300 }.let { } }
                }
                flood(rawRebuild(rawFrame), from?.id)   // relay first: far-away listeners depend on it
                val speaker = _state.value.participants.firstOrNull { it.id.startsWith(sp) && it.role != Role.LISTENER && !it.muted } ?: return
                val wasSpeaking = speakingUntil[speaker.id]?.let { it > now() } == true
                speakingUntil[speaker.id] = now() + 600
                if (speaker.id != me.id) onAudio(speaker.id, seq, frame)
                if (!wasSpeaking) publish(_state.value.participants, _state.value.ended, _state.value.lastHostSeen)
            }
            Op.STATE -> {
                signer ?: return; if (Peer.idOf(signer) != hostId || dupCtl(msgId) ) return
                val j = JSONObject(body.str()); val arr = j.getJSONArray("parts")
                val parts = (0 until arr.length()).map { val o = arr.getJSONObject(it); Participant(o.getString("i"), o.optString("n"), o.optString("e"), o.optInt("c"), o.optInt("r"), o.optBoolean("h"), o.optBoolean("m")) }
                val sq = j.optLong("sq", 0)
                // frames can overtake each other (parallel links, UDP): never let an older roster replace a newer one
                val apply = synchronized(this) { if (sq > lastAppliedSeq) { lastAppliedSeq = sq; true } else false }
                if (!isHost && apply) publish(parts, j.optBoolean("ended"), now(), j.optString("title", _state.value.title))
                flood(rawRebuild(rawFrame), from?.id)
            }
            Op.JOIN, Op.HAND, Op.LEAVE -> {
                signer ?: return; if (dupCtl(msgId)) return
                val id = Peer.idOf(signer)
                if (isHost) {
                    when (op) {
                        Op.JOIN -> { val c = JSONObject(body.str()).optJSONObject("card") ?: JSONObject(); val prev = roster[id]; roster[id] = Participant(id, c.optString("n"), c.optString("e"), c.optInt("c"), prev?.role ?: (if (autoSpeaker) Role.SPEAKER else Role.LISTENER), prev?.hand ?: false, prev?.muted ?: false) }
                        Op.HAND -> roster[id]?.let { roster[id] = it.copy(hand = body.firstOrNull()?.toInt() == 1) }
                        Op.LEAVE -> roster.remove(id)
                    }
                    broadcastState()
                }
                flood(rawRebuild(rawFrame), from?.id)
            }
        }
    }

    // frames are relayed verbatim (already sealed): rebuild header only
    private fun rawRebuild(frame: ByteArray) = byteArrayOf(sub.toByte()) + rid8 + frame

    fun tickLiveness() { val s = _state.value; if (!isHost && !s.ended && s.lastHostSeen > 0 && now() - s.lastHostSeen > 40_000) _state.value = s.copy(ended = true) }
}
