@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package app.orbit.ui.screens

import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.orbit.core.*
import app.orbit.data.*
import app.orbit.ui.*
import app.orbit.ui.components.*
import app.orbit.ui.theme.OrbitTheme
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.launch

@Composable
fun AddContactScreen() {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p; val ctx = LocalContext.current; val scope = rememberCoroutineScope()
    val peers by engine.mesh.peers.collectAsState(); val contacts by engine.contacts.collectAsState(); val dir by engine.directory.collectAsState()
    var link by remember { mutableStateOf("") }; var error by remember { mutableStateOf<String?>(null) }
    val clip = remember { try { (ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).primaryClip?.getItemAt(0)?.text?.toString()?.takeIf { it.contains("orbit://") } } catch (e: Exception) { null } }
    var q by remember { mutableStateOf("") }

    fun open(text: String) { scope.launch { val id = engine.openLink(text); if (id == null) error = "That doesn't look like an Orbit link" else { nav.pop(); nav.push(Route.Chat(id)) } } }

    Column(Modifier.fillMaxSize()) {
        TopBar("Add contact", { nav.pop() })
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            if (clip != null) item {
                Row(Modifier.padding(12.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.accent.copy(alpha = 0.14f)).clickable { open(clip) }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.ContentPaste, null, tint = p.accent); Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) { Text("Orbit link in your clipboard", fontWeight = FontWeight.SemiBold, color = p.accent); Text(clip.take(60) + "…", fontSize = 12.sp, color = p.textDim, maxLines = 1) }
                    Text("Add", color = p.accent, fontWeight = FontWeight.Bold)
                }
            }
            item {
                Card(Modifier.padding(top = 4.dp)) {
                    Column(Modifier.padding(14.dp)) {
                        Text("Paste a link", fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(link, { link = it; error = null }, Modifier.fillMaxWidth(), placeholder = { Text("orbit://u/…") }, singleLine = true, shape = RoundedCornerShape(14.dp), isError = error != null, supportingText = { error?.let { Text(it) } },
                            trailingIcon = { if (link.isNotBlank()) IconButton({ open(link) }) { Icon(Icons.Rounded.ArrowForward, null, tint = p.accent) } })
                    }
                    Divider()
                    SettingsRow("Scan QR code", "Point the camera at a friend's code", Icons.Rounded.QrCodeScanner, onClick = {
                        GmsBarcodeScanning.getClient(ctx).startScan().addOnSuccessListener { b -> b.rawValue?.let { open(it) } }.addOnFailureListener { error = "Scanner unavailable on this device — paste the link instead" }
                    })
                    Divider(60.dp)
                    SettingsRow("My QR code & link", "Show yours", Icons.Rounded.QrCode2, tint = Color(0xFF9B5CFF), onClick = { nav.push(Route.MyQr) })
                }
            }
            val nearby = peers.filter { !contacts.containsKey(it.peerId) }
            item { SectionLabel("People nearby (${nearby.size})") }
            if (nearby.isEmpty()) item { Text("Phones running Orbit within Bluetooth / Wi-Fi range show up here.", Modifier.padding(horizontal = 20.dp), color = p.textDim, style = MaterialTheme.typography.bodyMedium) }
            items(nearby, key = { it.peerId }) { pi ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(pi.peerId.take(2), "", pi.signPub[0].toInt() and 7, 44.dp, online = true); Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) { Text("Orbit user ${pi.peerId.take(6)}", style = MaterialTheme.typography.titleSmall); Text(pi.media.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = p.textDim) }
                    TonalButton("Add", { open("orbit://u/" + Base32.encode(pi.signPub + pi.boxPub)) }, Modifier.height(38.dp))
                }
            }
            item { SectionLabel("Find by @username") }
            item {
                Row(Modifier.padding(horizontal = 12.dp).fillMaxWidth().height(46.dp).clip(RoundedCornerShape(23.dp)).background(p.surface).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.AlternateEmail, null, tint = p.textDim); Spacer(Modifier.width(8.dp))
                    BasicTextField(q, { q = it }, Modifier.weight(1f), singleLine = true, textStyle = androidx.compose.ui.text.TextStyle(color = p.text, fontSize = 16.sp), cursorBrush = SolidColor(p.accent), decorationBox = { i -> if (q.isEmpty()) Text("username", color = p.textDim); i() })
                }
            }
            val found = if (q.length < 2) emptyList() else dir.filter { it.kind == "user" && it.id != engine.myId && (it.username.contains(q.trimStart('@'), true) || it.name.contains(q, true)) }
            if (q.length >= 2 && found.isEmpty()) item { Text("Not found yet. Usernames spread through the mesh as phones meet; ask your friend to share their link instead.", Modifier.padding(20.dp), color = p.textDim, style = MaterialTheme.typography.bodyMedium) }
            items(found, key = { it.id }) { e ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(e.name, e.emoji, e.color, 44.dp); Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) { Text(e.name, style = MaterialTheme.typography.titleSmall); Text("@${e.username} · key ${e.id.take(6)}", style = MaterialTheme.typography.bodySmall, color = p.textDim) }
                    TonalButton("Add", { engine.addFromDirectory(e)?.let { nav.pop(); nav.push(Route.Chat(it)) } }, Modifier.height(38.dp))
                }
            }
        }
    }
}

@Composable
private fun PickRow(c: Contact, checked: Boolean, online: Boolean, onToggle: () -> Unit) {
    val p = OrbitTheme.p
    Row(Modifier.fillMaxWidth().clickable(onClick = onToggle).padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Avatar(c.displayName, c.emoji, c.color, 44.dp, online = online); Spacer(Modifier.width(12.dp))
        Text(c.displayName, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
        Box(Modifier.size(24.dp).clip(CircleShape).background(if (checked) p.accent else Color.Transparent).border(2.dp, if (checked) p.accent else p.textDim, CircleShape), contentAlignment = Alignment.Center) { if (checked) Icon(Icons.Rounded.Check, null, tint = Color.White, modifier = Modifier.size(16.dp)) }
    }
}

@Composable
fun NewGroupScreen() {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p
    val contacts by engine.contacts.collectAsState(); val online by engine.online.collectAsState()
    var step by remember { mutableIntStateOf(0) }; val sel = remember { mutableStateListOf<String>() }
    var name by remember { mutableStateOf("") }; var emoji by remember { mutableStateOf("👥") }; var color by remember { mutableIntStateOf((0..7).random()) }
    val list = contacts.values.filter { !it.blocked }.sortedBy { it.displayName.lowercase() }
    Column(Modifier.fillMaxSize()) {
        TopBar(if (step == 0) "New group · ${sel.size} selected" else "Group details", { if (step == 1) step = 0 else nav.pop() }, actions = {
            TextButton(onClick = { if (step == 0) step = 1 else { val id = engine.createGroup(name.trim(), emoji, color, sel.toList()); nav.pop(); nav.push(Route.Chat(id)) } }, enabled = if (step == 0) sel.isNotEmpty() else name.isNotBlank()) { Text(if (step == 0) "Next" else "Create", color = p.accent, fontWeight = FontWeight.Bold) }
        })
        if (step == 0) {
            if (list.isEmpty()) EmptyState("👥", "No contacts yet", "Add some contacts first, then bring them together.")
            LazyColumn { items(list, key = { it.id }) { c -> PickRow(c, c.id in sel, c.id in online) { if (c.id in sel) sel.remove(c.id) else sel.add(c.id) } } }
        } else Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            AvatarPicker(name, emoji, color, { emoji = it }, { color = it })
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(name, { name = it.take(48) }, Modifier.fillMaxWidth(), label = { Text("Group name") }, singleLine = true, shape = RoundedCornerShape(14.dp))
            Spacer(Modifier.height(12.dp))
            Text("Messages are encrypted with a group key that you hand to each member individually. Removing someone rotates the key.", color = p.textDim, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center)
        }
    }
}

@Composable
fun AddMembersScreen(groupId: String) {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p
    val contacts by engine.contacts.collectAsState(); val chats by engine.chats.collectAsState(); val online by engine.online.collectAsState()
    val chat = chats.firstOrNull { it.id == groupId } ?: return
    val sel = remember { mutableStateListOf<String>() }
    val list = contacts.values.filter { it.id !in chat.members && !it.blocked }.sortedBy { it.displayName.lowercase() }
    Column(Modifier.fillMaxSize()) {
        TopBar("Add members", { nav.pop() }, actions = { TextButton({ engine.addToGroup(groupId, sel.toList()); nav.pop() }, enabled = sel.isNotEmpty()) { Text("Add", color = p.accent, fontWeight = FontWeight.Bold) } })
        if (list.isEmpty()) EmptyState("✅", "Everyone is in", "All your contacts are already members.")
        LazyColumn { items(list, key = { it.id }) { c -> PickRow(c, c.id in sel, c.id in online) { if (c.id in sel) sel.remove(c.id) else sel.add(c.id) } } }
    }
}

@Composable
fun NewChannelScreen() {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p
    var name by remember { mutableStateOf("") }; var desc by remember { mutableStateOf("") }; var public by remember { mutableStateOf(true) }
    var emoji by remember { mutableStateOf("📣") }; var color by remember { mutableIntStateOf((0..7).random()) }
    Column(Modifier.fillMaxSize()) {
        TopBar("New channel", { nav.pop() }, actions = { TextButton({ val id = engine.createChannel(name.trim(), desc.trim(), emoji, color, public); nav.pop(); nav.push(Route.Chat(id)) }, enabled = name.isNotBlank()) { Text("Create", color = p.accent, fontWeight = FontWeight.Bold) } })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            AvatarPicker(name, emoji, color, { emoji = it }, { color = it })
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(name, { name = it.take(48) }, Modifier.fillMaxWidth(), label = { Text("Channel name") }, singleLine = true, shape = RoundedCornerShape(14.dp))
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(desc, { desc = it.take(200) }, Modifier.fillMaxWidth(), label = { Text("Description") }, minLines = 2, shape = RoundedCornerShape(14.dp))
            Spacer(Modifier.height(16.dp))
            Card(Modifier.padding(0.dp)) {
                Row(Modifier.fillMaxWidth().clickable { public = true }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(public, { public = true }); Column(Modifier.weight(1f)) { Text("Public", fontWeight = FontWeight.SemiBold); Text("Listed in Explore as it gossips through the mesh. Posts are signed, not encrypted.", style = MaterialTheme.typography.bodySmall, color = p.textDim) }
                }
                Divider()
                Row(Modifier.fillMaxWidth().clickable { public = false }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(!public, { public = false }); Column(Modifier.weight(1f)) { Text("Private", fontWeight = FontWeight.SemiBold); Text("Posts are encrypted. Only people with your invite link (which contains the key) can read.", style = MaterialTheme.typography.bodySmall, color = p.textDim) }
                }
            }
        }
    }
}

// ============================================================ INFO
@Composable
fun InfoScreen(id: String) {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p; val ctx = LocalContext.current
    val chats by engine.chats.collectAsState(); val contacts by engine.contacts.collectAsState(); val online by engine.online.collectAsState()
    val chat = chats.firstOrNull { it.id == id } ?: return
    val contact = contacts[id]
    var rename by remember { mutableStateOf(false) }; var newName by remember { mutableStateOf(chat.title) }
    var confirmLeave by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        TopBar(when (chat.type) { ChatType.DIRECT -> "Contact"; ChatType.GROUP -> "Group"; else -> "Channel" }, { nav.pop() })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            val wt by engine.wornTick.collectAsState(); val cw = remember(wt, id) { engine.contactWorn(id) }
            Box(Modifier.fillMaxWidth()) {
            cw?.let { w -> Box(Modifier.align(Alignment.TopEnd).padding(12.dp).size(124.dp).clip(RoundedCornerShape(24.dp)).clickable { }) { app.orbit.gifts.Gift3D(w, modelScale = 1.05f) } }
            Column(Modifier.fillMaxWidth().padding(vertical = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Avatar(chat.title, chat.emoji, chat.color, 96.dp, online = id in online)
                Spacer(Modifier.height(10.dp))
                Text(chat.title, style = MaterialTheme.typography.titleLarge)
                Text(when (chat.type) { ChatType.DIRECT -> fmtLastSeen(contact?.lastSeen ?: 0, id in online); ChatType.GROUP -> "${chat.members.size} members"; else -> if (chat.isOwner) "You own this channel" else "Subscribed" }, color = if (id in online) p.success else p.textDim)
                val about = if (chat.type == ChatType.DIRECT) contact?.bio.orEmpty() else chat.description
                if (about.isNotBlank()) Text(about, Modifier.padding(horizontal = 32.dp, vertical = 6.dp), textAlign = TextAlign.Center, color = p.textDim)
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    TonalButton("Message", { nav.pop() }, icon = Icons.Rounded.ChatBubble)
                    if (chat.type == ChatType.DIRECT) TonalButton("Gift", { nav.pop(); nav.push(Route.GiftShop(id)) }, icon = Icons.Rounded.CardGiftcard)
                    TonalButton(if (chat.muted) "Unmute" else "Mute", { engine.setMuted(id, !chat.muted) }, icon = if (chat.muted) Icons.Rounded.NotificationsActive else Icons.Rounded.NotificationsOff)
                }
            }
            }
            if (chat.type == ChatType.DIRECT && contact != null) {
                Card {
                    if (contact.username.isNotBlank()) { SettingsRow("@${contact.username}", "Username", Icons.Rounded.AlternateEmail); Divider(60.dp) }
                    SettingsRow("Safety number", safetyNumber(engine.myId, contact.id), Icons.Rounded.VerifiedUser, Color(0xFF12B981))
                    Divider(60.dp)
                    SettingsRow("Rename", "Only visible to you", Icons.Rounded.Edit, onClick = { rename = true })
                }
                Text("Compare the safety number with your contact in person or over another channel. If it matches on both phones, nobody is in the middle.", Modifier.padding(20.dp, 8.dp), style = MaterialTheme.typography.bodySmall, color = p.textDim)
                Card {
                    SettingsRow(if (contact.blocked) "Unblock" else "Block", null, Icons.Rounded.Block, p.danger, onClick = { engine.setBlocked(id, !contact.blocked) })
                    Divider(60.dp)
                    SettingsRow("Delete contact & chat", null, Icons.Rounded.Delete, p.danger, onClick = { engine.deleteContact(id); nav.popTo(Route.Main) })
                }
            }
            if (chat.type == ChatType.GROUP) {
                val admin = chat.admins.contains(engine.myId)
                SectionLabel("Members")
                Card {
                    if (admin) { SettingsRow("Add members", null, Icons.Rounded.PersonAdd, onClick = { nav.push(Route.AddMembers(id)) }); Divider(60.dp) }
                    chat.members.forEach { mid ->
                        val c = contacts[mid]; val name = if (mid == engine.myId) "You" else c?.displayName ?: "User ${mid.take(6)}"
                        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(name, c?.emoji ?: engine.profile.value.emoji.takeIf { mid == engine.myId } ?: "", c?.color ?: engine.profile.value.color, 40.dp, online = mid in online)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) { Text(name, style = MaterialTheme.typography.titleSmall); if (chat.admins.contains(mid)) Text("admin", color = p.accent, fontSize = 12.sp) }
                            if (admin && mid != engine.myId) IconButton({ engine.removeFromGroup(id, mid) }) { Icon(Icons.Rounded.PersonRemove, null, tint = p.danger) }
                        }
                    }
                }
                Spacer(Modifier.height(14.dp))
                Card { SettingsRow("Leave group", null, Icons.Rounded.ExitToApp, p.danger, onClick = { confirmLeave = true }) }
            }
            if (chat.type == ChatType.CHANNEL) {
                val link = remember(chat) { engine.channelLink(chat) }
                SectionLabel("Invite")
                Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp).clip(RoundedCornerShape(18.dp)).background(p.surface).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    QrCode(link, 200.dp, Color(0xFF0E1621), Color(0xFF1B2A55), Color(0xFF4B2A8F))
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        TonalButton("Copy link", { copyText(ctx, "channel", link) }, icon = Icons.Rounded.ContentCopy)
                        GradientButton("Share", { ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "Join my channel on Orbit: $link"), "Share")) }, icon = Icons.Rounded.Share)
                    }
                    if (!chat.meta.optBoolean("public")) Text("🔒 Private: the link contains the decryption key. Treat it like a password.", Modifier.padding(top = 10.dp), fontSize = 12.sp, color = p.textDim, textAlign = TextAlign.Center)
                }
                Spacer(Modifier.height(14.dp))
                Card {
                    if (chat.isOwner && chat.meta.optBoolean("public")) { SettingsRow("Announce to the mesh now", "Make it discoverable in Explore", Icons.Rounded.Campaign, onClick = { engine.announceNow() }); Divider(60.dp) }
                    SettingsRow(if (chat.isOwner) "Delete channel" else "Unsubscribe", null, Icons.Rounded.Delete, p.danger, onClick = { engine.deleteChat(id); nav.popTo(Route.Main) })
                }
            }
        }
    }
    if (rename) AlertDialog({ rename = false }, containerColor = p.surfaceHigh, title = { Text("Rename contact") }, text = { OutlinedTextField(newName, { newName = it }, singleLine = true) },
        confirmButton = { TextButton({ engine.renameContact(id, newName.trim()); rename = false }) { Text("Save") } }, dismissButton = { TextButton({ rename = false }) { Text("Cancel") } })
    if (confirmLeave) AlertDialog({ confirmLeave = false }, containerColor = p.surfaceHigh, title = { Text("Leave group?") }, text = { Text("You will stop receiving messages. Members are notified.") },
        confirmButton = { TextButton({ engine.leaveGroup(id); nav.popTo(Route.Main) }) { Text("Leave", color = p.danger) } }, dismissButton = { TextButton({ confirmLeave = false }) { Text("Cancel") } })
}

/** 30-digit number both parties compute identically from the two public keys. */
fun safetyNumber(a: String, b: String): String {
    val h = sha256("orbit.safety".utf8(), listOf(a, b).sorted().joinToString("").utf8())
    val digits = h.take(15).joinToString("") { "%02d".format((it.toInt() and 0xff) % 100) }
    return digits.chunked(5).joinToString(" ")
}

// ============================================================ SEARCH
@Composable
fun SearchScreen() {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p
    var q by remember { mutableStateOf("") }
    val chats by engine.chats.collectAsState()
    val results = remember(q) { engine.search(q) }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().background(p.surface).statusBarsPadding().height(56.dp).padding(end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton({ nav.pop() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, null, tint = p.text) }
            BasicTextField(q, { q = it }, Modifier.weight(1f), singleLine = true, textStyle = androidx.compose.ui.text.TextStyle(color = p.text, fontSize = 17.sp), cursorBrush = SolidColor(p.accent), decorationBox = { i -> if (q.isEmpty()) Text("Search all messages", color = p.textDim, fontSize = 17.sp); i() })
        }
        if (q.length >= 2 && results.isEmpty()) EmptyState("🔍", "No results", "Nothing matches “$q”.")
        if (q.length < 2) EmptyState("🔎", "Search messages", "Everything is searched locally on this phone.")
        LazyColumn {
            items(results, key = { it.id }) { m ->
                val c = chats.firstOrNull { it.id == m.chatId }
                Row(Modifier.fillMaxWidth().clickable { nav.pop(); nav.push(Route.Chat(m.chatId)) }.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(c?.title ?: "?", c?.emoji ?: "", c?.color ?: 0, 44.dp); Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) { Row { Text(c?.title ?: "Chat", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f)); Text(fmtListTime(m.ts), color = p.textDim, fontSize = 12.sp) }; Text(m.text, maxLines = 2, color = p.textDim, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis) }
                }
            }
        }
    }
}
