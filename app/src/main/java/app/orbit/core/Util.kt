package app.orbit.core

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.security.SecureRandom

object Rand {
    val sr = SecureRandom()
    fun bytes(n: Int): ByteArray = ByteArray(n).also { sr.nextBytes(it) }
}

private val HEX = "0123456789abcdef".toCharArray()
fun ByteArray.hex(): String {
    val c = CharArray(size * 2)
    for (i in indices) { val v = this[i].toInt() and 0xff; c[i * 2] = HEX[v ushr 4]; c[i * 2 + 1] = HEX[v and 15] }
    return String(c)
}
fun String.unhex(): ByteArray {
    require(length % 2 == 0) { "bad hex" }
    val out = ByteArray(length / 2)
    for (i in out.indices) out[i] = ((Character.digit(this[i * 2], 16) shl 4) or Character.digit(this[i * 2 + 1], 16)).toByte()
    return out
}
fun sha256(vararg parts: ByteArray): ByteArray {
    val md = MessageDigest.getInstance("SHA-256")
    for (p in parts) md.update(p)
    return md.digest()
}
fun sha1(b: ByteArray): ByteArray = MessageDigest.getInstance("SHA-1").digest(b)
fun String.utf8(): ByteArray = toByteArray(Charsets.UTF_8)
fun ByteArray.str(): String = String(this, Charsets.UTF_8)

/** RFC4648 base32 without padding, lowercase: human friendly for links & recovery keys. */
object Base32 {
    private const val A = "abcdefghijklmnopqrstuvwxyz234567"
    fun encode(data: ByteArray): String {
        val sb = StringBuilder()
        var buffer = 0; var bits = 0
        for (b in data) {
            buffer = (buffer shl 8) or (b.toInt() and 0xff); bits += 8
            while (bits >= 5) { sb.append(A[(buffer shr (bits - 5)) and 31]); bits -= 5 }
        }
        if (bits > 0) sb.append(A[(buffer shl (5 - bits)) and 31])
        return sb.toString()
    }
    fun decode(s: String): ByteArray {
        val out = ByteArrayOutputStream()
        var buffer = 0; var bits = 0
        for (ch in s.lowercase()) {
            if (ch == ' ' || ch == '-') continue
            val v = A.indexOf(ch)
            require(v >= 0) { "bad base32 char" }
            buffer = (buffer shl 5) or v; bits += 5
            if (bits >= 8) { out.write((buffer shr (bits - 8)) and 0xff); bits -= 8 }
        }
        return out.toByteArray()
    }
}

class ByteWriter(cap: Int = 256) {
    private val out = ByteArrayOutputStream(cap)
    fun u8(v: Int) = apply { out.write(v) }
    fun u16(v: Int) = apply { out.write(v ushr 8); out.write(v) }
    fun u32(v: Long) = apply { for (i in 3 downTo 0) out.write((v ushr (8 * i)).toInt()) }
    fun i64(v: Long) = apply { for (i in 7 downTo 0) out.write((v ushr (8 * i)).toInt()) }
    fun raw(b: ByteArray) = apply { out.write(b) }
    fun raw(b: ByteArray, off: Int, len: Int) = apply { out.write(b, off, len) }
    fun bytes(b: ByteArray) = apply { varint(b.size.toLong()); out.write(b) }
    fun str(s: String) = bytes(s.utf8())
    fun varint(v0: Long) = apply { var v = v0; while (v >= 0x80) { out.write(((v and 0x7f) or 0x80).toInt()); v = v ushr 7 }; out.write(v.toInt()) }
    fun toByteArray(): ByteArray = out.toByteArray()
}

class ByteReader(private val b: ByteArray, var pos: Int = 0, private val end: Int = b.size) {
    val remaining get() = end - pos
    fun u8(): Int { need(1); return b[pos++].toInt() and 0xff }
    fun u16(): Int = (u8() shl 8) or u8()
    fun u32(): Long { var v = 0L; repeat(4) { v = (v shl 8) or u8().toLong() }; return v }
    fun i64(): Long { var v = 0L; repeat(8) { v = (v shl 8) or u8().toLong() }; return v }
    fun raw(n: Int): ByteArray { need(n); val r = b.copyOfRange(pos, pos + n); pos += n; return r }
    fun rest(): ByteArray = raw(remaining)
    fun varint(): Long {
        var shift = 0; var r = 0L
        while (true) { val x = u8(); r = r or ((x and 0x7f).toLong() shl shift); if (x < 0x80) return r; shift += 7; require(shift < 64) }
    }
    fun bytes(): ByteArray { val n = varint(); require(n in 0..remaining) { "bad length" }; return raw(n.toInt()) }
    fun str(): String = bytes().str()
    private fun need(n: Int) { if (n < 0 || pos + n > end) throw IllegalArgumentException("truncated") }
}

fun now() = System.currentTimeMillis()
fun ByteArray.sameAs(o: ByteArray) = MessageDigest.isEqual(this, o)
fun longBytes(v: Long): ByteArray = ByteBuffer.allocate(8).putLong(v).array()
