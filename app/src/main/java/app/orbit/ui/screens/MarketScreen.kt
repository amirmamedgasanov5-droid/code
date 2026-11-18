@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package app.orbit.ui.screens

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items as listItems
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.orbit.data.DirectoryEntry
import app.orbit.data.Gift
import app.orbit.gifts.*
import app.orbit.ui.*
import app.orbit.ui.components.*
import app.orbit.ui.theme.OrbitTheme
import org.json.JSONObject

private fun giftOf(e: DirectoryEntry): Gift? = try { Gift.fromJson(JSONObject(e.key)) } catch (x: Exception) { null }

@Composable
fun MarketScreen() {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p
    val dir by engine.directory.collectAsState(); val coins by engine.coins.collectAsState(); val tick by engine.listingsTick.collectAsState()
    val all = remember(dir) { dir.filter { it.kind == "gift" } }
    val mine = remember(tick, all, engine.myListings()) { engine.myListings() }
    val others = all.filter { it.username != engine.myId }.sortedBy { it.desc.toIntOrNull() ?: 0 }
    var sel by remember { mutableStateOf<DirectoryEntry?>(null) }
    var note by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { engine.events.collect { ev -> if (ev.startsWith("refund:")) note = "Seller declined — ${ev.removePrefix("refund:")} coins refunded" else if (ev.startsWith("bought:")) note = "Purchase complete! The gift is in My gifts." else if (ev.startsWith("sold:")) note = "Sold! Coins added." } }

    Column(Modifier.fillMaxSize()) {
        TopBar("Market", { nav.pop() }, actions = { Text("💰 ${coinsFmt(coins)}", Modifier.padding(end = 14.dp), fontWeight = FontWeight.ExtraBold, color = Color(0xFFFFB020)) })
        note?.let { Text(it, Modifier.fillMaxWidth().background(p.accent.copy(alpha = 0.15f)).padding(12.dp), color = p.accent, fontWeight = FontWeight.SemiBold) }
        LazyVerticalGrid(GridCells.Fixed(2), contentPadding = PaddingValues(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item(span = { GridItemSpan(2) }) { Text("Listings spread phone-to-phone and through the relay. A purchase is paid first; the seller's phone then hands the gift over automatically (it must be online). If the seller declines, you are refunded.", color = p.textDim, fontSize = 12.sp, modifier = Modifier.padding(4.dp)) }
            if (mine.isNotEmpty()) item(span = { GridItemSpan(2) }) { SectionLabel("Your listings") }
            items(mine.entries.toList(), key = { "m" + it.key }) { en ->
                val g = engine.giftById(en.key)?.first
                if (g != null) Column(Modifier.clip(RoundedCornerShape(18.dp)).background(p.surface).pressable({ nav.push(Route.GiftDetail(g.id)) })) {
                    Box(Modifier.fillMaxWidth().aspectRatio(1f)) { Gift3D(g, animate = false) }
                    Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) { Text(GiftCatalog.models[g.model].name, Modifier.weight(1f), fontWeight = FontWeight.Bold); Text("💰 ${coinsFmt(en.value)}", color = Color(0xFFFFB020), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp) }
                }
            }
            item(span = { GridItemSpan(2) }) { SectionLabel("For sale") }
            if (others.isEmpty()) item(span = { GridItemSpan(2) }) { Text("No listings yet. Listings from other people appear here as they reach you — or list your own from a gift's page.", Modifier.padding(16.dp), color = p.textDim, textAlign = TextAlign.Center) }
            items(others, key = { it.id }) { e ->
                val g = giftOf(e)
                if (g != null) {
                    val t = remember(g.id) { GiftLogic.traits(g) }; val price = e.desc.toIntOrNull() ?: 0
                    Column(Modifier.clip(RoundedCornerShape(18.dp)).background(p.surface).pressable({ sel = e })) {
                        Box(Modifier.fillMaxWidth().aspectRatio(1f)) { Gift3D(g, animate = false); TierChip(t.tier, Modifier.align(Alignment.TopStart).padding(8.dp)) }
                        Column(Modifier.padding(10.dp)) {
                            Text("${t.materialInfo.name} ${GiftCatalog.models[g.model].name}", fontWeight = FontWeight.Bold, maxLines = 1)
                            Text("#${g.serial} · by ${e.name.ifBlank { e.username.take(6) }}", fontSize = 11.5.sp, color = p.textDim, maxLines = 1)
                            Text("💰 ${coinsFmt(price)}", Modifier.padding(top = 6.dp).clip(RoundedCornerShape(10.dp)).background(if (coins >= price) p.accent else p.surfaceHigh).padding(horizontal = 10.dp, vertical = 5.dp), color = if (coins >= price) Color.White else p.textDim, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
                        }
                    }
                }
            }
        }
    }
    sel?.let { e ->
        val g = giftOf(e); val price = e.desc.toIntOrNull() ?: 0
        if (g != null) ModalBottomSheet({ sel = null }, containerColor = p.surface, contentColor = p.text) {
            val t = remember(g.id) { GiftLogic.traits(g) }
            Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(230.dp).clip(RoundedCornerShape(24.dp))) { Gift3D(g, interactive = true) }
                Spacer(Modifier.height(8.dp)); TierChip(t.tier)
                Text("${t.materialInfo.name} ${GiftCatalog.models[g.model].name} #${g.serial}", style = MaterialTheme.typography.titleLarge)
                Text("${t.backdropInfo.name} · ${GiftCatalog.symbols[t.symbol]} · ${GiftCatalog.patterns[t.pattern]} · 1 in ${(1.0 / t.rarity).toInt()}", color = p.textDim, fontSize = 13.sp)
                Text("Seller: ${e.name.ifBlank { e.username.take(8) }} · signature chain verified ✓", color = p.success, fontSize = 12.5.sp, modifier = Modifier.padding(top = 6.dp))
                Spacer(Modifier.height(14.dp))
                if (coins < price) Text("You need ${coinsFmt(price - coins)} more coins", color = p.danger, fontWeight = FontWeight.SemiBold)
                GradientButton("Buy · 💰 ${coinsFmt(price)}", { engine.buyListing(e) { r -> note = r }; sel = null }, Modifier.fillMaxWidth(), enabled = coins >= price, icon = Icons.Rounded.ShoppingBag)
            }
        }
    }
}

@Composable
fun AdminScreen() {
    val engine = LocalEngine.current; val nav = LocalNav.current; val p = OrbitTheme.p
    val admin by engine.isAdmin.collectAsState(); val contacts by engine.contacts.collectAsState()
    var model by remember { mutableIntStateOf(0) }; var count by remember { mutableStateOf("10") }; var msg by remember { mutableStateOf("") }
    var target by remember { mutableStateOf<String?>(null) }; var picking by remember { mutableStateOf(false) }; var result by remember { mutableStateOf<String?>(null) }
    if (!admin) { Column(Modifier.fillMaxSize()) { TopBar("Admin", { nav.pop() }); EmptyState("🔒", "Not an admin", "Enter an admin token in Profile → Promo code.") }; return }
    Column(Modifier.fillMaxSize()) {
        TopBar("Admin · mint gifts", { nav.pop() })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
            Text("Any model, any amount, no coins needed. Each gift gets its own random traits, serial number and signature.", color = p.textDim)
            Spacer(Modifier.height(12.dp))
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GiftCatalog.models.forEachIndexed { i, m -> Text("${m.emoji} ${m.name}", Modifier.clip(RoundedCornerShape(14.dp)).background(if (model == i) p.accent else p.surfaceHigh).clickable { model = i }.padding(horizontal = 12.dp, vertical = 8.dp), color = if (model == i) Color.White else p.text, fontSize = 13.sp, fontWeight = FontWeight.Medium) }
            }
            Spacer(Modifier.height(12.dp))
            Box(Modifier.fillMaxWidth().height(220.dp).clip(RoundedCornerShape(20.dp))) { Gift3D(Gift("%032x".format(model * 104729L + 7L), model, "00".repeat(32), "", 1, 1000, "%032x".format(model * 7919L + 31337L), 0, "", emptyList())) }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(count, { count = it.filter(Char::isDigit).take(3) }, Modifier.fillMaxWidth(), label = { Text("How many (up to 200 for you, 25 per send)") }, singleLine = true, shape = RoundedCornerShape(14.dp))
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(msg, { msg = it.take(120) }, Modifier.fillMaxWidth(), label = { Text("Message (optional)") }, singleLine = true, shape = RoundedCornerShape(14.dp))
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.surfaceHigh).clickable { picking = true }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.Person, null, tint = p.accent); Spacer(Modifier.width(10.dp)); Text(target?.let { contacts[it]?.displayName } ?: "Keep for myself (tap to pick a contact instead)", Modifier.weight(1f), color = if (target == null) p.textDim else p.text)
                if (target != null) Icon(Icons.Rounded.Close, null, Modifier.clickable { target = null }, tint = p.textDim)
            }
            Spacer(Modifier.height(14.dp))
            GradientButton(if (target == null) "Mint ${count.ifBlank { "0" }} for me" else "Mint & send ${count.ifBlank { "0" }}", { engine.adminMint(model, count.toIntOrNull() ?: 1, target, msg.trim()) { n -> result = "Minted $n × ${GiftCatalog.models[model].name}" } }, Modifier.fillMaxWidth(), enabled = (count.toIntOrNull() ?: 0) > 0, icon = Icons.Rounded.AutoAwesome)
            result?.let { Text(it, Modifier.padding(top = 10.dp), color = p.success, fontWeight = FontWeight.SemiBold) }
        }
    }
    if (picking) ModalBottomSheet({ picking = false }, containerColor = p.surface, contentColor = p.text) {
        androidx.compose.foundation.lazy.LazyColumn(Modifier.padding(bottom = 24.dp)) {
            listItems(contacts.values.filter { !it.blocked }.sortedBy { it.displayName }.toList()) { c -> Row(Modifier.fillMaxWidth().clickable { target = c.id; picking = false }.padding(horizontal = 16.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(c.displayName, c.emoji, c.color, 40.dp); Spacer(Modifier.width(12.dp)); Text(c.displayName) } }
        }
    }
}
