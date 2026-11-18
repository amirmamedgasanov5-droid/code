package app.orbit

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import app.orbit.engine.MeshService
import app.orbit.engine.Perms
import app.orbit.ui.OrbitRoot

class MainActivity : ComponentActivity() {
    private val pendingOpen = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as OrbitApp
        handleIntent(intent)
        lifecycle.addObserver(LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_START -> { app.engine.inForeground = true; if (app.engine.hasIdentity.value) app.engine.relayKick(); if (app.engine.hasIdentity.value && Perms.allGranted(this)) MeshService.start(this) }
                Lifecycle.Event.ON_STOP -> app.engine.inForeground = false
                else -> {}
            }
        })
        setContent { OrbitRoot(app, pendingOpen, requestPerms = { requestMeshPermissions() }) }
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); handleIntent(intent) }

    private fun handleIntent(i: Intent?) {
        i ?: return
        if (i.getStringExtra("call_action") == "accept") pendingOpen.value = "call:accept"
        i.getStringExtra("chat")?.let { pendingOpen.value = "chat:$it" }
        i.data?.let { if (it.scheme == "orbit") pendingOpen.value = "link:$it" }
        if (i.action == Intent.ACTION_SEND && i.type?.startsWith("text/") == true) i.getStringExtra(Intent.EXTRA_TEXT)?.let { pendingOpen.value = "text:$it" }
    }

    fun requestMeshPermissions() {
        val need = ArrayList<String>()
        if (Build.VERSION.SDK_INT >= 31) { need += Manifest.permission.BLUETOOTH_SCAN; need += Manifest.permission.BLUETOOTH_ADVERTISE; need += Manifest.permission.BLUETOOTH_CONNECT }
        else need += Manifest.permission.ACCESS_FINE_LOCATION
        if (Build.VERSION.SDK_INT >= 33) need += Manifest.permission.NEARBY_WIFI_DEVICES
        else if (Build.VERSION.SDK_INT >= 31) need += Manifest.permission.ACCESS_FINE_LOCATION
        val missing = need.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) permLauncher.launch(missing.toTypedArray()) else onPermsDone()
    }

    private val permLauncher = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions()) { onPermsDone() }
    private fun onPermsDone() {
        val app = application as OrbitApp
        if (!Perms.allGranted(this)) return
        MeshService.start(this)
        app.transports.restart()
    }
}
