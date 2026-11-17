package app.orbit.core.net

import android.content.Context
import app.orbit.core.Rand
import app.orbit.core.hex
import app.orbit.core.mesh.*
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.concurrent.ConcurrentHashMap

/**
 * Phone-to-phone over Bluetooth / BLE / Wi-Fi Direct / hotspot, chosen automatically by Google Nearby.
 * Strategy P2P_CLUSTER = many-to-many, which is what a mesh needs. Works with no internet at all.
 */
class NearbyTransport(private val ctx: Context, private val scope: CoroutineScope) : Transport {
    override val name = "Nearby"
    private val _state = MutableStateFlow(TransportState.OFF)
    override val state: StateFlow<TransportState> = _state
    private val client = Nearby.getConnectionsClient(ctx)
    private val localName = Rand.bytes(6).hex()
    private var listener: LinkListener? = null
    private val links = ConcurrentHashMap<String, NLink>()
    private val pendingOut = ConcurrentHashMap.newKeySet<String>()
    private val cooldown = ConcurrentHashMap<String, Long>()
    private var running = false
    private val MAX_LINKS = 6

    private inner class NLink(val endpointId: String, val remoteName: String) : Link {
        override val linkId = "nearby:$endpointId"
        override val medium = "Bluetooth/Wi-Fi"
        override val label = remoteName
        val reasm = Reassembler()
        override suspend fun send(frame: ByteArray): Boolean = try {
            for (part in Framer.split(frame, 28_000)) client.sendPayload(endpointId, Payload.fromBytes(part))
            true
        } catch (e: Exception) { false }
        override fun close() { client.disconnectFromEndpoint(endpointId) }
    }

    private val payloadCb = object : PayloadCallback() {
        override fun onPayloadReceived(id: String, p: Payload) {
            val bytes = p.asBytes() ?: return
            val l = links[id] ?: return
            l.reasm.feed(bytes)?.let { listener?.onFrame(l, it) }
        }
        override fun onPayloadTransferUpdate(id: String, u: PayloadTransferUpdate) {}
    }

    private val lifecycle = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(id: String, info: ConnectionInfo) {
            if (links.size >= MAX_LINKS) { client.rejectConnection(id); return }
            client.acceptConnection(id, payloadCb)
            names[id] = info.endpointName
        }
        override fun onConnectionResult(id: String, r: ConnectionResolution) {
            pendingOut.remove(id)
            if (r.status.isSuccess) {
                val l = NLink(id, names[id] ?: id); links[id] = l; listener?.onLinkUp(l)
            } else cooldown[id] = System.currentTimeMillis() + 20_000
        }
        override fun onDisconnected(id: String) { links.remove(id)?.let { listener?.onLinkDown(it) } }
    }
    private val names = ConcurrentHashMap<String, String>()

    private val discoveryCb = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(id: String, info: DiscoveredEndpointInfo) {
            names[id] = info.endpointName
            // Deterministic initiator avoids both sides dialing at once.
            if (info.endpointName <= localName) return
            if (links.containsKey(id) || links.size >= MAX_LINKS || !pendingOut.add(id)) return
            if ((cooldown[id] ?: 0) > System.currentTimeMillis()) { pendingOut.remove(id); return }
            client.requestConnection(localName, id, lifecycle).addOnFailureListener { pendingOut.remove(id); cooldown[id] = System.currentTimeMillis() + 15_000 }
        }
        override fun onEndpointLost(id: String) { pendingOut.remove(id) }
    }

    override fun start(listener: LinkListener) {
        if (running) return
        this.listener = listener; running = true; _state.value = TransportState.STARTING
        val adv = AdvertisingOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build()
        val disc = DiscoveryOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build()
        client.startAdvertising(localName, SERVICE, lifecycle, adv)
            .addOnSuccessListener { _state.value = TransportState.ON }
            .addOnFailureListener { _state.value = if (it.message?.contains("8034") == true || it.message?.contains("MISSING_PERMISSION") == true) TransportState.NEEDS_PERMISSION else TransportState.UNAVAILABLE }
        client.startDiscovery(SERVICE, discoveryCb, disc)
        // Nearby stops after a while on some devices: refresh periodically.
        scope.launch {
            while (running) {
                delay(5 * 60_000)
                if (!running) break
                client.stopAdvertising(); client.stopDiscovery()
                client.startAdvertising(localName, SERVICE, lifecycle, adv); client.startDiscovery(SERVICE, discoveryCb, disc)
            }
        }
    }

    override fun stop() {
        running = false
        client.stopAdvertising(); client.stopDiscovery(); client.stopAllEndpoints()
        links.values.forEach { listener?.onLinkDown(it) }; links.clear(); _state.value = TransportState.OFF
    }

    companion object { const val SERVICE = "app.orbit.mesh.v1" }
}
