//! Программный растеризатор: прямоугольники, скругления, текст. Буфер RGBA8.
use crate::text::{Face, Fonts};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
}

impl Color {
    pub const fn rgb(r: u8, g: u8, b: u8) -> Color {
        Color { r, g, b, a: 255 }
    }
    pub fn with_alpha(self, a: u8) -> Color {
        Color { a: ((self.a as u32 * a as u32) / 255) as u8, ..self }
    }
    pub fn parse(s: &str) -> Option<Color> {
        let s = s.trim();
        if let Some(h) = s.strip_prefix('#') {
            let v = |i: usize, n: usize| u8::from_str_radix(&h[i..i + n], 16).ok();
            return match h.len() {
                3 => {
                    let d = |i| v(i, 1).map(|x| x * 17);
                    Some(Color { r: d(0)?, g: d(1)?, b: d(2)?, a: 255 })
                }
                6 => Some(Color { r: v(0, 2)?, g: v(2, 2)?, b: v(4, 2)?, a: 255 }),
                8 => Some(Color { r: v(0, 2)?, g: v(2, 2)?, b: v(4, 2)?, a: v(6, 2)? }),
                _ => None,
            };
        }
        Some(match s {
            "white" => FG,
            "black" => BG,
            "gray" | "grey" | "dim" => DIM,
            "transparent" => Color { r: 0, g: 0, b: 0, a: 0 },
            "red" => Color::rgb(255, 69, 58),
            "green" => Color::rgb(48, 209, 88),
            "blue" => Color::rgb(10, 132, 255),
            "yellow" => Color::rgb(255, 214, 10),
            _ => return None,
        })
    }
}

pub const BG: Color = Color::rgb(0, 0, 0);
pub const FG: Color = Color::rgb(255, 255, 255);
pub const DIM: Color = Color::rgb(138, 138, 138);
pub const LINE: Color = Color::rgb(38, 38, 38);
pub const PANEL: Color = Color::rgb(13, 13, 13);

#[derive(Clone, Copy, Debug)]
pub struct IRect {
    pub x0: i32,
    pub y0: i32,
    pub x1: i32,
    pub y1: i32,
}

pub struct Painter<'a> {
    pub buf: &'a mut [u8],
    pub w: i32,
    pub h: i32,
    pub scale: f32,
    clips: Vec<IRect>,
}

impl<'a> Painter<'a> {
    pub fn new(buf: &'a mut [u8], w: i32, h: i32, scale: f32) -> Painter<'a> {
        Painter { buf, w, h, scale, clips: vec![IRect { x0: 0, y0: 0, x1: w, y1: h }] }
    }
    fn clip(&self) -> IRect {
        *self.clips.last().unwrap()
    }
    pub fn push_clip(&mut self, x: f32, y: f32, w: f32, h: f32) {
        let c = self.clip();
        let s = self.scale;
        let r = IRect { x0: ((x * s).floor() as i32).max(c.x0), y0: ((y * s).floor() as i32).max(c.y0), x1: (((x + w) * s).ceil() as i32).min(c.x1), y1: (((y + h) * s).ceil() as i32).min(c.y1) };
        self.clips.push(r);
    }
    pub fn pop_clip(&mut self) {
        if self.clips.len() > 1 {
            self.clips.pop();
        }
    }

    #[inline]
    fn blend(&mut self, x: i32, y: i32, c: Color, cov: u32) {
        let cl = self.clip();
        if x < cl.x0 || x >= cl.x1 || y < cl.y0 || y >= cl.y1 {
            return;
        }
        let a = (c.a as u32 * cov) / 255;
        if a == 0 {
            return;
        }
        let i = ((y * self.w + x) * 4) as usize;
        let d = &mut self.buf[i..i + 4];
        if a >= 255 {
            d[0] = c.r;
            d[1] = c.g;
            d[2] = c.b;
            d[3] = 255;
        } else {
            let ia = 255 - a;
            d[0] = ((c.r as u32 * a + d[0] as u32 * ia) / 255) as u8;
            d[1] = ((c.g as u32 * a + d[1] as u32 * ia) / 255) as u8;
            d[2] = ((c.b as u32 * a + d[2] as u32 * ia) / 255) as u8;
            d[3] = 255;
        }
    }

    pub fn clear(&mut self, c: Color) {
        for px in self.buf.chunks_exact_mut(4) {
            px[0] = c.r;
            px[1] = c.g;
            px[2] = c.b;
            px[3] = 255;
        }
    }

    /// Прямоугольник в логических координатах.
    pub fn fill(&mut self, x: f32, y: f32, w: f32, h: f32, c: Color) {
        if c.a == 0 || w <= 0.0 || h <= 0.0 {
            return;
        }
        let s = self.scale;
        let cl = self.clip();
        let x0 = ((x * s).round() as i32).max(cl.x0);
        let y0 = ((y * s).round() as i32).max(cl.y0);
        let x1 = (((x + w) * s).round() as i32).min(cl.x1);
        let y1 = (((y + h) * s).round() as i32).min(cl.y1);
        for yy in y0..y1 {
            for xx in x0..x1 {
                self.blend(xx, yy, c, 255);
            }
        }
    }

    /// Скруглённый прямоугольник (заливка) с антиалиасингом углов.
    pub fn fill_round(&mut self, x: f32, y: f32, w: f32, h: f32, r: f32, c: Color) {
        if r <= 0.5 {
            return self.fill(x, y, w, h, c);
        }
        let s = self.scale;
        let (px, py, pw, ph) = (x * s, y * s, w * s, h * s);
        let rr = (r * s).min(pw / 2.0).min(ph / 2.0);
        let cl = self.clip();
        let x0 = (px.floor() as i32).max(cl.x0);
        let y0 = (py.floor() as i32).max(cl.y0);
        let x1 = ((px + pw).ceil() as i32).min(cl.x1);
        let y1 = ((py + ph).ceil() as i32).min(cl.y1);
        for yy in y0..y1 {
            for xx in x0..x1 {
                let (fx, fy) = (xx as f32 + 0.5, yy as f32 + 0.5);
                let cx = fx.clamp(px + rr, px + pw - rr);
                let cy = fy.clamp(py + rr, py + ph - rr);
                let d = ((fx - cx).powi(2) + (fy - cy).powi(2)).sqrt();
                let cov = (rr - d + 0.5).clamp(0.0, 1.0);
                // края по границе прямоугольника
                let ex = ((fx - px + 0.5).min(px + pw - fx + 0.5)).clamp(0.0, 1.0);
                let ey = ((fy - py + 0.5).min(py + ph - fy + 0.5)).clamp(0.0, 1.0);
                let cov = cov.min(ex).min(ey);
                if cov > 0.0 {
                    self.blend(xx, yy, c, (cov * 255.0) as u32);
                }
            }
        }
    }

    /// Рамка толщиной t (логических px) со скруглением r.
    pub fn stroke_round(&mut self, x: f32, y: f32, w: f32, h: f32, r: f32, t: f32, c: Color) {
        if r <= 0.5 {
            self.fill(x, y, w, t, c);
            self.fill(x, y + h - t, w, t, c);
            self.fill(x, y + t, t, h - 2.0 * t, c);
            self.fill(x + w - t, y + t, t, h - 2.0 * t, c);
            return;
        }
        let s = self.scale;
        let (px, py, pw, ph) = (x * s, y * s, w * s, h * s);
        let rr = (r * s).min(pw / 2.0).min(ph / 2.0);
        let ts = t * s;
        let cl = self.clip();
        let x0 = (px.floor() as i32).max(cl.x0);
        let y0 = (py.floor() as i32).max(cl.y0);
        let x1 = ((px + pw).ceil() as i32).min(cl.x1);
        let y1 = ((py + ph).ceil() as i32).min(cl.y1);
        for yy in y0..y1 {
            for xx in x0..x1 {
                let (fx, fy) = (xx as f32 + 0.5, yy as f32 + 0.5);
                let cx = fx.clamp(px + rr, px + pw - rr);
                let cy = fy.clamp(py + rr, py + ph - rr);
                let d = ((fx - cx).powi(2) + (fy - cy).powi(2)).sqrt();
                let outer = (rr - d + 0.5).clamp(0.0, 1.0);
                let inner = (d - (rr - ts) + 0.5).clamp(0.0, 1.0);
                let edge_out = ((fx - px + 0.5).min(px + pw - fx + 0.5).min(fy - py + 0.5).min(py + ph - fy + 0.5)).clamp(0.0, 1.0);
                let in_x = (fx - px - ts + 0.5).min(px + pw - ts - fx + 0.5);
                let in_y = (fy - py - ts + 0.5).min(py + ph - ts - fy + 0.5);
                let edge_in = (-(in_x.min(in_y))).clamp(0.0, 1.0);
                let cov = if rr > ts { outer.min(edge_out).min(inner.max(edge_in)) } else { outer.min(edge_out).min(edge_in) };
                if cov > 0.0 {
                    self.blend(xx, yy, c, (cov * 255.0) as u32);
                }
            }
        }
    }

    /// Рисует строку. (x, y) — левый верх строки в логических px.
    pub fn text(&mut self, fonts: &mut Fonts, text: &str, x: f32, y: f32, face: Face, px: f32, ls: f32, c: Color) {
        let s = self.scale;
        let ppx = px * s;
        let (asc, _) = fonts.vmetrics(face, ppx);
        let base = y * s + asc + ((px * 1.4 - px) * s * 0.5);
        let mut pen = x * s;
        for ch in text.chars() {
            if ch == '\n' {
                continue;
            }
            let g = fonts.glyph(face, ch, ppx);
            if g.w > 0 && g.h > 0 {
                let gx = (pen + g.xmin as f32).round() as i32;
                let gy = (base - g.ymin as f32 - g.h as f32).round() as i32;
                for row in 0..g.h {
                    for col in 0..g.w {
                        let cov = g.cov[row * g.w + col] as u32;
                        if cov > 0 {
                            self.blend(gx + col as i32, gy + row as i32, c, cov);
                        }
                    }
                }
            }
            pen += g.advance + ls * s;
        }
    }
}
