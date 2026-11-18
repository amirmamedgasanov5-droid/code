@file:OptIn(androidx.compose.animation.ExperimentalAnimationApi::class)
package app.orbit.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import app.orbit.OrbitApp
import app.orbit.engine.Engine
import app.orbit.engine.ParsedLink
import app.orbit.engine.TransportManager
import app.orbit.live.LiveManager
import app.orbit.ui.screens.*
import app.orbit.ui.theme.OrbitTheme
import kotlinx.coroutines.launch

val LocalEngine = staticCompositionLocalOf<Engine> { error("no engine") }
val LocalTransports = staticCompositionLocalOf<TransportManager> { error("no transports") }
val LocalLive = staticCompositionLocalOf<LiveManager> { error("no live") }
val LocalNav = staticCompositionLocalOf<Navigator> { error("no nav") }
val LocalPrefs = staticCompositionLocalOf<UiPrefs> { error("no prefs") }
val LocalRequestPerms = staticCompositionLocalOf<() -> Unit> { {} }

@Composable
fun OrbitRoot(app: OrbitApp, pendingOpen: MutableState<String?>, requestPerms: () -> Unit) {
    val engine = app.engine
    val prefs = remember { UiPrefs({ engine.db.getKv(it) }, { k, v -> engine.db.setKv(k, v) }) }
    val ready by engine.ready.collectAsState()
    val hasId by engine.hasIdentity.collectAsState()
    OrbitTheme(prefs.themeMode, prefs.accent) {
        val p = OrbitTheme.p
        CompositionLocalProvider(LocalEngine provides engine, LocalTransports provides app.transports, LocalLive provides app.live, LocalPrefs provides prefs, LocalRequestPerms provides requestPerms) {
            Box(Modifier.fillMaxSize().background(p.bg)) {
                when {
                    !ready -> {}
                    !hasId -> Onboarding(onDone = { })
                    else -> PermissionGate(requestPerms) { AppNav(pendingOpen, app) }
                }
            }
        }
    }
}

@Composable
private fun AppNav(pendingOpen: MutableState<String?>, app0: OrbitApp) {
    val nav = remember { Navigator() }
    val engine = LocalEngine.current
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    BackHandler(enabled = nav.stack.size > 1) { nav.pop() }

    LaunchedEffect(pendingOpen.value) {
        val v = pendingOpen.value ?: return@LaunchedEffect
        pendingOpen.value = null
        when {
            v == "call:accept" -> {
                // notification "Answer": wait briefly for the ring signal, then pick up if the mic is already allowed
                val live = app0.live
                repeat(20) { if (engine.incomingCall.value == null) kotlinx.coroutines.delay(100) }
                val inc = engine.incomingCall.value
                if (inc != null && androidx.core.content.ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED) { live.acceptCall(inc); nav.resetTo(Route.Main); nav.push(Route.Call(inc.from)) }
            }
            v.startsWith("chat:") -> { nav.resetTo(Route.Main); nav.push(Route.Chat(v.removePrefix("chat:"))) }
            v.startsWith("link:") || v.startsWith("text:") -> {
                val txt = v.substringAfter(":")
                scope.launch { engine.openLink(txt)?.let { nav.resetTo(Route.Main); nav.push(Route.Chat(it)) } }
            }
        }
    }
    CompositionLocalProvider(LocalNav provides nav) {
      Box(Modifier.fillMaxSize()) {
        AnimatedContent(
            targetState = nav.top,
            transitionSpec = {
                val fwd = nav.lastForward
                if (initialState is Route.Main && targetState !is Route.Main || fwd) (slideInHorizontally(tween(280)) { (it * 0.28f).toInt() } + fadeIn(tween(220))) togetherWith (slideOutHorizontally(tween(280)) { -(it * 0.12f).toInt() } + fadeOut(tween(200)))
                else (slideInHorizontally(tween(280)) { -(it * 0.12f).toInt() } + fadeIn(tween(220))) togetherWith (slideOutHorizontally(tween(280)) { (it * 0.28f).toInt() } + fadeOut(tween(200)))
            },
            label = "nav",
        ) { r ->
            Box(Modifier.fillMaxSize().background(OrbitTheme.p.bg)) {
                when (r) {
                    Route.Main -> MainScreen()
                    is Route.Chat -> ChatScreen(r.id)
                    is Route.Info -> InfoScreen(r.id)
                    Route.AddContact -> AddContactScreen()
                    Route.NewGroup -> NewGroupScreen()
                    Route.NewChannel -> NewChannelScreen()
                    is Route.AddMembers -> AddMembersScreen(r.groupId)
                    is Route.GiftShop -> GiftShopScreen(r.chatId)
                    Route.Inventory -> InventoryScreen()
                    is Route.GiftDetail -> GiftDetailScreen(r.id)
                    is Route.Live -> LiveScreen(r.roomId)
                    is Route.Image -> ImageViewerScreen(r.chatId, r.msgId)
                    Route.MyQr -> MyQrScreen()
                    Route.EditProfile -> EditProfileScreen()
                    Route.Appearance -> AppearanceScreen()
                    Route.Network -> NetworkScreen()
                    Route.Privacy -> PrivacyScreen()
                    Route.Walkie -> WalkieScreen()
                    is Route.Forward -> ForwardScreen(r.msg)
                    Route.Search -> SearchScreen()
                    Route.Mesh -> MeshScreen()
                    Route.Reliable -> ReliableScreen()
                    Route.Sounds -> SoundsScreen()
                    Route.Market -> MarketScreen()
                    Route.Admin -> AdminScreen()
                    Route.Wheel -> WheelScreen()
                    is Route.Call -> CallScreen(r.peerId)
                }
            }
        }
        IncomingCallOverlay()
      }
    }
}
