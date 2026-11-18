package app.orbit.engine

import android.content.Context
import android.net.wifi.WifiManager
import app.orbit.core.crypto.Tags
import app.orbit.core.unhex
import app.orbit.core.hex
import app.orbit.core.mesh.*
import app.orbit.core.net.*
import app.orbit.data.ChatType
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

/** Starts/stops every physical medium and fans their events into the single MeshNode. */
class TransportManager(private val ctx: Context, private val engine: Engine) {
    private var nearby: NearbyTransport? = null
    private var lan: LanTransport? = null
    private var inet: InetTransport? = null
    private var webrtc: app.orbit.core.net.webrtc.WebRtcTransport? = null
    private var lock: WifiManager.MulticastLock? = null

    private val _states = MutableStateFlow<Map<String, TransportState>>(emptyMap())
    val states: StateFlow<Map<String, TransportState>> = _states

    data class Prefs(val nearby: Boolean = true, val lan: Boolean = true, val internet: Boolean = true, val webrtc: Boolean = true)
    fun prefs(): Prefs = Prefs(
        engine.db.getKv("t.nearby") != "0", engine.db.getKv("t.lan") != "0", engine.db.getKv("t.inet") != "0", engine.db.getKv("t.webrtc") != "0")
    fun setPref(name: String, on: Boolean) { if (name == "relay") { engine.setRelay(on); return }; engine.db.setKv("t.$name", if (on) "1" else "0"); restart() }

    @Synchronized fun start() {
        val id = engine.identity ?: return
        if (!engine.meshReady.value) return
        stop()
        val p = prefs()
        val node = engine.mesh
        val scope = engine.scope
        if (p.nearby) try { nearby = NearbyTransport(ctx, scope).also { it.start(node) } } catch (e: Throwable) { nearby = null }
        if (p.lan) {
            lan = LanTransport(id.signPub, scope) { on ->
                val wm = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager ?: return@LanTransport
                if (on) { lock = wm.createMulticastLock("orbit").also { it.setReferenceCounted(false); it.acquire() } } else { lock?.let { l -> if (l.isHeld) l.release() }; lock = null }
            }.also { it.start(node) }
        }
        if (p.internet) {
            inet = InetTransport(scope, InetTransport.DEFAULT_BOOTSTRAP, engine.db.getKv("udp.port")?.toIntOrNull() ?: 0,
                announceTopics = { listOf(InetTransport.topicHash(id.signPub)) },
                seekTopics = {
                    val contacts = engine.contacts.value.values.filter { !it.blocked }.map { InetTransport.topicHash(it.id.unhexLocal()) }
                    val chans = engine.chats.value.filter { it.type == ChatType.CHANNEL }.map { InetTransport.channelTopic(it.meta.optString("pub").unhexLocal()) }
                    contacts + chans
                }).also { it.start(node); if (it.port > 0) engine.db.setKv("udp.port", it.port.toString()) }
        }
        val fb = engine.fbConfig()
        if (p.webrtc && fb.valid) try {
            val sig = app.orbit.core.net.webrtc.FirestoreSignaling(ctx, fb, app.orbit.core.crypto.Tags.user(id.signPub).hex())
            val w = app.orbit.core.net.webrtc.WebRtcTransport(ctx, scope, id.id, sig)
            w.start(node); webrtc = w
            engine.directRequest = { peer -> w.connect(peer) }
            engine.webrtcDiag = { "WebRTC direct: signalling ${sig.status}; direct links: ${w.activeLinks}" + (if (w.lastEvent.isNotEmpty()) "; ${w.lastEvent}" else "") }
        } catch (e: Throwable) { engine.webrtcDiag = { "WebRTC direct: failed to start — ${e.message}" } }
        else engine.webrtcDiag = { if (!fb.valid) "WebRTC direct: not set up (Profile → Connection → Direct connection)" else "WebRTC direct: off" }
        scope.launchStates()
    }

    private fun String.unhexLocal() = this.unhex()

    private var statesJob: Job? = null
    private fun CoroutineScope.launchStates() {
        statesJob?.cancel()
        statesJob = launch(Dispatchers.Default) {
            while (true) {
                _states.value = buildMap {
                    nearby?.let { put("nearby", it.state.value) }; lan?.let { put("lan", it.state.value) }; inet?.let { put("internet", it.state.value) }; webrtc?.let { put("webrtc", it.state.value) }
                }
                delay(1500)
            }
        }
    }

    @Synchronized fun stop() {
        nearby?.stop(); lan?.stop(); inet?.stop(); webrtc?.stop(); nearby = null; lan = null; inet = null; webrtc = null
    }
    fun restart() { stop(); start() }
    fun dhtNodes(): Int = inet?.knownNodes ?: 0
    /** Manual connect (QR / typed IP:port) for situations where discovery is blocked. */
    fun connectLan(host: String, port: Int) = lan?.connect(host, port) ?: false
    fun lanPort() = lan?.port ?: 0
}
