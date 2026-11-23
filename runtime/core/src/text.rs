//! Шрифты и раскладка текста (fontdue). Шрифты вшиты в бинарник.
use fontdue::{Font, FontSettings};
use std::collections::HashMap;
use std::rc::Rc;

static LIGHT: &[u8] = include_bytes!("../../fonts/Inter-Light.otf");
static REGULAR: &[u8] = include_bytes!("../../fonts/Inter-Regular.otf");
static SEMIBOLD: &[u8] = include_bytes!("../../fonts/Inter-SemiBold.otf");
static MONO: &[u8] = include_bytes!("../../fonts/JetBrainsMono-Regular.ttf");

pub struct Glyph {
    pub w: usize,
    pub h: usize,
    pub xmin: i32,
    pub ymin: i32,
    pub advance: f32,
    pub cov: Vec<u8>,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum Face {
    Light = 0,
    Regular = 1,
    SemiBold = 2,
    Mono = 3,
}

pub struct Fonts {
    faces: [Font; 4],
    cache: HashMap<(u8, char, u32), Rc<Glyph>>,
    adv: HashMap<(u8, char, u32), f32>,
}

/// Строка после переноса: индекс первого символа в исходном тексте + текст.
#[derive(Clone, Debug)]
pub struct Line {
    pub start: usize,
    pub text: String,
}

impl Fonts {
    pub fn new() -> Fonts {
        let load = |b: &[u8]| Font::from_bytes(b, FontSettings::default()).expect("font");
        Fonts { faces: [load(LIGHT), load(REGULAR), load(SEMIBOLD), load(MONO)], cache: HashMap::new(), adv: HashMap::new() }
    }

    pub fn face_for(weight: u16, mono: bool) -> Face {
        if mono {
            Face::Mono
        } else if weight <= 300 {
            Face::Light
        } else if weight >= 600 {
            Face::SemiBold
        } else {
            Face::Regular
        }
    }

    fn key(face: Face, ch: char, px: f32) -> (u8, char, u32) {
        (face as u8, ch, (px * 100.0).round() as u32)
    }

    pub fn glyph(&mut self, face: Face, ch: char, px: f32) -> Rc<Glyph> {
        let k = Self::key(face, ch, px);
        if let Some(g) = self.cache.get(&k) {
            return g.clone();
        }
        let f = &self.faces[face as usize];
        let (m, bm) = f.rasterize(ch, px);
        let g = Rc::new(Glyph { w: m.width, h: m.height, xmin: m.xmin, ymin: m.ymin, advance: m.advance_width, cov: bm });
        self.cache.insert(k, g.clone());
        g
    }

    pub fn advance(&mut self, face: Face, ch: char, px: f32) -> f32 {
        let k = Self::key(face, ch, px);
        if let Some(a) = self.adv.get(&k) {
            return *a;
        }
        let a = self.faces[face as usize].metrics(ch, px).advance_width;
        self.adv.insert(k, a);
        a
    }

    /// (ascent, line_height) в пикселях
    pub fn vmetrics(&self, face: Face, px: f32) -> (f32, f32) {
        match self.faces[face as usize].horizontal_line_metrics(px) {
            Some(m) => (m.ascent, (px * 1.4).max(m.new_line_size.min(px * 1.6))),
            None => (px * 0.9, px * 1.4),
        }
    }

    pub fn width(&mut self, text: &str, face: Face, px: f32, ls: f32) -> f32 {
        let mut w = 0.0;
        for ch in text.chars() {
            w += self.advance(face, ch, px) + ls;
        }
        w
    }

    /// Перенос по словам в пределах max_w (INFINITY — без переноса). Учитывает '\n'.
    pub fn wrap(&mut self, text: &str, face: Face, px: f32, ls: f32, max_w: f32) -> Vec<Line> {
        let mut out = Vec::new();
        let mut idx = 0usize;
        for para in text.split('\n') {
            let chars: Vec<char> = para.chars().collect();
            let mut start = 0usize;
            let mut cur_w = 0.0f32;
            let mut last_space: Option<usize> = None;
            let mut i = 0usize;
            while i < chars.len() {
                let adv = self.advance(face, chars[i], px) + ls;
                if chars[i] == ' ' {
                    last_space = Some(i);
                }
                if cur_w + adv > max_w && i > start && max_w.is_finite() {
                    let brk = match last_space {
                        Some(s) if s > start => s + 1,
                        _ => i,
                    };
                    out.push(Line { start: idx + start, text: chars[start..brk].iter().collect() });
                    start = brk;
                    i = brk;
                    cur_w = 0.0;
                    last_space = None;
                    continue;
                }
                cur_w += adv;
                i += 1;
            }
            out.push(Line { start: idx + start, text: chars[start..].iter().collect() });
            idx += chars.len() + 1;
        }
        out
    }
}
