//! Компилятор: AST → байткод.
use crate::ast::*;
use crate::bytecode::*;
use crate::builtins;
use crate::Diag;
use std::collections::HashMap;
use std::rc::Rc;

struct LocalVar {
    name: String,
    slot: u16,
}
struct Loop {
    breaks: Vec<usize>,
    top: usize,
}
struct FnState {
    name: String,
    file: String,
    code: Vec<Op>,
    lines: Vec<u32>,
    locals: Vec<LocalVar>,
    next_slot: u16,
    max_slot: u16,
    boxed: bool,
    nparams: u16,
    caps: Vec<(bool, u16)>,
    cap_names: Vec<String>,
    loops: Vec<Loop>,
    line: u32,
}

enum Res {
    Local(u16),
    Up(u16),
    Global(u32),
    Builtin(u16),
}

#[derive(Default)]
pub struct Compiler {
    consts: Vec<Const>,
    cstr: HashMap<String, u32>,
    funcs: Vec<Proto>,
    gnames: HashMap<String, u32>,
    globals: Vec<String>,
    fns: Vec<FnState>,
    pub diags: Vec<Diag>,
    file: String,
}

impl Compiler {
    pub fn new() -> Compiler {
        Compiler::default()
    }

    fn diag(&mut self, pos: Pos, msg: impl Into<String>) {
        self.diags.push(Diag { file: self.file.clone(), line: pos.line, col: pos.col, msg: msg.into() });
    }
    fn f(&mut self) -> &mut FnState {
        self.fns.last_mut().expect("fn state")
    }
    fn emit(&mut self, op: Op) -> usize {
        let f = self.f();
        f.code.push(op);
        let l = f.line;
        f.lines.push(l);
        f.code.len() - 1
    }
    fn here(&mut self) -> usize {
        self.f().code.len()
    }
    fn patch(&mut self, at: usize, target: usize) {
        let t = target as u32;
        let f = self.f();
        f.code[at] = match f.code[at].clone() {
            Op::Jump(_) => Op::Jump(t),
            Op::JumpIfFalse(_) => Op::JumpIfFalse(t),
            Op::AndJump(_) => Op::AndJump(t),
            Op::OrJump(_) => Op::OrJump(t),
            Op::NullJump(_) => Op::NullJump(t),
            Op::IterNext { slot, idx, .. } => Op::IterNext { slot, exit: t, idx },
            other => other,
        };
    }
    fn set_line(&mut self, pos: Pos) {
        if pos.line > 0 {
            self.f().line = pos.line;
        }
    }
    fn kstr(&mut self, s: &str) -> u32 {
        if let Some(i) = self.cstr.get(s) {
            return *i;
        }
        self.consts.push(Const::Str(s.to_string()));
        let i = (self.consts.len() - 1) as u32;
        self.cstr.insert(s.to_string(), i);
        i
    }
    fn knum(&mut self, n: f64) -> u32 {
        self.consts.push(Const::Num(n));
        (self.consts.len() - 1) as u32
    }

    // ───────────── переменные ─────────────

    fn declare(&mut self, name: &str) -> u16 {
        let f = self.f();
        let slot = f.next_slot;
        f.next_slot += 1;
        f.max_slot = f.max_slot.max(f.next_slot);
        f.locals.push(LocalVar { name: name.to_string(), slot });
        slot
    }
    fn hidden(&mut self) -> u16 {
        let f = self.f();
        let slot = f.next_slot;
        f.next_slot += 1;
        f.max_slot = f.max_slot.max(f.next_slot);
        slot
    }
    fn begin(&mut self) -> (usize, u16) {
        let f = self.f();
        (f.locals.len(), f.next_slot)
    }
    fn end(&mut self, m: (usize, u16)) {
        let f = self.f();
        f.locals.truncate(m.0);
        f.next_slot = m.1;
    }

    fn find_local(&self, level: usize, name: &str) -> Option<u16> {
        self.fns[level].locals.iter().rev().find(|l| l.name == name).map(|l| l.slot)
    }
    fn add_cap(&mut self, level: usize, from_local: bool, idx: u16, name: &str) -> u16 {
        let f = &mut self.fns[level];
        if let Some(i) = f.caps.iter().position(|c| *c == (from_local, idx)) {
            return i as u16;
        }
        f.caps.push((from_local, idx));
        f.cap_names.push(name.to_string());
        (f.caps.len() - 1) as u16
    }
    fn resolve_up(&mut self, level: usize, name: &str) -> Option<u16> {
        if level == 0 {
            return None;
        }
        if let Some(slot) = self.find_local(level - 1, name) {
            return Some(self.add_cap(level, true, slot, name));
        }
        if let Some(i) = self.resolve_up(level - 1, name) {
            return Some(self.add_cap(level, false, i, name));
        }
        None
    }
    fn resolve(&mut self, name: &str) -> Option<Res> {
        let level = self.fns.len() - 1;
        if let Some(s) = self.find_local(level, name) {
            return Some(Res::Local(s));
        }
        if let Some(u) = self.resolve_up(level, name) {
            return Some(Res::Up(u));
        }
        if let Some(g) = self.gnames.get(name) {
            return Some(Res::Global(*g));
        }
        builtins::lookup(name).map(Res::Builtin)
    }
    fn load_var(&mut self, name: &str, pos: Pos) {
        self.set_line(pos);
        match self.resolve(name) {
            Some(Res::Local(s)) => {
                if self.f().boxed {
                    self.emit(Op::CellGet(s));
                } else {
                    self.emit(Op::Local(s));
                }
            }
            Some(Res::Up(i)) => {
                self.emit(Op::UpGet(i));
            }
            Some(Res::Global(g)) => {
                self.emit(Op::Global(g));
            }
            Some(Res::Builtin(b)) => {
                self.emit(Op::Builtin(b));
            }
            None => {
                self.diag(pos, format!("неизвестное имя «{}»", name));
                self.emit(Op::Null);
            }
        }
    }
    /// сохраняет вершину стека в переменную (pop)
    fn store_var(&mut self, name: &str, pos: Pos) {
        self.set_line(pos);
        match self.resolve(name) {
            Some(Res::Local(s)) => {
                if self.f().boxed {
                    self.emit(Op::CellSet(s));
                } else {
                    self.emit(Op::SetLocal(s));
                }
            }
            Some(Res::Up(i)) => {
                self.emit(Op::UpSet(i));
            }
            Some(Res::Global(g)) => {
                self.emit(Op::SetGlobal(g));
            }
            Some(Res::Builtin(_)) => {
                self.diag(pos, format!("«{}» — встроенная функция, ей нельзя присваивать", name));
                self.emit(Op::Pop);
            }
            None => {
                self.diag(pos, format!("неизвестное имя «{}» (объявите через let)", name));
                self.emit(Op::Pop);
            }
        }
    }
    /// новая локальная переменная со значением с вершины стека
    fn init_local(&mut self, slot: u16) {
        if self.f().boxed {
            self.emit(Op::CellNew(slot));
        } else {
            self.emit(Op::SetLocal(slot));
        }
    }

    // ───────────── функции ─────────────

    fn compile_func(&mut self, d: &FuncDecl) -> u32 {
        let file = self.file.clone();
        self.fns.push(FnState {
            name: d.name.clone(),
            file,
            code: vec![],
            lines: vec![],
            locals: vec![],
            next_slot: 0,
            max_slot: 0,
            boxed: d.has_inner,
            nparams: d.params.len() as u16,
            caps: vec![],
            cap_names: vec![],
            loops: vec![],
            line: d.pos.line,
        });
        for p in &d.params {
            self.declare(p);
        }
        if d.has_inner {
            for i in 0..d.params.len() as u16 {
                self.emit(Op::Local(i));
                self.emit(Op::CellNew(i));
            }
        }
        self.stmts(&d.body);
        self.emit(Op::Null);
        self.emit(Op::Return);
        self.finish_fn()
    }

    fn finish_fn(&mut self) -> u32 {
        let st = self.fns.pop().expect("fn");
        self.funcs.push(Proto { name: st.name, file: st.file, nparams: st.nparams, nlocals: st.max_slot, boxed: st.boxed, code: st.code, lines: st.lines, caps: st.caps });
        (self.funcs.len() - 1) as u32
    }

    // ───────────── операторы ─────────────

    fn stmts(&mut self, v: &[Stmt]) {
        let m = self.begin();
        for s in v {
            self.stmt(s);
        }
        self.end(m);
    }

    fn stmt(&mut self, s: &Stmt) {
        match s {
            Stmt::Let(name, e, pos) => {
                self.set_line(*pos);
                self.let_var(name, e, *pos);
            }
            Stmt::Assign(target, op, val, pos) => {
                self.set_line(*pos);
                self.assign(target, *op, val, *pos);
            }
            Stmt::Expr(e, pos) => {
                self.set_line(*pos);
                self.expr(e);
                self.emit(Op::Pop);
            }
            Stmt::If(arms, other) => {
                let mut ends = vec![];
                for (c, body) in arms {
                    self.expr(c);
                    let jf = self.emit(Op::JumpIfFalse(0));
                    self.stmts(body);
                    ends.push(self.emit(Op::Jump(0)));
                    let h = self.here();
                    self.patch(jf, h);
                }
                if let Some(b) = other {
                    self.stmts(b);
                }
                let h = self.here();
                for e in ends {
                    self.patch(e, h);
                }
            }
            Stmt::While(c, body) => {
                let top = self.here();
                self.expr(c);
                let jf = self.emit(Op::JumpIfFalse(0));
                self.f().loops.push(Loop { breaks: vec![], top });
                self.stmts(body);
                self.emit(Op::Jump(top as u32));
                let lp = self.f().loops.pop().unwrap();
                let h = self.here();
                self.patch(jf, h);
                for b in lp.breaks {
                    self.patch(b, h);
                }
            }
            Stmt::For(idx, var, iter, body, pos) => {
                self.set_line(*pos);
                let m = self.begin();
                self.expr(iter);
                self.emit(Op::IterInit);
                let slot = self.hidden();
                self.emit(Op::SetLocal(slot));
                let top = self.here();
                let it = self.emit(Op::IterNext { slot, exit: 0, idx: idx.is_some() });
                let inner = self.begin();
                let vs = self.declare(var);
                self.init_local(vs);
                if let Some(i) = idx {
                    let is = self.declare(i);
                    self.init_local(is);
                }
                self.f().loops.push(Loop { breaks: vec![], top });
                self.stmts(body);
                self.emit(Op::Jump(top as u32));
                let lp = self.f().loops.pop().unwrap();
                self.end(inner);
                let h = self.here();
                self.patch(it, h);
                for b in lp.breaks {
                    self.patch(b, h);
                }
                self.end(m);
            }
            Stmt::Return(e, pos) => {
                self.set_line(*pos);
                match e {
                    Some(e) => self.expr(e),
                    None => {
                        self.emit(Op::Null);
                    }
                }
                self.emit(Op::Return);
            }
            Stmt::Break(pos) => {
                self.set_line(*pos);
                if self.f().loops.is_empty() {
                    self.diag(*pos, "break вне цикла");
                } else {
                    let j = self.emit(Op::Jump(0));
                    self.f().loops.last_mut().unwrap().breaks.push(j);
                }
            }
            Stmt::Continue(pos) => {
                self.set_line(*pos);
                match self.f().loops.last().map(|l| l.top) {
                    Some(top) => {
                        self.emit(Op::Jump(top as u32));
                    }
                    None => self.diag(*pos, "continue вне цикла"),
                }
            }
        }
    }

    fn let_var(&mut self, name: &str, e: &Expr, _pos: Pos) {
        let is_fn = matches!(e, Expr::Func(_));
        if self.f().boxed {
            // ячейка создаётся до вычисления выражения — чтобы замыкание могло ссылаться на саму переменную
            let slot;
            if is_fn {
                slot = self.declare(name);
                self.emit(Op::Null);
                self.emit(Op::CellNew(slot));
                self.expr(e);
                self.emit(Op::CellSet(slot));
            } else {
                let f = self.f();
                let s = f.next_slot;
                f.next_slot += 1;
                f.max_slot = f.max_slot.max(f.next_slot);
                slot = s;
                self.emit(Op::Null);
                self.emit(Op::CellNew(slot));
                self.expr(e);
                self.emit(Op::CellSet(slot));
                let f = self.f();
                f.locals.push(LocalVar { name: name.to_string(), slot });
            }
        } else {
            if is_fn {
                let slot = self.declare(name);
                self.expr(e);
                self.emit(Op::SetLocal(slot));
            } else {
                let f = self.f();
                let slot = f.next_slot;
                f.next_slot += 1;
                f.max_slot = f.max_slot.max(f.next_slot);
                self.expr(e);
                self.emit(Op::SetLocal(slot));
                self.f().locals.push(LocalVar { name: name.to_string(), slot });
            }
        }
    }

    fn binop(&mut self, op: BinOp) {
        self.emit(match op {
            BinOp::Add => Op::Add,
            BinOp::Sub => Op::Sub,
            BinOp::Mul => Op::Mul,
            BinOp::Div => Op::Div,
            BinOp::Mod => Op::Mod,
            BinOp::Eq => Op::Eq,
            BinOp::Ne => Op::Ne,
            BinOp::Lt => Op::Lt,
            BinOp::Le => Op::Le,
            BinOp::Gt => Op::Gt,
            BinOp::Ge => Op::Ge,
        });
    }

    fn assign(&mut self, target: &Expr, op: Option<BinOp>, val: &Expr, pos: Pos) {
        match target {
            Expr::Ident(name, p) => {
                if let Some(op) = op {
                    self.load_var(name, *p);
                    self.expr(val);
                    self.set_line(pos);
                    self.binop(op);
                } else {
                    self.expr(val);
                }
                self.store_var(name, *p);
            }
            Expr::Member(obj, name, _) => {
                self.expr(obj);
                let k = self.kstr(name);
                if let Some(op) = op {
                    self.emit(Op::Dup);
                    self.emit(Op::Get(k));
                    self.expr(val);
                    self.binop(op);
                } else {
                    self.expr(val);
                }
                self.set_line(pos);
                self.emit(Op::Set(k));
            }
            Expr::Index(obj, idx, _) => {
                self.expr(obj);
                self.expr(idx);
                if let Some(op) = op {
                    self.emit(Op::Dup2);
                    self.emit(Op::Index);
                    self.expr(val);
                    self.binop(op);
                } else {
                    self.expr(val);
                }
                self.set_line(pos);
                self.emit(Op::SetIndex);
            }
            _ => self.diag(pos, "нельзя присвоить это выражение"),
        }
    }

    // ───────────── выражения ─────────────

    fn expr(&mut self, e: &Expr) {
        match e {
            Expr::Null => {
                self.emit(Op::Null);
            }
            Expr::Bool(b) => {
                self.emit(if *b { Op::True } else { Op::False });
            }
            Expr::Num(n) => {
                let k = self.knum(*n);
                self.emit(Op::Const(k));
            }
            Expr::Str(s) => {
                let k = self.kstr(s);
                self.emit(Op::Const(k));
            }
            Expr::Interp(parts) => {
                for p in parts {
                    match p {
                        Part::Lit(s) => {
                            let k = self.kstr(s);
                            self.emit(Op::Const(k));
                        }
                        Part::Expr(x) => self.expr(x),
                    }
                }
                self.emit(Op::Interp(parts.len() as u16));
            }
            Expr::List(items) => {
                self.emit(Op::NewList);
                for it in items {
                    match it {
                        Item::One(x) => {
                            self.expr(x);
                            self.emit(Op::Push);
                        }
                        Item::Spread(x) => {
                            self.expr(x);
                            self.emit(Op::Extend);
                        }
                    }
                }
            }
            Expr::Map(items) => {
                self.emit(Op::NewMap);
                for it in items {
                    match it {
                        MapItem::Pair(Expr::Str(k), v) => {
                            self.expr(v);
                            let ki = self.kstr(k);
                            self.emit(Op::MapSet(ki));
                        }
                        MapItem::Pair(k, v) => {
                            self.expr(k);
                            self.expr(v);
                            self.emit(Op::MapSetDyn);
                        }
                        MapItem::Spread(x) => {
                            self.expr(x);
                            self.emit(Op::MapExtend);
                        }
                    }
                }
            }
            Expr::Ident(n, p) => self.load_var(n, *p),
            Expr::Neg(x, p) => {
                self.expr(x);
                self.set_line(*p);
                self.emit(Op::Neg);
            }
            Expr::Not(x) => {
                self.expr(x);
                self.emit(Op::Not);
            }
            Expr::Bin(op, a, b, p) => {
                self.expr(a);
                self.expr(b);
                self.set_line(*p);
                self.binop(*op);
            }
            Expr::And(a, b) => {
                self.expr(a);
                let j = self.emit(Op::AndJump(0));
                self.expr(b);
                let h = self.here();
                self.patch(j, h);
            }
            Expr::Or(a, b) => {
                self.expr(a);
                let j = self.emit(Op::OrJump(0));
                self.expr(b);
                let h = self.here();
                self.patch(j, h);
            }
            Expr::Coalesce(a, b) => {
                self.expr(a);
                let j = self.emit(Op::NullJump(0));
                self.expr(b);
                let h = self.here();
                self.patch(j, h);
            }
            Expr::Cond(c, a, b) => {
                self.expr(c);
                let jf = self.emit(Op::JumpIfFalse(0));
                self.expr(a);
                let je = self.emit(Op::Jump(0));
                let h = self.here();
                self.patch(jf, h);
                self.expr(b);
                let h2 = self.here();
                self.patch(je, h2);
            }
            Expr::Range(a, b, p) => {
                self.expr(a);
                self.expr(b);
                self.set_line(*p);
                self.emit(Op::Range);
            }
            Expr::Call(callee, args, p) => {
                self.expr(callee);
                for a in args {
                    self.expr(a);
                }
                self.set_line(*p);
                if args.len() > 250 {
                    self.diag(*p, "слишком много аргументов");
                }
                self.emit(Op::Call(args.len() as u8));
            }
            Expr::Method(obj, name, args, p) => {
                self.expr(obj);
                for a in args {
                    self.expr(a);
                }
                self.set_line(*p);
                let k = self.kstr(name);
                self.emit(Op::Method(k, args.len() as u8));
            }
            Expr::Member(obj, name, p) => {
                self.expr(obj);
                self.set_line(*p);
                let k = self.kstr(name);
                self.emit(Op::Get(k));
            }
            Expr::Index(obj, i, p) => {
                self.expr(obj);
                self.expr(i);
                self.set_line(*p);
                self.emit(Op::Index);
            }
            Expr::Func(d) => {
                let idx = self.compile_func(d);
                self.emit(Op::Closure(idx));
            }
        }
    }

    // ───────────── Noodle UI ─────────────

    fn ui_items(&mut self, items: &[Ui]) {
        let m = self.begin();
        for it in items {
            self.ui_item(it);
        }
        self.end(m);
    }

    fn ui_item(&mut self, it: &Ui) {
        match it {
            Ui::Let(n, e, p) => {
                self.set_line(*p);
                self.let_var(n, e, *p);
            }
            Ui::If { cond, then, other } => {
                self.expr(cond);
                let jf = self.emit(Op::JumpIfFalse(0));
                self.ui_items(then);
                let je = self.emit(Op::Jump(0));
                let h = self.here();
                self.patch(jf, h);
                self.ui_items(other);
                let h2 = self.here();
                self.patch(je, h2);
            }
            Ui::Each { iter, var, idx, body, pos } => {
                self.set_line(*pos);
                let m = self.begin();
                self.expr(iter);
                self.emit(Op::IterInit);
                let slot = self.hidden();
                self.emit(Op::SetLocal(slot));
                let top = self.here();
                let nx = self.emit(Op::IterNext { slot, exit: 0, idx: idx.is_some() });
                let inner = self.begin();
                let vs = self.declare(var);
                self.init_local(vs);
                if let Some(i) = idx {
                    let is = self.declare(i);
                    self.init_local(is);
                }
                self.ui_items(body);
                self.emit(Op::Jump(top as u32));
                self.end(inner);
                let h = self.here();
                self.patch(nx, h);
                self.end(m);
            }
            Ui::Elem { tag, text, attrs, children, pos } => {
                self.set_line(*pos);
                // стек: [список] → [список, узел]
                self.emit(Op::NewMap);
                let k = self.kstr(tag);
                self.emit(Op::Const(k));
                let kt = self.kstr("t");
                self.emit(Op::MapSet(kt));
                if let Some(t) = text {
                    self.expr(t);
                    let kx = self.kstr("x");
                    self.emit(Op::MapSet(kx));
                }
                if !attrs.is_empty() {
                    self.emit(Op::NewMap);
                    for (name, a) in attrs {
                        let key = self.kstr(name);
                        match a {
                            Attr::Flag => {
                                self.emit(Op::True);
                                self.emit(Op::MapSet(key));
                            }
                            Attr::Val(e) => {
                                self.expr(e);
                                self.emit(Op::MapSet(key));
                            }
                            Attr::Handler(d) => {
                                let idx = self.compile_func(d);
                                self.emit(Op::Closure(idx));
                                self.emit(Op::MapSet(key));
                            }
                            Attr::Bind(target) => {
                                self.expr(target);
                                let kv = self.kstr("value");
                                self.emit(Op::MapSet(kv));
                                let pos = *pos;
                                let d = FuncDecl {
                                    name: "bind".into(),
                                    params: vec!["__v".into()],
                                    body: vec![Stmt::Assign(target.clone(), None, Expr::Ident("__v".into(), pos), pos)],
                                    has_inner: false,
                                    pos,
                                };
                                let idx = self.compile_func(&d);
                                self.emit(Op::Closure(idx));
                                let kb = self.kstr("bind");
                                self.emit(Op::MapSet(kb));
                            }
                        }
                    }
                    let ka = self.kstr("a");
                    self.emit(Op::MapSet(ka));
                }
                if !children.is_empty() {
                    self.emit(Op::NewList);
                    self.ui_items(children);
                    let kc = self.kstr("c");
                    self.emit(Op::MapSet(kc));
                }
                self.emit(Op::Push);
            }
        }
    }
}

/// Компиляция набора файлов. Файлы обрабатываются в порядке списка.
pub fn compile_files(files: &[(String, String)]) -> Result<Program, Vec<Diag>> {
    let mut c = Compiler::new();
    let mut diags = Vec::new();
    let mut parsed: Vec<(String, Vec<TopItem>)> = Vec::new();
    for (name, src) in files {
        let (items, d) = crate::parser::parse_file(src, name);
        diags.extend(d);
        parsed.push((name.clone(), items));
    }
    if !diags.is_empty() {
        return Err(diags);
    }
    // 1) глобальные имена
    let mut prog = Program::default();
    for (file, items) in &parsed {
        c.file = file.clone();
        for it in items {
            let (name, pos) = match it {
                TopItem::State { name, pos, .. } | TopItem::Let { name, pos, .. } => (name.clone(), *pos),
                TopItem::Fn(d) => (d.name.clone(), d.pos),
                TopItem::App(n) => {
                    prog.name = n.clone();
                    continue;
                }
                TopItem::Screen { .. } => continue,
            };
            if c.gnames.contains_key(&name) {
                c.diag(pos, format!("имя «{}» уже объявлено", name));
                continue;
            }
            c.gnames.insert(name.clone(), c.globals.len() as u32);
            c.globals.push(name);
        }
    }
    // 2) функции и экраны
    let mut fn_protos: Vec<(u32, u32)> = Vec::new(); // (global, proto)
    let mut screens: Vec<(String, u32)> = Vec::new();
    for (file, items) in &parsed {
        c.file = file.clone();
        for it in items {
            match it {
                TopItem::Fn(d) => {
                    if let Some(g) = c.gnames.get(&d.name).copied() {
                        let p = c.compile_func(d);
                        fn_protos.push((g, p));
                    }
                }
                TopItem::Screen { name, func, ui, pos } => {
                    if screens.iter().any(|(n, _)| n == name) {
                        c.diag(*pos, format!("экран «{}» уже объявлен", name));
                        continue;
                    }
                    c.fns.push(FnState {
                        name: func.name.clone(),
                        file: file.clone(),
                        code: vec![],
                        lines: vec![],
                        locals: vec![],
                        next_slot: 0,
                        max_slot: 0,
                        boxed: func.has_inner,
                        nparams: 0,
                        caps: vec![],
                        cap_names: vec![],
                        loops: vec![],
                        line: pos.line,
                    });
                    c.emit(Op::NewList);
                    c.ui_items(ui);
                    c.emit(Op::Return);
                    let p = c.finish_fn();
                    screens.push((name.clone(), p));
                }
                _ => {}
            }
        }
    }
    // 3) инициализация: функции, затем state/let по порядку
    c.fns.push(FnState {
        name: "<init>".into(),
        file: String::new(),
        code: vec![],
        lines: vec![],
        locals: vec![],
        next_slot: 0,
        max_slot: 0,
        boxed: false,
        nparams: 0,
        caps: vec![],
        cap_names: vec![],
        loops: vec![],
        line: 1,
    });
    for (g, p) in &fn_protos {
        c.emit(Op::Closure(*p));
        c.emit(Op::SetGlobal(*g));
    }
    let mut states = Vec::new();
    for (file, items) in &parsed {
        c.file = file.clone();
        c.f().file = file.clone();
        for it in items {
            match it {
                TopItem::State { name, init, persist, pos } => {
                    c.set_line(*pos);
                    c.expr(init);
                    let g = c.gnames[name];
                    c.emit(Op::SetGlobal(g));
                    states.push(StateInfo { name: name.clone(), global: g, persist: *persist });
                }
                TopItem::Let { name, init, pos } => {
                    c.set_line(*pos);
                    c.expr(init);
                    let g = c.gnames[name];
                    c.emit(Op::SetGlobal(g));
                }
                _ => {}
            }
        }
    }
    c.emit(Op::Null);
    c.emit(Op::Return);
    let init = c.finish_fn();
    if screens.is_empty() && c.diags.is_empty() {
        c.file = files.first().map(|f| f.0.clone()).unwrap_or_default();
        c.diag(Pos { line: 1, col: 1 }, "не объявлено ни одного экрана: screen main { … }");
    }
    if !c.diags.is_empty() {
        return Err(c.diags);
    }
    prog.consts = c.consts;
    prog.funcs = c.funcs;
    prog.globals = c.globals;
    prog.init = init;
    prog.screens = screens;
    prog.states = states;
    let _ = Rc::new(());
    Ok(prog)
}
