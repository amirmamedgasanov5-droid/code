package app.orbit.gifts

import kotlin.math.*

/** Tiny indexed polygon mesh. `part` lets one model mix materials (ribbon vs box, gem vs ring). */
class Mesh3D(val v: FloatArray, val faces: List<IntArray>, val part: IntArray, val smooth: Boolean, private val cvn: FloatArray? = null) {
    val faceCount get() = faces.size
    /** Per-vertex normals (object space, outward) used for smooth-shaded models. */
    val vn: FloatArray by lazy {
        if (cvn != null) return@lazy cvn
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
    val verts = ArrayList<Float>(); val faces = ArrayList<IntArray>(); val parts = ArrayList<Int>(); val norms = ArrayList<Float>(); var customNormals = false
    fun vert(x: Float, y: Float, z: Float): Int { verts.add(x); verts.add(y); verts.add(z); norms.add(0f); norms.add(0f); norms.add(0f); return verts.size / 3 - 1 }
    /** vertex with an analytic normal (for smooth organic shapes) */
    fun vertN(x: Float, y: Float, z: Float, nx: Float, ny: Float, nz: Float): Int { val i = vert(x, y, z); customNormals = true; norms[i * 3] = nx; norms[i * 3 + 1] = ny; norms[i * 3 + 2] = nz; return i }
    fun ellipsoid(cx: Float, cy: Float, cz: Float, rx: Float, ry: Float, rz: Float, part: Int, seg: Int = 16, rings: Int = 10, partAt: ((Float, Float, Float) -> Int)? = null) {
        val g = Array(rings + 1) { i -> val a = -PI.toFloat() / 2 + i.toFloat() / rings * PI.toFloat(); val c = cos(a); val sn = sin(a)
            IntArray(seg) { k -> val b = k.toFloat() / seg * 2 * PI.toFloat(); val ux = c * cos(b); val uz = c * sin(b); val uy = sn
                val nx = ux / rx; val ny = uy / ry; val nz = uz / rz; val l = sqrt(nx * nx + ny * ny + nz * nz).coerceAtLeast(1e-5f)
                vertN(cx + ux * rx, cy + uy * ry, cz + uz * rz, nx / l, ny / l, nz / l) } }
        for (i in 0 until rings) for (k in 0 until seg) {
            val k2 = (k + 1) % seg; val ids = intArrayOf(g[i][k], g[i + 1][k], g[i + 1][k2], g[i][k2])
            var p = part
            if (partAt != null) { var mx = 0f; var my = 0f; var mz = 0f; for (id in ids) { mx += verts[id * 3]; my += verts[id * 3 + 1]; mz += verts[id * 3 + 2] }; p = partAt(mx / 4, my / 4, mz / 4) }
            face(p, ids[0], ids[1], ids[2], ids[3])
        }
    }
    fun face(part: Int, vararg i: Int) { faces.add(i); parts.add(part) }
    fun faceL(part: Int, i: List<Int>) { faces.add(i.toIntArray()); parts.add(part) }
    fun build(smooth: Boolean = false) = Mesh3D(verts.toFloatArray(), faces, parts.toIntArray(), smooth, if (customNormals) norms.toFloatArray() else null)

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
            10 -> crown(); 11 -> rocket(); 12 -> megaDiamond()
            13 -> diamondBrilliant(); 14 -> diamondEmerald(); 15 -> diamondRough()
            16 -> genesis(); 17 -> imperialCrown(); 18 -> faberge(); else -> teddy()
        }
    }.build(smooth = model in setOf(3, 6, 7, 8, 9, 11, 19))

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

    // ======================================================================== helpers
    private fun MeshBuilder.sphere(cx: Float, cy: Float, cz: Float, r: Float, seg: Int, part: Int) {
        val prof = (0..6).map { val a = -PI.toFloat() / 2 + it / 6f * PI.toFloat(); (cos(a) * r) to sin(a) * r }
        lathe(prof.map { maxOf(it.first, 0f) to it.second }, seg, part, cx, cy, 1f, capTop = false, capBottom = false)
        // lathe() builds around the Y axis at the origin; shift is handled by ox/oy, z-shift applied below
        if (cz != 0f) { for (i in verts.size - ((prof.size) * seg * 3) until verts.size step 3) verts[i + 2] = verts[i + 2] + cz }
    }
    /** Swept tube along a polyline (gold arches, lattice bars, wires). */
    private fun MeshBuilder.tube(pts: List<Triple<Float, Float, Float>>, r: Float, seg: Int, part: Int) {
        val rings = ArrayList<List<Int>>()
        for (i in pts.indices) {
            val a = pts[maxOf(i - 1, 0)]; val b = pts[minOf(i + 1, pts.size - 1)]
            var tx = b.first - a.first; var ty = b.second - a.second; var tz = b.third - a.third
            val tl = sqrt(tx * tx + ty * ty + tz * tz).coerceAtLeast(1e-5f); tx /= tl; ty /= tl; tz /= tl
            // any vector not parallel to the tangent
            var ux = 0f; var uy = 1f; var uz = 0f; if (abs(ty) > 0.9f) { ux = 1f; uy = 0f }
            var nx = ty * uz - tz * uy; var ny = tz * ux - tx * uz; var nz = tx * uy - ty * ux
            val nl = sqrt(nx * nx + ny * ny + nz * nz).coerceAtLeast(1e-5f); nx /= nl; ny /= nl; nz /= nl
            val bx = ty * nz - tz * ny; val by = tz * nx - tx * nz; val bz = tx * ny - ty * nx
            rings.add((0 until seg).map { k -> val ang = k.toFloat() / seg * 2 * PI.toFloat(); val c = cos(ang) * r; val sn = sin(ang) * r
                vert(pts[i].first + nx * c + bx * sn, pts[i].second + ny * c + by * sn, pts[i].third + nz * c + bz * sn) })
        }
        for (i in 0 until rings.size - 1) for (k in 0 until seg) { val k2 = (k + 1) % seg; face(part, rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]) }
    }

    // ======================================================================== diamonds (part 3 = glass gem shading, part 2 = gold)
    /** Proper round brilliant: table, star, kite and girdle facets above; main and girdle facets below. */
    private fun MeshBuilder.brilliantCut(k: Float, oy: Float, part: Int = 3) {
        val n = 16
        fun ring(rad: Float, y: Float, off: Float = 0f) = (0 until n).map { val a = (it + off) / n * 2 * PI.toFloat(); vert(cos(a) * rad * k, y * k + oy, sin(a) * rad * k) }
        val table = ring(0.52f, 0.60f); val star = ring(0.78f, 0.50f, 0.5f); val upperGirdle = ring(0.93f, 0.36f); val girdleT = ring(1.0f, 0.22f); val girdleB = ring(1.0f, 0.16f)
        val lowerGirdle = ring(0.88f, 0.0f, 0.5f); val pav = ring(0.46f, -0.55f); val culet = vert(0f, -0.95f * k + oy, 0f); val tc = vert(0f, 0.60f * k + oy, 0f)
        for (i in 0 until n) { val j = (i + 1) % n
            face(part, tc, table[j], table[i])
            face(part, table[i], table[j], star[i]); face(part, table[j], star[j], star[i])                     // star facets
            face(part, star[i], star[j], upperGirdle[j], upperGirdle[i])                                        // kite
            face(part, upperGirdle[i], upperGirdle[j], girdleT[j], girdleT[i])
            face(part, girdleT[i], girdleT[j], girdleB[j], girdleB[i])                                          // girdle band
            face(part, girdleB[i], girdleB[j], lowerGirdle[i]); face(part, girdleB[j], lowerGirdle[j], lowerGirdle[i])
            face(part, lowerGirdle[i], lowerGirdle[j], pav[j], pav[i])
            face(part, pav[i], pav[j], culet)
        }
    }

    /** A: round brilliant floating over a small gold base ring with four prongs. */
    private fun MeshBuilder.diamondBrilliant() {
        brilliantCut(1.12f, 0.15f)
        lathe(listOf(0f to -1.45f, 0.8f to -1.45f, 0.85f to -1.38f, 0.5f to -1.28f, 0.14f to -1.2f, 0.14f to -0.95f), 28, 2, capTop = false, capBottom = false)
        for (i in 0 until 4) { val a = i / 4f * 2 * PI.toFloat() + PI.toFloat() / 4; val c = cos(a); val s = sin(a)
            tube(listOf(Triple(c * 0.2f, -0.95f, s * 0.2f), Triple(c * 0.7f, -0.55f, s * 0.7f), Triple(c * 1.02f, -0.12f, s * 1.02f), Triple(c * 1.1f, 0.12f, s * 1.1f)), 0.035f, 5, 2) }
    }

    /** B: emerald (step) cut with a gold bezel. */
    private fun MeshBuilder.diamondEmerald() {
        fun rect(w: Float, h: Float, y: Float, c: Float = 0.28f): List<Int> {       // octagon with cut corners
            val pts = listOf(-w + c to -h, w - c to -h, w to -h + c, w to h - c, w - c to h, -w + c to h, -w to h - c, -w to -h + c)
            return pts.map { vert(it.first, y, it.second) } }
        val levels = listOf(Triple(0.55f, 0.85f, 0.95f), Triple(0.72f, 1.1f, 0.78f), Triple(0.88f, 1.3f, 0.52f), Triple(0.98f, 1.42f, 0.12f)) // w, h, y (top to girdle)
        val rings = levels.map { (w, h, y) -> rect(w, h, y) }
        faceL(3, rings[0].reversed())
        for (l in 0 until rings.size - 1) for (i in 0 until 8) { val j = (i + 1) % 8; face(3, rings[l][i], rings[l][j], rings[l + 1][j], rings[l + 1][i]) }
        val gTop = rings.last(); val gBot = rect(0.98f, 1.42f, 0.02f)
        for (i in 0 until 8) { val j = (i + 1) % 8; face(3, gTop[i], gTop[j], gBot[j], gBot[i]) }
        var prev = gBot
        for ((w, h, y) in listOf(Triple(0.8f, 1.18f, -0.28f), Triple(0.56f, 0.9f, -0.58f), Triple(0.3f, 0.52f, -0.84f))) { val cur = rect(w, h, y, 0.2f); for (i in 0 until 8) { val j = (i + 1) % 8; face(3, prev[i], prev[j], cur[j], cur[i]) }; prev = cur }
        faceL(3, prev)
        // gold bezel around the girdle
        val g1 = rect(1.04f, 1.48f, 0.2f); val g2 = rect(1.04f, 1.48f, -0.08f)
        for (i in 0 until 8) { val j = (i + 1) % 8; face(2, g1[i], g1[j], g2[j], g2[i]) }
        lathe(listOf(0f to -1.5f, 0.7f to -1.5f, 0.76f to -1.42f, 0.3f to -1.3f, 0.1f to -1.2f, 0.1f to -0.95f), 24, 2, capTop = false)
    }

    /** C: rough octahedral crystal with chamfered corners, polished like glass. */
    private fun MeshBuilder.diamondRough() {
        val R = 1.25f; val c = 0.34f
        val raw = listOf(Triple(R, 0f, 0f), Triple(-R, 0f, 0f), Triple(0f, R * 1.1f, 0f), Triple(0f, -R * 1.1f, 0f), Triple(0f, 0f, R), Triple(0f, 0f, -R))
        // each of the 8 triangular faces is inset and chamfered toward its 3 corners
        val axes = listOf(0 to 2, 1 to 2, 0 to 3, 1 to 3)
        fun mid(a: Triple<Float, Float, Float>, b: Triple<Float, Float, Float>) = Triple(a.first * (1 - c) + b.first * c, a.second * (1 - c) + b.second * c, a.third * (1 - c) + b.third * c)
        val ids = HashMap<String, Int>()
        fun v(p: Triple<Float, Float, Float>) = ids.getOrPut("%.3f|%.3f|%.3f".format(p.first, p.second, p.third)) { vert(p.first, p.second, p.third) }
        val xs = listOf(0, 1); val ys = listOf(2, 3); val zs = listOf(4, 5)
        for (x in xs) for (y in ys) for (z in zs) {
            val a = raw[x]; val b = raw[y]; val d = raw[z]
            val ab = mid(a, b); val ba = mid(b, a); val bd = mid(b, d); val db = mid(d, b); val da = mid(d, a); val ad = mid(a, d)
            faceL(3, listOf(v(ab), v(ba), v(bd), v(db), v(da), v(ad)))                    // main hexagonal facet
            face(3, v(a), v(ab), v(ad)); face(3, v(b), v(bd), v(ba)); face(3, v(d), v(da), v(db)) // corner chamfers
        }
        lathe(listOf(0f to -1.6f, 0.8f to -1.6f, 0.86f to -1.52f, 0.4f to -1.42f, 0.12f to -1.34f, 0.12f to -1.28f), 24, 2, capTop = true, capBottom = false)
    }

    // ======================================================================== priceless showpieces
    /** A: brilliant diamond held inside three tilted armillary rings with orbiting stones, on a tiered gold pedestal. */
    private fun MeshBuilder.genesis() {
        brilliantCut(0.72f, 0.12f)
        val specs = listOf(Triple(1.02f, 0.2f, 0.0f), Triple(1.14f, 1.15f, 0.5f), Triple(1.26f, -0.95f, -0.6f))
        specs.forEachIndexed { k, (R, tx, tz) ->
            val U = 64; val V = 6; val r = 0.045f
            val cx = cos(tx); val sx = sin(tx); val cz = cos(tz); val sz = sin(tz)
            fun place(x0: Float, y0: Float, z0: Float): Triple<Float, Float, Float> { var x = x0; var y = y0; var z = z0
                val y1 = y * cx - z * sx; val z1 = y * sx + z * cx; y = y1; z = z1; val x2 = x * cz - y * sz; val y2 = x * sz + y * cz; x = x2; y = y2; return Triple(x, y, z) }
            tube((0..U).map { i -> val a = i.toFloat() / U * 2 * PI.toFloat(); place(cos(a) * R, 0f, sin(a) * R) }, r, V, 2)
            for (q in 0 until 3) { val a = q / 3f * 2 * PI.toFloat() + k * 0.9f; val p = place(cos(a) * R, 0f, sin(a) * R); sphere(p.first, p.second, p.third, 0.09f, 10, 3) }
        }
        lathe(listOf(0f to -1.62f, 0.78f to -1.62f, 0.82f to -1.55f, 0.82f to -1.47f, 0.62f to -1.42f, 0.5f to -1.3f, 0.2f to -1.22f, 0.16f to -1.0f, 0.3f to -0.9f, 0.3f to -0.86f, 0.12f to -0.82f), 36, 2, capBottom = false)
        lathe(listOf(0.5f to -1.3f, 0.55f to -1.28f, 0.55f to -1.24f, 0.5f to -1.22f), 36, 1, capTop = false, capBottom = false)
        for (i in 0 until 12) { val a = i / 12f * 2 * PI.toFloat(); sphere(cos(a) * 0.8f, -1.5f, sin(a) * 0.8f, 0.05f, 8, 3) }
    }

    /** B: imperial crown: jewelled band, eight sweeping arches, velvet dome, orb and cross. */
    private fun MeshBuilder.imperialCrown() {
        // velvet cap (part 1), gold band (part 2) with ermine-like lower rim (part 0)
        lathe(listOf(0.0f to 0.95f, 0.38f to 0.9f, 0.7f to 0.62f, 0.86f to 0.25f, 0.9f to 0.0f), 28, 0, capTop = false, capBottom = false)
        lathe(listOf(1.02f to -0.55f, 1.12f to -0.5f, 1.12f to -0.28f, 1.02f to -0.24f), 36, 1, capTop = false, capBottom = false)
        lathe(listOf(0.98f to -0.24f, 1.06f to -0.2f, 1.06f to 0.08f, 0.98f to 0.12f), 36, 2, capTop = false, capBottom = false)
        lathe(listOf(0.98f to 0.12f, 1.08f to 0.14f, 1.08f to 0.2f, 0.98f to 0.22f), 36, 2, capTop = false, capBottom = false)
        for (i in 0 until 8) {                                                                                       // arches
            val a = i / 8f * 2 * PI.toFloat(); val c = cos(a); val s = sin(a)
            val pts = (0..14).map { j -> val u = j / 14f; val rad = 1.02f * (1 - u) * (1 - u * 0.15f); val y = 0.18f + 1.05f * sin(u * PI.toFloat() / 2f).pow(0.8f); Triple(c * rad, y, s * rad) }
            tube(pts, 0.05f, 5, 2)
            sphere(c * 1.04f, 0.16f, s * 1.04f, 0.075f, 8, 2)
            // jewels on the band between arches
            val b = a + PI.toFloat() / 8f; sphere(cos(b) * 1.1f, -0.05f, sin(b) * 1.1f, 0.095f, 8, 3)
        }
        for (i in 0 until 16) { val a = i / 16f * 2 * PI.toFloat(); sphere(cos(a) * 1.13f, -0.39f, sin(a) * 1.13f, 0.045f, 6, 2) }   // pearls
        sphere(0f, 1.3f, 0f, 0.2f, 14, 2)                                                                            // orb
        box(0f, 1.66f, 0f, 0.05f, 0.2f, 0.05f, 2); box(0f, 1.74f, 0f, 0.15f, 0.05f, 0.05f, 2); sphere(0f, 1.95f, 0f, 0.07f, 8, 3)
    }

    /** C: Faberge-style egg: enamel body, gold lattice, gems at every crossing, jewelled crown on a stand. */
    private fun MeshBuilder.faberge() {
        fun egg(u: Float): Pair<Float, Float> { val a = u * PI.toFloat(); val y = -cos(a) * 1.25f + 0.1f; val r = sin(a) * (0.8f - 0.18f * (-cos(a))); return r to y }   // u 0..1 bottom..top
        val prof = (0..22).map { egg(it / 22f) }
        lathe(prof.map { maxOf(it.first, 0f) to it.second }, 36, 0, capTop = false, capBottom = false)                  // enamel body
        val mer = 10
        for (m in 0 until mer) { val a = m / mer.toFloat() * 2 * PI.toFloat(); val c = cos(a); val s = sin(a)
            tube((1..21).map { i -> val (r, y) = egg(i / 22f); Triple(c * (r + 0.025f), y, s * (r + 0.025f)) }, 0.03f, 4, 2) }
        for (lat in listOf(0.28f, 0.5f, 0.72f)) { val (r, y) = egg(lat); tube((0..36).map { i -> val a = i / 36f * 2 * PI.toFloat(); Triple(cos(a) * (r + 0.03f), y, sin(a) * (r + 0.03f)) }, 0.035f, 4, 2)
            for (m in 0 until mer) { val a = m / mer.toFloat() * 2 * PI.toFloat(); sphere(cos(a) * (r + 0.05f), y, sin(a) * (r + 0.05f), 0.065f, 8, 3) } }
        // stand
        lathe(listOf(0f to -1.5f, 0.7f to -1.5f, 0.74f to -1.42f, 0.7f to -1.36f, 0.4f to -1.3f, 0.3f to -1.18f, 0.55f to -1.1f, 0.5f to -1.05f), 32, 2, capBottom = false)
        for (i in 0 until 6) { val a = i / 6f * 2 * PI.toFloat() + 0.3f; tube(listOf(Triple(cos(a) * 0.55f, -1.05f, sin(a) * 0.55f), Triple(cos(a) * 0.62f, -0.95f, sin(a) * 0.62f), Triple(cos(a) * 0.5f, -0.8f, sin(a) * 0.5f)), 0.035f, 4, 2) }
        // finial: little crown and gem
        lathe(listOf(0.12f to 1.3f, 0.2f to 1.34f, 0.24f to 1.42f, 0.14f to 1.48f), 14, 2, capTop = true, capBottom = false)
        gemAt(0f, 1.68f, 0f, 0.16f, 3)
    }

    /** Plush teddy bear: all soft ellipsoids. Parts 4 = fur, 5 = light fur (muzzle, belly, ear insides, paw pads), 6 = glossy dark (eyes, nose), 7 = ribbon. */
    private fun MeshBuilder.teddy() {
        // body: the light belly is painted on the body's own faces (no second shape, so no intersection artefacts)
        ellipsoid(0f, -0.38f, 0f, 0.8f, 0.9f, 0.7f, 4, 36, 22) { x, y, z -> val ex = x / 0.46f; val ey = (y + 0.3f) / 0.58f; if (z > 0.15f && ex * ex + ey * ey < 1f) 5 else 4 }
        ellipsoid(0f, 0.8f, 0.05f, 0.7f, 0.64f, 0.62f, 4, 28, 16)                    // head
        ellipsoid(-0.52f, 1.3f, 0f, 0.26f, 0.26f, 0.2f, 4, 12, 8); ellipsoid(0.52f, 1.3f, 0f, 0.26f, 0.26f, 0.2f, 4, 12, 8)             // ears
        ellipsoid(-0.52f, 1.29f, 0.1f, 0.16f, 0.16f, 0.12f, 5, 10, 8); ellipsoid(0.52f, 1.29f, 0.1f, 0.16f, 0.16f, 0.12f, 5, 10, 8)     // ear insides
        ellipsoid(0f, 0.62f, 0.52f, 0.32f, 0.26f, 0.28f, 5, 20, 12)                   // muzzle
        ellipsoid(0f, 0.74f, 0.78f, 0.1f, 0.075f, 0.07f, 6, 10, 8)                   // nose
        ellipsoid(-0.24f, 0.93f, 0.6f, 0.07f, 0.085f, 0.05f, 6, 10, 8); ellipsoid(0.24f, 0.93f, 0.6f, 0.07f, 0.085f, 0.05f, 6, 10, 8)    // eyes
        ellipsoid(-0.98f, -0.05f, 0.18f, 0.27f, 0.52f, 0.27f, 4, 18, 12); ellipsoid(0.98f, -0.05f, 0.18f, 0.27f, 0.52f, 0.27f, 4, 18, 12) // arms
        ellipsoid(-0.46f, -1.2f, 0.28f, 0.34f, 0.28f, 0.46f, 4, 18, 12); ellipsoid(0.46f, -1.2f, 0.28f, 0.34f, 0.28f, 0.46f, 4, 18, 12)  // legs
        ellipsoid(-0.46f, -1.22f, 0.68f, 0.2f, 0.17f, 0.1f, 5, 10, 8); ellipsoid(0.46f, -1.22f, 0.68f, 0.2f, 0.17f, 0.1f, 5, 10, 8)      // paw pads
        ellipsoid(-0.3f, 0.2f, 0.52f, 0.26f, 0.17f, 0.12f, 7, 12, 8); ellipsoid(0.3f, 0.2f, 0.52f, 0.26f, 0.17f, 0.12f, 7, 12, 8)        // bow wings
        ellipsoid(0f, 0.2f, 0.58f, 0.1f, 0.1f, 0.1f, 7, 10, 8)                       // bow knot
    }

    private fun MeshBuilder.gemAt(x: Float, y: Float, z: Float, s: Float, part: Int) {
        val top = vert(x, y + s * 1.3f, z); val bot = vert(x, y - s * 1.0f, z)
        val eq = (0 until 6).map { val a = it / 6f * 2 * PI.toFloat(); vert(x + cos(a) * s, y, z + sin(a) * s) }
        for (i in 0 until 6) { val j = (i + 1) % 6; face(part, top, eq[i], eq[j]); face(part, bot, eq[j], eq[i]) }
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
