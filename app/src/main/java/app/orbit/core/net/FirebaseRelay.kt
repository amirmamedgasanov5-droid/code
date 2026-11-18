package app.orbit.core.net

import app.orbit.core.*
import app.orbit.core.mesh.Envelope
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
 * Relay on a Firebase Realtime Database you own (REST + Server-Sent Events, no SDK, no Google Play Services).
 * Layout: /orbit/<topic>/<pushId> = { t: millis, d: base64(envelope) }. Envelopes are already end-to-end encrypted.
 * A listener per topic receives the current content on connect (offline catch-up) and every new child instantly.
 * Messages for me are deleted after they have been taken, so the database stays tiny.
 */
class FirebaseRelay(
    private val scope: CoroutineScope,
    urls: List<String>,
    private val tags: () -> List<ByteArray>,
    private val primary: ByteArray,
    private val onEnvelope: suspend (Envelope) -> Unit,
    private val maxEnvelope: Int = 250_000,
    private val maxTopics: Int = 6,
) {
    class Db(url: String) {
        val base = url.trim().trimEnd('/').let { if (it.startsWith("http")) it else "https://$it" }
        val name get() = base.removePrefix("https://").removePrefix("http://")
        @Volatile var online = 0; @Volatile var lastError = ""; @Volatile var sent = 0; @Volatile var pausedUntil = 0L
    }
    val servers: List<Db> = urls.filter { isFirebase(it) || isLocal(it) }.map { Db(it) }.distinctBy { it.base }
    private val jobs = mutableListOf<Job>()
    private val running = ConcurrentHashMap<String, Job>()
    private val _online = MutableStateFlow(false); val online: StateFlow<Boolean> = _online
    @Volatile var published = 0; @Volatile var received = 0
    val healthy: Boolean get() = servers.any { it.online > 0 }
    private fun refresh() { _online.value = servers.any { it.online > 0 } }
    fun topic(tag: ByteArray) = tag.hex()

    fun start() {
        if (jobs.isNotEmpty() || servers.isEmpty()) return
        jobs += scope.launch(Dispatchers.IO) {
            while (isActive) {
                val wanted = (listOf(primary) + tags().filter { !it.contentEquals(primary) }).map { topic(it) }.distinct().take(maxTopics)
                for (db in servers) for (t in wanted) running.getOrPut(db.base + "|" + t) { launch(Dispatchers.IO) { listenLoop(db, t) } }
                running.keys.filter { k -> wanted.none { k.endsWith("|$it") } }.forEach { running.remove(it)?.cancel() }
                delay(8_000)
            }
        }
    }
    fun stop() { jobs.forEach { it.cancel() }; jobs.clear(); running.values.forEach { it.cancel() }; running.clear(); servers.forEach { it.online = 0 }; refresh() }
    fun kick() { stop(); servers.forEach { it.pausedUntil = 0 }; start() }

    private suspend fun listenLoop(db: Db, topic: String) {
        var backoff = 1_500L
        while (currentCoroutineContext().isActive) {
            val began = System.currentTimeMillis()
            try { stream(db, topic); backoff = 1_500L }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                db.lastError = (e.javaClass.simpleName + ": " + (e.message ?: "")).take(110)
                val m = e.message ?: ""
                val wait = when {
                    m.contains("http 401") || m.contains("http 403") -> 60_000L.also { db.lastError = "HTTP 401/403: set the database rules (see setup)" }
                    e is java.net.UnknownHostException -> 5 * 60_000L
                    System.currentTimeMillis() - began > 60_000 -> 1_000L
                    else -> backoff
                }
                delay(wait); backoff = (backoff * 2).coerceAtMost(30_000)
            }
        }
    }

    private suspend fun stream(db: Db, topic: String) = withContext(Dispatchers.IO) {
        val c = URL("${db.base}/orbit/$topic.json").openConnection() as HttpURLConnection
        c.setRequestProperty("Accept", "text/event-stream"); c.connectTimeout = 10_000; c.readTimeout = 70_000
        var counted = false
        try {
            if (c.responseCode != 200) throw RuntimeException("http ${c.responseCode}")
            val r = BufferedReader(InputStreamReader(c.inputStream, Charsets.UTF_8))
            db.online++; counted = true; db.lastError = ""; refresh()
            var event = ""
            while (isActive) {
                val line = r.readLine() ?: break
                when {
                    line.startsWith("event:") -> event = line.removePrefix("event:").trim()
                    line.startsWith("data:") && (event == "put" || event == "patch") -> try { dispatch(db, topic, JSONObject(line.removePrefix("data:").trim())) } catch (_: Exception) {}
                }
            }
        } finally { if (counted) { db.online--; refresh() }; c.disconnect() }
    }

    private suspend fun dispatch(db: Db, topic: String, msg: JSONObject) {
        val path = msg.optString("path", "/"); val data = msg.opt("data")
        if (data == null || data == JSONObject.NULL) return
        if (path == "/" && data is JSONObject) { for (id in data.keys()) data.optJSONObject(id)?.let { take(db, topic, id, it) } }
        else if (data is JSONObject && path.count { it == '/' } == 1) take(db, topic, path.removePrefix("/"), data)
    }

    private suspend fun take(db: Db, topic: String, id: String, o: JSONObject) {
        val bytes = try { Base64.getDecoder().decode(o.optString("d")) } catch (e: Exception) { return }
        val env = Envelope.decode(bytes)
        if (env != null) { received++; try { onEnvelope(env) } catch (_: Exception) {} }
        val mine = topic == topic(primary)
        val old = System.currentTimeMillis() - o.optLong("t", 0) > 24 * 3600_000L
        if (mine || old || env == null) scope.launch(Dispatchers.IO) { try { delete(db, topic, id) } catch (_: Exception) {} }   // keep the database tiny
    }

    private fun delete(db: Db, topic: String, id: String) {
        val c = URL("${db.base}/orbit/$topic/$id.json").openConnection() as HttpURLConnection
        try { c.requestMethod = "DELETE"; c.connectTimeout = 8000; c.readTimeout = 8000; c.responseCode } finally { c.disconnect() }
    }

    fun publish(e: Envelope) {
        val bytes = e.encode(); if (bytes.size > maxEnvelope) return
        val body = JSONObject().put("t", System.currentTimeMillis()).put("d", Base64.getEncoder().encodeToString(bytes)).toString()
        val t = topic(e.tag)
        scope.launch(Dispatchers.IO) {
            var any = false
            servers.map { db -> async {
                if (System.currentTimeMillis() < db.pausedUntil) return@async
                var ok = false; var wait = 300L
                repeat(2) { if (!ok) { ok = try { post(db, t, body) } catch (ex: Exception) { db.lastError = ("send: " + ex.javaClass.simpleName + " " + (ex.message ?: "")).take(110); db.pausedUntil = System.currentTimeMillis() + 60_000; return@async }; if (!ok) { delay(wait); wait *= 2 } } }
                if (ok) { db.sent++; any = true }
            } }.awaitAll()
            if (any) published++
        }
    }

    private fun post(db: Db, topic: String, body: String): Boolean {
        val c = URL("${db.base}/orbit/$topic.json").openConnection() as HttpURLConnection
        return try {
            c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 8000; c.readTimeout = 10000
            c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(body.toByteArray()) }
            val code = c.responseCode
            if (code == 401 || code == 403) { db.lastError = "HTTP $code: set the database rules (see setup)"; db.pausedUntil = System.currentTimeMillis() + 5 * 60_000 }
            else if (code !in 200..299) db.lastError = "HTTP $code"
            code in 200..299
        } finally { c.disconnect() }
    }

    companion object {
        fun isFirebase(line: String) = line.contains("firebaseio.com") || line.contains("firebasedatabase.app")
        /** loopback servers speaking the same protocol (tests, a local emulator) */
        fun isLocal(line: String) = line.startsWith("http://127.0.0.1") || line.startsWith("http://localhost")
    }
}
