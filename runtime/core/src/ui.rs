//! Дерево интерфейса: сборка из значений скрипта, раскладка (flex-подобная), отрисовка, hit-test.
use crate::paint::*;
use crate::text::{Face, Fonts, Line};
use crate::value::*;
use std::collections::HashMap;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Kind {
    Column,
    Row,
    Box,
    Scroll,
    Text,
    Button,
    Input,
    Area,
    Toggle,
    Slider,
    Image,
    Spacer,
    Divider,
    Progress,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Dim {
    Auto,
    Px(f32),
    Pct(f32),
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Align {
    Stretch,
    Start,
    Center,
    End,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Justify {
    Start,
    Center,
    End,
    Between,
}

#[derive(Clone, Debug)]
pub struct Style {
    pub pad: [f32; 4], // top, right, bottom, left
    pub gap: f32,
    pub width: Dim,
    pub height: Dim,
    pub grow: f32,
    pub align: Option<Align>,
    pub justify: Justify,
    pub bg: Option<Color>,
    pub color: Option<Color>,
    pub radius: f32,
    pub border: bool,
    pub border_b: bool,
    pub size: f32,
    pub weight: u16,
    pub dim: bool,
    pub caps: bool,
    pub mono: bool,
    pub text_center: bool,
    pub primary: bool,
    pub ghost: bool,
    pub full: bool,
    pub min_h: f32,
    pub ls: f32,
    pub flat: bool,
}

impl Default for Style {
    fn default() -> Style {
        Style { pad: [0.0; 4], gap: 0.0, width: Dim::Auto, height: Dim::Auto, grow: 0.0, align: None, justify: Justify::Start, bg: None, color: None, radius: 0.0, border: false, border_b: false, size: 16.0, weight: 400, dim: false, caps: false, mono: false, text_center: false, primary: false, ghost: false, full: false, min_h: 0.0, ls: 0.0, flat: false }
    }
}

pub struct Node {
    pub kind: Kind,
    pub key: String,
    pub text: String,
    pub style: Style,
    pub children: Vec<Node>,
    pub on: Option<Value>,
    pub on_submit: Option<Value>,
    pub bind: Option<Value>,
    pub value: Value,
    pub placeholder: String,
    pub disabled: bool,
    pub password: bool,
    pub number: bool,
    pub min: f64,
    pub max: f64,
    pub step: f64,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub content_h: f32,
    pub lines: Vec<Line>,
    cache: Option<(f32, f32, f32)>,
}

impl Node {
    fn new(kind: Kind, key: String) -> Node {
        Node { kind, key, text: String::new(), style: Style::default(), children: vec![], on: None, on_submit: None, bind: None, value: Value::Null, placeholder: String::new(), disabled: false, password: false, number: false, min: 0.0, max: 100.0, step: 1.0, x: 0.0, y: 0.0, w: 0.0, h: 0.0, content_h: 0.0, lines: vec![], cache: None }
    }
    pub fn root(children: Vec<Node>) -> Node {
        let mut n = Node::new(Kind::Column, "root".into());
        n.children = children;
        n.style.align = Some(Align::Stretch);
        n
    }
    pub fn interactive(&self) -> bool {
        matches!(self.kind, Kind::Button | Kind::Input | Kind::Area | Kind::Toggle | Kind::Slider) && !self.disabled
    }
    pub fn face(&self) -> Face {
        Fonts::face_for(if self.kind == Kind::Button && self.style.weight == 400 { 500 } else { self.style.weight }, self.style.mono)
    }
    pub fn px(&self) -> f32 {
        self.style.size
    }
    pub fn color(&self) -> Color {
        self.style.color.unwrap_or(if self.style.dim { DIM } else { FG })
    }
    pub fn input_value(&self) -> String {
        match &self.value {
            Value::Null => String::new(),
            v => v.display(),
        }
    }
}

// ───────────── сборка дерева из значений ─────────────

struct Attrs(Option<MapRef>);
impl Attrs {
    fn get(&self, k: &str) -> Option<Value> {
        self.0.as_ref().and_then(|m| m.borrow().get(k).cloned())
    }
    fn num(&self, k: &str) -> Option<f32> {
        match self.get(k) {
            Some(Value::Num(n)) => Some(n as f32),
            Some(Value::Str(s)) => s.trim().parse::<f32>().ok(),
            _ => None,
        }
    }
    fn flag(&self, k: &str) -> bool {
        self.get(k).map_or(false, |v| v.truthy())
    }
    fn string(&self, k: &str) -> Option<String> {
        self.get(k).map(|v| v.display())
    }
    fn dim(&self, k: &str) -> Dim {
        match self.get(k) {
            Some(Value::Num(n)) => Dim::Px(n as f32),
            Some(Value::Str(s)) => {
                if let Some(p) = s.strip_suffix('%') {
                    p.trim().parse::<f32>().map(|v| Dim::Pct(v / 100.0)).unwrap_or(Dim::Auto)
                } else {
                    s.parse::<f32>().map(Dim::Px).unwrap_or(Dim::Auto)
                }
            }
            _ => Dim::Auto,
        }
    }
    fn color(&self, k: &str) -> Option<Color> {
        self.string(k).and_then(|s| Color::parse(&s))
    }
}

pub fn build_nodes(v: &Value, prefix: &str, nav_depth: usize, back: &Value) -> Vec<Node> {
    let mut out = Vec::new();
    if let Value::List(l) = v {
        for (i, c) in l.borrow().iter().enumerate() {
            if let Some(n) = build_one(c, &format!("{}{}", prefix, i), nav_depth, back) {
                out.push(n);
            }
        }
    }
    out
}

fn build_one(v: &Value, key: &str, nav_depth: usize, back: &Value) -> Option<Node> {
    let m = match v {
        Value::Map(m) => m.clone(),
        _ => return None,
    };
    let get = |k: &str| m.borrow().get(k).cloned();
    let tag = get("t")?.display();
    let a = Attrs(match get("a") {
        Some(Value::Map(am)) => Some(am),
        _ => None,
    });
    let kind = match tag.as_str() {
        "column" => Kind::Column,
        "row" | "bar" => Kind::Row,
        "box" => Kind::Box,
        "scroll" => Kind::Scroll,
        "text" => Kind::Text,
        "button" => Kind::Button,
        "input" => Kind::Input,
        "area" => Kind::Area,
        "toggle" => Kind::Toggle,
        "slider" => Kind::Slider,
        "image" => Kind::Image,
        "spacer" => Kind::Spacer,
        "divider" => Kind::Divider,
        "progress" => Kind::Progress,
        _ => return None,
    };
    let key = a.string("key").map(|k| format!("k:{}", k)).unwrap_or_else(|| key.to_string());
    let mut n = Node::new(kind, key.clone());
    n.text = get("x").map(|x| x.display()).unwrap_or_default();
    let s = &mut n.style;

    // общие атрибуты
    if let Some(p) = a.num("padding").or(a.num("pad")) {
        s.pad = [p; 4];
    }
    if let Some(p) = a.num("px") {
        s.pad[1] = p;
        s.pad[3] = p;
    }
    if let Some(p) = a.num("py") {
        s.pad[0] = p;
        s.pad[2] = p;
    }
    for (k, i) in [("pt", 0), ("pr", 1), ("pb", 2), ("pl", 3)] {
        if let Some(p) = a.num(k) {
            s.pad[i] = p;
        }
    }
    s.gap = a.num("gap").unwrap_or(0.0);
    s.width = a.dim("width");
    s.height = a.dim("height");
    s.grow = match a.get("grow") {
        Some(Value::Num(n)) => n as f32,
        Some(v) if v.truthy() => 1.0,
        _ => 0.0,
    };
    s.align = a.string("align").and_then(|x| match x.as_str() {
        "start" => Some(Align::Start),
        "center" => Some(Align::Center),
        "end" => Some(Align::End),
        "stretch" => Some(Align::Stretch),
        _ => None,
    });
    s.justify = match a.string("justify").as_deref() {
        Some("center") => Justify::Center,
        Some("end") => Justify::End,
        Some("between") => Justify::Between,
        _ => Justify::Start,
    };
    s.bg = a.color("bg");
    s.color = a.color("color");
    s.radius = a.num("radius").unwrap_or(0.0);
    s.border = a.flag("border");
    s.size = a.num("size").unwrap_or(16.0);
    s.weight = a.num("weight").map(|w| w as u16).unwrap_or(if a.flag("bold") { 600 } else { 400 });
    s.dim = a.flag("dim");
    s.caps = a.flag("caps");
    s.mono = a.flag("mono");
    s.primary = a.flag("primary");
    s.ghost = a.flag("ghost");
    s.full = a.flag("full");
    s.min_h = a.num("min_height").unwrap_or(0.0);
    if a.flag("center") {
        match kind {
            Kind::Text | Kind::Button => s.text_center = true,
            _ => {
                s.align = Some(Align::Center);
                s.justify = Justify::Center;
            }
        }
    }
    if s.caps {
        s.ls = s.size * 0.24;
        if a.get("size").is_none() {
            s.size = 12.0;
        }
    }
    n.disabled = a.flag("disabled");
    n.on = a.get("on").filter(|v| matches!(v, Value::Func(_) | Value::Native(_)));
    n.on_submit = a.get("on_submit").filter(|v| matches!(v, Value::Func(_) | Value::Native(_)));
    n.bind = a.get("bind").filter(|v| matches!(v, Value::Func(_)));
    n.value = a.get("value").unwrap_or(Value::Null);
    n.placeholder = a.string("placeholder").unwrap_or_default();
    n.password = a.string("type").as_deref() == Some("password");
    n.number = a.string("type").as_deref() == Some("number");
    n.min = a.num("min").unwrap_or(0.0) as f64;
    n.max = a.num("max").unwrap_or(100.0) as f64;
    n.step = a.num("step").unwrap_or(1.0) as f64;

    match tag.as_str() {
        "button" => {
            s_button_defaults(&mut n);
        }
        "input" | "area" => {}
        "spacer" => {
            if let Some(sz) = a.num("size") {
                n.style.width = Dim::Px(sz);
                n.style.height = Dim::Px(sz);
            } else if n.style.grow == 0.0 {
                n.style.grow = 1.0;
            }
        }
        "bar" => {
            n.style.pad = [6.0, 8.0, 6.0, 16.0];
            n.style.gap = 8.0;
            n.style.min_h = 56.0;
            n.style.border_b = true;
            n.style.align = Some(Align::Center);
        }
        _ => {}
    }

    // дети
    let mut kids: Vec<Node> = Vec::new();
    if tag == "bar" {
        if nav_depth > 1 {
            let mut b = Node::new(Kind::Button, format!("{}:back", key));
            b.text = "←".into();
            b.on = Some(back.clone());
            b.style.flat = true;
            b.style.size = 22.0;
            b.style.width = Dim::Px(44.0);
            b.style.height = Dim::Px(44.0);
            b.style.text_center = true;
            kids.push(b);
        }
        let mut t = Node::new(Kind::Text, format!("{}:title", key));
        t.text = n.text.clone();
        t.style.caps = true;
        t.style.dim = true;
        t.style.size = 12.0;
        t.style.ls = 12.0 * 0.24;
        t.style.grow = 1.0;
        kids.push(t);
        n.text.clear();
    }
    if let Some(Value::List(l)) = get("c") {
        for (i, c) in l.borrow().iter().enumerate() {
            if let Some(ch) = build_one(c, &format!("{}/{}", key, i), nav_depth, back) {
                kids.push(ch);
            }
        }
    }
    n.children = kids;
    Some(n)
}

fn s_button_defaults(n: &mut Node) {
    let s = &mut n.style;
    s.text_center = true;
    if s.pad == [0.0; 4] {
        s.pad = [0.0, 18.0, 0.0, 18.0];
    }
    s.radius = if s.radius > 0.0 { s.radius } else { 2.0 };
}

// ───────────── раскладка ─────────────

pub struct Cx<'a> {
    pub fonts: &'a mut Fonts,
    pub scroll: &'a HashMap<String, f32>,
}

fn resolve(d: Dim, parent: f32) -> Option<f32> {
    match d {
        Dim::Auto => None,
        Dim::Px(p) => Some(p),
        Dim::Pct(p) => {
            if parent.is_finite() {
                Some(parent * p)
            } else {
                None
            }
        }
    }
}

fn text_lines(n: &Node, cx: &mut Cx, w: f32) -> Vec<Line> {
    let st = &n.style;
    let t = if st.caps { n.text.to_uppercase() } else { n.text.clone() };
    cx.fonts.wrap(&t, n.face(), n.px(), st.ls, if n.kind == Kind::Button { f32::INFINITY } else { w })
}

pub fn measure(n: &mut Node, cx: &mut Cx, avail: f32) -> (f32, f32) {
    if let Some((a, w, h)) = n.cache {
        if (a - avail).abs() < 0.01 || (a.is_infinite() && avail.is_infinite()) {
            return (w, h);
        }
    }
    let st = n.style.clone();
    let ew = resolve(st.width, avail);
    let eh = resolve(st.height, f32::INFINITY);
    let (ph, pv) = (st.pad[1] + st.pad[3], st.pad[0] + st.pad[2]);
    let (mut w, mut h);
    match n.kind {
        Kind::Text => {
            let inner = ew.unwrap_or(avail) - ph;
            let lines = text_lines(n, cx, inner.max(1.0));
            let (_, lh) = cx.fonts.vmetrics(n.face(), n.px());
            let mut mw = 0.0f32;
            for l in &lines {
                mw = mw.max(cx.fonts.width(l.text.trim_end(), n.face(), n.px(), st.ls));
            }
            w = mw + ph;
            h = lines.len() as f32 * lh + pv;
        }
        Kind::Button => {
            let t = if st.caps { n.text.to_uppercase() } else { n.text.clone() };
            let tw = cx.fonts.width(&t, n.face(), n.px(), st.ls);
            w = (tw + ph).max(44.0);
            h = (n.px() * 1.4 + 24.0).max(44.0);
            if st.full && avail.is_finite() {
                w = avail;
            }
        }
        Kind::Input => {
            w = if avail.is_finite() { avail } else { 240.0 };
            h = 44.0;
        }
        Kind::Area => {
            w = if avail.is_finite() { avail } else { 240.0 };
            let inner = (ew.unwrap_or(w) - 2.0 * 12.0).max(10.0);
            let lines = cx.fonts.wrap(&n.input_value(), Face::Regular, 16.0, 0.0, inner);
            h = (lines.len() as f32 * 22.4 + 24.0).max(96.0);
        }
        Kind::Toggle => {
            w = 48.0;
            h = 28.0;
        }
        Kind::Slider => {
            w = if avail.is_finite() { avail.min(320.0) } else { 200.0 };
            h = 32.0;
        }
        Kind::Progress => {
            w = if avail.is_finite() { avail } else { 200.0 };
            h = 6.0;
        }
        Kind::Divider => {
            w = 0.0;
            h = 1.0;
        }
        Kind::Spacer => {
            w = 0.0;
            h = 0.0;
        }
        Kind::Image => {
            w = 64.0;
            h = 64.0;
        }
        Kind::Column | Kind::Box | Kind::Scroll => {
            let inner = ew.unwrap_or(avail) - ph;
            let (mut mw, mut sh) = (0.0f32, 0.0f32);
            let nk = n.children.len();
            for c in n.children.iter_mut() {
                let ca = resolve(c.style.width, inner).unwrap_or(inner);
                let (cw, ch) = measure(c, cx, ca);
                mw = mw.max(cw);
                sh += ch;
            }
            sh += st.gap * nk.saturating_sub(1) as f32;
            w = mw + ph;
            h = sh + pv;
        }
        Kind::Row => {
            let inner = ew.unwrap_or(avail) - ph;
            let (mut sw, mut mh) = (0.0f32, 0.0f32);
            let nk = n.children.len();
            for c in n.children.iter_mut() {
                let ca = resolve(c.style.width, inner).unwrap_or(inner);
                let (cw, ch) = measure(c, cx, ca);
                if c.style.grow > 0.0 && matches!(c.kind, Kind::Text | Kind::Spacer | Kind::Input | Kind::Area) {
                    sw += cw.min(60.0);
                } else {
                    sw += cw;
                }
                mh = mh.max(ch);
            }
            sw += st.gap * nk.saturating_sub(1) as f32;
            w = sw + ph;
            h = mh + pv;
        }
    }
    if let Some(x) = ew {
        w = x;
    }
    if let Some(x) = eh {
        h = x;
    }
    h = h.max(st.min_h);
    n.cache = Some((avail, w, h));
    (w, h)
}

fn child_avail_w(c: &Node, inner: f32) -> f32 {
    resolve(c.style.width, inner).unwrap_or(inner)
}

pub fn place(n: &mut Node, cx: &mut Cx, x: f32, y: f32, w: f32, h: f32) {
    n.x = x;
    n.y = y;
    n.w = w;
    n.h = h;
    let st = n.style.clone();
    let (pt, pr, pb, pl) = (st.pad[0], st.pad[1], st.pad[2], st.pad[3]);
    match n.kind {
        Kind::Text => {
            n.lines = text_lines(n, cx, (w - pl - pr).max(1.0));
        }
        Kind::Area => {}
        Kind::Column | Kind::Box | Kind::Scroll => {
            let (ix, iy, iw, ih) = (x + pl, y + pt, (w - pl - pr).max(0.0), (h - pt - pb).max(0.0));
            let scroll = n.kind == Kind::Scroll;
            let nk = n.children.len();
            let mut sizes: Vec<(f32, f32)> = Vec::with_capacity(nk);
            let mut total = 0.0f32;
            let mut grow_sum = 0.0f32;
            for c in n.children.iter_mut() {
                let ca = child_avail_w(c, iw);
                let (cw, mut ch) = measure(c, cx, ca);
                if let Some(eh) = resolve(c.style.height, ih) {
                    ch = eh;
                } else if c.kind == Kind::Scroll && c.style.grow > 0.0 {
                    ch = 0.0; // прокручиваемая область с grow занимает остаток (flex-basis: 0)
                }
                sizes.push((cw, ch));
                total += ch;
                grow_sum += c.style.grow;
            }
            total += st.gap * nk.saturating_sub(1) as f32;
            let remaining = if scroll { 0.0 } else { ih - total };
            let extra = if grow_sum > 0.0 && remaining > 0.0 { remaining / grow_sum } else { 0.0 };
            let (mut off, mut between) = (0.0f32, 0.0f32);
            if grow_sum == 0.0 && remaining > 0.0 {
                match st.justify {
                    Justify::Center => off = remaining / 2.0,
                    Justify::End => off = remaining,
                    Justify::Between if nk > 1 => between = remaining / (nk - 1) as f32,
                    _ => {}
                }
            }
            let scroll_off = if scroll { cx.scroll.get(&n.key).copied().unwrap_or(0.0) } else { 0.0 };
            if scroll {
                n.content_h = total + pt + pb;
            }
            let max_off = if scroll { (total - ih).max(0.0) } else { 0.0 };
            let so = scroll_off.clamp(0.0, max_off);
            let mut cy = iy + off - so;
            let align = st.align.unwrap_or(Align::Stretch);
            for (i, c) in n.children.iter_mut().enumerate() {
                let (cw, ch) = sizes[i];
                let fh = ch + c.style.grow * extra;
                let (cxp, cwf) = match (align, resolve(c.style.width, iw)) {
                    (_, Some(ew)) => match align {
                        Align::Center => (ix + (iw - ew) / 2.0, ew),
                        Align::End => (ix + iw - ew, ew),
                        _ => (ix, ew),
                    },
                    (Align::Stretch, None) => (ix, iw),
                    (Align::Start, None) => (ix, cw.min(iw)),
                    (Align::Center, None) => (ix + (iw - cw.min(iw)) / 2.0, cw.min(iw)),
                    (Align::End, None) => (ix + iw - cw.min(iw), cw.min(iw)),
                };
                let (cxp, cwf) = if c.kind == Kind::Divider { (ix, iw) } else { (cxp, cwf) };
                place(c, cx, cxp, cy, cwf, fh);
                cy += fh + st.gap + between;
            }
            if scroll {
                n.cache = n.cache.map(|c| c);
                // сохраняем фактический (с зажимом) сдвиг
                n.value = Value::Num(so as f64);
            }
        }
        Kind::Row => {
            let (ix, iy, iw, ih) = (x + pl, y + pt, (w - pl - pr).max(0.0), (h - pt - pb).max(0.0));
            let nk = n.children.len();
            let mut ws: Vec<f32> = Vec::with_capacity(nk);
            let mut fixed = 0.0f32;
            let mut grow_sum = 0.0f32;
            for c in n.children.iter_mut() {
                let ca = child_avail_w(c, iw);
                let (cw, _) = measure(c, cx, ca);
                let cw = resolve(c.style.width, iw).unwrap_or(cw);
                if c.style.grow > 0.0 {
                    grow_sum += c.style.grow;
                    ws.push(0.0);
                } else {
                    ws.push(cw);
                    fixed += cw;
                }
            }
            fixed += st.gap * nk.saturating_sub(1) as f32;
            let mut remaining = iw - fixed;
            if remaining < 0.0 {
                // не помещается: сжимаем тексты
                let shrinkable: f32 = n.children.iter().zip(&ws).filter(|(c, _)| c.kind == Kind::Text && c.style.grow == 0.0).map(|(_, w)| *w).sum();
                if shrinkable > 0.0 {
                    let k = ((shrinkable + remaining) / shrinkable).max(0.2);
                    for (c, wv) in n.children.iter().zip(ws.iter_mut()) {
                        if c.kind == Kind::Text && c.style.grow == 0.0 {
                            *wv *= k;
                        }
                    }
                    remaining = 0.0;
                } else {
                    remaining = 0.0;
                }
            }
            if grow_sum > 0.0 {
                for (i, c) in n.children.iter().enumerate() {
                    if c.style.grow > 0.0 {
                        ws[i] = remaining * c.style.grow / grow_sum;
                    }
                }
            }
            let used: f32 = ws.iter().sum::<f32>() + st.gap * nk.saturating_sub(1) as f32;
            let free = (iw - used).max(0.0);
            let (mut off, mut between) = (0.0f32, 0.0f32);
            if grow_sum == 0.0 {
                match st.justify {
                    Justify::Center => off = free / 2.0,
                    Justify::End => off = free,
                    Justify::Between if nk > 1 => between = free / (nk - 1) as f32,
                    _ => {}
                }
            }
            let align = st.align.unwrap_or(Align::Center);
            let mut cxp = ix + off;
            for (i, c) in n.children.iter_mut().enumerate() {
                let cwf = ws[i];
                let (_, mut ch) = measure(c, cx, cwf);
                if let Some(eh) = resolve(c.style.height, ih) {
                    ch = eh;
                }
                let (cy, chf) = match align {
                    Align::Stretch => (iy, ih),
                    Align::Start => (iy, ch.min(ih)),
                    Align::Center => (iy + (ih - ch.min(ih)) / 2.0, ch.min(ih)),
                    Align::End => (iy + ih - ch.min(ih), ch.min(ih)),
                };
                place(c, cx, cxp, cy, cwf, if resolve(c.style.height, ih).is_some() { ch } else { chf });
                cxp += cwf + st.gap + between;
            }
        }
        _ => {}
    }
}

// ───────────── отрисовка ─────────────

pub struct PaintState<'a> {
    pub pressed: Option<&'a str>,
    pub focus: Option<&'a str>,
    pub caret: usize,
    pub caret_on: bool,
}

pub fn paint(n: &Node, p: &mut Painter, fonts: &mut Fonts, ps: &PaintState) {
    let st = &n.style;
    let disabled_a = if n.disabled { 90 } else { 255 };
    if let Some(bg) = st.bg {
        p.fill_round(n.x, n.y, n.w, n.h, st.radius, bg);
    }
    if st.border && !matches!(n.kind, Kind::Button) {
        p.stroke_round(n.x, n.y, n.w, n.h, st.radius, 1.0, LINE);
    }
    if st.border_b {
        p.fill(n.x, n.y + n.h - 1.0, n.w, 1.0, LINE);
    }
    match n.kind {
        Kind::Text => {
            let (_, lh) = fonts.vmetrics(n.face(), n.px());
            let col = n.color();
            for (i, l) in n.lines.iter().enumerate() {
                let t = l.text.trim_end();
                let tx = if st.text_center {
                    let tw = fonts.width(t, n.face(), n.px(), st.ls);
                    n.x + st.pad[3] + ((n.w - st.pad[1] - st.pad[3]) - tw) / 2.0
                } else {
                    n.x + st.pad[3]
                };
                p.text(fonts, t, tx, n.y + st.pad[0] + i as f32 * lh, n.face(), n.px(), st.ls, col);
            }
        }
        Kind::Button => {
            let pressed = ps.pressed == Some(n.key.as_str());
            let (fill, fg, border) = if st.flat {
                (if pressed { Some(PANEL) } else { None }, FG, None)
            } else if st.primary {
                (Some(if pressed { Color::rgb(190, 190, 190) } else { FG }), BG, None)
            } else if st.ghost {
                (if pressed { Some(FG) } else { None }, if pressed { BG } else { DIM }, Some(LINE))
            } else {
                (if pressed { Some(FG) } else { None }, if pressed { BG } else { FG }, Some(FG))
            };
            let fg = st.color.unwrap_or(fg).with_alpha(disabled_a);
            if let Some(f) = fill {
                p.fill_round(n.x, n.y, n.w, n.h, st.radius, f.with_alpha(disabled_a));
            }
            if let Some(b) = border {
                p.stroke_round(n.x, n.y, n.w, n.h, st.radius, 1.0, b.with_alpha(disabled_a));
            }
            let t = if st.caps { n.text.to_uppercase() } else { n.text.clone() };
            let tw = fonts.width(&t, n.face(), n.px(), st.ls);
            let (_, lh) = fonts.vmetrics(n.face(), n.px());
            p.text(fonts, &t, n.x + (n.w - tw) / 2.0, n.y + (n.h - lh) / 2.0, n.face(), n.px(), st.ls, fg);
        }
        Kind::Input | Kind::Area => {
            let focused = ps.focus == Some(n.key.as_str());
            let area = n.kind == Kind::Area;
            if area {
                p.stroke_round(n.x, n.y, n.w, n.h, 2.0, 1.0, if focused { FG } else { LINE });
            } else {
                p.fill(n.x, n.y + n.h - 1.0, n.w, 1.0, if focused { FG } else { LINE });
            }
            let px = n.px();
            let (_, lh) = fonts.vmetrics(Face::Regular, px);
            let pad_x = if area { 12.0 } else { 0.0 };
            let pad_y = if area { 12.0 } else { (n.h - lh) / 2.0 };
            let val = n.input_value();
            let shown: String = if n.password { val.chars().map(|_| '•').collect() } else { val.clone() };
            let inner_w = n.w - 2.0 * pad_x;
            p.push_clip(n.x, n.y, n.w, n.h);
            if shown.is_empty() {
                p.text(fonts, &n.placeholder, n.x + pad_x, n.y + pad_y, Face::Regular, px, 0.0, DIM);
            }
            let lines = if area { fonts.wrap(&shown, Face::Regular, px, 0.0, inner_w.max(10.0)) } else { vec![Line { start: 0, text: shown.clone() }] };
            // для однострочного поля — горизонтальная прокрутка, чтобы каретка была видна
            let mut shift = 0.0f32;
            if !area && focused {
                let pre: String = shown.chars().take(ps.caret).collect();
                let cw = fonts.width(&pre, Face::Regular, px, 0.0);
                if cw > inner_w - 4.0 {
                    shift = cw - (inner_w - 4.0);
                }
            }
            for (i, l) in lines.iter().enumerate() {
                p.text(fonts, l.text.trim_end_matches('\n'), n.x + pad_x - shift, n.y + pad_y + i as f32 * lh, Face::Regular, px, 0.0, FG);
            }
            if focused && ps.caret_on {
                let caret = ps.caret.min(shown.chars().count());
                let (li, col) = lines.iter().enumerate().rev().find(|(_, l)| l.start <= caret).map(|(i, l)| (i, caret - l.start)).unwrap_or((0, 0));
                let pre: String = lines[li].text.chars().take(col).collect();
                let cx = n.x + pad_x - shift + fonts.width(&pre, Face::Regular, px, 0.0);
                p.fill(cx, n.y + pad_y + li as f32 * lh + 1.0, 1.5, lh - 2.0, FG);
            }
            p.pop_clip();
        }
        Kind::Toggle => {
            let on = n.value.truthy();
            p.stroke_round(n.x, n.y, n.w, n.h, 2.0, 1.0, if on { FG } else { DIM }.with_alpha(disabled_a));
            let kx = if on { n.x + n.w - 3.0 - 20.0 } else { n.x + 3.0 };
            p.fill_round(kx, n.y + 3.0, 20.0, n.h - 6.0, 1.0, if on { FG } else { DIM }.with_alpha(disabled_a));
        }
        Kind::Slider => {
            let v = n.value.as_num().unwrap_or(n.min);
            let t = if n.max > n.min { ((v - n.min) / (n.max - n.min)).clamp(0.0, 1.0) as f32 } else { 0.0 };
            let (tx, tw) = (n.x + 8.0, n.w - 16.0);
            let cy = n.y + n.h / 2.0;
            p.fill(tx, cy - 1.0, tw, 2.0, LINE);
            p.fill(tx, cy - 1.0, tw * t, 2.0, FG);
            p.fill_round(tx + tw * t - 8.0, cy - 8.0, 16.0, 16.0, 1.0, FG);
        }
        Kind::Progress => {
            let v = n.value.as_num().unwrap_or(0.0).clamp(0.0, 1.0) as f32;
            p.fill(n.x, n.y + n.h / 2.0 - 2.0, n.w, 4.0, LINE);
            p.fill(n.x, n.y + n.h / 2.0 - 2.0, n.w * v, 4.0, FG);
        }
        Kind::Divider => p.fill(n.x, n.y, n.w, 1.0, LINE),
        Kind::Image => {
            p.stroke_round(n.x, n.y, n.w, n.h, 0.0, 1.0, LINE);
        }
        Kind::Spacer => {}
        Kind::Column | Kind::Row | Kind::Box | Kind::Scroll => {
            let clip = n.kind == Kind::Scroll;
            if clip {
                p.push_clip(n.x, n.y, n.w, n.h);
            }
            for c in &n.children {
                if clip && (c.y + c.h < n.y || c.y > n.y + n.h) {
                    continue;
                }
                paint(c, p, fonts, ps);
            }
            if clip && n.content_h > n.h {
                let so = n.value.as_num().unwrap_or(0.0) as f32;
                let max = n.content_h - n.h;
                let th = (n.h * n.h / n.content_h).max(24.0);
                let ty = n.y + (n.h - th) * (so / max.max(1.0));
                p.fill(n.x + n.w - 3.0, ty, 2.0, th, Color::rgb(70, 70, 70));
            }
            if clip {
                p.pop_clip();
            }
        }
    }
}

// ───────────── поиск и обход ─────────────

pub fn find<'a>(n: &'a Node, key: &str) -> Option<&'a Node> {
    if n.key == key {
        return Some(n);
    }
    n.children.iter().find_map(|c| find(c, key))
}

/// Цепочка узлов под точкой (от корня к самому глубокому), с учётом обрезки прокруткой.
pub fn hit_chain<'a>(n: &'a Node, x: f32, y: f32, out: &mut Vec<&'a Node>) {
    if x < n.x || x >= n.x + n.w || y < n.y || y >= n.y + n.h {
        return;
    }
    out.push(n);
    for c in n.children.iter().rev() {
        let before = out.len();
        hit_chain(c, x, y, out);
        if out.len() > before {
            return;
        }
    }
}

pub fn each<'a>(n: &'a Node, f: &mut dyn FnMut(&'a Node)) {
    f(n);
    for c in &n.children {
        each(c, f);
    }
}

pub fn each_mut(n: &mut Node, f: &mut dyn FnMut(&mut Node)) {
    f(n);
    for c in n.children.iter_mut() {
        each_mut(c, f);
    }
}
