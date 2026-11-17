@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
package app.orbit.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.orbit.data.*
import app.orbit.ui.*
import app.orbit.ui.components.*
import app.orbit.ui.theme.OrbitTheme

private data class Tab(val label: String, val icon: ImageVector, val iconOn: ImageVector)
private val tabs = listOf(
    Tab("Chats", Icons.Rounded.ChatBubbleOutline, Icons.Rounded.ChatBubble), Tab("People", Icons.Rounded.PeopleOutline, Icons.Rounded.People), Tab("Profile", Icons.Rounded.PersonOutline, Icons.Rounded.Person),
)

@Composable
fun MainScreen() {
    val prefs = LocalPrefs.current; val p = OrbitTheme.p
    val engine = LocalEngine.current
    val chats by engine.chats.collectAsState()
    val nav = LocalNav.current
    LaunchedEffect(Unit) { if (engine.canSpin() && !prefs.wheelShown) { prefs.wheelShown = true; nav.push(Route.Wheel) } }
    val unreadTotal = chats.filter { !it.muted && !it.archived }.sumOf { it.unread }
    Column(Modifier.fillMaxSize().background(p.bg)) {
        Box(Modifier.weight(1f)) {
            Crossfade(prefs.tab, label = "tab") { t ->
                when (t) { 0 -> ChatsTab(); 1 -> PeopleTab(); else -> MeTab() }
            }
        }
        Row(Modifier.fillMaxWidth().background(p.surface).navigationBarsPadding().height(64.dp), verticalAlignment = Alignment.CenterVertically) {
            tabs.forEachIndexed { i, t ->
                val sel = prefs.tab == i
                val tint by animateColorAsState(if (sel) p.accent else p.textDim, label = "tint")
                Column(Modifier.weight(1f).fillMaxHeight().clickable(indication = null, interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }) { prefs.tab = i }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Box(Modifier.height(30.dp).width(58.dp).clip(RoundedCornerShape(15.dp)).background(if (sel) p.accent.copy(alpha = 0.16f) else Color.Transparent), contentAlignment = Alignment.Center) {
                        BadgedBox(badge = { if (i == 0 && unreadTotal > 0) Badge(containerColor = p.accent, contentColor = Color.White) { Text(if (unreadTotal > 99) "99+" else "$unreadTotal") } }) {
                            Icon(if (sel) t.iconOn else t.icon, t.label, tint = tint, modifier = Modifier.size(24.dp))
                        }
                    }
                    Text(t.label, fontSize = 11.sp, color = tint, fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Medium)
                }
            }
        }
    }
}

// ============================================================ CHATS
private enum class Filter(val label: String) { ALL("All"), UNREAD("Unread"), GROUPS("Groups"), CHANNELS("Channels"), ARCHIVE("Archive") }

@Composable
fun ChatsTab() {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p; val prefs = LocalPrefs.current
    val chats by engine.chats.collectAsState(); val contacts by engine.contacts.collectAsState(); val online by engine.online.collectAsState(); val typing by engine.typing.collectAsState()
    val linkCount by engine.mesh.linkCount.collectAsState()
    val relayOn by engine.relayOnline.collectAsState(); val lastSpin by engine.lastSpin.collectAsState()
    val spinReady = remember(lastSpin) { engine.canSpin() }
    var filter by remember { mutableStateOf(Filter.ALL) }
    var query by remember { mutableStateOf("") }
    var searching by remember { mutableStateOf(false) }
    var menuFor by remember { mutableStateOf<Chat?>(null) }
    var showNew by remember { mutableStateOf(false) }

    val shown = remember(chats, filter, query) {
        chats.filter { c ->
            (if (filter == Filter.ARCHIVE) c.archived else !c.archived) &&
            when (filter) { Filter.GROUPS -> c.type == ChatType.GROUP; Filter.CHANNELS -> c.type == ChatType.CHANNEL; Filter.UNREAD -> c.unread > 0; else -> true } &&
            (query.isBlank() || c.title.contains(query, true))
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            // header
            Column(Modifier.background(p.surface).statusBarsPadding()) {
                Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    AnimatedContent(searching, label = "hdr", modifier = Modifier.weight(1f)) { s ->
                        if (!s) Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Orbit", style = MaterialTheme.typography.titleLarge)
                            Spacer(Modifier.width(10.dp))
                            MeshChip(linkCount, relayOn) { nav.push(Route.Mesh) }
                        } else {
                            Row(Modifier.fillMaxWidth().height(40.dp).clip(RoundedCornerShape(20.dp)).background(p.surfaceHigh).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Rounded.Search, null, tint = p.textDim, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(8.dp))
                                val focus = remember { androidx.compose.ui.focus.FocusRequester() }
                                BasicTextField(query, { query = it }, Modifier.weight(1f).androidx_focus(focus), singleLine = true, textStyle = androidx.compose.ui.text.TextStyle(color = p.text, fontSize = 16.sp), cursorBrush = SolidColor(p.accent),
                                    decorationBox = { inner -> if (query.isEmpty()) Text("Search chats", color = p.textDim); inner() })
                                LaunchedEffect(Unit) { focus.requestFocus() }
                            }
                        }
                    }
                    IconButton(onClick = { searching = !searching; if (!searching) query = "" }) { Icon(if (searching) Icons.Rounded.Close else Icons.Rounded.Search, "Search", tint = p.text) }
                }
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Filter.values().filter { it != Filter.ARCHIVE || chats.any { c -> c.archived } }.forEach { f ->
                        val sel = filter == f
                        val n = if (f == Filter.UNREAD) chats.count { it.unread > 0 } else 0
                        Box(Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).background(if (sel) p.accent else p.surfaceHigh).clickable { filter = f }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                            Text(f.label + if (n > 0) " $n" else "", color = if (sel) Color.White else p.textDim, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
            if (shown.isEmpty()) {
                if (chats.size <= 1 && filter == Filter.ALL) EmptyState("🛰️", "Your orbit is empty", "Add a friend with a link or QR code, or tap Mesh to see who is nearby. No server, no phone number.") {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { GradientButton("Add contact", { nav.push(Route.AddContact) }, icon = Icons.Rounded.PersonAdd) }
                } else EmptyState("🔍", "Nothing here", "No chats match this filter.")
            }
            LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(bottom = 90.dp)) {
                if (spinReady && !searching) item {
                    Row(Modifier.fillMaxWidth().padding(12.dp).clip(RoundedCornerShape(18.dp)).background(Brush.linearGradient(listOf(Color(0xFFFF8A5B), Color(0xFFFF4D8D)))).pressable({ nav.push(Route.Wheel) }).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("🎡", fontSize = 30.sp); Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) { Text("Free spin is ready!", color = Color.White, fontWeight = FontWeight.Bold); Text("Win 5 – 250 coins for gifts", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp) }
                        Text("Spin", color = Color.White, fontWeight = FontWeight.ExtraBold)
                    }
                }
                if (searching && query.length >= 2) {
                    val hits = engine.search(query)
                    if (hits.isNotEmpty()) item { SectionLabel("Messages") }
                    items(hits, key = { "m" + it.id }) { m ->
                        val c = chats.firstOrNull { it.id == m.chatId }
                        Row(Modifier.fillMaxWidth().clickable { nav.push(Route.Chat(m.chatId)) }.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(c?.title ?: "?", c?.emoji ?: "", c?.color ?: 0, 40.dp); Spacer(Modifier.width(12.dp))
                            Column { Text(c?.title ?: "Chat", fontWeight = FontWeight.SemiBold); Text(m.text, maxLines = 1, overflow = TextOverflow.Ellipsis, color = p.textDim) }
                        }
                    }
                }
                items(shown, key = { it.id }) { c ->
                    Box(Modifier.animateItem()) {
                        ChatRow(c, online, typing, contacts, onClick = { nav.push(Route.Chat(c.id)) }, onLong = { menuFor = c })
                    }
                }
            }
        }
        // FAB
        Box(Modifier.align(Alignment.BottomEnd).padding(18.dp).size(58.dp).clip(RoundedCornerShape(20.dp)).background(p.accentBrush).pressable({ showNew = true }), contentAlignment = Alignment.Center) {
            Icon(Icons.Rounded.Edit, "New", tint = Color.White)
        }
    }

    if (showNew) ModalBottomSheet(onDismissRequest = { showNew = false }, containerColor = p.surface, contentColor = p.text) {
        Column(Modifier.padding(bottom = 24.dp)) {
            SheetItem(Icons.Rounded.PersonAdd, "New contact", "Paste a link, scan a QR, find people nearby") { showNew = false; nav.push(Route.AddContact) }
            SheetItem(Icons.Rounded.Groups, "New group", "Encrypted group with a shared key") { showNew = false; nav.push(Route.NewGroup) }
            SheetItem(Icons.Rounded.Campaign, "New channel", "Broadcast posts to unlimited subscribers") { showNew = false; nav.push(Route.NewChannel) }
            SheetItem(Icons.Rounded.SettingsInputAntenna, "Walkie-talkie", "Push-to-talk to everyone in range") { showNew = false; nav.push(Route.Walkie) }
        }
    }
    menuFor?.let { c ->
        ModalBottomSheet(onDismissRequest = { menuFor = null }, containerColor = p.surface, contentColor = p.text) {
            Column(Modifier.padding(bottom = 24.dp)) {
                Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(c.title, c.emoji, c.color, 44.dp); Spacer(Modifier.width(12.dp)); Text(c.title, style = MaterialTheme.typography.titleMedium) }
                SheetItem(if (c.pinned) Icons.Rounded.PushPin else Icons.Rounded.PushPin, if (c.pinned) "Unpin" else "Pin to top", null) { engine.setPinned(c.id, !c.pinned); menuFor = null }
                SheetItem(if (c.muted) Icons.Rounded.NotificationsActive else Icons.Rounded.NotificationsOff, if (c.muted) "Unmute" else "Mute", null) { engine.setMuted(c.id, !c.muted); menuFor = null }
                SheetItem(if (c.archived) Icons.Rounded.Unarchive else Icons.Rounded.Archive, if (c.archived) "Unarchive" else "Archive", null) { engine.setArchived(c.id, !c.archived); menuFor = null }
                if (c.type != ChatType.SAVED) SheetItem(Icons.Rounded.Delete, "Delete chat", null, danger = true) { engine.deleteChat(c.id); menuFor = null }
            }
        }
    }
}

fun Modifier.androidx_focus(r: androidx.compose.ui.focus.FocusRequester) = this.focusRequester(r)

@Composable
fun SheetItem(icon: ImageVector, title: String, subtitle: String?, danger: Boolean = false, onClick: () -> Unit) {
    val p = OrbitTheme.p
    SettingsRow(title, subtitle, icon, tint = if (danger) p.danger else p.accent, onClick = onClick)
}

@Composable
fun MeshChip(links: Int, relay: Boolean, onClick: () -> Unit) {
    val p = OrbitTheme.p
    val on = links > 0 || relay
    val inf = rememberInfiniteTransition(label = "pulse")
    val a by inf.animateFloat(0.35f, 1f, infiniteRepeatable(tween(1100), RepeatMode.Reverse), label = "a")
    Row(Modifier.height(24.dp).clip(RoundedCornerShape(12.dp)).background((if (on) p.success else p.textDim).copy(alpha = 0.14f)).clickable(onClick = onClick).padding(horizontal = 9.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(7.dp).clip(CircleShape).background((if (on) p.success else p.textDim).copy(alpha = if (on) a else 0.7f)))
        Spacer(Modifier.width(6.dp))
        Text(if (links > 0) "$links nearby" else if (relay) "online" else "connecting…", fontSize = 11.5.sp, color = if (on) p.success else p.textDim, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun ChatRow(c: Chat, online: Set<String>, typing: Map<String, Long>, contacts: Map<String, Contact>, onClick: () -> Unit, onLong: () -> Unit) {
    val p = OrbitTheme.p
    val isOnline = c.type == ChatType.DIRECT && c.id in online
    val isTyping = typing[c.id]?.let { it > System.currentTimeMillis() } == true
    Row(Modifier.fillMaxWidth().combinedClickable(onClick = onClick, onLongClick = onLong).background(if (c.pinned) p.surface.copy(alpha = 0.55f) else Color.Transparent).padding(horizontal = 14.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
        if (c.type == ChatType.SAVED) Box(Modifier.size(56.dp).clip(CircleShape).background(p.accentBrush), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Bookmark, null, tint = Color.White, modifier = Modifier.size(28.dp)) }
        else Avatar(c.title, c.emoji, c.color, 56.dp, online = isOnline)
        Spacer(Modifier.width(13.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (c.type == ChatType.GROUP) Icon(Icons.Rounded.Groups, null, tint = p.textDim, modifier = Modifier.size(16.dp).padding(end = 3.dp))
                if (c.type == ChatType.CHANNEL) Icon(Icons.Rounded.Campaign, null, tint = p.textDim, modifier = Modifier.size(16.dp).padding(end = 3.dp))
                Text(c.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (c.muted) Icon(Icons.Rounded.NotificationsOff, null, tint = p.textDim, modifier = Modifier.padding(start = 5.dp).size(14.dp))
                Spacer(Modifier.weight(1f))
                if (c.lastMine && c.lastStatus >= 0) { Ticks(c.lastStatus, p.textDim, p.accent, 16.dp); Spacer(Modifier.width(3.dp)) }
                Text(fmtListTime(c.lastTs), fontSize = 12.sp, color = if (c.unread > 0 && !c.muted) p.accent else p.textDim)
            }
            Spacer(Modifier.height(2.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                val preview = when {
                    isTyping -> "typing…"
                    c.draft.isNotBlank() -> "Draft: ${c.draft}"
                    c.lastPreview.isBlank() -> if (c.type == ChatType.DIRECT) "Say hi 👋" else ""
                    c.lastMine && c.type != ChatType.CHANNEL && c.type != ChatType.SAVED -> "You: ${c.lastPreview}"
                    else -> c.lastPreview
                }
                Text(preview, style = MaterialTheme.typography.bodyMedium, color = if (isTyping) p.accent else if (c.draft.isNotBlank()) p.danger else p.textDim, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                if (c.pinned && c.unread == 0) Icon(Icons.Rounded.PushPin, null, tint = p.textDim, modifier = Modifier.size(16.dp).rotate(45f))
                UnreadBadge(c.unread, c.muted)
            }
        }
    }
}

// ============================================================ CONTACTS
@Composable
fun PeopleTab() {
    val p = OrbitTheme.p
    var seg by remember { mutableIntStateOf(0) }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().background(p.surface).statusBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Contacts", "Discover").forEachIndexed { i, l -> val sel = seg == i
                Box(Modifier.weight(1f).height(38.dp).clip(RoundedCornerShape(19.dp)).background(if (sel) p.accent else p.surfaceHigh).clickable { seg = i }, contentAlignment = Alignment.Center) { Text(l, color = if (sel) Color.White else p.textDim, fontWeight = FontWeight.SemiBold) } }
        }
        Box(Modifier.weight(1f)) { if (seg == 0) ContactsTab() else ExploreTab() }
    }
}

@Composable
fun ContactsTab() {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p
    val contacts by engine.contacts.collectAsState(); val online by engine.online.collectAsState()
    val list = contacts.values.filter { !it.stranger || true }.sortedWith(compareByDescending<Contact> { it.id in online }.thenBy { it.displayName.lowercase() })
    Column(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            item { SettingsRow("Add contact", "Link, QR code, nearby, username", Icons.Rounded.PersonAdd, onClick = { nav.push(Route.AddContact) }) }
            item { SettingsRow("My QR code & link", "Let a friend scan you", Icons.Rounded.QrCode2, tint = Color(0xFF9B5CFF), onClick = { nav.push(Route.MyQr) }) }
            item { SectionLabel("${list.size} contacts · ${list.count { it.id in online }} online") }
            if (list.isEmpty()) item { Text("No contacts yet.", Modifier.padding(20.dp), color = p.textDim) }
            items(list, key = { it.id }) { c ->
                Row(Modifier.fillMaxWidth().clickable { nav.push(Route.Chat(c.id)) }.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(c.displayName, c.emoji, c.color, 48.dp, online = c.id in online)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(c.displayName, style = MaterialTheme.typography.titleSmall)
                        Text(if (c.stranger) "wants to chat · tap to review" else fmtLastSeen(c.lastSeen, c.id in online), style = MaterialTheme.typography.bodySmall, color = if (c.id in online) p.success else p.textDim)
                    }
                }
            }
        }
    }
}

// ============================================================ EXPLORE
@Composable
fun ExploreTab() {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p
    val dir by engine.directory.collectAsState(); val contacts by engine.contacts.collectAsState(); val chats by engine.chats.collectAsState()
    var q by remember { mutableStateOf("") }
    val results = remember(dir, q, contacts, chats) { dir.filter { e -> e.id != engine.myId && (q.isBlank() || e.name.contains(q, true) || e.username.contains(q.trimStart('@'), true) || e.desc.contains(q, true)) } }
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.background(p.surface).padding(horizontal = 16.dp, vertical = 6.dp)) {
            Row(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(22.dp)).background(p.surfaceHigh).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.Search, null, tint = p.textDim); Spacer(Modifier.width(8.dp))
                BasicTextField(q, { q = it }, Modifier.weight(1f), singleLine = true, textStyle = androidx.compose.ui.text.TextStyle(color = p.text, fontSize = 16.sp), cursorBrush = SolidColor(p.accent),
                    decorationBox = { inner -> if (q.isEmpty()) Text("Search @username, channels, people", color = p.textDim); inner() })
            }
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            item {
                Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ExploreCard("🎁", "Gift shop", "Mint animated 3D collectibles", Brush.linearGradient(listOf(Color(0xFFFF8A5B), Color(0xFFFF4D8D))), Modifier.weight(1f)) { nav.push(Route.GiftShop(null)) }
                    ExploreCard("🧳", "My gifts", "Provenance-signed collection", Brush.linearGradient(listOf(Color(0xFF7C5CFF), Color(0xFF2F8CFF))), Modifier.weight(1f)) { nav.push(Route.Inventory) }
                }
            }
            item { SectionLabel("Discovered over the mesh") }
            item { Text("Public usernames and channels are gossiped phone-to-phone — there is no central directory, so what you see grows as you meet more devices.", Modifier.padding(horizontal = 20.dp, vertical = 2.dp), style = MaterialTheme.typography.bodySmall, color = p.textDim) }
            if (results.isEmpty()) item { Text(if (q.isBlank()) "Nothing discovered yet. Stay connected for a while or meet someone with a public @username." else "No matches. A @username appears here after it propagates through the mesh.", Modifier.padding(20.dp), color = p.textDim) }
            items(results, key = { it.id }) { e ->
                val have = if (e.kind == "chan") chats.any { it.id == e.id } else contacts.containsKey(e.id)
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(e.name, e.emoji, e.color, 48.dp)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(e.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (e.kind == "chan") Icon(Icons.Rounded.Campaign, null, tint = p.textDim, modifier = Modifier.padding(start = 5.dp).size(15.dp))
                        }
                        Text(listOfNotNull(e.username.takeIf { it.isNotBlank() }?.let { "@$it" }, e.desc.takeIf { it.isNotBlank() }).joinToString(" · ").ifBlank { if (e.kind == "chan") "Channel" else "Orbit user" }, style = MaterialTheme.typography.bodySmall, color = p.textDim, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    TonalButton(if (have) "Open" else if (e.kind == "chan") "Join" else "Add", {
                        val id = engine.addFromDirectory(e); if (id != null) nav.push(Route.Chat(id))
                    }, Modifier.height(38.dp))
                }
            }
        }
    }
}

@Composable
private fun ExploreCard(emoji: String, title: String, sub: String, brush: Brush, modifier: Modifier, onClick: () -> Unit) {
    Column(modifier.height(110.dp).clip(RoundedCornerShape(20.dp)).background(brush).pressable(onClick).padding(14.dp), verticalArrangement = Arrangement.SpaceBetween) {
        Text(emoji, fontSize = 30.sp)
        Column { Text(title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp); Text(sub, color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp, lineHeight = 15.sp) }
    }
}
