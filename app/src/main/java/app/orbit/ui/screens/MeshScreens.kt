@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package app.orbit.ui.screens

import android.content.Intent
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import app.orbit.core.mesh.TransportState
import app.orbit.ui.*
import app.orbit.ui.components.*
import app.orbit.ui.theme.OrbitTheme
import java.io.File
import kotlin.math.cos
import kotlin.math.sin

@Composable
fun MeshScreen() { val nav = LocalNav.current; MeshTab(onBack = { nav.pop() }) }

@Composable
fun MeshTab(onBack: (() -> Unit)? = null) {
    val engine = LocalEngine.current; val tm = LocalTransports.current; val nav = LocalNav.current; val p = OrbitTheme.p
    val ctx = LocalContext.current; val perms = LocalRequestPerms.current
    val peers by engine.mesh.peers.collectAsState(); val stored by engine.mesh.stored.collectAsState(); val counters by engine.mesh.counters.collectAsState()
    val states by tm.states.collectAsState(); val contacts by engine.contacts.collectAsState(); val relayOn by engine.relayOnline.collectAsState()
    Column(Modifier.fillMaxSize()) {
        TopBar("Connection", onBack)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            item { Radar(peers.map { it.peerId }, contacts.mapValues { it.value.displayName }) }
            item {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Stat("Peers", "${peers.size}", Icons.Rounded.Devices, Modifier.weight(1f))
                    Stat("Carrying", "$stored", Icons.Rounded.Inventory2, Modifier.weight(1f))
                    Stat("Relayed", "${counters.third}", Icons.Rounded.CompareArrows, Modifier.weight(1f))
                }
            }
            item { SectionLabel("Connections") }
            item {
                Card {
                    TransportRow("Direct (WebRTC + Firebase)", if (engine.fbConfig().valid) "Phone to phone, also on mobile data. Firestore only introduces the phones." else "Not set up yet — tap the Firebase row below", Icons.Rounded.SettingsEthernet, states["webrtc"], tm.prefs().webrtc && engine.fbConfig().valid, perms) { tm.setPref("webrtc", it) }
                    Divider(60.dp)
                    TransportRow("Cloud relay (fallback)", "Delivers when phones can't reach each other directly. Sees only encrypted data.", Icons.Rounded.Cloud, if (engine.relayEnabled()) (if (relayOn) TransportState.ON else TransportState.STARTING) else TransportState.OFF, engine.relayEnabled(), perms) { tm.setPref("relay", it) }
                    Divider(60.dp)
                    TransportRow("Bluetooth · Wi-Fi Direct", "Phone to phone, no internet needed", Icons.Rounded.Bluetooth, states["nearby"], tm.prefs().nearby, perms) { tm.setPref("nearby", it) }
                    Divider(60.dp)
                    TransportRow("Local Wi-Fi / hotspot", "Everyone on the same network", Icons.Rounded.Wifi, states["lan"], tm.prefs().lan, perms) { tm.setPref("lan", it) }
                    Divider(60.dp)
                    TransportRow("Internet (peer-to-peer)", "Worldwide through the public DHT · ${tm.dhtNodes()} nodes known", Icons.Rounded.Public, states["internet"], tm.prefs().internet, perms) { tm.setPref("inet", it) }
                }
            }
            item {
                var dlg by remember { mutableStateOf(false) }
                Card(Modifier.padding(top = 10.dp)) { SettingsRow("Relay servers", engine.relayUrl(), Icons.Rounded.Dns, Color(0xFF9B5CFF), onClick = { dlg = true }) }
                if (dlg) { var urls by remember { mutableStateOf(engine.relayUrlsText()) }
                    AlertDialog({ dlg = false }, containerColor = p.surfaceHigh, title = { Text("Relay servers") },
                        text = { Column { OutlinedTextField(urls, { urls = it }, minLines = 3, label = { Text("One address per line (https://, tls://, wss://, ws://, tcp://)") }, shape = RoundedCornerShape(14.dp))
                            Text("The default list has public MQTT brokers (HiveMQ, EMQX, Mosquitto) and ntfy servers; some may be blocked in your country or need an account and will show an error — remove them if you like. Each listed server sees your IP and the encrypted data. Messages are sent through ALL listed servers at once and received from all of them, so one blocked server does not stop delivery. Any ntfy-compatible server works, including your own. Your contact only needs one server in common with you.", Modifier.padding(top = 8.dp), fontSize = 12.sp, color = p.textDim) } },
                        confirmButton = { TextButton({ engine.setRelay(true, urls); dlg = false }) { Text("Save") } },
                        dismissButton = { TextButton({ engine.setRelay(true, engine.defaultRelays.joinToString("\n")); dlg = false }) { Text("Reset to default") } }) }
            }
            item {
                var wd by remember { mutableStateOf(false) }
                val ctx3 = LocalContext.current
                Card(Modifier.padding(top = 10.dp)) { SettingsRow("Direct connection · Firebase signalling", if (engine.fbConfig().valid) "Project: ${engine.fbConfig().projectId}" else "Set up (2 minutes, free)", Icons.Rounded.Bolt, Color(0xFFFFB020), onClick = { wd = true }) }
                if (wd) { var pj by remember { mutableStateOf(engine.fbConfig().projectId) }; var ap by remember { mutableStateOf(engine.fbConfig().appId) }; var ky by remember { mutableStateOf(engine.fbConfig().apiKey) }
                    AlertDialog({ wd = false }, containerColor = p.surfaceHigh, title = { Text("WebRTC + Firebase") },
                        text = { Column(Modifier.verticalScroll(rememberScrollState())) {
                            OutlinedTextField(pj, { pj = it.trim() }, singleLine = true, label = { Text("Project ID") }, shape = RoundedCornerShape(14.dp))
                            OutlinedTextField(ap, { ap = it.trim() }, singleLine = true, label = { Text("App ID (1:123…:android:abc…)") }, shape = RoundedCornerShape(14.dp), modifier = Modifier.padding(top = 6.dp))
                            OutlinedTextField(ky, { ky = it.trim() }, singleLine = true, label = { Text("API key") }, shape = RoundedCornerShape(14.dp), modifier = Modifier.padding(top = 6.dp))
                            Text("1. console.firebase.google.com → your project\n2. Build → Firestore Database → Create database\n3. Rules tab → paste the rules below → Publish\n4. Project settings (gear) → General → add an Android app (package app.orbit.messenger) → copy App ID; Project ID and Web API key are on the same page\n5. Enter the SAME three values on every phone", Modifier.padding(top = 10.dp), fontSize = 12.sp, color = p.textDim)
                            Text(app.orbit.core.net.webrtc.FirestoreSignaling.RULES, Modifier.padding(top = 8.dp).clip(RoundedCornerShape(10.dp)).background(p.surface).padding(10.dp), fontSize = 10.sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
                            TextButton({ copyText(ctx3, "rules", app.orbit.core.net.webrtc.FirestoreSignaling.RULES) }) { Text("Copy rules") }
                            Text("Firestore only holds short-lived introductions (addresses needed to connect). Messages and calls go directly between phones, encrypted. Behind strict carrier NAT a direct link can still fail — the relays remain as a fallback.", fontSize = 11.5.sp, color = p.textDim)
                        } },
                        confirmButton = { TextButton({ engine.setFbConfig(pj, ap, ky); tm.restart(); wd = false }) { Text("Save") } },
                        dismissButton = { TextButton({ engine.setFbConfig("", "", ""); tm.restart(); wd = false }) { Text("Remove") } }) }
            }
            item {
                var fb by remember { mutableStateOf(false) }
                val ctx2 = LocalContext.current
                Card(Modifier.padding(top = 10.dp)) { SettingsRow("Firebase database (your own)", engine.firebaseUrl().ifBlank { "Not set — the most stable option, see setup" }.removePrefix("https://"), Icons.Rounded.LocalFireDepartment, Color(0xFFFF8A5B), onClick = { fb = true }) }
                if (fb) { var url by remember { mutableStateOf(engine.firebaseUrl()) }
                    AlertDialog({ fb = false }, containerColor = p.surfaceHigh, title = { Text("Firebase Realtime Database") },
                        text = { Column(Modifier.verticalScroll(rememberScrollState())) {
                            OutlinedTextField(url, { url = it.trim() }, singleLine = true, label = { Text("https://….firebaseio.com") }, shape = RoundedCornerShape(14.dp))
                            Text("Setup (2 minutes, free, no card):\n1. console.firebase.google.com → Add project\n2. Build → Realtime Database → Create database (any region, locked mode)\n3. Open the Rules tab, paste the rules below, Publish\n4. Copy the database URL from the Data tab and paste it above\n5. Do the same URL on every phone that should use it", Modifier.padding(top = 10.dp), fontSize = 12.sp, color = p.textDim)
                            Text(FIREBASE_RULES, Modifier.padding(top = 8.dp).clip(RoundedCornerShape(10.dp)).background(p.surface).padding(10.dp), fontSize = 10.5.sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
                            TextButton({ copyText(ctx2, "rules", FIREBASE_RULES) }) { Text("Copy rules") }
                            Text("Messages in the database are end-to-end encrypted. Google sees IP addresses and timing. The rules let anyone who knows a topic read it, but nobody can list all topics.", fontSize = 11.5.sp, color = p.textDim)
                        } },
                        confirmButton = { TextButton({ engine.setFirebase(url); fb = false }) { Text("Save") } },
                        dismissButton = { TextButton({ engine.setFirebase(null); fb = false }) { Text("Remove") } }) }
            }
            item { SectionLabel("Connected now") }
            if (peers.isEmpty()) item { Text("Nobody in range. Messages you send are stored and will hop on automatically when any phone running Orbit comes within reach.", Modifier.padding(horizontal = 20.dp, vertical = 4.dp), style = MaterialTheme.typography.bodyMedium, color = p.textDim) }
            items(peers, key = { it.peerId }) { pi ->
                val c = contacts[pi.peerId]
                Row(Modifier.fillMaxWidth().clickable { nav.push(Route.Chat(pi.peerId)) }.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(c?.displayName ?: pi.peerId.take(2), c?.emoji ?: "", c?.color ?: (pi.signPub[0].toInt() and 7), 42.dp, online = true)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(c?.displayName ?: "Relay ${pi.peerId.take(8)}", style = MaterialTheme.typography.titleSmall)
                        Text(pi.media.joinToString(" · ") + if (c == null) " · not in contacts" else "", style = MaterialTheme.typography.bodySmall, color = p.textDim)
                    }
                    Icon(Icons.Rounded.ChevronRight, null, tint = p.textDim)
                }
            }
            item { SectionLabel("Tools") }
            item {
                Card {
                    SettingsRow("Walkie-talkie", "Push-to-talk to every phone in range", Icons.Rounded.SettingsInputAntenna, Color(0xFFFF8A5B), onClick = { nav.push(Route.Walkie) })
                    Divider(60.dp)
                    SettingsRow("Share Orbit offline", "Send this app to a friend over Bluetooth", Icons.Rounded.Share, Color(0xFF12B981), onClick = {
                        try {
                            val src = File(ctx.applicationInfo.sourceDir); val dst = File(File(ctx.cacheDir, "share").also { it.mkdirs() }, "Orbit.apk"); src.copyTo(dst, true)
                            val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", dst)
                            ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("application/vnd.android.package-archive").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Share Orbit"))
                        } catch (_: Exception) {}
                    })
                    Divider(60.dp)
                    SettingsRow("Network settings", "Ports, manual connect, details", Icons.Rounded.Tune, onClick = { nav.push(Route.Network) })
                    Divider(60.dp)
                    SettingsRow("Grant permissions", "Bluetooth / nearby devices / notifications", Icons.Rounded.Security, Color(0xFF9B5CFF), onClick = perms)
                }
            }
            item { SectionLabel("How it reaches far away") }
            item {
                Column(Modifier.padding(horizontal = 12.dp).clip(RoundedCornerShape(18.dp)).background(p.surface).padding(16.dp)) {
                    Text("Every Orbit phone is also a relay. Your message is sealed so only the recipient can read it, then handed to anyone nearby. Each phone that carries it passes it on when it meets other phones — store-and-forward, like a postal service made of people. With internet, phones find each other directly through the public BitTorrent DHT and connect peer-to-peer. Relays need the app installed; use \"Share Orbit offline\" to bring friends into the mesh.", style = MaterialTheme.typography.bodyMedium, color = p.textDim)
                }
            }
        }
    }
}

@Composable
private fun Stat(label: String, value: String, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier) {
    val p = OrbitTheme.p
    Column(modifier.clip(RoundedCornerShape(16.dp)).background(p.surface).padding(12.dp)) {
        Icon(icon, null, tint = p.accent, modifier = Modifier.size(20.dp))
        Spacer(Modifier.height(6.dp))
        Text(value, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.bodySmall, color = p.textDim)
    }
}

@Composable
private fun TransportRow(title: String, sub: String, icon: androidx.compose.ui.graphics.vector.ImageVector, state: TransportState?, enabled: Boolean, perms: () -> Unit, onToggle: (Boolean) -> Unit) {
    val p = OrbitTheme.p
    val (label, color) = when (if (!enabled) TransportState.OFF else state ?: TransportState.OFF) {
        TransportState.ON -> "active" to p.success; TransportState.STARTING -> "starting" to p.accent; TransportState.OFF -> "off" to p.textDim
        TransportState.NEEDS_PERMISSION -> "needs permission" to p.danger; TransportState.UNAVAILABLE -> "unavailable" to p.danger
    }
    SettingsRow(title, "$sub", icon, onClick = if (state == TransportState.NEEDS_PERMISSION) perms else null) {
        Column(horizontalAlignment = Alignment.End) {
            OrbitSwitch(enabled, onToggle)
            Text(label, fontSize = 11.sp, color = color, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun Radar(peerIds: List<String>, names: Map<String, String>) {
    val p = OrbitTheme.p
    val inf = rememberInfiniteTransition(label = "radar")
    val sweep by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(3200, easing = LinearEasing)), label = "sweep")
    val spin by inf.animateFloat(0f, 360f, infiniteRepeatable(tween(24000, easing = LinearEasing)), label = "spin")
    Box(Modifier.fillMaxWidth().height(250.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val c = Offset(size.width / 2, size.height / 2); val maxR = size.height * 0.46f
            for (i in 1..3) drawCircle(p.accent.copy(alpha = 0.10f + 0.03f * i), maxR * i / 3, c, style = Stroke(1.5f))
            val r = maxR * sweep
            drawCircle(p.accent.copy(alpha = (1f - sweep) * 0.35f), r, c, style = Stroke(3f))
            drawCircle(Brush.radialGradient(listOf(p.accent.copy(alpha = 0.18f), Color.Transparent), c, maxR), maxR, c)
            peerIds.forEachIndexed { i, id ->
                val h = id.hashCode(); val ang = (h % 360) * 0.01745f + spin * 0.0017f * 0f
                val rad = maxR * (0.35f + ((h ushr 8) % 55) / 100f)
                val pos = Offset(c.x + cos(ang) * rad, c.y + sin(ang) * rad)
                drawCircle(p.success.copy(alpha = 0.25f), 18f, pos); drawCircle(p.success, 8f, pos)
            }
        }
        Box(Modifier.size(54.dp).clip(CircleShape).background(p.accentBrush), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Person, null, tint = Color.White, modifier = Modifier.size(28.dp)) }
    }
}

@Composable
fun NetworkScreen() {
    val nav = LocalNav.current; val engine = LocalEngine.current; val tm = LocalTransports.current; val p = OrbitTheme.p
    var host by remember { mutableStateOf("") }
    var result by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize()) {
        TopBar("Network", { nav.pop() })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            SectionLabel("Local endpoint")
            Card {
                SettingsRow("LAN port", "${tm.lanPort()}", Icons.Rounded.Lan)
                Divider(60.dp)
                SettingsRow("DHT nodes known", "${tm.dhtNodes()}", Icons.Rounded.Hub)
                Divider(60.dp)
                SettingsRow("Node id", engine.myId.take(16) + "…", Icons.Rounded.Fingerprint)
            }
            SectionLabel("Connect manually (host:port)")
            Card {
                Column(Modifier.padding(14.dp)) {
                    OutlinedTextField(host, { host = it }, Modifier.fillMaxWidth(), singleLine = true, placeholder = { Text("192.168.1.20:41234") }, shape = RoundedCornerShape(14.dp))
                    Spacer(Modifier.height(10.dp))
                    TonalButton("Connect", { val (h, pt) = host.trim().split(":").let { it[0] to (it.getOrNull(1)?.toIntOrNull() ?: 0) }; result = if (pt > 0 && tm.connectLan(h, pt)) "Connected" else "Could not reach $host" }, Modifier.fillMaxWidth())
                    if (result.isNotEmpty()) Text(result, Modifier.padding(top = 8.dp), color = p.textDim)
                }
            }
            SectionLabel("Good to know")
            Column(Modifier.padding(horizontal = 12.dp).clip(RoundedCornerShape(18.dp)).background(p.surface).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("• Internet mode publishes your IP address in the public BitTorrent DHT under a hash of your key, exactly like any torrent client. Turn it off if you only want nearby/offline use.", color = p.textDim, style = MaterialTheme.typography.bodyMedium)
                Text("• Two phones that are both behind carrier-grade NAT may be unable to connect directly. Messages then travel through the mesh via any phone that can reach both.", color = p.textDim, style = MaterialTheme.typography.bodyMedium)
                Text("• Keeping the mesh alive in the background uses a small amount of battery; the notification can be silenced but not removed (Android requirement).", color = p.textDim, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

private const val FIREBASE_RULES = """{
  "rules": {
    "orbit": {
      "${'$'}topic": {
        ".read": true,
        "${'$'}id": {
          ".write": true,
          ".validate": "newData.hasChildren(['t','d']) && newData.child('d').isString() && newData.child('d').val().length < 400000"
        }
      }
    }
  }
}"""
