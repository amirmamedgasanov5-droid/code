//! Парсер Noodle Script + Noodle UI.
use crate::ast::*;
use crate::lexer::{lex, Token, LBRACE_ESC, T};
use crate::Diag;
use std::rc::Rc;

type R<X> = Result<X, Diag>;

pub const TAGS: &[&str] = &["column", "row", "box", "scroll", "text", "button", "input", "area", "toggle", "slider", "image", "spacer", "divider", "bar", "progress"];
const TOP_KW: &[&str] = &["state", "let", "var", "fn", "screen", "app"];

pub struct Parser<'a> {
    toks: Vec<Token>,
    p: usize,
    file: &'a str,
    depth: u32,
    fn_stack: Vec<bool>,
}

pub fn parse_file(src: &str, file: &str) -> (Vec<TopItem>, Vec<Diag>) {
    let toks = match lex(src, file, 1) {
        Ok(t) => t,
        Err(d) => return (vec![], vec![d]),
    };
    let mut ps = Parser { toks, p: 0, file, depth: 0, fn_stack: vec![] };
    let mut items = Vec::new();
    let mut diags = Vec::new();
    while !matches!(ps.peek().t, T::Eof) {
        match ps.top_item() {
            Ok(it) => items.push(it),
            Err(d) => {
                diags.push(d);
                ps.fn_stack.clear();
                ps.depth = 0;
                // восстановление: к следующему ключевому слову верхнего уровня в начале строки
                ps.p += 1;
                while !matches!(ps.peek().t, T::Eof) {
                    let tk = ps.peek();
                    if tk.nl && matches!(&tk.t, T::Id(s) if TOP_KW.contains(&s.as_str())) {
                        break;
                    }
                    ps.p += 1;
                }
            }
        }
    }
    (items, diags)
}

impl<'a> Parser<'a> {
    fn peek(&self) -> &Token {
        &self.toks[self.p.min(self.toks.len() - 1)]
    }
    fn peek_at(&self, n: usize) -> &Token {
        &self.toks[(self.p + n).min(self.toks.len() - 1)]
    }
    fn next(&mut self) -> Token {
        let t = self.peek().clone();
        if self.p < self.toks.len() - 1 {
            self.p += 1;
        }
        t
    }
    fn pos(&self) -> Pos {
        let t = self.peek();
        Pos { line: t.line, col: t.col }
    }
    fn err_at<X>(&self, t: &Token, msg: impl Into<String>) -> R<X> {
        Err(Diag { file: self.file.to_string(), line: t.line, col: t.col, msg: msg.into() })
    }
    fn err<X>(&self, msg: impl Into<String>) -> R<X> {
        let t = self.peek().clone();
        self.err_at(&t, msg)
    }
    fn desc(t: &Token) -> String {
        match &t.t {
            T::Num(n) => format!("число {}", n),
            T::Str(s, _) => format!("строка «{}»", s),
            T::Id(s) => format!("«{}»", s),
            T::Sym(s) => format!("«{}»", s),
            T::Eof => "конец файла".into(),
        }
    }
    fn is_sym(&self, s: &str) -> bool {
        matches!(&self.peek().t, T::Sym(x) if *x == s)
    }
    fn is_id(&self, s: &str) -> bool {
        matches!(&self.peek().t, T::Id(x) if x == s)
    }
    fn eat_sym(&mut self, s: &str) -> bool {
        if self.is_sym(s) {
            self.next();
            true
        } else {
            false
        }
    }
    fn expect_sym(&mut self, s: &str) -> R<Token> {
        if self.is_sym(s) {
            Ok(self.next())
        } else {
            let t = self.peek().clone();
            self.err_at(&t, format!("ожидалось «{}», найдено {}", s, Self::desc(&t)))
        }
    }
    fn ident(&mut self, what: &str) -> R<String> {
        match self.peek().t.clone() {
            T::Id(s) => {
                self.next();
                Ok(s)
            }
            _ => {
                let t = self.peek().clone();
                self.err_at(&t, format!("ожидалось {}, найдено {}", what, Self::desc(&t)))
            }
        }
    }
    fn nl_ok(&self) -> bool {
        self.depth > 0 || !self.peek().nl
    }
    fn mark_inner(&mut self) {
        if let Some(l) = self.fn_stack.last_mut() {
            *l = true;
        }
    }

    // ───────────── верхний уровень ─────────────

    fn top_item(&mut self) -> R<TopItem> {
        let t = self.peek().clone();
        let kw = match &t.t {
            T::Id(s) => s.clone(),
            _ => return self.err_at(&t, format!("на верхнем уровне ожидалось state, let, fn или screen, найдено {}", Self::desc(&t))),
        };
        let pos = Pos { line: t.line, col: t.col };
        match kw.as_str() {
            "app" => {
                self.next();
                match self.next().t {
                    T::Str(s, _) => Ok(TopItem::App(s)),
                    _ => self.err("синтаксис: app \"Название\""),
                }
            }
            "state" => {
                self.next();
                let name = self.ident("имя состояния")?;
                self.expect_sym("=")?;
                self.fn_stack.push(false);
                let init = self.expr()?;
                self.fn_stack.pop();
                let persist = self.is_id("persist") && !self.peek().nl;
                if persist {
                    self.next();
                }
                Ok(TopItem::State { name, init, persist, pos })
            }
            "let" | "var" => {
                self.next();
                let name = self.ident("имя переменной")?;
                self.expect_sym("=")?;
                self.fn_stack.push(false);
                let init = self.expr()?;
                self.fn_stack.pop();
                Ok(TopItem::Let { name, init, pos })
            }
            "fn" => {
                self.next();
                let name = self.ident("имя функции")?;
                Ok(TopItem::Fn(Rc::new(self.func_rest(name, pos)?)))
            }
            "screen" => {
                self.next();
                let name = self.ident("имя экрана")?;
                self.fn_stack.push(false);
                let ui = self.ui_block()?;
                let inner = self.fn_stack.pop().unwrap_or(false);
                let func = Rc::new(FuncDecl { name: format!("screen {}", name), params: vec![], body: vec![], has_inner: inner, pos });
                Ok(TopItem::Screen { name, func, ui, pos })
            }
            _ => self.err_at(&t, format!("на верхнем уровне ожидалось state, let, fn или screen, найдено «{}»", kw)),
        }
    }

    /// `(params) { body }` — после имени функции
    fn func_rest(&mut self, name: String, pos: Pos) -> R<FuncDecl> {
        self.expect_sym("(")?;
        let mut params = Vec::new();
        while !self.is_sym(")") {
            params.push(self.ident("имя параметра")?);
            if !self.eat_sym(",") {
                break;
            }
        }
        self.expect_sym(")")?;
        self.fn_stack.push(false);
        let body = self.block()?;
        let inner = self.fn_stack.pop().unwrap_or(false);
        self.mark_inner();
        Ok(FuncDecl { name, params, body, has_inner: inner, pos })
    }

    // ───────────── операторы ─────────────

    fn block(&mut self) -> R<Vec<Stmt>> {
        self.expect_sym("{")?;
        self.stmts_until_rbrace()
    }

    fn stmts_until_rbrace(&mut self) -> R<Vec<Stmt>> {
        let saved = self.depth;
        self.depth = 0;
        let mut v = Vec::new();
        loop {
            if self.eat_sym("}") {
                break;
            }
            if matches!(self.peek().t, T::Eof) {
                return self.err("не закрыта «{»");
            }
            if self.eat_sym(";") {
                continue;
            }
            v.push(self.stmt()?);
            let semi = self.eat_sym(";");
            if !semi && !self.is_sym("}") && !self.peek().nl {
                let t = self.peek().clone();
                return self.err_at(&t, format!("ожидался конец оператора (новая строка или «;»), найдено {}", Self::desc(&t)));
            }
        }
        self.depth = saved;
        Ok(v)
    }

    fn stmt(&mut self) -> R<Stmt> {
        let pos = self.pos();
        if let T::Id(kw) = self.peek().t.clone() {
            match kw.as_str() {
                "let" | "var" => {
                    self.next();
                    let name = self.ident("имя переменной")?;
                    self.expect_sym("=")?;
                    let e = self.expr()?;
                    return Ok(Stmt::Let(name, e, pos));
                }
                "if" => return self.if_stmt(),
                "while" => {
                    self.next();
                    let c = self.expr()?;
                    let b = self.block()?;
                    return Ok(Stmt::While(c, b));
                }
                "for" => {
                    self.next();
                    let a = self.ident("имя переменной цикла")?;
                    let (idx, var) = if self.eat_sym(",") { (Some(a), self.ident("имя переменной цикла")?) } else { (None, a) };
                    if !self.is_id("in") {
                        return self.err("ожидалось «in»");
                    }
                    self.next();
                    let it = self.expr()?;
                    let b = self.block()?;
                    return Ok(Stmt::For(idx, var, it, b, pos));
                }
                "return" => {
                    self.next();
                    let t = self.peek();
                    if t.nl || matches!(t.t, T::Sym("}") | T::Sym(";") | T::Eof) {
                        return Ok(Stmt::Return(None, pos));
                    }
                    return Ok(Stmt::Return(Some(self.expr()?), pos));
                }
                "break" => {
                    self.next();
                    return Ok(Stmt::Break(pos));
                }
                "continue" => {
                    self.next();
                    return Ok(Stmt::Continue(pos));
                }
                "fn" if matches!(self.peek_at(1).t, T::Id(_)) => {
                    self.next();
                    let name = self.ident("имя функции")?;
                    let f = self.func_rest(name.clone(), pos)?;
                    return Ok(Stmt::Let(name, Expr::Func(Rc::new(f)), pos));
                }
                _ => {}
            }
        }
        let e = self.expr()?;
        let op = match &self.peek().t {
            T::Sym("=") => Some(None),
            T::Sym("+=") => Some(Some(BinOp::Add)),
            T::Sym("-=") => Some(Some(BinOp::Sub)),
            T::Sym("*=") => Some(Some(BinOp::Mul)),
            T::Sym("/=") => Some(Some(BinOp::Div)),
            T::Sym("%=") => Some(Some(BinOp::Mod)),
            _ => None,
        };
        if let Some(op) = op {
            if !matches!(e, Expr::Ident(..) | Expr::Member(..) | Expr::Index(..)) {
                return self.err("слева от «=» должна быть переменная, поле или элемент списка");
            }
            self.next();
            let v = self.expr()?;
            return Ok(Stmt::Assign(e, op, v, pos));
        }
        Ok(Stmt::Expr(e, pos))
    }

    fn if_stmt(&mut self) -> R<Stmt> {
        self.next(); // if
        let mut arms = Vec::new();
        let c = self.expr()?;
        arms.push((c, self.block()?));
        let mut other = None;
        while self.is_id("else") {
            self.next();
            if self.is_id("if") {
                self.next();
                let c = self.expr()?;
                arms.push((c, self.block()?));
            } else {
                other = Some(self.block()?);
                break;
            }
        }
        Ok(Stmt::If(arms, other))
    }

    // ───────────── выражения ─────────────

    pub fn expr(&mut self) -> R<Expr> {
        let c = self.binary(1)?;
        if self.is_sym("?") && self.nl_ok() {
            self.next();
            let a = self.expr()?;
            self.expect_sym(":")?;
            let b = self.expr()?;
            return Ok(Expr::Cond(Box::new(c), Box::new(a), Box::new(b)));
        }
        Ok(c)
    }

    fn prec(s: &str) -> Option<u8> {
        Some(match s {
            "??" => 1,
            "||" => 2,
            "&&" => 3,
            "==" | "!=" => 4,
            "<" | ">" | "<=" | ">=" => 5,
            ".." => 6,
            "+" | "-" => 7,
            "*" | "/" | "%" => 8,
            _ => return None,
        })
    }

    fn binary(&mut self, min: u8) -> R<Expr> {
        let mut lhs = self.unary()?;
        loop {
            let tk = self.peek().clone();
            let s = match &tk.t {
                T::Sym(s) => *s,
                _ => break,
            };
            let pr = match Self::prec(s) {
                Some(p) if p >= min => p,
                _ => break,
            };
            if !self.nl_ok() {
                break;
            }
            self.next();
            let rhs = self.binary(pr + 1)?;
            let pos = Pos { line: tk.line, col: tk.col };
            let (l, r) = (Box::new(lhs), Box::new(rhs));
            lhs = match s {
                "??" => Expr::Coalesce(l, r),
                "||" => Expr::Or(l, r),
                "&&" => Expr::And(l, r),
                ".." => Expr::Range(l, r, pos),
                _ => {
                    let op = match s {
                        "==" => BinOp::Eq,
                        "!=" => BinOp::Ne,
                        "<" => BinOp::Lt,
                        "<=" => BinOp::Le,
                        ">" => BinOp::Gt,
                        ">=" => BinOp::Ge,
                        "+" => BinOp::Add,
                        "-" => BinOp::Sub,
                        "*" => BinOp::Mul,
                        "/" => BinOp::Div,
                        _ => BinOp::Mod,
                    };
                    Expr::Bin(op, l, r, pos)
                }
            };
        }
        Ok(lhs)
    }

    fn unary(&mut self) -> R<Expr> {
        let pos = self.pos();
        if self.eat_sym("-") {
            return Ok(Expr::Neg(Box::new(self.unary()?), pos));
        }
        if self.eat_sym("!") {
            return Ok(Expr::Not(Box::new(self.unary()?)));
        }
        let p = self.primary()?;
        self.postfix(p, true)
    }

    fn postfix(&mut self, mut e: Expr, calls: bool) -> R<Expr> {
        loop {
            let pos = self.pos();
            if calls && self.is_sym("(") && self.nl_ok() {
                self.next();
                self.depth += 1;
                let mut args = Vec::new();
                while !self.is_sym(")") {
                    args.push(self.expr()?);
                    if !self.eat_sym(",") {
                        break;
                    }
                }
                self.depth -= 1;
                self.expect_sym(")")?;
                e = match e {
                    Expr::Member(obj, name, p) => Expr::Method(obj, name, args, p),
                    other => Expr::Call(Box::new(other), args, pos),
                };
            } else if self.is_sym("[") && self.nl_ok() {
                self.next();
                self.depth += 1;
                let i = self.expr()?;
                self.depth -= 1;
                self.expect_sym("]")?;
                e = Expr::Index(Box::new(e), Box::new(i), pos);
            } else if self.is_sym(".") && self.nl_ok() {
                self.next();
                let name = self.ident("имя поля")?;
                e = Expr::Member(Box::new(e), name, pos);
            } else {
                break;
            }
        }
        Ok(e)
    }

    fn primary(&mut self) -> R<Expr> {
        let t = self.peek().clone();
        let pos = Pos { line: t.line, col: t.col };
        match t.t.clone() {
            T::Num(n) => {
                self.next();
                Ok(Expr::Num(n))
            }
            T::Str(s, interp) => {
                self.next();
                self.string_expr(&s, interp, &t)
            }
            T::Id(id) => match id.as_str() {
                "true" => {
                    self.next();
                    Ok(Expr::Bool(true))
                }
                "false" => {
                    self.next();
                    Ok(Expr::Bool(false))
                }
                "null" => {
                    self.next();
                    Ok(Expr::Null)
                }
                "fn" => {
                    self.next();
                    Ok(Expr::Func(Rc::new(self.lambda(pos)?)))
                }
                _ => {
                    self.next();
                    Ok(Expr::Ident(id, pos))
                }
            },
            T::Sym("(") => {
                self.next();
                self.depth += 1;
                let e = self.expr()?;
                self.depth -= 1;
                self.expect_sym(")")?;
                Ok(e)
            }
            T::Sym("[") => {
                self.next();
                self.depth += 1;
                let mut items = Vec::new();
                while !self.is_sym("]") {
                    if self.eat_sym("...") {
                        items.push(Item::Spread(self.expr()?));
                    } else {
                        items.push(Item::One(self.expr()?));
                    }
                    if !self.eat_sym(",") {
                        break;
                    }
                }
                self.depth -= 1;
                self.expect_sym("]")?;
                Ok(Expr::List(items))
            }
            T::Sym("{") => {
                self.next();
                self.depth += 1;
                let mut items = Vec::new();
                while !self.is_sym("}") {
                    if self.eat_sym("...") {
                        items.push(MapItem::Spread(self.expr()?));
                    } else {
                        let kt = self.peek().clone();
                        let key = match &kt.t {
                            T::Id(s) => {
                                self.next();
                                Expr::Str(s.clone())
                            }
                            T::Str(s, _) => {
                                self.next();
                                Expr::Str(s.replace(LBRACE_ESC, "{"))
                            }
                            T::Num(n) => {
                                self.next();
                                Expr::Str(crate::value::fmt_num(*n))
                            }
                            T::Sym("[") => {
                                self.next();
                                let k = self.expr()?;
                                self.expect_sym("]")?;
                                k
                            }
                            _ => return self.err_at(&kt, format!("ожидался ключ словаря, найдено {}", Self::desc(&kt))),
                        };
                        self.expect_sym(":")?;
                        items.push(MapItem::Pair(key, self.expr()?));
                    }
                    if !self.eat_sym(",") {
                        break;
                    }
                }
                self.depth -= 1;
                self.expect_sym("}")?;
                Ok(Expr::Map(items))
            }
            _ => self.err_at(&t, format!("ожидалось выражение, найдено {}", Self::desc(&t))),
        }
    }

    /// `fn(a, b) { … }` или `fn(a) => выражение`
    fn lambda(&mut self, pos: Pos) -> R<FuncDecl> {
        self.expect_sym("(")?;
        let mut params = Vec::new();
        while !self.is_sym(")") {
            params.push(self.ident("имя параметра")?);
            if !self.eat_sym(",") {
                break;
            }
        }
        self.expect_sym(")")?;
        self.fn_stack.push(false);
        let body = if self.eat_sym("=>") {
            let saved = self.depth;
            let e = self.expr()?;
            self.depth = saved;
            vec![Stmt::Return(Some(e), pos)]
        } else {
            self.block()?
        };
        let inner = self.fn_stack.pop().unwrap_or(false);
        self.mark_inner();
        Ok(FuncDecl { name: "fn".into(), params, body, has_inner: inner, pos })
    }

    fn string_expr(&mut self, s: &str, interp: bool, tok: &Token) -> R<Expr> {
        if !interp || !s.contains('{') {
            return Ok(Expr::Str(s.replace(LBRACE_ESC, "{")));
        }
        let chars: Vec<char> = s.chars().collect();
        let mut parts = Vec::new();
        let mut lit = String::new();
        let mut i = 0;
        while i < chars.len() {
            if chars[i] == '{' {
                let mut depth = 1;
                let mut j = i + 1;
                let mut q: Option<char> = None;
                while j < chars.len() && depth > 0 {
                    let c = chars[j];
                    if let Some(qq) = q {
                        if c == '\\' {
                            j += 1;
                        } else if c == qq {
                            q = None;
                        }
                    } else if c == '"' || c == '\'' {
                        q = Some(c);
                    } else if c == '{' {
                        depth += 1;
                    } else if c == '}' {
                        depth -= 1;
                    }
                    j += 1;
                }
                if depth != 0 {
                    return self.err_at(tok, "в строке не закрыта «{» (литеральную скобку пишите как \\{)");
                }
                let inner: String = chars[i + 1..j - 1].iter().collect();
                if inner.trim().is_empty() {
                    return self.err_at(tok, "пустое выражение «{}» в строке");
                }
                if !lit.is_empty() {
                    parts.push(Part::Lit(std::mem::take(&mut lit)));
                }
                parts.push(Part::Expr(self.sub_expr(&inner, tok)?));
                i = j;
            } else {
                lit.push(if chars[i] == LBRACE_ESC { '{' } else { chars[i] });
                i += 1;
            }
        }
        if !lit.is_empty() {
            parts.push(Part::Lit(lit));
        }
        Ok(Expr::Interp(parts))
    }

    fn sub_expr(&mut self, src: &str, tok: &Token) -> R<Expr> {
        let toks = lex(src, self.file, tok.line).map_err(|mut d| {
            d.col = tok.col;
            d
        })?;
        let mut sp = Parser { toks, p: 0, file: self.file, depth: 1, fn_stack: vec![false] };
        let e = sp.expr().map_err(|mut d| {
            d.line = tok.line;
            d.col = tok.col;
            d.msg = format!("в строке: {}", d.msg);
            d
        })?;
        if !matches!(sp.peek().t, T::Eof) {
            return self.err_at(tok, format!("в выражении «{}» лишнее: {}", src.trim(), Self::desc(sp.peek())));
        }
        if sp.fn_stack[0] {
            self.mark_inner();
        }
        Ok(e)
    }

    // ───────────── Noodle UI ─────────────

    fn ui_block(&mut self) -> R<Vec<Ui>> {
        self.expect_sym("{")?;
        let saved = self.depth;
        self.depth = 0;
        let mut v = Vec::new();
        loop {
            if self.eat_sym("}") {
                break;
            }
            if matches!(self.peek().t, T::Eof) {
                return self.err("не закрыта «{»");
            }
            if self.eat_sym(";") {
                continue;
            }
            v.push(self.ui_item()?);
        }
        self.depth = saved;
        Ok(v)
    }

    fn ui_item(&mut self) -> R<Ui> {
        let t = self.peek().clone();
        let pos = Pos { line: t.line, col: t.col };
        let name = match &t.t {
            T::Id(s) => s.clone(),
            _ => return self.err_at(&t, format!("ожидался элемент интерфейса, найдено {}", Self::desc(&t))),
        };
        match name.as_str() {
            "if" => {
                self.next();
                let cond = self.expr()?;
                let then = self.ui_block()?;
                let mut other = Vec::new();
                if self.is_id("else") {
                    self.next();
                    if self.is_id("if") {
                        other = vec![self.ui_item()?];
                    } else {
                        other = self.ui_block()?;
                    }
                }
                Ok(Ui::If { cond, then, other })
            }
            "each" | "for" => {
                self.next();
                let (idx, var, iter);
                if name == "each" {
                    iter = self.expr()?;
                    if !self.is_id("as") {
                        return self.err("синтаксис: each список as элемент { … }");
                    }
                    self.next();
                    let v = self.ident("имя элемента")?;
                    if self.eat_sym(",") {
                        idx = Some(self.ident("имя индекса")?);
                    } else {
                        idx = None;
                    }
                    var = v;
                } else {
                    let a = self.ident("имя элемента")?;
                    let (i, v) = if self.eat_sym(",") { (Some(a), self.ident("имя элемента")?) } else { (None, a) };
                    if !self.is_id("in") {
                        return self.err("синтаксис: for элемент in список { … }");
                    }
                    self.next();
                    iter = self.expr()?;
                    idx = i;
                    var = v;
                }
                let body = self.ui_block()?;
                Ok(Ui::Each { iter, var, idx, body, pos })
            }
            "let" | "var" => {
                self.next();
                let n = self.ident("имя переменной")?;
                self.expect_sym("=")?;
                let e = self.expr()?;
                Ok(Ui::Let(n, e, pos))
            }
            tag if TAGS.contains(&tag) => self.element(tag.to_string(), pos),
            other => self.err_at(&t, format!("неизвестный элемент «{}». Доступны: {}, а также if, each, let", other, TAGS.join(", "))),
        }
    }

    fn element(&mut self, tag: String, pos: Pos) -> R<Ui> {
        self.next(); // имя элемента
        let mut text = None;
        let mut attrs: Vec<(String, Attr)> = Vec::new();
        let mut children = Vec::new();
        loop {
            let t = self.peek().clone();
            if t.nl && !self.is_sym("{") {
                break;
            }
            match &t.t {
                T::Eof | T::Sym("}") | T::Sym(";") => break,
                T::Sym("{") => {
                    children = self.ui_block()?;
                    break;
                }
                T::Str(s, interp) => {
                    if text.is_some() {
                        return self.err_at(&t, "у элемента уже есть текст");
                    }
                    self.next();
                    text = Some(self.string_expr(s, *interp, &t)?);
                }
                T::Id(name) => {
                    let followed_by_eq = matches!(self.peek_at(1).t, T::Sym("="));
                    if !followed_by_eq && (TAGS.contains(&name.as_str()) || matches!(name.as_str(), "if" | "each" | "let" | "for")) {
                        break;
                    }
                    let name = name.clone();
                    self.next();
                    if self.eat_sym("=") {
                        let a = self.attr_value(&name)?;
                        attrs.push((name, a));
                    } else {
                        attrs.push((name, Attr::Flag));
                    }
                }
                _ => return self.err_at(&t, format!("в описании элемента «{}» неожиданно {}", tag, Self::desc(&t))),
            }
        }
        Ok(Ui::Elem { tag, text, attrs, children, pos })
    }

    fn attr_value(&mut self, name: &str) -> R<Attr> {
        let t = self.peek().clone();
        if name == "bind" {
            self.mark_inner(); // bind создаёт обработчик-замыкание
        }
        if self.is_sym("{") {
            self.next();
            if name.starts_with("on") {
                let pos = Pos { line: t.line, col: t.col };
                self.fn_stack.push(false);
                let body = self.stmts_until_rbrace()?;
                let inner = self.fn_stack.pop().unwrap_or(false);
                self.mark_inner();
                return Ok(Attr::Handler(Rc::new(FuncDecl { name: "handler".into(), params: vec![], body, has_inner: inner, pos })));
            }
            let saved = self.depth;
            self.depth = 1;
            let e = self.expr()?;
            self.depth = saved;
            self.expect_sym("}")?;
            return Ok(if name == "bind" { Attr::Bind(e) } else { Attr::Val(e) });
        }
        let e = match &t.t {
            T::Num(n) => {
                self.next();
                Expr::Num(*n)
            }
            T::Sym("-") => {
                self.next();
                match self.next().t {
                    T::Num(n) => Expr::Num(-n),
                    _ => return self.err_at(&t, "после «-» ожидалось число"),
                }
            }
            T::Str(s, interp) => {
                self.next();
                self.string_expr(s, *interp, &t)?
            }
            T::Id(id) => {
                self.next();
                let base = match id.as_str() {
                    "true" => Expr::Bool(true),
                    "false" => Expr::Bool(false),
                    "null" => Expr::Null,
                    _ => Expr::Ident(id.clone(), Pos { line: t.line, col: t.col }),
                };
                self.postfix(base, false)?
            }
            _ => return self.err_at(&t, format!("у атрибута «{}» нет значения", name)),
        };
        Ok(if name == "bind" { Attr::Bind(e) } else { Attr::Val(e) })
    }
}
