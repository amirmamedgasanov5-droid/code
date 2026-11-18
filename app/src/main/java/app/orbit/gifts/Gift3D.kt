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
    /** tests/previews only: force a notebook pose (open 0..1, ink 0..1) */
    nbOpen: Float? = null,
    nbInk: Float? = null,
) {
    val animate = animate && LocalAnimateGifts.current
    val traits = remember(gift.id) { GiftLogic.traits(gift) }
    val mesh = remember(traits.model) { Models.get(traits.model) }
    val mat = traits.materialInfo
    val bd = traits.backdropInfo
    val parts = remember(traits) { partColors(traits) }
    val isNb = mesh.hinged != null
    val pages = remember(gift.id) { notebookTexts(gift) }

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
        // notebooks run a loop: open by themselves -> a pen writes -> close again (10 s). Static renders show them open and half written.
        val cyc = if (animate) t % 10f else 0f
        fun ss(x: Float) = x.coerceIn(0f, 1f).let { it * it * (3 - 2 * it) }
        val open = nbOpen ?: if (!isNb) 0f else if (!animate) 1f else when { cyc < 1.4f -> ss(cyc / 1.4f); cyc < 8f -> 1f; cyc < 9.4f -> 1f - ss((cyc - 8f) / 1.4f); else -> 0f }
        val ink = nbInk ?: if (!animate) 0.7f else ((cyc - 2.0f) / 5.2f).coerceIn(0f, 1f)
        val scale = m * 0.27f * modelScale * (1f - 0.30f * open)
        val yaw = if (isNb) (0.45f + sin(t * 0.5f) * 0.22f) * (1f - open) + 0.06f * open + dragYaw else 0.75f + traits.model * 0.41f + t * traits.spin * (1f + boost) + dragYaw
        val pitch = 0.32f + sin(t * 0.8f) * 0.07f + dragPitch + (if (isNb) open * 0.5f else 0f)
        val cyw = cos(yaw); val syw = sin(yaw); val cp = cos(pitch); val sp = sin(pitch)
        val bob = sin(t * 1.4f) * 0.04f * m * (if (isNb) 0.4f else 1f)

        // shadow & glow
        drawOval(Color.Black.copy(alpha = 0.22f), Offset(cx - scale * 0.9f, cy + scale * 1.55f + bob * 0.2f), Size(scale * 1.8f, scale * 0.28f))
        drawCircle(Brush.radialGradient(listOf(Color(mat.glint).copy(alpha = 0.12f), Color.Transparent), Offset(cx, cy), scale * 1.9f), scale * 1.9f, Offset(cx, cy))

        val v = mesh.v
        for (i in 0 until v.size / 3) {
            var x = v[i * 3]; val y = v[i * 3 + 1]; var z = v[i * 3 + 2]
            if (isNb) {   // the front cover swings about the spine; the whole book recentres as it opens
                if (mesh.hinged!![i]) { val a = open * PI.toFloat(); val dx = x - mesh.hingeX; x = mesh.hingeX + dx * cos(a) + z * sin(a); z = -dx * sin(a) + z * cos(a) }
                x += open * (-mesh.hingeX)
            }
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
            if (isNb && open > 0.5f && (mesh.part[f] == 12 || mesh.part[f] == 13)) continue   // outside decorations face away once the cover is flipped
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
            var gemEdge = false
            val pc = parts[mesh.part[f].coerceAtMost(parts.size - 1)]
            var col = if (lam < 0.5f) lerp(pc.shade, pc.base, lam / 0.5f) else lerp(pc.base, pc.glint, ((lam - 0.5f) / 0.5f) * 0.55f)
            if (pc.iridescent) { val hue = ((nx * 0.5f + ny * 0.35f + t * 0.12f + traits.model * 0.07f) % 1f + 1f) % 1f * 360f; col = lerp(col, Color.hsv(hue, 0.55f, 1f), 0.55f) }
            // sky-ground environment tint on shiny stuff
            // chrome-like environment reflection: sky above, dark ground, bright horizon line
            val ry = (-2f * nz * ny).coerceIn(-1f, 1f)
            val sky = lerp(pc.base, Color.White, 0.30f); val env = if (ry > 0f) lerp(sky, pc.base, (1f - ry)) else lerp(pc.shade, Color.Black, (0.35f + (-ry).coerceIn(0f, 1f) * 0.45f))
            val horizon = (1f - abs(ry * 3f)).coerceIn(0f, 1f)
            col = lerp(col, lerp(env, Color.White, horizon * 0.55f), 0.34f * mat.shine)
            if (mesh.part[f] == 3) {
                // glass gem: every facet mirrors the environment differently -> deep sapphire shadows, icy / white / lavender lights
                val ry3 = -2f * nz * ny; val rx3 = -2f * nz * nx
                val hsh = (((f * 2654435761L) ushr 8) and 0xff) / 255f
                val band = (sin(ry3 * 7f + rx3 * 5f + hsh * 6.283f + t * 0.7f) * 0.5f + 0.5f)
                val br = ((0.10f + 0.90f * band.pow(1.8f)) * (0.55f + 0.45f * lam)).coerceIn(0f, 1f)
                val tint = GemTints[(hsh * 5.99f).toInt().coerceIn(0, 5)]
                var gc = lerp(Color(0xFF2B3F9E), tint, br)
                gc = lerp(gc, Color.White, (spec * 1.2f + (if (hsh > 0.86f && band > 0.62f) 0.5f else 0f)).coerceIn(0f, 0.97f))
                col = gc
                gemEdge = true
            } else if (mesh.part[f] in SoftParts) {
                // plush: soft wrap lighting, no specular, a little fuzz per patch and a warm rim
                val fuzz = ((((f * 2246822519L) ushr 9) and 0xff) / 255f - 0.5f) * 0.10f
                val w = (diff * 0.5f + 0.5f).coerceIn(0f, 1f)
                var pcCol = lerp(pc.shade, pc.base, (0.30f + 0.70f * w.pow(0.85f) + fuzz).coerceIn(0f, 1f))
                pcCol = lerp(pcCol, pc.glint, (rim * 0.9f + (w - 0.7f).coerceAtLeast(0f) * 0.35f).coerceIn(0f, 0.5f))
                col = pcCol
            } else if (mesh.part[f] == 2 || mesh.part[f] == 12) {
                // polished gold: bright and dark reflection bands like a real mirror finish
                val ry2 = -2f * nz * ny; val rx2 = -2f * nz * nx
                val m = sin(ry2 * 4.5f + rx2 * 2.2f + 0.6f) * 0.5f + 0.5f
                var gc = lerp(Color(0xFF7A4A06), Color(0xFFFFF0B0), ((0.10f + 0.90f * m.pow(1.15f)) * (0.55f + 0.45f * lam)).coerceIn(0f, 1f))
                gc = lerp(gc, Color(0xFFF2B61F), 0.30f)
                col = lerp(gc, Color.White, (spec * 0.8f).coerceIn(0f, 0.8f))            } else
            col = lerp(col, Color.White, (spec * 0.85f + rim * 0.35f).coerceIn(0f, 0.9f))
            path.reset()
            path.moveTo(sx[fi[0]], sy[fi[0]])
            for (k in 1 until fi.size) path.lineTo(sx[fi[k]], sy[fi[k]])
            path.close()
            drawPath(path, col)
            drawPath(path, if (gemEdge) Color.White.copy(alpha = 0.40f) else col, style = Stroke(width = if (gemEdge) 1.1f else 0.9f))
        }
        // handwriting on the opened notebook
        if (isNb && open > 0.88f) {
            val fade = ((open - 0.88f) / 0.12f).coerceIn(0f, 1f)
            drawPage(sx, sy, mesh.leftPage!!, pages.first, 1f, false, fade)
            drawPage(sx, sy, mesh.rightPage!!, pages.second, ink, ink > 0.001f && ink < 0.999f, fade)
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

private val GemTints = arrayOf(Color(0xFF9FD8FF), Color(0xFFEAF6FF), Color(0xFFBFA8FF), Color(0xFF7FE8FF), Color(0xFFFFFFFF), Color(0xFFD7C6FF))

private class PartColors(val base: Color, val shade: Color, val glint: Color, val iridescent: Boolean)

private fun partColors(t: Traits): List<PartColors> {
    val m = t.materialInfo
    val main = PartColors(Color(m.base), Color(m.shade), Color(m.glint), m.iridescent)
    // accent parts use a contrasting complementary tone so ribbons / gems read as separate pieces
    val alt = GiftCatalog.materials[(t.material + 3) % GiftCatalog.materials.size]
    val a1 = PartColors(Color(alt.base), Color(alt.shade), Color(alt.glint), alt.iridescent)
    val gold = GiftCatalog.materials[0]
    val a2 = PartColors(Color(gold.base), Color(gold.shade), Color(gold.glint), false)
    val diamond = PartColors(Color(0xFFBFE4FF), Color(0xFF0E1B45), Color(0xFFFFFFFF), true)   // icy glass with spectral fire
    // plush: fur colour chosen by the seed; light fur, glossy dark and a contrasting ribbon
    val furs = listOf(0xFFD9A066, 0xFFFFE3C4, 0xFFFFA9C4, 0xFFC7B2F2, 0xFF9FE0C0, 0xFF9CCBFF)
    val fur = furs[(t.backdrop + t.pattern) % furs.size]
    fun soft(c: Long) = PartColors(Color(c), Color(c).let { lerp(it, Color(0xFF3B2412), 0.5f) }, Color(c).let { lerp(it, Color.White, 0.45f) }, false)
    val ribbons = listOf(0xFFE5384F, 0xFF3B7BFF, 0xFFFFC21F, 0xFF2BBE7E, 0xFFA855F7)
    val base8 = listOf(main, a1, a2, diamond, soft(fur), soft(0xFFFFF3E2), PartColors(Color(0xFF2A1A1A), Color(0xFF0A0505), Color(0xFFB9A0A0), false), soft(ribbons[(t.material + t.symbol) % ribbons.size]))
    val md = GiftCatalog.models.getOrNull(t.model)
    if (md == null || !md.notebook) return base8 + listOf(main, main, main, main, a2, main)
    val kind = t.model - 20; val v = (t.backdrop + t.pattern) % 3
    val covers = listOf(
        listOf(0xFF7A4423, 0xFF3F2A1E, 0xFF8E1F2D), listOf(0xFF2FB5A6, 0xFFFF7A59, 0xFF6C7BFF), listOf(0xFF2F6FDB, 0xFF2BA36B, 0xFFE24C4C),
        listOf(0xFF1B1B1F, 0xFF3A3A40, 0xFF5A4636), listOf(0xFFFF7BAE, 0xFFC77DFF, 0xFFFF9AA2))
    val accents = listOf(0xFFB3202E, 0xFFFFF1C9, 0xFFFFFFFF, 0xFFFF8A1F, 0xFFE5384F)
    val cover = soft(covers[kind.coerceIn(0, 4)][v]); val paper = soft(0xFFFFF6E3); val accent = soft(accents[kind.coerceIn(0, 4)])
    // index = part id: 4 cover, 5 paper, 7 accent, 8 hinged cover, 9 hinged inner paper, 10 -, 11 page edges, 12 hinged gold, 13 hinged accent
    return listOf(main, a1, a2, diamond, cover, paper, base8[6], accent, cover, paper, paper, soft(0xFFE3D3B0), a2, accent)
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

private val SoftParts = setOf(4, 5, 7, 8, 9, 10, 11, 13)

private val PHRASES = listOf("Every message finds its way.", "Written in orbit.", "Stay close, even when far away.", "Small notes, big stories.", "No server. No limits.", "You are not alone out here.", "Dream loud.", "Keep orbiting.", "Today was a good day.", "Remember this moment.")

/** Left page = something written long ago, right page = what the pen writes now (the sender's note if there is one). */
internal fun notebookTexts(g: Gift): Pair<String, String> {
    val h = g.seed.hashCode()
    val left = PHRASES[Math.floorMod(h, PHRASES.size)] + "\n" + PHRASES[Math.floorMod(h ushr 7, PHRASES.size)]
    val note = g.message.trim().take(160)
    val right = (if (note.isNotEmpty()) note else PHRASES[Math.floorMod(h ushr 3, PHRASES.size)]) + "\n— " + g.issuerName.ifBlank { "Orbit" }.take(18) + ", #" + g.serial
    return left to right
}

private const val PW = 320f
private const val PH = 404f

/** Draws handwriting (and the pen) on a page rectangle; orthographic projection => the page is an exact affine image of this local frame. */
private fun DrawScope.drawPage(sx: FloatArray, sy: FloatArray, q: IntArray, text: String, progress: Float, showPen: Boolean, alpha: Float) {
    val mt = android.graphics.Matrix()
    mt.setPolyToPoly(floatArrayOf(0f, 0f, PW, 0f, 0f, PH), 0, floatArrayOf(sx[q[0]], sy[q[0]], sx[q[1]], sy[q[1]], sx[q[2]], sy[q[2]]), 0, 3)
    val cv = drawContext.canvas.nativeCanvas
    cv.save(); cv.concat(mt)
    val a = (alpha * 255).toInt()
    val line = android.graphics.Paint().apply { color = android.graphics.Color.argb((a * 0.35f).toInt(), 80, 120, 214); strokeWidth = 1.4f; isAntiAlias = true }
    for (i in 0..9) cv.drawLine(24f, 72f + i * 36f, PW - 20f, 72f + i * 36f, line)
    line.color = android.graphics.Color.argb((a * 0.35f).toInt(), 226, 76, 76); cv.drawLine(36f, 20f, 36f, PH - 14f, line)
    val ink = android.graphics.Paint().apply {
        color = android.graphics.Color.argb(a, 27, 42, 107); textSize = 30f; isAntiAlias = true; textSkewX = -0.22f
        typeface = android.graphics.Typeface.create("cursive", android.graphics.Typeface.NORMAL)
    }
    // word-wrap to the page width
    val lines = ArrayList<String>()
    for (para in text.split("\n")) { var cur = ""; for (w in para.split(" ")) { val tryLine = if (cur.isEmpty()) w else "$cur $w"; if (ink.measureText(tryLine) > PW - 64f && cur.isNotEmpty()) { lines.add(cur); cur = w } else cur = tryLine }; lines.add(cur) }
    val total = lines.sumOf { it.length }; var left = (total * progress.coerceIn(0f, 1f)).toInt()
    var penX = 44f; var penY = 66f
    for ((i, l) in lines.withIndex()) {
        if (left <= 0 && i > 0) break
        val shown = l.take(left.coerceAtLeast(0)); left -= l.length
        val by = 66f + i * 36f
        cv.drawText(shown, 44f, by, ink)
        penX = 44f + ink.measureText(shown); penY = by
        if (left < 0) break
    }
    if (showPen) {
        cv.save(); cv.translate(penX + 2f, penY + 4f); cv.rotate(34f)
        val fill = android.graphics.Paint().apply { isAntiAlias = true; style = android.graphics.Paint.Style.FILL }
        fill.color = android.graphics.Color.argb((a * 0.22f).toInt(), 0, 0, 0); cv.drawRoundRect(-6f, -196f, 16f, -2f, 10f, 10f, fill)      // soft shadow
        fill.color = android.graphics.Color.argb(a, 214, 170, 60); val nib = android.graphics.Path().apply { moveTo(0f, 0f); lineTo(-7f, -24f); lineTo(7f, -24f); close() }; cv.drawPath(nib, fill)   // gold nib
        fill.color = android.graphics.Color.argb(a, 28, 28, 40); cv.drawRect(-8f, -62f, 8f, -24f, fill)                                          // grip
        fill.color = android.graphics.Color.argb(a, 24, 52, 140); cv.drawRoundRect(-10f, -196f, 10f, -60f, 8f, 8f, fill)                        // barrel
        fill.color = android.graphics.Color.argb(a, 255, 255, 255); cv.drawRect(-3f, -190f, -1f, -70f, fill)                                     // highlight
        fill.color = android.graphics.Color.argb(a, 214, 170, 60); cv.drawRect(-10f, -150f, 10f, -142f, fill)                                    // gold ring
        cv.restore()
    }
    cv.restore()
}
