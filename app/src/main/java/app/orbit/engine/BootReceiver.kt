package app.orbit.engine

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restart the mesh after reboot so relaying resumes without opening the app. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) { if (i.action == Intent.ACTION_BOOT_COMPLETED) MeshService.start(c) }
}
