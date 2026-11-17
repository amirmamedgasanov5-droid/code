package app.orbit.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.orbit.ui.*
import app.orbit.ui.components.*
import app.orbit.ui.theme.OrbitTheme

fun isBatteryExempt(ctx: Context): Boolean = try { (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(ctx.packageName) } catch (e: Exception) { true }

@Composable
fun ReliableScreen() {
    val nav = LocalNav.current; val p = OrbitTheme.p; val ctx = LocalContext.current
    var exempt by remember { mutableStateOf(isBatteryExempt(ctx)) }
    fun open(i: Intent) { try { ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) { try { ctx.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {} } }
    Column(Modifier.fillMaxSize()) {
        TopBar("Reliable notifications", { nav.pop() })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text(if (exempt) "✅ Background activity is allowed" else "⚠️ Android may stop Orbit in the background", style = MaterialTheme.typography.titleMedium)
                Text("There is no Google push here. Orbit keeps its own connection alive in a foreground service, so Android must be allowed to leave it running. Do these steps once.", color = p.textDim, modifier = Modifier.padding(top = 6.dp))
            }
            Card {
                SettingsRow("1. Allow unrestricted battery use", if (exempt) "Done" else "Tap to allow — required for calls and messages when the screen is off", Icons.Rounded.BatteryChargingFull, if (exempt) Color(0xFF12B981) else Color(0xFFFF6B5E), onClick = {
                    open(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}")))
                    exempt = isBatteryExempt(ctx)
                })
                Divider(60.dp)
                SettingsRow("2. Notifications on", "Make sure messages, calls and the Orbit service are not silenced", Icons.Rounded.Notifications, onClick = {
                    open(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName))
                })
                Divider(60.dp)
                SettingsRow("3. Auto-start / lock in recents", "Xiaomi, Huawei, Oppo, Vivo, Samsung: allow auto-start and keep Orbit locked in the app switcher", Icons.Rounded.RocketLaunch, Color(0xFF9B5CFF), onClick = {
                    open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")))
                })
            }
            SectionLabel("What is and is not possible")
            Column(Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(
                    "✅ Screen off, phone locked, app swiped away: messages and calls keep arriving (the service restarts itself and after reboot).",
                    "✅ Incoming call opens full screen over the lock screen and rings.",
                    "❌ Phone powered off, airplane mode, or no network: nothing can arrive. Cloud relay keeps messages for about 12 hours and delivers them when you are back online.",
                    "❌ If you use Force stop in Android settings, Android blocks the app until you open it once.",
                ).forEach { Text(it, color = p.textDim, style = MaterialTheme.typography.bodyMedium) }
            }
        }
    }
}
