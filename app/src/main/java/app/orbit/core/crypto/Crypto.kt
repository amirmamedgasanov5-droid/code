package app.orbit.core.crypto

import app.orbit.core.*
import com.google.crypto.tink.subtle.ChaCha20Poly1305
import com.google.crypto.tink.subtle.Ed25519Sign
import com.google.crypto.tink.subtle.Ed25519Verify
import com.google.crypto.tink.subtle.Hkdf
import com.google.crypto.tink.subtle.X25519

/**
 * A user identity. Everything derives from one 32-byte seed so a user can restore the
 * account from a recovery key: Ed25519 signing key + X25519 agreement key (HKDF-separated).
 */
class Identity private constructor(val seed: ByteArray) {
    private val edPriv: ByteArray
    val signPub: ByteArray
    private val xPriv: ByteArray
    val boxPub: ByteArray

    init {
        val kp = Ed25519Sign.KeyPair.newKeyPairFromSeed(Hkdf.computeHkdf("HMACSHA256", seed, ByteArray(0), "orbit/ed25519".utf8(), 32))
        edPriv = kp.privateKey; signPub = kp.publicKey
        xPriv = Hkdf.computeHkdf("HMACSHA256", seed, ByteArray(0), "orbit/x25519".utf8(), 32)
        boxPub = X25519.publicFromPrivate(xPriv)
    }

    /** Public address of the user: sign key + box key (64 bytes). Shared in links. */
    val address: ByteArray get() = signPub + boxPub
    val id: String get() = Peer.idOf(signPub)

    fun sign(msg: ByteArray): ByteArray = Ed25519Sign(edPriv).sign(msg)
    fun agree(theirBoxPub: ByteArray): ByteArray = X25519.computeSharedSecret(xPriv, theirBoxPub)

    fun recoveryKey(): String = Base32.encode(seed).chunked(4).joinToString("-")

    companion object {
        fun generate() = Identity(Rand.bytes(32))
        fun fromSeed(seed: ByteArray) = Identity(seed.copyOf())
        fun fromRecoveryKey(s: String) = Identity(Base32.decode(s.replace("-", "").replace(" ", "")).also { require(it.size == 32) { "bad key" } })
    }
}

/** Remote party: public half of an [Identity]. */
data class Peer(val signPub: ByteArray, val boxPub: ByteArray) {
    val id: String get() = idOf(signPub)
    val address: ByteArray get() = signPub + boxPub
    val tag: ByteArray get() = Tags.user(signPub)
    override fun equals(other: Any?) = other is Peer && other.signPub.contentEquals(signPub)
    override fun hashCode() = signPub.contentHashCode()

    companion object {
        fun idOf(signPub: ByteArray) = signPub.hex()
        fun fromAddress(a: ByteArray): Peer { require(a.size == 64) { "bad address" }; return Peer(a.copyOfRange(0, 32), a.copyOfRange(32, 64)) }
        fun fromId(hexId: String, boxPub: ByteArray) = Peer(hexId.unhex(), boxPub)
    }
}

object Tags {
    const val LEN = 8
    fun user(signPub: ByteArray) = sha256("orbit.user".utf8(), signPub).copyOf(LEN)
    fun group(groupId: ByteArray) = sha256("orbit.group".utf8(), groupId).copyOf(LEN)
    fun channel(chanPub: ByteArray) = sha256("orbit.chan".utf8(), chanPub).copyOf(LEN)
    fun topic(name: String) = sha256("orbit.topic".utf8(), name.utf8()).copyOf(LEN)
}

object Sig {
    fun verify(pub: ByteArray, msg: ByteArray, sig: ByteArray): Boolean = try {
        Ed25519Verify(pub).verify(sig, msg); true
    } catch (e: Exception) { false }
}

object Aead {
    fun seal(key: ByteArray, plain: ByteArray, aad: ByteArray = ByteArray(0)): ByteArray = ChaCha20Poly1305(key).encrypt(plain, aad)
    fun open(key: ByteArray, boxed: ByteArray, aad: ByteArray = ByteArray(0)): ByteArray? = try {
        ChaCha20Poly1305(key).decrypt(boxed, aad)
    } catch (e: Exception) { null }
}

/**
 * Anonymous sealed box: ephemeral X25519 -> recipient box key. Relays learn nothing but the routing tag.
 * Layout: ephPub(32) | AEAD(ct). Key = HKDF(ECDH || ephPub || recipPub).
 */
object SealedBox {
    fun seal(recipientBoxPub: ByteArray, plain: ByteArray, aad: ByteArray): ByteArray {
        val ePriv = X25519.generatePrivateKey()
        val ePub = X25519.publicFromPrivate(ePriv)
        val k = derive(X25519.computeSharedSecret(ePriv, recipientBoxPub), ePub, recipientBoxPub)
        return ePub + Aead.seal(k, plain, aad)
    }
    fun open(me: Identity, boxed: ByteArray, aad: ByteArray): ByteArray? {
        if (boxed.size < 32 + 28) return null
        val ePub = boxed.copyOfRange(0, 32)
        val k = try { derive(me.agree(ePub), ePub, me.boxPub) } catch (e: Exception) { return null }
        return Aead.open(k, boxed.copyOfRange(32, boxed.size), aad)
    }
    private fun derive(shared: ByteArray, ePub: ByteArray, rPub: ByteArray) =
        Hkdf.computeHkdf("HMACSHA256", shared, ePub + rPub, "orbit/sealed".utf8(), 32)
}

/** Static-static key for 1:1 sessions with forward-looking rotation hooks (used by live audio & PTT). */
object Session {
    fun key(me: Identity, theirBoxPub: ByteArray, context: String): ByteArray =
        Hkdf.computeHkdf("HMACSHA256", me.agree(theirBoxPub), ByteArray(0), "orbit/session/$context".utf8(), 32)
}
