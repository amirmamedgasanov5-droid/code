# На чём писать приложения Noodle.OS

Стек задаётся полем `stack` в `manifest.json` и выбирается при создании проекта (Studio → меню проектов → **Новый проект**,
или `nob init --template …`).

| Стек | Язык | Исполняется | Превью в Studio | `.nob` | Проверено |
|---|---|---|---|---|---|
| **`noodle`** — основной | Noodle UI + Noodle Script (`.nui`, `.ns`) | **нативным рантаймом Noodle** (VM + свой UI-движок) | да, то же ядро через WebAssembly | да, с байткодом | тесты языка, окно под X11, e2e в Chromium |
| `web` — совместимость | HTML + CSS + JS (+ WebAssembly) | в песочнице (WebView / iframe) | да | да | сборка APK-обёртки, e2e |
| `kotlin` | Kotlin | как Android-приложение | нет | — (APK) | сборка APK |
| `flutter` | Dart | как Flutter-приложение | нет | — (APK) | **не проверялось** (нет Flutter SDK) |
| `swift` | Swift / SwiftUI | как iOS-приложение | нет | — (IPA) | **не проверялось** (нужен macOS) |

**Нативные приложения Noodle — это стек `noodle`.** Они не зависят ни от Android, ни от iOS, ни от браузера: компилятор делает
байткод, пакет `.nob` содержит его, ОС запускает его рантаймом `noodle-core`. Остальные стеки оставлены как мост: они нужны,
чтобы уже сейчас запускать приложения на телефонах и переносить существующий код.

Язык и справочник: [`docs/NOODLE-LANG.md`](NOODLE-LANG.md). Рантайм, CLI, встраивание, измерения: [`docs/RUNTIME.md`](RUNTIME.md).
Формат пакета и подпись: [`docs/NOB-FORMAT.md`](NOB-FORMAT.md).

## Noodle (нативный)

```bash
node tools/nob.mjs init my-app --template noodle-counter     # шаблоны: noodle-counter | noodle-tasks | noodle-notes | noodle-stopwatch
node tools/nob.mjs check my-app                              # ошибки с файлом:строка:колонка
node tools/nob.mjs build my-app                              # компиляция в байткод + подписанный .nob
cd runtime && cargo build --release                          # нативный рантайм
runtime/target/release/noodle run my-app/dev.noodle.x-1.0.0.nob
```

В Studio: **Запустить** (превью на canvas, настоящий рантайм через WASM), **Собрать** (скачивает `.nob`), **Установить в симулятор**.
Ошибки кода видны в панели «Проблемы» по мере набора.

## Веб (совместимость)

Обычное веб-приложение: `index.html` + файлы, ES-модули, `fetch` файлов проекта, объект `noodle` (см. приложение в `NOB-FORMAT.md`).
Собирается в `.nob` и в APK с WebView:

```bash
node tools/nob.mjs init my-web --template counter && node tools/nob.mjs apk my-web
```

## Kotlin

Полноценный Gradle-проект (Android Views). `id`, `version`, `versionCode` берутся из `manifest.json`.

```bash
node tools/nob.mjs init my-kt --template kotlin
ANDROID_HOME=~/Android/Sdk node tools/nob.mjs apk my-kt
```

## Flutter

`node tools/nob.mjs apk my-flutter` копирует проект в `build/native`, при необходимости делает `flutter create --platforms=android .` и
`flutter build apk --debug`. Нужны Flutter SDK в `PATH` и `ANDROID_HOME`. Ветка написана по документации и **не запускалась**.

## Swift

SwiftUI + `project.yml` для XcodeGen. На macOS: `xcodegen generate && xcodebuild -scheme NoodleSwift build`. **Не проверялось.**
