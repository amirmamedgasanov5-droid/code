package app.orbit.core.net.webrtc

import android.content.Context
import app.orbit.core.hex
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.firestore.DocumentChange
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration

/** One signalling message between two phones: want | offer | answer | ice. `from` = sender's user id (hex). */
data class Signal(val from: String, val type: String, val a: String = "", val b: String = "", val n: Int = 0)

interface Signaling {
    val status: String
    fun start(onSignal: (Signal) -> Unit)
    fun stop()
    /** `toTag` = hex of the recipient's routing tag */
    fun send(toTag: String, s: Signal)
}

data class FbConfig(val projectId: String, val appId: String, val apiKey: String) {
    val valid get() = projectId.isNotBlank() && appId.isNotBlank() && apiKey.isNotBlank()
}

/**
 * Firestore as a tiny mailbox: collection `orbit_sig`, one document per signal, addressed by `to` (tag hex).
 * Each phone listens for documents addressed to it and deletes them once read. Nothing else is stored.
 * Firebase is initialised from values the user enters (no google-services.json, no rebuild).
 */
class FirestoreSignaling(private val ctx: Context, private val cfg: FbConfig, private val myTagHex: String) : Signaling {
    @Volatile override var status = "not started"
    private var reg: ListenerRegistration? = null
    private var db: FirebaseFirestore? = null

    private fun app(): FirebaseApp = try { FirebaseApp.getInstance("orbit") } catch (e: IllegalStateException) {
        FirebaseApp.initializeApp(ctx.applicationContext, FirebaseOptions.Builder().setProjectId(cfg.projectId).setApplicationId(cfg.appId).setApiKey(cfg.apiKey).build(), "orbit")
    }

    override fun start(onSignal: (Signal) -> Unit) {
        try {
            val d = FirebaseFirestore.getInstance(app()); db = d
            status = "connecting"
            reg = d.collection("orbit_sig").whereEqualTo("to", myTagHex).addSnapshotListener { snap, err ->
                if (err != null) { status = "error: " + (err.message ?: err.code.name).take(100); return@addSnapshotListener }
                status = if (snap?.metadata?.isFromCache == true) "connected (cache)" else "connected"
                for (c in snap?.documentChanges ?: emptyList()) if (c.type == DocumentChange.Type.ADDED) {
                    val doc = c.document
                    val ts = doc.getLong("ts") ?: 0L
                    val sig = Signal(doc.getString("from") ?: "", doc.getString("type") ?: "", doc.getString("a") ?: "", doc.getString("b") ?: "", (doc.getLong("n") ?: 0L).toInt())
                    doc.reference.delete()
                    if (System.currentTimeMillis() - ts < 120_000 && sig.from.isNotEmpty()) try { onSignal(sig) } catch (_: Exception) {}
                }
            }
        } catch (e: Exception) { status = "error: " + (e.message ?: e.javaClass.simpleName).take(100) }
    }

    override fun stop() { reg?.remove(); reg = null; status = "stopped" }

    override fun send(toTag: String, s: Signal) {
        val d = db ?: return
        d.collection("orbit_sig").add(mapOf("to" to toTag, "from" to s.from, "type" to s.type, "a" to s.a, "b" to s.b, "n" to s.n, "ts" to System.currentTimeMillis()))
            .addOnFailureListener { status = "send error: " + (it.message ?: "").take(90) }
    }

    companion object {
        const val RULES = """rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /orbit_sig/{doc} {
      allow read, delete: if true;
      allow create: if request.resource.data.keys().hasOnly(['to','from','type','a','b','n','ts'])
                    && request.resource.data.a.size() < 20000;
    }
  }
}"""
    }
}
