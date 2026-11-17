package app.orbit.engine

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import app.orbit.MainActivity
import app.orbit.OrbitApp
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first

/** Foreground service: keeps phone-to-phone links and relaying alive when the UI is closed. */
class MeshService : Service() {
    private var wake: PowerManager.WakeLock? = null
    private var job: Job? = null

    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val app = application as OrbitApp
        val pi = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        fun notif(text: String): Notification = NotificationCompat.Builder(this, Notifier.CH_MESH).setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentTitle("Orbit is connected to the mesh").setContentText(text).setContentIntent(pi).setOngoing(true).setOnlyAlertOnce(true).setPriority(NotificationCompat.PRIORITY_LOW).build()
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(1, notif("Looking for nearby phones…"), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
            else startForeground(1, notif("Looking for nearby phones…"))
        } catch (e: Exception) { stopSelf(); return START_NOT_STICKY }
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "orbit:mesh").also { it.setReferenceCounted(false); it.acquire(10 * 60 * 1000L) }
        job?.cancel()
        job = app.engine.scope.launch {
            app.engine.ready.first { it }
            if (!app.engine.hasIdentity.value) { stopSelf(); return@launch }
            app.engine.meshReady.first { it }
            app.transports.start()
            while (isActive) {
                val n = app.engine.mesh.linkCount.value
                val stored = app.engine.mesh.stored.value
                (getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager).notify(1, notif(if (n == 0) "No peers in range · carrying $stored messages" else "$n peer link${if (n > 1) "s" else ""} · carrying $stored messages"))
                wake?.let { if (it.isHeld) it.acquire(10 * 60 * 1000L) }
                delay(20_000)
            }
        }
        return START_STICKY
    }

    override fun onDestroy() { job?.cancel(); wake?.let { if (it.isHeld) it.release() }; super.onDestroy() }

    companion object {
        fun start(ctx: Context) {
            val i = Intent(ctx, MeshService::class.java)
            try { if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i) } catch (_: Exception) {}
        }
    }
}
