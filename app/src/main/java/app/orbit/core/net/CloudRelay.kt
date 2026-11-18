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
import java.util.concurrent.ConcurrentHashMap

/**
 * Optional fallback for when two phones cannot reach each other directly (carrier NAT, different networks).
 * Already end-to-end encrypted envelopes are dropped into a public HTTP pub/sub topic (ntfy protocol) named after
 * the recipient's routing tag, and picked up by long-polling that topic. The relay learns IP addresses, routing tags,
 * sizes and timing, never contents.
 *
 * Several servers can be used at once: every envelope is published to ALL of them and all of them are listened to, so
 * if one server is blocked or down on your network, any other reachable one still carries the message.
 */
class CloudRelay(
    private val scope: CoroutineScope,
    private val bases: List<String>,
    private val tags: () -> List<ByteArray>,
    private val onEnvelope: suspend (Envelope) -> Unit,
    private val maxEnvelope: Int = 120_000,
    private val chunk: Int = 2800,
) {
    constructor(scope: CoroutineScope, base: String, tags: () -> List<ByteArray>, onEnvelope: suspend (Envelope) -> Unit) : this(scope, listOf(base), tags, onEnvelope)

    class Srv(val base: String) {
        @Volatile var online = false; @Volatile var lastError = ""; @Volatile var pausedUntil = 0L; @Volatile var sent = 0; @Volatile var since = (System.currentTimeMillis() / 1000) - 12 * 3600
        val name get() = base.removePrefix("https://").removePrefix("http://").substringBefore("/")
    }
    val servers: List<Srv> = bases.map { Srv(it.trim().trimEnd('/')) }.distinctBy { it.base }
    private val jobs = mutableListOf<Job>()
    private val reasm = Reassembler(maxPending = 64, maxFrame = 400_000)
    private val seenKeys = ConcurrentHashMap.newKeySet<String>()     // the same message arrives from several servers
    private val _online = MutableStateFlow(false); val online: StateFlow<Boolean> = _online
    @Volatile var published = 0; @Volatile var received = 0; @Volatile var topicsCount = 0
    val lastError: String get() = servers.filter { it.lastError.isNotEmpty() }.joinToString("\n") { "${it.name}: ${it.lastError}" }
    /** true while at least one server accepts our publishes */
    val healthy: Boolean get() = servers.any { it.online && it.lastError.isEmpty() && System.currentTimeMillis() > it.pausedUntil }

    fun topic(tag: ByteArray) = "orbit1" + tag.hex()
    private fun refreshOnline() { _online.value = servers.any { it.online } }

    fun start() {
        if (jobs.isNotEmpty()) return
        for (s in servers) jobs += scope.launch(Dispatchers.IO) {
            var backoff = 400L
            while (isActive) {
                val topics = tags().map { topic(it) }.distinct().take(25)
                if (topics.isEmpty()) { delay(1000); continue }
                try { topicsCount = topics.size; listen(s, topics); backoff = 400L }
                catch (e: CancellationException) { throw e }
                catch (e: Exception) {
                    s.online = false; refreshOnline(); s.lastError = (e.javaClass.simpleName + ": " + (e.message ?: "")).take(110)
                    val m = e.message ?: ""
                    val wait = when {
                        m.contains("http 401") || m.contains("http 403") || m.contains("http 404") -> 30 * 60_000L       // wants an account / no such service
                        e is java.net.UnknownHostException || e is javax.net.ssl.SSLException -> 10 * 60_000L              // dead or broken host: do not hammer
                        e is java.net.SocketTimeoutException || e is java.net.ConnectException -> maxOf(backoff, 20_000L)   // probably blocked: cheap polling
                        else -> backoff                                                                                      // normal network blip: come back fast
                    }
                    delay(wait); backoff = (backoff * 2).coerceAtMost(5_000)
                }
            }
        }
    }

    /** Reconnect everything right now (network changed, app opened). */
    fun kick() { stop(); servers.forEach { it.pausedUntil = 0L }; start() }

    fun stop() { jobs.forEach { it.cancel() }; jobs.clear(); servers.forEach { it.online = false }; refreshOnline() }

    private suspend fun listen(s: Srv, topics: List<String>) = withContext(Dispatchers.IO) {
        val c = URL("${s.base}/${topics.joinToString(",")}/json?since=${s.since - 10}").openConnection() as HttpURLConnection
        c.connectTimeout = 10_000; c.readTimeout = 90_000
        try {
            if (c.responseCode != 200) throw RuntimeException("http ${c.responseCode}")
            val r = BufferedReader(InputStreamReader(c.inputStream, Charsets.UTF_8))
            val opened = System.currentTimeMillis()
            while (isActive) {
                val line = r.readLine() ?: break
                val j = try { JSONObject(line) } catch (e: Exception) { continue }
                when (j.optString("event")) {
                    "open" -> { s.online = true; s.lastError = ""; refreshOnline() }
                    "message" -> {
                        val t = j.optLong("time", 0); if (t > s.since) s.since = t
                        val msg = j.optString("message").trim()
                        if (!seenKeys.add(msg.hashCode().toString() + ":" + msg.length)) continue   // duplicate from another server
                        if (seenKeys.size > 20_000) seenKeys.clear()
                        val frame = try { Base64.getDecoder().decode(msg) } catch (e: Exception) { continue }
                        val whole = reasm.feed(frame) ?: continue
                        val env = Envelope.decode(whole) ?: continue
                        received++
                        try { onEnvelope(env) } catch (_: Exception) {}
                    }
                }
                if (System.currentTimeMillis() - opened > 25_000 && tags().map { topic(it) }.distinct().take(25) != topics) break
            }
        } finally { c.disconnect() }
    }

    /** Fire and forget: publish to every server in parallel; success if at least one accepted every part. */
    fun publish(e: Envelope) {
        val bytes = e.encode()
        if (bytes.size > maxEnvelope) return
        val t = topic(e.tag)
        val parts = Framer.split(bytes, chunk).map { Base64.getEncoder().encodeToString(it) }
        scope.launch(Dispatchers.IO) {
            val okAny = servers.map { s -> async { publishTo(s, t, parts) } }.awaitAll().any { it }
            if (okAny) published++
        }
    }

    private suspend fun publishTo(s: Srv, topic: String, parts: List<String>): Boolean {
        if (System.currentTimeMillis() < s.pausedUntil) return false          // server told us to stop: do not hammer it
        for (part in parts) {
            var ok = false; var wait = 300L
            repeat(2) {
                if (!ok) {
                    ok = try { post(s, topic, part) } catch (ex: Exception) {
                        s.lastError = ("send: " + ex.javaClass.simpleName + " " + (ex.message ?: "")).take(110)
                        // circuit breaker: a host we cannot reach costs one attempt per minute, not one per message
                        s.pausedUntil = System.currentTimeMillis() + if (ex is java.net.UnknownHostException || ex is javax.net.ssl.SSLException) 10 * 60_000L else 60_000L
                        return false
                    }
                    if (!ok) { if (System.currentTimeMillis() < s.pausedUntil) return false; delay(wait); wait *= 2 }
                }
            }
            if (!ok) return false
        }
        s.sent++
        if (s.lastError.startsWith("HTTP") || s.lastError.startsWith("send:")) s.lastError = ""
        return true
    }

    private fun post(s: Srv, topic: String, body: String): Boolean {
        val c = URL("${s.base}/$topic").openConnection() as HttpURLConnection
        return try {
            c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 8000; c.readTimeout = 8000
            c.setRequestProperty("Content-Type", "text/plain")
            c.outputStream.use { it.write(body.toByteArray()) }
            val code = c.responseCode
            if (code == 429) { s.pausedUntil = System.currentTimeMillis() + 10 * 60_000; s.lastError = "HTTP 429: rate/daily limit reached, paused 10 min" }
            else if (code == 401 || code == 403 || code == 404) { s.pausedUntil = System.currentTimeMillis() + 30 * 60_000; s.lastError = "HTTP $code: server refuses anonymous use" }
            else if (code !in 200..299) s.lastError = "HTTP $code"
            code in 200..299
        } finally { c.disconnect() }
    }
}
