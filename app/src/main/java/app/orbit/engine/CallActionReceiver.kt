package app.orbit.engine

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import app.orbit.OrbitApp

/** "Decline" button on the incoming-call notification: works without opening the app. */
class CallActionReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        val app = c.applicationContext as? OrbitApp ?: return
        val inc = app.engine.incomingCall.value ?: return
        app.live.declineCall(inc)
    }
}
