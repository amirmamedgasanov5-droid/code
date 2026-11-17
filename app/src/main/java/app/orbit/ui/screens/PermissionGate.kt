package app.orbit.ui.screens

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import app.orbit.engine.Perms
import app.orbit.ui.components.GradientButton
import app.orbit.ui.theme.OrbitTheme

/** Hard gate: Orbit does nothing until notifications, nearby devices and background activity are all allowed. */
@Composable
fun PermissionGate(requestPerms: () -> Unit, content: @Composable () -> Unit) {
    val ctx = LocalContext.current; val p = OrbitTheme.p
    var tick by remember { mutableIntStateOf(0) }
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) { val o = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) tick++ }; owner.lifecycle.addObserver(o); onDispose { owner.lifecycle.removeObserver(o) } }
    val notif = remember(tick) { Perms.notifications(ctx) }; val near = remember(tick) { Perms.nearby(ctx) }; val batt = remember(tick) { Perms.battery(ctx) }
    val all = notif && near && batt
    LaunchedEffect(all) { if (all) requestPerms() }
    if (all) { content(); return }

    fun settings() { try { ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {} }
    val notifL = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { tick++; if (!Perms.notifications(ctx)) settings() }
    val nearL = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { tick++; if (!Perms.nearby(ctx)) { val a = ctx as? Activity; if (a != null && Perms.nearbyList().none { ActivityCompat.shouldShowRequestPermissionRationale(a, it) }) settings() } }
    val battL = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { tick++ }

    Column(Modifier.fillMaxSize().background(p.bg).systemBarsPadding().padding(24.dp).verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(24.dp))
        Text("🔒", fontSize = 56.sp)
        Text("Permissions required", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp))
        Text("Orbit has no server to wake your phone, so it cannot work without these. Allow all three to continue.", color = p.textDim, modifier = Modifier.padding(vertical = 12.dp))
        Step("Notifications", "Messages and calls reach you even when the app is closed", notif, "Allow") {
            if (Build.VERSION.SDK_INT >= 33 && !androidx.core.content.ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.POST_NOTIFICATIONS).let { it == 0 }) notifL.launch(android.Manifest.permission.POST_NOTIFICATIONS) else settings()
        }
        Step("Nearby devices", "Bluetooth and Wi-Fi to find and connect to phones around you", near, "Allow") { nearL.launch(Perms.nearbyList().toTypedArray()) }
        Step("Run in background", "Lets Android keep Orbit's connection alive when the screen is off", batt, "Allow") {
            try { battL.launch(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}"))) } catch (_: Exception) { settings() }
        }
        Spacer(Modifier.height(8.dp))
        Text("If a button does nothing, open Settings → Apps → Orbit and allow it there.", color = p.textDim, fontSize = 12.sp)
    }
}

@Composable
private fun Step(title: String, desc: String, done: Boolean, label: String, onClick: () -> Unit) {
    val p = OrbitTheme.p
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp).clip(RoundedCornerShape(18.dp)).background(p.surface).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(36.dp).clip(CircleShape).background(if (done) p.success else p.surfaceHigh), contentAlignment = Alignment.Center) { Icon(if (done) Icons.Rounded.Check else Icons.Rounded.Lock, null, tint = if (done) Color.White else p.textDim) }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) { Text(title, fontWeight = FontWeight.SemiBold); Text(desc, color = p.textDim, fontSize = 12.5.sp) }
        if (!done) { Spacer(Modifier.width(8.dp)); GradientButton(label, onClick, Modifier.height(40.dp)) }
    }
}
