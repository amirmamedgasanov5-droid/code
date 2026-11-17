package app.orbit.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

@Composable
fun QrCode(text: String, size: Dp, dark: Color, a: Color = dark, b: Color = dark) {
    val m = remember(text) { try { QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, mapOf(EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M, EncodeHintType.MARGIN to 0)) } catch (e: Exception) { null } }
    Box(Modifier.size(size).clip(RoundedCornerShape(20.dp)).background(Color.White).padding(14.dp)) {
        if (m != null) Canvas(Modifier.size(size - 28.dp)) {
            val n = m.width; val cell = this.size.width / n
            val brush = Brush.linearGradient(listOf(a, b), Offset.Zero, Offset(this.size.width, this.size.height))
            for (y in 0 until n) for (x in 0 until n) if (m.get(x, y)) {
                drawRoundRect(brush, Offset(x * cell, y * cell), Size(cell + 0.6f, cell + 0.6f), CornerRadius(cell * 0.28f))
            }
        }
    }
}
