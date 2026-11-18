@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
package app.orbit.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Reply
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat
import app.orbit.data.*
import app.orbit.gifts.Gift3D
import app.orbit.gifts.GiftCatalog
import app.orbit.gifts.GiftLogic
import app.orbit.ui.*
import app.orbit.ui.components.*
import app.orbit.ui.theme.OrbitTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

private val QuickReactions = listOf("👍", "❤️", "🔥", "😂", "😮", "😢", "🎉")

@Composable
fun ChatScreen(chatId: String) {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p; val ctx = LocalContext.current; val prefs = LocalPrefs.current
    val scope = rememberCoroutineScope(); val haptic = LocalHapticFeedback.current
    val chats by engine.chats.collectAsState(); val contacts by engine.contacts.collectAsState(); val online by engine.online.collectAsState(); val typing by engine.typing.collectAsState()
    val chat = chats.firstOrNull { it.id == chatId }
    val msgs by engine.messages(chatId).collectAsState()
    if (chat == null) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Chat not found", color = p.textDim) }; return }

    var text by remember(chatId) { mutableStateOf(chat.draft) }
    var replyTo by remember { mutableStateOf<Message?>(null) }
    var editing by remember { mutableStateOf<Message?>(null) }
    var menuFor by remember { mutableStateOf<Message?>(null) }
    var showAttach by remember { mutableStateOf(false) }
    var pickContact by remember { mutableStateOf(false) }
    var showMore by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf<Message?>(null) }
    val listState = rememberLazyListState()
    val contact = contacts[chatId]
    val isOnline = chat.type == ChatType.DIRECT && chatId in online
    val canPost = chat.type != ChatType.CHANNEL || chat.isOwner

    DisposableEffect(chatId) { engine.openChat = chatId; engine.markRead(chatId); onDispose { engine.openChat = null; engine.saveDraft(chatId, text) } }
    LaunchedEffect(msgs.size) { if (msgs.isNotEmpty()) engine.markRead(chatId) }
    LaunchedEffect(msgs.lastOrNull()?.id) { if (listState.firstVisibleItemIndex <= 2) listState.animateScrollToItem(0) }

    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch {
            val offline = engine.mesh.linkCount.value == 0
            val bytes = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { Imaging.compress(ctx, uri, if (offline) 640 else 1280, if (offline) 55 else 72) }
            if (bytes != null) engine.send(chatId, MsgKind.IMAGE, text.trim().also { text = "" }, replyTo?.id ?: "", bytes, ".jpg").also { replyTo = null }
        }
    }
    val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    val recorder = remember { VoiceRecorder(ctx) }
    var recording by remember { mutableStateOf(false) }; var recSec by remember { mutableIntStateOf(0) }; var recCancel by remember { mutableStateOf(false) }
    LaunchedEffect(recording) { while (recording) { recSec = (recorder.elapsed / 1000).toInt(); delay(200) } }

    fun doSend() {
        val t = text.trim(); if (t.isEmpty()) return
        val e = editing
        if (e != null) { engine.edit(chatId, e.id, t); editing = null } else engine.send(chatId, MsgKind.TEXT, t, replyTo?.id ?: "")
        text = ""; replyTo = null
    }

    val rev = remember(msgs) { msgs.asReversed() }
    val pinned = remember(msgs) { msgs.lastOrNull { it.pinned && !it.deleted } }

    Column(Modifier.fillMaxSize().background(p.bg).imePadding()) {
        // ---------------- top bar
        Row(Modifier.fillMaxWidth().background(p.surface).statusBarsPadding().height(58.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { nav.pop() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back", tint = p.text) }
            Row(Modifier.weight(1f).clickable { if (chat.type != ChatType.SAVED) nav.push(Route.Info(chatId)) }, verticalAlignment = Alignment.CenterVertically) {
                if (chat.type == ChatType.SAVED) Box(Modifier.size(40.dp).clip(CircleShape).background(p.accentBrush), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Bookmark, null, tint = Color.White) }
                else Avatar(chat.title, chat.emoji, chat.color, 40.dp, online = isOnline)
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(chat.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val typingNow = typing[chatId]?.let { it > System.currentTimeMillis() } == true
                    val sub = when {
                        typingNow -> "typing…"
                        chat.type == ChatType.DIRECT -> fmtLastSeen(contact?.lastSeen ?: 0, isOnline)
                        chat.type == ChatType.GROUP -> "${chat.members.size} members"
                        chat.type == ChatType.CHANNEL -> if (chat.isOwner) "your channel" else "channel"
                        else -> "notes to self"
                    }
                    AnimatedContent(sub, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "sub") { s -> Text(s, style = MaterialTheme.typography.bodySmall, color = if (s == "typing…" || s == "online") p.accent else p.textDim, maxLines = 1) }
                }
            }
            if (chat.type == ChatType.DIRECT) { val startCall = rememberCallStarter(chatId); IconButton(onClick = startCall) { Icon(Icons.Rounded.Call, "Call", tint = p.accent) } }
            if (chat.type == ChatType.DIRECT) IconButton(onClick = { nav.push(Route.GiftShop(chatId)) }) { Icon(Icons.Rounded.CardGiftcard, "Gift", tint = p.accent) }
            if ((chat.type == ChatType.GROUP) || (chat.type == ChatType.CHANNEL && chat.isOwner)) IconButton(onClick = { nav.push(Route.Live("new:$chatId")) }) { Icon(Icons.Rounded.Podcasts, "Live", tint = p.accent) }
            Box {
                IconButton(onClick = { showMore = true }) { Icon(Icons.Rounded.MoreVert, "More", tint = p.text) }
                DropdownMenu(showMore, { showMore = false }, containerColor = p.surfaceHigh) {
                    if (chat.type != ChatType.SAVED) DropdownMenuItem({ Text("Info") }, { showMore = false; nav.push(Route.Info(chatId)) }, leadingIcon = { Icon(Icons.Rounded.Info, null) })
                    DropdownMenuItem({ Text(if (chat.muted) "Unmute" else "Mute") }, { showMore = false; engine.setMuted(chatId, !chat.muted) }, leadingIcon = { Icon(if (chat.muted) Icons.Rounded.NotificationsActive else Icons.Rounded.NotificationsOff, null) })
                    DropdownMenuItem({ Text("Clear history") }, { showMore = false; engine.clearHistory(chatId) }, leadingIcon = { Icon(Icons.Rounded.CleaningServices, null) })
                    if (chat.type != ChatType.SAVED) DropdownMenuItem({ Text("Delete chat", color = p.danger) }, { showMore = false; engine.deleteChat(chatId); nav.pop() }, leadingIcon = { Icon(Icons.Rounded.Delete, null, tint = p.danger) })
                }
            }
        }
        // pinned banner
        AnimatedVisibility(pinned != null) {
            pinned?.let { pm ->
                Row(Modifier.fillMaxWidth().background(p.surface).clickable { val i = rev.indexOfFirst { it.id == pm.id }; if (i >= 0) scope.launch { listState.animateScrollToItem(i) } }.padding(horizontal = 14.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.width(3.dp).height(30.dp).clip(RoundedCornerShape(2.dp)).background(p.accent)); Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) { Text("Pinned message", color = p.accent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold); Text(previewText(pm), maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 13.sp, color = p.textDim) }
                    Icon(Icons.Rounded.PushPin, null, tint = p.textDim, modifier = Modifier.size(18.dp))
                }
            }
        }
        // stranger banner
        if (chat.type == ChatType.DIRECT && contact?.stranger == true) {
            Row(Modifier.fillMaxWidth().background(p.surface).padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Not in your contacts. Messages are still end-to-end encrypted.", Modifier.weight(1f), fontSize = 12.5.sp, color = p.textDim)
                TonalButton("Add", { engine.acceptStranger(chatId) }, Modifier.height(36.dp)); TonalButton("Block", { engine.setBlocked(chatId, true); nav.pop() }, Modifier.height(36.dp), danger = true)
            }
        }
        // ---------------- messages
        Box(Modifier.weight(1f).fillMaxWidth().background(Brush.verticalGradient(listOf(p.chatBgA, p.chatBgB)))) {
            if (msgs.isEmpty()) EmptyState(if (chat.type == ChatType.CHANNEL) "📣" else "👋", if (chat.type == ChatType.CHANNEL) "No posts yet" else "No messages yet", if (chat.type == ChatType.DIRECT) "Messages are sealed on your phone and travel straight to ${chat.title} — or hop through nearby phones if they are offline." else "")
            LazyColumn(Modifier.fillMaxSize(), state = listState, reverseLayout = true, contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)) {
                itemsIndexed(rev, key = { _, m -> m.id }) { i, m ->
                    val older = rev.getOrNull(i + 1); val newer = rev.getOrNull(i - 1)
                    val showDate = older == null || fmtDay(older.ts) != fmtDay(m.ts)
                    val firstOfRun = older == null || older.sender != m.sender || showDate || older.kind == MsgKind.SYSTEM || m.ts - older.ts > 5 * 60_000
                    val lastOfRun = newer == null || newer.sender != m.sender || newer.kind == MsgKind.SYSTEM || newer.ts - m.ts > 5 * 60_000 || fmtDay(newer.ts) != fmtDay(m.ts)
                    Column(Modifier.animateItem()) {
                        if (showDate) DateChip(fmtDay(m.ts))
                        if (m.kind == MsgKind.SYSTEM) SystemChip(m.text)
                        else MessageRow(
                            m, chat, firstOfRun, lastOfRun, engine, contacts, msgs,
                            onReply = { replyTo = m; editing = null },
                            onMenu = { menuFor = m },
                            onJump = { id -> val idx = rev.indexOfFirst { it.id == id }; if (idx >= 0) scope.launch { listState.animateScrollToItem(idx) } },
                        )
                    }
                }
            }
            val showFab by remember { derivedStateOf { listState.firstVisibleItemIndex > 4 } }
            androidx.compose.animation.AnimatedVisibility(showFab, Modifier.align(Alignment.BottomEnd).padding(14.dp), enter = scaleIn() + fadeIn(), exit = scaleOut() + fadeOut()) {
                Box(Modifier.size(44.dp).clip(CircleShape).background(p.surface).pressable({ scope.launch { listState.animateScrollToItem(0) } }), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.KeyboardArrowDown, null, tint = p.text) }
            }
        }
        // offline hint
        val lastMine = msgs.lastOrNull { it.mine }
        AnimatedVisibility(chat.type == ChatType.DIRECT && !isOnline && lastMine?.status == Status.CARRIED) {
            Row(Modifier.fillMaxWidth().background(p.surface).padding(horizontal = 14.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.Sync, null, tint = p.accent, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(8.dp))
                Text("${chat.title} is out of reach. Your message is sealed and will hop through nearby phones until it arrives.", fontSize = 12.sp, color = p.textDim)
            }
        }
        // ---------------- composer
        if (!canPost) {
            Row(Modifier.fillMaxWidth().background(p.surface).navigationBarsPadding().height(54.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton({ engine.setMuted(chatId, !chat.muted) }, Modifier.weight(1f)) { Icon(if (chat.muted) Icons.Rounded.NotificationsActive else Icons.Rounded.NotificationsOff, null, tint = p.accent); Spacer(Modifier.width(8.dp)); Text(if (chat.muted) "Unmute" else "Mute", color = p.accent) }
                TextButton({ ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, engine.channelLink(chat)), "Share channel")) }, Modifier.weight(1f)) { Icon(Icons.Rounded.Share, null, tint = p.accent); Spacer(Modifier.width(8.dp)); Text("Share", color = p.accent) }
            }
        } else Column(Modifier.background(p.surface).navigationBarsPadding()) {
            AnimatedVisibility(replyTo != null || editing != null) {
                val rm = editing ?: replyTo
                if (rm != null) Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(if (editing != null) Icons.Rounded.Edit else Icons.AutoMirrored.Rounded.Reply, null, tint = p.accent); Spacer(Modifier.width(10.dp))
                    Box(Modifier.width(3.dp).height(32.dp).clip(RoundedCornerShape(2.dp)).background(p.accent)); Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f)) { Text(if (editing != null) "Edit message" else "Reply to ${engine.contactName(rm.sender)}", color = p.accent, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold); Text(previewText(rm), maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 13.sp, color = p.textDim) }
                    IconButton(onClick = { replyTo = null; if (editing != null) { editing = null; text = "" } }) { Icon(Icons.Rounded.Close, null, tint = p.textDim) }
                }
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 6.dp), verticalAlignment = Alignment.Bottom) {
                if (!recording) IconButton(onClick = { showAttach = true }) { Icon(Icons.Rounded.AttachFile, "Attach", tint = p.textDim) }
                Box(Modifier.weight(1f).heightIn(min = 44.dp).clip(RoundedCornerShape(22.dp)).background(p.surfaceHigh).padding(horizontal = 16.dp, vertical = 11.dp), contentAlignment = Alignment.CenterStart) {
                    if (recording) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            val inf = rememberInfiniteTransition(label = "rec"); val a by inf.animateFloat(0.3f, 1f, infiniteRepeatable(tween(600), RepeatMode.Reverse), label = "a")
                            Box(Modifier.size(10.dp).clip(CircleShape).background(p.danger.copy(alpha = a))); Spacer(Modifier.width(10.dp))
                            Text("%d:%02d".format(recSec / 60, recSec % 60), fontWeight = FontWeight.SemiBold); Spacer(Modifier.weight(1f))
                            Text(if (recCancel) "Release to cancel" else "◀ Slide to cancel", color = if (recCancel) p.danger else p.textDim, fontSize = 13.sp)
                        }
                    } else {
                        BasicTextField(text, { text = it; engine.typing(chatId) }, Modifier.fillMaxWidth(), textStyle = TextStyle(color = p.text, fontSize = (16 * prefs.textScale).sp), cursorBrush = SolidColor(p.accent), maxLines = 6,
                            decorationBox = { inner -> if (text.isEmpty()) Text(if (chat.type == ChatType.CHANNEL) "Broadcast…" else "Message", color = p.textDim, fontSize = (16 * prefs.textScale).sp); inner() })
                    }
                }
                Spacer(Modifier.width(6.dp))
                val hasText = text.isNotBlank()
                Box(Modifier.size(46.dp).clip(CircleShape).background(if (recording) p.danger else p.accent)
                    .pointerInput(hasText, chatId) {
                        if (hasText) detectTapGestures(onTap = { doSend() })
                        else awaitEachGesture {
                            val down = awaitFirstDown()
                            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { micPermission.launch(Manifest.permission.RECORD_AUDIO); return@awaitEachGesture }
                            if (!recorder.start()) return@awaitEachGesture
                            recording = true; recCancel = false; haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            while (true) {
                                val ev = awaitPointerEvent(); val ch = ev.changes.first()
                                recCancel = ch.position.x - down.position.x < -140f
                                if (!ch.pressed) break
                            }
                            recording = false
                            val r = recorder.stop(!recCancel)
                            if (r != null) engine.send(chatId, MsgKind.VOICE, "", replyTo?.id ?: "", r.first, ".m4a", r.second).also { replyTo = null }
                        }
                    }, contentAlignment = Alignment.Center) {
                    AnimatedContent(if (hasText) 1 else 0, transitionSpec = { scaleIn() + fadeIn() togetherWith scaleOut() + fadeOut() }, label = "sendmic") { s ->
                        Icon(if (s == 1) (if (editing != null) Icons.Rounded.Check else Icons.AutoMirrored.Rounded.Send) else Icons.Rounded.Mic, null, tint = Color.White)
                    }
                }
            }
        }
    }

    if (showAttach) ModalBottomSheet({ showAttach = false }, containerColor = p.surface, contentColor = p.text) {
        Column(Modifier.padding(bottom = 24.dp)) {
            SheetItem(Icons.Rounded.Image, "Photo", "Compressed automatically for mesh delivery") { showAttach = false; photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
            SheetItem(Icons.Rounded.Person, "Contact", "Send a contact card (or your own)") { showAttach = false; pickContact = true }
            if (chat.type == ChatType.DIRECT) SheetItem(Icons.Rounded.CardGiftcard, "Gift", "Animated 3D collectible") { showAttach = false; nav.push(Route.GiftShop(chatId)) }
            if (chat.type == ChatType.DIRECT || chat.type == ChatType.GROUP) SheetItem(Icons.Rounded.FormatBold, "Formatting help", "**bold**  __italic__  `code`  ~~strike~~  ||spoiler||") { showAttach = false; text += "**bold** __italic__ `code` ||spoiler||" }
        }
    }

    if (pickContact) ModalBottomSheet({ pickContact = false }, containerColor = p.surface, contentColor = p.text) {
        LazyColumn(Modifier.padding(bottom = 24.dp)) {
            item { SettingsRow("My contact", "Share yourself", Icons.Rounded.Person, onClick = { engine.sendContact(chatId, "me"); pickContact = false }) }
            items(contacts.values.filter { !it.blocked && it.id != chatId }.sortedBy { it.displayName }.toList()) { c ->
                Row(Modifier.fillMaxWidth().clickable { engine.sendContact(chatId, c.id); pickContact = false }.padding(horizontal = 16.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(c.displayName, c.emoji, c.color, 40.dp); Spacer(Modifier.width(12.dp)); Text(c.displayName) }
            }
        }
    }
    menuFor?.let { m ->
        MessageMenu(m, chat, onDismiss = { menuFor = null }, onReact = { e -> engine.react(chatId, m.id, e); menuFor = null },
            onReply = { replyTo = m; editing = null; menuFor = null },
            onCopy = { copyText(ctx, "msg", m.text); menuFor = null },
            onEdit = { editing = m; replyTo = null; text = m.text; menuFor = null },
            onForward = { menuFor = null; nav.push(Route.Forward(m)) },
            onPin = { engine.togglePin(chatId, m.id); menuFor = null },
            onDelete = { confirmDelete = m; menuFor = null })
    }
    confirmDelete?.let { m ->
        AlertDialog({ confirmDelete = null }, containerColor = p.surfaceHigh,
            title = { Text("Delete message?") },
            text = { Text(if (m.mine && chat.type != ChatType.SAVED) "You can delete it for everyone: recipients' devices will remove it when they receive the request." else "It will be removed from this device.") },
            confirmButton = { Column { if (m.mine && chat.type != ChatType.SAVED) TextButton({ engine.delete(chatId, m.id, true); confirmDelete = null }) { Text("Delete for everyone", color = p.danger) }; TextButton({ engine.delete(chatId, m.id, false); confirmDelete = null }) { Text("Delete for me", color = p.danger) } } },
            dismissButton = { TextButton({ confirmDelete = null }) { Text("Cancel") } })
    }
}

fun previewText(m: Message) = when {
    m.kind == MsgKind.CONTACT -> "👤 Contact: " + m.text
    m.deleted -> "Deleted message"; m.kind == MsgKind.IMAGE -> "🖼 " + m.text.ifBlank { "Photo" }; m.kind == MsgKind.VOICE -> "🎤 Voice message"; m.kind == MsgKind.GIFT -> "🎁 Gift"; else -> m.text
}

@Composable private fun DateChip(t: String) { val p = OrbitTheme.p; Box(Modifier.fillMaxWidth().padding(vertical = 8.dp), contentAlignment = Alignment.Center) { Text(t, Modifier.clip(RoundedCornerShape(12.dp)).background(p.surface.copy(alpha = 0.85f)).padding(horizontal = 12.dp, vertical = 4.dp), fontSize = 12.sp, color = p.textDim, fontWeight = FontWeight.Medium) } }
@Composable private fun SystemChip(t: String) { val p = OrbitTheme.p; Box(Modifier.fillMaxWidth().padding(vertical = 5.dp, horizontal = 24.dp), contentAlignment = Alignment.Center) { Text(t, Modifier.clip(RoundedCornerShape(12.dp)).background(p.surface.copy(alpha = 0.85f)).padding(horizontal = 12.dp, vertical = 5.dp), fontSize = 12.sp, color = p.textDim, textAlign = androidx.compose.ui.text.style.TextAlign.Center) } }

// ============================================================ message row & bubble
@Composable
private fun MessageRow(m: Message, chat: Chat, first: Boolean, last: Boolean, engine: app.orbit.engine.Engine, contacts: Map<String, Contact>, all: List<Message>, onReply: () -> Unit, onMenu: () -> Unit, onJump: (String) -> Unit) {
    val p = OrbitTheme.p; val prefs = LocalPrefs.current; val haptic = LocalHapticFeedback.current; val density = androidx.compose.ui.platform.LocalDensity.current
    val mine = m.mine || (chat.type == ChatType.CHANNEL && chat.isOwner)
    val group = chat.type == ChatType.GROUP
    var drag by remember { mutableFloatStateOf(0f) }
    val animated by animateFloatAsState(drag, spring(stiffness = 700f), label = "drag")
    val trigger = with(density) { 64.dp.toPx() }
    var fired by remember { mutableStateOf(false) }
    val r = prefs.bubbleRadius.dp
    val tail = 4.dp
    val shape = RoundedCornerShape(topStart = if (!mine && !first) 6.dp else r, topEnd = if (mine && !first) 6.dp else r, bottomStart = if (!mine && last) tail else if (!mine) 6.dp else r, bottomEnd = if (mine && last) tail else if (mine) 6.dp else r)
    val maxW = (LocalConfiguration.current.screenWidthDp * (if (chat.type == ChatType.CHANNEL) 0.92f else 0.80f)).dp

    Box(Modifier.fillMaxWidth().padding(top = if (first) 5.dp else 1.5.dp)) {
        Box(Modifier.align(if (mine) Alignment.CenterEnd else Alignment.CenterStart).offset { IntOffset(animated.roundToInt(), 0) }.alpha(0f)) {}
        Icon(Icons.AutoMirrored.Rounded.Reply, null, tint = p.accent.copy(alpha = (abs(animated) / trigger).coerceIn(0f, 1f)), modifier = Modifier.align(Alignment.CenterEnd).padding(end = 18.dp).size(24.dp).scale((abs(animated) / trigger).coerceIn(0.4f, 1f)))
        Row(Modifier.fillMaxWidth().offset { IntOffset(animated.roundToInt(), 0) }
            .pointerInput(m.id) {
                detectHorizontalDragGestures(onDragEnd = { drag = 0f; fired = false }, onDragCancel = { drag = 0f; fired = false }) { _, dx ->
                    drag = (drag + dx).coerceIn(-trigger * 1.4f, 0f)
                    if (-drag >= trigger && !fired) { fired = true; haptic.performHapticFeedback(HapticFeedbackType.LongPress); onReply() }
                }
            }, horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start, verticalAlignment = Alignment.Bottom) {
            if (!mine && group) { if (last) { val c = contacts[m.sender]; Avatar(c?.displayName ?: "?", c?.emoji ?: "", c?.color ?: 0, 32.dp) } else Spacer(Modifier.width(32.dp)); Spacer(Modifier.width(6.dp)) }
            val bubbleBg: Modifier = if (m.kind == MsgKind.GIFT) Modifier.background(if (mine) p.outBrush else Brush.linearGradient(listOf(p.bubbleIn, p.bubbleIn)))
            else if (mine) Modifier.background(p.outBrush) else Modifier.background(p.bubbleIn)
            Column(Modifier.widthIn(max = maxW).clip(shape).then(bubbleBg).combinedClickable(onClick = { }, onLongClick = { haptic.performHapticFeedback(HapticFeedbackType.LongPress); onMenu() })) {
                MessageContent(m, chat, mine, first && group && !mine, engine, contacts, all, onJump, onMenu)
            }
        }
    }
}

@Composable
private fun MessageContent(m: Message, chat: Chat, mine: Boolean, showName: Boolean, engine: app.orbit.engine.Engine, contacts: Map<String, Contact>, all: List<Message>, onJump: (String) -> Unit, onMenu: () -> Unit) {
    val p = OrbitTheme.p; val prefs = LocalPrefs.current; val nav = LocalNav.current; val ctx = LocalContext.current
    val fg = if (mine) p.onOut else p.text
    val dim = if (mine) p.onOut.copy(alpha = 0.72f) else p.textDim
    val accentOn = if (mine) Color.White else p.accent
    var reveal by remember { mutableStateOf(false) }

    Column(Modifier.padding(horizontal = 11.dp, vertical = 6.dp).widthIn(min = 64.dp)) {
        if (showName) { val c = contacts[m.sender]; Text(c?.displayName ?: "User", color = nameColor(m.sender), fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.padding(bottom = 2.dp)) }
        if (m.forwardedFrom.isNotEmpty()) Text("↪ Forwarded from ${m.forwardedFrom}", color = accentOn, fontSize = 12.5.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = 3.dp))
        if (m.replyTo.isNotEmpty()) {
            val rm = all.firstOrNull { it.id == m.replyTo }
            Row(Modifier.padding(bottom = 4.dp).clip(RoundedCornerShape(8.dp)).background(accentOn.copy(alpha = 0.12f)).clickable { onJump(m.replyTo) }.height(IntrinsicSize.Min)) {
                Box(Modifier.fillMaxHeight().width(3.dp).background(accentOn)); Spacer(Modifier.width(8.dp))
                Column(Modifier.padding(vertical = 4.dp, horizontal = 2.dp).padding(end = 8.dp)) {
                    Text(if (rm == null) "Message" else engine.contactName(rm.sender), color = accentOn, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1)
                    Text(rm?.let { previewText(it) } ?: "Original not available", color = fg.copy(alpha = 0.85f), fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        when {
            m.deleted -> Text("Message deleted", color = dim, fontStyle = androidx.compose.ui.text.font.FontStyle.Italic, fontSize = 15.sp)
            m.kind == MsgKind.IMAGE -> ImageBubble(m, engine) { nav.push(Route.Image(m.chatId, m.id)) }
            m.kind == MsgKind.VOICE -> VoiceBubble(m, engine, mine)
            m.kind == MsgKind.GIFT -> GiftBubble(m, engine, mine) { nav.push(Route.GiftDetail(it)) }
            m.kind == MsgKind.LIVE -> LiveBubble(m.text, m.extra, m.chatId, mine)
            m.kind == MsgKind.CONTACT -> ContactBubble(m, mine, engine)
            else -> {}
        }
        if (m.text.isNotEmpty() && !m.deleted && m.kind != MsgKind.VOICE && m.kind != MsgKind.GIFT && m.kind != MsgKind.LIVE && m.kind != MsgKind.CONTACT || (m.kind == MsgKind.GIFT && m.text.isNotEmpty())) {
            val linkColor = if (mine) Color.White else p.accent
            val scope = rememberCoroutineScope(); val toast = { t: String -> android.widget.Toast.makeText(ctx, t, android.widget.Toast.LENGTH_SHORT).show() }
            val onLink = { url: String ->
                when {
                    url.startsWith("orbit://") -> scope.launch { val id = engine.openLink(url); if (id != null) nav.push(Route.Chat(id)) else toast("Invalid Orbit link") }
                    url.startsWith("@") -> scope.launch { val id = engine.openUsername(url); if (id != null) nav.push(Route.Chat(id)) else toast("$url not found yet — usernames spread through the network, or ask for their link") }
                    else -> try { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) { toast("No app can open this link") }
                }
            }
            val annotated = remember(m.text, reveal, mine, p) { RichText.build(m.text, fg, linkColor, fg.copy(alpha = 0.14f), reveal) { } }
            val pad = "\u00A0".repeat(if (mine) 14 else 9)
            var layout by remember { mutableStateOf<androidx.compose.ui.text.TextLayoutResult?>(null) }
            val full = remember(annotated, pad) { androidx.compose.ui.text.buildAnnotatedString { append(annotated); append(pad) } }
            Text(full, color = fg, fontSize = (16 * prefs.textScale).sp, lineHeight = (21 * prefs.textScale).sp, onTextLayout = { layout = it },
                modifier = Modifier.pointerInput(full) {
                    detectTapGestures(onLongPress = { onMenu() }, onTap = { pos ->
                        val l = layout ?: return@detectTapGestures
                        val off = l.getOffsetForPosition(pos)
                        val hit = full.getStringAnnotations("link", off, off).firstOrNull()
                        if (hit != null) onLink(hit.item) else if (RichText.hasSpoiler(m.text)) reveal = !reveal
                    })
                })
        } else Spacer(Modifier.height(2.dp))
        // meta line
        Row(Modifier.align(Alignment.End).offset(y = if (m.text.isNotEmpty() && m.kind != MsgKind.IMAGE) (-16).dp else 0.dp), verticalAlignment = Alignment.CenterVertically) {
            if (chat.type == ChatType.CHANNEL && m.views > 0) { Icon(Icons.Rounded.Visibility, null, tint = dim, modifier = Modifier.size(13.dp)); Text(" ${m.views}  ", color = dim, fontSize = 11.sp) }
            if (m.pinned) { Icon(Icons.Rounded.PushPin, null, tint = dim, modifier = Modifier.size(12.dp)); Spacer(Modifier.width(3.dp)) }
            if (m.edited) Text("edited  ", color = dim, fontSize = 11.sp)
            Text(fmtTime(m.ts), color = dim, fontSize = 11.sp)
            if (m.sender == "me" && chat.type != ChatType.SAVED) { Spacer(Modifier.width(3.dp)); Ticks(m.status, dim, if (mine) Color.White else p.accent, 15.dp) }
        }
        if (m.text.isNotEmpty() && m.kind != MsgKind.IMAGE) Spacer(Modifier.height(0.dp))
        if (m.reactions.isNotEmpty()) {
            Row(Modifier.padding(top = if (m.text.isNotEmpty()) 0.dp else 4.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                m.reactions.forEach { (e, who) ->
                    val iMine = "me" in who
                    Row(Modifier.clip(RoundedCornerShape(12.dp)).background(if (iMine) accentOn.copy(alpha = 0.35f) else fg.copy(alpha = 0.12f)).clickable { engine.react(m.chatId, m.id, e) }.padding(horizontal = 8.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(e, fontSize = 14.sp); if (who.size > 1 || true) Text(" ${who.size}", fontSize = 12.sp, color = fg, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

private fun nameColor(id: String): Color { val c = listOf(0xFFFF885E, 0xFFE0A200, 0xFF6C8CFF, 0xFF41C268, 0xFF28C9B7, 0xFF2A9EF1, 0xFFD669ED, 0xFFFF5C93); return Color(c[(id.hashCode() and 0x7fffffff) % 8]) }

@Composable
private fun ImageBubble(m: Message, engine: app.orbit.engine.Engine, onClick: () -> Unit) {
    val file = remember(m.media) { engine.mediaFile(m.media) }
    val bmp by produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, m.media) { value = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { Imaging.decodeFile(file, 900)?.asImageBitmap() } }
    val ratio = bmp?.let { (it.width.toFloat() / it.height).coerceIn(0.6f, 1.7f) } ?: 1f
    Box(Modifier.padding(bottom = 3.dp).widthIn(min = 180.dp, max = 280.dp).aspectRatio(ratio).clip(RoundedCornerShape(10.dp)).background(Color.Black.copy(alpha = 0.15f)).clickable(onClick = onClick)) {
        bmp?.let { Image(it, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) } ?: Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp, color = Color.White) }
    }
}

@Composable
private fun VoiceBubble(m: Message, engine: app.orbit.engine.Engine, mine: Boolean) {
    val p = OrbitTheme.p
    val fg = if (mine) Color.White else p.accent
    val playing = VoicePlayer.playingId == m.id
    LaunchedEffect(playing) { while (playing) { VoicePlayer.tick(); delay(80) } }
    val progress = if (playing && VoicePlayer.duration > 0) VoicePlayer.position.toFloat() / VoicePlayer.duration else 0f
    val bars = remember(m.id) { val r = java.util.Random(m.id.hashCode().toLong()); List(30) { 0.25f + r.nextFloat() * 0.75f } }
    Row(Modifier.padding(vertical = 2.dp).width(220.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(42.dp).clip(CircleShape).background(if (mine) Color.White.copy(alpha = 0.25f) else p.accent).pressable({ VoicePlayer.toggle(m.id, engine.mediaFile(m.media)) }), contentAlignment = Alignment.Center) {
            Icon(if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, null, tint = Color.White, modifier = Modifier.size(26.dp))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Row(Modifier.height(26.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                bars.forEachIndexed { i, h -> Box(Modifier.weight(1f).fillMaxHeight(h).clip(RoundedCornerShape(2.dp)).background(if (i.toFloat() / bars.size <= progress) fg else fg.copy(alpha = 0.4f))) }
            }
            val s = (if (playing) VoicePlayer.position.toInt() else m.durationMs) / 1000
            Text("%d:%02d".format(s / 60, s % 60), color = if (mine) Color.White.copy(alpha = 0.75f) else p.textDim, fontSize = 11.sp)
        }
    }
}

@Composable
private fun GiftBubble(m: Message, engine: app.orbit.engine.Engine, mine: Boolean, onOpen: (String) -> Unit) {
    val p = OrbitTheme.p
    val gid = m.extra.optString("gid"); val ok = m.extra.optBoolean("ok", true)
    val gifts by engine.gifts.collectAsState()
    val g = gifts.firstOrNull { it.first.id == gid }?.first
    Column(Modifier.width(230.dp).padding(bottom = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        if (g == null || !ok) { Text(if (!ok) "⚠️ This gift failed cryptographic verification and was not added to your collection." else "Gift unavailable", color = if (mine) Color.White else p.text, modifier = Modifier.padding(8.dp)); return@Column }
        val t = remember(g.id) { GiftLogic.traits(g) }
        Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(14.dp)).clickable { onOpen(gid) }) {
            Gift3D(g)
            Text(t.tier.label, Modifier.align(Alignment.TopStart).padding(8.dp).clip(RoundedCornerShape(8.dp)).background(Color.Black.copy(alpha = 0.35f)).padding(horizontal = 8.dp, vertical = 3.dp), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Text("#${g.serial}", Modifier.align(Alignment.TopEnd).padding(8.dp).clip(RoundedCornerShape(8.dp)).background(Color.Black.copy(alpha = 0.35f)).padding(horizontal = 8.dp, vertical = 3.dp), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(6.dp))
        Text(if (mine) "You sent ${GiftCatalog.models[g.model].name}" else "${GiftCatalog.models[g.model].name} · ${t.materialInfo.name}", fontWeight = FontWeight.Bold, color = if (mine) Color.White else p.text, fontSize = 15.sp)
        Text("from ${g.issuerName.ifBlank { "unknown" }} · ${g.serial}/${g.supply}", color = if (mine) Color.White.copy(alpha = 0.8f) else p.textDim, fontSize = 12.sp)
    }
}

@Composable
private fun MessageMenu(m: Message, chat: Chat, onDismiss: () -> Unit, onReact: (String) -> Unit, onReply: () -> Unit, onCopy: () -> Unit, onEdit: () -> Unit, onForward: () -> Unit, onPin: () -> Unit, onDelete: () -> Unit) {
    val p = OrbitTheme.p
    Dialog(onDismissRequest = onDismiss) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            if (!m.deleted && chat.type != ChatType.SAVED) Row(Modifier.clip(RoundedCornerShape(28.dp)).background(p.surfaceHigh).padding(horizontal = 8.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                QuickReactions.forEachIndexed { i, e ->
                    var shown by remember { mutableStateOf(false) }
                    LaunchedEffect(Unit) { delay(i * 28L); shown = true }
                    val s by animateFloatAsState(if (shown) 1f else 0f, spring(0.5f, 500f), label = "r")
                    Box(Modifier.size(42.dp).scale(s).clip(CircleShape).clickable { onReact(e) }, contentAlignment = Alignment.Center) { Text(e, fontSize = 26.sp) }
                }
            }
            Spacer(Modifier.height(10.dp))
            Column(Modifier.width(260.dp).clip(RoundedCornerShape(18.dp)).background(p.surfaceHigh)) {
                if (!m.deleted) MenuItem(Icons.AutoMirrored.Rounded.Reply, "Reply", onReply)
                if (m.text.isNotBlank() && !m.deleted) MenuItem(Icons.Rounded.ContentCopy, "Copy text", onCopy)
                if (m.mine && m.kind == MsgKind.TEXT && !m.deleted && (chat.type != ChatType.CHANNEL || chat.isOwner)) MenuItem(Icons.Rounded.Edit, "Edit", onEdit)
                if (!m.deleted) MenuItem(Icons.Rounded.Forward, "Forward", onForward)
                if (!m.deleted && (chat.type == ChatType.DIRECT || chat.type == ChatType.SAVED || chat.isOwner)) MenuItem(Icons.Rounded.PushPin, if (m.pinned) "Unpin" else "Pin", onPin)
                MenuItem(Icons.Rounded.Delete, "Delete", onDelete, danger = true)
            }
        }
    }
}

@Composable
private fun MenuItem(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit, danger: Boolean = false) {
    val p = OrbitTheme.p
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = if (danger) p.danger else p.text, modifier = Modifier.size(22.dp)); Spacer(Modifier.width(14.dp)); Text(label, color = if (danger) p.danger else p.text, fontSize = 16.sp)
    }
}

// ============================================================ image viewer & forward
@Composable
fun ImageViewerScreen(chatId: String, msgId: String) {
    val engine = LocalEngine.current; val nav = LocalNav.current
    val msgs by engine.messages(chatId).collectAsState()
    val m = msgs.firstOrNull { it.id == msgId }
    var scale by remember { mutableFloatStateOf(1f) }; var off by remember { mutableStateOf(Offset.Zero) }
    val bmp by produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, m?.media) { value = m?.let { kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { Imaging.decodeFile(engine.mediaFile(it.media), 2048)?.asImageBitmap() } } }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        bmp?.let { Image(it, null, Modifier.fillMaxSize().pointerInput(Unit) { detectTransformGestures { _, pan, zoom, _ -> scale = (scale * zoom).coerceIn(1f, 5f); off = if (scale > 1f) off + pan else Offset.Zero } }.pointerInput(Unit) { detectTapGestures(onDoubleTap = { scale = if (scale > 1f) 1f else 2.5f; off = Offset.Zero }) }.graphicsLayer(scaleX = scale, scaleY = scale, translationX = off.x, translationY = off.y), contentScale = ContentScale.Fit) }
        IconButton(onClick = { nav.pop() }, Modifier.statusBarsPadding().padding(8.dp)) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, null, tint = Color.White) }
    }
}

@Composable
fun ForwardScreen(msg: Message) {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p
    val chats by engine.chats.collectAsState()
    Column(Modifier.fillMaxSize()) {
        TopBar("Forward to…", { nav.pop() })
        androidx.compose.foundation.lazy.LazyColumn {
            items(chats.filter { it.type != ChatType.CHANNEL || it.isOwner }, key = { it.id }) { c ->
                Row(Modifier.fillMaxWidth().clickable { engine.forward(c.id, msg); nav.pop(); nav.push(Route.Chat(c.id)) }.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(c.title, c.emoji, c.color, 44.dp); Spacer(Modifier.width(12.dp)); Text(c.title, style = MaterialTheme.typography.titleSmall)
                }
            }
        }
    }
}

@Composable
private fun ContactBubble(m: Message, mine: Boolean, engine: app.orbit.engine.Engine) {
    val p = OrbitTheme.p; val nav = LocalNav.current; val scope = rememberCoroutineScope()
    val addr = m.extra.optString("addr"); val name = m.extra.optString("name").ifBlank { m.text }
    val fg = if (mine) Color.White else p.text
    Row(Modifier.width(240.dp).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Avatar(name, m.extra.optString("e"), m.extra.optInt("c"), 46.dp); Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(name, color = fg, fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(m.extra.optString("u").takeIf { it.isNotBlank() }?.let { "@$it" } ?: "Orbit contact", color = if (mine) Color.White.copy(alpha = 0.8f) else p.textDim, fontSize = 12.5.sp)
        }
    }
    Box(Modifier.width(240.dp).height(38.dp).padding(bottom = 2.dp).clip(RoundedCornerShape(10.dp)).background(if (mine) Color.White.copy(alpha = 0.22f) else p.accent).pressable({
        scope.launch { val id = engine.openLink("orbit://u/$addr"); if (id != null) nav.push(Route.Chat(id)) }
    }), contentAlignment = Alignment.Center) { Text("Message", color = Color.White, fontWeight = FontWeight.Bold) }
}
