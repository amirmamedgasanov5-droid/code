@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package app.orbit.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items as listItems
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.orbit.data.*
import app.orbit.gifts.*
import app.orbit.ui.*
import app.orbit.ui.components.*
import app.orbit.ui.theme.OrbitTheme
import kotlinx.coroutines.delay

private fun previewGift(model: Int): Gift {
    val seed = "%032x".format(java.math.BigInteger.valueOf(model * 7919L + 31337L))
    // pick a pleasant, fixed-looking sample: first seed whose tier is not common, searched deterministically
    return Gift("%032x".format(java.math.BigInteger.valueOf(model * 104729L + 7L)), model, "00".repeat(32), "", 1, 1000, seed, 0, "", emptyList())
}

fun tierColor(t: Tier) = when (t) { Tier.COMMON -> Color(0xFF8A9BAE); Tier.UNCOMMON -> Color(0xFF41C268); Tier.RARE -> Color(0xFF3E7BFF); Tier.EPIC -> Color(0xFFA45BFF); Tier.LEGENDARY -> Color(0xFFFFB020) }

@Composable
fun TierChip(t: Tier, modifier: Modifier = Modifier) {
    Text(t.label.uppercase(), modifier.clip(RoundedCornerShape(8.dp)).background(tierColor(t).copy(alpha = 0.2f)).padding(horizontal = 8.dp, vertical = 3.dp), color = tierColor(t), fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.6.sp)
}

@Composable
fun GiftShopScreen(chatId: String?) {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p
    val contacts by engine.contacts.collectAsState(); val coins by engine.coins.collectAsState()
    var selected by remember { mutableStateOf<Int?>(null) }
    var msg by remember { mutableStateOf("") }
    var revealed by remember { mutableStateOf<Gift?>(null) }
    var picking by remember { mutableStateOf(false) }
    var pickedFor by remember { mutableStateOf(chatId) }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            TopBar("Gift shop", { nav.pop() }, actions = {
                Row(Modifier.padding(end = 8.dp).clip(RoundedCornerShape(16.dp)).background(Color(0xFFFFB020).copy(alpha = 0.2f)).clickable { nav.push(Route.Wheel) }.padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) { Text("💰", fontSize = 16.sp); Spacer(Modifier.width(5.dp)); Text(coinsFmt(coins), fontWeight = FontWeight.ExtraBold, color = Color(0xFFFFB020)); Text("  +", color = Color(0xFFFFB020), fontWeight = FontWeight.Bold) }
                IconButton({ nav.push(Route.Market) }) { Icon(Icons.Rounded.Sell, null, tint = p.accent) }
                IconButton({ nav.push(Route.Inventory) }) { Icon(Icons.Rounded.CardGiftcard, null, tint = p.accent) }
            })
            LazyVerticalGrid(GridCells.Fixed(2), contentPadding = PaddingValues(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Brush.linearGradient(listOf(Color(0xFFFF8A5B), Color(0xFFFF4D8D)))).pressable({ nav.push(Route.Wheel) }).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("🎡", fontSize = 26.sp); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { Text("Need coins?", color = Color.White, fontWeight = FontWeight.Bold); Text(if (engine.canSpin()) "Free spin ready: win up to 250" else "Free spin once a day", color = Color.White.copy(alpha = 0.9f), fontSize = 12.sp) }; Icon(Icons.Rounded.ChevronRight, null, tint = Color.White)
                    }
                }
                items((0 until GiftCatalog.PREMIUM_FROM).toList()) { m ->
                    val m0 = GiftCatalog.models[m]; val price = engine.price(m)
                    Column(Modifier.clip(RoundedCornerShape(20.dp)).background(p.surface).pressable({ selected = m })) {
                        Box(Modifier.fillMaxWidth().aspectRatio(0.9f)) { Gift3D(previewGift(m)) }
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) { Text(m0.name, fontWeight = FontWeight.Bold); Text("Unique every time", fontSize = 11.5.sp, color = p.textDim) }
                            Text("💰 ${coinsFmt(price)}", Modifier.clip(RoundedCornerShape(10.dp)).background(if (coins >= price) p.accent else p.surfaceHigh).padding(horizontal = 9.dp, vertical = 5.dp), color = if (coins >= price) Color.White else p.textDim, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
                        }
                    }
                }
                item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
                    Column(Modifier.padding(top = 10.dp, start = 4.dp)) { Text("👑 PREMIUM", color = Color(0xFFFFB020), fontWeight = FontWeight.ExtraBold, letterSpacing = 1.sp, fontSize = 13.sp); Text("Always drawn from the rarest materials", color = p.textDim, fontSize = 12.sp) }
                }
                items((GiftCatalog.PREMIUM_FROM until GiftCatalog.models.size).toList()) { m ->
                    val m0 = GiftCatalog.models[m]; val price = engine.price(m)
                    Column(Modifier.clip(RoundedCornerShape(20.dp)).background(p.surface).border(1.5.dp, Color(0xFFFFB020).copy(alpha = 0.7f), RoundedCornerShape(20.dp)).pressable({ selected = m })) {
                        Box(Modifier.fillMaxWidth().aspectRatio(0.9f)) { Gift3D(previewGift(m)) }
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) { Text(m0.name, fontWeight = FontWeight.Bold); Text("Premium", fontSize = 11.5.sp, color = Color(0xFFFFB020)) }
                            Text("💰 ${coinsFmt(price)}", Modifier.clip(RoundedCornerShape(10.dp)).background(if (coins >= price) Color(0xFFFFB020) else p.surfaceHigh).padding(horizontal = 9.dp, vertical = 5.dp), color = if (coins >= price) Color.White else p.textDim, fontWeight = FontWeight.ExtraBold, fontSize = 12.5.sp)
                        }
                    }
                }
            }
        }
        selected?.let { m ->
            val price = engine.price(m); val enough = coins >= price
            val tc = pickedFor?.let { contacts[it] }
            ModalBottomSheet({ selected = null }, containerColor = p.surface, contentColor = p.text) {
                Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.size(210.dp).clip(RoundedCornerShape(24.dp))) { Gift3D(previewGift(m), interactive = true) }
                    Spacer(Modifier.height(8.dp))
                    Text(GiftCatalog.models[m].name, style = MaterialTheme.typography.titleLarge)
                    Text("Material, backdrop and rarity are drawn at random when you buy — each gift is one of a kind.", color = p.textDim, fontSize = 13.sp, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(14.dp))
                    if (!enough) {
                        Text("You need ${coinsFmt(price - coins)} more coins", color = p.danger, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(8.dp))
                        GradientButton("Spin the wheel for free coins", { selected = null; nav.push(Route.Wheel) }, Modifier.fillMaxWidth(), icon = Icons.Rounded.Casino)
                    } else {
                        GradientButton("Buy for me · 💰 ${coinsFmt(price)}", { engine.buyGift(m, "", null) { g -> if (g != null) { revealed = g; pickedFor = null } }; selected = null }, Modifier.fillMaxWidth(), icon = Icons.Rounded.ShoppingBag)
                        Spacer(Modifier.height(10.dp))
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.surfaceHigh).clickable { picking = true }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (tc != null) { Avatar(tc.displayName, tc.emoji, tc.color, 30.dp); Spacer(Modifier.width(10.dp)); Text("Gift to ${tc.displayName}", Modifier.weight(1f)) } else { Icon(Icons.Rounded.CardGiftcard, null, tint = p.accent); Spacer(Modifier.width(10.dp)); Text("Or buy as a present for a friend…", Modifier.weight(1f), color = p.textDim) }
                            Icon(Icons.Rounded.ChevronRight, null, tint = p.textDim)
                        }
                        if (tc != null) {
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(msg, { msg = it.take(120) }, Modifier.fillMaxWidth(), placeholder = { Text("Add a message (optional)") }, shape = RoundedCornerShape(14.dp), singleLine = true)
                            Spacer(Modifier.height(10.dp))
                            GradientButton("Buy & send · 💰 ${coinsFmt(price)}", { val t = pickedFor!!; engine.buyGift(m, msg.trim(), t) { g -> if (g != null) revealed = g }; selected = null }, Modifier.fillMaxWidth(), icon = Icons.Rounded.CardGiftcard)
                        }
                    }
                }
            }
        }
        if (picking) ModalBottomSheet({ picking = false }, containerColor = p.surface, contentColor = p.text) {
            LazyColumn(Modifier.padding(bottom = 24.dp)) {
                if (contacts.isEmpty()) item { Text("Add a contact first.", Modifier.padding(20.dp), color = p.textDim) }
                listItems(contacts.values.filter { !it.blocked }.sortedBy { it.displayName }.toList()) { c ->
                    Row(Modifier.fillMaxWidth().clickable { pickedFor = c.id; picking = false }.padding(horizontal = 16.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(c.displayName, c.emoji, c.color, 40.dp); Spacer(Modifier.width(12.dp)); Text(c.displayName) }
                }
            }
        }
        revealed?.let { g -> UnboxOverlay(g) { revealed = null; if (g.owner != engine.myId && chatId != null || (g.transfers.isNotEmpty())) { nav.pop(); g.transfers.lastOrNull()?.let { nav.push(Route.Chat(it.toId)) } } else { nav.replaceTop(Route.GiftDetail(g.id)) } } }
    }
}

@Composable
private fun UnboxOverlay(g: Gift, onClose: () -> Unit) {
    val t = remember(g.id) { GiftLogic.traits(g) }
    var stage by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) { delay(650); stage = 1; delay(500); stage = 2 }
    val s by animateFloatAsState(if (stage >= 1) 1f else 0.2f, spring(0.55f, 180f), label = "s")
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.86f)).clickable(onClick = onClose), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(280.dp).scale(s).clip(RoundedCornerShape(32.dp))) { Gift3D(g, interactive = true) }
            Spacer(Modifier.height(18.dp))
            AnimatedVisibility(stage >= 2, enter = fadeIn() + slideInVertically { it / 2 }) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    TierChip(t.tier)
                    Spacer(Modifier.height(8.dp))
                    Text("${t.materialInfo.name} ${GiftCatalog.models[g.model].name}", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
                    Text("#${g.serial} of ${g.supply} · ${t.backdropInfo.name} · ${GiftCatalog.symbols[t.symbol]} · ${GiftCatalog.patterns[t.pattern]}", color = Color.White.copy(alpha = 0.7f), fontSize = 13.sp)
                    Text("Sent ✨ tap anywhere to continue", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp, modifier = Modifier.padding(top = 16.dp))
                }
            }
        }
    }
}

@Composable
fun InventoryScreen() {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p
    val all by engine.gifts.collectAsState()
    val mine = all.filter { it.second && it.first.owner == engine.myId }.map { it.first }
    val tiers = mine.map { GiftLogic.traits(it).tier }
    Column(Modifier.fillMaxSize()) {
        TopBar("My gifts", { nav.pop() }, subtitle = "${mine.size} owned · ${tiers.count { it >= Tier.RARE }} rare or better")
        if (mine.isEmpty()) EmptyState("🎁", "No gifts yet", "Gifts you receive or mint appear here with their full signed history.") { GradientButton("Open gift shop", { nav.replaceTop(Route.GiftShop(null)) }) }
        LazyVerticalGrid(GridCells.Fixed(2), contentPadding = PaddingValues(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(mine, key = { it.id }) { g ->
                val t = remember(g.id) { GiftLogic.traits(g) }
                Box(Modifier.clip(RoundedCornerShape(20.dp)).aspectRatio(0.82f).pressable({ nav.push(Route.GiftDetail(g.id)) })) {
                    Gift3D(g, animate = true, modelScale = 0.95f)
                    Column(Modifier.align(Alignment.BottomStart).fillMaxWidth().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.55f)))).padding(10.dp)) {
                        Text(GiftCatalog.models[g.model].name, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text("#${g.serial} · ${t.tier.label}", color = tierColor(t.tier).copy(alpha = 1f).let { Color.White.copy(alpha = 0.85f) }, fontSize = 11.5.sp)
                    }
                    TierChip(t.tier, Modifier.align(Alignment.TopStart).padding(8.dp))
                }
            }
        }
    }
}

@Composable
fun GiftDetailScreen(id: String) {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p
    val all by engine.gifts.collectAsState(); val contacts by engine.contacts.collectAsState()
    val entry = all.firstOrNull { it.first.id == id } ?: run { Box(Modifier.fillMaxSize()) { TopBar("Gift", { nav.pop() }) }; return }
    val g = entry.first; val isMine = entry.second && g.owner == engine.myId
    val t = remember(g.id) { GiftLogic.traits(g) }
    val valid = remember(g) { GiftLogic.verify(g) }
    var sendTo by remember { mutableStateOf(false) }; var msg by remember { mutableStateOf("") }
    var sellDlg by remember { mutableStateOf(false) }; val tick by engine.listingsTick.collectAsState(); val listed = remember(tick, g.id) { engine.listedPrice(g.id) }
    val chain = remember(g) { listOf(g.issuer to g.mintedAt) + g.transfers.map { it.toId to it.ts } }
    fun nameOf(i: String) = if (i == engine.myId) "You" else contacts[i]?.displayName ?: "User ${i.take(6)}"
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxWidth().height(400.dp)) {
            Gift3D(g, interactive = true, modelScale = 1.15f)
            IconButton({ nav.pop() }, Modifier.statusBarsPadding().padding(6.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.3f))) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, null, tint = Color.White) }
            Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.5f)))).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                TierChip(t.tier); Spacer(Modifier.height(6.dp))
                Text("${t.materialInfo.name} ${GiftCatalog.models[g.model].name}", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.ExtraBold)
                Text("#${g.serial} of ${g.supply} · drag to rotate", color = Color.White.copy(alpha = 0.75f), fontSize = 13.sp)
            }
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            Card(Modifier.padding(top = 12.dp)) {
                TraitRow("Model", GiftCatalog.models[g.model].name, null)
                TraitRow("Material", t.materialInfo.name, GiftCatalog.materials[t.material].weight * 100f / GiftCatalog.materials.sumOf { it.weight })
                TraitRow("Backdrop", t.backdropInfo.name, GiftCatalog.backdrops[t.backdrop].weight * 100f / GiftCatalog.backdrops.sumOf { it.weight })
                TraitRow("Symbol", GiftCatalog.symbols[t.symbol], GiftCatalog.symbolWeights[t.symbol] * 100f / GiftCatalog.symbolWeights.sum())
                TraitRow("Pattern", GiftCatalog.patterns[t.pattern], GiftCatalog.patternWeights[t.pattern] * 100f / GiftCatalog.patternWeights.sum())
                TraitRow("Combined rarity", "1 in ${(1.0 / t.rarity).toInt()}", null)
                TraitRow("Collector value", "✦ ${GiftLogic.estimate(g)}", null)
            }
            SectionLabel("Provenance")
            Card {
                Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(if (valid) Icons.Rounded.VerifiedUser else Icons.Rounded.GppBad, null, tint = if (valid) p.success else p.danger); Spacer(Modifier.width(10.dp))
                    Column { Text(if (valid) "Signature chain verified" else "Verification failed", fontWeight = FontWeight.SemiBold, color = if (valid) p.success else p.danger); Text(if (valid) "Minted by ${g.issuerName.ifBlank { g.issuer.take(8) }} and handed over ${g.transfers.size} time${if (g.transfers.size == 1) "" else "s"}. Every step is signed by the previous owner." else "This gift's history does not check out. Do not trust it.", fontSize = 12.sp, color = p.textDim) }
                }
                Divider()
                chain.forEachIndexed { i, (who, ts) ->
                    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(26.dp).clip(CircleShape).background(if (i == chain.lastIndex) p.accent else p.surfaceHigh), contentAlignment = Alignment.Center) { Text("${i + 1}", fontSize = 12.sp, color = if (i == chain.lastIndex) Color.White else p.textDim, fontWeight = FontWeight.Bold) }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) { Text(nameOf(who) + if (i == 0) " · issuer" else if (i == chain.lastIndex) " · owner" else "", fontWeight = FontWeight.Medium); Text(java.text.SimpleDateFormat("d MMM yyyy, HH:mm", java.util.Locale.getDefault()).format(java.util.Date(ts)), fontSize = 12.sp, color = p.textDim) }
                    }
                }
            }
            Text("There is no blockchain: ownership is a chain of signatures. If someone secretly hands the same gift to two people, both copies will carry a different signed branch and devices that see both flag it. Treat gifts as collectibles among people you trust.", Modifier.padding(20.dp, 10.dp), fontSize = 12.sp, color = p.textDim)
            if (isMine) Column(Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                GradientButton("Send to a friend", { sendTo = true }, Modifier.fillMaxWidth(), icon = Icons.Rounded.CardGiftcard)
                if (listed == null) TonalButton("Sell on the market", { sellDlg = true }, Modifier.fillMaxWidth(), icon = Icons.Rounded.Sell)
                else TonalButton("Listed for ${coinsFmt(listed)} 💰 · remove", { engine.unlistGift(g.id) }, Modifier.fillMaxWidth(), icon = Icons.Rounded.Close, danger = true)
            }
        }
    }
    if (sellDlg) { var price by remember { mutableStateOf(GiftLogic.estimate(g).toString()) }
        AlertDialog({ sellDlg = false }, containerColor = p.surfaceHigh, title = { Text("Sell for…") },
            text = { Column { OutlinedTextField(price, { price = it.filter(Char::isDigit).take(9) }, singleLine = true, label = { Text("Price in coins") }, shape = RoundedCornerShape(14.dp)); Text("Collector estimate: ${coinsFmt(GiftLogic.estimate(g))}. Set any price you like. Your phone must be online to hand the gift over when someone buys.", Modifier.padding(top = 8.dp), fontSize = 12.sp, color = p.textDim) } },
            confirmButton = { TextButton({ price.toIntOrNull()?.let { engine.listGift(g.id, it) }; sellDlg = false }, enabled = (price.toIntOrNull() ?: 0) > 0) { Text("List") } }, dismissButton = { TextButton({ sellDlg = false }) { Text("Cancel") } }) }
    if (sendTo) ModalBottomSheet({ sendTo = false }, containerColor = p.surface, contentColor = p.text) {
        Column(Modifier.padding(bottom = 24.dp)) {
            OutlinedTextField(msg, { msg = it.take(120) }, Modifier.fillMaxWidth().padding(horizontal = 16.dp), placeholder = { Text("Message (optional)") }, singleLine = true, shape = RoundedCornerShape(14.dp))
            Spacer(Modifier.height(8.dp))
            LazyColumn(Modifier.heightIn(max = 380.dp)) {
                listItems(contacts.values.filter { !it.blocked }.sortedBy { it.displayName }.toList()) { c ->
                    Row(Modifier.fillMaxWidth().clickable { engine.regift(c.id, g, msg.trim()); sendTo = false; nav.pop(); nav.push(Route.Chat(c.id)) }.padding(horizontal = 16.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(c.displayName, c.emoji, c.color, 40.dp); Spacer(Modifier.width(12.dp)); Text(c.displayName) }
                }
            }
        }
    }
}

@Composable
private fun TraitRow(label: String, value: String, pct: Float?) {
    val p = OrbitTheme.p
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = p.textDim, modifier = Modifier.weight(1f))
        Text(value, fontWeight = FontWeight.SemiBold)
        if (pct != null) Text("  ${"%.1f".format(pct)}%", color = p.accent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}
