package app.orbit.core.mesh

import app.orbit.core.*
import app.orbit.core.crypto.*

object Kind {
    const val DIRECT = 1   // sealed to one recipient
    const val GROUP = 2    // encrypted with a shared group key
    const val CHANNEL = 3  // signed (optionally encrypted) broadcast
    const val ACK = 4      // delivery receipt, lets relays free storage
    const val ANNOUNCE = 5 // public signed card (username / public channel) gossiped as a serverless directory
}

/**
 * The unit that travels through the mesh. Header is public (routing tag, expiry), body is opaque
 * to relays. `hops` is the only mutable field and is deliberately outside every signature/AAD.
 */
class Envelope(
    val id: ByteArray,
    val kind: Int,
    val tag: ByteArray,
    val created: Long,
    val expires: Long,
    var hops: Int,
    val refId: ByteArray?,
    val body: ByteArray,
) {
    val idHex: String by lazy { id.hex() }
    val idKey: Long by lazy { ByteReader(id).i64() }

    fun aad(): ByteArray = ByteWriter(48).u8(kind).raw(id).raw(tag).i64(created).toByteArray()

    fun encode(): ByteArray {
        val w = ByteWriter(body.size + 64)
        w.u8(1).u8(kind).raw(id).raw(tag).i64(created).u32((expires - created) / 1000).u8(hops)
        if (refId != null) { w.u8(1).raw(refId) } else w.u8(0)
        w.bytes(body)
        return w.toByteArray()
    }

    companion object {
        const val MAX_BODY = 600_000
        fun decode(b: ByteArray): Envelope? = try {
            val r = ByteReader(b)
            require(r.u8() == 1)
            val kind = r.u8(); val id = r.raw(16); val tag = r.raw(Tags.LEN)
            val created = r.i64(); val ttl = r.u32() * 1000; val hops = r.u8()
            val ref = if (r.u8() == 1) r.raw(16) else null
            val body = r.bytes()
            require(body.size <= MAX_BODY && kind in 1..5)
            Envelope(id, kind, tag, created, created + ttl, hops, ref, body)
        } catch (e: Exception) { null }

        fun newId() = Rand.bytes(16)

        // ---------- DIRECT ----------
        fun direct(me: Identity, to: Peer, payload: ByteArray, ttlMs: Long = TTL_DEFAULT, id: ByteArray = newId()): Envelope {
            val created = now()
            val tag = to.tag
            val proto = Envelope(id, Kind.DIRECT, tag, created, created + ttlMs, 0, null, ByteArray(0))
            val sig = me.sign(sigInput("dm", proto, payload))
            val inner = ByteWriter(payload.size + 160).raw(me.address).raw(sig).raw(payload).toByteArray()
            val body = SealedBox.seal(to.boxPub, inner, proto.aad())
            return Envelope(id, Kind.DIRECT, tag, created, created + ttlMs, 0, null, body)
        }

        class Opened(val sender: Peer, val payload: ByteArray)

        fun openDirect(me: Identity, e: Envelope): Opened? {
            if (e.kind != Kind.DIRECT) return null
            val inner = SealedBox.open(me, e.body, e.aad()) ?: return null
            if (inner.size < 128) return null
            val sender = Peer.fromAddress(inner.copyOfRange(0, 64))
            val sig = inner.copyOfRange(64, 128)
            val payload = inner.copyOfRange(128, inner.size)
            if (!Sig.verify(sender.signPub, sigInput("dm", e, payload), sig)) return null
            return Opened(sender, payload)
        }

        // ---------- GROUP ----------
        fun group(me: Identity, groupId: ByteArray, key: ByteArray, payload: ByteArray, ttlMs: Long = TTL_DEFAULT, id: ByteArray = newId()): Envelope {
            val created = now(); val tag = Tags.group(groupId)
            val proto = Envelope(id, Kind.GROUP, tag, created, created + ttlMs, 0, null, ByteArray(0))
            val sig = me.sign(sigInput("grp", proto, payload))
            val inner = ByteWriter(payload.size + 100).raw(me.signPub).raw(sig).raw(payload).toByteArray()
            return Envelope(id, Kind.GROUP, tag, created, created + ttlMs, 0, null, Aead.seal(key, inner, proto.aad()))
        }

        /** Returns (senderSignPub, payload) or null. */
        fun openGroup(key: ByteArray, e: Envelope): Pair<ByteArray, ByteArray>? {
            if (e.kind != Kind.GROUP) return null
            val inner = Aead.open(key, e.body, e.aad()) ?: return null
            if (inner.size < 96) return null
            val pub = inner.copyOfRange(0, 32); val sig = inner.copyOfRange(32, 96); val payload = inner.copyOfRange(96, inner.size)
            if (!Sig.verify(pub, sigInput("grp", e, payload), sig)) return null
            return pub to payload
        }

        // ---------- CHANNEL ----------
        /** signer may be the channel key (posts) or any member (reactions, views). `key` null = public channel. */
        fun channel(chanPub: ByteArray, signerPub: ByteArray, signFn: (ByteArray) -> ByteArray, key: ByteArray?, payload: ByteArray, ttlMs: Long = TTL_CHANNEL, id: ByteArray = newId()): Envelope {
            val created = now(); val tag = Tags.channel(chanPub)
            val proto = Envelope(id, Kind.CHANNEL, tag, created, created + ttlMs, 0, null, ByteArray(0))
            val sig = signFn(sigInput("chn", proto, payload))
            val data = if (key != null) Aead.seal(key, payload, proto.aad()) else payload
            val body = ByteWriter(data.size + 140).raw(chanPub).raw(signerPub).raw(sig).u8(if (key != null) 1 else 0).raw(data).toByteArray()
            return Envelope(id, Kind.CHANNEL, tag, created, created + ttlMs, 0, null, body)
        }

        class ChannelOpened(val chanPub: ByteArray, val signerPub: ByteArray, val payload: ByteArray)

        fun openChannel(e: Envelope, key: ByteArray?): ChannelOpened? {
            if (e.kind != Kind.CHANNEL || e.body.size < 129) return null
            val chanPub = e.body.copyOfRange(0, 32); val signer = e.body.copyOfRange(32, 64); val sig = e.body.copyOfRange(64, 128)
            val enc = e.body[128].toInt() == 1
            val data = e.body.copyOfRange(129, e.body.size)
            if (!Tags.channel(chanPub).contentEquals(e.tag)) return null
            val payload = if (enc) { if (key == null) return null; Aead.open(key, data, e.aad()) ?: return null } else data
            if (!Sig.verify(signer, sigInput("chn", e, payload), sig)) return null
            return ChannelOpened(chanPub, signer, payload)
        }

        // ---------- ANNOUNCE (serverless directory) ----------
        val DIRECTORY_TAG: ByteArray by lazy { Tags.topic("directory") }

        fun announce(signerPub: ByteArray, signFn: (ByteArray) -> ByteArray, payload: ByteArray, ttlMs: Long = TTL_ANNOUNCE): Envelope {
            val id = newId(); val created = now()
            val proto = Envelope(id, Kind.ANNOUNCE, DIRECTORY_TAG, created, created + ttlMs, 0, null, ByteArray(0))
            val sig = signFn(sigInput("ann", proto, payload))
            return Envelope(id, Kind.ANNOUNCE, DIRECTORY_TAG, created, created + ttlMs, 0, null, ByteWriter().raw(signerPub).raw(sig).raw(payload).toByteArray())
        }
        fun openAnnounce(e: Envelope): Pair<ByteArray, ByteArray>? {
            if (e.kind != Kind.ANNOUNCE || e.body.size < 97 || !e.tag.contentEquals(DIRECTORY_TAG)) return null
            val pub = e.body.copyOfRange(0, 32); val sig = e.body.copyOfRange(32, 96); val payload = e.body.copyOfRange(96, e.body.size)
            return if (Sig.verify(pub, sigInput("ann", e, payload), sig)) pub to payload else null
        }

        // ---------- ACK ----------
        /** Receipt sealed to the original sender; refId is visible so relays can drop their copy. */
        fun ack(me: Identity, to: Peer, delivered: ByteArray, extra: ByteArray = ByteArray(0)): Envelope {
            val id = newId(); val created = now()
            val proto = Envelope(id, Kind.ACK, to.tag, created, created + TTL_ACK, 0, delivered, ByteArray(0))
            val sig = me.sign(sigInput("ack", proto, delivered + extra))
            val inner = ByteWriter().raw(me.signPub).raw(sig).bytes(extra).toByteArray()
            return Envelope(id, Kind.ACK, to.tag, created, created + TTL_ACK, 0, delivered, SealedBox.seal(to.boxPub, inner, proto.aad()))
        }

        class AckOpened(val signerPub: ByteArray, val extra: ByteArray)
        fun openAck(me: Identity, e: Envelope): AckOpened? {
            if (e.kind != Kind.ACK || e.refId == null) return null
            val inner = SealedBox.open(me, e.body, e.aad()) ?: return null
            return try {
                val r = ByteReader(inner); val pub = r.raw(32); val sig = r.raw(64); val extra = r.bytes()
                if (!Sig.verify(pub, sigInput("ack", e, e.refId + extra), sig)) null else AckOpened(pub, extra)
            } catch (x: Exception) { null }
        }

        private fun sigInput(ctx: String, e: Envelope, payload: ByteArray) =
            ByteWriter(payload.size + 80).raw(("orbit.sig." + ctx).utf8()).raw(e.aad()).raw(payload).toByteArray()

        const val TTL_DEFAULT = 14L * 24 * 3600 * 1000
        const val TTL_CHANNEL = 60L * 24 * 3600 * 1000
        const val TTL_ANNOUNCE = 3L * 24 * 3600 * 1000
        const val TTL_ACK = 7L * 24 * 3600 * 1000
        const val TTL_EPHEMERAL = 30L * 1000
    }
}
