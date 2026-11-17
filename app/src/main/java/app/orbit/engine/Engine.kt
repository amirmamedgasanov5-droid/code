package app.orbit.engine

import android.content.Context
import android.net.Uri
import app.orbit.core.*
import app.orbit.core.crypto.*
import app.orbit.core.mesh.*
import app.orbit.data.*
import app.orbit.gifts.GiftLogic
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
class Engine(val ctx: Context) : MeshHandler {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val single = Dispatchers.Default.limitedParallelism(1)
    val db = Db(ctx)
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
            delay(5_000)
            while (isActive) { if (mesh.linkCount.value > 0) announceAll(); delay(6 * 3600_000L) }
        }
        _meshReady.value = true
    }
    private val _meshReady = MutableStateFlow(false); val meshReady: StateFlow<Boolean> = _meshReady

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

    fun contactName(id: String): String = if (id == "me" || id == myId) "You" else _contacts.value[id]?.displayName ?: "User ${id.take(6)}"

    fun setBlocked(id: String, b: Boolean) { scope.launch(single) { _contacts.value[id]?.let { val c = it.copy(blocked = b, stranger = if (b) it.stranger else false); db.upsertContact(c); _contacts.value = _contacts.value + (id to c) } } }
    fun acceptStranger(id: String) { scope.launch(single) { _contacts.value[id]?.let { val c = it.copy(stranger = false); db.upsertContact(c); _contacts.value = _contacts.value + (id to c); sendHello(c) } } }
    fun deleteContact(id: String) { scope.launch(single) { db.deleteContact(id); _contacts.value = _contacts.value - id; deleteChatInternal(id) } }
    fun renameContact(id: String, name: String) { scope.launch(single) { _contacts.value[id]?.let { val c = it.copy(name = name); db.upsertContact(c); _contacts.value = _contacts.value + (id to c); ensureDirect(c) } } }

    private fun myCard() = JSONObject().put("n", _profile.value.name).put("e", _profile.value.emoji).put("c", _profile.value.color).put("u", _profile.value.username).put("b", _profile.value.bio)

    private suspend fun sendHello(c: Contact) {
        val id = identity ?: return
        val j = JSONObject().put("t", "hi").put("p", myCard())
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
        val backoff = longArrayOf(2 * 60_000, 10 * 60_000, 60 * 60_000, 6 * 3600_000, 24 * 3600_000, 48 * 3600_000)
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
                addContactInternal(sender, "", stranger = old == null, p = j.optJSONObject("p"))
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
        }
    }

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
    private fun dayKey() = now() / 86400_000
    fun mintsLeft(): Int {
        val used = if (db.getKv("mint.day") == dayKey().toString()) (db.getKv("mint.cnt")?.toIntOrNull() ?: 0) else 0
        return (GiftLogic.DAILY_MINT_LIMIT - used).coerceAtLeast(0)
    }
    private fun nextSerial(model: Int): Int { val k = "serial.$model"; val n = (db.getKv(k)?.toIntOrNull() ?: 0) + 1; db.setKv(k, n.toString()); return n }

    /** Mint a fresh collectible and send it. Provenance is a signed chain, verified by every receiver. */
    fun sendNewGift(chatId: String, model: Int, message: String, onMinted: (Gift) -> Unit = {}): Boolean {
        if (chatMap[chatId]?.type != ChatType.DIRECT || mintsLeft() <= 0) return false
        scope.launch(single) {
            val me = identity ?: return@launch
            if (db.getKv("mint.day") != dayKey().toString()) { db.setKv("mint.day", dayKey().toString()); db.setKv("mint.cnt", "0") }
            db.setKv("mint.cnt", ((db.getKv("mint.cnt")?.toIntOrNull() ?: 0) + 1).toString())
            val g0 = GiftLogic.mint(me, _profile.value.name, model, nextSerial(model), message)
            val g = GiftLogic.transfer(me, g0, chatId, message)
            deliverGift(chatId, g, message)
            onMinted(g)
        }
        return true
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
