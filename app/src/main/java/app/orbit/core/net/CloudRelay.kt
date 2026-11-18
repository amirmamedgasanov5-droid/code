package app.orbit.core.net

import app.orbit.core.*
import app.orbit.core.mesh.Envelope
import app.orbit.core.mesh.Framer
import app.orbit.core.mesh.Reassembler
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.Base64

/**
 * Optional fallback for when two phones cannot reach each other directly (carrier NAT, different networks).
 * Already end-to-end encrypted envelopes are dropped into a public HTTP pub/sub topic (ntfy protocol) named after
 * the recipient's routing tag, and picked up by long-polling that topic. The relay learns IP addresses, routing tags,
 * sizes and timing, never contents. Any ntfy-compatible server works, including your own.
 */
class CloudRelay(
    private val scope: CoroutineScope,
    private val base: String,
    private val tags: () -> List<ByteArray>,
    private val onEnvelope: suspend (Envelope) -> Unit,
    private val maxEnvelope: Int = 120_000,
    private val chunk: Int = 2300,
) {
    private var job: Job? = null
    private val reasm = Reassembler(maxPending = 32, maxFrame = 400_000)
    private val _online = MutableStateFlow(false); val online: StateFlow<Boolean> = _online
    @Volatile var published = 0; @Volatile var received = 0
    @Volatile var lastError = ""; @Volatile var lastOk = 0L; @Volatile var topicsCount = 0
    @Volatile private var pausedUntil = 0L
    /** true while publishing works (used to avoid pointless re-sends) */
    val healthy: Boolean get() = _online.value && lastError.isEmpty() && System.currentTimeMillis() > pausedUntil
    @Volatile private var since = (System.currentTimeMillis() / 1000) - 12 * 3600

    fun topic(tag: ByteArray) = "orbit1" + tag.hex()

    fun start() {
        if (job != null) return
        job = scope.launch(Dispatchers.IO) {
            var backoff = 2000L
            while (isActive) {
                val topics = tags().map { topic(it) }.distinct().take(25)
                if (topics.isEmpty()) { delay(3000); continue }
                try {
                    topicsCount = topics.size
                    listen(topics)
                    backoff = 2000L
                } catch (e: CancellationException) { throw e } catch (e: Exception) { _online.value = false; lastError = (e.javaClass.simpleName + ": " + (e.message ?: "")).take(120); delay(backoff); backoff = (backoff * 2).coerceAtMost(60_000) }
            }
        }
    }

    fun stop() { job?.cancel(); job = null; _online.value = false }

    private suspend fun listen(topics: List<String>) = withContext(Dispatchers.IO) {
        val url = URL("$base/${topics.joinToString(",")}/json?since=$since")
        val c = url.openConnection() as HttpURLConnection
        c.connectTimeout = 10_000; c.readTimeout = 90_000
        try {
            if (c.responseCode != 200) throw RuntimeException("relay http ${c.responseCode}")
            val r = BufferedReader(InputStreamReader(c.inputStream, Charsets.UTF_8))
            val opened = System.currentTimeMillis()
            while (isActive) {
                val line = r.readLine() ?: break
                val j = try { JSONObject(line) } catch (e: Exception) { continue }
                when (j.optString("event")) {
                    "open" -> { _online.value = true; lastOk = System.currentTimeMillis(); lastError = "" }
                    "message" -> {
                        val t = j.optLong("time", 0); if (t > since) since = t
                        val frame = try { Base64.getDecoder().decode(j.optString("message").trim()) } catch (e: Exception) { continue }
                        val whole = reasm.feed(frame) ?: continue
                        val env = Envelope.decode(whole) ?: continue
                        received++
                        try { onEnvelope(env) } catch (_: Exception) {}
                    }
                }
                // topics changed (new group / channel)? reconnect so the subscription follows
                if (System.currentTimeMillis() - opened > 25_000 && tags().map { topic(it) }.distinct().take(25) != topics) break
            }
        } finally { c.disconnect() }
    }

    /** Fire and forget with retries; big envelopes are split into several small messages. */
    fun publish(e: Envelope) {
        val bytes = e.encode()
        if (bytes.size > maxEnvelope) return
        val t = topic(e.tag)
        scope.launch(Dispatchers.IO) {
            if (System.currentTimeMillis() < pausedUntil) return@launch      // server told us to stop: do not hammer it
            for (part in Framer.split(bytes, chunk)) {
                var ok = false; var wait = 1000L
                repeat(5) {
                    if (!ok) {
                        ok = try { post(t, Base64.getEncoder().encodeToString(part)) } catch (ex: Exception) { lastError = ("send: " + ex.javaClass.simpleName + " " + (ex.message ?: "")).take(120); false }
                        if (!ok) { delay(wait); wait *= 2 }
                    }
                }
                if (!ok) return@launch
            }
            published++; lastOk = System.currentTimeMillis(); if (lastError.startsWith("HTTP") || lastError.startsWith("send:")) lastError = ""
        }
    }

    private fun post(topic: String, body: String): Boolean {
        val c = URL("$base/$topic").openConnection() as HttpURLConnection
        return try {
            c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 8000; c.readTimeout = 8000
            c.setRequestProperty("Content-Type", "text/plain")
            c.outputStream.use { it.write(body.toByteArray()) }
            val code = c.responseCode
            if (code == 429) { pausedUntil = System.currentTimeMillis() + 10 * 60_000; lastError = "HTTP 429: the relay server's rate/daily limit is reached. Paused for 10 min; messages stay queued on this phone." }
            else if (code !in 200..299) lastError = "HTTP $code from relay server"
            code in 200..299
        } finally { c.disconnect() }
    }
}
