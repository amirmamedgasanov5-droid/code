package app.orbit.data

import org.json.JSONArray
import org.json.JSONObject

enum class ChatType { DIRECT, GROUP, CHANNEL, SAVED }

/** Lifecycle of an outgoing message: honest about mesh delivery. */
object Status {
    const val SENDING = 0     // being built
    const val CARRIED = 1     // stored in the mesh, no neighbour reachable yet (will hop when one appears)
    const val SENT = 2        // handed to at least one neighbour
    const val DELIVERED = 3   // recipient device signed a receipt
    const val READ = 4
    const val FAILED = 9
    const val RECEIVED = 10   // incoming
}

object MsgKind {
    const val TEXT = 0; const val IMAGE = 1; const val VOICE = 2; const val GIFT = 3
    const val SYSTEM = 4; const val LIVE = 5; const val POLL = 6; const val FILE = 7; const val CONTACT = 8
}

data class Contact(
    val id: String,               // hex of sign pub
    val boxPub: ByteArray,
    val name: String,
    val bio: String = "",
    val emoji: String = "",
    val color: Int = 0,
    val username: String = "",
    val addedAt: Long = 0,
    val lastSeen: Long = 0,
    val blocked: Boolean = false,
    val stranger: Boolean = false,
    val verified: Boolean = false,
) {
    val displayName get() = name.ifBlank { "User ${id.take(6)}" }
    override fun equals(other: Any?) = other is Contact && other.id == id && other.name == name && other.lastSeen == lastSeen && other.blocked == blocked && other.stranger == stranger && other.emoji == emoji && other.color == color && other.bio == bio && other.username == username && other.verified == verified
    override fun hashCode() = id.hashCode()
}

data class Chat(
    val id: String,
    val type: ChatType,
    val title: String,
    val emoji: String = "",
    val color: Int = 0,
    val pinned: Boolean = false,
    val muted: Boolean = false,
    val archived: Boolean = false,
    val unread: Int = 0,
    val lastTs: Long = 0,
    val lastPreview: String = "",
    val lastStatus: Int = -1,
    val lastMine: Boolean = false,
    val draft: String = "",
    val meta: JSONObject = JSONObject(),
) {
    val members: List<String> get() = meta.optJSONArray("members")?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()
    val admins: List<String> get() = meta.optJSONArray("admins")?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()
    val isOwner get() = meta.optBoolean("owner", false)
    val description get() = meta.optString("desc", "")
}

data class Message(
    val id: String,
    val chatId: String,
    val sender: String,           // contact id, or "me"
    val ts: Long,
    val kind: Int = MsgKind.TEXT,
    val text: String = "",
    val replyTo: String = "",
    val media: String = "",       // file name inside media dir
    val durationMs: Int = 0,
    val status: Int = Status.RECEIVED,
    val edited: Boolean = false,
    val deleted: Boolean = false,
    val reactions: Map<String, List<String>> = emptyMap(),  // emoji -> reactor ids
    val extra: JSONObject = JSONObject(),
    val views: Int = 0,
    val pinned: Boolean = false,
    val forwardedFrom: String = "",
) {
    val mine get() = sender == "me"
}

data class GiftTransfer(val toId: String, val ts: Long, val sig: String)

/**
 * A collectible. Immutable mint certificate signed by the issuer + a chain of signed transfers.
 * Traits are derived deterministically from [seed], so every device renders the same 3D object.
 */
data class Gift(
    val id: String,
    val model: Int,
    val issuer: String,
    val issuerName: String,
    val serial: Int,
    val supply: Int,
    val seed: String,
    val mintedAt: Long,
    val mintSig: String,
    val transfers: List<GiftTransfer>,
    val message: String = "",
) {
    val owner: String get() = transfers.lastOrNull()?.toId ?: issuer

    fun toJson() = JSONObject().put("id", id).put("m", model).put("is", issuer).put("in", issuerName).put("sn", serial).put("sp", supply)
        .put("sd", seed).put("ts", mintedAt).put("sg", mintSig).put("msg", message)
        .put("tr", JSONArray().also { a -> transfers.forEach { a.put(JSONObject().put("to", it.toId).put("ts", it.ts).put("sg", it.sig)) } })

    companion object {
        fun fromJson(j: JSONObject): Gift = Gift(
            j.getString("id"), j.getInt("m"), j.getString("is"), j.optString("in"), j.getInt("sn"), j.getInt("sp"),
            j.getString("sd"), j.getLong("ts"), j.getString("sg"),
            j.getJSONArray("tr").let { a -> (0 until a.length()).map { val o = a.getJSONObject(it); GiftTransfer(o.getString("to"), o.getLong("ts"), o.getString("sg")) } },
            j.optString("msg"),
        )
    }
}

data class DirectoryEntry(val id: String, val kind: String, val name: String, val username: String, val desc: String, val emoji: String, val color: Int, val boxPub: String, val key: String, val ts: Long, val members: Int = 0)

data class Profile(val name: String, val bio: String, val emoji: String, val color: Int, val username: String)

fun JSONObject.strList(key: String): List<String> = optJSONArray(key)?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()
fun List<String>.toJsonArray() = JSONArray().also { a -> forEach { a.put(it) } }
