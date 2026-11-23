# Noodle — нативные приложения для Noodle.OS

* **Noodle UI + Noodle Script** — собственные языки для приложений Noodle.OS. Не веб, не Android, не iOS.
* **Нативный рантайм на Rust** (`runtime/`): компилятор → байткод → виртуальная машина → собственная раскладка и отрисовка.
  Один бинарник ≈ 2 МБ, шрифты внутри. Одно и то же ядро работает в окне ОС, в тестах без окна и в WebAssembly.
* **Noodle Studio** — IDE (чёрно-белая, как VS Code): редактор, проводник, проверка кода на лету, **превью на настоящем
  рантайме**, ИИ-агент (любой OpenAI-совместимый API или Claude), сборка подписанных пакетов **`.nob`**.
* **`.nob`** — установочный пакет Noodle.OS: ZIP + байткод `main.nbc` + подпись ECDSA.

```nui
state count = 0 persist
fn inc() { count += 1 }

screen main {
  column grow center gap=32 {
    text "{count}" size=120 weight=200
    button "+" primary on=inc
  }
}
```

## Быстрый старт

```bash
npm run studio                                   # IDE: http://localhost:8080 (Node 20+, без зависимостей)

node tools/nob.mjs init my-app                   # новый проект (Noodle)
node tools/nob.mjs check my-app                  # ошибки с файлом:строкой:колонкой
node tools/nob.mjs build my-app                  # → my-app/<id>-<версия>.nob (байткод + подпись)

cd runtime && cargo build --release              # нативный рантайм (Rust)
runtime/target/release/noodle run my-app         # окно; также принимает .nob
runtime/target/release/noodle shot my-app -o shot.png --steps "tap:+;tap:+"   # скриншот без окна
```

## Стеки

| Стек | Язык | Исполняется |
|---|---|---|
| **`noodle`** (основной) | Noodle UI + Noodle Script | **нативным рантаймом Noodle** |
| `web` | HTML + CSS + JS | песочница (WebView/iframe) — режим совместимости |
| `kotlin`, `flutter`, `swift` | Kotlin / Dart / Swift | как приложения Android / iOS (мост) |

Документация: [язык](docs/NOODLE-LANG.md) · [рантайм и производительность](docs/RUNTIME.md) · [формат `.nob`](docs/NOB-FORMAT.md) · [стеки](docs/STACKS.md).
Готовые примеры и подписанные `.nob`: `examples/`.

## Что проверено

* **Ядро Rust** — 22 теста языка и рантайма (замыкания, циклы, коллекции, ввод, навигация, таймеры, сохранение, ошибки, бесконечные циклы).
* **JS** — `npm test`: 25 проверок (формат пакета, подпись, подмена, zip-slip, WASM-компилятор, CLI, Android-обёртка web-стека).
* **E2E** — `npm run test:e2e`: 60 проверок в настоящем Chromium: клики мышью по canvas-превью, ввод с клавиатуры,
  живое обновление, ошибки кода, сборка `.nob`, установка в симулятор, ИИ-агент (против моков OpenAI и Anthropic), мобильная раскладка.
  Ключевая: **байткод, скомпилированный в Studio (WASM), запускается нативным бинарником**.
* **Нативное окно** запускалось под Xvfb (X11): отрисовка, клики мышью и ввод с клавиатуры через X-события.
* **Измерения** (release): запуск → первый кадр ≈ 10 мс, ≈ 13 МБ памяти, кадр со списком из 300 строк ≈ 3,5 мс.
  Чистые вычисления в Noodle Script — интерпретатор, он медленнее JIT браузера (подробнее в `docs/RUNTIME.md`).

**Не проверялось:** окно на Windows/macOS/Wayland, запуск внутри самой Noodle.OS (её ещё нет — рантайм встраивается через `noodle_core::App`),
Flutter и Swift-сборки, реальные API OpenAI/Anthropic (только моки того же протокола).

## Устройство репозитория

```
runtime/        нативное ядро и CLI на Rust (core/, cli/, fonts/)
studio/         Noodle Studio: статический сайт (index.html, css/, js/, wasm/noodle.wasm)
tools/nob.mjs   CLI: init / check / build / verify / inspect / unpack / run / android / apk
examples/       проекты всех стеков + собранные .nob
docs/           спецификации
tests/          core.test.mjs (node:test), e2e.mjs (Playwright)
```

Studio — это статический сайт: его можно выложить на любой хостинг как есть (архив `noodle-studio-edgeone.zip`).
Studio можно собрать и в Android-приложение (оболочка WebView): `node tools/nob.mjs apk studio -o build/noodle-studio.apk`.
Приложения Noodle при этом остаются нативными для Noodle.OS и в APK не упаковываются.

## Безопасность

* Веб-стек исполняется в `<iframe sandbox>`; сеть без разрешения `network` режется CSP.
* Ключ ИИ хранится в `localStorage` устройства и отправляется только выбранному провайдеру.
* Подпись `.nob` проверяется при установке и открытии; приватный ключ разработчика не покидает браузер/`~/.noodle`.
* APK собирается с отладочной подписью — для публикации подпишите своим ключом (`apksigner`).
