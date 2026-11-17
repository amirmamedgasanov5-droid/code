package app.orbit.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayOutputStream
import java.io.File

object Imaging {
    /** Decode, fix EXIF rotation, scale to maxDim and JPEG-compress. Mesh-friendly sizes: 1280/72 online, 640/55 offline. */
    fun compress(ctx: Context, uri: Uri, maxDim: Int, quality: Int): ByteArray? = try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (bounds.outWidth / sample > maxDim * 2 || bounds.outHeight / sample > maxDim * 2) sample *= 2
        var bmp = ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) } ?: return null
        val rot = ctx.contentResolver.openInputStream(uri)?.use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1) } ?: 1
        val deg = when (rot) { 6 -> 90f; 3 -> 180f; 8 -> 270f; else -> 0f }
        val scale = maxDim.toFloat() / maxOf(bmp.width, bmp.height)
        if (scale < 1f || deg != 0f) { val m = Matrix().apply { if (scale < 1f) postScale(scale, scale); postRotate(deg) }; bmp = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true) }
        ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.JPEG, quality, it) }.toByteArray()
    } catch (e: Exception) { null }

    fun decodeFile(f: File, maxDim: Int): Bitmap? = try {
        val b = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeFile(f.path, b)
        var s = 1; while (b.outWidth / s > maxDim * 2 || b.outHeight / s > maxDim * 2) s *= 2
        BitmapFactory.decodeFile(f.path, BitmapFactory.Options().apply { inSampleSize = s })
    } catch (e: Exception) { null }

    fun size(f: File): Pair<Int, Int> { val b = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeFile(f.path, b); return b.outWidth to b.outHeight }
}

/** Voice notes: AAC in MP4, 16 kHz mono 24 kbps ≈ 3 KB/s, small enough to hop through Bluetooth relays. */
class VoiceRecorder(private val ctx: Context) {
    private var rec: MediaRecorder? = null
    private var file: File? = null
    private var startedAt = 0L
    fun start(): Boolean = try {
        val f = File(ctx.cacheDir, "rec_${System.currentTimeMillis()}.m4a"); file = f
        val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(ctx) else @Suppress("DEPRECATION") MediaRecorder()
        r.setAudioSource(MediaRecorder.AudioSource.MIC); r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4); r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        r.setAudioSamplingRate(16000); r.setAudioEncodingBitRate(24000); r.setAudioChannels(1); r.setOutputFile(f.absolutePath)
        r.prepare(); r.start(); rec = r; startedAt = System.currentTimeMillis(); true
    } catch (e: Exception) { rec = null; false }
    val elapsed get() = if (rec == null) 0L else System.currentTimeMillis() - startedAt
    /** Returns (bytes, durationMs) or null when cancelled / too short. */
    fun stop(send: Boolean): Pair<ByteArray, Int>? {
        val r = rec ?: return null; rec = null
        val dur = (System.currentTimeMillis() - startedAt).toInt()
        try { r.stop() } catch (e: Exception) { file?.delete(); return null } finally { r.release() }
        val f = file ?: return null
        val bytes = if (send && dur > 700) f.readBytes() else null
        f.delete()
        return bytes?.let { it to dur }
    }
}

object VoicePlayer {
    private var mp: MediaPlayer? = null
    var playingId by mutableStateOf<String?>(null); private set
    var position by mutableLongStateOf(0L); private set
    var duration by mutableLongStateOf(0L); private set

    fun toggle(id: String, file: File) {
        if (playingId == id) { stop(); return }
        stop()
        try {
            val p = MediaPlayer(); p.setDataSource(file.absolutePath); p.prepare(); p.start(); mp = p
            playingId = id; duration = p.duration.toLong(); position = 0
            p.setOnCompletionListener { stop() }
        } catch (e: Exception) { stop() }
    }
    fun tick() { mp?.let { position = it.currentPosition.toLong() } }
    fun stop() { try { mp?.stop() } catch (_: Exception) {}; mp?.release(); mp = null; playingId = null; position = 0 }
}
