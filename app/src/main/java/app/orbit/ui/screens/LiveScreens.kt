@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package app.orbit.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import app.orbit.live.Participant
import app.orbit.live.Role
import app.orbit.ui.*
import app.orbit.ui.components.*
import app.orbit.ui.theme.OrbitTheme
import kotlinx.coroutines.delay

@Composable
fun LiveScreen(id: String) {
    val nav = LocalNav.current; val live = LocalLive.current; val engine = LocalEngine.current; val p = OrbitTheme.p; val ctx = LocalContext.current
    val room by live.room.collectAsState(); val info by live.info.collectAsState(); val mic by live.mic.collectAsState()
    val peers by engine.mesh.peers.collectAsState()
    var title by remember { mutableStateOf("") }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> if (ok) live.setMic(true) }

    if (id.startsWith("new:") && room == null) {
        val chatId = id.removePrefix("new:")
        Column(Modifier.fillMaxSize()) {
            TopBar("Go live", { nav.pop() })
            Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("🎙️", fontSize = 64.sp); Spacer(Modifier.height(10.dp))
                Text("Start a live room", style = MaterialTheme.typography.titleLarge)
                Text("Voice room for this chat. Invite people up to speak, they raise a hand, you approve. Audio is end-to-end encrypted and flows phone to phone.", color = p.textDim, textAlign = TextAlign.Center, modifier = Modifier.padding(vertical = 10.dp))
                OutlinedTextField(title, { title = it.take(60) }, Modifier.fillMaxWidth(), label = { Text("Title") }, singleLine = true, shape = RoundedCornerShape(14.dp))
                Spacer(Modifier.height(16.dp))
                GradientButton("Go live", { val rid = live.start(chatId, title.ifBlank { "Live room" }); nav.replaceTop(Route.Live(rid)) }, Modifier.fillMaxWidth(), icon = Icons.Rounded.Podcasts)
            }
        }
        return
    }
    val core = room
    if (core == null || info == null) { Column(Modifier.fillMaxSize()) { TopBar("Live", { nav.pop() }); EmptyState("📴", "Room closed", "This broadcast is over or you left it.") }; return }
    val st by core.state.collectAsState()
    val me = st.me(engine.myId); val myRole = me?.role ?: Role.LISTENER
    val speakers = st.participants.filter { it.role != Role.LISTENER }
    val listeners = st.participants.filter { it.role == Role.LISTENER }
    val hands = listeners.filter { it.hand }
    var selected by remember { mutableStateOf<Participant?>(null) }
    LaunchedEffect(st.ended) { if (st.ended) delay(100) }

    Column(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF241B4B), p.bg)))) {
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 6.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton({ nav.pop() }) { Icon(Icons.Rounded.KeyboardArrowDown, "Minimize", tint = Color.White) }
            Column(Modifier.weight(1f)) {
                Text(st.title, color = Color.White, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${st.participants.size} here · ${peers.size} direct link${if (peers.size == 1) "" else "s"}", color = Color.White.copy(alpha = 0.65f), fontSize = 12.sp)
            }
            if (!st.ended) LiveBadge()
        }
        if (st.ended) {
            Column(Modifier.weight(1f).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { Text("🏁", fontSize = 56.sp); Text("Broadcast ended", color = Color.White, style = MaterialTheme.typography.titleLarge) }
            Box(Modifier.padding(20.dp).navigationBarsPadding()) { GradientButton("Close", { live.leave(); nav.pop() }, Modifier.fillMaxWidth()) }
            return@Column
        }
        if (peers.isEmpty() && !core.isHost || (core.isHost && st.participants.size <= 1)) Text(if (core.isHost) "Waiting for people to join… they need a direct link to you or to someone already in the room (same Wi-Fi, Bluetooth range, or internet)." else "Connecting… you need a direct link to the host or another participant.", Modifier.padding(horizontal = 20.dp, vertical = 4.dp), color = Color.White.copy(alpha = 0.6f), fontSize = 12.sp)
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(12.dp)) {
            item {
                Text("SPEAKERS", color = Color.White.copy(alpha = 0.55f), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 8.dp))
                FlowGrid(speakers) { sp -> SpeakerTile(sp, speaking = sp.id in st.speaking && !sp.muted, isMe = sp.id == engine.myId, onClick = { if (core.isHost && sp.id != engine.myId) selected = sp }) }
            }
            if (core.isHost && hands.isNotEmpty()) item {
                Text("✋ RAISED HANDS", color = Color(0xFFFFC83D), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, top = 18.dp, bottom = 6.dp))
                Column(Modifier.clip(RoundedCornerShape(18.dp)).background(Color.White.copy(alpha = 0.07f))) {
                    hands.forEach { h -> Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(h.name, h.emoji, h.color, 40.dp); Spacer(Modifier.width(10.dp)); Text(h.name.ifBlank { "Guest" }, Modifier.weight(1f), color = Color.White)
                        TonalButton("Invite", { core.hostSetRole(h.id, Role.SPEAKER) }, Modifier.height(36.dp)); Spacer(Modifier.width(6.dp))
                        IconButton({ core.hostSetRole(h.id, Role.LISTENER) }) { Icon(Icons.Rounded.Close, null, tint = Color.White.copy(alpha = 0.6f)) } } }
                }
            }
            item { Text("LISTENERS · ${listeners.size}", color = Color.White.copy(alpha = 0.55f), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, top = 18.dp, bottom = 8.dp)) }
            item { FlowGrid(listeners, small = true) { l -> ListenerTile(l, onClick = { if (core.isHost) selected = l }) } }
        }
        // controls
        Row(Modifier.fillMaxWidth().background(Color.Black.copy(alpha = 0.25f)).navigationBarsPadding().padding(16.dp), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
            RoundControl(Icons.Rounded.CallEnd, if (core.isHost) "End" else "Leave", Color(0xFFFF4D5E)) { if (core.isHost) live.endForAll() else live.leave(); nav.pop() }
            if (myRole != Role.LISTENER) RoundControl(if (mic) Icons.Rounded.Mic else Icons.Rounded.MicOff, if (mic) "Mute" else "Unmute", if (mic) p.accent else Color.White.copy(alpha = 0.18f), big = true) {
                if (mic) live.setMic(false) else if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) live.setMic(true) else permission.launch(Manifest.permission.RECORD_AUDIO)
            } else RoundControl(Icons.Rounded.PanTool, if (me?.hand == true) "Lower hand" else "Raise hand", if (me?.hand == true) Color(0xFFFFB020) else Color.White.copy(alpha = 0.18f), big = true) { core.raiseHand(me?.hand != true) }
            RoundControl(Icons.Rounded.Share, "Invite", Color.White.copy(alpha = 0.18f)) { nav.pop() }
        }
    }
    selected?.let { s ->
        ModalBottomSheet({ selected = null }, containerColor = p.surface, contentColor = p.text) {
            Column(Modifier.padding(bottom = 24.dp)) {
                Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(s.name, s.emoji, s.color, 44.dp); Spacer(Modifier.width(12.dp)); Text(s.name.ifBlank { "Guest" }, style = MaterialTheme.typography.titleMedium) }
                if (s.role == Role.LISTENER) SheetItem(Icons.Rounded.Mic, "Invite to speak", null) { core.hostSetRole(s.id, Role.SPEAKER); selected = null }
                if (s.role == Role.SPEAKER) { SheetItem(Icons.Rounded.MicOff, if (s.muted) "Allow to speak" else "Mute", null) { core.hostMute(s.id, !s.muted); selected = null }; SheetItem(Icons.Rounded.ArrowDownward, "Move to listeners", null) { core.hostSetRole(s.id, Role.LISTENER); selected = null } }
                SheetItem(Icons.Rounded.PersonRemove, "Remove from room", null, danger = true) { core.hostKick(s.id); selected = null }
            }
        }
    }
}

@Composable private fun LiveBadge() {
    val inf = rememberInfiniteTransition(label = "live"); val a by inf.animateFloat(0.4f, 1f, infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "a")
    Row(Modifier.padding(end = 12.dp).clip(RoundedCornerShape(10.dp)).background(Color(0xFFFF3B4E)).padding(horizontal = 9.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(Color.White.copy(alpha = a))); Spacer(Modifier.width(5.dp)); Text("LIVE", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
    }
}

@Composable private fun <T> FlowGrid(items: List<T>, small: Boolean = false, content: @Composable (T) -> Unit) {
    val cols = if (small) 4 else 3
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) { items.chunked(cols).forEach { row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) { row.forEach { Box(Modifier.weight(1f)) { content(it) } }; repeat(cols - row.size) { Spacer(Modifier.weight(1f)) } } } }
}

@Composable private fun SpeakerTile(sp: Participant, speaking: Boolean, isMe: Boolean, onClick: () -> Unit) {
    val inf = rememberInfiniteTransition(label = "sp")
    val ring by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(900)), label = "ring")
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).clickable(onClick = onClick).padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(84.dp), contentAlignment = Alignment.Center) {
            if (speaking) Canvas(Modifier.fillMaxSize()) { drawCircle(Color(0xFF4FD07F).copy(alpha = 1f - ring), size.minDimension / 2 * (0.78f + 0.22f * ring), style = Stroke(5f)); drawCircle(Color(0xFF4FD07F), size.minDimension * 0.4f, style = Stroke(3f)) }
            Avatar(sp.name, sp.emoji, sp.color, 64.dp)
            if (sp.muted) Box(Modifier.align(Alignment.BottomEnd).size(24.dp).clip(CircleShape).background(Color(0xFF3A3F55)), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.MicOff, null, tint = Color.White, modifier = Modifier.size(14.dp)) }
            if (sp.role == Role.HOST) Box(Modifier.align(Alignment.TopEnd).size(22.dp).clip(CircleShape).background(Color(0xFFFFB020)), contentAlignment = Alignment.Center) { Text("★", color = Color.White, fontSize = 12.sp) }
        }
        Text(if (isMe) "You" else sp.name.ifBlank { "Guest" }, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(if (sp.role == Role.HOST) "host" else "speaker", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp)
    }
}

@Composable private fun ListenerTile(l: Participant, onClick: () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable(onClick = onClick).padding(vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box { Avatar(l.name, l.emoji, l.color, 52.dp); if (l.hand) Text("✋", Modifier.align(Alignment.TopEnd), fontSize = 18.sp) }
        Text(l.name.ifBlank { "Guest" }, color = Color.White.copy(alpha = 0.85f), fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable private fun RoundControl(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, color: Color, big: Boolean = false, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(if (big) 68.dp else 54.dp).clip(CircleShape).background(color).pressable(onClick), contentAlignment = Alignment.Center) { Icon(icon, label, tint = Color.White, modifier = Modifier.size(if (big) 32.dp else 26.dp)) }
        Spacer(Modifier.height(5.dp)); Text(label, color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp)
    }
}

// ============================================================ chat bubble for a live room
@Composable
fun LiveBubble(title: String, extra: org.json.JSONObject, chatId: String, mine: Boolean) {
    val p = OrbitTheme.p; val nav = LocalNav.current; val live = LocalLive.current; val engine = LocalEngine.current
    val current by live.info.collectAsState()
    val rid = extra.optString("rid"); val joined = current?.rid == rid
    Column(Modifier.width(240.dp).padding(vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) { LiveBadge(); Text(if (extra.optString("host") == engine.myId) "You are hosting" else "Live room", color = if (mine) Color.White else p.textDim, fontSize = 12.sp) }
        Text(title.ifBlank { "Live room" }, color = if (mine) Color.White else p.text, fontWeight = FontWeight.Bold, fontSize = 17.sp, modifier = Modifier.padding(vertical = 6.dp))
        Box(Modifier.fillMaxWidth().height(40.dp).clip(RoundedCornerShape(12.dp)).background(if (mine) Color.White.copy(alpha = 0.22f) else p.accent).pressable({
            if (!joined) live.join(rid, extra.optString("key"), extra.optString("host"), title, chatId)
            nav.push(Route.Live(rid))
        }), contentAlignment = Alignment.Center) { Text(if (joined) "Open" else "Join", color = Color.White, fontWeight = FontWeight.Bold) }
    }
}

// ============================================================ walkie-talkie
@Composable
fun WalkieScreen() {
    val nav = LocalNav.current; val live = LocalLive.current; val p = OrbitTheme.p; val ctx = LocalContext.current; val engine = LocalEngine.current
    val tx by live.walkieTx.collectAsState(); val rx by live.walkieActive.collectAsState(); val peers by engine.mesh.peers.collectAsState()
    var code by remember { mutableStateOf("") }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { now = System.currentTimeMillis(); delay(250) } }
    val receiving = rx?.let { now - it.second < 900 } == true
    val perm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    DisposableEffect(Unit) { onDispose { live.walkieStop(); live.audio.stopPlayback() } }
    val inf = rememberInfiniteTransition(label = "w"); val pulse by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(1100)), label = "p")

    Column(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF1B2440), p.bg)))) {
        TopBar("Walkie-talkie", { nav.pop() })
        Column(Modifier.weight(1f).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(if (code.isBlank()) "Open channel" else "Private channel", style = MaterialTheme.typography.titleMedium)
            Text(if (code.isBlank()) "Everyone in range can hear you" else "Only phones with the same code can hear you", color = p.textDim, fontSize = 13.sp)
            Spacer(Modifier.height(14.dp))
            OutlinedTextField(code, { code = it.take(24); live.setWalkieCode(it) }, Modifier.fillMaxWidth(0.7f), label = { Text("Channel code (optional)") }, singleLine = true, shape = RoundedCornerShape(14.dp))
            Spacer(Modifier.weight(1f))
            Box(Modifier.size(250.dp), contentAlignment = Alignment.Center) {
                if (tx || receiving) androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) { for (i in 0..2) { val t = (pulse + i / 3f) % 1f; drawCircle((if (tx) p.accent else p.success).copy(alpha = (1f - t) * 0.45f), size.minDimension / 2 * (0.55f + 0.45f * t)) } }
                Box(Modifier.size(170.dp).clip(CircleShape).background(if (tx) Brush.linearGradient(listOf(Color(0xFFFF4D5E), Color(0xFFFF8A5B))) else p.accentBrush)
                    .pointerInput(Unit) {
                        awaitEachGesture {
                            awaitFirstDown()
                            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { perm.launch(Manifest.permission.RECORD_AUDIO); return@awaitEachGesture }
                            live.walkieStart()
                            do { val ev = awaitPointerEvent() } while (ev.changes.any { it.pressed })
                            live.walkieStop()
                        }
                    }, contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.Rounded.Mic, null, tint = Color.White, modifier = Modifier.size(54.dp)); Text(if (tx) "TRANSMITTING" else "HOLD TO TALK", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, letterSpacing = 1.sp) }
                }
            }
            Spacer(Modifier.height(16.dp))
            Text(if (receiving) "🔊 Receiving from ${rx!!.first.take(6)}" else if (peers.isEmpty()) "No phones in range yet" else "${peers.size} phone${if (peers.size == 1) "" else "s"} in range", color = if (receiving) p.success else p.textDim, fontWeight = FontWeight.Medium)
            Spacer(Modifier.weight(1f))
            Text("Voice hops up to 2 phones away over Bluetooth / Wi-Fi. Open-channel audio is not secret; use a code for a private line.", color = p.textDim, fontSize = 12.sp, textAlign = TextAlign.Center)
        }
    }
}
