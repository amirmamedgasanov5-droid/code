package app.orbit.core.net

import java.io.ByteArrayOutputStream

/** Minimal bencode (BEP 3) used by the BitTorrent mainline DHT. Values: Long, ByteArray, List, Map<String, Any>. */
object Bencode {
    fun encode(v: Any?): ByteArray = ByteArrayOutputStream().also { write(it, v) }.toByteArray()

    private fun write(o: ByteArrayOutputStream, v: Any?) {
        when (v) {
            is Int -> o.write("i${v}e".toByteArray())
            is Long -> o.write("i${v}e".toByteArray())
            is ByteArray -> { o.write("${v.size}:".toByteArray()); o.write(v) }
            is String -> write(o, v.toByteArray(Charsets.ISO_8859_1))
            is List<*> -> { o.write('l'.code); v.forEach { write(o, it) }; o.write('e'.code) }
            is Map<*, *> -> {
                o.write('d'.code)
                v.entries.sortedBy { it.key as String }.forEach { (k, x) -> write(o, k as String); write(o, x) }
                o.write('e'.code)
            }
            else -> throw IllegalArgumentException("cannot bencode ${v?.javaClass}")
        }
    }

    fun decode(b: ByteArray): Any? = Reader(b).let { it.read() }

    private class Reader(val b: ByteArray, var p: Int = 0) {
        fun read(): Any? {
            if (p >= b.size) throw IllegalArgumentException("eof")
            return when (val c = b[p].toInt().toChar()) {
                'i' -> { p++; val e = idx('e'); val n = String(b, p, e - p).toLong(); p = e + 1; n }
                'l' -> { p++; val l = ArrayList<Any?>(); while (b[p].toInt().toChar() != 'e') l.add(read()); p++; l }
                'd' -> { p++; val m = LinkedHashMap<String, Any?>(); while (b[p].toInt().toChar() != 'e') { val k = String(read() as ByteArray, Charsets.ISO_8859_1); m[k] = read() }; p++; m }
                in '0'..'9' -> { val e = idx(':'); val n = String(b, p, e - p).toInt(); require(n >= 0 && e + 1 + n <= b.size); val r = b.copyOfRange(e + 1, e + 1 + n); p = e + 1 + n; r }
                else -> throw IllegalArgumentException("bad bencode at $p: $c")
            }
        }
        fun idx(ch: Char): Int { var i = p; while (i < b.size && b[i].toInt().toChar() != ch) i++; require(i < b.size); return i }
    }
}

@Suppress("UNCHECKED_CAST")
fun Any?.asMap(): Map<String, Any?>? = this as? Map<String, Any?>
fun Any?.asBytes(): ByteArray? = this as? ByteArray
fun Any?.asLong(): Long? = this as? Long
