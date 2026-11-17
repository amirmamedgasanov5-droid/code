package app.orbit.gifts

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.input.pointer.pointerInput
import app.orbit.data.Gift
import kotlin.math.*

val LocalAnimateGifts = compositionLocalOf { true }

private fun lerp(a: Color, b: Color, t: Float) = androidx.compose.ui.graphics.lerp(a, b, t.coerceIn(0f, 1f))

/**
 * A software 3D renderer for collectible gifts: rotating, lit, specular-highlighted polyhedra on
 * a patterned backdrop with floating sparkles. Pure Canvas, no assets, identical on every device.
 */
@Composable
fun Gift3D(
    gift: Gift,
    modifier: Modifier = Modifier,
    interactive: Boolean = false,
    animate: Boolean = true,
    showBackdrop: Boolean = true,
    modelScale: Float = 1f,
) {
    val animate = animate && LocalAnimateGifts.current
    val traits = remember(gift.id) { GiftLogic.traits(gift) }
    val mesh = remember(traits.model) { Models.get(traits.model) }
    val mat = traits.materialInfo
    val bd = traits.backdropInfo
    val parts = remember(traits) { partColors(traits) }

    var t by remember { mutableFloatStateOf(0f) }
    var dragYaw by remember { mutableFloatStateOf(0f) }
    var dragPitch by remember { mutableFloatStateOf(0f) }
    var boost by remember { mutableFloatStateOf(0f) }
    if (animate) LaunchedEffect(gift.id) {
        var last = 0L
        while (true) withFrameNanos { n -> if (last != 0L) { val dt = (n - last) / 1e9f; t += dt; boost *= (1f - 2.5f * dt).coerceAtLeast(0f) }; last = n }
    }

    // reused buffers
    val sx = remember(mesh) { FloatArray(mesh.v.size / 3) }
    val sy = remember(mesh) { FloatArray(mesh.v.size / 3) }
    val sz = remember(mesh) { FloatArray(mesh.v.size / 3) }
    val vnx = remember(mesh) { FloatArray(mesh.v.size / 3) }
    val vny = remember(mesh) { FloatArray(mesh.v.size / 3) }
    val vnz = remember(mesh) { FloatArray(mesh.v.size / 3) }
    val order = remember(mesh) { arrayOfNulls<Int>(mesh.faceCount) }
    val depth = remember(mesh) { FloatArray(mesh.faceCount) }
    val path = remember { Path() }
    val sparkles = remember(gift.id) { val r = java.util.Random(gift.id.hashCode().toLong()); List(14) { floatArrayOf(r.nextFloat(), r.nextFloat(), r.nextFloat() * 6.28f, 0.4f + r.nextFloat() * 0.9f) } }

    val gm = if (interactive) Modifier.pointerInput(Unit) {
        detectDragGestures(onDragStart = { boost = 1f }, onDragEnd = { boost = 0.6f }) { _, d -> dragYaw += d.x * 0.01f; dragPitch = (dragPitch + d.y * 0.008f).coerceIn(-0.9f, 0.9f) }
    } else Modifier

    Canvas(modifier.then(gm).fillMaxSize()) {
        val w = size.width; val h = size.height; val m = min(w, h)
        if (showBackdrop) drawBackdrop(traits, t)
        val cx = w / 2; val cy = h * 0.5f
        val scale = m * 0.27f * modelScale
        val yaw = 0.75f + traits.model * 0.41f + t * traits.spin * (1f + boost) + dragYaw
        val pitch = 0.32f + sin(t * 0.8f) * 0.07f + dragPitch
        val cyw = cos(yaw); val syw = sin(yaw); val cp = cos(pitch); val sp = sin(pitch)
        val bob = sin(t * 1.4f) * 0.04f * m

        // shadow & glow
        drawOval(Color.Black.copy(alpha = 0.22f), Offset(cx - scale * 0.9f, cy + scale * 1.55f + bob * 0.2f), Size(scale * 1.8f, scale * 0.28f))
        drawCircle(Brush.radialGradient(listOf(Color(mat.glint).copy(alpha = 0.22f), Color.Transparent), Offset(cx, cy), scale * 1.9f), scale * 1.9f, Offset(cx, cy))

        val v = mesh.v
        for (i in 0 until v.size / 3) {
            val x = v[i * 3]; val y = v[i * 3 + 1]; val z = v[i * 3 + 2]
            val x1 = x * cyw + z * syw; val z1 = -x * syw + z * cyw
            val y2 = y * cp - z1 * sp; val z2 = y * sp + z1 * cp
            sx[i] = cx + x1 * scale; sy[i] = cy - y2 * scale + bob; sz[i] = z2
            if (mesh.smooth) {
                val nx0 = mesh.vn[i * 3]; val ny0 = mesh.vn[i * 3 + 1]; val nz0 = mesh.vn[i * 3 + 2]
                val nx1 = nx0 * cyw + nz0 * syw; val nz1 = -nx0 * syw + nz0 * cyw
                vnx[i] = nx1; vny[i] = ny0 * cp - nz1 * sp; vnz[i] = ny0 * sp + nz1 * cp
            }
        }
        for (f in 0 until mesh.faceCount) {
            val fi = mesh.faces[f]; var d = 0f
            for (k in fi) d += sz[k]
            depth[f] = d / fi.size; order[f] = f
        }
        java.util.Arrays.sort(order) { a, b -> depth[b!!].compareTo(depth[a!!]) } // far to near (z2 larger = farther in this frame)
        val lx = -0.45f; val ly = 0.65f; val lz = -0.62f  // light direction (towards light, camera looks +z)
        for (oi in order) {
            val f = oi!!; val fi = mesh.faces[f]
            val a = fi[0]; val b = fi[1]; val c = fi[fi.size - 1].let { fi[2.coerceAtMost(fi.size - 1)] }
            var ux = sx[b] - sx[a]; var uy = -(sy[b] - sy[a]); var uz = sz[b] - sz[a]
            var vx = sx[c] - sx[a]; var vy = -(sy[c] - sy[a]); var vz = sz[c] - sz[a]
            var nx = uy * vz - uz * vy; var ny = uz * vx - ux * vz; var nz = ux * vy - uy * vx
            if (mesh.smooth) { nx = 0f; ny = 0f; nz = 0f; for (k in fi) { nx += vnx[k]; ny += vny[k]; nz += vnz[k] } }
            val len = sqrt(nx * nx + ny * ny + nz * nz).coerceAtLeast(1e-6f); nx /= len; ny /= len; nz /= len
            if (!mesh.smooth && nz > 0) { nx = -nx; ny = -ny; nz = -nz } // two-sided: face the camera (camera at -z)
            else if (mesh.smooth && nz > 0.0f) { nx = -nx; ny = -ny; nz = -nz }
            val diff = (nx * lx + ny * ly + nz * lz).coerceIn(-1f, 1f)
            val lam = (diff * 0.5f + 0.5f).pow(1.7f)
            // blinn specular
            val hx = lx; val hy = ly; val hz = lz - 1f; val hl = sqrt(hx * hx + hy * hy + hz * hz)
            val spec = ((nx * hx + ny * hy + nz * hz) / hl).coerceAtLeast(0f).pow(14f + mat.shine * 30f) * mat.shine
            val rim = (1f + nz).coerceIn(0f, 1f).pow(3f) * 0.25f
            val pc = parts[mesh.part[f].coerceAtMost(parts.size - 1)]
            var col = if (lam < 0.5f) lerp(pc.shade, pc.base, lam / 0.5f) else lerp(pc.base, pc.glint, ((lam - 0.5f) / 0.5f) * 0.55f)
            if (pc.iridescent) { val hue = ((nx * 0.5f + ny * 0.35f + t * 0.12f + traits.model * 0.07f) % 1f + 1f) % 1f * 360f; col = lerp(col, Color.hsv(hue, 0.55f, 1f), 0.55f) }
            // sky-ground environment tint on shiny stuff
            // chrome-like environment reflection: sky above, dark ground, bright horizon line
            val ry = (-2f * nz * ny).coerceIn(-1f, 1f)
            val env = if (ry > 0f) lerp(Color(0xFFBFD9FF).copy(alpha = 1f), pc.glint, (1f - ry)) else lerp(pc.shade, Color(0xFF0B0F1A), (-ry).coerceIn(0f, 1f) * 0.8f)
            val horizon = (1f - abs(ry * 3f)).coerceIn(0f, 1f)
            col = lerp(col, lerp(env, Color.White, horizon * 0.8f), 0.38f * mat.shine)
            col = lerp(col, Color.White, (spec * 0.85f + rim * 0.35f).coerceIn(0f, 0.9f))
            path.reset()
            path.moveTo(sx[fi[0]], sy[fi[0]])
            for (k in 1 until fi.size) path.lineTo(sx[fi[k]], sy[fi[k]])
            path.close()
            drawPath(path, col)
            drawPath(path, col, style = Stroke(width = 0.9f))
        }
        // sparkles
        for (s in sparkles) {
            val tw = (sin(t * 2.4f * s[3] + s[2]) * 0.5f + 0.5f)
            if (tw < 0.2f) continue
            val px = cx + (s[0] - 0.5f) * m * 1.15f; val py = cy + (s[1] - 0.5f) * m * 1.0f
            drawSparkle(Offset(px, py), m * 0.016f * tw * (0.7f + s[3] * 0.4f), Color.White.copy(alpha = 0.9f * tw))
        }
    }
}

private class PartColors(val base: Color, val shade: Color, val glint: Color, val iridescent: Boolean)

private fun partColors(t: Traits): List<PartColors> {
    val m = t.materialInfo
    val main = PartColors(Color(m.base), Color(m.shade), Color(m.glint), m.iridescent)
    // accent parts use a contrasting complementary tone so ribbons / gems read as separate pieces
    val alt = GiftCatalog.materials[(t.material + 3) % GiftCatalog.materials.size]
    val a1 = PartColors(Color(alt.base), Color(alt.shade), Color(alt.glint), alt.iridescent)
    val gold = GiftCatalog.materials[0]
    val a2 = PartColors(Color(gold.base), Color(gold.shade), Color(gold.glint), false)
    return listOf(main, a1, a2)
}

fun DrawScope.drawSparkle(c: Offset, r: Float, color: Color) {
    val p = Path()
    p.moveTo(c.x, c.y - r * 2f); p.quadraticTo(c.x, c.y, c.x + r * 2f, c.y); p.quadraticTo(c.x, c.y, c.x, c.y + r * 2f); p.quadraticTo(c.x, c.y, c.x - r * 2f, c.y); p.quadraticTo(c.x, c.y, c.x, c.y - r * 2f)
    drawPath(p, color)
}

private fun DrawScope.drawBackdrop(t: Traits, time: Float) {
    val bd = t.backdropInfo
    val w = size.width; val h = size.height
    drawRect(Brush.verticalGradient(listOf(Color(bd.top), Color(bd.bottom))))
    drawRect(Brush.radialGradient(listOf(Color.White.copy(alpha = 0.22f), Color.Transparent), Offset(w / 2, h * 0.42f), min(w, h) * 0.75f))
    val tint = Color.White.copy(alpha = 0.10f)
    val step = min(w, h) / 5.2f
    when (GiftCatalog.patterns[t.pattern]) {
        "Dots" -> { var y = step / 2; var row = 0; while (y < h + step) { var x = if (row % 2 == 0) step / 2 else step; while (x < w + step) { drawCircle(tint, step * 0.09f, Offset(x, y)); x += step }; y += step * 0.8f; row++ } }
        "Rings" -> for (i in 1..7) drawCircle(tint, i * step * 0.55f, Offset(w / 2, h / 2), style = Stroke(width = step * 0.05f))
        "Rays" -> { val n = 18; for (i in 0 until n) { val a = i.toFloat() / n * 6.2832f + time * 0.05f; val p = Path(); p.moveTo(w / 2, h / 2); p.lineTo(w / 2 + cos(a - 0.07f) * w, h / 2 + sin(a - 0.07f) * w); p.lineTo(w / 2 + cos(a + 0.07f) * w, h / 2 + sin(a + 0.07f) * w); p.close(); drawPath(p, Color.White.copy(alpha = 0.06f)) } }
        "Grid" -> { var x = 0f; while (x < w) { drawLine(tint, Offset(x, 0f), Offset(x, h), step * 0.025f); x += step * 0.7f }; var y = 0f; while (y < h) { drawLine(tint, Offset(0f, y), Offset(w, y), step * 0.025f); y += step * 0.7f } }
        "Stars" -> { var y = step / 2; var row = 0; while (y < h + step) { var x = if (row % 2 == 0) step / 2 else step; while (x < w + step) { drawSparkle(Offset(x, y), step * 0.07f, tint); x += step }; y += step * 0.9f; row++ } }
    }
    // tiled symbol ring around the object
    val sym = GiftCatalog.symbols[t.symbol]
    val n = 10; val rad = min(w, h) * 0.43f
    for (i in 0 until n) {
        val a = i.toFloat() / n * 6.2832f + time * 0.08f
        drawSymbol(sym, Offset(w / 2 + cos(a) * rad * 1.05f, h / 2 + sin(a) * rad * 0.85f), min(w, h) * 0.045f, Color.White.copy(alpha = 0.16f))
    }
}

fun DrawScope.drawSymbol(name: String, c: Offset, r: Float, color: Color) {
    val p = Path()
    when (name) {
        "Star" -> { for (i in 0 until 10) { val a = i / 10f * 6.2832f - 1.5708f; val rr = if (i % 2 == 0) r else r * 0.45f; val x = c.x + cos(a) * rr; val y = c.y + sin(a) * rr; if (i == 0) p.moveTo(x, y) else p.lineTo(x, y) }; p.close(); drawPath(p, color) }
        "Moon" -> { val a = Path().apply { addOval(androidx.compose.ui.geometry.Rect(c.x - r, c.y - r, c.x + r, c.y + r)) }; val b = Path().apply { addOval(androidx.compose.ui.geometry.Rect(c.x - r * 0.35f, c.y - r * 1.05f, c.x + r * 1.45f, c.y + r * 0.95f)) }; val d = Path.combine(PathOperation.Difference, a, b); drawPath(d, color) }
        "Bolt" -> { p.moveTo(c.x + r * 0.2f, c.y - r); p.lineTo(c.x - r * 0.6f, c.y + r * 0.1f); p.lineTo(c.x, c.y + r * 0.1f); p.lineTo(c.x - r * 0.2f, c.y + r); p.lineTo(c.x + r * 0.6f, c.y - r * 0.15f); p.lineTo(c.x, c.y - r * 0.15f); p.close(); drawPath(p, color) }
        "Crown" -> { p.moveTo(c.x - r, c.y + r * 0.6f); p.lineTo(c.x - r, c.y - r * 0.5f); p.lineTo(c.x - r * 0.5f, c.y); p.lineTo(c.x, c.y - r * 0.8f); p.lineTo(c.x + r * 0.5f, c.y); p.lineTo(c.x + r, c.y - r * 0.5f); p.lineTo(c.x + r, c.y + r * 0.6f); p.close(); drawPath(p, color) }
        "Flame" -> { p.moveTo(c.x, c.y - r); p.cubicTo(c.x + r * 0.9f, c.y - r * 0.1f, c.x + r * 0.8f, c.y + r, c.x, c.y + r); p.cubicTo(c.x - r * 0.8f, c.y + r, c.x - r * 0.9f, c.y, c.x - r * 0.2f, c.y - r * 0.4f); p.cubicTo(c.x - r * 0.1f, c.y - r * 0.6f, c.x, c.y - r * 0.8f, c.x, c.y - r); drawPath(p, color) }
        "Leaf" -> { p.moveTo(c.x - r, c.y + r); p.cubicTo(c.x - r, c.y - r * 0.5f, c.x, c.y - r * 1.2f, c.x + r, c.y - r); p.cubicTo(c.x + r, c.y + r * 0.2f, c.x, c.y + r * 1.1f, c.x - r, c.y + r); drawPath(p, color) }
        "Snowflake" -> { for (i in 0 until 3) { val a = i / 3f * 3.1416f; drawLine(color, Offset(c.x + cos(a) * r, c.y + sin(a) * r), Offset(c.x - cos(a) * r, c.y - sin(a) * r), r * 0.16f) } }
        "Eye" -> { p.moveTo(c.x - r, c.y); p.quadraticTo(c.x, c.y - r * 1.1f, c.x + r, c.y); p.quadraticTo(c.x, c.y + r * 1.1f, c.x - r, c.y); drawPath(p, color); drawCircle(Color.Black.copy(alpha = 0.18f), r * 0.32f, c) }
        "Wave" -> { p.moveTo(c.x - r, c.y); p.cubicTo(c.x - r * 0.5f, c.y - r, c.x - r * 0.1f, c.y - r, c.x, c.y); p.cubicTo(c.x + r * 0.1f, c.y + r, c.x + r * 0.5f, c.y + r, c.x + r, c.y); drawPath(p, color, style = Stroke(width = r * 0.3f)) }
        else -> { p.moveTo(c.x, c.y - r); p.cubicTo(c.x + r * 1.4f, c.y - r * 0.1f, c.x + r * 0.7f, c.y + r * 0.7f, c.x + r * 0.15f, c.y + r * 0.45f); p.lineTo(c.x + r * 0.35f, c.y + r); p.lineTo(c.x - r * 0.35f, c.y + r); p.lineTo(c.x - r * 0.15f, c.y + r * 0.45f); p.cubicTo(c.x - r * 0.7f, c.y + r * 0.7f, c.x - r * 1.4f, c.y - r * 0.1f, c.x, c.y - r); drawPath(p, color) }
    }
}
