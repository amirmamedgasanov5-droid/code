package app.orbit.core.mesh

import app.orbit.core.*
import java.util.concurrent.atomic.AtomicInteger

/**
 * Splits big logical frames into transport-sized chunks and reassembles them.
 * Chunk: frameNo(u32) | idx(u16) | count(u16) | data
 */
object Framer {
    const val HEADER = 8
    private val counter = AtomicInteger(Rand.sr.nextInt())

    fun split(frame: ByteArray, maxChunk: Int): List<ByteArray> {
        val payload = maxChunk - HEADER
        require(payload > 0)
        val count = maxOf(1, (frame.size + payload - 1) / payload)
        require(count < 65535) { "frame too large" }
        val no = counter.incrementAndGet().toLong() and 0xffffffffL
        return (0 until count).map { i ->
            val from = i * payload; val to = minOf(frame.size, from + payload)
            ByteWriter(to - from + HEADER).u32(no).u16(i).u16(count).raw(frame, from, to - from).toByteArray()
        }
    }
}

class Reassembler(private val maxPending: Int = 8, private val maxFrame: Int = 1_000_000) {
    private class Partial(val count: Int) { val parts = arrayOfNulls<ByteArray>(count); var got = 0; var size = 0 }
    private val pending = LinkedHashMap<Long, Partial>()

    @Synchronized
    fun feed(chunk: ByteArray): ByteArray? {
        if (chunk.size < Framer.HEADER) return null
        val r = ByteReader(chunk)
        val no = r.u32(); val idx = r.u16(); val count = r.u16()
        if (count == 0 || idx >= count) return null
        if (count == 1) return r.rest()
        val p = pending.getOrPut(no) { Partial(count) }
        if (p.count != count) { pending.remove(no); return null }
        if (p.parts[idx] == null) { val d = r.rest(); p.parts[idx] = d; p.got++; p.size += d.size }
        if (p.size > maxFrame) { pending.remove(no); return null }
        while (pending.size > maxPending) pending.remove(pending.keys.first())
        if (p.got == p.count) {
            pending.remove(no)
            val out = ByteWriter(p.size)
            for (x in p.parts) out.raw(x!!)
            return out.toByteArray()
        }
        return null
    }
}
