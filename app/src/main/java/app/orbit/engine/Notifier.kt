package app.orbit.engine

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import app.orbit.MainActivity
import app.orbit.data.Chat

class Notifier(private val ctx: Context) {
    companion object { const val CH_MSG = "messages"; const val CH_MESH = "mesh"; const val CH_LIVE = "live" }
    private val nm = NotificationManagerCompat.from(ctx)
    private val history = HashMap<String, MutableList<String>>()

    init {
        if (Build.VERSION.SDK_INT >= 26) {
            val sys = ctx.getSystemService(NotificationManager::class.java)
            sys.createNotificationChannel(NotificationChannel(CH_MSG, "Messages", NotificationManager.IMPORTANCE_HIGH).apply { description = "New messages"; enableVibration(true) })
            sys.createNotificationChannel(NotificationChannel(CH_MESH, "Mesh network", NotificationManager.IMPORTANCE_LOW).apply { description = "Keeps the peer-to-peer mesh alive in the background" })
            sys.createNotificationChannel(NotificationChannel(CH_LIVE, "Live broadcasts", NotificationManager.IMPORTANCE_DEFAULT))
        }
    }

    fun onMessage(chat: Chat, sender: String, text: String) {
        if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val lines = history.getOrPut(chat.id) { mutableListOf() }
        lines.add(if (chat.type.name == "DIRECT") text else "$sender: $text"); if (lines.size > 6) lines.removeAt(0)
        val intent = Intent(ctx, MainActivity::class.java).putExtra("chat", chat.id).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
        val pi = PendingIntent.getActivity(ctx, chat.id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val style = NotificationCompat.InboxStyle().also { s -> lines.forEach { s.addLine(it) } }.setBigContentTitle(chat.title)
        val n = NotificationCompat.Builder(ctx, CH_MSG).setSmallIcon(android.R.drawable.stat_notify_chat).setContentTitle(chat.title).setContentText(lines.last())
            .setStyle(style).setContentIntent(pi).setAutoCancel(true).setCategory(NotificationCompat.CATEGORY_MESSAGE).setPriority(NotificationCompat.PRIORITY_HIGH).setGroup("msgs").build()
        try { nm.notify(chat.id.hashCode(), n) } catch (_: SecurityException) {}
    }
    fun cancel(chatId: String) { nm.cancel(chatId.hashCode()); history.remove(chatId) }
}
