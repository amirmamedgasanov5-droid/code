package app.orbit.engine

import android.content.Context
import android.net.Uri
import app.orbit.core.*
import app.orbit.core.crypto.*
import app.orbit.core.mesh.*
import app.orbit.data.*
import app.orbit.gifts.GiftLogic
import app.orbit.gifts.GiftCatalog
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap

object LiveSub { const val TYPING = 1; const val AUDIO = 2; const val ROOM = 3; const val PTT = 4 }

sealed class ParsedLink {
    data class User(val address: ByteArray, val name: String) : ParsedLink()
    data class Channel(val chanPub: ByteArray, val name: String, val key: ByteArray?, val emoji: String, val desc: String) : ParsedLink()
}

/**
 * The brain: owns identity, storage, mesh node and every application protocol
 * (chats, groups, channels, receipts, directory, gifts). UI observes StateFlows only.
 */
class Engine(val ctx: Context, dbName: String = "orbit.db") : MeshHandler {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val single = Dispatchers.Default.limitedParallelism(1)
    val db = Db(ctx, dbName)
    val mediaDir = File(ctx.filesDir, "media").also { it.mkdirs() }
    var notifier: Notifier? = null

    @Volatile var identity: Identity? = null
    lateinit var mesh: MeshNode

    private val _ready = MutableStateFlow(false); val ready: StateFlow<Boolean> = _ready
    private val _hasIdentity = MutableStateFlow(false); val hasIdentity: StateFlow<Boolean> = _hasIdentity
    private val _profile = MutableStateFlow(Profile("", "", "🙂", 0, "")); val profile: StateFlow<Profile> = _profile
    private val _chats = MutableStateFlow<List<Chat>>(emptyList()); val chats: StateFlow<List<Chat>> = _chats
    private val _contacts = MutableStateFlow<Map<String, Contact>>(emptyMap()); val contacts: StateFlow<Map<String, Contact>> = _contacts
    private val _directory = MutableStateFlow<List<DirectoryEntry>>(emptyList()); val directory: StateFlow<List<DirectoryEntry>> = _directory
    private val _gifts = MutableStateFlow<List<Pair<Gift, Boolean>>>(emptyList()); val gifts: StateFlow<List<Pair<Gift, Boolean>>> = _gifts
    private val _typing = MutableStateFlow<Map<String, Long>>(emptyMap()); val typing: StateFlow<Map<String, Long>> = _typing
    private val _online = MutableStateFlow<Set<String>>(emptySet()); val online: StateFlow<Set<String>> = _online
    private val _events = MutableSharedFlow<String>(extraBufferCapacity = 16); val events: SharedFlow<String> = _events

    // ---- cloud relay (optional fallback), wallet, calls
    private var relay: app.orbit.core.net.RelayHub? = null
    private val _relayOnline = MutableStateFlow(false); val relayOnline: StateFlow<Boolean> = _relayOnline
    private val _coins = MutableStateFlow(0); val coins: StateFlow<Int> = _coins
    private val _lastSpin = MutableStateFlow(0L); val lastSpin: StateFlow<Long> = _lastSpin
    class IncomingCall(val from: String, val rid: String, val key: String, val ts: Long)
    private val _incomingCall = MutableStateFlow<IncomingCall?>(null); val incomingCall: StateFlow<IncomingCall?> = _incomingCall
    private val _callEvents = MutableSharedFlow<Pair<String, String>>(extraBufferCapacity = 8); val callEvents: SharedFlow<Pair<String, String>> = _callEvents // (type, fromId)

    private val chatMap = ConcurrentHashMap<String, Chat>()
    private val msgFlows = ConcurrentHashMap<String, MutableStateFlow<List<Message>>>()
    private val tagIndex = ConcurrentHashMap<String, String>() // tagHex -> chatId
    @Volatile var openChat: String? = null
    @Volatile var inForeground = false

    // ============================================================ lifecycle
    fun boot() {
        scope.launch(single) {
            val wrapped = db.getKv("seed")
            if (wrapped != null) {
                try { identity = Identity.fromSeed(SecureStore.unwrap(wrapped.unhex())) } catch (e: Exception) { identity = null }
            }
            if (identity != null) loadAll()
            _hasIdentity.value = identity != null
            _ready.value = true
            if (identity != null) startMesh()
        }
    }

    private fun loadAll() {
        db.getKv("profile")?.let { s -> JSONObject(s).let { _profile.value = Profile(it.optString("n"), it.optString("b"), it.optString("e", "🙂"), it.optInt("c"), it.optString("u")) } }
        _contacts.value = db.contacts().associateBy { it.id }
        db.chats().forEach { chatMap[it.id] = it }
        reindexTags(); publishChats()
        _directory.value = db.directory(); _gifts.value = db.gifts()
        _coins.value = db.getKv("coins")?.toIntOrNull() ?: WELCOME_COINS.also { db.setKv("coins", it.toString()) }
        _lastSpin.value = db.getKv("lastSpin")?.toLongOrNull() ?: 0L
        _worn.value = currentWorn()
        if (app.orbit.BuildConfig.ADMIN_BUILD) db.setKv("admin", "1")
        _admin.value = db.getKv("admin") == "1"
    }

    private fun startMesh() {
        val id = identity!!
        mesh = MeshNode(id, SqlEnvelopeStore(db), scope)
        mesh.handler = this
        scope.launch { mesh.peers.collect { ps -> _online.value = ps.map { it.peerId }.toSet() } }
        scope.launch {
            while (isActive) { delay(30_000); try { retryPending(); expireTyping() } catch (_: Exception) {} }
        }
        scope.launch {
            // publish username / public channels whenever ANY path exists (nearby links or the cloud relay), refresh every 3 h
            var last = 0L
            while (isActive) {
                delay(8_000)
                if ((mesh.linkCount.value > 0 || _relayOnline.value) && now() - last > 3 * 3600_000L) { try { withContext(single) { announceAll() }; last = now() } catch (_: Exception) {} }
            }
        }
        mesh.onLocalSubmit = { e -> relay?.publish(e) }
        configureRelay(); watchNetwork()
        _meshReady.value = true
    }

    fun shortId(id: String) = id.take(16).chunked(4).joinToString("-")
    /** Plain-text status for the "why is it not delivered?" dialog. */
    fun relayDiag(): String {
        val r = relay
        if (!relayEnabled()) return "Cloud relay: OFF (turn it on in Profile → Connection)"
        if (r == null) return "Cloud relay: not started"
        return "Cloud relay: ${if (_relayOnline.value) "connected" else "NOT connected"}   Sent: ${r.published}  Received: ${r.received}\n" + r.diag()
    }
    fun relayKick() { relay?.kick() }
    private var netCb: android.net.ConnectivityManager.NetworkCallback? = null
    private fun watchNetwork() {
        if (netCb != null) return
        try {
            val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
            val cb = object : android.net.ConnectivityManager.NetworkCallback() {
                override fun onAvailable(n: android.net.Network) { relay?.kick(); scope.launch(single) { try { retryPending() } catch (_: Exception) {} } }
            }
            cm.registerDefaultNetworkCallback(cb); netCb = cb
        } catch (_: Exception) {}
    }
    fun relayEnabled() = db.getKv("t.relay") != "0"
    /** one server URL per line; all are used at the same time */
    /** ntfy.sh (official) + community servers listed in the ntfy docs. Availability and anonymous access are not guaranteed. */
    val defaultRelays = listOf(
        // MQTT brokers first: whole messages, no tight rate limits, different ports (TLS 8883, secure WebSocket 8084 look like normal HTTPS traffic)
        "tls://broker.emqx.io:8883", "wss://broker.emqx.io:8084/mqtt", "ws://broker.hivemq.com:8000/mqtt", "tcp://broker.hivemq.com:1883", "tcp://broker.emqx.io:1883", "tcp://test.mosquitto.org:1883",
        // ntfy servers
        "https://ntfy.sh", "https://ntfy.envs.net", "https://ntfy.adminforge.de", "https://ntfy.tedomum.fr", "https://ntfy.jae.fi", "https://ntfy.mzte.de", "https://ntfy.hostux.net", "https://ntfy.fossman.de", "https://notify.utilibre.org")
    fun relayUrls(): List<String> = (db.getKv("relay.urls") ?: db.getKv("relay.url") ?: defaultRelays.joinToString("\n")).lines().map { it.trim().trimEnd('/') }.filter { Regex("^(https?|tcp|tls|ws|wss)://.+").matches(it) }.ifEmpty { listOf("https://ntfy.sh") }
    fun relayUrl() = relayUrls().size.let { if (it == 1) relayUrls()[0].substringAfter("://") else "$it servers" }
    fun setRelay(on: Boolean, urls: String? = null) { db.setKv("t.relay", if (on) "1" else "0"); if (urls != null) db.setKv("relay.urls", urls.lines().map { it.trim().trimEnd('/') }.filter { it.isNotEmpty() }.joinToString("\n")); configureRelay() }
    /** Put (or remove) the user's own Firebase Realtime Database URL at the top of the relay list. */
    fun setFirebase(url: String?) {
        val rest = relayUrls().filter { !app.orbit.core.net.FirebaseRelay.isFirebase(it) }
        val line = url?.trim()?.trimEnd('/')?.takeIf { it.isNotEmpty() }?.let { if (it.startsWith("http")) it else "https://$it" }
        setRelay(true, (listOfNotNull(line) + rest).joinToString("\n"))
    }
    fun firebaseUrl(): String = relayUrls().firstOrNull { app.orbit.core.net.FirebaseRelay.isFirebase(it) } ?: ""
    fun relayUrlsText() = relayUrls().joinToString("\n")
    fun configureRelay() {
        relay?.stop(); relay = null; _relayOnline.value = false
        if (!relayEnabled() || identity == null) return
        val r = app.orbit.core.net.RelayHub(scope, relayUrls(), { tagIndex.keys.map { it.unhex() } }, { env -> mesh.ingestExternal(env) }, "orbit-" + identity!!.signPub.let { Tags.user(it).hex() }, Tags.user(identity!!.signPub))
        relay = r; r.start()
        scope.launch { r.online.collect { _relayOnline.value = it } }
    }
    private val _meshReady = MutableStateFlow(false); val meshReady: StateFlow<Boolean> = _meshReady
    companion object { const val WELCOME_COINS = 50 }

    fun createIdentity(p: Profile, recoveryKey: String? = null): Boolean {
        val id = try { if (recoveryKey.isNullOrBlank()) Identity.generate() else Identity.fromRecoveryKey(recoveryKey) } catch (e: Exception) { return false }
        scope.launch(single) {
            db.setKv("seed", SecureStore.wrap(id.seed).hex())
            identity = id
            setProfileInternal(p)
            // Saved messages chat
            upsertChat(Chat("saved", ChatType.SAVED, "Saved Messages", "🔖", 5, lastTs = now()))
            loadAll()
            _hasIdentity.value = true
            startMesh()
            _events.tryEmit("identity")
        }
        return true
    }

    /** Test/preview hook: skip Keystore wrapping and start with a known identity. */
    fun attachIdentityForTest(id: Identity, p: Profile) {
        runBlocking(single) {
            identity = id; setProfileInternal(p)
            upsertChat(Chat("saved", ChatType.SAVED, "Saved Messages", "🔖", 5, lastTs = now()))
            loadAll(); _hasIdentity.value = true; _ready.value = true; startMesh()
        }
    }

    fun updateProfile(p: Profile) { scope.launch(single) { setProfileInternal(p); announceAll() } }
    private fun setProfileInternal(p: Profile) {
        _profile.value = p
        db.setKv("profile", JSONObject().put("n", p.name).put("b", p.bio).put("e", p.emoji).put("c", p.color).put("u", p.username).toString())
    }

    fun recoveryKey(): String = identity?.recoveryKey() ?: ""
    val myId: String get() = identity?.id ?: ""

    // ============================================================ links
    fun myLink(): String {
        val id = identity ?: return ""
        return "orbit://u/" + Base32.encode(id.address) + "?n=" + Uri.encode(_profile.value.name)
    }

    fun channelLink(chat: Chat): String {
        val pub = chat.meta.optString("pub"); val key = chat.meta.optString("key")
        val sb = StringBuilder("orbit://c/").append(Base32.encode(pub.unhex())).append("?n=").append(Uri.encode(chat.title)).append("&e=").append(Uri.encode(chat.emoji))
        if (key.isNotEmpty()) sb.append("&k=").append(Base32.encode(key.unhex()))
        if (chat.description.isNotEmpty()) sb.append("&d=").append(Uri.encode(chat.description.take(120)))
        return sb.toString()
    }

    fun parseLink(text: String): ParsedLink? {
        val m = Regex("orbit://([uc])/([a-z2-7]+)(\\?[^\\s]*)?", RegexOption.IGNORE_CASE).find(text.trim()) ?: return null
        return try {
            val q = m.groupValues[3].removePrefix("?").split("&").filter { it.contains("=") }.associate { it.substringBefore("=") to Uri.decode(it.substringAfter("=")) }
            val raw = Base32.decode(m.groupValues[2])
            if (m.groupValues[1].lowercase() == "u") { require(raw.size == 64); ParsedLink.User(raw, q["n"] ?: "") }
            else { require(raw.size == 32); ParsedLink.Channel(raw, q["n"] ?: "Channel", q["k"]?.let { Base32.decode(it) }, q["e"] ?: "📣", q["d"] ?: "") }
        } catch (e: Exception) { null }
    }

    /** Returns chat id to open, or null when link was invalid. */
    suspend fun openLink(text: String): String? = withContext(single) {
        when (val l = parseLink(text)) {
            is ParsedLink.User -> {
                val peer = Peer.fromAddress(l.address)
                if (peer.id == myId) return@withContext "saved"
                val c = addContactInternal(peer, l.name, stranger = false)
                sendHello(c)
                c.id
            }
            is ParsedLink.Channel -> joinChannel(l)
            null -> null
        }
    }

    // ============================================================ contacts
    private fun addContactInternal(peer: Peer, name: String, stranger: Boolean, p: JSONObject? = null): Contact {
        val old = _contacts.value[peer.id]
        val c = Contact(
            peer.id, peer.boxPub,
            p?.optString("n")?.ifBlank { null } ?: name.ifBlank { old?.name ?: "" },
            p?.optString("b") ?: old?.bio ?: "", p?.optString("e") ?: old?.emoji ?: "", p?.optInt("c", old?.color ?: 0) ?: old?.color ?: (peer.signPub[0].toInt() and 0xff) % 8,
            p?.optString("u") ?: old?.username ?: "", old?.addedAt ?: now(), old?.lastSeen ?: 0, old?.blocked ?: false,
            if (old != null) (old.stranger && stranger) else stranger, old?.verified ?: false,
        )
        db.upsertContact(c); _contacts.value = _contacts.value + (c.id to c)
        ensureDirect(c)
        return c
    }

    private fun ensureDirect(c: Contact): Chat {
        val existing = chatMap[c.id]
        val chat = (existing ?: Chat(c.id, ChatType.DIRECT, c.displayName, c.emoji, c.color, lastTs = now())).copy(title = c.displayName, emoji = c.emoji, color = c.color)
        if (existing != chat) upsertChat(chat)
        return chat
    }

    /** Shareable card of a contact (or of me): address + profile, sent as a normal message. */
    fun contactCard(id: String): JSONObject? {
        val me = identity ?: return null
        if (id == "me" || id == me.id) return JSONObject().put("addr", Base32.encode(me.address)).put("name", _profile.value.name).put("e", _profile.value.emoji).put("c", _profile.value.color).put("u", _profile.value.username)
        val c = _contacts.value[id] ?: return null
        return JSONObject().put("addr", Base32.encode(c.id.unhex() + c.boxPub)).put("name", c.displayName).put("e", c.emoji).put("c", c.color).put("u", c.username)
    }
    fun sendContact(chatId: String, contactId: String) { contactCard(contactId)?.let { send(chatId, MsgKind.CONTACT, it.optString("name"), extra = it) } }

    /** @username -> contact id to open (own contacts first, then the gossiped directory). */
    suspend fun openUsername(name: String): String? = withContext(single) {
        val n = name.trimStart('@').lowercase()
        _contacts.value.values.firstOrNull { it.username.equals(n, true) }?.let { return@withContext it.id }
        val e = _directory.value.firstOrNull { it.kind == "user" && it.username.equals(n, true) && it.id != myId } ?: return@withContext null
        val peer = Peer.fromId(e.id, e.boxPub.unhex())
        val c = addContactInternal(peer, e.name, false, JSONObject().put("n", e.name).put("u", e.username).put("e", e.emoji).put("c", e.color).put("b", e.desc))
        sendHello(c); c.id
    }

    fun contactName(id: String): String = if (id == "me" || id == myId) "You" else _contacts.value[id]?.displayName ?: "User ${id.take(6)}"

    fun setBlocked(id: String, b: Boolean) { scope.launch(single) { _contacts.value[id]?.let { val c = it.copy(blocked = b, stranger = if (b) it.stranger else false); db.upsertContact(c); _contacts.value = _contacts.value + (id to c) } } }
    fun acceptStranger(id: String) { scope.launch(single) { _contacts.value[id]?.let { val c = it.copy(stranger = false); db.upsertContact(c); _contacts.value = _contacts.value + (id to c); sendHello(c) } } }
    fun deleteContact(id: String) { scope.launch(single) { db.deleteContact(id); _contacts.value = _contacts.value - id; deleteChatInternal(id) } }
    fun renameContact(id: String, name: String) { scope.launch(single) { _contacts.value[id]?.let { val c = it.copy(name = name); db.upsertContact(c); _contacts.value = _contacts.value + (id to c); ensureDirect(c) } } }

    private fun myCard() = JSONObject().put("n", _profile.value.name).put("e", _profile.value.emoji).put("c", _profile.value.color).put("u", _profile.value.username).put("b", _profile.value.bio)

    private suspend fun sendHello(c: Contact) {
        val id = identity ?: return
        val j = JSONObject().put("t", "hi").put("p", myCard())
        currentWorn()?.let { j.put("wg", it.toJson()) }
        mesh.submit(Envelope.direct(id, Peer.fromId(c.id, c.boxPub), Pay.enc(j), ttlMs = 7L * 86400_000))
    }

    // ============================================================ chats & messages state
    fun chat(id: String): Chat? = chatMap[id]

    private fun upsertChat(c: Chat) { chatMap[c.id] = c; db.upsertChat(c); reindexTags(); publishChats() }
    private fun publishChats() {
        _chats.value = chatMap.values.sortedWith(compareByDescending<Chat> { it.pinned }.thenByDescending { it.lastTs })
    }
    private fun reindexTags() {
        tagIndex.clear()
        identity?.let { tagIndex[Tags.user(it.signPub).hex()] = "me" }
        for (c in chatMap.values) when (c.type) {
            ChatType.GROUP -> tagIndex[Tags.group(c.id.unhex()).hex()] = c.id
            ChatType.CHANNEL -> tagIndex[Tags.channel(c.meta.optString("pub").unhex()).hex()] = c.id
            else -> {}
        }
        tagIndex[Envelope.DIRECTORY_TAG.hex()] = "dir"
    }

    fun messages(chatId: String): StateFlow<List<Message>> = msgFlows.getOrPut(chatId) { MutableStateFlow(db.messages(chatId, 400)) }

    private fun patchFlow(chatId: String, f: (List<Message>) -> List<Message>) {
        msgFlows[chatId]?.let { fl -> fl.value = f(fl.value) }
    }
    private fun addToFlow(m: Message) = patchFlow(m.chatId) { l -> if (l.any { it.id == m.id }) l else (l + m).sortedBy { it.ts } }
    private fun replaceInFlow(m: Message) = patchFlow(m.chatId) { l -> l.map { if (it.id == m.id) m else it } }

    private fun previewOf(m: Message): String = when {
        m.deleted -> "Message deleted"
        m.kind == MsgKind.IMAGE -> "🖼 " + m.text.ifBlank { "Photo" }
        m.kind == MsgKind.VOICE -> "🎤 Voice message"
        m.kind == MsgKind.GIFT -> "🎁 Gift"
        m.kind == MsgKind.LIVE -> "🔴 Live broadcast"
        m.kind == MsgKind.CONTACT -> "👤 Contact: " + m.text
        m.kind == MsgKind.FILE -> "📎 " + m.text
        else -> m.text
    }

    private fun touchChat(chatId: String, m: Message, incoming: Boolean) {
        val c = chatMap[chatId] ?: return
        val unread = if (incoming && !(openChat == chatId && inForeground)) c.unread + 1 else c.unread
        if (m.ts >= c.lastTs || c.lastPreview.isEmpty()) upsertChat(c.copy(lastTs = if (c.lastPreview.isEmpty()) m.ts else maxOf(c.lastTs, m.ts), lastPreview = previewOf(m), lastStatus = if (incoming) -1 else m.status, lastMine = !incoming, unread = unread))
        else upsertChat(c.copy(unread = unread))
    }

    private fun refreshLastStatus(chatId: String) {
        val c = chatMap[chatId] ?: return
        val last = messages(chatId).value.lastOrNull() ?: return
        if (last.mine && c.lastStatus != last.status) upsertChat(c.copy(lastStatus = last.status))
    }

    private fun deleteChatInternal(id: String) {
        db.mediaOfChat(id).forEach { File(mediaDir, it).delete() }
        db.deleteChat(id); chatMap.remove(id); msgFlows.remove(id); reindexTags(); publishChats()
    }
    fun deleteChat(id: String) { scope.launch(single) { deleteChatInternal(id) } }
    fun setPinned(id: String, v: Boolean) { scope.launch(single) { chatMap[id]?.let { upsertChat(it.copy(pinned = v)) } } }
    fun setMuted(id: String, v: Boolean) { scope.launch(single) { chatMap[id]?.let { upsertChat(it.copy(muted = v)) } } }
    fun setArchived(id: String, v: Boolean) { scope.launch(single) { chatMap[id]?.let { upsertChat(it.copy(archived = v)) } } }
    fun saveDraft(id: String, text: String) { scope.launch(single) { chatMap[id]?.let { if (it.draft != text) upsertChat(it.copy(draft = text)) } } }
    fun clearHistory(id: String) { scope.launch(single) { db.mediaOfChat(id).forEach { File(mediaDir, it).delete() }; db.writableDatabase.delete("messages", "chat=?", arrayOf(id)); msgFlows[id]?.value = emptyList(); chatMap[id]?.let { upsertChat(it.copy(lastPreview = "", unread = 0)) } } }

    fun mediaFile(name: String) = File(mediaDir, name)

    // ============================================================ sending
    private fun newMsgId() = Rand.bytes(16).hex()

    private fun baseJson(m: Message, type: String = "m") = JSONObject().put("t", type).put("i", m.id).put("k", m.kind).put("x", m.text).put("ts", m.ts)
        .also { if (m.replyTo.isNotEmpty()) it.put("r", m.replyTo); if (m.durationMs > 0) it.put("d", m.durationMs); if (m.forwardedFrom.isNotEmpty()) it.put("fw", m.forwardedFrom); if (m.extra.length() > 0) it.put("ex", m.extra) }

    /** The single entry point for all outgoing user content. */
    fun send(chatId: String, kind: Int, text: String = "", replyTo: String = "", blob: ByteArray? = null, ext: String = "", durationMs: Int = 0, extra: JSONObject = JSONObject(), forwardedFrom: String = "") {
        scope.launch(single) {
            val chat = chatMap[chatId] ?: return@launch
            val id = newMsgId()
            var media = ""
            if (blob != null) { media = "$id$ext"; File(mediaDir, media).writeBytes(blob) }
            var m = Message(id, chatId, "me", now(), kind, text, replyTo, media, durationMs, Status.SENDING, extra = extra, forwardedFrom = forwardedFrom)
            db.insertMessage(m); addToFlow(m)
            if (chat.type == ChatType.SAVED) { m = m.copy(status = Status.READ); db.updateMessage(m); replaceInFlow(m); touchChat(chatId, m, false); return@launch }
            if (chat.type == ChatType.CHANNEL && !chat.isOwner) { db.deleteMessage(id); patchFlow(chatId) { it.filter { x -> x.id != id } }; return@launch }
            touchChat(chatId, m, false)
            submitMessage(m, blob, 0)
        }
    }

    private suspend fun submitMessage(m: Message, blob: ByteArray?, tries: Int) {
        val me = identity ?: return
        val chat = chatMap[m.chatId] ?: return
        val payload = Pay.enc(baseJson(m).also { if (chat.type == ChatType.DIRECT) it.put("from", myCard()) }, blob ?: if (m.media.isNotEmpty()) File(mediaDir, m.media).takeIf { it.exists() }?.readBytes() else null)
        val env = when (chat.type) {
            ChatType.DIRECT -> {
                val c = _contacts.value[chat.id] ?: return
                Envelope.direct(me, Peer.fromId(c.id, c.boxPub), payload)
            }
            ChatType.GROUP -> Envelope.group(me, chat.id.unhex(), chat.meta.optString("key").unhex(), payload)
            ChatType.CHANNEL -> {
                val seed = chat.meta.optString("seed"); val chan = Identity.fromSeed(seed.unhex())
                val key = chat.meta.optString("key").takeIf { it.isNotEmpty() }?.unhex()
                Envelope.channel(chan.signPub, chan.signPub, chan::sign, key, Pay.enc(baseJson(m, "post"), blob ?: m.media.takeIf { it.isNotEmpty() }?.let { File(mediaDir, it).takeIf { f -> f.exists() }?.readBytes() }))
            }
            else -> return
        }
        db.setMessageEnv(m.id, env.idHex, tries)
        mesh.submit(env)
        val direct = if (chat.type == ChatType.DIRECT) mesh.isConnected(chat.id) else mesh.linkCount.value > 0
        val st = if (m.status >= Status.DELIVERED) m.status else if (direct) Status.SENT else Status.CARRIED
        val nm = (db.message(m.id) ?: m).copy(status = st)
        db.updateMessage(nm); replaceInFlow(nm); refreshLastStatus(m.chatId)
        if (chat.type != ChatType.DIRECT && st < Status.DELIVERED) { /* group/channel: no per-member receipts */ }
    }

    private suspend fun retryPending() {
        // The relay already keeps a published message for ~12 h, so re-publishing every few minutes only burns the
        // public server's rate limit. Re-send quickly ONLY when the relay is not healthy (or off), slowly otherwise.
        val relayOk = relay?.healthy == true
        val fast = longArrayOf(2 * 60_000, 10 * 60_000, 60 * 60_000, 6 * 3600_000, 24 * 3600_000, 48 * 3600_000)
        val slow = longArrayOf(5 * 3600_000, 11 * 3600_000, 24 * 3600_000, 48 * 3600_000)
        val backoff = if (relayOk) slow else fast
        for ((m, tries, last) in db.pendingOutgoing()) {
            val chat = chatMap[m.chatId] ?: continue
            if (chat.type != ChatType.DIRECT) continue
            if (tries >= backoff.size) continue
            val connected = mesh.isConnected(chat.id)
            if (now() - last > backoff[tries] || (connected && m.status == Status.CARRIED)) submitMessage(m, null, tries + 1)
        }
    }

    fun edit(chatId: String, msgId: String, text: String) {
        scope.launch(single) {
            val m = db.message(msgId) ?: return@launch
            if (!m.mine) return@launch
            val nm = m.copy(text = text, edited = true); db.updateMessage(nm); replaceInFlow(nm)
            chatMap[chatId]?.let { if (messages(chatId).value.lastOrNull()?.id == msgId) upsertChat(it.copy(lastPreview = previewOf(nm))) }
            sendControl(chatId, JSONObject().put("t", "edit").put("i", msgId).put("x", text))
        }
    }

    fun delete(chatId: String, msgId: String, forEveryone: Boolean) {
        scope.launch(single) {
            val m = db.message(msgId) ?: return@launch
            if (forEveryone && m.mine) sendControl(chatId, JSONObject().put("t", "del").put("i", msgId))
            applyDelete(chatId, msgId, forEveryone && m.mine)
        }
    }
    private fun applyDelete(chatId: String, msgId: String, tombstone: Boolean) {
        val m = db.message(msgId) ?: return
        if (m.media.isNotEmpty()) File(mediaDir, m.media).delete()
        if (tombstone) { val nm = m.copy(deleted = true, text = "", media = ""); db.updateMessage(nm); replaceInFlow(nm) }
        else { db.deleteMessage(msgId); patchFlow(chatId) { l -> l.filter { it.id != msgId } } }
        val last = db.messages(chatId, 1).lastOrNull()
        chatMap[chatId]?.let { upsertChat(it.copy(lastPreview = last?.let { x -> previewOf(x) } ?: "", lastTs = last?.ts ?: it.lastTs)) }
    }

    fun react(chatId: String, msgId: String, emoji: String) {
        scope.launch(single) {
            val m = db.message(msgId) ?: return@launch
            val mine = m.reactions[emoji]?.contains("me") == true
            applyReaction(m, emoji, "me", !mine)
            sendControl(chatId, JSONObject().put("t", "react").put("i", msgId).put("e", emoji).put("on", !mine))
        }
    }
    private fun applyReaction(m0: Message, emoji: String, who: String, on: Boolean) {
        val m = db.message(m0.id) ?: m0
        val r = m.reactions.toMutableMap()
        // one reaction per person per message, like Telegram
        for (k in r.keys.toList()) r[k] = r[k]!!.filter { it != who }
        if (on) r[emoji] = (r[emoji] ?: emptyList()) + who
        val nm = m.copy(reactions = r.filterValues { it.isNotEmpty() })
        db.updateMessage(nm); replaceInFlow(nm)
    }

    fun togglePin(chatId: String, msgId: String) {
        scope.launch(single) {
            val m = db.message(msgId) ?: return@launch
            val nm = m.copy(pinned = !m.pinned); db.updateMessage(nm); replaceInFlow(nm)
        }
    }

    fun forward(toChat: String, m: Message) {
        val blob = if (m.media.isNotEmpty()) File(mediaDir, m.media).takeIf { it.exists() }?.readBytes() else null
        val from = if (m.sender == "me") _profile.value.name else contactName(m.sender)
        send(toChat, m.kind, m.text, blob = blob, ext = m.media.substringAfterLast('.', "").let { if (it.isEmpty()) "" else ".$it" }, durationMs = m.durationMs, forwardedFrom = m.forwardedFrom.ifEmpty { from }, extra = if (m.kind == MsgKind.GIFT) JSONObject() else m.extra)
    }

    /** Control payloads (edit/delete/react/read): same transport, no chat bubble. */
    private suspend fun sendControl(chatId: String, j: JSONObject) {
        val me = identity ?: return
        val chat = chatMap[chatId] ?: return
        val pay = Pay.enc(j)
        when (chat.type) {
            ChatType.DIRECT -> _contacts.value[chatId]?.let { mesh.submit(Envelope.direct(me, Peer.fromId(it.id, it.boxPub), pay, ttlMs = 7L * 86400_000)) }
            ChatType.GROUP -> mesh.submit(Envelope.group(me, chat.id.unhex(), chat.meta.optString("key").unhex(), pay, ttlMs = 7L * 86400_000))
            ChatType.CHANNEL -> {
                val key = chat.meta.optString("key").takeIf { it.isNotEmpty() }?.unhex()
                val type = j.optString("t")
                if (chat.isOwner && (type == "edit" || type == "del" || type == "pin")) { val chan = Identity.fromSeed(chat.meta.optString("seed").unhex()); mesh.submit(Envelope.channel(chan.signPub, chan.signPub, chan::sign, key, pay)) }
                else if (type == "react" || type == "views") mesh.submit(Envelope.channel(chat.meta.optString("pub").unhex(), me.signPub, me::sign, key, pay, ttlMs = 14L * 86400_000))
            }
            else -> {}
        }
    }

    fun markRead(chatId: String) {
        scope.launch(single) {
            val c = chatMap[chatId] ?: return@launch
            if (c.unread > 0) upsertChat(c.copy(unread = 0))
            val unreadIds = messages(chatId).value.filter { !it.mine && it.status == Status.RECEIVED && !it.extra.optBoolean("rd") }
            if (unreadIds.isEmpty()) return@launch
            for (m in unreadIds) { val nm = m.copy(extra = JSONObject(m.extra.toString()).put("rd", true)); db.updateMessage(nm); replaceInFlow(nm) }
            notifier?.cancel(chatId)
            if (c.type == ChatType.DIRECT) sendControl(chatId, JSONObject().put("t", "read").put("ids", JSONArray(unreadIds.map { it.id })))
            else if (c.type == ChatType.CHANNEL && unreadIds.size <= 60) sendControl(chatId, JSONObject().put("t", "views").put("ids", JSONArray(unreadIds.map { it.id })))
        }
    }

    private var lastTypingSent = 0L
    fun typing(chatId: String) {
        val c = chatMap[chatId] ?: return
        if (c.type != ChatType.DIRECT || now() - lastTypingSent < 2500) return
        lastTypingSent = now()
        mesh.sendLive(chatId, byteArrayOf(LiveSub.TYPING.toByte()))
    }
    private fun expireTyping() { val t = now(); _typing.value = _typing.value.filterValues { it > t } }

    // ============================================================ MeshHandler
    override fun isMine(tag: ByteArray): Boolean = tagIndex.containsKey(tag.hex())

    override fun onPeerUp(peer: Peer) {
        scope.launch(single) {
            _contacts.value[peer.id]?.let { c ->
                val nc = c.copy(lastSeen = now()); if (c.boxPub.isEmpty() || !c.boxPub.contentEquals(peer.boxPub)) return@let
                db.upsertContact(nc); _contacts.value = _contacts.value + (c.id to nc)
            }
        }
    }
    override fun onPeerDown(peer: Peer) {
        scope.launch(single) { _contacts.value[peer.id]?.let { val nc = it.copy(lastSeen = now()); db.upsertContact(nc); _contacts.value = _contacts.value + (it.id to nc) } }
    }

    override fun onLive(from: Peer?, frame: ByteArray, link: Link) {
        if (frame.isEmpty() || from == null) return
        when (frame[0].toInt()) {
            LiveSub.TYPING -> { _typing.value = _typing.value + (from.id to now() + 5000) }
            else -> liveHandler?.invoke(from, frame, link)
        }
    }
    var liveHandler: ((Peer, ByteArray, Link) -> Unit)? = null

    override suspend fun onEnvelope(e: Envelope, via: Peer?): Boolean = withContext(single) {
        val me = identity ?: return@withContext false
        val where = tagIndex[e.tag.hex()] ?: return@withContext false
        try {
            when (e.kind) {
                Kind.DIRECT -> { if (where == "me") { handleDirect(me, e); true } else false }
                Kind.ACK -> { if (where == "me") { handleAck(me, e); true } else false }
                Kind.GROUP -> { handleGroup(where, e); false }
                Kind.CHANNEL -> { handleChannel(where, e); false }
                Kind.ANNOUNCE -> { handleAnnounce(e); false }
                else -> false
            }
        } catch (ex: Exception) { false }
    }

    // ---- direct
    private suspend fun handleDirect(me: Identity, e: Envelope) {
        val opened = Envelope.openDirect(me, e) ?: return
        val pay = Pay.dec(opened.payload) ?: return
        val j = pay.j
        val sender = opened.sender
        if (_contacts.value[sender.id]?.blocked == true) return
        val type = j.optString("t")
        when (type) {
            "hi" -> {
                val old = _contacts.value[sender.id]
                addContactInternal(sender, "", stranger = true, p = j.optJSONObject("p")) // a hello never upgrades trust: only I can accept a stranger
                val wg = j.optJSONObject("wg")?.let { try { Gift.fromJson(it) } catch (e: Exception) { null } }
                db.setKv("worn.${sender.id}", if (wg != null && GiftLogic.verify(wg) && wg.owner == sender.id) wg.toJson().toString() else "")
                _wornTick.value++
            }
            "m", "gift" -> {
                val c = _contacts.value[sender.id]?.let { if (j.has("from")) addContactInternal(sender, "", it.stranger, j.getJSONObject("from")) else it }
                    ?: addContactInternal(sender, "", stranger = true, p = j.optJSONObject("from"))
                val m = incomingMessage(c.id, c.id, j, pay.blob)
                if (m != null) afterIncoming(m, c.displayName)
                // receipt carries msgId so retries with fresh envelopes are still matched
                mesh.submit(Envelope.ack(me, sender, e.id, j.optString("i").unhex()))
            }
            "edit" -> db.message(j.optString("i"))?.takeIf { it.sender == sender.id }?.let { m -> val nm = m.copy(text = j.optString("x"), edited = true); db.updateMessage(nm); replaceInFlow(nm); chatMap[m.chatId]?.let { c -> if (messages(m.chatId).value.lastOrNull()?.id == m.id) upsertChat(c.copy(lastPreview = previewOf(nm))) } }
            "del" -> db.message(j.optString("i"))?.takeIf { it.sender == sender.id }?.let { applyDelete(it.chatId, it.id, true) }
            "react" -> db.message(j.optString("i"))?.let { m -> if (m.chatId == sender.id) applyReaction(m, j.optString("e"), sender.id, j.optBoolean("on", true)) }
            "read" -> {
                val ids = j.optJSONArray("ids") ?: return
                for (k in 0 until ids.length()) db.message(ids.getString(k))?.takeIf { it.mine && it.chatId == sender.id }?.let { m ->
                    val nm = m.copy(status = Status.READ); db.updateMessage(nm); replaceInFlow(nm); refreshLastStatus(m.chatId) }
            }
            "gi" -> handleGroupInvite(sender, j)
            "call" -> {
                val fresh = now() - j.optLong("ts", 0) < 45_000
                _contacts.value[sender.id] ?: addContactInternal(sender, "", true, j.optJSONObject("from"))
                if (fresh && _incomingCall.value == null) {
                    _incomingCall.value = IncomingCall(sender.id, j.optString("rid"), j.optString("key"), now())
                    notifier?.onCall(contactName(sender.id))
                } else if (!fresh) systemMessage(sender.id, "Missed call")
            }
            "call_cancel" -> { _incomingCall.value?.takeIf { it.from == sender.id && it.rid == j.optString("rid") }?.let { _incomingCall.value = null; notifier?.cancel("call"); systemMessage(sender.id, "Missed call") } }
            "buy" -> handleBuy(sender, j)
            "sold" -> handleSoldOrRefund(sender, j, false)
            "refund" -> handleSoldOrRefund(sender, j, true)
            "call_decline", "call_end" -> _callEvents.tryEmit(type to sender.id)
        }
    }

    fun dismissIncomingCall() { _incomingCall.value = null; notifier?.cancel("call") }

    /** Call signalling travels as a short-lived DM (works through the relay too). */
    fun sendCallSignal(contactId: String, j: JSONObject) {
        scope.launch(single) {
            val me = identity ?: return@launch; val c = _contacts.value[contactId] ?: return@launch
            j.put("ts", now()).put("from", myCard())
            mesh.submit(Envelope.direct(me, Peer.fromId(c.id, c.boxPub), Pay.enc(j), ttlMs = 60_000))
        }
    }
    fun logCall(contactId: String, text: String) { scope.launch(single) { if (chatMap[contactId] != null) systemMessage(contactId, text) } }

    private fun incomingMessage(chatId: String, senderId: String, j: JSONObject, blob: ByteArray): Message? {
        val id = j.optString("i"); if (id.length != 32) return null
        if (db.message(id) != null) return null
        val kind = j.optInt("k", 0)
        var media = ""
        if (blob.isNotEmpty()) {
            val ext = when (kind) { MsgKind.IMAGE -> ".jpg"; MsgKind.VOICE -> ".m4a"; else -> ".bin" }
            media = "$id$ext"; File(mediaDir, media).writeBytes(blob)
        }
        var extra = j.optJSONObject("ex") ?: JSONObject()
        var text = j.optString("x")
        if (kind == MsgKind.GIFT) {
            val gj = j.optJSONObject("gift") ?: extra.optJSONObject("gift")
            val g = gj?.let { try { Gift.fromJson(it) } catch (e: Exception) { null } }
            if (g != null) {
                val ok = GiftLogic.verify(g) && g.owner == myId
                extra = JSONObject().put("gid", g.id).put("ok", ok)
                if (ok) acceptGift(g)
            }
        }
        val m = Message(id, chatId, senderId, minOf(j.optLong("ts", now()), now()), kind, text, j.optString("r"), media, j.optInt("d"), Status.RECEIVED, extra = extra, forwardedFrom = j.optString("fw"))
        return if (db.insertMessage(m)) m else null
    }

    private fun afterIncoming(m: Message, senderName: String) {
        addToFlow(m); touchChat(m.chatId, m, true)
        val chat = chatMap[m.chatId]
        if (chat != null && !chat.muted && !(openChat == m.chatId && inForeground)) notifier?.onMessage(chat, senderName, previewOf(m))
        _typing.value = _typing.value - m.sender
    }

    private fun handleAck(me: Identity, e: Envelope) {
        val a = Envelope.openAck(me, e) ?: return
        val msgId = if (a.extra.size == 16) a.extra.hex() else db.messageByEnv(e.refId!!.hex())?.id ?: return
        val m = db.message(msgId) ?: return
        if (m.sender != "me" || m.chatId != Peer.idOf(a.signerPub)) return
        if (m.status < Status.DELIVERED) { val nm = m.copy(status = Status.DELIVERED); db.updateMessage(nm); replaceInFlow(nm); refreshLastStatus(m.chatId) }
        mesh.forget(e.refId!!.hex())
    }

    // ============================================================ groups
    fun createGroup(title: String, emoji: String, color: Int, memberIds: List<String>): String {
        val gid = Rand.bytes(16).hex()
        scope.launch(single) {
            val key = Rand.bytes(32).hex()
            val all = (listOf(myId) + memberIds).distinct()
            val names = JSONObject().also { n -> all.forEach { n.put(it, contactName(it).let { x -> if (it == myId) _profile.value.name else x }) } }
            val addr = JSONObject().also { a -> all.forEach { id -> if (id == myId) a.put(id, Base32.encode(identity!!.address)) else _contacts.value[id]?.let { c -> a.put(id, Base32.encode(c.id.unhex() + c.boxPub)) } } }
            val meta = JSONObject().put("key", key).put("keys", JSONArray().put(key)).put("members", all.toJsonArray()).put("admins", JSONArray().put(myId)).put("owner", true).put("names", names).put("addr", addr).put("epoch", 1)
            val chat = Chat(gid, ChatType.GROUP, title, emoji, color, lastTs = now(), meta = meta)
            upsertChat(chat)
            systemMessage(gid, "You created the group “$title”")
            for (id in memberIds) inviteToGroup(chat, id)
            mesh.resync()
        }
        return gid
    }

    private suspend fun inviteToGroup(chat: Chat, memberId: String) {
        val me = identity ?: return
        val c = _contacts.value[memberId] ?: return
        val j = JSONObject().put("t", "gi").put("gid", chat.id).put("n", chat.title).put("e", chat.emoji).put("c", chat.color)
            .put("key", chat.meta.optString("key")).put("keys", chat.meta.optJSONArray("keys")).put("members", chat.meta.getJSONArray("members")).put("admins", chat.meta.getJSONArray("admins"))
            .put("names", chat.meta.getJSONObject("names")).put("addr", chat.meta.getJSONObject("addr")).put("owner", chat.meta.optString("ownerId", myId)).put("epoch", chat.meta.optInt("epoch", 1)).put("desc", chat.description)
        mesh.submit(Envelope.direct(me, Peer.fromId(c.id, c.boxPub), Pay.enc(j), ttlMs = 30L * 86400_000))
    }

    private fun handleGroupInvite(sender: Peer, j: JSONObject) {
        val gid = j.optString("gid"); if (gid.length != 32) return
        val existing = chatMap[gid]
        if (existing != null && !existing.admins.contains(sender.id)) return // only admins can rekey / update
        val members = j.getJSONArray("members"); val admins = j.getJSONArray("admins")
        if (!members.toString().contains(myId)) return
        if (!admins.toString().contains(sender.id)) return
        val addrs = j.optJSONObject("addr") ?: JSONObject()
        // learn unknown members as strangers so we can message them later
        for (k in addrs.keys()) if (k != myId && _contacts.value[k] == null) try { addContactInternal(Peer.fromAddress(Base32.decode(addrs.getString(k))), j.optJSONObject("names")?.optString(k) ?: "", true) } catch (_: Exception) {}
        val meta = JSONObject().put("key", j.getString("key")).put("keys", j.optJSONArray("keys") ?: JSONArray().put(j.getString("key"))).put("members", members).put("admins", admins)
            .put("owner", false).put("ownerId", j.optString("owner")).put("names", j.optJSONObject("names") ?: JSONObject()).put("addr", addrs).put("epoch", j.optInt("epoch", 1)).put("desc", j.optString("desc"))
        val chat = (existing ?: Chat(gid, ChatType.GROUP, j.optString("n", "Group"), j.optString("e"), j.optInt("c"), lastTs = now())).copy(title = j.optString("n", existing?.title ?: "Group"), emoji = j.optString("e"), color = j.optInt("c"), meta = meta)
        upsertChat(chat)
        if (existing == null) { systemMessage(gid, "${contactName(sender.id)} added you to “${chat.title}”"); notifier?.let { if (!chat.muted) it.onMessage(chat, contactName(sender.id), "added you to the group") } }
        mesh.resync()
    }

    fun addToGroup(groupId: String, ids: List<String>) {
        scope.launch(single) {
            var chat = chatMap[groupId] ?: return@launch
            if (!chat.admins.contains(myId)) return@launch
            val members = chat.members.toMutableList(); val names = JSONObject(chat.meta.getJSONObject("names").toString()); val addr = JSONObject(chat.meta.getJSONObject("addr").toString())
            for (id in ids) if (id !in members) { members.add(id); names.put(id, contactName(id)); _contacts.value[id]?.let { addr.put(id, Base32.encode(it.id.unhex() + it.boxPub)) } }
            chat = chat.copy(meta = JSONObject(chat.meta.toString()).put("members", members.toJsonArray()).put("names", names).put("addr", addr))
            upsertChat(chat)
            for (id in members) if (id != myId) inviteToGroup(chat, id)
            systemMessage(groupId, "You added " + ids.joinToString { contactName(it) })
        }
    }

    /** Removing a member rotates the group key: they keep the past, not the future. */
    fun removeFromGroup(groupId: String, memberId: String) {
        scope.launch(single) {
            var chat = chatMap[groupId] ?: return@launch
            if (!chat.admins.contains(myId) || memberId == myId) return@launch
            val members = chat.members.filter { it != memberId }
            val newKey = Rand.bytes(32).hex()
            val keys = chat.meta.optJSONArray("keys") ?: JSONArray()
            val nk = JSONArray().put(newKey); for (i in 0 until keys.length()) nk.put(keys.getString(i))
            chat = chat.copy(meta = JSONObject(chat.meta.toString()).put("members", members.toJsonArray()).put("key", newKey).put("keys", nk).put("epoch", chat.meta.optInt("epoch", 1) + 1))
            upsertChat(chat)
            for (id in members) if (id != myId) inviteToGroup(chat, id)
            systemMessage(groupId, "You removed ${contactName(memberId)}")
        }
    }

    fun leaveGroup(groupId: String) { scope.launch(single) { sendControl(groupId, JSONObject().put("t", "leave")); deleteChatInternal(groupId) } }

    private fun handleGroup(chatId: String, e: Envelope) {
        val chat = chatMap[chatId] ?: return
        val keys = chat.meta.optJSONArray("keys")?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: listOf(chat.meta.optString("key"))
        var opened: Pair<ByteArray, ByteArray>? = null
        for (k in keys) { opened = Envelope.openGroup(k.unhex(), e); if (opened != null) break }
        val (pub, payload) = opened ?: return
        val senderId = Peer.idOf(pub)
        if (senderId == myId) return
        if (!chat.members.contains(senderId) && !chat.members.contains(myId)) return
        if (!chat.members.contains(senderId)) return
        val pay = Pay.dec(payload) ?: return; val j = pay.j
        if (_contacts.value[senderId]?.blocked == true) return
        when (j.optString("t")) {
            "m" -> { incomingMessage(chatId, senderId, j, pay.blob)?.let { afterIncoming(it, contactName(senderId)) } }
            "edit" -> db.message(j.optString("i"))?.takeIf { it.sender == senderId }?.let { m -> val nm = m.copy(text = j.optString("x"), edited = true); db.updateMessage(nm); replaceInFlow(nm) }
            "del" -> db.message(j.optString("i"))?.takeIf { it.sender == senderId || chat.admins.contains(senderId) }?.let { applyDelete(chatId, it.id, true) }
            "react" -> db.message(j.optString("i"))?.let { applyReaction(it, j.optString("e"), senderId, j.optBoolean("on", true)) }
            "leave" -> {
                val members = chat.members.filter { it != senderId }
                upsertChat(chat.copy(meta = JSONObject(chat.meta.toString()).put("members", members.toJsonArray())))
                systemMessage(chatId, "${contactName(senderId)} left the group")
            }
            "live" -> { liveAnnounce?.invoke(chatId, senderId, j) }
        }
    }
    var liveAnnounce: ((String, String, JSONObject) -> Unit)? = null

    private fun systemMessage(chatId: String, text: String) {
        val m = Message(newMsgId(), chatId, "sys", now(), MsgKind.SYSTEM, text, status = Status.RECEIVED)
        db.insertMessage(m); addToFlow(m); chatMap[chatId]?.let { upsertChat(it.copy(lastTs = m.ts, lastPreview = text)) }
    }

    // ============================================================ channels
    fun createChannel(title: String, desc: String, emoji: String, color: Int, public: Boolean): String {
        val chan = Identity.generate(); val id = chan.signPub.hex()
        scope.launch(single) {
            val meta = JSONObject().put("pub", id).put("seed", chan.seed.hex()).put("owner", true).put("desc", desc).put("public", public)
            if (!public) meta.put("key", Rand.bytes(32).hex())
            upsertChat(Chat(id, ChatType.CHANNEL, title, emoji, color, lastTs = now(), meta = meta))
            systemMessage(id, "Channel created. Share the link so people can subscribe.")
            if (public) announceAll()
        }
        return id
    }

    private fun joinChannel(l: ParsedLink.Channel): String {
        val id = l.chanPub.hex()
        if (chatMap[id] == null) {
            val meta = JSONObject().put("pub", id).put("owner", false).put("desc", l.desc).put("public", l.key == null)
            if (l.key != null) meta.put("key", l.key.hex())
            upsertChat(Chat(id, ChatType.CHANNEL, l.name, l.emoji, (l.chanPub[0].toInt() and 0xff) % 8, lastTs = now(), meta = meta))
            mesh.resync()
        }
        return id
    }

    fun subscribe(entry: DirectoryEntry): String? {
        if (entry.kind != "chan") return null
        return joinChannel(ParsedLink.Channel(entry.id.unhex(), entry.name, entry.key.takeIf { it.isNotEmpty() }?.unhex(), entry.emoji, entry.desc))
    }

    private fun handleChannel(chatId: String, e: Envelope) {
        val chat = chatMap[chatId] ?: return
        val key = chat.meta.optString("key").takeIf { it.isNotEmpty() }?.unhex()
        val o = Envelope.openChannel(e, key) ?: return
        if (!o.chanPub.hex().equals(chatId)) return
        val pay = Pay.dec(o.payload) ?: return; val j = pay.j
        val fromOwner = o.signerPub.contentEquals(o.chanPub)
        val signer = Peer.idOf(o.signerPub)
        when (j.optString("t")) {
            "post" -> if (fromOwner && !chat.isOwner) { incomingMessage(chatId, chatId, j, pay.blob)?.let { m -> afterIncoming(m, chat.title) } }
            "edit" -> if (fromOwner) db.message(j.optString("i"))?.let { m -> val nm = m.copy(text = j.optString("x"), edited = true); db.updateMessage(nm); replaceInFlow(nm) }
            "del" -> if (fromOwner) db.message(j.optString("i"))?.let { applyDelete(chatId, it.id, true) }
            "pin" -> if (fromOwner) db.message(j.optString("i"))?.let { m -> val nm = m.copy(pinned = j.optBoolean("on", true)); db.updateMessage(nm); replaceInFlow(nm) }
            "react" -> if (signer != myId) db.message(j.optString("i"))?.let { applyReaction(it, j.optString("e"), signer, j.optBoolean("on", true)) }
            "views" -> {
                val ids = j.optJSONArray("ids") ?: return
                for (k in 0 until minOf(ids.length(), 60)) db.message(ids.getString(k))?.let { m ->
                    val seen = m.extra.optJSONArray("vw") ?: JSONArray()
                    val tag = signer.take(8)
                    if (!seen.toString().contains(tag) && seen.length() < 5000) {
                        val nm = m.copy(views = m.views + 1, extra = JSONObject(m.extra.toString()).put("vw", seen.put(tag))); db.updateMessage(nm); replaceInFlow(nm)
                    }
                }
            }
        }
    }

    fun reactChannelAsMember(chatId: String, msgId: String, emoji: String) = react(chatId, msgId, emoji)

    // ============================================================ directory (serverless search)
    private suspend fun announceAll() {
        val me = identity ?: return
        val p = _profile.value
        if (p.username.isNotBlank()) {
            val j = JSONObject().put("k", "user").put("id", me.id).put("b", me.boxPub.hex()).put("n", p.name).put("u", p.username.lowercase()).put("d", p.bio).put("e", p.emoji).put("c", p.color)
            mesh.submit(Envelope.announce(me.signPub, me::sign, j.toString().utf8()))
        }
        listingsMap().let { l -> for (gid in l.keys()) { val g = db.gift(gid)?.first ?: continue; if (g.owner != me.id) continue
            val j = JSONObject().put("k", "gift").put("id", me.id).put("gid", gid).put("price", l.getInt(gid)).put("g", g.toJson()).put("n", p.name).put("b", me.boxPub.hex())
            mesh.submit(Envelope.announce(me.signPub, me::sign, j.toString().utf8())) } }
        (db.getKv("admin.tokens") ?: "").split(",").filter { it.isNotEmpty() }.forEach { t ->
            mesh.submit(Envelope.announce(me.signPub, me::sign, JSONObject().put("k", "tok").put("id", me.id).put("t", t).toString().utf8())) }
        for (c in chatMap.values) if (c.type == ChatType.CHANNEL && c.isOwner && c.meta.optBoolean("public")) {
            val chan = Identity.fromSeed(c.meta.optString("seed").unhex())
            val j = JSONObject().put("k", "chan").put("id", chan.id).put("n", c.title).put("u", c.meta.optString("username")).put("d", c.description).put("e", c.emoji).put("c", c.color)
            mesh.submit(Envelope.announce(chan.signPub, chan::sign, j.toString().utf8()))
        }
    }
    fun announceNow() { scope.launch(single) { announceAll() } }

    private fun handleAnnounce(e: Envelope) {
        val (pub, payload) = Envelope.openAnnounce(e) ?: return
        val j = try { JSONObject(payload.str()) } catch (x: Exception) { return }
        val id = Peer.idOf(pub)
        if (j.optString("id") != id || id == myId) return
        when (j.optString("k")) {
            "tok" -> { val t = j.optString("t"); if (t.length == 24 && db.getKv("tokused.$t") == null) db.setKv("tokused.$t", id); return }
            "gift_off" -> { val gid = j.optString("gid"); _directory.value.firstOrNull { it.id == gid && it.username == id }?.let { db.deleteDirectory(gid); _directory.value = _directory.value.filter { x -> x.id != gid } }; return }
            "gift" -> {
                val g = try { Gift.fromJson(j.getJSONObject("g")) } catch (x: Exception) { return }
                val price = j.optInt("price"); if (price !in 1..1_000_000_000 || !GiftLogic.verify(g) || g.owner != id || id == myId) return
                val ge = DirectoryEntry(g.id, "gift", j.optString("n").take(40), id, price.toString(), GiftCatalog.models[g.model].emoji, g.model, j.optString("b"), g.toJson().toString(), e.created)
                if (ge.boxPub.length != 64) return
                db.putDirectory(ge); _directory.value = (listOf(ge) + _directory.value.filter { it.id != ge.id }).take(800); return
            }
        }
        val ent = DirectoryEntry(id, j.optString("k"), j.optString("n").take(60), j.optString("u").take(32), j.optString("d").take(300), j.optString("e").take(8), j.optInt("c"), j.optString("b"), j.optString("key"), e.created)
        if (ent.kind != "user" && ent.kind != "chan") return
        if (ent.kind == "user" && ent.boxPub.length != 64) return
        db.putDirectory(ent)
        _directory.value = (listOf(ent) + _directory.value.filter { it.id != id }).take(800)
    }

    fun addFromDirectory(e: DirectoryEntry): String? {
        if (e.kind == "chan") return subscribe(e)
        var cid: String? = null
        runBlocking(single) {
            val peer = Peer.fromId(e.id, e.boxPub.unhex())
            cid = addContactInternal(peer, e.name, false, JSONObject().put("n", e.name).put("u", e.username).put("e", e.emoji).put("c", e.color).put("b", e.desc)).id
            _contacts.value[cid!!]?.let { sendHello(it) }
        }
        return cid
    }

    // ============================================================ gifts
    enum class PromoResult { OK, USED, INVALID, ADMIN }
    private val promos = mapOf(
        "03e2f9009ed3ed2b887b3614df92f7207f1033ce1dea1bcb43cc1edb5c632d90" to 2_000_000,
        "4a5001c2e68116bd8df7a2874201520de5afd6d0472f7bdbcfd448c2898d2632" to 1_000_000,
        "f232d703d3465a09976f9158fda6363165f133430ea6cc22b5f4b6ce0a255098" to 500_000,
        "f10b5001c7995f2ae84798e82381ebffe1d45f66b753d045798a8a2f726867ee" to 250_000,
        "1881e1bf870ba670f532d20e694e7636d9016d45de6cd4103b67666d5394c948" to 100_000,
    )
    /** authority key that signs admin tokens (overridable in tests only) */
    var adminPub: ByteArray = "6456ec1aabb97746db1471d363fe1f7061bf0e6605c8319d37de9756dc1439b8".unhex()
    private val _worn = MutableStateFlow<Gift?>(null); val worn: StateFlow<Gift?> = _worn
    private val _wornTick = MutableStateFlow(0); val wornTick: StateFlow<Int> = _wornTick
    private fun currentWorn(): Gift? { val id = db.getKv("worn")?.takeIf { it.isNotEmpty() } ?: return null; val e = db.gift(id) ?: return null; return e.first.takeIf { e.second && it.owner == myId } }
    /** Show one of my gifts on my profile; contacts get it (with its signature chain) and verify it themselves. */
    fun wearGift(gid: String?) {
        scope.launch(single) {
            if (gid == null) db.setKv("worn", "") else { val e = db.gift(gid); if (e == null || !e.second || e.first.owner != myId) return@launch; db.setKv("worn", gid) }
            _worn.value = currentWorn(); _wornTick.value++
            for (c in _contacts.value.values) if (!c.blocked && !c.stranger) try { sendHello(c) } catch (_: Exception) {}
        }
    }
    fun contactWorn(id: String): Gift? = db.getKv("worn.$id")?.takeIf { it.isNotEmpty() }?.let { try { Gift.fromJson(JSONObject(it)).takeIf { g -> GiftLogic.verify(g) && g.owner == id } } catch (e: Exception) { null } }
    private val _admin = MutableStateFlow(false); val isAdmin: StateFlow<Boolean> = _admin

    /** One entry for everything typed into the promo field: coin codes (once per device) or a long admin token. */
    fun redeemCode(raw: String): Pair<PromoResult, Int> {
        val code = raw.trim().replace(" ", "").replace("-", "")
        if (code.length > 60) return redeemAdminToken(code)
        val h = sha256("orbit.promo".utf8(), code.uppercase().utf8()).hex()
        val amount = promos[h] ?: return PromoResult.INVALID to 0
        val used = (db.getKv("promo.used") ?: "").split(",").filter { it.isNotEmpty() }
        if (h in used) return PromoResult.USED to 0
        db.setKv("promo.used", (used + h).joinToString(","))
        addCoins(amount)
        return PromoResult.OK to amount
    }
    fun redeemPromo(code: String) = redeemCode(code)

    /**
     * Admin token = Ed25519 signature by the authority key over a random id (76 bytes, base32).
     * Single use is enforced on this phone and gossiped ("token X was claimed by Y", first claim wins).
     * Without a central server a second phone that has not heard the gossip could still accept it.
     */
    private fun redeemAdminToken(code: String): Pair<PromoResult, Int> {
        val raw = try { Base32.decode(code) } catch (e: Exception) { return PromoResult.INVALID to 0 }
        if (raw.size != 76) return PromoResult.INVALID to 0
        val id = raw.copyOfRange(0, 12); val sig = raw.copyOfRange(12, 76)
        if (!Sig.verify(adminPub, "orbit.admin.token".utf8() + id, sig)) return PromoResult.INVALID to 0
        val key = "tokused." + id.hex()
        val by = db.getKv(key)
        if (by != null && by != myId) return PromoResult.USED to 0
        if (by == myId && _admin.value) return PromoResult.USED to 0
        db.setKv(key, myId); db.setKv("admin", "1"); db.setKv("admin.tokens", ((db.getKv("admin.tokens") ?: "") + "," + id.hex()).trim(','))
        _admin.value = true
        announceNow()
        return PromoResult.ADMIN to 0
    }

    /** Admin only: mint `count` fresh gifts of any model for free; keep them or hand them to a contact. */
    fun adminMint(model: Int, count: Int, to: String?, message: String, onDone: (Int) -> Unit = {}) {
        if (!_admin.value) return onDone(0)
        scope.launch(single) {
            val me = identity ?: return@launch onDone(0)
            val n = count.coerceIn(1, if (to == null) 200 else 25)
            var made = 0
            repeat(n) {
                val g0 = GiftLogic.mint(me, _profile.value.name, model, nextSerial(model), message)
                if (to == null) db.putGift(g0, true) else deliverGift(to, GiftLogic.transfer(me, g0, to, message), message)
                made++
            }
            _gifts.value = db.gifts(); onDone(made)
        }
    }

    // ============================================================ marketplace (sell gifts for coins at your own price)
    private fun listingsMap(): JSONObject = try { JSONObject(db.getKv("listings") ?: "{}") } catch (e: Exception) { JSONObject() }
    private val _listingsTick = MutableStateFlow(0); val listingsTick: StateFlow<Int> = _listingsTick
    fun myListings(): Map<String, Int> = listingsMap().let { j -> j.keys().asSequence().associateWith { j.getInt(it) } }
    fun listedPrice(gid: String): Int? = listingsMap().optInt(gid, 0).takeIf { it > 0 }

    fun listGift(gid: String, price: Int): Boolean {
        val g = db.gift(gid)?.takeIf { it.second && it.first.owner == myId }?.first ?: return false
        if (price !in 1..1_000_000_000 || !GiftLogic.verify(g)) return false
        db.setKv("listings", listingsMap().put(gid, price).toString()); _listingsTick.value++
        announceNow(); return true
    }
    fun unlistGift(gid: String) {
        val j = listingsMap(); if (!j.has(gid)) return
        j.remove(gid); db.setKv("listings", j.toString()); _listingsTick.value++
        scope.launch(single) { val me = identity ?: return@launch; mesh.submit(Envelope.announce(me.signPub, me::sign, JSONObject().put("k", "gift_off").put("id", me.id).put("gid", gid).toString().utf8())) }
    }

    /** Buyer: pay first (coins leave now), seller's phone answers with the gift or a refund. */
    fun buyListing(e: DirectoryEntry, onResult: (String) -> Unit) {
        scope.launch(single) {
            val me = identity ?: return@launch onResult("Not ready")
            val price = e.desc.toIntOrNull() ?: return@launch onResult("Bad listing")
            val seller = e.username
            val g = try { Gift.fromJson(JSONObject(e.key)) } catch (x: Exception) { return@launch onResult("Bad listing") }
            when {
                seller == me.id -> return@launch onResult("This is your own listing")
                !GiftLogic.verify(g) || g.owner != seller -> return@launch onResult("Gift failed verification")
                _coins.value < price -> return@launch onResult("Not enough coins")
                db.getKv("pending." + g.id) != null -> return@launch onResult("Already waiting for this seller")
            }
            val sc = _contacts.value[seller] ?: addContactInternal(Peer.fromId(seller, e.boxPub.unhex()), e.name, true)
            addCoins(-price)
            db.setKv("pending." + g.id, "$price:$seller")
            mesh.submit(Envelope.direct(me, Peer.fromId(sc.id, sc.boxPub), Pay.enc(JSONObject().put("t", "buy").put("gid", g.id).put("price", price).put("from", myCard())), ttlMs = 48L * 3600_000))
            onResult("Paid $price coins. Waiting for the seller's phone to hand over the gift…")
        }
    }
    fun pendingPurchases(): List<String> = emptyList()

    private suspend fun handleBuy(sender: Peer, j: JSONObject) {
        val me = identity ?: return
        val gid = j.optString("gid"); val price = j.optInt("price")
        val listed = listedPrice(gid)
        val g = db.gift(gid)?.takeIf { it.second && it.first.owner == myId }?.first
        val c = _contacts.value[sender.id] ?: addContactInternal(sender, "", true, j.optJSONObject("from"))
        if (listed != null && listed == price && g != null && sender.id != myId) {
            addCoins(price)
            val g2 = GiftLogic.transfer(me, g, c.id, "")
            db.putGift(g2, false); _gifts.value = db.gifts()
            val l = listingsMap(); l.remove(gid); db.setKv("listings", l.toString()); _listingsTick.value++
            deliverGift(c.id, g2, "")
            mesh.submit(Envelope.announce(me.signPub, me::sign, JSONObject().put("k", "gift_off").put("id", me.id).put("gid", gid).toString().utf8()))
            mesh.submit(Envelope.direct(me, Peer.fromId(c.id, c.boxPub), Pay.enc(JSONObject().put("t", "sold").put("gid", gid)), ttlMs = 7L * 86400_000))
            _events.tryEmit("sold:$gid")
        } else {
            mesh.submit(Envelope.direct(me, Peer.fromId(c.id, c.boxPub), Pay.enc(JSONObject().put("t", "refund").put("gid", gid).put("price", price)), ttlMs = 7L * 86400_000))
        }
    }
    private fun handleSoldOrRefund(sender: Peer, j: JSONObject, refund: Boolean) {
        val gid = j.optString("gid"); val p = db.getKv("pending.$gid") ?: return
        val (price, seller) = p.split(":").let { it[0].toIntOrNull() to it.getOrNull(1) }
        if (seller != sender.id || price == null) return
        db.setKv("pending.$gid", "")
        db.writableDatabase.delete("kv", "k=?", arrayOf("pending.$gid"))
        if (refund) { addCoins(price); _events.tryEmit("refund:$price") } else _events.tryEmit("bought:$gid")
    }

    fun price(model: Int) = app.orbit.gifts.GiftCatalog.models[model].basePrice
    fun addCoins(n: Int) { _coins.value = (_coins.value + n).coerceAtLeast(0); db.setKv("coins", _coins.value.toString()) }
    private fun nextSerial(model: Int): Int { val k = "serial.$model"; val n = (db.getKv(k)?.toIntOrNull() ?: 0) + 1; db.setKv(k, n.toString()); return n }

    // wheel of fortune: (prize, weight). Expected value 18 coins, one free spin every 24 h.
    val wheelPrizes = listOf(5 to 30, 10 to 25, 15 to 18, 20 to 12, 30 to 8, 50 to 4, 100 to 2, 250 to 1)
    fun nextSpinAt() = _lastSpin.value + 24L * 3600_000
    fun canSpin() = now() >= nextSpinAt()
    /** Decides the outcome (secure random), pays it out and returns the winning segment index. */
    @Synchronized fun spinWheel(): Int {
        if (!canSpin()) return -1
        var r = Rand.sr.nextInt(wheelPrizes.sumOf { it.second }); var idx = 0
        for ((i, p) in wheelPrizes.withIndex()) { if (r < p.second) { idx = i; break }; r -= p.second }
        addCoins(wheelPrizes[idx].first)
        _lastSpin.value = now(); db.setKv("lastSpin", _lastSpin.value.toString())
        return idx
    }

    /** Buy a gift with coins: mint it on this device; keep it (to == null) or hand it straight to a contact. */
    fun buyGift(model: Int, message: String, to: String?, onDone: (Gift?) -> Unit = {}) {
        scope.launch(single) {
            val me = identity ?: return@launch onDone(null)
            val cost = price(model)
            if (_coins.value < cost || (to != null && _contacts.value[to] == null)) return@launch onDone(null)
            addCoins(-cost)
            val g0 = GiftLogic.mint(me, _profile.value.name, model, nextSerial(model), message)
            if (to == null) { db.putGift(g0, true); _gifts.value = db.gifts(); onDone(g0) }
            else { val g = GiftLogic.transfer(me, g0, to, message); deliverGift(to, g, message); onDone(g) }
        }
    }

    fun regift(chatId: String, gift: Gift, message: String) {
        scope.launch(single) {
            val me = identity ?: return@launch
            if (gift.owner != me.id) return@launch
            val g = GiftLogic.transfer(me, gift, chatId, message)
            db.putGift(g, false); _gifts.value = db.gifts()
            deliverGift(chatId, g, message)
        }
    }

    private suspend fun deliverGift(chatId: String, g: Gift, message: String) {
        val me = identity ?: return
        val c = _contacts.value[chatId] ?: return
        val id = newMsgId()
        var m = Message(id, chatId, "me", now(), MsgKind.GIFT, message, status = Status.SENDING, extra = JSONObject().put("gid", g.id).put("ok", true))
        db.insertMessage(m); addToFlow(m); touchChat(chatId, m, false)
        db.putGift(g, false); _gifts.value = db.gifts()
        val j = JSONObject().put("t", "gift").put("i", id).put("k", MsgKind.GIFT).put("x", message).put("ts", m.ts).put("gift", g.toJson()).put("from", myCard())
        val env = Envelope.direct(me, Peer.fromId(c.id, c.boxPub), Pay.enc(j))
        db.setMessageEnv(id, env.idHex, 0)
        mesh.submit(env)
        m = m.copy(status = if (mesh.isConnected(chatId)) Status.SENT else Status.CARRIED); db.updateMessage(m); replaceInFlow(m)
    }

    private fun acceptGift(g: Gift) {
        val prev = db.gift(g.id)?.first
        // reject stale branch: we already know a longer chain for this id
        if (prev != null && prev.transfers.size >= g.transfers.size) return
        // counterfeit detection: same issuer/model/serial but different id
        val dup = _gifts.value.any { (x, _) -> x.issuer == g.issuer && x.model == g.model && x.serial == g.serial && x.id != g.id }
        db.putGift(g, !dup); _gifts.value = db.gifts()
    }

    fun giftById(id: String): Pair<Gift, Boolean>? = _gifts.value.firstOrNull { it.first.id == id }
    fun myGifts(): List<Gift> = _gifts.value.filter { it.second && it.first.owner == myId }.map { it.first }

    // ============================================================ utility
    fun search(q: String): List<Message> = if (q.length < 2) emptyList() else db.search(q)

    fun savedChatId() = "saved"


    fun shutdown() { if (_meshReady.value) mesh.shutdown() }
}
