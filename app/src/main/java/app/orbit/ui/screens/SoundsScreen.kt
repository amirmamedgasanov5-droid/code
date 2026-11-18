package app.orbit.ui.screens

import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.orbit.ui.*
import app.orbit.ui.components.*
import app.orbit.ui.theme.OrbitTheme

private class SoundItem(val title: String, val value: String, val uri: Uri?)

@Composable
fun SoundsScreen() {
    val nav = LocalNav.current; val engine = LocalEngine.current; val ctx = LocalContext.current; val p = OrbitTheme.p
    var tab by remember { mutableIntStateOf(0) }           // 0 = messages, 1 = calls
    var msg by remember { mutableStateOf(engine.db.getKv("snd.msg") ?: "") }
    var call by remember { mutableStateOf(engine.db.getKv("snd.call") ?: "") }
    var vib by remember { mutableStateOf(engine.db.getKv("snd.vib") != "0") }
    var playing by remember { mutableStateOf<Ringtone?>(null) }
    DisposableEffect(Unit) { onDispose { try { playing?.stop() } catch (_: Exception) {} } }

    val type = if (tab == 0) RingtoneManager.TYPE_NOTIFICATION else RingtoneManager.TYPE_RINGTONE
    val items = remember(tab) {
        buildList {
            add(SoundItem("Default", "", RingtoneManager.getDefaultUri(type)))
            add(SoundItem("Silent", "none", null))
            try {
                val rm = RingtoneManager(ctx).also { it.setType(type) }
                val c = rm.cursor
                while (c.moveToNext()) add(SoundItem(c.getString(RingtoneManager.TITLE_COLUMN_INDEX), rm.getRingtoneUri(c.position).toString(), rm.getRingtoneUri(c.position)))
            } catch (_: Exception) {}
        }
    }
    val current = if (tab == 0) msg else call

    Column(Modifier.fillMaxSize()) {
        TopBar("Sounds", { nav.pop() })
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Message sound", "Call ringtone").forEachIndexed { i, l -> val sel = tab == i
                androidx.compose.foundation.layout.Box(Modifier.weight(1f).height(40.dp).then(Modifier).let { it }.run { this }, contentAlignment = Alignment.Center) {
                    androidx.compose.foundation.layout.Box(Modifier.fillMaxSize().androidxClip(20).androidxBg(if (sel) p.accent else p.surfaceHigh).clickable { tab = i }, contentAlignment = Alignment.Center) { Text(l, color = if (sel) androidx.compose.ui.graphics.Color.White else p.textDim, style = MaterialTheme.typography.labelLarge) }
                } }
        }
        SettingsRow("Vibration", "Also vibrate for messages and calls", Icons.Rounded.Vibration, trailing = { OrbitSwitch(vib) { vib = it; engine.db.setKv("snd.vib", if (it) "1" else "0") } })
        Text("Tap a sound to hear it and select it.", Modifier.padding(horizontal = 20.dp, vertical = 8.dp), color = p.textDim, style = MaterialTheme.typography.bodySmall)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            items(items, key = { tab.toString() + it.value + it.title }) { it0 ->
                Row(Modifier.fillMaxWidth().clickable {
                    if (tab == 0) { msg = it0.value; engine.db.setKv("snd.msg", it0.value) } else { call = it0.value; engine.db.setKv("snd.call", it0.value) }
                    try { playing?.stop() } catch (_: Exception) {}
                    playing = it0.uri?.let { u -> try { RingtoneManager.getRingtone(ctx, u).also { r -> r.play() } } catch (e: Exception) { null } }
                }.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(if (it0.value == "none") Icons.Rounded.VolumeOff else Icons.Rounded.MusicNote, null, tint = p.textDim); Spacer(Modifier.width(14.dp))
                    Text(it0.title, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                    if (current == it0.value) Icon(Icons.Rounded.Check, null, tint = p.accent)
                }
            }
        }
    }
}

private fun Modifier.androidxClip(r: Int) = this.then(Modifier.clip(androidx.compose.foundation.shape.RoundedCornerShape(r.dp)))
private fun Modifier.androidxBg(c: androidx.compose.ui.graphics.Color) = this.then(Modifier.background(c))
