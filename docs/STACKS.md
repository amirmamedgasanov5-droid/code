# На чём писать приложения Noodle.OS

Стек задаётся полем `stack` в `manifest.json` и выбирается при создании проекта
(Studio → меню проектов → **Новый проект**, или `nob init --template …`).

| Стек | Язык | Превью в Studio | `.nob` | APK | Проверено в этом репозитории |
|---|---|---|---|---|---|
| **Noodle UI** (`nui`) | `.nui` + JS-выражения | да, кликабельное | да | да (WebView-обёртка) | сборка APK, UI-тесты в Chromium |
| **HTML+CSS+JS** (`web`) | HTML, CSS, JS, `.wasm` | да | да | да (WebView-обёртка) | сборка APK, UI-тесты в Chromium |
| **Kotlin** (`kotlin`) | Kotlin, Android Views | нет | нет | да (Gradle) | сборка APK через `nob apk` |
| **Flutter** (`flutter`) | Dart | нет | нет | да, нужен Flutter SDK | **не проверялось** (SDK нет в среде) |
| **Swift** (`swift`) | Swift, SwiftUI | нет | нет | нет — только IPA на macOS | **не проверялось** (нужен macOS) |

Нативные стеки не умеют превью в браузере: браузер не исполняет Kotlin/Dart/Swift. Для них Studio даёт
редактор с подсветкой, ИИ-агента, экспорт проекта, а собирает их Gradle/Flutter/Xcode.
Любой язык, который компилируется в WebAssembly (Rust, C/C++, Zig, Go/TinyGo, AssemblyScript), можно
использовать в стеке `web`: положите `.wasm` в проект и загрузите через `fetch('mod.wasm')` — превью и
APK отдают его с правильным типом.

## Noodle UI

Декларативный язык интерфейсов: дерево элементов + состояние + функции. Нет HTML и CSS.

```nui
app "Counter"

state count = 0 persist              // persist — значение сохраняется между запусками

fn inc() { count += 1 }              // тело функции — JavaScript

screen main {                        // экран; «main» (или первый) открывается при старте
  column grow center gap=24 {
    text "{count}" size=96 weight=200   // {…} — выражение, перерисовывается само
    button "+" primary on=inc
    button "Сброс" ghost on={ count = 0; toast("ок") }
  }
}
```

### Верхний уровень

* `state имя = выражение [persist]`
* `fn имя(параметры) { JS }` и `async fn …`
* `screen имя { элементы }`
* В коде доступны: все `state` и `fn`, `goto("экран")`, `back()`, `toast(текст)`, `render()`, `noodle`, любые JS-глобалы.
* Можно разложить код по нескольким `.nui` файлам — они объединяются.

### Элементы

| Элемент | Назначение | Атрибуты |
|---|---|---|
| `column`, `row`, `box` | контейнеры | `gap`, `padding`, `width`, `height`, `grow`, `center`, `align`, `justify`, `wrap`, `bg`, `radius`, `border` |
| `scroll` | прокручиваемый контейнер | как у `column` |
| `text "…"` | текст | `size`, `weight`, `color`, `dim`, `caps`, `mono`, `center`, `grow`, `padding` |
| `button "…"` | кнопка | `on`, `primary`, `ghost`, `disabled={…}`, `full`, `grow`, `size`, `width`, `height` |
| `input` / `area` | поле ввода | `bind=переменная`, `placeholder`, `type=number`, `on`, `grow` |
| `toggle` | переключатель | `bind=переменная`, `on` |
| `image` | картинка | `src="файл.png"` |
| `bar "Заголовок"` | верхняя панель (кнопка «назад» появляется сама) | вложенные элементы справа |
| `spacer`, `divider` | отступ, линия | `size` |
| `if условие { … }` | условный блок | |
| `each список as элемент[, индекс] { … }` | цикл | |

Значения атрибутов: число `gap=8`, строка `bg="#111"`, ссылка на функцию `on=inc`, выражение `on={ n++ }`,
`disabled={n > 5}`, флаг без значения `dim`. Строки поддерживают интерполяцию `"Привет, {name}"`
(`\{` — буквальная скобка). Ошибки разбора показываются с номером строки в панели «Проблемы» и на экране приложения.

Пример с циклом, условием и привязкой: `examples/nui-tasks/app.nui`.

## HTML + CSS + JS

Обычное веб-приложение: `index.html` + файлы. Работают ES-модули (`import './util.js'`), `fetch('data.json')`
для файлов проекта, `localStorage`/`noodle.storage`. Ограничения превью: циклические импорты модулей не
поддерживаются; внешние ресурсы (CDN) блокируются без разрешения `network` — приложение должно работать офлайн.

## Kotlin

Шаблон — полноценный Gradle-проект (Android Views, без Compose, чтобы сборка была лёгкой).
`id`, `version`, `versionCode` берутся из `manifest.json` (`app/build.gradle` читает его).

```bash
node tools/nob.mjs init my-app --template kotlin
ANDROID_HOME=~/Android/Sdk node tools/nob.mjs apk my-app     # → my-app/build/<id>-<version>.apk
```

## Flutter

```bash
node tools/nob.mjs init my-app --template flutter
node tools/nob.mjs apk my-app        # копирует в build/native, при необходимости делает `flutter create --platforms=android .`
```

Нужны Flutter SDK в `PATH` (или `FLUTTER=/путь/flutter`) и `ANDROID_HOME`. Эта ветка написана по документации
Flutter, но в среде разработки Noodle Studio Flutter SDK не был доступен — **она не запускалась**.

## Swift

Шаблон SwiftUI + `project.yml` для XcodeGen. На macOS: `xcodegen generate && xcodebuild -scheme NoodleSwift build`.
Сборка iOS возможна только на macOS с Xcode — **не проверялось**.
