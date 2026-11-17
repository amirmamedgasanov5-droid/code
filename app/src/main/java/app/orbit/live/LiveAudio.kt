package app.orbit.live

import android.annotation.SuppressLint
import android.media.*
import android.os.Process
import java.nio.ByteBuffer
import java.util.TreeMap
import java.util.concurrent.ConcurrentHashMap

/**
 * Real-time voice: 16 kHz mono, AAC-LC at 24 kbps (≈190 bytes / 64 ms frame) using the phone's hardware codec.
 * Small enough for Bluetooth links, good enough for conversation.
 */
class LiveAudio {
    private var rec: AudioRecord? = null
    private var enc: MediaCodec? = null
    @Volatile private var capturing = false
    private var capThread: Thread? = null
    private val players = ConcurrentHashMap<String, SpeakerPlayer>()

    @SuppressLint("MissingPermission")
    fun startCapture(onFrame: (ByteArray) -> Unit): Boolean {
        if (capturing) return true
        return try {
            val min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            val r = AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, 8192))
            if (r.state != AudioRecord.STATE_INITIALIZED) { r.release(); return false }
            val fmt = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, RATE, 1).apply {
                setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC); setInteger(MediaFormat.KEY_BIT_RATE, 24000); setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 4096)
            }
            val e = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC); e.configure(fmt, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE); e.start()
            rec = r; enc = e; capturing = true; r.startRecording()
            capThread = Thread {
                Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
                val pcm = ByteArray(2048); val info = MediaCodec.BufferInfo(); var pts = 0L
                while (capturing) {
                    val n = r.read(pcm, 0, pcm.size); if (n <= 0) continue
                    val i = e.dequeueInputBuffer(10_000)
                    if (i >= 0) { val b = e.getInputBuffer(i)!!; b.clear(); b.put(pcm, 0, n); e.queueInputBuffer(i, 0, n, pts, 0); pts += n / 2 * 1_000_000L / RATE }
                    while (true) {
                        val o = e.dequeueOutputBuffer(info, 0); if (o < 0) break
                        if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0 && info.size > 0) { val out = ByteArray(info.size); e.getOutputBuffer(o)!!.apply { position(info.offset); get(out) }; onFrame(out) }
                        e.releaseOutputBuffer(o, false)
                    }
                }
            }.also { it.name = "orbit-capture"; it.start() }
            true
        } catch (ex: Exception) { stopCapture(); false }
    }

    fun stopCapture() {
        capturing = false
        try { capThread?.join(300) } catch (_: Exception) {}
        try { rec?.stop() } catch (_: Exception) {}; rec?.release(); rec = null
        try { enc?.stop() } catch (_: Exception) {}; enc?.release(); enc = null
    }

    fun play(speaker: String, seq: Long, frame: ByteArray) { players.getOrPut(speaker) { SpeakerPlayer().also { it.start() } }.push(seq, frame) }
    fun stopPlayback(speaker: String? = null) { if (speaker == null) { players.values.forEach { it.stop() }; players.clear() } else players.remove(speaker)?.stop() }
    fun release() { stopCapture(); stopPlayback() }

    companion object { const val RATE = 16000 }

    /** One decoder + AudioTrack per remote speaker; frames are re-ordered by sequence number in a tiny jitter buffer. */
    private class SpeakerPlayer {
        private val buf = TreeMap<Long, Pair<ByteArray, Long>>()
        @Volatile private var running = true
        private var nextSeq = -1L
        private var thread: Thread? = null
        private var dec: MediaCodec? = null
        private var track: AudioTrack? = null
        fun push(seq: Long, f: ByteArray) { synchronized(buf) { if (nextSeq < 0) nextSeq = seq; if (seq >= nextSeq) buf[seq] = f to System.currentTimeMillis() } }
        fun start() {
            thread = Thread {
                Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
                try {
                    val fmt = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, RATE, 1).apply { setByteBuffer("csd-0", ByteBuffer.wrap(byteArrayOf(0x14, 0x08))); setInteger(MediaFormat.KEY_IS_ADTS, 0) }
                    val d = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_AUDIO_AAC); d.configure(fmt, null, null, 0); d.start(); dec = d
                    val min = AudioTrack.getMinBufferSize(RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
                    val t = AudioTrack.Builder().setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                        .setAudioFormat(AudioFormat.Builder().setSampleRate(RATE).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build()).setBufferSizeInBytes(maxOf(min * 2, 8192)).setTransferMode(AudioTrack.MODE_STREAM).build()
                    t.play(); track = t
                    val info = MediaCodec.BufferInfo(); var pts = 0L
                    while (running) {
                        val item = synchronized(buf) {
                            val first = buf.firstEntry()
                            if (first == null) null
                            else if (first.key == nextSeq || buf.size >= 4 || System.currentTimeMillis() - first.value.second > 160) { buf.pollFirstEntry().also { nextSeq = it.key + 1 } } else null
                        }
                        if (item == null) { Thread.sleep(8); continue }
                        val i = d.dequeueInputBuffer(10_000)
                        if (i >= 0) { val b = d.getInputBuffer(i)!!; b.clear(); b.put(item.value.first); d.queueInputBuffer(i, 0, item.value.first.size, pts, 0); pts += 64_000 }
                        while (true) {
                            val o = d.dequeueOutputBuffer(info, 0); if (o < 0) break
                            val out = ByteArray(info.size); d.getOutputBuffer(o)!!.apply { position(info.offset); get(out) }; d.releaseOutputBuffer(o, false)
                            if (out.isNotEmpty()) t.write(out, 0, out.size)
                        }
                    }
                } catch (_: Exception) {}
            }.also { it.name = "orbit-play"; it.start() }
        }
        fun stop() { running = false; try { thread?.join(300) } catch (_: Exception) {}; try { track?.stop() } catch (_: Exception) {}; track?.release(); try { dec?.stop() } catch (_: Exception) {}; dec?.release() }
    }
}
