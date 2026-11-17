package app.orbit.ui

import androidx.compose.runtime.*
import app.orbit.data.Message

sealed interface Route {
    data object Main : Route
    data class Chat(val id: String, val jumpTo: String? = null) : Route
    data class Info(val id: String) : Route
    data object AddContact : Route
    data object NewGroup : Route
    data object NewChannel : Route
    data class AddMembers(val groupId: String) : Route
    data class GiftShop(val chatId: String?) : Route
    data object Inventory : Route
    data class GiftDetail(val id: String) : Route
    data class Live(val roomId: String) : Route
    data class Image(val chatId: String, val msgId: String) : Route
    data object MyQr : Route
    data object EditProfile : Route
    data object Appearance : Route
    data object Network : Route
    data object Privacy : Route
    data object Walkie : Route
    data class Forward(val msg: Message) : Route
    data object Reliable : Route
    data object Mesh : Route
    data object Wheel : Route
    data class Call(val peerId: String) : Route
    data object Search : Route
}

class Navigator {
    val stack = mutableStateListOf<Route>(Route.Main)
    var lastForward by mutableStateOf(true)
    val top: Route get() = stack.last()
    fun push(r: Route) { lastForward = true; stack.add(r) }
    fun pop(): Boolean { if (stack.size <= 1) return false; lastForward = false; stack.removeAt(stack.lastIndex); return true }
    fun replaceTop(r: Route) { lastForward = true; stack[stack.lastIndex] = r }
    fun popTo(r: Route) { lastForward = false; while (stack.size > 1 && stack.last() != r) stack.removeAt(stack.lastIndex) }
    fun resetTo(r: Route) { lastForward = false; stack.clear(); stack.add(r) }
}

class UiPrefs(private val read: (String) -> String?, private val write: (String, String) -> Unit) {
    var themeMode by mutableStateOf(app.orbit.ui.theme.ThemeMode.values()[(read("ui.theme")?.toIntOrNull() ?: 0).coerceIn(0, 3)])
    var accent by mutableIntStateOf(read("ui.accent")?.toIntOrNull() ?: 0)
    var bubbleRadius by mutableIntStateOf(read("ui.radius")?.toIntOrNull() ?: 18)
    var textScale by mutableFloatStateOf(read("ui.text")?.toFloatOrNull() ?: 1f)
    var compact by mutableStateOf(read("ui.compact") == "1")
    var tab by mutableIntStateOf(0)
    var wheelShown by mutableStateOf(false)
    fun save() { write("ui.theme", themeMode.ordinal.toString()); write("ui.accent", accent.toString()); write("ui.radius", bubbleRadius.toString()); write("ui.text", textScale.toString()); write("ui.compact", if (compact) "1" else "0") }
}
