# Нативный рантайм Noodle

`runtime/` — Rust-workspace из двух крейтов:

```
runtime/
  core/   noodle-core: компилятор, виртуальная машина, UI-движок. Без зависимости от ОС и окна
    src/lexer.rs parser.rs ast.rs compiler.rs bytecode.rs   Noodle Script + Noodle UI → байткод (формат NBC1)
    src/vm.rs builtins.rs value.rs                          стековая VM, замыкания, более 70 встроенных функций
    src/ui.rs text.rs paint.rs                              дерево виджетов, flex-раскладка, шрифты, растеризатор
    src/app.rs                                              состояние приложения, события, таймеры, навигация, кадр
    src/wasm.rs                                             C-ABI для WebAssembly (Studio, Node)
    tests/lang.rs                                           22 теста языка и рантайма
  cli/    noodle: бинарник — check / build / run (окно) / shot (PNG) / test (сценарии)
  fonts/  Inter и JetBrains Mono (OFL), подмножества: латиница + кириллица
```

Одно и то же ядро запускается в трёх местах — это принципиально: превью в Studio исполняет **тот же код**, что и ОС.

| Где | Как |
|---|---|
| окно ОС / десктоп | `noodle run app.nob` (бэкенд на `minifb`: X11/Wayland/Windows/macOS) |
| без окна: тесты, скриншоты, CI | `noodle shot` / `noodle test` — отрисовка в PNG, сценарии нажатий |
| браузер и Node | `studio/wasm/noodle.wasm` (≈0,9 МБ): компиляция и исполнение в Studio, `nob build` |

## Сборка

```bash
cd runtime
cargo build --release                 # → target/release/noodle  (≈2 МБ, один файл, шрифты внутри)
cargo test --release -p noodle-core   # 22 теста
./build-wasm.sh                       # пересобрать studio/wasm/noodle.wasm (нужна цель wasm32-unknown-unknown)
```

## CLI

```bash
noodle check my-app                         # ошибки с файлом:строка:колонка
noodle build my-app -o app.nbc              # только байткод
noodle run   my-app | app.nob | app.nbc     # окно; данные: ~/.local/share/noodle/<id>/storage.json
noodle shot  app.nob -o shot.png --scale 2 --steps "tap:+;tap:+;wait:300" --dump
noodle test  app.nob --steps "tap:Новая задача;type:Хлеб;key:enter" --expect "Хлеб" --expect-not "Пусто"
```

Шаги сценария: `tap:Текст` (кнопка, поле по подсказке, переключатель) · `tapxy:x,y` · `type:строка` · `key:enter|backspace|delete|left|right|home|end|tab|escape` ·
`wait:мс` (время виртуальное: таймеры срабатывают, кадры рисуются) · `scroll:dy` · `back`.
`noodle test` падает с кодом 1, если приложение упало, нет ожидаемого текста или есть запрещённый.

`noodle run` читает `.nob` напрямую; подпись проверяет `nob verify` (см. `docs/NOB-FORMAT.md`) — в ОС это делает установщик.

## Встраивание в Noodle.OS

Ядро не знает про окна, файловую систему и ОС — оно получает события и отдаёт пиксели:

```rust
let mut app = noodle_core::App::new(program, 390.0, 844.0, /*scale*/ 2.0, storage, now_ms, tz_min)?;
app.pointer_down(x, y); app.pointer_move(x, y); app.pointer_up(x, y);   // физические пиксели
app.wheel(x, y, dy); app.text("привет"); app.key(Key::Backspace); app.back();
if app.tick(now_ms) || app.needs_render() { let rgba: &[u8] = app.render(); /* показать */ }
for l in app.take_logs() { /* print() и ошибки */ }
if app.storage_dirty() { /* сохранить app.storage() */ }
```

ОС отвечает за: окно/композитор, сохранение `storage`, вибрацию (`take_vibrations()`), установку и проверку подписи пакета.
Программа загружается из `Program::from_bytes(main.nbc)`.

## Производительность (измерено в этой среде, release-сборка)

| Что | Результат |
|---|---|
| запуск процесса → загрузка `.nob` → первый кадр → выход | ≈ 10 мс (медиана), пик памяти ≈ 13 МБ |
| кадр: пересборка дерева + раскладка + отрисовка 390×844, список из 300 строк | ≈ 3,5 мс |
| размер бинарника `noodle` | ≈ 2 МБ |
| `fib(27)` на Noodle Script (интерпретатор) | ≈ 90 мс |
| `fib(27)` на JavaScript (V8, JIT) для сравнения | ≈ 3 мс |

То есть выигрыш нативного рантайма — в отсутствии браузера, DOM, JIT-прогрева и сборщика мусора: быстрый старт, малая память,
стабильное время кадра. **Чистые вычисления** в Noodle Script — это интерпретатор, он заметно медленнее JIT браузера;
для интерфейсных приложений это не бутылочное горлышко, а тяжёлые расчёты стоит выносить в будущие нативные модули.
Сравнений с конкретными браузерами/устройствами здесь не делалось.

## Ограничения текущей версии

* Отрисовка программная (CPU, RGBA): для телефонных разрешений быстро, GPU-бэкенд — задача ОС.
* Нет изображений, сети, выделения/буфера обмена, анимаций, доступности для скринридеров.
* Шрифты — подмножество Inter (латиница, кириллица, стрелки, базовые символы) и JetBrains Mono.
* Один процесс на приложение; изоляция между приложениями — ответственность ОС.
* Окно проверено под Xvfb (X11): отрисовка, клики, ввод. Windows/macOS/Wayland-бэкенды `minifb` не запускались.
