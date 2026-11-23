//! Лексер Noodle Script / Noodle UI.

use crate::Diag;

#[derive(Clone, Debug, PartialEq)]
pub enum T {
    Num(f64),
    /// строка; bool — разрешена ли интерполяция `{expr}`
    Str(String, bool),
    Id(String),
    Sym(&'static str),
    Eof,
}

#[derive(Clone, Debug)]
pub struct Token {
    pub t: T,
    pub line: u32,
    pub col: u32,
    /// перед токеном был перевод строки
    pub nl: bool,
}

const SYMS: &[&str] = &[
    "...", "..", "==", "!=", "<=", ">=", "&&", "||", "??", "+=", "-=", "*=", "/=", "%=", "=>", "+", "-", "*", "/", "%", "=", "<", ">", "!", "(", ")", "[", "]", "{", "}", ",", ".", ":", ";", "?",
];

/// Маркер экранированной `{` внутри строки (`\{`).
pub const LBRACE_ESC: char = '\u{1}';

pub fn lex(src: &str, file: &str, line0: u32) -> Result<Vec<Token>, Diag> {
    let chars: Vec<char> = src.chars().collect();
    let mut i = 0usize;
    let mut line = line0;
    let mut col = 1u32;
    let mut nl = false;
    let mut out: Vec<Token> = Vec::new();
    let err = |line: u32, col: u32, msg: String| Diag { file: file.to_string(), line, col, msg };

    macro_rules! adv {
        () => {{
            let c = chars[i];
            i += 1;
            if c == '\n' {
                line += 1;
                col = 1;
            } else {
                col += 1;
            }
            c
        }};
    }

    while i < chars.len() {
        let c = chars[i];
        if c == '\n' {
            adv!();
            nl = true;
            continue;
        }
        if c.is_whitespace() {
            adv!();
            continue;
        }
        if c == '/' && chars.get(i + 1) == Some(&'/') {
            while i < chars.len() && chars[i] != '\n' {
                adv!();
            }
            continue;
        }
        if c == '/' && chars.get(i + 1) == Some(&'*') {
            let (l0, c0) = (line, col);
            adv!();
            adv!();
            loop {
                if i >= chars.len() {
                    return Err(err(l0, c0, "комментарий /* … */ не закрыт".into()));
                }
                if chars[i] == '*' && chars.get(i + 1) == Some(&'/') {
                    adv!();
                    adv!();
                    break;
                }
                adv!();
            }
            continue;
        }
        let (tl, tc) = (line, col);
        let push = |out: &mut Vec<Token>, t: T, nl: &mut bool| {
            out.push(Token { t, line: tl, col: tc, nl: *nl });
            *nl = false;
        };
        if c.is_ascii_digit() {
            let start = i;
            if c == '0' && matches!(chars.get(i + 1), Some('x') | Some('X')) {
                adv!();
                adv!();
                let hs = i;
                while i < chars.len() && chars[i].is_ascii_hexdigit() {
                    adv!();
                }
                let s: String = chars[hs..i].iter().collect();
                let v = u64::from_str_radix(&s, 16).map_err(|_| err(tl, tc, "неверное шестнадцатеричное число".into()))?;
                push(&mut out, T::Num(v as f64), &mut nl);
                continue;
            }
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '_') {
                adv!();
            }
            if i < chars.len() && chars[i] == '.' && chars.get(i + 1).map_or(false, |d| d.is_ascii_digit()) {
                adv!();
                while i < chars.len() && chars[i].is_ascii_digit() {
                    adv!();
                }
            }
            if i < chars.len() && (chars[i] == 'e' || chars[i] == 'E') {
                let save = (i, line, col);
                adv!();
                if i < chars.len() && (chars[i] == '+' || chars[i] == '-') {
                    adv!();
                }
                if i < chars.len() && chars[i].is_ascii_digit() {
                    while i < chars.len() && chars[i].is_ascii_digit() {
                        adv!();
                    }
                } else {
                    i = save.0;
                    line = save.1;
                    col = save.2;
                }
            }
            let s: String = chars[start..i].iter().filter(|c| **c != '_').collect();
            let v: f64 = s.parse().map_err(|_| err(tl, tc, format!("неверное число «{}»", s)))?;
            push(&mut out, T::Num(v), &mut nl);
            continue;
        }
        if c.is_alphabetic() || c == '_' {
            let start = i;
            while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_') {
                adv!();
            }
            let s: String = chars[start..i].iter().collect();
            push(&mut out, T::Id(s), &mut nl);
            continue;
        }
        if c == '"' || c == '\'' {
            let q = adv!();
            let interp = q == '"';
            let mut s = String::new();
            loop {
                if i >= chars.len() {
                    return Err(err(tl, tc, "строка не закрыта".into()));
                }
                let ch = adv!();
                if ch == q {
                    break;
                }
                if ch == '\\' {
                    if i >= chars.len() {
                        return Err(err(tl, tc, "строка не закрыта".into()));
                    }
                    let e = adv!();
                    match e {
                        'n' => s.push('\n'),
                        't' => s.push('\t'),
                        'r' => s.push('\r'),
                        '0' => s.push('\0'),
                        '{' if interp => s.push(LBRACE_ESC),
                        other => s.push(other),
                    }
                } else {
                    s.push(ch);
                }
            }
            push(&mut out, T::Str(s, interp), &mut nl);
            continue;
        }
        let mut matched = None;
        for s in SYMS {
            let sc: Vec<char> = s.chars().collect();
            if chars[i..].starts_with(&sc) {
                matched = Some(*s);
                break;
            }
        }
        match matched {
            Some(s) => {
                for _ in 0..s.chars().count() {
                    adv!();
                }
                push(&mut out, T::Sym(s), &mut nl);
            }
            None => return Err(err(tl, tc, format!("неожиданный символ «{}»", c))),
        }
    }
    out.push(Token { t: T::Eof, line, col, nl: true });
    Ok(out)
}
