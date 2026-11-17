package app.orbit.gifts

import app.orbit.core.*
import app.orbit.core.crypto.Identity
import app.orbit.core.crypto.Sig
import app.orbit.data.Gift
import app.orbit.data.GiftTransfer
import java.math.BigInteger

class Material(val name: String, val base: Long, val shade: Long, val glint: Long, val shine: Float, val iridescent: Boolean, val weight: Int)
class Backdrop(val name: String, val top: Long, val bottom: Long, val weight: Int)
class Model(val name: String, val emoji: String, val basePrice: Int)

/** Static catalog. Index order is part of the protocol: never reorder, only append. */
object GiftCatalog {
    val models = listOf(
        Model("Brilliant", "💎", 10), Model("Present", "🎁", 8), Model("Orb", "🔮", 12), Model("Halo", "💍", 14),
        Model("Obelisk", "🔷", 12), Model("Nova", "⭐", 10), Model("Heart", "❤️", 8), Model("Elixir", "🧪", 12),
        Model("Chalice", "🏆", 16), Model("Bell", "🔔", 9),
    )
    val materials = listOf(
        Material("Gold", 0xFFFFC83D, 0xFFB8741A, 0xFFFFF4C2, 0.9f, false, 22),
        Material("Rose Gold", 0xFFF4A58A, 0xFFB2594A, 0xFFFFE5DA, 0.85f, false, 16),
        Material("Platinum", 0xFFDDE4EE, 0xFF7B879A, 0xFFFFFFFF, 0.95f, false, 14),
        Material("Emerald", 0xFF22C58B, 0xFF0A6B4B, 0xFFB8FFE2, 0.8f, false, 12),
        Material("Sapphire", 0xFF3E7BFF, 0xFF132F9E, 0xFFBFD6FF, 0.85f, false, 12),
        Material("Ruby", 0xFFF2335A, 0xFF8A0B2B, 0xFFFFC2CF, 0.85f, false, 10),
        Material("Amethyst", 0xFFA45BFF, 0xFF4B1D96, 0xFFE3C9FF, 0.8f, false, 8),
        Material("Obsidian", 0xFF3A3F55, 0xFF0A0B14, 0xFF9AA3FF, 1.0f, false, 6),
        Material("Opal", 0xFFEAF6FF, 0xFF8FA8D8, 0xFFFFFFFF, 0.9f, true, 3),
        Material("Aurora", 0xFF5CFFD0, 0xFF6A38FF, 0xFFFFFFFF, 1.0f, true, 1),
    )
    val backdrops = listOf(
        Backdrop("Midnight", 0xFF2B3A67, 0xFF0B1020, 14), Backdrop("Sunset", 0xFFFF8A5B, 0xFF7A1F5C, 12), Backdrop("Mint", 0xFF7BF0C3, 0xFF127A67, 12),
        Backdrop("Ocean", 0xFF3CC5FF, 0xFF0A3E8C, 12), Backdrop("Berry", 0xFFFF5FA2, 0xFF5A0F4B, 10), Backdrop("Peach", 0xFFFFC2A0, 0xFFD6577B, 10),
        Backdrop("Lavender", 0xFFC2A5FF, 0xFF4A3A9E, 8), Backdrop("Ember", 0xFFFFB347, 0xFF8A1C0C, 8), Backdrop("Glacier", 0xFFDDF6FF, 0xFF5E8FBF, 6),
        Backdrop("Forest", 0xFF6BCB77, 0xFF0F3D2A, 6), Backdrop("Nebula", 0xFF9B5CFF, 0xFF160A3C, 3), Backdrop("Gold Dust", 0xFFFFE08A, 0xFF5A3B00, 1),
    )
    val symbols = listOf("Star", "Moon", "Bolt", "Crown", "Flame", "Leaf", "Snowflake", "Eye", "Wave", "Spade")
    val patterns = listOf("Plain", "Dots", "Rings", "Rays", "Grid", "Stars")
    val patternWeights = listOf(30, 18, 16, 14, 12, 10)
    val symbolWeights = listOf(16, 14, 12, 8, 12, 12, 10, 4, 8, 4)
}

enum class Tier(val label: String) { COMMON("Common"), UNCOMMON("Uncommon"), RARE("Rare"), EPIC("Epic"), LEGENDARY("Legendary") }

data class Traits(val model: Int, val material: Int, val backdrop: Int, val symbol: Int, val pattern: Int, val spin: Float, val rarity: Double, val tier: Tier) {
    val materialInfo get() = GiftCatalog.materials[material]
    val backdropInfo get() = GiftCatalog.backdrops[backdrop]
}

object GiftLogic {
    const val SUPPLY = 1000
    const val DAILY_MINT_LIMIT = 5

    private fun pick(weights: List<Int>, r: Double): Int {
        val total = weights.sum(); var acc = 0.0
        for (i in weights.indices) { acc += weights[i].toDouble() / total; if (r < acc) return i }
        return weights.lastIndex
    }

    /** Traits depend only on the mint seed: same pixels on every device, no server needed. */
    fun traits(g: Gift): Traits {
        val h = sha256("orbit.gift.traits".utf8(), g.seed.unhex(), g.id.unhex())
        fun u(i: Int): Double = (BigInteger(1, h.copyOfRange(i * 4, i * 4 + 4)).toLong() and 0xffffffffL) / 4294967296.0
        val mats = GiftCatalog.materials.map { it.weight }; val bds = GiftCatalog.backdrops.map { it.weight }
        val m = pick(mats, u(0)); val b = pick(bds, u(1)); val s = pick(GiftCatalog.symbolWeights, u(2)); val p = pick(GiftCatalog.patternWeights, u(3))
        val pr = mats[m].toDouble() / mats.sum() * bds[b].toDouble() / bds.sum() * GiftCatalog.symbolWeights[s].toDouble() / GiftCatalog.symbolWeights.sum() * GiftCatalog.patternWeights[p].toDouble() / GiftCatalog.patternWeights.sum()
        val tier = when { pr < 0.0004 -> Tier.LEGENDARY; pr < 0.0016 -> Tier.EPIC; pr < 0.005 -> Tier.RARE; pr < 0.012 -> Tier.UNCOMMON; else -> Tier.COMMON }
        return Traits(g.model, m, b, s, p, 0.6f + u(4).toFloat() * 0.8f, pr, tier)
    }

    private fun mintBytes(id: String, model: Int, serial: Int, supply: Int, seed: String, ts: Long, issuer: String) =
        ByteWriter().raw("orbit.gift.mint".utf8()).raw(id.unhex()).u8(model).u32(serial.toLong()).u32(supply.toLong()).raw(seed.unhex()).i64(ts).raw(issuer.unhex()).toByteArray()

    private fun transferBytes(g: Gift, upTo: Int, to: String, ts: Long): ByteArray {
        var prev = sha256(g.mintSig.unhex())
        for (i in 0 until upTo) { val t = g.transfers[i]; prev = sha256(prev, t.toId.unhex(), longBytes(t.ts), t.sig.unhex()) }
        return ByteWriter().raw("orbit.gift.xfer".utf8()).raw(g.id.unhex()).raw(prev).raw(to.unhex()).i64(ts).toByteArray()
    }

    fun mint(issuer: Identity, issuerName: String, model: Int, serial: Int, message: String = ""): Gift {
        val id = Rand.bytes(16).hex(); val seed = Rand.bytes(16).hex(); val ts = now()
        val sig = issuer.sign(mintBytes(id, model, serial, SUPPLY, seed, ts, issuer.id)).hex()
        return Gift(id, model, issuer.id, issuerName, serial, SUPPLY, seed, ts, sig, emptyList(), message)
    }

    fun transfer(owner: Identity, g: Gift, toId: String, message: String = ""): Gift {
        require(g.owner == owner.id) { "not the owner" }
        val ts = now()
        val sig = owner.sign(transferBytes(g, g.transfers.size, toId, ts)).hex()
        return g.copy(transfers = g.transfers + GiftTransfer(toId, ts, sig), message = message)
    }

    /** Full cryptographic verification of provenance. */
    fun verify(g: Gift): Boolean {
        return try {
        if (g.model !in GiftCatalog.models.indices || g.serial !in 1..g.supply) return false
        if (!Sig.verify(g.issuer.unhex(), mintBytes(g.id, g.model, g.serial, g.supply, g.seed, g.mintedAt, g.issuer), g.mintSig.unhex())) return false
        var owner = g.issuer
        for ((i, t) in g.transfers.withIndex()) {
            if (!Sig.verify(owner.unhex(), transferBytes(g, i, t.toId, t.ts), t.sig.unhex())) return false
            owner = t.toId
        }
            true
        } catch (e: Exception) { false }
    }

    /** Price hint shown in UI only (no market exists without a server); scarcity-weighted. */
    fun estimate(g: Gift): Int {
        val t = traits(g); val base = GiftCatalog.models[g.model].basePrice
        return (base * (1.0 / (t.rarity * 40 + 0.05)).coerceIn(1.0, 400.0)).toInt() + (g.supply - g.serial) / 100
    }
}
