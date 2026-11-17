package app.orbit.core.mesh

import kotlinx.coroutines.flow.StateFlow

/** A live bidirectional pipe to one neighbour, over any physical medium. */
interface Link {
    /** Unique per link instance (transport-prefixed). */
    val linkId: String
    val medium: String
    /** Best-effort remote description for UI (device name, ip). */
    val label: String
    /** Max single frame the node should hand over; transports may fragment internally. */
    suspend fun send(frame: ByteArray): Boolean
    fun close()
}

interface LinkListener {
    fun onLinkUp(link: Link)
    fun onLinkDown(link: Link)
    fun onFrame(link: Link, frame: ByteArray)
}

enum class TransportState { OFF, STARTING, ON, UNAVAILABLE, NEEDS_PERMISSION }

interface Transport {
    val name: String
    val state: StateFlow<TransportState>
    fun start(listener: LinkListener)
    fun stop()
}
