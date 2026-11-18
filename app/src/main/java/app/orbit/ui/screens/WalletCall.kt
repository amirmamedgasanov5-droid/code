@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package app.orbit.ui.screens

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import app.orbit.live.CallStatus
import app.orbit.ui.*
import app.orbit.ui.components.*
import app.orbit.ui.theme.OrbitTheme
import kotlinx.coroutines.delay
import kotlin.math.cos
import kotlin.math.sin

private val WheelColors = listOf(Color(0xFF7C5CFF), Color(0xFF2F8CFF), Color(0xFF12B981), Color(0xFFF5A524), Color(0xFFFF6B5E), Color(0xFFFF4D8D), Color(0xFF22D3EE), Color(0xFFFFB020))

@Composable
fun WheelScreen() {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p
    val coins by engine.coins.collectAsState(); val lastSpin by engine.lastSpin.collectAsState()
    val prizes = engine.wheelPrizes
    val rot = remember { Animatable(0f) }
    var spinning by remember { mutableStateOf(false) }
    var won by remember { mutableStateOf<Int?>(null) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { now = System.currentTimeMillis(); delay(500) } }
    val left = (engine.nextSpinAt() - now).coerceAtLeast(0)
    val ready = left == 0L && !spinning
    val totalW = prizes.sumOf { it.second }

    LaunchedEffect(spinning) {
        if (spinning) {
            val idx = engine.spinWheel()
            if (idx < 0) { spinning = false; return@LaunchedEffect }
            val seg = 360f / prizes.size
            val target = 360f * 6 + (360f - (idx + 0.5f) * seg) + 360f * 0f
            val base = rot.value % 360f
            rot.snapTo(base)
            rot.animateTo(base + target, tween(5200, easing = CubicBezierEasing(0.1f, 0.7f, 0.1f, 1f)))
            won = prizes[idx].first; spinning = false
        }
    }

    Column(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF2A1B4D), p.bg)))) {
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton({ nav.pop() }) { Icon(Icons.Rounded.Close, null, tint = Color.White) }
            Spacer(Modifier.weight(1f))
            Row(Modifier.clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = 0.14f)).padding(horizontal = 14.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) { Text("💰", fontSize = 18.sp); Spacer(Modifier.width(6.dp)); Text("$coins", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp) }
            Spacer(Modifier.width(10.dp))
        }
        Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Wheel of Fortune", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
            Text("One free spin every 24 hours · win 5 to 250 coins", color = Color.White.copy(alpha = 0.7f), fontSize = 14.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(18.dp))
            Box(Modifier.size(300.dp), contentAlignment = Alignment.TopCenter) {
                Canvas(Modifier.fillMaxSize().padding(top = 14.dp)) {
                    val r = size.minDimension / 2; val c = Offset(size.width / 2, size.height / 2); val seg = 360f / prizes.size
                    drawCircle(Color.White.copy(alpha = 0.18f), r + 10f, c)
                    rotate(rot.value, c) {
                        prizes.forEachIndexed { i, (v, _) ->
                            drawArc(WheelColors[i % WheelColors.size], -90f + i * seg, seg, true, Offset(c.x - r, c.y - r), Size(r * 2, r * 2))
                            drawArc(Color.White.copy(alpha = 0.35f), -90f + i * seg, seg, true, Offset(c.x - r, c.y - r), Size(r * 2, r * 2), style = Stroke(3f))
                            val mid = Math.toRadians((-90f + (i + 0.5f) * seg).toDouble())
                            val paint = android.graphics.Paint().apply { color = android.graphics.Color.WHITE; textSize = r * 0.16f; isFakeBoldText = true; textAlign = android.graphics.Paint.Align.CENTER; isAntiAlias = true; setShadowLayer(4f, 0f, 2f, 0x66000000) }
                            drawContext.canvas.nativeCanvas.save()
                            drawContext.canvas.nativeCanvas.rotate(-90f + (i + 0.5f) * seg + 90f, c.x, c.y)
                            drawContext.canvas.nativeCanvas.drawText("$v", c.x, c.y - r * 0.72f, paint)
                            paint.textSize = r * 0.1f
                            drawContext.canvas.nativeCanvas.drawText("💰", c.x, c.y - r * 0.56f, paint)
                            drawContext.canvas.nativeCanvas.restore()
                        }
                    }
                    drawCircle(Color.White, r * 0.13f, c); drawCircle(Color(0xFF2A1B4D), r * 0.09f, c)
                }
                // pointer
                Canvas(Modifier.size(34.dp)) { val path = Path().apply { moveTo(size.width / 2, size.height); lineTo(0f, 0f); lineTo(size.width, 0f); close() }; drawPath(path, Color.White); drawPath(path, Color(0xFFFF4D5E), style = Stroke(4f)) }
            }
            Spacer(Modifier.height(18.dp))
            AnimatedContent(won, label = "won") { w ->
                if (w != null) Column(horizontalAlignment = Alignment.CenterHorizontally) { Text("🎉 +$w coins!", color = Color(0xFFFFD66B), fontSize = 30.sp, fontWeight = FontWeight.ExtraBold); Text("Added to your balance", color = Color.White.copy(alpha = 0.7f)) }
                else Spacer(Modifier.height(1.dp))
            }
            Spacer(Modifier.height(8.dp))
            if (ready) GradientButton("SPIN", { won = null; spinning = true }, Modifier.fillMaxWidth(0.7f), icon = Icons.Rounded.Casino)
            else if (spinning) Text("Good luck…", color = Color.White, fontWeight = FontWeight.SemiBold)
            else Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Next free spin in", color = Color.White.copy(alpha = 0.7f)); Text("%02d:%02d:%02d".format(left / 3600_000, left / 60_000 % 60, left / 1000 % 60), color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.height(16.dp))
            Text(prizes.joinToString("  ·  ") { "${it.first} (${it.second * 100 / totalW}%)" }, color = Color.White.copy(alpha = 0.55f), fontSize = 12.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.weight(1f))
            TonalButton("Spend coins in the gift shop", { nav.replaceTop(Route.GiftShop(null)) }, Modifier.padding(bottom = 20.dp).navigationBarsPadding(), icon = Icons.Rounded.CardGiftcard)
        }
    }
}

// ============================================================ calls
@Composable
fun rememberCallStarter(peerId: String): () -> Unit {
    val ctx = LocalContext.current; val live = LocalLive.current; val nav = LocalNav.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> if (ok) { live.startCall(peerId); nav.push(Route.Call(peerId)) } }
    return { if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { live.startCall(peerId); nav.push(Route.Call(peerId)) } else launcher.launch(Manifest.permission.RECORD_AUDIO) }
}

@Composable
fun CallScreen(peerId: String) {
    val engine = LocalEngine.current; val live = LocalLive.current; val nav = LocalNav.current; val p = OrbitTheme.p
    val call by live.call.collectAsState(); val mic by live.mic.collectAsState(); val spk by live.speaker.collectAsState()
    val contacts by engine.contacts.collectAsState()
    val c = contacts[peerId]
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { now = System.currentTimeMillis(); delay(500) } }
    LaunchedEffect(call == null) { if (call == null) nav.pop() }
    val st = call?.status
    val status = when (st) {
        CallStatus.RINGING -> "Calling…"; CallStatus.CONNECTING -> "Connecting…"
        CallStatus.ACTIVE -> { val s = (now - (call?.startedAt ?: now)) / 1000; "%d:%02d".format(s / 60, s % 60) }
        CallStatus.ENDED -> call?.reason?.ifBlank { "Call ended" } ?: "Call ended"; null -> ""
    }
    val inf = rememberInfiniteTransition(label = "ring"); val pulse by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(1500)), label = "p")
    Column(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF1C2B5A), Color(0xFF0B1020)))).systemBarsPadding(), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(60.dp))
        Box(Modifier.size(220.dp), contentAlignment = Alignment.Center) {
            if (st == CallStatus.RINGING || st == CallStatus.CONNECTING) Canvas(Modifier.fillMaxSize()) { for (i in 0..1) { val t = (pulse + i * 0.5f) % 1f; drawCircle(Color.White.copy(alpha = (1f - t) * 0.25f), size.minDimension / 2 * (0.5f + 0.5f * t)) } }
            Avatar(c?.displayName ?: "?", c?.emoji ?: "", c?.color ?: 0, 130.dp)
        }
        Spacer(Modifier.height(16.dp))
        Text(c?.displayName ?: "Contact", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Text(status, color = Color.White.copy(alpha = 0.75f), fontSize = 18.sp)
        if (st == CallStatus.CONNECTING || st == CallStatus.RINGING) Text("Voice goes directly phone to phone (Wi-Fi, Bluetooth or internet)", Modifier.padding(horizontal = 40.dp, vertical = 10.dp), color = Color.White.copy(alpha = 0.45f), fontSize = 12.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.weight(1f))
        Row(Modifier.fillMaxWidth().padding(bottom = 40.dp), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
            CallBtn(if (mic) Icons.Rounded.Mic else Icons.Rounded.MicOff, if (mic) "Mute" else "Unmute", if (mic) Color.White.copy(alpha = 0.18f) else Color.White.copy(alpha = 0.9f), if (mic) Color.White else Color.Black) { live.setMic(!mic) }
            CallBtn(Icons.Rounded.CallEnd, "End", Color(0xFFFF3B4E), Color.White, big = true) { live.hangup(); }
            CallBtn(if (spk) Icons.Rounded.VolumeUp else Icons.Rounded.VolumeDown, "Speaker", if (spk) Color.White.copy(alpha = 0.9f) else Color.White.copy(alpha = 0.18f), if (spk) Color.Black else Color.White) { live.setSpeaker(!spk) }
        }
    }
}

@Composable private fun CallBtn(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, bg: Color, fg: Color, big: Boolean = false, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(if (big) 76.dp else 62.dp).clip(CircleShape).background(bg).pressable(onClick), contentAlignment = Alignment.Center) { Icon(icon, label, tint = fg, modifier = Modifier.size(30.dp)) }
        Spacer(Modifier.height(6.dp)); Text(label, color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp)
    }
}

@Composable
fun IncomingCallOverlay() {
    val engine = LocalEngine.current; val live = LocalLive.current; val nav = LocalNav.current; val ctx = LocalContext.current
    val inc by engine.incomingCall.collectAsState(); val contacts by engine.contacts.collectAsState()
    val i = inc ?: return
    val c = contacts[i.from]
    val perm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { live.acceptCall(i); nav.push(Route.Call(i.from)) }
    DisposableEffect(i.rid) {
        val tone = try { engine.notifier?.callUri()?.let { u -> RingtoneManager.getRingtone(ctx, u).also { r -> if (Build.VERSION.SDK_INT >= 28) r.isLooping = true; r.play() } } } catch (e: Exception) { null }
        val vib = ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        if (engine.notifier?.vibrate() != false) try { if (Build.VERSION.SDK_INT >= 26) vib?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 700, 600), 0)) else @Suppress("DEPRECATION") vib?.vibrate(longArrayOf(0, 700, 600), 0) } catch (_: Exception) {}
        onDispose { try { tone?.stop() } catch (_: Exception) {}; try { vib?.cancel() } catch (_: Exception) {} }
    }
    LaunchedEffect(i.rid) { delay(45_000); if (engine.incomingCall.value?.rid == i.rid) engine.dismissIncomingCall() }
    Column(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF1C2B5A), Color(0xFF0B1020)))).clickable(enabled = false) {}.systemBarsPadding(), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(80.dp))
        Text("Incoming call", color = Color.White.copy(alpha = 0.7f), fontSize = 16.sp)
        Spacer(Modifier.height(24.dp))
        Avatar(c?.displayName ?: "?", c?.emoji ?: "", c?.color ?: 0, 140.dp)
        Spacer(Modifier.height(18.dp))
        Text(c?.displayName ?: "Unknown", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold)
        Text("Orbit voice call", color = Color.White.copy(alpha = 0.6f))
        Spacer(Modifier.weight(1f))
        Row(Modifier.fillMaxWidth().padding(bottom = 60.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
            CallBtn(Icons.Rounded.CallEnd, "Decline", Color(0xFFFF3B4E), Color.White, big = true) { live.declineCall(i) }
            CallBtn(Icons.Rounded.Call, "Accept", Color(0xFF2BD16B), Color.White, big = true) {
                if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { live.acceptCall(i); nav.push(Route.Call(i.from)) } else perm.launch(Manifest.permission.RECORD_AUDIO)
            }
        }
    }
}
