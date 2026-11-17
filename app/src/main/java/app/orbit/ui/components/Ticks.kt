package app.orbit.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.orbit.data.Status

@Composable
fun Ticks(status: Int, tint: Color, readTint: Color, size: Dp = 15.dp) {
    when (status) {
        Status.SENDING -> Icon(Icons.Rounded.Schedule, "sending", tint = tint, modifier = Modifier.size(size - 1.dp))
        Status.CARRIED -> Icon(Icons.Rounded.Sync, "carried by mesh", tint = tint, modifier = Modifier.size(size))
        Status.SENT -> Icon(Icons.Rounded.Done, "sent", tint = tint, modifier = Modifier.size(size))
        Status.DELIVERED -> Icon(Icons.Rounded.DoneAll, "delivered", tint = tint, modifier = Modifier.size(size))
        Status.READ -> Icon(Icons.Rounded.DoneAll, "read", tint = readTint, modifier = Modifier.size(size))
        Status.FAILED -> Icon(Icons.Rounded.ErrorOutline, "failed", tint = Color(0xFFFF5C6C), modifier = Modifier.size(size))
        else -> {}
    }
}
