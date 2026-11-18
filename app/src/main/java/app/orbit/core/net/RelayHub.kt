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
) {
    val ntfy = CloudRelay(scope, lines.map { it.trim() }.filter { it.startsWith("http") }, tags, onEnvelope)
    val mqtt = MqttRelay(scope, lines, tags, onEnvelope, clientId)
    private val _online = MutableStateFlow(false); val online: StateFlow<Boolean> = _online
    private var watch: Job? = null
    val healthy get() = ntfy.healthy || mqtt.healthy
    val published get() = ntfy.published + mqtt.published
    val received get() = ntfy.received + mqtt.received

    fun start() {
        ntfy.start(); mqtt.start()
        watch?.cancel()
        watch = scope.launch { while (isActive) { _online.value = ntfy.online.value || mqtt.online.value; delay(300) } }
    }
    fun stop() { watch?.cancel(); ntfy.stop(); mqtt.stop(); _online.value = false }
    fun kick() { ntfy.kick(); mqtt.kick() }
    fun publish(e: Envelope) { ntfy.publish(e); mqtt.publish(e) }

    fun diag(): String = (ntfy.servers.map { "• ${it.name}: " + (if (it.online) "ok" else "unreachable") + (if (it.lastError.isNotEmpty()) " — ${it.lastError}" else "") } +
        mqtt.servers.map { "• ${it.name}: " + (if (it.online) "ok" else "unreachable") + (if (it.lastError.isNotEmpty()) " — ${it.lastError}" else "") }).joinToString("\n")
}
