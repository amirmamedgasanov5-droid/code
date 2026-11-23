# Noodle Studio — IDE и сборщик приложений для Noodle.OS

Чёрно-белая IDE в духе VS Code, которая собирает приложения в установочный пакет **`.nob`**
(Noodle Bundle — аналог `.apk`) и, при необходимости, в настоящий Android **APK**.

* редактор с вкладками, подсветкой, проводником, поиском по проекту, палитрой команд (`Ctrl+P`, `Ctrl+Shift+P`)
* **живое превью** в «устройстве Noodle.OS»: приложение кликабельно, есть консоль, «Назад», домашний экран, поворот
* **ИИ-агент**: подключите любой OpenAI-совместимый API (OpenAI, Gemini, OpenRouter, DeepSeek, Groq, Ollama…)
  или Claude — агент читает/правит файлы, запускает превью, смотрит ошибки консоли; изменения можно откатить
* сборка **`.nob`**: подписанный ECDSA, с проверкой хэшей; установка в симулятор
* экспорт Android-проекта / сборка APK одной командой; открытие `.nob` и собранных нами `.apk` обратно в проект
* работает и в браузере, и как Android-приложение (сам Studio собирается в APK)

## Быстрый старт

```bash
npm run studio                      # http://localhost:8080  (только Node 20+, зависимостей нет)

node tools/nob.mjs init my-app      # новый проект на Noodle UI
node tools/nob.mjs build my-app     # → my-app/<id>-<версия>.nob  (подписан)
node tools/nob.mjs verify my-app/*.nob
ANDROID_HOME=~/Android/Sdk node tools/nob.mjs apk my-app     # → APK (нужны JDK 17+, Gradle, Android SDK 34)
```

APK самого Studio: `node tools/nob.mjs apk studio -o build/noodle-studio.apk`
(то же делает CI — `.github/workflows/ci.yml`).

## Языки и стеки

| Стек | Язык | Превью | `.nob` | APK |
|---|---|---|---|---|
| **Noodle UI** | `.nui` — декларативный UI + JS | да | да | да |
| **HTML+CSS+JS** | + WebAssembly (Rust, C, Zig, Go…) | да | да | да |
| **Kotlin** | Kotlin, Android Views | нет | — | да |
| **Flutter** | Dart | нет | — | да, нужен Flutter SDK |
| **Swift** | SwiftUI | нет | — | только Xcode/macOS |

Подробно, с примерами и справочником по Noodle UI: [`docs/STACKS.md`](docs/STACKS.md).
Формат пакета, подпись, манифест, API рантайма `noodle.*`: [`docs/NOB-FORMAT.md`](docs/NOB-FORMAT.md).

## Готовые примеры

`examples/` — проекты всех стеков и собранные подписанные пакеты `nui-counter.nob`, `nui-tasks.nob`, `web-notes.nob`.
Откройте `.nob` в Studio (меню проекта → «Открыть .nob / .apk / .zip») — он превратится в редактируемый проект.

## Что проверено

Автоматически (`npm test` — 24 теста, `npm run test:e2e` — 56 проверок в настоящем Chromium):
сборка и подпись пакетов, обнаружение подмены файлов/хэшей/zip-slip, парсер Noodle UI, клики в превью,
редактор (автоскобки, отмена), живое обновление, консоль приложения, блокировка сети без разрешения,
«Назад», сохранение данных, установка в симулятор и запуск с домашнего экрана, ИИ-агент против мок-серверов
OpenAI и Anthropic (инструменты, ошибки, откат), мобильная раскладка.

Реально собраны (Android SDK 34, Gradle, AGP 8.5): APK на Noodle UI, на HTML/JS, на Kotlin и APK самого Studio;
`aapt2`/`apksigner` подтвердили package, версию, разрешения и подпись.

**Не проверялось** (нет среды): запуск APK на физическом устройстве/эмуляторе, Flutter-сборка, Swift/Xcode,
работа с реальными API OpenAI/Anthropic/Gemini (только мок-серверы того же протокола).

## Устройство репозитория

```
studio/        Noodle Studio (статический веб-сайт, без сборки): index.html, css/, js/
  js/nob.js        формат .nob: zip, подпись, проверка (браузер и Node)
  js/nui.js        парсер Noodle UI;  js/nui-engine.js — его рендерер
  js/noodle-runtime.js   объект noodle.* внутри приложений
  js/android.js    генератор Gradle/WebView-проекта
  js/ai.js         агент и адаптеры провайдеров
tools/nob.mjs  CLI;  tools/serve.mjs — статический сервер
examples/      примеры и готовые .nob
docs/          спецификации и руководства
tests/         core.test.mjs (node:test), e2e.mjs (Playwright)
```

## Безопасность

* Приложения исполняются в `<iframe sandbox>` без доступа к данным Studio; сеть без `network` режется CSP.
* Ключ ИИ хранится в `localStorage` устройства и отправляется только выбранному провайдеру.
  Не используйте на общем компьютере.
* Подпись `.nob` проверяется при установке и при открытии; приватный ключ разработчика не покидает браузер/`~/.noodle`.
* APK собирается с отладочной подписью — для публикации подпишите его своим ключом (`apksigner`).
