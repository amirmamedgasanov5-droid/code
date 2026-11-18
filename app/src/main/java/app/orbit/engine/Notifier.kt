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

class Notifier(private val ctx: Context, private val kv: (String) -> String? = { null }) {
    companion object { const val CH_MSG = "messages"; const val CH_MESH = "mesh"; const val CH_LIVE = "live" }
    private val nm = NotificationManagerCompat.from(ctx)
    private val history = HashMap<String, MutableList<String>>()

    init {
        if (Build.VERSION.SDK_INT >= 26) {
            val sys = ctx.getSystemService(NotificationManager::class.java)
            sys.createNotificationChannel(NotificationChannel(CH_MESH, "Mesh network", NotificationManager.IMPORTANCE_LOW).apply { description = "Keeps the peer-to-peer mesh alive in the background" })
            sys.createNotificationChannel(NotificationChannel(CH_LIVE, "Live broadcasts", NotificationManager.IMPORTANCE_HIGH))
        }
    }

    // ---- user-selectable sounds (stored as kv: snd.msg / snd.call = "" default | "none" | uri, snd.vib = "0"/"1")
    fun soundUri(key: String, type: Int): android.net.Uri? {
        val v = kv(key)
        return when { v == "none" -> null; v.isNullOrEmpty() -> android.media.RingtoneManager.getDefaultUri(type); else -> try { android.net.Uri.parse(v) } catch (e: Exception) { android.media.RingtoneManager.getDefaultUri(type) } }
    }
    fun msgUri() = soundUri("snd.msg", android.media.RingtoneManager.TYPE_NOTIFICATION)
    fun callUri() = soundUri("snd.call", android.media.RingtoneManager.TYPE_RINGTONE)
    fun vibrate() = kv("snd.vib") != "0"

    /** Android fixes a channel's sound at creation, so every distinct choice gets its own channel. */
    private fun channelFor(prefix: String, uri: android.net.Uri?, usage: Int, name: String): String {
        val id = prefix + (uri?.toString()?.hashCode() ?: 0).toString(16) + if (vibrate()) "v" else "q"
        if (Build.VERSION.SDK_INT >= 26) {
            val sys = ctx.getSystemService(NotificationManager::class.java)
            if (sys.getNotificationChannel(id) == null) {
                sys.notificationChannels.filter { it.id.startsWith(prefix) && it.id != id }.forEach { sys.deleteNotificationChannel(it.id) }
                sys.createNotificationChannel(NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH).apply {
                    setSound(uri, android.media.AudioAttributes.Builder().setUsage(usage).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                    enableVibration(vibrate()); if (vibrate()) vibrationPattern = longArrayOf(0, 250, 150, 250)
                })
            }
        }
        return id
    }

    fun onMessage(chat: Chat, sender: String, text: String) {
        if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val lines = history.getOrPut(chat.id) { mutableListOf() }
        lines.add(if (chat.type.name == "DIRECT") text else "$sender: $text"); if (lines.size > 6) lines.removeAt(0)
        val intent = Intent(ctx, MainActivity::class.java).putExtra("chat", chat.id).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
        val pi = PendingIntent.getActivity(ctx, chat.id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val style = NotificationCompat.InboxStyle().also { s -> lines.forEach { s.addLine(it) } }.setBigContentTitle(chat.title)
        val n = NotificationCompat.Builder(ctx, channelFor("messages_", msgUri(), android.media.AudioAttributes.USAGE_NOTIFICATION, "Messages")).setSmallIcon(android.R.drawable.stat_notify_chat).setContentTitle(chat.title).setContentText(lines.last())
            .setStyle(style).setContentIntent(pi).setAutoCancel(true).setCategory(NotificationCompat.CATEGORY_MESSAGE).setPriority(NotificationCompat.PRIORITY_HIGH).setGroup("msgs").build()
        try { nm.notify(chat.id.hashCode(), n) } catch (_: SecurityException) {}
    }
    fun onCall(name: String) {
        if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val pi = PendingIntent.getActivity(ctx, 7, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(ctx, channelFor("calls_", callUri(), android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE, "Calls")).setSmallIcon(android.R.drawable.sym_action_call).setContentTitle("Incoming call").setContentText(name).setContentIntent(pi)
            .setCategory(NotificationCompat.CATEGORY_CALL).setPriority(NotificationCompat.PRIORITY_MAX).setFullScreenIntent(pi, true).setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setOngoing(true).setTimeoutAfter(45_000).build().also { it.flags = it.flags or android.app.Notification.FLAG_INSISTENT }
        try { nm.notify("call".hashCode(), n) } catch (_: SecurityException) {}
    }
    fun cancel(chatId: String) { nm.cancel(chatId.hashCode()); history.remove(chatId) }
}
