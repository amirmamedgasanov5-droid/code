@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package app.orbit.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.orbit.data.Profile
import app.orbit.ui.*
import app.orbit.ui.components.*
import app.orbit.ui.theme.*

val AvatarEmojis = listOf("🙂", "😎", "🦊", "🐼", "🐯", "🦄", "🐙", "🚀", "🌙", "🔥", "🌿", "⚡", "🎧", "👾", "🦉", "🐳", "🍀", "🎨", "🛰️", "🪐")

fun copyText(ctx: Context, label: String, text: String) {
    (ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText(label, text))
}

@Composable
fun MeTab() {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p
    val prof by engine.profile.collectAsState(); val gifts by engine.gifts.collectAsState()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
        Box(Modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(p.accent.copy(alpha = 0.28f), p.bg)))) {
            Column(Modifier.fillMaxWidth().statusBarsPadding().padding(top = 24.dp, bottom = 18.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Avatar(prof.name, prof.emoji, prof.color, 96.dp)
                Spacer(Modifier.height(12.dp))
                Text(prof.name.ifBlank { "Anonymous" }, style = MaterialTheme.typography.titleLarge)
                Text(if (prof.username.isNotBlank()) "@${prof.username}" else "No username · tap Edit to claim one", color = p.textDim)
                if (prof.bio.isNotBlank()) Text(prof.bio, Modifier.padding(horizontal = 32.dp, vertical = 4.dp), color = p.textDim, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    TonalButton("Edit", { nav.push(Route.EditProfile) }, icon = Icons.Rounded.Edit)
                    TonalButton("My QR", { nav.push(Route.MyQr) }, icon = Icons.Rounded.QrCode2)
                }
            }
        }
        val coins by engine.coins.collectAsState()
        Row(Modifier.padding(horizontal = 12.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Brush.linearGradient(listOf(Color(0xFFFFB020), Color(0xFFFF7A45)))).pressable({ nav.push(Route.Wheel) }).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("💰", fontSize = 34.sp); Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) { Text("$coins coins", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp); Text(if (engine.canSpin()) "Free spin ready — tap to win up to 250" else "Wheel of fortune · one free spin a day", color = Color.White.copy(alpha = 0.92f), fontSize = 13.sp) }
            Icon(Icons.Rounded.ChevronRight, null, tint = Color.White)
        }
        Spacer(Modifier.height(14.dp))
        Card {
            SettingsRow("Saved messages", "Notes to self, synced nowhere", Icons.Rounded.Bookmark, Color(0xFF2F8CFF), onClick = { nav.push(Route.Chat("saved")) })
            Divider(60.dp)
            SettingsRow("My gifts", "${gifts.count { it.second && it.first.owner == engine.myId }} collectibles", Icons.Rounded.CardGiftcard, Color(0xFFFF4D8D), onClick = { nav.push(Route.Inventory) })
            Divider(60.dp)
            SettingsRow("Gift shop", "Buy gifts with coins", Icons.Rounded.Storefront, Color(0xFFF5A524), onClick = { nav.push(Route.GiftShop(null)) })
        }
        Spacer(Modifier.height(14.dp))
        Card {
            SettingsRow("Reliable notifications", if (isBatteryExempt(LocalContext.current)) "On — messages and calls arrive in the background" else "Action needed: allow background activity", Icons.Rounded.NotificationsActive, if (isBatteryExempt(LocalContext.current)) Color(0xFF12B981) else Color(0xFFFF6B5E), onClick = { nav.push(Route.Reliable) })
            Divider(60.dp)
            SettingsRow("Appearance", "Theme, accent colour, bubbles", Icons.Rounded.Palette, Color(0xFF9B5CFF), onClick = { nav.push(Route.Appearance) })
            Divider(60.dp)
            SettingsRow("Connection", "Status, Bluetooth, Wi-Fi, relay", Icons.Rounded.Hub, Color(0xFF12B981), onClick = { nav.push(Route.Mesh) })
            Divider(60.dp)
            SettingsRow("Privacy & recovery key", "Back up your identity", Icons.Rounded.Key, Color(0xFFFF6B5E), onClick = { nav.push(Route.Privacy) })
        }
        Spacer(Modifier.height(14.dp))
        Card {
            SettingsRow("About Orbit", "Serverless · end-to-end encrypted · open mesh", Icons.Rounded.Info, Color(0xFF64748B))
        }
    }
}

@Composable
fun MyQrScreen() {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p; val ctx = LocalContext.current
    val prof by engine.profile.collectAsState()
    val link = remember(prof) { engine.myLink() }
    Column(Modifier.fillMaxSize()) {
        TopBar("My QR code", { nav.pop() })
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.clip(RoundedCornerShape(28.dp)).background(Brush.linearGradient(listOf(p.accent, p.accent2))).padding(24.dp)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Avatar(prof.name, prof.emoji, prof.color, 64.dp)
                    Spacer(Modifier.height(8.dp))
                    Text(prof.name.ifBlank { "Orbit user" }, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                    Spacer(Modifier.height(14.dp))
                    QrCode(link, 250.dp, Color(0xFF0E1621), Color(0xFF1B2A55), Color(0xFF4B2A8F))
                    Spacer(Modifier.height(10.dp))
                    Text("Scan with Orbit to start a chat", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
                }
            }
            Spacer(Modifier.height(20.dp))
            Text(link, Modifier.clip(RoundedCornerShape(12.dp)).background(p.surface).padding(12.dp), fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = p.textDim, maxLines = 4)
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                TonalButton("Copy link", { copyText(ctx, "Orbit link", link) }, icon = Icons.Rounded.ContentCopy)
                GradientButton("Share", { ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "Add me on Orbit (serverless messenger): $link"), "Share")) }, icon = Icons.Rounded.Share)
            }
        }
    }
}

@Composable
fun EditProfileScreen() {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p
    val cur by engine.profile.collectAsState()
    var name by remember { mutableStateOf(cur.name) }; var bio by remember { mutableStateOf(cur.bio) }; var user by remember { mutableStateOf(cur.username) }
    var emoji by remember { mutableStateOf(cur.emoji) }; var color by remember { mutableIntStateOf(cur.color) }
    Column(Modifier.fillMaxSize()) {
        TopBar("Edit profile", { nav.pop() }, actions = {
            TextButton(onClick = { engine.updateProfile(Profile(name.trim(), bio.trim(), emoji, color, user.trim().trimStart('@').lowercase().filter { it.isLetterOrDigit() || it == '_' }.take(24))); nav.pop() }, enabled = name.isNotBlank()) { Text("Save", color = p.accent, fontWeight = FontWeight.Bold) }
        })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            AvatarPicker(name, emoji, color, { emoji = it }, { color = it })
            Spacer(Modifier.height(18.dp))
            OutlinedTextField(name, { name = it.take(40) }, Modifier.fillMaxWidth(), label = { Text("Name") }, singleLine = true, shape = RoundedCornerShape(14.dp))
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(user, { user = it.take(24) }, Modifier.fillMaxWidth(), label = { Text("Public username (optional)") }, prefix = { Text("@") }, singleLine = true, shape = RoundedCornerShape(14.dp), supportingText = { Text("Gossiped through the mesh so people can find you. No registry: first come, first served — pick something distinctive.") })
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(bio, { bio = it.take(140) }, Modifier.fillMaxWidth(), label = { Text("Bio") }, minLines = 2, shape = RoundedCornerShape(14.dp))
        }
    }
}

@Composable
fun AvatarPicker(name: String, emoji: String, color: Int, onEmoji: (String) -> Unit, onColor: (Int) -> Unit) {
    val p = OrbitTheme.p
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Avatar(name, emoji, color, 92.dp)
        Spacer(Modifier.height(12.dp))
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AvatarEmojis.forEach { e -> Box(Modifier.size(42.dp).clip(CircleShape).background(if (e == emoji) p.accent.copy(alpha = 0.25f) else p.surfaceHigh).clickable { onEmoji(e) }, contentAlignment = Alignment.Center) { Text(e, fontSize = 22.sp) } }
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            AvatarGradients.forEachIndexed { i, (a, b) -> Box(Modifier.size(30.dp).clip(CircleShape).background(Brush.linearGradient(listOf(a, b))).then(if (i == color % 8) Modifier.border(3.dp, p.text, CircleShape) else Modifier).clickable { onColor(i) }) }
        }
    }
}

@Composable
fun AppearanceScreen() {
    val nav = LocalNav.current; val prefs = LocalPrefs.current; val p = OrbitTheme.p
    Column(Modifier.fillMaxSize()) {
        TopBar("Appearance", { nav.pop() })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            // live preview
            Column(Modifier.padding(12.dp).clip(RoundedCornerShape(20.dp)).background(Brush.verticalGradient(listOf(p.chatBgA, p.chatBgB))).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(Modifier.align(Alignment.Start).clip(RoundedCornerShape(prefs.bubbleRadius.dp)).background(p.bubbleIn).padding(horizontal = 12.dp, vertical = 8.dp)) { Text("Works with no internet at all 📡", fontSize = (16 * prefs.textScale).sp) }
                Box(Modifier.align(Alignment.End).clip(RoundedCornerShape(prefs.bubbleRadius.dp)).background(p.outBrush).padding(horizontal = 12.dp, vertical = 8.dp)) { Text("Messages hop phone to phone ✨", color = p.onOut, fontSize = (16 * prefs.textScale).sp) }
            }
            SectionLabel("Theme")
            Row(Modifier.padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ThemeMode.values().forEach { m -> val sel = prefs.themeMode == m
                    Box(Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(12.dp)).background(if (sel) p.accent else p.surface).clickable { prefs.themeMode = m; prefs.save() }, contentAlignment = Alignment.Center) { Text(m.name.lowercase().replaceFirstChar { it.uppercase() }, color = if (sel) Color.White else p.text, fontWeight = FontWeight.Medium, fontSize = 13.sp) } }
            }
            SectionLabel("Accent")
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Accents.forEachIndexed { i, a -> Box(Modifier.size(46.dp).clip(CircleShape).background(Brush.linearGradient(listOf(a.a, a.b))).then(if (prefs.accent == i) Modifier.border(3.dp, p.text, CircleShape) else Modifier).clickable { prefs.accent = i; prefs.save() }, contentAlignment = Alignment.Center) { if (prefs.accent == i) Icon(Icons.Rounded.Check, null, tint = Color.White) } }
            }
            SectionLabel("Bubble corners · ${prefs.bubbleRadius}dp")
            Slider(prefs.bubbleRadius.toFloat(), { prefs.bubbleRadius = it.toInt() }, valueRange = 4f..26f, onValueChangeFinished = { prefs.save() }, modifier = Modifier.padding(horizontal = 20.dp), colors = SliderDefaults.colors(thumbColor = p.accent, activeTrackColor = p.accent))
            SectionLabel("Text size · ${(prefs.textScale * 100).toInt()}%")
            Slider(prefs.textScale, { prefs.textScale = (it * 20).toInt() / 20f }, valueRange = 0.85f..1.4f, onValueChangeFinished = { prefs.save() }, modifier = Modifier.padding(horizontal = 20.dp), colors = SliderDefaults.colors(thumbColor = p.accent, activeTrackColor = p.accent))
        }
    }
}

@Composable
fun PrivacyScreen() {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p; val ctx = LocalContext.current
    val contacts by engine.contacts.collectAsState()
    var reveal by remember { mutableStateOf(false) }
    val key = remember { engine.recoveryKey() }
    Column(Modifier.fillMaxSize()) {
        TopBar("Privacy & recovery", { nav.pop() })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            SectionLabel("Recovery key")
            Column(Modifier.padding(horizontal = 12.dp).clip(RoundedCornerShape(18.dp)).background(p.surface).padding(16.dp)) {
                Text("This key IS your account — there is no server to reset a password. Anyone with it can become you. Store it offline.", color = p.textDim, style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(12.dp))
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(p.surfaceHigh).clickable { reveal = !reveal }.padding(14.dp)) {
                    Text(if (reveal) key else "•••• •••• •••• •••• •••• •••• •••• ••••", fontFamily = FontFamily.Monospace, fontSize = 14.sp, lineHeight = 22.sp)
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    TonalButton(if (reveal) "Hide" else "Reveal", { reveal = !reveal }, icon = if (reveal) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility)
                    if (reveal) TonalButton("Copy", { copyText(ctx, "Orbit key", key) }, icon = Icons.Rounded.ContentCopy)
                }
            }
            SectionLabel("What is protected")
            Column(Modifier.padding(horizontal = 12.dp).clip(RoundedCornerShape(18.dp)).background(p.surface).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("Every message is end-to-end encrypted (X25519 + ChaCha20-Poly1305) and signed (Ed25519).", "Phones that relay your message see only an opaque blob and a routing tag, never sender, text or media.", "Your private key is wrapped by the Android Keystore on this device.", "No phone number, no email, no account, no server that can be subpoenaed or switched off.").forEach { Text("• $it", color = p.textDim, style = MaterialTheme.typography.bodyMedium) }
            }
            val blocked = contacts.values.filter { it.blocked }
            SectionLabel("Blocked (${blocked.size})")
            Card {
                if (blocked.isEmpty()) Text("Nobody blocked", Modifier.padding(16.dp), color = p.textDim)
                blocked.forEach { c -> Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(c.displayName, c.emoji, c.color, 36.dp); Spacer(Modifier.width(10.dp)); Text(c.displayName, Modifier.weight(1f)); TextButton({ engine.setBlocked(c.id, false) }) { Text("Unblock") } } }
            }
        }
    }
}

// ============================================================ ONBOARDING
@Composable
fun Onboarding(onDone: () -> Unit) {
    val engine = LocalEngine.current; val p = OrbitTheme.p
    var step by remember { mutableIntStateOf(0) }
    var name by remember { mutableStateOf("") }; var emoji by remember { mutableStateOf("🚀") }; var color by remember { mutableIntStateOf((0..7).random()) }
    var restore by remember { mutableStateOf(false) }; var rk by remember { mutableStateOf("") }; var err by remember { mutableStateOf(false) }
    var created by remember { mutableStateOf(false) }
    var useRelay by remember { mutableStateOf(true) }
    val hasId by engine.hasIdentity.collectAsState()
    LaunchedEffect(hasId) { if (hasId && created) step = 2 }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(p.bg, p.surface)))) {
        AnimatedContent(step, transitionSpec = { (slideInHorizontally { it / 3 } + fadeIn()) togetherWith (slideOutHorizontally { -it / 3 } + fadeOut()) }, label = "ob") { s ->
            Column(Modifier.fillMaxSize().systemBarsPadding().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                when (s) {
                    0 -> {
                        Spacer(Modifier.weight(1f))
                        OrbitHero()
                        Spacer(Modifier.height(28.dp))
                        Text("Orbit", fontSize = 40.sp, fontWeight = FontWeight.ExtraBold)
                        Text("Messaging with no servers", style = MaterialTheme.typography.titleMedium, color = p.accent)
                        Spacer(Modifier.height(22.dp))
                        listOf("🔐" to "End-to-end encrypted, signed identity", "📡" to "Works over Bluetooth & Wi-Fi with no internet", "🌍" to "Finds friends worldwide, peer-to-peer", "🎁" to "Channels, live rooms and 3D collectible gifts").forEach { (e, t) ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) { Text(e, fontSize = 24.sp); Spacer(Modifier.width(14.dp)); Text(t, color = p.text, style = MaterialTheme.typography.bodyLarge) }
                        }
                        Spacer(Modifier.weight(1f))
                        GradientButton("Get started", { step = 1 }, Modifier.fillMaxWidth())
                    }
                    1 -> {
                        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
                            Spacer(Modifier.height(16.dp))
                            Text(if (restore) "Restore account" else "Create your identity", style = MaterialTheme.typography.titleLarge)
                            Text(if (restore) "Enter the recovery key you saved" else "Stored only on this device — no phone number needed", color = p.textDim, textAlign = TextAlign.Center)
                            Spacer(Modifier.height(22.dp))
                            if (!restore) {
                                AvatarPicker(name, emoji, color, { emoji = it }, { color = it })
                                Spacer(Modifier.height(20.dp))
                                OutlinedTextField(name, { name = it.take(40) }, Modifier.fillMaxWidth(), label = { Text("Your name") }, singleLine = true, shape = RoundedCornerShape(16.dp))
                            } else {
                                OutlinedTextField(rk, { rk = it; err = false }, Modifier.fillMaxWidth(), label = { Text("Recovery key") }, isError = err, minLines = 2, shape = RoundedCornerShape(16.dp), supportingText = { if (err) Text("That key is not valid") })
                                Spacer(Modifier.height(12.dp))
                                OutlinedTextField(name, { name = it.take(40) }, Modifier.fillMaxWidth(), label = { Text("Your name") }, singleLine = true, shape = RoundedCornerShape(16.dp))
                            }
                        }
                        Row(Modifier.fillMaxWidth().clickable { useRelay = !useRelay }.padding(vertical = 8.dp), verticalAlignment = Alignment.Top) {
                            Checkbox(useRelay, { useRelay = it })
                            Column { Text("Use cloud relay as a fallback", fontWeight = FontWeight.SemiBold); Text("So messages arrive even when phones can't connect directly. Only encrypted data passes through a public ntfy server (it sees your IP and timing, never content). You can turn it off any time.", fontSize = 12.sp, color = p.textDim) }
                        }
                        GradientButton(if (restore) "Restore" else "Create", {
                            engine.db.setKv("t.relay", if (useRelay) "1" else "0")
                            val ok = engine.createIdentity(Profile(name.trim(), "", emoji, color, ""), if (restore) rk else null)
                            if (!ok) err = true else created = true
                        }, Modifier.fillMaxWidth(), enabled = name.isNotBlank() && (!restore || rk.length > 20))
                        TextButton({ restore = !restore; err = false }) { Text(if (restore) "Create a new identity instead" else "I already have a recovery key", color = p.accent) }
                    }
                    else -> {
                        val key = remember { engine.recoveryKey() }
                        val ctx = LocalContext.current
                        Spacer(Modifier.weight(1f))
                        Text("🔑", fontSize = 56.sp)
                        Spacer(Modifier.height(10.dp))
                        Text("Save your recovery key", style = MaterialTheme.typography.titleLarge)
                        Text("It is the only way to restore your account on a new phone. We cannot recover it for you — there is no server.", color = p.textDim, textAlign = TextAlign.Center, modifier = Modifier.padding(vertical = 10.dp))
                        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.surfaceHigh).padding(16.dp)) { Text(key, fontFamily = FontFamily.Monospace, fontSize = 15.sp, lineHeight = 24.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
                        Spacer(Modifier.height(12.dp))
                        TonalButton("Copy key", { copyText(ctx, "Orbit key", key) }, icon = Icons.Rounded.ContentCopy)
                        Spacer(Modifier.weight(1f))
                        GradientButton("I saved it — continue", { onDone() }, Modifier.fillMaxWidth())
                        Text("You can view it any time in Me → Privacy", color = p.textDim, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
                        LaunchedEffect(Unit) { }
                    }
                }
            }
        }
    }
}

@Composable
private fun OrbitHero() {
    val p = OrbitTheme.p
    val inf = rememberInfiniteTransition(label = "hero")
    val a by inf.animateFloat(0f, 360f, infiniteRepeatable(tween(9000, easing = LinearEasing)), label = "a")
    val b by inf.animateFloat(360f, 0f, infiniteRepeatable(tween(14000, easing = LinearEasing)), label = "b")
    Box(Modifier.size(170.dp), contentAlignment = Alignment.Center) {
        androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
            val c = center; val r1 = size.width * 0.32f; val r2 = size.width * 0.47f
            drawCircle(p.accent.copy(alpha = 0.25f), r1, c, style = androidx.compose.ui.graphics.drawscope.Stroke(2.5f))
            drawCircle(p.accent2.copy(alpha = 0.2f), r2, c, style = androidx.compose.ui.graphics.drawscope.Stroke(2.5f))
            fun dot(rad: Float, deg: Float, r: Float, col: Color) { val t = Math.toRadians(deg.toDouble()); val o = Offset(c.x + (kotlin.math.cos(t) * rad).toFloat(), c.y + (kotlin.math.sin(t) * rad).toFloat()); drawCircle(col.copy(alpha = 0.3f), r * 2.2f, o); drawCircle(col, r, o) }
            dot(r1, a, 9f, p.accent); dot(r2, b, 7f, p.accent2); dot(r2, b + 180, 5f, p.success)
        }
        Box(Modifier.size(70.dp).clip(CircleShape).background(p.accentBrush), contentAlignment = Alignment.Center) { Box(Modifier.size(26.dp).clip(CircleShape).background(Color.White)) }
    }
}
