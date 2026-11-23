//! C-ABI для WebAssembly (без wasm-bindgen): Studio и Node вызывают эти функции напрямую.
use crate::{compile, App, Key, Program};
use std::cell::RefCell;
use std::collections::BTreeMap;

thread_local! {
    static APP: RefCell<Option<App>> = RefCell::new(None);
    static OUT: RefCell<Vec<u8>> = RefCell::new(Vec::new());
    static PIXELS: RefCell<Vec<u8>> = RefCell::new(Vec::new());
    static LAST_FRAME: RefCell<u64> = RefCell::new(u64::MAX);
}

fn set_out(v: Vec<u8>) {
    OUT.with(|o| *o.borrow_mut() = v);
}
fn with_app<R>(f: impl FnOnce(&mut App) -> R) -> Option<R> {
    APP.with(|a| a.borrow_mut().as_mut().map(f))
}
unsafe fn bytes<'a>(p: *const u8, n: usize) -> &'a [u8] {
    std::slice::from_raw_parts(p, n)
}
unsafe fn string(p: *const u8, n: usize) -> String {
    String::from_utf8_lossy(bytes(p, n)).to_string()
}

#[no_mangle]
pub extern "C" fn alloc(n: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(n.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}
#[no_mangle]
pub unsafe extern "C" fn free_buf(p: *mut u8, n: usize) {
    drop(Vec::from_raw_parts(p, 0, n.max(1)));
}
#[no_mangle]
pub extern "C" fn out_ptr() -> *const u8 {
    OUT.with(|o| o.borrow().as_ptr())
}
#[no_mangle]
pub extern "C" fn out_len() -> usize {
    OUT.with(|o| o.borrow().len())
}
#[no_mangle]
pub extern "C" fn pixels_ptr() -> *const u8 {
    PIXELS.with(|o| o.borrow().as_ptr())
}
#[no_mangle]
pub extern "C" fn pixels_len() -> usize {
    PIXELS.with(|o| o.borrow().len())
}

/// Вход: JSON {"files":[["имя","исходник"],…]}. 1 — OUT = байткод; 0 — OUT = JSON-массив диагностик.
#[no_mangle]
pub unsafe extern "C" fn compile_json(p: *const u8, n: usize) -> u32 {
    let j: serde_json::Value = match serde_json::from_slice(bytes(p, n)) {
        Ok(j) => j,
        Err(e) => {
            set_out(format!("[{{\"file\":\"\",\"line\":1,\"col\":1,\"msg\":{:?}}}]", e.to_string()).into_bytes());
            return 0;
        }
    };
    let files: Vec<(String, String)> = j["files"].as_array().map(|a| a.iter().filter_map(|f| Some((f[0].as_str()?.to_string(), f[1].as_str()?.to_string()))).collect()).unwrap_or_default();
    match compile(&files) {
        Ok(prog) => {
            set_out(prog.to_bytes());
            1
        }
        Err(d) => {
            set_out(serde_json::to_vec(&d).unwrap_or_default());
            0
        }
    }
}

#[no_mangle]
pub unsafe extern "C" fn app_load(prog_p: *const u8, prog_n: usize, w: f32, h: f32, scale: f32, st_p: *const u8, st_n: usize, now: f64, tz: i32) -> u32 {
    let prog = match Program::from_bytes(bytes(prog_p, prog_n)) {
        Ok(p) => p,
        Err(e) => {
            set_out(e.into_bytes());
            return 0;
        }
    };
    let storage: BTreeMap<String, String> = serde_json::from_slice(bytes(st_p, st_n)).unwrap_or_default();
    match App::new(prog, w, h, scale, storage, now, tz) {
        Ok(app) => {
            APP.with(|a| *a.borrow_mut() = Some(app));
            LAST_FRAME.with(|l| *l.borrow_mut() = u64::MAX);
            1
        }
        Err(e) => {
            set_out(e.into_bytes());
            0
        }
    }
}

#[no_mangle]
pub extern "C" fn app_resize(w: f32, h: f32, scale: f32) {
    with_app(|a| a.resize(w, h, scale));
}
#[no_mangle]
pub extern "C" fn app_tick(now: f64) -> u32 {
    with_app(|a| a.tick(now) as u32).unwrap_or(0)
}
/// Перерисовывает при необходимости. 1 — появился новый кадр (читать pixels_ptr/pixels_len).
#[no_mangle]
pub extern "C" fn app_render() -> u32 {
    with_app(|a| {
        let px = a.render().to_vec();
        let fr = a.frames;
        let changed = LAST_FRAME.with(|l| std::mem::replace(&mut *l.borrow_mut(), fr) != fr);
        if changed {
            PIXELS.with(|p| *p.borrow_mut() = px);
        }
        changed as u32
    })
    .unwrap_or(0)
}
#[no_mangle]
pub extern "C" fn app_pointer(kind: u32, x: f32, y: f32) {
    with_app(|a| match kind {
        0 => a.pointer_down(x, y),
        1 => a.pointer_move(x, y),
        _ => a.pointer_up(x, y),
    });
}
#[no_mangle]
pub extern "C" fn app_wheel(x: f32, y: f32, dy: f32) {
    with_app(|a| a.wheel(x, y, dy));
}
#[no_mangle]
pub extern "C" fn app_key(code: u32) {
    let k = match code {
        0 => Key::Backspace,
        1 => Key::Delete,
        2 => Key::Left,
        3 => Key::Right,
        4 => Key::Home,
        5 => Key::End,
        6 => Key::Enter,
        7 => Key::Escape,
        _ => Key::Tab,
    };
    with_app(|a| a.key(k));
}
#[no_mangle]
pub unsafe extern "C" fn app_text(p: *const u8, n: usize) {
    let s = string(p, n);
    with_app(|a| a.text(&s));
}
#[no_mangle]
pub extern "C" fn app_back() -> u32 {
    with_app(|a| a.back() as u32).unwrap_or(0)
}
#[no_mangle]
pub unsafe extern "C" fn app_tap_text(p: *const u8, n: usize) -> u32 {
    let s = string(p, n);
    with_app(|a| a.tap_text(&s) as u32).unwrap_or(0)
}
/// Биты: 1 — нужен ввод текста, 2 — приложение просит закрыться, 4 — изменилось хранилище
#[no_mangle]
pub extern "C" fn app_status() -> u32 {
    with_app(|a| (a.wants_text() as u32) | ((a.wants_exit() as u32) << 1) | ((a.storage_dirty() as u32) << 2)).unwrap_or(0)
}
#[no_mangle]
pub extern "C" fn app_logs() {
    let v = with_app(|a| a.take_logs().into_iter().map(|l| serde_json::json!({"level": l.level, "text": l.text})).collect::<Vec<_>>()).unwrap_or_default();
    set_out(serde_json::to_vec(&v).unwrap_or_default());
}
#[no_mangle]
pub extern "C" fn app_storage() {
    let v = with_app(|a| a.storage().clone()).unwrap_or_default();
    set_out(serde_json::to_vec(&v).unwrap_or_default());
}
#[no_mangle]
pub extern "C" fn app_dump() {
    let v = with_app(|a| a.dump()).unwrap_or(serde_json::Value::Null);
    set_out(serde_json::to_vec(&v).unwrap_or_default());
}
#[no_mangle]
pub extern "C" fn app_vibrations() {
    let v = with_app(|a| a.take_vibrations()).unwrap_or_default();
    set_out(serde_json::to_vec(&v).unwrap_or_default());
}
