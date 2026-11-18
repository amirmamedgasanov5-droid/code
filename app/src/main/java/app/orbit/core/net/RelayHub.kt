package app.orbit.core.net

import app.orbit.core.mesh.Envelope
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** All relay kinds behind one handle: ntfy (https://) and MQTT (tcp:// tls:// ws:// wss://) servers used in parallel. */
class RelayHub(
    private val scope: CoroutineScope,
    lines: List<String>,
    tags: () -> List<ByteArray>,
    onEnvelope: suspend (Envelope) -> Unit,
    clientId: String,
    primaryTag: ByteArray = ByteArray(8),
) {
    val ntfy = CloudRelay(scope, lines.map { it.trim() }.filter { it.startsWith("http") && !FirebaseRelay.isFirebase(it) }, tags, onEnvelope)
    val firebase = FirebaseRelay(scope, lines.map { it.trim() }, tags, primaryTag, onEnvelope)
    val mqtt = MqttRelay(scope, lines, tags, onEnvelope, clientId)
    private val _online = MutableStateFlow(false); val online: StateFlow<Boolean> = _online
    private var watch: Job? = null
    val healthy get() = ntfy.healthy || mqtt.healthy || firebase.healthy
    val published get() = ntfy.published + mqtt.published + firebase.published
    val received get() = ntfy.received + mqtt.received + firebase.received

    fun start() {
        ntfy.start(); mqtt.start(); firebase.start()
        watch?.cancel()
        watch = scope.launch { while (isActive) { _online.value = ntfy.online.value || mqtt.online.value || firebase.online.value; delay(300) } }
    }
    fun stop() { watch?.cancel(); ntfy.stop(); mqtt.stop(); firebase.stop(); _online.value = false }
    fun kick() { ntfy.kick(); mqtt.kick(); firebase.kick() }
    fun publish(e: Envelope) { ntfy.publish(e); mqtt.publish(e); firebase.publish(e) }

    fun diag(): String = (firebase.servers.map { "• Firebase ${it.name}: " + (if (it.online > 0) "ok" else "unreachable") + (if (it.lastError.isNotEmpty()) " — ${it.lastError}" else "") } + ntfy.servers.map { "• ${it.name}: " + (if (it.online) "ok" else "unreachable") + (if (it.lastError.isNotEmpty()) " — ${it.lastError}" else "") } +
        mqtt.servers.map { "• ${it.name}: " + (if (it.online) "ok" else "unreachable") + (if (it.lastError.isNotEmpty()) " — ${it.lastError}" else "") }).joinToString("\n")
}
