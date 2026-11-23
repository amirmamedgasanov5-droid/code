//! Приложение Noodle: состояние, события, жизненный цикл, кадр.
use crate::builtins;
use crate::bytecode::Program;
use crate::paint::*;
use crate::text::{Face, Fonts};
use crate::ui::{self, Cx, Kind, Node, PaintState};
use crate::value::*;
use crate::vm::{LogEntry, Nav, RtErr, Vm};
use std::collections::{BTreeMap, HashMap};
use std::rc::Rc;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Key {
    Backspace,
    Delete,
    Left,
    Right,
    Home,
    End,
    Enter,
    Escape,
    Tab,
}

struct Drag {
    scroll: Option<String>,
    start_y: f32,
    start_off: f32,
    moved: bool,
}

#[derive(Default)]
struct UiState {
    pressed: Option<String>,
    focus: Option<String>,
    caret: usize,
    scroll: HashMap<String, f32>,
    local: HashMap<String, String>,
    drag: Option<Drag>,
    caret_epoch: f64,
    caret_on: bool,
}

pub struct App {
    pub vm: Vm,
    fonts: Fonts,
    nav: Vec<String>,
    screens: HashMap<String, u32>,
    root: Node,
    ui: UiState,
    w: f32,
    h: f32,
    scale: f32,
    pixels: Vec<u8>,
    view_dirty: bool,
    paint_dirty: bool,
    toasts: Vec<(String, f64)>,
    crash: Option<String>,
    now: f64,
    persisted: Vec<(String, u32)>,
    pub frames: u64,
}

impl App {
    /// Создаёт приложение и запускает инициализацию (state/let). `storage` — сохранённые данные.
    pub fn new(prog: Program, w: f32, h: f32, scale: f32, storage: BTreeMap<String, String>, now_ms: f64, tz_min: i32) -> Result<App, String> {
        let screens: HashMap<String, u32> = prog.screens.iter().cloned().collect();
        let first = prog.screens.iter().find(|(n, _)| n == "main").or(prog.screens.first()).map(|(n, _)| n.clone()).ok_or("в программе нет экранов")?;
        let states = prog.states.clone();
        let mut vm = Vm::new(prog);
        vm.host.storage = storage;
        vm.host.now_ms = now_ms;
        vm.host.tz_min = tz_min;
        vm.host.rng ^= (now_ms as u64).wrapping_mul(0x2545F4914F6CDD1D) | 1;
        vm.run_init().map_err(|e| format!("ошибка инициализации: {}", e.render()))?;
        let mut persisted = Vec::new();
        for s in &states {
            if s.persist {
                let key = format!("state:{}", s.name);
                if let Some(js) = vm.host.storage.get(&key) {
                    if let Ok(j) = serde_json::from_str::<serde_json::Value>(js) {
                        vm.globals[s.global as usize] = Value::from_json(&j);
                    }
                }
                persisted.push((key, s.global));
            }
        }
        let n = (w * scale).round() as usize * (h * scale).round() as usize * 4;
        let mut app = App {
            vm,
            fonts: Fonts::new(),
            nav: vec![first],
            screens,
            root: Node::root(vec![]),
            ui: UiState::default(),
            w,
            h,
            scale,
            pixels: vec![0; n],
            view_dirty: true,
            paint_dirty: true,
            toasts: vec![],
            crash: None,
            now: now_ms,
            persisted,
            frames: 0,
        };
        app.sync_persist();
        Ok(app)
    }

    pub fn resize(&mut self, w: f32, h: f32, scale: f32) {
        self.w = w;
        self.h = h;
        self.scale = scale;
        self.pixels = vec![0; (w * scale).round() as usize * (h * scale).round() as usize * 4];
        self.view_dirty = true;
    }
    pub fn size_px(&self) -> (usize, usize) {
        ((self.w * self.scale).round() as usize, (self.h * self.scale).round() as usize)
    }
    pub fn screen_name(&self) -> &str {
        self.nav.last().map(|s| s.as_str()).unwrap_or("")
    }
    pub fn wants_text(&self) -> bool {
        self.ui.focus.is_some()
    }
    pub fn wants_exit(&self) -> bool {
        self.vm.host.exit
    }

    // ───────────── кадр ─────────────

    pub fn needs_render(&self) -> bool {
        self.view_dirty || self.paint_dirty
    }

    /// Возвращает пиксели RGBA (w*scale × h*scale). Перерисовывает при необходимости.
    pub fn render(&mut self) -> &[u8] {
        if self.view_dirty {
            self.rebuild();
            self.view_dirty = false;
            self.paint_dirty = true;
        }
        if self.paint_dirty {
            self.paint_all();
            self.paint_dirty = false;
            self.frames += 1;
        }
        &self.pixels
    }

    fn rebuild(&mut self) {
        self.crash = None;
        let name = self.nav.last().cloned().unwrap_or_default();
        let pid = match self.screens.get(&name) {
            Some(p) => *p,
            None => {
                self.crash = Some(format!("нет экрана «{}»", name));
                return;
            }
        };
        self.vm.steps = 0;
        let f = Value::Func(Rc::new(Closure { proto: pid, caps: vec![] }));
        let back = Value::Native(builtins::lookup("back").unwrap());
        match self.vm.call(&f, vec![]) {
            Ok(v) => {
                let kids = ui::build_nodes(&v, &format!("{}:", name), self.nav.len(), &back);
                self.root = Node::root(kids);
                let local = &self.ui.local;
                ui::each_mut(&mut self.root, &mut |n| {
                    if matches!(n.kind, Kind::Input | Kind::Area) && n.bind.is_none() && matches!(n.value, Value::Null) {
                        if let Some(t) = local.get(&n.key) {
                            n.value = Value::str(t);
                        }
                    }
                });
                let mut cx = Cx { fonts: &mut self.fonts, scroll: &self.ui.scroll };
                ui::measure(&mut self.root, &mut cx, self.w);
                ui::place(&mut self.root, &mut cx, 0.0, 0.0, self.w, self.h);
                // актуальные (зажатые) смещения прокрутки
                let mut upd = Vec::new();
                ui::each(&self.root, &mut |n| {
                    if n.kind == Kind::Scroll {
                        upd.push((n.key.clone(), n.value.as_num().unwrap_or(0.0) as f32));
                    }
                });
                for (k, v) in upd {
                    self.ui.scroll.insert(k, v);
                }
            }
            Err(e) => {
                let text = e.render();
                self.vm.log("error", text.clone());
                self.crash = Some(text);
            }
        }
    }

    fn paint_all(&mut self) {
        let (pw, ph) = self.size_px();
        let mut buf = std::mem::take(&mut self.pixels);
        if buf.len() != pw * ph * 4 {
            buf = vec![0; pw * ph * 4];
        }
        {
            let mut p = Painter::new(&mut buf, pw as i32, ph as i32, self.scale);
            p.clear(BG);
            if let Some(msg) = &self.crash {
                p.text(&mut self.fonts, "ОШИБКА", 24.0, 40.0, Face::SemiBold, 12.0, 3.0, DIM);
                let lines = self.fonts.wrap(msg, Face::Mono, 12.0, 0.0, self.w - 48.0);
                for (i, l) in lines.iter().enumerate().take(40) {
                    p.text(&mut self.fonts, &l.text, 24.0, 70.0 + i as f32 * 17.0, Face::Mono, 12.0, 0.0, FG);
                }
            } else {
                let ps = PaintState { pressed: self.ui.pressed.as_deref(), focus: self.ui.focus.as_deref(), caret: self.ui.caret, caret_on: self.ui.caret_on };
                ui::paint(&self.root, &mut p, &mut self.fonts, &ps);
            }
            // тост
            if let Some((t, _)) = self.toasts.last() {
                let tw = self.fonts.width(t, Face::Regular, 14.0, 0.0).min(self.w - 48.0);
                let (bw, bh) = (tw + 32.0, 40.0);
                let (bx, by) = ((self.w - bw) / 2.0, self.h - 72.0 - bh);
                p.fill_round(bx, by, bw, bh, 2.0, FG);
                p.text(&mut self.fonts, t, bx + 16.0, by + 10.0, Face::Regular, 14.0, 0.0, BG);
            }
        }
        self.pixels = buf;
    }

    // ───────────── события ─────────────

    fn report(&mut self, e: RtErr) {
        let text = e.render();
        let first = e.msg.lines().next().unwrap_or("").to_string();
        self.vm.log("error", text);
        self.toast(format!("Ошибка: {}", first));
    }

    fn toast(&mut self, t: String) {
        let until = self.now + 2400.0;
        self.toasts.push((t, until));
        self.paint_dirty = true;
    }

    fn call(&mut self, f: &Value, args: Vec<Value>) {
        self.vm.steps = 0;
        if let Err(e) = self.vm.call(f, args) {
            self.report(e);
        }
    }

    fn sync_persist(&mut self) {
        for (key, g) in self.persisted.clone() {
            let js = self.vm.globals[g as usize].to_json().to_string();
            if self.vm.host.storage.get(&key) != Some(&js) {
                self.vm.host.storage.insert(key, js);
                self.vm.host.storage_dirty = true;
            }
        }
    }

    fn after_event(&mut self) {
        let navs: Vec<Nav> = self.vm.host.nav.drain(..).collect();
        for n in navs {
            match n {
                Nav::Goto(s) => {
                    if self.screens.contains_key(&s) {
                        self.nav.push(s);
                        self.ui.focus = None;
                    } else {
                        self.vm.log("error", format!("goto: нет экрана «{}»", s));
                        self.toast(format!("Нет экрана «{}»", s));
                    }
                }
                Nav::Back => {
                    if self.nav.len() > 1 {
                        self.nav.pop();
                        self.ui.focus = None;
                    }
                }
            }
        }
        let ts: Vec<String> = self.vm.host.toasts.drain(..).collect();
        for t in ts {
            self.toast(t);
        }
        self.sync_persist();
        self.vm.host.redraw = false;
        self.view_dirty = true;
    }

    /// Актуализирует дерево интерфейса перед обработкой события (если состояние менялось с прошлого кадра).
    fn fresh(&mut self) {
        if self.view_dirty {
            self.rebuild();
            self.view_dirty = false;
            self.paint_dirty = true;
        }
    }

    fn at(&self, px: f32, py: f32) -> (f32, f32) {
        (px / self.scale, py / self.scale)
    }

    pub fn pointer_down(&mut self, px: f32, py: f32) {
        self.fresh();
        let (x, y) = self.at(px, py);
        let mut chain = Vec::new();
        ui::hit_chain(&self.root, x, y, &mut chain);
        let target = chain.iter().rev().find(|n| n.interactive()).map(|n| (n.key.clone(), n.kind));
        let scroll = chain.iter().rev().find(|n| n.kind == Kind::Scroll).map(|n| (n.key.clone(), self.ui.scroll.get(&n.key).copied().unwrap_or(0.0)));
        self.ui.drag = Some(Drag { scroll: scroll.as_ref().map(|s| s.0.clone()), start_y: y, start_off: scroll.map(|s| s.1).unwrap_or(0.0), moved: false });
        match target {
            Some((key, Kind::Button)) | Some((key, Kind::Toggle)) => {
                self.ui.pressed = Some(key);
                self.paint_dirty = true;
            }
            Some((key, Kind::Slider)) => {
                self.ui.pressed = Some(key.clone());
                self.slide(&key, x);
            }
            Some((key, Kind::Input)) | Some((key, Kind::Area)) => {
                let node = ui::find(&self.root, &key).unwrap();
                let len = node.input_value().chars().count();
                let mut caret = len;
                if node.kind == Kind::Input {
                    let val = node.input_value();
                    let px_ = node.px();
                    let mut acc = 0.0;
                    caret = 0;
                    for ch in val.chars() {
                        let a = self.fonts.advance(Face::Regular, ch, px_);
                        if node.x + acc + a / 2.0 > x {
                            break;
                        }
                        acc += a;
                        caret += 1;
                    }
                }
                self.ui.focus = Some(key);
                self.ui.caret = caret.min(len);
                self.ui.caret_epoch = self.now;
                self.ui.caret_on = true;
                self.paint_dirty = true;
            }
            _ => {
                if self.ui.focus.take().is_some() {
                    self.paint_dirty = true;
                }
            }
        }
    }

    fn slide(&mut self, key: &str, x: f32) {
        let (bind, on, min, max, step, nx, nw) = match ui::find(&self.root, key) {
            Some(n) => (n.bind.clone(), n.on.clone(), n.min, n.max, n.step, n.x, n.w),
            None => return,
        };
        let t = (((x - (nx + 8.0)) / (nw - 16.0)).clamp(0.0, 1.0)) as f64;
        let mut v = min + t * (max - min);
        if step > 0.0 {
            v = (v / step).round() * step;
        }
        if let Some(b) = bind {
            self.call(&b, vec![Value::Num(v)]);
        }
        if let Some(f) = on {
            self.call(&f, vec![Value::Num(v)]);
        }
        self.after_event();
    }

    pub fn pointer_move(&mut self, px: f32, py: f32) {
        self.fresh();
        let (x, y) = self.at(px, py);
        if let Some(d) = &mut self.ui.drag {
            if let Some(sk) = d.scroll.clone() {
                let dy = y - d.start_y;
                if d.moved || dy.abs() > 8.0 {
                    d.moved = true;
                    let off = d.start_off - dy;
                    let slider = self.ui.pressed.as_ref().map_or(false, |k| ui::find(&self.root, k).map_or(false, |n| n.kind == Kind::Slider));
                    if !slider {
                        self.ui.pressed = None;
                        self.ui.scroll.insert(sk, off.max(0.0));
                        self.view_dirty = true;
                    }
                }
            }
        }
        if let Some(k) = self.ui.pressed.clone() {
            if ui::find(&self.root, &k).map_or(false, |n| n.kind == Kind::Slider) {
                self.slide(&k, x);
            }
        }
    }

    pub fn pointer_up(&mut self, px: f32, py: f32) {
        self.fresh();
        let (x, y) = self.at(px, py);
        let moved = self.ui.drag.as_ref().map_or(false, |d| d.moved);
        self.ui.drag = None;
        let pressed = self.ui.pressed.take();
        self.paint_dirty = true;
        if moved {
            return;
        }
        if let Some(key) = pressed {
            let (kind, on, bind, val, inside) = match ui::find(&self.root, &key) {
                Some(n) => (n.kind, n.on.clone(), n.bind.clone(), n.value.clone(), x >= n.x && x < n.x + n.w && y >= n.y && y < n.y + n.h),
                None => return,
            };
            if !inside {
                return;
            }
            match kind {
                Kind::Button => {
                    if let Some(f) = on {
                        self.call(&f, vec![]);
                        self.after_event();
                    }
                }
                Kind::Toggle => {
                    let nv = Value::Bool(!val.truthy());
                    if let Some(b) = bind {
                        self.call(&b, vec![nv.clone()]);
                    }
                    if let Some(f) = on {
                        self.call(&f, vec![nv]);
                    }
                    self.after_event();
                }
                _ => {}
            }
        }
    }

    pub fn wheel(&mut self, px: f32, py: f32, dy: f32) {
        self.fresh();
        let (x, y) = self.at(px, py);
        let mut chain = Vec::new();
        ui::hit_chain(&self.root, x, y, &mut chain);
        if let Some(k) = chain.iter().rev().find(|n| n.kind == Kind::Scroll).map(|n| n.key.clone()) {
            let cur = self.ui.scroll.get(&k).copied().unwrap_or(0.0);
            self.ui.scroll.insert(k, (cur + dy / self.scale).max(0.0));
            self.view_dirty = true;
        }
    }

    fn edit<F: FnOnce(&mut Vec<char>, &mut usize) -> bool>(&mut self, f: F) {
        let key = match &self.ui.focus {
            Some(k) => k.clone(),
            None => return,
        };
        let (bind, on, number, cur) = match ui::find(&self.root, &key) {
            Some(n) => (n.bind.clone(), n.on.clone(), n.number, n.input_value()),
            None => return,
        };
        let mut chars: Vec<char> = cur.chars().collect();
        let mut caret = self.ui.caret.min(chars.len());
        let changed = f(&mut chars, &mut caret);
        self.ui.caret = caret;
        self.ui.caret_epoch = self.now;
        self.ui.caret_on = true;
        self.paint_dirty = true;
        if !changed {
            return;
        }
        let s: String = chars.into_iter().collect();
        let v = if number {
            if s.is_empty() { Value::Null } else { builtins::to_num(&Value::str(&s)) }
        } else {
            Value::str(&s)
        };
        match bind {
            Some(b) => self.call(&b, vec![v.clone()]),
            None => {
                self.ui.local.insert(key, s);
            }
        }
        if let Some(f) = on {
            self.call(&f, vec![v]);
        }
        self.after_event();
    }

    pub fn text(&mut self, s: &str) {
        self.fresh();
        let number = self.ui.focus.as_ref().and_then(|k| ui::find(&self.root, k)).map_or(false, |n| n.number);
        let ins: Vec<char> = s.chars().filter(|c| !c.is_control() || *c == '\n').filter(|c| !number || c.is_ascii_digit() || matches!(c, '.' | '-' | ',')).collect();
        if ins.is_empty() {
            return;
        }
        let is_area = self.ui.focus.as_ref().and_then(|k| ui::find(&self.root, k)).map_or(false, |n| n.kind == Kind::Area);
        self.edit(move |t, c| {
            for ch in ins {
                if ch == '\n' && !is_area {
                    continue;
                }
                t.insert(*c, ch);
                *c += 1;
            }
            true
        });
    }

    pub fn key(&mut self, k: Key) {
        self.fresh();
        let focus = match &self.ui.focus {
            Some(f) => f.clone(),
            None => return,
        };
        let (kind, submit) = match ui::find(&self.root, &focus) {
            Some(n) => (n.kind, n.on_submit.clone()),
            None => return,
        };
        match k {
            Key::Backspace => self.edit(|t, c| {
                if *c > 0 {
                    t.remove(*c - 1);
                    *c -= 1;
                    true
                } else {
                    false
                }
            }),
            Key::Delete => self.edit(|t, c| {
                if *c < t.len() {
                    t.remove(*c);
                    true
                } else {
                    false
                }
            }),
            Key::Left => self.edit(|_, c| {
                *c = c.saturating_sub(1);
                false
            }),
            Key::Right => self.edit(|t, c| {
                *c = (*c + 1).min(t.len());
                false
            }),
            Key::Home => self.edit(|_, c| {
                *c = 0;
                false
            }),
            Key::End => self.edit(|t, c| {
                *c = t.len();
                false
            }),
            Key::Enter => {
                if kind == Kind::Area {
                    self.edit(|t, c| {
                        t.insert(*c, '\n');
                        *c += 1;
                        true
                    });
                } else if let Some(f) = submit {
                    self.call(&f, vec![]);
                    self.after_event();
                }
            }
            Key::Escape => {
                self.ui.focus = None;
                self.paint_dirty = true;
            }
            Key::Tab => {
                let mut inputs = Vec::new();
                ui::each(&self.root, &mut |n| {
                    if matches!(n.kind, Kind::Input | Kind::Area) && !n.disabled {
                        inputs.push(n.key.clone());
                    }
                });
                if let Some(i) = inputs.iter().position(|k| *k == focus) {
                    let nk = inputs[(i + 1) % inputs.len()].clone();
                    let len = ui::find(&self.root, &nk).map_or(0, |n| n.input_value().chars().count());
                    self.ui.focus = Some(nk);
                    self.ui.caret = len;
                    self.paint_dirty = true;
                }
            }
        }
    }

    /// Системная кнопка «Назад». true — приложение обработало сама; false — можно закрывать.
    pub fn back(&mut self) -> bool {
        if self.ui.focus.take().is_some() {
            self.paint_dirty = true;
            return true;
        }
        if let Some(i) = self.vm.prog.globals.iter().position(|g| g == "on_back") {
            let f = self.vm.globals[i].clone();
            if matches!(f, Value::Func(_)) {
                self.vm.steps = 0;
                match self.vm.call(&f, vec![]) {
                    Ok(v) if v.truthy() => {
                        self.after_event();
                        return true;
                    }
                    Ok(_) => {}
                    Err(e) => self.report(e),
                }
            }
        }
        if self.nav.len() > 1 {
            self.nav.pop();
            self.view_dirty = true;
            return true;
        }
        false
    }

    /// Таймеры, мигание каретки, исчезновение тостов. Возвращает true, если нужен новый кадр.
    pub fn tick(&mut self, now_ms: f64) -> bool {
        self.now = now_ms;
        self.vm.host.now_ms = now_ms;
        let mut fired = false;
        let (due, rest): (Vec<_>, Vec<_>) = std::mem::take(&mut self.vm.host.timers).into_iter().partition(|t| t.fire_at <= now_ms);
        self.vm.host.timers = rest;
        for mut t in due {
            let f = t.f.clone();
            self.call(&f, vec![]);
            fired = true;
            if let Some(iv) = t.interval {
                t.fire_at += iv;
                if t.fire_at <= now_ms {
                    t.fire_at = now_ms + iv;
                }
                // таймер мог быть отменён в обработчике
                if !self.vm.host.cancelled.contains(&t.id) {
                    self.vm.host.timers.push(t);
                }
            }
        }
        self.vm.host.cancelled.clear();
        if fired {
            // отменённые в обработчике interval-таймеры: cancel() удаляет только из списка, поэтому вернули — проверим по id
            self.after_event();
        }
        let before = self.toasts.len();
        self.toasts.retain(|(_, until)| *until > now_ms);
        if self.toasts.len() != before {
            self.paint_dirty = true;
        }
        if self.ui.focus.is_some() {
            let on = ((now_ms - self.ui.caret_epoch) / 530.0).floor() as i64 % 2 == 0;
            if on != self.ui.caret_on {
                self.ui.caret_on = on;
                self.paint_dirty = true;
            }
        }
        self.needs_render()
    }

    // ───────────── наблюдение ─────────────

    pub fn take_logs(&mut self) -> Vec<LogEntry> {
        std::mem::take(&mut self.vm.host.logs)
    }
    pub fn take_vibrations(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.vm.host.vibrations)
    }
    pub fn storage_dirty(&mut self) -> bool {
        std::mem::replace(&mut self.vm.host.storage_dirty, false)
    }
    pub fn storage(&self) -> &BTreeMap<String, String> {
        &self.vm.host.storage
    }
    pub fn clear_storage(&mut self) {
        self.vm.host.storage.clear();
        self.vm.host.storage_dirty = true;
    }

    /// Описание видимых элементов (для тестов, автоматизации и доступности).
    pub fn dump(&mut self) -> serde_json::Value {
        self.render();
        let mut v = Vec::new();
        ui::each(&self.root, &mut |n| {
            let kind = match n.kind {
                Kind::Text => "text",
                Kind::Button => "button",
                Kind::Input => "input",
                Kind::Area => "area",
                Kind::Toggle => "toggle",
                Kind::Slider => "slider",
                Kind::Progress => "progress",
                _ => return,
            };
            let text = match n.kind {
                Kind::Input | Kind::Area | Kind::Toggle | Kind::Slider | Kind::Progress => n.input_value(),
                _ => n.text.clone(),
            };
            v.push(serde_json::json!({"kind": kind, "text": text, "placeholder": n.placeholder, "key": n.key, "x": n.x, "y": n.y, "w": n.w, "h": n.h, "disabled": n.disabled}));
        });
        serde_json::json!({"screen": self.screen_name(), "crash": self.crash, "nodes": v})
    }

    /// Нажимает первый интерактивный элемент с таким текстом/подсказкой. Для тестов.
    pub fn tap_text(&mut self, label: &str) -> bool {
        self.render();
        let mut hit = None;
        ui::each(&self.root, &mut |n| {
            if hit.is_none() && n.interactive() && (n.text == label || n.placeholder == label) {
                hit = Some((n.x + n.w / 2.0, n.y + n.h / 2.0));
            }
        });
        match hit {
            Some((x, y)) => {
                self.tap(x * self.scale, y * self.scale);
                true
            }
            None => false,
        }
    }

    pub fn tap(&mut self, px: f32, py: f32) {
        self.pointer_down(px, py);
        self.pointer_up(px, py);
        self.render();
    }
}
