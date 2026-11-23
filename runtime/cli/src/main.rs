//! noodle — CLI рантайма Noodle: check / build / run / shot / test.
use noodle_core::{compile, App, Diag, Key, Program};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::exit;

const HELP: &str = "noodle — рантайм Noodle.OS

  noodle check <папка|файлы>                    проверить исходники (.nui/.ns), код выхода 1 при ошибках
  noodle build <папка> -o app.nbc               скомпилировать в байткод
  noodle run   <папка|.nob|.nbc> [--size 390x844] [--scale 1]   запустить в окне
  noodle shot  <папка|.nob|.nbc> -o out.png [--size 390x844] [--scale 2] [--steps \"tap:+;wait:300\"] [--dump]
  noodle test  <папка|.nob|.nbc> --steps \"…\" --expect \"текст\" [--expect-not \"текст\"]
  noodle info                                   версия и встроенные функции

Шаги (--steps, через «;»): tap:Текст  tapxy:x,y  type:строка  key:enter|backspace|left|right|home|end|tab|escape
                           wait:мс  scroll:dy  back  sleep не нужен — время виртуальное
";

fn die(msg: impl AsRef<str>) -> ! {
    eprintln!("noodle: {}", msg.as_ref());
    exit(1)
}

struct Opts {
    pos: Vec<String>,
    out: Option<String>,
    size: (f32, f32),
    scale: f32,
    steps: String,
    dump: bool,
    expect: Vec<String>,
    expect_not: Vec<String>,
    json: bool,
}

fn parse(args: &[String]) -> Opts {
    let mut o = Opts { pos: vec![], out: None, size: (390.0, 844.0), scale: 1.0, steps: String::new(), dump: false, expect: vec![], expect_not: vec![], json: false };
    let mut i = 0;
    while i < args.len() {
        let a = &args[i];
        let mut val = || {
            i += 1;
            args.get(i).cloned().unwrap_or_else(|| die(format!("у {} нет значения", a)))
        };
        match a.as_str() {
            "-o" => o.out = Some(val()),
            "--size" => {
                let v = val();
                let (w, h) = v.split_once('x').unwrap_or_else(|| die("--size WxH"));
                o.size = (w.parse().unwrap_or_else(|_| die("--size WxH")), h.parse().unwrap_or_else(|_| die("--size WxH")));
            }
            "--scale" => o.scale = val().parse().unwrap_or_else(|_| die("--scale N")),
            "--steps" => o.steps = val(),
            "--dump" => o.dump = true,
            "--json" => o.json = true,
            "--expect" => o.expect.push(val()),
            "--expect-not" => o.expect_not.push(val()),
            _ => o.pos.push(a.clone()),
        }
        i += 1;
    }
    o
}

// ───────────── загрузка исходников/пакетов ─────────────

fn walk(dir: &Path, base: &Path, out: &mut Vec<PathBuf>) {
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let p = e.path();
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.starts_with('.') || name == "build" || name == "node_modules" {
                continue;
            }
            if p.is_dir() {
                walk(&p, base, out);
            } else if matches!(p.extension().and_then(|e| e.to_str()), Some("nui") | Some("ns")) {
                out.push(p.strip_prefix(base).unwrap().to_path_buf());
            }
        }
    }
}

fn read_sources(dir: &Path) -> Vec<(String, String)> {
    let mut rel = Vec::new();
    walk(dir, dir, &mut rel);
    let entry = fs::read_to_string(dir.join("manifest.json")).ok().and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()).and_then(|j| j["entry"].as_str().map(String::from));
    rel.sort();
    let mut files: Vec<(String, String)> = rel
        .into_iter()
        .map(|p| {
            let name = p.to_string_lossy().replace('\\', "/");
            let src = fs::read_to_string(dir.join(&p)).unwrap_or_else(|e| die(format!("{}: {}", name, e)));
            (name, src)
        })
        .collect();
    if let Some(e) = entry {
        if let Some(i) = files.iter().position(|f| f.0 == e) {
            let f = files.remove(i);
            files.insert(0, f);
        }
    }
    files
}

fn zip_entries(b: &[u8]) -> Result<Vec<(String, Vec<u8>)>, String> {
    let u16le = |i: usize| u16::from_le_bytes([b[i], b[i + 1]]) as usize;
    let u32le = |i: usize| u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]]) as usize;
    if b.len() < 22 {
        return Err("слишком короткий файл".into());
    }
    let mut eocd = None;
    for i in (0..=b.len() - 22).rev().take(65600) {
        if u32le(i) == 0x06054b50 {
            eocd = Some(i);
            break;
        }
    }
    let eocd = eocd.ok_or("это не ZIP/.nob")?;
    let (count, mut p) = (u16le(eocd + 10), u32le(eocd + 16));
    let mut out = Vec::new();
    for _ in 0..count {
        if p + 46 > b.len() || u32le(p) != 0x02014b50 {
            return Err("повреждён каталог архива".into());
        }
        let (method, csize, nlen, elen, clen, lho) = (u16le(p + 10), u32le(p + 20), u16le(p + 28), u16le(p + 30), u16le(p + 32), u32le(p + 42));
        let name = String::from_utf8_lossy(&b[p + 46..p + 46 + nlen]).to_string();
        p += 46 + nlen + elen + clen;
        if name.ends_with('/') {
            continue;
        }
        let start = lho + 30 + u16le(lho + 26) + u16le(lho + 28);
        let raw = &b[start..start + csize];
        let data = match method {
            0 => raw.to_vec(),
            8 => miniz_oxide::inflate::decompress_to_vec(raw).map_err(|e| format!("{}: {:?}", name, e))?,
            m => return Err(format!("метод сжатия {} не поддерживается", m)),
        };
        out.push((name, data));
    }
    Ok(out)
}

struct Loaded {
    prog: Program,
    id: String,
}

fn load(path: &str) -> Loaded {
    let p = Path::new(path);
    let (id_hint, prog) = if p.is_dir() {
        let files = read_sources(p);
        if files.is_empty() {
            die(format!("в «{}» нет файлов .nui/.ns", path));
        }
        let id = fs::read_to_string(p.join("manifest.json")).ok().and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()).and_then(|j| j["id"].as_str().map(String::from)).unwrap_or_else(|| "app".into());
        match compile(&files) {
            Ok(pr) => (id, pr),
            Err(d) => report(&d, false),
        }
    } else {
        let bytes = fs::read(p).unwrap_or_else(|e| die(format!("{}: {}", path, e)));
        if bytes.starts_with(b"NBC1") {
            ("app".into(), Program::from_bytes(&bytes).unwrap_or_else(|e| die(e)))
        } else {
            let entries = zip_entries(&bytes).unwrap_or_else(|e| die(e));
            let id = entries.iter().find(|e| e.0 == "manifest.json").and_then(|e| serde_json::from_slice::<serde_json::Value>(&e.1).ok()).and_then(|j| j["id"].as_str().map(String::from)).unwrap_or_else(|| "app".into());
            if let Some((_, nbc)) = entries.iter().find(|e| e.0 == "app/main.nbc") {
                (id, Program::from_bytes(nbc).unwrap_or_else(|e| die(e)))
            } else {
                let mut files: Vec<(String, String)> = entries.iter().filter(|e| e.0.starts_with("app/") && (e.0.ends_with(".nui") || e.0.ends_with(".ns"))).map(|e| (e.0[4..].to_string(), String::from_utf8_lossy(&e.1).to_string())).collect();
                files.sort();
                if files.is_empty() {
                    die("в пакете нет ни байткода (app/main.nbc), ни исходников .nui/.ns");
                }
                match compile(&files) {
                    Ok(pr) => (id, pr),
                    Err(d) => report(&d, false),
                }
            }
        }
    };
    Loaded { prog, id: id_hint }
}

fn report(d: &[Diag], json: bool) -> ! {
    if json {
        println!("{}", serde_json::to_string(d).unwrap());
    } else {
        for x in d {
            eprintln!("{}", x);
        }
        eprintln!("\nошибок: {}", d.len());
    }
    exit(1)
}

// ───────────── хранилище ─────────────

fn data_dir(id: &str) -> PathBuf {
    let base = std::env::var("NOODLE_DATA").map(PathBuf::from).unwrap_or_else(|_| {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
        PathBuf::from(home).join(".local/share/noodle")
    });
    base.join(id)
}
fn load_storage(id: &str) -> BTreeMap<String, String> {
    fs::read_to_string(data_dir(id).join("storage.json")).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}
fn save_storage(id: &str, st: &BTreeMap<String, String>) {
    let d = data_dir(id);
    if fs::create_dir_all(&d).is_ok() {
        let _ = fs::write(d.join("storage.json"), serde_json::to_string(st).unwrap());
    }
}

fn flush_logs(app: &mut App) {
    for l in app.take_logs() {
        match l.level {
            "error" => eprintln!("[error] {}", l.text),
            _ => println!("{}", l.text),
        }
    }
}

// ───────────── сценарии (headless) ─────────────

fn parse_key(s: &str) -> Option<Key> {
    Some(match s {
        "enter" => Key::Enter,
        "backspace" => Key::Backspace,
        "delete" => Key::Delete,
        "left" => Key::Left,
        "right" => Key::Right,
        "home" => Key::Home,
        "end" => Key::End,
        "tab" => Key::Tab,
        "escape" => Key::Escape,
        _ => return None,
    })
}

fn run_steps(app: &mut App, steps: &str, now: &mut f64) -> Result<(), String> {
    for raw in steps.split(';') {
        let step = raw.trim();
        if step.is_empty() {
            continue;
        }
        let (cmd, arg) = step.split_once(':').unwrap_or((step, ""));
        match cmd {
            "tap" => {
                if !app.tap_text(arg) {
                    return Err(format!("шаг «{}»: элемент не найден", step));
                }
            }
            "tapxy" => {
                let (x, y) = arg.split_once(',').ok_or("tapxy:x,y")?;
                let s = app.size_px().0 as f32 / 390.0f32.max(1.0);
                let _ = s;
                app.tap(x.trim().parse().map_err(|_| "tapxy: x")?, y.trim().parse().map_err(|_| "tapxy: y")?);
            }
            "type" => {
                app.render();
                app.text(arg);
                app.render();
            }
            "key" => app.key(parse_key(arg).ok_or_else(|| format!("неизвестная клавиша «{}»", arg))?),
            "scroll" => {
                let (w, h) = app.size_px();
                app.render();
                app.wheel(w as f32 / 2.0, h as f32 / 2.0, arg.parse().map_err(|_| "scroll:dy")?);
            }
            "back" => {
                app.back();
            }
            "wait" => {
                let ms: f64 = arg.parse().map_err(|_| "wait:мс")?;
                let end = *now + ms;
                while *now < end {
                    *now = (*now + 16.0).min(end);
                    app.tick(*now);
                    app.render();
                }
            }
            _ => return Err(format!("неизвестный шаг «{}»", cmd)),
        }
        app.render();
    }
    Ok(())
}

fn make_app(l: Loaded, o: &Opts, persistent: bool) -> (App, String, f64) {
    let storage = if persistent { load_storage(&l.id) } else { BTreeMap::new() };
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0);
    let id = l.id.clone();
    let app = App::new(l.prog, o.size.0, o.size.1, o.scale, storage, now, 0).unwrap_or_else(|e| die(e));
    (app, id, now)
}

fn save_png(path: &str, app: &mut App) {
    let (w, h) = app.size_px();
    let px = app.render().to_vec();
    let f = fs::File::create(path).unwrap_or_else(|e| die(format!("{}: {}", path, e)));
    let mut enc = png::Encoder::new(std::io::BufWriter::new(f), w as u32, h as u32);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    enc.write_header().and_then(|mut wr| wr.write_image_data(&px)).unwrap_or_else(|e| die(format!("PNG: {}", e)));
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cmd = args.first().map(|s| s.as_str()).unwrap_or("help");
    let o = parse(args.get(1..).unwrap_or(&[]));
    match cmd {
        "check" => {
            let mut files = Vec::new();
            for p in &o.pos {
                let path = Path::new(p);
                if path.is_dir() {
                    files.extend(read_sources(path));
                } else {
                    files.push((p.clone(), fs::read_to_string(p).unwrap_or_else(|e| die(format!("{}: {}", p, e)))));
                }
            }
            if files.is_empty() {
                die("нечего проверять");
            }
            match compile(&files) {
                Ok(pr) => {
                    if o.json {
                        println!("[]");
                    } else {
                        println!("ok: файлов {}, экранов {}, функций {}", files.len(), pr.screens.len(), pr.funcs.len());
                    }
                }
                Err(d) => report(&d, o.json),
            }
        }
        "build" => {
            let src = o.pos.first().unwrap_or_else(|| die("укажите папку"));
            let l = load(src);
            let out = o.out.clone().unwrap_or_else(|| "app.nbc".into());
            let bytes = l.prog.to_bytes();
            fs::write(&out, &bytes).unwrap_or_else(|e| die(format!("{}: {}", out, e)));
            println!("✔ {} ({} байт)", out, bytes.len());
        }
        "shot" | "test" => {
            let src = o.pos.first().unwrap_or_else(|| die("укажите приложение"));
            let l = load(src);
            let (mut app, _, mut now) = make_app(l, &o, false);
            app.render();
            if let Err(e) = run_steps(&mut app, &o.steps, &mut now) {
                flush_logs(&mut app);
                die(e);
            }
            flush_logs(&mut app);
            let dump = app.dump();
            if o.dump {
                println!("{}", serde_json::to_string_pretty(&dump).unwrap());
            }
            if let Some(out) = &o.out {
                save_png(out, &mut app);
                println!("✔ {}", out);
            }
            if let Some(c) = dump["crash"].as_str() {
                die(format!("приложение упало: {}", c));
            }
            let all: String = dump["nodes"].as_array().unwrap().iter().flat_map(|n| [n["text"].as_str().unwrap_or(""), "\n", n["placeholder"].as_str().unwrap_or(""), "\n"]).collect();
            let mut bad = false;
            for e in &o.expect {
                if !all.contains(e.as_str()) {
                    eprintln!("✘ ожидался текст «{}»", e);
                    bad = true;
                }
            }
            for e in &o.expect_not {
                if all.contains(e.as_str()) {
                    eprintln!("✘ не ожидался текст «{}»", e);
                    bad = true;
                }
            }
            if bad {
                exit(1);
            }
            if cmd == "test" {
                println!("✔ проверки пройдены");
            }
        }
        "run" => run_window(&o),
        "info" => {
            println!("noodle {} — Noodle Script + Noodle UI", env!("CARGO_PKG_VERSION"));
            println!("встроенные функции: {}", noodle_core::builtins::names().join(", "));
        }
        _ => {
            print!("{}", HELP);
            exit(if cmd == "help" || cmd == "--help" { 0 } else { 1 });
        }
    }
}

#[cfg(feature = "window")]
fn run_window(o: &Opts) {
    use minifb::{InputCallback, Key as K, KeyRepeat, MouseButton, MouseMode, Scale, Window, WindowOptions};
    use std::cell::RefCell;
    use std::rc::Rc;
    let src = o.pos.first().unwrap_or_else(|| die("укажите приложение"));
    let l = load(src);
    let (mut app, id, start) = make_app(l, o, true);
    let (w, h) = app.size_px();
    let mut win = Window::new("Noodle", w, h, WindowOptions { scale: Scale::X1, resize: false, ..WindowOptions::default() }).unwrap_or_else(|e| die(format!("не удалось открыть окно: {}", e)));
    win.set_target_fps(60);
    struct Chars(Rc<RefCell<Vec<char>>>);
    impl InputCallback for Chars {
        fn add_char(&mut self, c: u32) {
            if let Some(ch) = char::from_u32(c) {
                self.0.borrow_mut().push(ch);
            }
        }
    }
    let chars = Rc::new(RefCell::new(Vec::new()));
    win.set_input_callback(Box::new(Chars(chars.clone())));
    let t0 = std::time::Instant::now();
    let auto_exit: Option<u128> = std::env::var("NOODLE_AUTOEXIT_MS").ok().and_then(|s| s.parse().ok());
    let mut down = false;
    let mut buf = vec![0u32; w * h];
    let mut last_pos = (0.0f32, 0.0f32);
    while win.is_open() && !app.wants_exit() {
        let now = start + t0.elapsed().as_millis() as f64;
        app.tick(now);
        if let Some((x, y)) = win.get_mouse_pos(MouseMode::Clamp) {
            let ld = win.get_mouse_down(MouseButton::Left);
            if ld && !down {
                app.pointer_down(x, y);
            }
            if x != last_pos.0 || y != last_pos.1 {
                app.pointer_move(x, y);
            }
            if !ld && down {
                app.pointer_up(x, y);
            }
            down = ld;
            last_pos = (x, y);
            if let Some((_, dy)) = win.get_scroll_wheel() {
                if dy != 0.0 {
                    app.wheel(x, y, -dy * 40.0);
                }
            }
        }
        let typed: String = chars.borrow_mut().drain(..).filter(|c| !c.is_control()).collect();
        if !typed.is_empty() {
            app.text(&typed);
        }
        for k in win.get_keys_pressed(KeyRepeat::Yes) {
            match k {
                K::Backspace => app.key(Key::Backspace),
                K::Delete => app.key(Key::Delete),
                K::Left => app.key(Key::Left),
                K::Right => app.key(Key::Right),
                K::Home => app.key(Key::Home),
                K::End => app.key(Key::End),
                K::Enter | K::NumPadEnter => app.key(Key::Enter),
                K::Tab => app.key(Key::Tab),
                K::Escape => {
                    if !app.back() {
                        return;
                    }
                }
                _ => {}
            }
        }
        let px = app.render().to_vec();
        for (i, c) in px.chunks_exact(4).enumerate() {
            buf[i] = ((c[0] as u32) << 16) | ((c[1] as u32) << 8) | c[2] as u32;
        }
        flush_logs(&mut app);
        if app.storage_dirty() {
            save_storage(&id, app.storage());
        }
        win.update_with_buffer(&buf, w, h).unwrap_or_else(|e| die(e.to_string()));
        if auto_exit.map_or(false, |ms| t0.elapsed().as_millis() > ms) {
            break;
        }
    }
    save_storage(&id, app.storage());
}

#[cfg(not(feature = "window"))]
fn run_window(_: &Opts) {
    die("этот бинарник собран без окна (feature «window»); используйте shot/test");
}
