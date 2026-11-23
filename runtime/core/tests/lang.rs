//! Тесты языка Noodle Script, Noodle UI и рантайма (без окна).
use noodle_core::{compile, App, Key};
use std::collections::BTreeMap;

fn mk(src: &str) -> App {
    let prog = compile(&[("t.nui".to_string(), src.to_string())]).unwrap_or_else(|d| panic!("compile: {}", d.iter().map(|x| x.to_string()).collect::<Vec<_>>().join("; ")));
    App::new(prog, 390.0, 844.0, 1.0, BTreeMap::new(), 1000.0, 0).unwrap()
}
fn texts(a: &mut App) -> Vec<String> {
    let d = a.dump();
    d["nodes"].as_array().unwrap().iter().filter(|n| n["kind"] == "text").map(|n| n["text"].as_str().unwrap().to_string()).collect()
}
fn errs(src: &str) -> Vec<String> {
    match compile(&[("t.nui".to_string(), src.to_string())]) {
        Ok(_) => vec![],
        Err(d) => d.iter().map(|x| format!("{}:{} {}", x.line, x.col, x.msg)).collect(),
    }
}
/// Выполняет выражение, возвращает его строковое представление (через экран с текстом).
fn eval(setup: &str, expr: &str) -> String {
    let mut a = mk(&format!("{}\nscreen main {{\n  text \"{{{}}}\"\n}}\n", setup, expr));
    let t = texts(&mut a);
    assert!(a.dump()["crash"].is_null(), "crash: {}", a.dump()["crash"]);
    t.first().cloned().unwrap_or_default()
}

#[test]
fn arithmetic_and_strings() {
    assert_eq!(eval("", "1 + 2 * 3"), "7");
    assert_eq!(eval("", "(1 + 2) * 3"), "9");
    assert_eq!(eval("", "10 / 4"), "2.5");
    assert_eq!(eval("", "7 % 3"), "1");
    assert_eq!(eval("", "-3 + 5"), "2");
    assert_eq!(eval("", "'a' + 'b' + 1"), "ab1");
    assert_eq!(eval("", "'привет'.upper()"), "ПРИВЕТ");
    assert_eq!(eval("", "'abc'.len"), "3");
    assert_eq!(eval("", "1 < 2 && 2 < 3"), "true");
    assert_eq!(eval("", "null ?? 5"), "5");
    assert_eq!(eval("", "0 ?? 5"), "0");
    assert_eq!(eval("", "true ? 'да' : 'нет'"), "да");
    assert_eq!(eval("", "1 == 1 && 'a' != 'b'"), "true");
    assert_eq!(eval("", "[1,2] == [1,2]"), "true");
}

#[test]
fn functions_closures_recursion() {
    let s = "fn fib(n) { if n < 2 { return n }\n return fib(n - 1) + fib(n - 2) }\n\
             fn counter() { let c = 0\n return fn() { c += 1\n return c } }\n\
             fn adder(a) { return fn(b) => a + b }";
    assert_eq!(eval(s, "fib(15)"), "610");
    let s2 = format!("{}\nlet k = counter()\nlet r = [k(), k(), k()]", s);
    assert_eq!(eval(&s2, "r"), "[1, 2, 3]");
    assert_eq!(eval(s, "adder(3)(4)"), "7");
    // независимые замыкания
    let s3 = format!("{}\nlet a = counter()\nlet b = counter()\nlet r = [a(), a(), b()]", s);
    assert_eq!(eval(&s3, "r"), "[1, 2, 1]");
}

#[test]
fn loops_and_collections() {
    let s = "fn f() {\n let s = 0\n for i in 0..5 { s += i }\n return s\n}\n\
             fn g() {\n let out = []\n for i, x in ['a','b','c'] { out.push(i + x) }\n return out\n}\n\
             fn h() {\n let n = 0\n let i = 0\n while true { i += 1\n if i > 10 { break }\n if i % 2 == 0 { continue }\n n += i }\n return n\n}\n\
             fn m() {\n let r = []\n for k, v in {b: 2, a: 1} { r.push(k + v) }\n return r\n}";
    assert_eq!(eval(s, "f()"), "10");
    assert_eq!(eval(s, "g()"), r#"["0a", "1b", "2c"]"#);
    assert_eq!(eval(s, "h()"), "25");
    assert_eq!(eval(s, "m()"), r#"["a1", "b2"]"#);
    assert_eq!(eval("", "[3,1,2].sort()"), "[1, 2, 3]");
    assert_eq!(eval("", "[1,2,3,4].filter(fn(x) => x % 2 == 0).map(fn(x) => x * 10)"), "[20, 40]");
    assert_eq!(eval("", "[1,2,3].reduce(0, fn(a, b) => a + b)"), "6");
    assert_eq!(eval("", "[...[1,2], 3, ...[4]]"), "[1, 2, 3, 4]");
    assert_eq!(eval("", "{...{a: 1}, b: 2}"), "{a: 1, b: 2}");
    assert_eq!(eval("let m = {a: {b: [10, 20]}}", "m.a.b[1]"), "20");
    assert_eq!(eval("", "list(range(1, 4))"), "[1, 2, 3]");
    assert_eq!(eval("", "'a,b,c'.split(',').join('-')"), "a-b-c");
    assert_eq!(eval("", "[5,3,9].sort_by(fn(x) => -x)"), "[9, 5, 3]");
    assert_eq!(eval("", "slice([1,2,3,4], 1, 3)"), "[2, 3]");
    assert_eq!(eval("", "[1,2,3][-1]"), "3");
    assert_eq!(eval("let l = [1,2]\nfn go() { l[2] = 9\n l[0] += 5 }\nlet _x = go()", "l"), "[6, 2, 9]");
}

#[test]
fn string_interpolation() {
    let mut a = mk("state name = 'Мир'\nstate n = 5\nscreen main {\n  text \"Привет, {name}! n={n * 2} \\{x} {[1,2].map(fn(v) => v + 1)}\"\n  text 'сырая {name}'\n}\n");
    assert_eq!(texts(&mut a), vec!["Привет, Мир! n=10 {x} [2, 3]", "сырая {name}"]);
}

#[test]
fn compile_errors_have_positions() {
    let e = errs("screen main {\n  text \"{nope}\"\n}\n");
    assert_eq!(e.len(), 1, "{:?}", e);
    assert!(e[0].contains("неизвестное имя «nope»"), "{:?}", e);
    let e = errs("fn f() {\n  let x = 1\n  x = \n}\nscreen main { }\n");
    assert!(!e.is_empty());
    let e = errs("screen main {\n  blah \"x\"\n}\n");
    assert!(e[0].contains("неизвестный элемент"), "{:?}", e);
    let e = errs("fn f() { return 1 }\nfn f() { return 2 }\nscreen main { }\n");
    assert!(e.iter().any(|x| x.contains("уже объявлено")), "{:?}", e);
    let e = errs("let a = 1\n");
    assert!(e.iter().any(|x| x.contains("экран")), "{:?}", e);
    let e = errs("fn f() { break }\nscreen main { }\n");
    assert!(e.iter().any(|x| x.contains("вне цикла")), "{:?}", e);
    assert!(errs("screen main {\n  text \"ok\" size=12\n}\n").is_empty());
}

#[test]
fn runtime_errors_do_not_crash_app() {
    let mut a = mk("fn boom() { return 1 / 0 }\nstate x = 1\nscreen main {\n  button \"go\" on=boom\n  text \"{x}\"\n}\n");
    assert!(a.tap_text("go"));
    let logs = a.take_logs();
    assert!(logs.iter().any(|l| l.level == "error" && l.text.contains("деление на ноль")), "{:?}", logs.iter().map(|l| &l.text).collect::<Vec<_>>());
    assert_eq!(texts(&mut a), vec!["1"]);
}

#[test]
fn render_error_shows_crash_screen() {
    let mut a = mk("state n = null\nscreen main {\n  text \"{n.x}\"\n}\n");
    let d = a.dump();
    assert!(d["crash"].as_str().unwrap().contains("null"));
}

#[test]
fn infinite_loop_is_stopped() {
    let mut a = mk("fn spin() { while true { } }\nscreen main {\n  button \"spin\" on=spin\n}\n");
    a.vm.step_limit = 200_000;
    assert!(a.tap_text("spin"));
    assert!(a.take_logs().iter().any(|l| l.text.contains("слишком долго")));
}

#[test]
fn buttons_state_and_each_if() {
    let mut a = mk("state items = []\nstate n = 0\nfn add() { n += 1\n items = [...items, 'п' + n] }\n\
        screen main {\n  button \"add\" on=add\n  if items.len == 0 { text \"пусто\" }\n  each items as it, i { text \"{i}:{it}\" }\n}\n");
    assert_eq!(texts(&mut a), vec!["пусто"]);
    a.tap_text("add");
    a.tap_text("add");
    assert_eq!(texts(&mut a), vec!["0:п1", "1:п2"]);
}

#[test]
fn handlers_capture_loop_variable() {
    let mut a = mk("state picked = ''\nscreen main {\n  each ['x', 'y', 'z'] as v {\n    button \"{v}\" on={ picked = v }\n  }\n  text \"выбрано:{picked}\"\n}\n");
    a.tap_text("y");
    assert!(texts(&mut a).contains(&"выбрано:y".to_string()));
    a.tap_text("z");
    assert!(texts(&mut a).contains(&"выбрано:z".to_string()));
}

#[test]
fn input_binding_and_editing() {
    let mut a = mk("state name = ''\nscreen main {\n  input bind=name placeholder=\"Имя\"\n  text \"Привет, {name}!\"\n}\n");
    a.tap_text("Имя");
    assert!(a.wants_text());
    a.text("Мир");
    assert_eq!(texts(&mut a), vec!["Привет, Мир!"]);
    a.key(Key::Backspace);
    assert_eq!(texts(&mut a), vec!["Привет, Ми!"]);
    a.key(Key::Left);
    a.key(Key::Left);
    a.text("_");
    assert_eq!(texts(&mut a), vec!["Привет, _Ми!"]);
    a.key(Key::Escape);
    assert!(!a.wants_text());
}

#[test]
fn toggle_slider_and_member_bind() {
    let mut a = mk("state todo = {done: false}\nstate vol = 10\nscreen main {\n  toggle bind=todo.done\n  slider bind=vol min=0 max=100 step=1\n  text \"{todo.done}/{vol}\"\n}\n");
    let d = a.dump();
    let t = d["nodes"].as_array().unwrap().iter().find(|n| n["kind"] == "toggle").unwrap().clone();
    a.tap(t["x"].as_f64().unwrap() as f32 + 5.0, t["y"].as_f64().unwrap() as f32 + 5.0);
    assert_eq!(texts(&mut a), vec!["true/10"]);
    let s = a.dump()["nodes"].as_array().unwrap().iter().find(|n| n["kind"] == "slider").unwrap().clone();
    let (x, w, y) = (s["x"].as_f64().unwrap() as f32, s["w"].as_f64().unwrap() as f32, s["y"].as_f64().unwrap() as f32 + 10.0);
    a.tap(x + 8.0 + (w - 16.0) * 0.5, y);
    assert_eq!(texts(&mut a), vec!["true/50"]);
}

#[test]
fn navigation_and_back() {
    let mut a = mk("screen main {\n  bar \"Главная\"\n  button \"open\" on={ goto('two') }\n}\nscreen two {\n  bar \"Второй\"\n  text \"экран два\"\n}\n");
    assert_eq!(a.screen_name(), "main");
    a.tap_text("open");
    assert_eq!(a.screen_name(), "two");
    assert!(texts(&mut a).contains(&"экран два".to_string()));
    assert!(a.tap_text("←"), "в панели есть кнопка «назад»");
    assert_eq!(a.screen_name(), "main");
    a.tap_text("open");
    assert!(a.back());
    assert_eq!(a.screen_name(), "main");
    assert!(!a.back(), "на корне back возвращает false");
}

#[test]
fn on_back_hook() {
    let mut a = mk("state asked = false\nfn on_back() { if !asked { asked = true\n toast('ещё раз')\n return true }\n return false }\nscreen main { text \"{asked}\" }\n");
    assert!(a.back());
    assert_eq!(texts(&mut a), vec!["true"]);
    assert!(!a.back());
}

#[test]
fn timers_every_after_cancel() {
    let mut a = mk("state n = 0\nstate id = 0\nfn tick() { n += 1\n if n == 3 { cancel(id) } }\nfn start() { id = every(100, tick) }\nscreen main {\n  button \"go\" on=start\n  text \"{n}\"\n}\n");
    a.tap_text("go");
    for i in 1..=20 {
        a.tick(1000.0 + i as f64 * 100.0);
    }
    assert_eq!(texts(&mut a), vec!["3"], "после n==3 таймер отменён");
    let mut b = mk("state done = false\nfn arm() { after(500, fn() { done = true }) }\nscreen main {\n  button \"arm\" on=arm\n  text \"{done}\"\n}\n");
    b.tap_text("arm");
    b.tick(1400.0);
    assert_eq!(texts(&mut b), vec!["false"]);
    b.tick(1600.0);
    assert_eq!(texts(&mut b), vec!["true"]);
}

#[test]
fn persistence_roundtrip() {
    let src = "state items = [1]\nstate name = 'a' persist\nstate keep = [1,2] persist\nfn add() { keep.push(3)\n name = 'b' }\nscreen main {\n  button \"add\" on=add\n  text \"{name}{keep}\"\n}\n";
    let mut a = mk(src);
    a.tap_text("add");
    assert!(a.storage_dirty());
    let st = a.storage().clone();
    assert!(st.contains_key("state:name") && st.contains_key("state:keep") && !st.contains_key("state:items"));
    let prog = compile(&[("t.nui".into(), src.into())]).unwrap();
    let mut b = App::new(prog, 390.0, 844.0, 1.0, st, 0.0, 0).unwrap();
    assert_eq!(texts(&mut b), vec!["b[1, 2, 3]"]);
}

#[test]
fn explicit_save_load_and_time() {
    let mut a = mk("fn go() { save('k', {a: [1, 2]}) }\nscreen main {\n  button \"go\" on=go\n  text \"{load('k', 'нет')}\"\n}\n");
    assert_eq!(texts(&mut a), vec!["нет"]);
    a.tap_text("go");
    assert_eq!(texts(&mut a), vec!["{a: [1, 2]}"]);
    assert_eq!(eval("", "time_parts(86400000 * 365).year"), "1971");
    assert_eq!(eval("", "time_parts(0).weekday"), "4");
}

#[test]
fn scroll_and_layout_geometry() {
    let mut a = mk("screen main {\n  scroll grow {\n    each range(40) as i { text \"строка {i}\" padding=8 }\n  }\n}\n");
    let before = a.dump()["nodes"][0]["y"].as_f64().unwrap();
    a.wheel(100.0, 400.0, 200.0);
    let after = a.dump()["nodes"][0]["y"].as_f64().unwrap();
    assert!(after < before - 100.0, "список прокрутился: {} → {}", before, after);
    // не прокручивается за конец
    a.wheel(100.0, 400.0, 1_000_000.0);
    let last = a.dump()["nodes"].as_array().unwrap().iter().map(|n| n["y"].as_f64().unwrap() + n["h"].as_f64().unwrap()).fold(0.0, f64::max);
    assert!(last <= 844.0 + 1.0, "последняя строка внутри экрана: {}", last);
}

#[test]
fn row_grow_and_text_wrap() {
    let mut a = mk("screen main {\n  row gap=8 {\n    text \"слева\"\n    spacer\n    button \"справа\"\n  }\n  text \"очень длинный текст который должен перенестись на несколько строк внутри экрана телефона\" padding=16\n}\n");
    let d = a.dump();
    let nodes = d["nodes"].as_array().unwrap();
    let btn = nodes.iter().find(|n| n["kind"] == "button").unwrap();
    assert!((btn["x"].as_f64().unwrap() + btn["w"].as_f64().unwrap() - 390.0).abs() < 1.0, "кнопка прижата вправо");
    let long = nodes.iter().find(|n| n["text"].as_str().unwrap().starts_with("очень")).unwrap();
    assert!(long["h"].as_f64().unwrap() > 60.0, "текст перенесён: {}", long["h"]);
    assert!(long["w"].as_f64().unwrap() <= 390.0 + 0.1);
}

#[test]
fn bytecode_roundtrip() {
    let prog = compile(&[("t.nui".into(), "state n = 41\nfn inc() { n += 1 }\nscreen main {\n  button \"+\" on=inc\n  text \"{n}\"\n}\n".into())]).unwrap();
    let bytes = prog.to_bytes();
    assert_eq!(&bytes[..4], b"NBC1");
    let prog2 = noodle_core::Program::from_bytes(&bytes).unwrap();
    let mut a = App::new(prog2, 390.0, 844.0, 1.0, BTreeMap::new(), 0.0, 0).unwrap();
    a.tap_text("+");
    assert_eq!(texts(&mut a), vec!["42"]);
    assert!(noodle_core::Program::from_bytes(b"junk").is_err());
}

#[test]
fn multi_file_projects() {
    let prog = compile(&[
        ("main.nui".into(), "screen main {\n  text \"{greet('мир')}\"\n}\n".into()),
        ("lib.ns".into(), "fn greet(n) { return 'привет, ' + n }\n".into()),
    ])
    .unwrap();
    let mut a = App::new(prog, 390.0, 844.0, 1.0, BTreeMap::new(), 0.0, 0).unwrap();
    assert_eq!(texts(&mut a), vec!["привет, мир"]);
}

#[test]
fn several_events_in_one_frame_use_fresh_state() {
    // события приходят без перерисовки между ними (быстрая печать, пакет событий)
    let mut a = mk("state s = ''\nscreen main {\n  input bind=s placeholder=\"в\"\n  text \"[{s}]\"\n}\n");
    a.tap_text("в");
    for ch in ["а", "б", "в"] {
        a.text(ch);
    }
    a.key(Key::Backspace);
    a.text("г");
    a.key(Key::Left);
    a.key(Key::Left);
    a.text("_");
    assert_eq!(texts(&mut a), vec!["[а_бг]"]);
}

/// Замеры скорости (cargo test --release -- --ignored --nocapture bench)
#[test]
#[ignore]
fn bench() {
    use std::time::Instant;
    let src = "fn fib(n) { if n < 2 { return n }\n return fib(n - 1) + fib(n - 2) }\nlet r = fib(27)\nscreen main { text \"{r}\" }\n";
    let t = Instant::now();
    let mut a = mk(src);
    println!("fib(27) = {} за {:?} (инициализация + кадр)", texts(&mut a)[0], t.elapsed());

    let mut a = mk("state items = []\nfn fill() { items = list(range(300)).map(fn(i) => {id: i, t: 'задача ' + i, done: i % 3 == 0}) }\nlet _x = fill()\n\
        screen main {\n  bar \"Список\"\n  scroll grow {\n    each items as it {\n      row gap=12 padding=12 border {\n        toggle bind=it.done\n        text \"{it.t}\" grow\n        button \"×\" ghost\n      }\n    }\n  }\n}\n");
    a.render();
    let n = 60;
    let t = Instant::now();
    for i in 0..n {
        a.wheel(100.0, 400.0, 30.0 + (i % 3) as f32);
        a.render();
    }
    let per = t.elapsed() / n;
    println!("кадр со списком на 300 элементов (сборка дерева + раскладка + отрисовка 390×844): {:?}", per);
    let mut b = mk("state items = []\nfn fill() { items = list(range(300)).map(fn(i) => {id: i, t: 'задача ' + i, done: i % 3 == 0}) }\nlet _x = fill()\n\
        screen main {\n  scroll grow {\n    each items as it {\n      row gap=12 padding=12 border {\n        toggle bind=it.done\n        text \"{it.t}\" grow\n        button \"×\" ghost\n      }\n    }\n  }\n}\n");
    b.render();
    let _ = &mut b;
}
