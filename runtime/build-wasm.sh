#!/usr/bin/env bash
# Пересобирает WebAssembly-ядро для Studio и CLI: studio/wasm/noodle.wasm
set -euo pipefail
cd "$(dirname "$0")"
rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true
cargo build --release --target wasm32-unknown-unknown -p noodle-core
cp target/wasm32-unknown-unknown/release/noodle_core.wasm ../studio/wasm/noodle.wasm
ls -la ../studio/wasm/noodle.wasm
