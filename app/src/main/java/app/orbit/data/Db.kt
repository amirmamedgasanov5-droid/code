package app.orbit.data

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import app.orbit.core.unhex
import app.orbit.core.mesh.Envelope
import app.orbit.core.mesh.EnvelopeStore
import org.json.JSONObject

class Db(ctx: Context, name: String = "orbit.db") : SQLiteOpenHelper(ctx, name, null, 1) {
    override fun onConfigure(db: SQLiteDatabase) { db.enableWriteAheadLogging() }
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE kv(k TEXT PRIMARY KEY, v TEXT)")
        db.execSQL("CREATE TABLE contacts(id TEXT PRIMARY KEY, box BLOB, name TEXT, bio TEXT, emoji TEXT, color INT, username TEXT, added INT, seen INT, blocked INT, stranger INT, verified INT)")
        db.execSQL("CREATE TABLE chats(id TEXT PRIMARY KEY, type INT, title TEXT, emoji TEXT, color INT, pinned INT, muted INT, archived INT, unread INT, lastTs INT, preview TEXT, lastStatus INT, lastMine INT, draft TEXT, meta TEXT)")
        db.execSQL("CREATE TABLE messages(id TEXT PRIMARY KEY, chat TEXT, sender TEXT, ts INT, kind INT, text TEXT, reply TEXT, media TEXT, dur INT, status INT, edited INT, deleted INT, reactions TEXT, extra TEXT, views INT, pinned INT, fwd TEXT, env TEXT, tries INT DEFAULT 0, lastTry INT DEFAULT 0)")
        db.execSQL("CREATE INDEX msg_chat_ts ON messages(chat, ts)")
        db.execSQL("CREATE INDEX msg_env ON messages(env)")
        db.execSQL("CREATE TABLE envelopes(id TEXT PRIMARY KEY, expires INT, bytes BLOB)")
        db.execSQL("CREATE TABLE gifts(id TEXT PRIMARY KEY, json TEXT, mine INT, ts INT)")
        db.execSQL("CREATE TABLE directory(id TEXT PRIMARY KEY, json TEXT, ts INT)")
    }
    override fun onUpgrade(db: SQLiteDatabase, o: Int, n: Int) {}

    // ---- kv
    fun getKv(k: String): String? = readableDatabase.rawQuery("SELECT v FROM kv WHERE k=?", arrayOf(k)).use { if (it.moveToFirst()) it.getString(0) else null }
    fun setKv(k: String, v: String) { writableDatabase.execSQL("INSERT OR REPLACE INTO kv VALUES(?,?)", arrayOf(k, v)) }

    // ---- contacts
    fun upsertContact(c: Contact) {
        val v = ContentValues().apply {
            put("id", c.id); put("box", c.boxPub); put("name", c.name); put("bio", c.bio); put("emoji", c.emoji); put("color", c.color)
            put("username", c.username); put("added", c.addedAt); put("seen", c.lastSeen); put("blocked", c.blocked.i()); put("stranger", c.stranger.i()); put("verified", c.verified.i())
        }
        writableDatabase.insertWithOnConflict("contacts", null, v, SQLiteDatabase.CONFLICT_REPLACE)
    }
    fun contacts(): List<Contact> = readableDatabase.rawQuery("SELECT * FROM contacts", null).use { c ->
        buildList { while (c.moveToNext()) add(Contact(c.s("id"), c.getBlob(c.getColumnIndexOrThrow("box")), c.s("name"), c.s("bio"), c.s("emoji"), c.i("color"), c.s("username"), c.l("added"), c.l("seen"), c.i("blocked") == 1, c.i("stranger") == 1, c.i("verified") == 1)) }
    }
    fun deleteContact(id: String) { writableDatabase.delete("contacts", "id=?", arrayOf(id)) }

    // ---- chats
    fun upsertChat(c: Chat) {
        val v = ContentValues().apply {
            put("id", c.id); put("type", c.type.ordinal); put("title", c.title); put("emoji", c.emoji); put("color", c.color)
            put("pinned", c.pinned.i()); put("muted", c.muted.i()); put("archived", c.archived.i()); put("unread", c.unread)
            put("lastTs", c.lastTs); put("preview", c.lastPreview); put("lastStatus", c.lastStatus); put("lastMine", c.lastMine.i()); put("draft", c.draft); put("meta", c.meta.toString())
        }
        writableDatabase.insertWithOnConflict("chats", null, v, SQLiteDatabase.CONFLICT_REPLACE)
    }
    fun chats(): List<Chat> = readableDatabase.rawQuery("SELECT * FROM chats", null).use { c ->
        buildList { while (c.moveToNext()) add(Chat(c.s("id"), ChatType.values()[c.i("type")], c.s("title"), c.s("emoji"), c.i("color"), c.i("pinned") == 1, c.i("muted") == 1, c.i("archived") == 1, c.i("unread"), c.l("lastTs"), c.s("preview"), c.i("lastStatus"), c.i("lastMine") == 1, c.s("draft"), JSONObject(c.s("meta").ifBlank { "{}" }))) }
    }
    fun deleteChat(id: String) { writableDatabase.delete("chats", "id=?", arrayOf(id)); writableDatabase.delete("messages", "chat=?", arrayOf(id)) }

    // ---- messages
    fun insertMessage(m: Message, envHex: String? = null): Boolean {
        val v = ContentValues().apply {
            put("id", m.id); put("chat", m.chatId); put("sender", m.sender); put("ts", m.ts); put("kind", m.kind); put("text", m.text); put("reply", m.replyTo)
            put("media", m.media); put("dur", m.durationMs); put("status", m.status); put("edited", m.edited.i()); put("deleted", m.deleted.i())
            put("reactions", reactionsJson(m.reactions)); put("extra", m.extra.toString()); put("views", m.views); put("pinned", m.pinned.i()); put("fwd", m.forwardedFrom); put("env", envHex)
        }
        return writableDatabase.insertWithOnConflict("messages", null, v, SQLiteDatabase.CONFLICT_IGNORE) != -1L
    }
    fun updateMessage(m: Message) {
        val v = ContentValues().apply {
            put("text", m.text); put("status", m.status); put("edited", m.edited.i()); put("deleted", m.deleted.i()); put("reactions", reactionsJson(m.reactions))
            put("extra", m.extra.toString()); put("views", m.views); put("pinned", m.pinned.i()); put("media", m.media)
        }
        writableDatabase.update("messages", v, "id=?", arrayOf(m.id))
    }
    fun setMessageEnv(id: String, env: String, tries: Int) { writableDatabase.execSQL("UPDATE messages SET env=?, tries=?, lastTry=? WHERE id=?", arrayOf(env, tries, System.currentTimeMillis(), id)) }
    fun message(id: String): Message? = readableDatabase.rawQuery("SELECT * FROM messages WHERE id=?", arrayOf(id)).use { if (it.moveToFirst()) it.toMsg() else null }
    fun messageByEnv(env: String): Message? = readableDatabase.rawQuery("SELECT * FROM messages WHERE env=?", arrayOf(env)).use { if (it.moveToFirst()) it.toMsg() else null }
    fun messages(chat: String, limit: Int): List<Message> = readableDatabase.rawQuery("SELECT * FROM messages WHERE chat=? ORDER BY ts DESC LIMIT ?", arrayOf(chat, "$limit")).use { c -> buildList { while (c.moveToNext()) add(c.toMsg()) }.reversed() }
    fun pendingOutgoing(): List<Triple<Message, Int, Long>> = readableDatabase.rawQuery("SELECT * FROM messages WHERE sender='me' AND status=1 AND ts>?", arrayOf("${System.currentTimeMillis() - 14L * 86400_000}")).use { c ->
        buildList { while (c.moveToNext()) add(Triple(c.toMsg(), c.i("tries"), c.l("lastTry"))) }
    }
    fun search(q: String, limit: Int = 60): List<Message> = readableDatabase.rawQuery("SELECT * FROM messages WHERE deleted=0 AND kind IN (0,1) AND text LIKE ? ORDER BY ts DESC LIMIT ?", arrayOf("%$q%", "$limit")).use { c -> buildList { while (c.moveToNext()) add(c.toMsg()) } }
    fun deleteMessage(id: String) { writableDatabase.delete("messages", "id=?", arrayOf(id)) }
    fun mediaOfChat(chat: String): List<String> = readableDatabase.rawQuery("SELECT media FROM messages WHERE chat=? AND media<>''", arrayOf(chat)).use { c -> buildList { while (c.moveToNext()) add(c.getString(0)) } }

    // ---- gifts
    fun putGift(g: Gift, mine: Boolean) { writableDatabase.execSQL("INSERT OR REPLACE INTO gifts VALUES(?,?,?,?)", arrayOf(g.id, g.toJson().toString(), mine.i(), System.currentTimeMillis())) }
    fun gifts(): List<Pair<Gift, Boolean>> = readableDatabase.rawQuery("SELECT json, mine FROM gifts ORDER BY ts DESC", null).use { c -> buildList { while (c.moveToNext()) add(Gift.fromJson(JSONObject(c.getString(0))) to (c.getInt(1) == 1)) } }
    fun gift(id: String): Pair<Gift, Boolean>? = readableDatabase.rawQuery("SELECT json, mine FROM gifts WHERE id=?", arrayOf(id)).use { if (it.moveToFirst()) Gift.fromJson(JSONObject(it.getString(0))) to (it.getInt(1) == 1) else null }

    // ---- directory
    fun putDirectory(e: DirectoryEntry) {
        val j = JSONObject().put("id", e.id).put("k", e.kind).put("n", e.name).put("u", e.username).put("d", e.desc).put("e", e.emoji).put("c", e.color).put("b", e.boxPub).put("key", e.key).put("ts", e.ts).put("m", e.members)
        writableDatabase.execSQL("INSERT OR REPLACE INTO directory VALUES(?,?,?)", arrayOf(e.id, j.toString(), e.ts))
    }
    fun directory(): List<DirectoryEntry> = readableDatabase.rawQuery("SELECT json FROM directory ORDER BY ts DESC LIMIT 800", null).use { c ->
        buildList { while (c.moveToNext()) { val j = JSONObject(c.getString(0)); add(DirectoryEntry(j.getString("id"), j.getString("k"), j.getString("n"), j.optString("u"), j.optString("d"), j.optString("e"), j.optInt("c"), j.optString("b"), j.optString("key"), j.getLong("ts"), j.optInt("m"))) } }
    }

    private fun reactionsJson(r: Map<String, List<String>>) = JSONObject().also { o -> r.forEach { (k, v) -> o.put(k, v.toJsonArray()) } }.toString()
    private fun Cursor.toMsg(): Message {
        val rj = JSONObject(s("reactions").ifBlank { "{}" })
        val reactions = rj.keys().asSequence().associateWith { rj.getJSONArray(it).let { a -> (0 until a.length()).map { i -> a.getString(i) } } }
        return Message(s("id"), s("chat"), s("sender"), l("ts"), i("kind"), s("text"), s("reply"), s("media"), i("dur"), i("status"), i("edited") == 1, i("deleted") == 1, reactions, JSONObject(s("extra").ifBlank { "{}" }), i("views"), i("pinned") == 1, s("fwd"))
    }
    private fun Boolean.i() = if (this) 1 else 0
    private fun Cursor.s(n: String): String = getString(getColumnIndexOrThrow(n)) ?: ""
    private fun Cursor.i(n: String): Int = getInt(getColumnIndexOrThrow(n))
    private fun Cursor.l(n: String): Long = getLong(getColumnIndexOrThrow(n))
}

/** Mesh carry-store persisted in SQLite so a phone keeps relaying across restarts. */
class SqlEnvelopeStore(private val db: Db) : EnvelopeStore {
    override fun put(e: Envelope) { db.writableDatabase.execSQL("INSERT OR REPLACE INTO envelopes VALUES(?,?,?)", arrayOf(e.idHex, e.expires, e.encode())) }
    override fun get(idHex: String): Envelope? = db.readableDatabase.rawQuery("SELECT bytes FROM envelopes WHERE id=?", arrayOf(idHex)).use { if (it.moveToFirst()) Envelope.decode(it.getBlob(0)) else null }
    override fun remove(idHex: String) { db.writableDatabase.delete("envelopes", "id=?", arrayOf(idHex)) }
    override fun ids(limit: Int): List<ByteArray> = db.readableDatabase.rawQuery("SELECT id FROM envelopes ORDER BY rowid DESC LIMIT ?", arrayOf("$limit")).use { c -> buildList { while (c.moveToNext()) add(c.getString(0).unhex()) } }
    override fun count(): Int = db.readableDatabase.rawQuery("SELECT COUNT(*) FROM envelopes", null).use { it.moveToFirst(); it.getInt(0) }
    override fun purge(now: Long): Int = db.writableDatabase.delete("envelopes", "expires<?", arrayOf("$now"))
    override fun trim(max: Int) { db.writableDatabase.execSQL("DELETE FROM envelopes WHERE rowid IN (SELECT rowid FROM envelopes ORDER BY rowid ASC LIMIT MAX(0,(SELECT COUNT(*) FROM envelopes)-?))", arrayOf(max)) }
}
