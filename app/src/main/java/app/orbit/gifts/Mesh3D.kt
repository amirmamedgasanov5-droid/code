package app.orbit.gifts

import kotlin.math.*

/** Tiny indexed polygon mesh. `part` lets one model mix materials (ribbon vs box, gem vs ring). */
class Mesh3D(val v: FloatArray, val faces: List<IntArray>, val part: IntArray, val smooth: Boolean) {
    val faceCount get() = faces.size
    /** Per-vertex normals (object space, outward) used for smooth-shaded models. */
    val vn: FloatArray by lazy {
        val n = FloatArray(v.size)
        var cx = 0f; var cy = 0f; var cz = 0f; val vc = v.size / 3
        for (i in 0 until vc) { cx += v[i * 3]; cy += v[i * 3 + 1]; cz += v[i * 3 + 2] }
        cx /= vc; cy /= vc; cz /= vc
        for (f in faces) {
            val a = f[0]; val b = f[1]; val c = f[2]
            val ux = v[b * 3] - v[a * 3]; val uy = v[b * 3 + 1] - v[a * 3 + 1]; val uz = v[b * 3 + 2] - v[a * 3 + 2]
            val wx = v[c * 3] - v[a * 3]; val wy = v[c * 3 + 1] - v[a * 3 + 1]; val wz = v[c * 3 + 2] - v[a * 3 + 2]
            var nx = uy * wz - uz * wy; var ny = uz * wx - ux * wz; var nz = ux * wy - uy * wx
            var mx = 0f; var my = 0f; var mz = 0f
            for (k in f) { mx += v[k * 3]; my += v[k * 3 + 1]; mz += v[k * 3 + 2] }
            mx = mx / f.size - cx; my = my / f.size - cy; mz = mz / f.size - cz
            if (nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz }
            for (k in f) { n[k * 3] += nx; n[k * 3 + 1] += ny; n[k * 3 + 2] += nz }
        }
        for (i in 0 until vc) { val l = kotlin.math.sqrt(n[i * 3] * n[i * 3] + n[i * 3 + 1] * n[i * 3 + 1] + n[i * 3 + 2] * n[i * 3 + 2]).coerceAtLeast(1e-6f); n[i * 3] /= l; n[i * 3 + 1] /= l; n[i * 3 + 2] /= l }
        n
    }
}

class MeshBuilder {
    val verts = ArrayList<Float>(); val faces = ArrayList<IntArray>(); val parts = ArrayList<Int>()
    fun vert(x: Float, y: Float, z: Float): Int { verts.add(x); verts.add(y); verts.add(z); return verts.size / 3 - 1 }
    fun face(part: Int, vararg i: Int) { faces.add(i); parts.add(part) }
    fun faceL(part: Int, i: List<Int>) { faces.add(i.toIntArray()); parts.add(part) }
    fun build(smooth: Boolean = false) = Mesh3D(verts.toFloatArray(), faces, parts.toIntArray(), smooth)

    /** Surface of revolution from a (radius, y) profile. */
    fun lathe(profile: List<Pair<Float, Float>>, seg: Int, part: Int = 0, ox: Float = 0f, oy: Float = 0f, scale: Float = 1f, capTop: Boolean = true, capBottom: Boolean = true) {
        val rings = profile.map { (r, y) -> (0 until seg).map { s -> val a = (s.toFloat() / seg) * 2f * PI.toFloat(); vert(ox + cos(a) * r * scale, oy + y * scale, sin(a) * r * scale) } }
        for (k in 0 until rings.size - 1) for (s in 0 until seg) {
            val s2 = (s + 1) % seg
            if (profile[k].first < 1e-4f) face(part, rings[k][s], rings[k + 1][s], rings[k + 1][s2])
            else if (profile[k + 1].first < 1e-4f) face(part, rings[k][s], rings[k + 1][s], rings[k][s2])
            else face(part, rings[k][s], rings[k + 1][s], rings[k + 1][s2], rings[k][s2])
        }
        if (capTop && profile.last().first > 1e-4f) faceL(part, rings.last().reversed())
        if (capBottom && profile.first().first > 1e-4f) faceL(part, rings.first())
    }

    fun box(cx: Float, cy: Float, cz: Float, hx: Float, hy: Float, hz: Float, part: Int) {
        val p = IntArray(8) { vert(cx + (if (it and 1 != 0) hx else -hx), cy + (if (it and 2 != 0) hy else -hy), cz + (if (it and 4 != 0) hz else -hz)) }
        face(part, p[0], p[1], p[3], p[2]); face(part, p[4], p[6], p[7], p[5])
        face(part, p[0], p[2], p[6], p[4]); face(part, p[1], p[5], p[7], p[3])
        face(part, p[2], p[3], p[7], p[6]); face(part, p[0], p[4], p[5], p[1])
    }
}

object Models {
    private val cache = HashMap<Int, Mesh3D>()
    fun get(model: Int): Mesh3D = synchronized(cache) { cache.getOrPut(model) { build(model) } }

    private fun build(model: Int): Mesh3D = MeshBuilder().apply {
        when (model) {
            0 -> brilliant(); 1 -> present(); 2 -> orb(); 3 -> halo(); 4 -> obelisk()
            5 -> nova(); 6 -> heart(); 7 -> elixir(); 8 -> chalice(); 9 -> bell()
            10 -> crown(); 11 -> rocket(); else -> megaDiamond()
        }
    }.build(smooth = model in setOf(3, 6, 7, 8, 9, 11))

    private fun MeshBuilder.brilliant() {
        val n = 16
        fun ring(r: Float, y: Float, off: Float = 0f) = (0 until n).map { val a = (it + off) / n * 2 * PI.toFloat(); vert(cos(a) * r, y, sin(a) * r) }
        val table = ring(0.5f, 0.62f); val star = ring(0.82f, 0.45f, 0.5f); val girdle = ring(1.0f, 0.22f); val bottom = vert(0f, -1.05f, 0f)
        val tc = vert(0f, 0.62f, 0f)
        for (i in 0 until n) { val j = (i + 1) % n; face(0, tc, table[j], table[i]) }
        for (i in 0 until n) { val j = (i + 1) % n
            face(1, table[i], table[j], star[i]); face(1, table[j], star[j], star[i])
            face(0, star[i], star[j], girdle[j], girdle[i]) }
        val mid = ring(0.62f, -0.35f, 0.5f)
        for (i in 0 until n) { val j = (i + 1) % n
            face(2, girdle[i], girdle[j], mid[i]); face(2, girdle[j], mid[j], mid[i])
            face(1, mid[i], mid[j], bottom) }
    }

    private fun MeshBuilder.present() {
        box(0f, -0.1f, 0f, 0.8f, 0.7f, 0.8f, 0)
        box(0f, 0.72f, 0f, 0.86f, 0.14f, 0.86f, 0)
        box(0f, -0.1f, 0f, 0.1f, 0.84f, 0.84f, 1)
        box(0f, -0.1f, 0f, 0.84f, 0.84f, 0.1f, 1)
        box(0f, 0.78f, 0f, 0.12f, 0.1f, 0.9f, 1); box(0f, 0.78f, 0f, 0.9f, 0.1f, 0.12f, 1)
        // bow: two loops
        val loop = listOf(0f to 0f, 0.2f to 0.1f, 0.34f to 0.3f, 0.3f to 0.5f, 0.16f to 0.6f, 0f to 0.6f)
        lathe(loop.map { it.first to it.second }, 10, 1, -0.32f, 0.9f, 1f, capTop = true, capBottom = false)
        lathe(loop.map { it.first to it.second }, 10, 1, 0.32f, 0.9f, 1f, capTop = true, capBottom = false)
        lathe(listOf(0f to 0f, 0.14f to 0.04f, 0.14f to 0.2f, 0f to 0.24f), 10, 1, 0f, 0.84f, 1f)
    }

    private fun MeshBuilder.orb() {
        // icosphere, subdivided twice
        val t = (1f + sqrt(5f)) / 2f
        var vs = mutableListOf(floatArrayOf(-1f, t, 0f), floatArrayOf(1f, t, 0f), floatArrayOf(-1f, -t, 0f), floatArrayOf(1f, -t, 0f), floatArrayOf(0f, -1f, t), floatArrayOf(0f, 1f, t), floatArrayOf(0f, -1f, -t), floatArrayOf(0f, 1f, -t), floatArrayOf(t, 0f, -1f), floatArrayOf(t, 0f, 1f), floatArrayOf(-t, 0f, -1f), floatArrayOf(-t, 0f, 1f))
        vs = vs.map { val l = sqrt(it[0] * it[0] + it[1] * it[1] + it[2] * it[2]); floatArrayOf(it[0] / l, it[1] / l, it[2] / l) }.toMutableList()
        var tris = listOf(intArrayOf(0, 11, 5), intArrayOf(0, 5, 1), intArrayOf(0, 1, 7), intArrayOf(0, 7, 10), intArrayOf(0, 10, 11), intArrayOf(1, 5, 9), intArrayOf(5, 11, 4), intArrayOf(11, 10, 2), intArrayOf(10, 7, 6), intArrayOf(7, 1, 8),
            intArrayOf(3, 9, 4), intArrayOf(3, 4, 2), intArrayOf(3, 2, 6), intArrayOf(3, 6, 8), intArrayOf(3, 8, 9), intArrayOf(4, 9, 5), intArrayOf(2, 4, 11), intArrayOf(6, 2, 10), intArrayOf(8, 6, 7), intArrayOf(9, 8, 1))
        repeat(2) {
            val mid = HashMap<Long, Int>(); val out = ArrayList<IntArray>()
            fun m(a: Int, b: Int): Int = mid.getOrPut(minOf(a, b).toLong() * 100000 + maxOf(a, b)) {
                val x = vs[a][0] + vs[b][0]; val y = vs[a][1] + vs[b][1]; val z = vs[a][2] + vs[b][2]; val l = sqrt(x * x + y * y + z * z)
                vs.add(floatArrayOf(x / l, y / l, z / l)); vs.size - 1 }
            for (f in tris) { val a = m(f[0], f[1]); val b = m(f[1], f[2]); val c = m(f[2], f[0]); out += intArrayOf(f[0], a, c); out += intArrayOf(f[1], b, a); out += intArrayOf(f[2], c, b); out += intArrayOf(a, b, c) }
            tris = out
        }
        val idx = vs.map { vert(it[0] * 0.95f, it[1] * 0.95f, it[2] * 0.95f) }
        for ((k, f) in tris.withIndex()) face(if (k % 4 == 3) 1 else 0, idx[f[0]], idx[f[2]], idx[f[1]])
        // orbit ring
        val rseg = 40; val rr = 1.35f
        for (i in 0 until rseg) { val a0 = i.toFloat() / rseg * 2 * PI.toFloat(); val a1 = (i + 1).toFloat() / rseg * 2 * PI.toFloat()
            val p = { a: Float, dy: Float, dr: Float -> vert(cos(a) * (rr + dr), dy + sin(a) * 0.35f * 0f, sin(a) * (rr + dr)) }
            val a = p(a0, 0.04f, 0f); val b = p(a1, 0.04f, 0f); val c = p(a1, -0.04f, 0f); val d = p(a0, -0.04f, 0f)
            val a2 = p(a0, 0.04f, 0.1f); val b2 = p(a1, 0.04f, 0.1f); val c2 = p(a1, -0.04f, 0.1f); val d2 = p(a0, -0.04f, 0.1f)
            face(2, a, b, b2, a2); face(2, d2, c2, c, d); face(2, a2, b2, c2, d2); face(2, d, c, b, a)
        }
    }

    private fun MeshBuilder.halo() {
        val major = 0.82f; val minor = 0.27f; val U = 40; val V = 16
        val g = Array(U) { i -> IntArray(V) { j ->
            val u = i.toFloat() / U * 2 * PI.toFloat(); val w = j.toFloat() / V * 2 * PI.toFloat()
            val r = major + minor * cos(w)
            vert(cos(u) * r, sin(u) * r - 0.2f, minor * 0.95f * sin(w)) } }
        for (i in 0 until U) for (j in 0 until V) { val i2 = (i + 1) % U; val j2 = (j + 1) % V; face(0, g[i][j], g[i][j2], g[i2][j2], g[i2][j]) }
        // brilliant stone set on the band
        val cy = major + minor - 0.2f + 0.24f
        val top = vert(0f, cy + 0.34f, 0f); val bot = vert(0f, cy - 0.3f, 0f)
        val eq = (0 until 8).map { val a = it / 8f * 2 * PI.toFloat(); vert(cos(a) * 0.36f, cy, sin(a) * 0.36f) }
        val tbl = (0 until 8).map { val a = (it + 0.5f) / 8f * 2 * PI.toFloat(); vert(cos(a) * 0.2f, cy + 0.22f, sin(a) * 0.2f) }
        for (i in 0 until 8) { val j = (i + 1) % 8
            face(1, eq[i], eq[j], tbl[i]); face(1, tbl[i], eq[j], tbl[j].let { tbl[(i + 1) % 8] })
            face(1, top, tbl[i], tbl[(i + 1) % 8]); face(0, bot, eq[j], eq[i]) }
    }

    private fun MeshBuilder.obelisk() {
        fun crystal(cx: Float, cz: Float, h: Float, r: Float, tilt: Float, part: Int) {
            val n = 6
            val base = (0 until n).map { val a = it.toFloat() / n * 2 * PI.toFloat(); vert(cx + cos(a) * r + tilt * 0.2f, -0.95f, cz + sin(a) * r) }
            val mid = (0 until n).map { val a = it.toFloat() / n * 2 * PI.toFloat(); vert(cx + cos(a) * r * 0.9f + tilt * 0.55f * h, -0.95f + h * 0.75f, cz + sin(a) * r * 0.9f) }
            val tip = vert(cx + tilt * h * 0.7f, -0.95f + h, cz)
            for (i in 0 until n) { val j = (i + 1) % n; face(part, base[i], base[j], mid[j], mid[i]); face(part, mid[i], mid[j], tip) }
            faceL(part, base.reversed())
        }
        crystal(0f, 0f, 2.1f, 0.5f, 0f, 0)
        crystal(-0.55f, 0.15f, 1.3f, 0.28f, -0.35f, 1)
        crystal(0.5f, -0.2f, 1.1f, 0.25f, 0.4f, 1)
        crystal(0.15f, 0.55f, 0.8f, 0.2f, 0.1f, 2)
    }

    private fun MeshBuilder.nova() {
        val pts = (0 until 10).map { val a = (it.toFloat() / 10) * 2 * PI.toFloat() - PI.toFloat() / 2; val r = if (it % 2 == 0) 1.15f else 0.5f; r * cos(a) to -r * sin(a) }
        val d = 0.32f
        val front = vert(0f, 0f, -d); val back = vert(0f, 0f, d)
        val f = pts.map { vert(it.first, it.second, 0f) }
        for (i in 0 until 10) { val j = (i + 1) % 10
            val part = if (i % 2 == 0) 0 else 1
            face(part, front, f[i], f[j]); face(if (i % 2 == 0) 1 else 0, back, f[j], f[i]) }
    }

    private fun MeshBuilder.heart() {
        val T = 36; val K = 9
        fun hx(t: Float) = 16f * sin(t).pow(3) / 17f
        fun hy(t: Float) = (13f * cos(t) - 5f * cos(2 * t) - 2f * cos(3 * t) - cos(4 * t)) / 17f + 0.05f
        val rings = (0..K).map { k ->
            val phi = (k.toFloat() / K - 0.5f) * PI.toFloat()
            val s = cos(phi); val z = sin(phi) * 0.55f
            (0 until T).map { i -> val t = i.toFloat() / T * 2 * PI.toFloat(); vert(hx(t) * s * 1.1f, hy(t) * s * 1.1f - 0.05f, z + 0f * t) }
        }
        for (k in 0 until K) for (i in 0 until T) { val j = (i + 1) % T; face(0, rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]) }
    }

    private fun MeshBuilder.elixir() {
        val body = listOf(0f to -1.0f, 0.55f to -0.98f, 0.85f to -0.8f, 0.98f to -0.45f, 0.95f to -0.05f, 0.78f to 0.3f, 0.4f to 0.5f, 0.24f to 0.62f, 0.22f to 1.0f, 0.3f to 1.08f)
        lathe(body, 20, 0, capTop = false)
        lathe(listOf(0.3f to 1.08f, 0.2f to 1.14f, 0.2f to 1.5f, 0f to 1.54f), 14, 2, capBottom = false)
        // liquid surface
        lathe(listOf(0f to -0.2f, 0.92f to -0.2f).map { it.first * 0.92f to it.second }, 20, 1, capBottom = false)
    }

    private fun MeshBuilder.chalice() {
        val prof = listOf(0f to -1.1f, 0.7f to -1.1f, 0.72f to -0.98f, 0.35f to -0.88f, 0.14f to -0.6f, 0.12f to -0.1f, 0.3f to 0.0f, 0.62f to 0.2f, 0.95f to 0.6f, 1.02f to 1.15f, 0.92f to 1.15f, 0.86f to 0.62f, 0.52f to 0.25f, 0f to 0.15f)
        lathe(prof, 24, 0, capTop = false)
        val ring = listOf(0.25f to -0.38f, 0.3f to -0.3f, 0.3f to -0.22f, 0.25f to -0.14f)
        lathe(ring, 16, 1)
    }

    private fun MeshBuilder.crown() {
        lathe(listOf(0.86f to -0.6f, 0.98f to -0.6f, 0.98f to 0.0f, 0.86f to 0.0f), 20, 0, capTop = false, capBottom = false)
        lathe(listOf(0.86f to 0.0f, 0.98f to 0.0f, 0.98f to -0.6f, 0.86f to -0.6f), 20, 0, capTop = false, capBottom = false)
        for (i in 0 until 5) {
            val a = i / 5f * 2 * PI.toFloat(); val ca = cos(a); val sa = sin(a); val tx = -sa * 0.2f; val tz = ca * 0.2f
            val b1 = vert(ca * 0.98f + tx, 0f, sa * 0.98f + tz); val b2 = vert(ca * 0.98f - tx, 0f, sa * 0.98f - tz)
            val b3 = vert(ca * 0.86f - tx, 0f, sa * 0.86f - tz); val b4 = vert(ca * 0.86f + tx, 0f, sa * 0.86f + tz)
            val tip = vert(ca * 1.05f, 0.85f, sa * 1.05f)
            face(0, b1, b2, tip); face(0, b2, b3, tip); face(0, b3, b4, tip); face(0, b4, b1, tip)
            box(ca * 1.05f, 0.9f, sa * 1.05f, 0.09f, 0.09f, 0.09f, 1)
            box(ca * 0.99f, -0.3f, sa * 0.99f, 0.07f, 0.12f, 0.07f, 1)
        }
    }

    private fun MeshBuilder.rocket() {
        lathe(listOf(0f to -1.0f, 0.35f to -0.95f, 0.55f to -0.6f, 0.58f to 0.2f, 0.45f to 0.7f, 0.22f to 1.1f, 0f to 1.35f), 24, 0, capBottom = false)
        lathe(listOf(0.25f to -1.0f, 0.3f to -1.2f, 0.18f to -1.35f), 16, 2, capTop = false)
        box(0f, -0.7f, 0f, 0.92f, 0.34f, 0.05f, 1); box(0f, -0.7f, 0f, 0.05f, 0.34f, 0.92f, 1)
        lathe(listOf(0f to 0.25f, 0.2f to 0.28f, 0.2f to 0.55f, 0f to 0.58f), 16, 1, ox = 0f, oy = 0f, scale = 1f, capTop = true, capBottom = false)
    }

    private fun MeshBuilder.megaDiamond() {
        brilliant()
        lathe(listOf(0f to -1.5f, 0.7f to -1.5f, 0.75f to -1.38f, 0.3f to -1.3f, 0f to -1.3f), 24, 2, capBottom = false)
    }

    private fun MeshBuilder.bell() {
        val prof = listOf(0f to 1.35f, 0.14f to 1.32f, 0.16f to 1.2f, 0.34f to 1.05f, 0.6f to 0.7f, 0.76f to 0.1f, 0.88f to -0.55f, 1.0f to -0.85f, 1.1f to -0.9f, 1.05f to -0.98f, 0.85f to -0.95f, 0.7f to -0.5f, 0.55f to 0.1f, 0.35f to 0.75f, 0.1f to 1.0f)
        lathe(prof, 24, 0, capTop = false)
        lathe(listOf(0f to -1.0f, 0.2f to -0.98f, 0.28f to -1.15f, 0.2f to -1.3f, 0f to -1.32f), 12, 1, capTop = false)
    }
}
