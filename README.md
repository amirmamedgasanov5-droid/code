# Orbit — serverless peer-to-peer messenger (Android)

Native Android app (Kotlin, Jetpack Compose). No server, no phone number, no account.

## What is implemented
- **Identity**: Ed25519 + X25519 from one seed, restore by recovery key, seed wrapped by Android Keystore.
- **Crypto**: sealed-box DMs (X25519/HKDF/ChaCha20-Poly1305) + signatures; group keys with rotation on removal; signed (optionally encrypted) channels.
- **Mesh (delay-tolerant)**: every phone relays opaque envelopes, epidemic inventory sync, dedupe, TTL, ACK tombstones, retry with backoff. A message sent while the recipient is out of reach hops phone-to-phone when paths appear.
- **Transports**: Bluetooth/BLE/Wi-Fi Direct (Google Nearby, P2P_CLUSTER), LAN (multicast beacons + TCP), Internet (BitTorrent mainline DHT as phonebook + UDP hole punching + own reliable-UDP).
- **Chats**: text with formatting, replies, edit/delete-for-everyone, reactions, forward, pin, photos (auto-shrunk for mesh), voice notes, read receipts, typing, drafts, search, saved messages.
- **Groups**, **channels** (public/private, views, reactions), **serverless directory** (@username & public-channel search gossiped over the mesh).
- **Live rooms**: multiple speakers, raise hand → host invites, mute/kick, encrypted AAC audio flooded across participants; **walkie-talkie** push-to-talk.
- **Gifts**: 10 animated software-rendered 3D collectibles, unique traits/rarity from a seed, signed mint + signed ownership chain verified by every receiver.
- Offline app sharing (send the APK over Bluetooth), QR/link/nearby/username contact discovery.

## Verified here (JVM tests + headless UI renders)
`./gradlew :app:testDebugUnitTest` — crypto, envelopes, framer, multi-hop store-and-forward, loop safety, DHT+UDP link under 25% packet loss (300 KB payload), LAN TCP, live-room protocol with a relayed listener, gift forgery detection, plus screenshot renders of all main screens.

## NOT verified (no hardware in the build sandbox)
Nearby/Bluetooth radio behaviour, microphone/AAC audio pipeline, real NAT traversal on mobile networks, battery behaviour, notifications on real devices. Test these on two phones.

## Honest limits
- Phones **without Orbit cannot relay**; use "Share Orbit offline".
- Two phones behind symmetric/carrier-grade NAT may not connect directly; the mesh is the fallback.
- Gifts have no blockchain: double-spend is detectable, not preventable.
- Internet mode publishes your IP in the public DHT (toggle off for offline-only).
- Release keystore `orbit-release.jks` is a demo key; replace it for production.

Build: `ANDROID_HOME=<sdk> gradle :app:assembleRelease`
