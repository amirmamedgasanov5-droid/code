//! Виртуальная машина Noodle Script.
use crate::builtins;
use crate::bytecode::*;
use crate::value::*;
use std::cell::RefCell;
use std::collections::BTreeMap;
use std::rc::Rc;

pub struct RtErr {
    pub msg: String,
    /// стек вызовов: (файл, функция, строка)
    pub trace: Vec<(String, String, u32)>,
}

impl RtErr {
    pub fn plain(msg: impl Into<String>) -> RtErr {
        RtErr { msg: msg.into(), trace: vec![] }
    }
    pub fn render(&self) -> String {
        let mut s = self.msg.clone();
        for (file, f, line) in &self.trace {
            s.push_str(&format!("\n    в {} ({}:{})", f, file, line));
        }
        s
    }
}

#[derive(Clone, Debug)]
pub struct LogEntry {
    pub level: &'static str,
    pub text: String,
}

pub struct Timer {
    pub id: u32,
    pub fire_at: f64,
    pub interval: Option<f64>,
    pub f: Value,
}

pub enum Nav {
    Goto(String),
    Back,
}

/// Состояние хоста, доступное скриптам (навигация, таймеры, хранилище, логи).
pub struct Host {
    pub logs: Vec<LogEntry>,
    pub nav: Vec<Nav>,
    pub toasts: Vec<String>,
    pub timers: Vec<Timer>,
    pub next_timer: u32,
    pub storage: BTreeMap<String, String>,
    pub storage_dirty: bool,
    pub now_ms: f64,
    pub tz_min: i32,
    pub vibrations: Vec<u32>,
    pub exit: bool,
    pub redraw: bool,
    pub rng: u64,
    pub cancelled: Vec<u32>,
}

impl Host {
    fn new() -> Host {
        Host { logs: vec![], nav: vec![], toasts: vec![], timers: vec![], next_timer: 1, storage: BTreeMap::new(), storage_dirty: false, now_ms: 0.0, tz_min: 0, vibrations: vec![], exit: false, redraw: false, rng: 0x9E3779B97F4A7C15, cancelled: vec![] }
    }
}

struct Frame {
    closure: Rc<Closure>,
    ip: usize,
    base: usize,
}

pub struct Vm {
    pub prog: Rc<Program>,
    pub globals: Vec<Value>,
    stack: Vec<Value>,
    frames: Vec<Frame>,
    pub host: Host,
    pub steps: u64,
    pub step_limit: u64,
}

const MAX_FRAMES: usize = 200;

impl Vm {
    pub fn new(prog: Program) -> Vm {
        let n = prog.globals.len();
        Vm { prog: Rc::new(prog), globals: vec![Value::Null; n], stack: Vec::with_capacity(256), frames: Vec::new(), host: Host::new(), steps: 0, step_limit: 30_000_000 }
    }

    pub fn log(&mut self, level: &'static str, text: impl Into<String>) {
        self.host.logs.push(LogEntry { level, text: text.into() });
    }

    /// Вызов значения-функции из Rust (обработчики, таймеры, встроенные map/filter…).
    pub fn call(&mut self, f: &Value, args: Vec<Value>) -> Result<Value, RtErr> {
        match f {
            Value::Native(id) => (builtins::TABLE[*id as usize].1)(self, args).map_err(RtErr::plain),
            Value::Func(c) => {
                if self.frames.len() >= MAX_FRAMES {
                    return Err(RtErr::plain("слишком глубокая рекурсия"));
                }
                let sl = self.stack.len();
                let depth = self.frames.len();
                self.stack.push(f.clone());
                self.push_frame(c.clone(), args);
                match self.run(depth) {
                    Ok(v) => Ok(v),
                    Err(e) => {
                        self.stack.truncate(sl);
                        self.frames.truncate(depth);
                        Err(e)
                    }
                }
            }
            other => Err(RtErr::plain(format!("нельзя вызвать значение типа {}", other.type_name()))),
        }
    }

    fn push_frame(&mut self, c: Rc<Closure>, mut args: Vec<Value>) {
        let proto = &self.prog.funcs[c.proto as usize];
        let (np, nl) = (proto.nparams as usize, proto.nlocals as usize);
        let base = self.stack.len();
        args.truncate(np);
        while args.len() < np {
            args.push(Value::Null);
        }
        self.stack.extend(args);
        while self.stack.len() < base + nl.max(np) {
            self.stack.push(Value::Null);
        }
        self.frames.push(Frame { closure: c, ip: 0, base });
    }

    /// Запускает init-функцию программы (инициализация глобальных переменных).
    pub fn run_init(&mut self) -> Result<(), RtErr> {
        let c = Rc::new(Closure { proto: self.prog.init, caps: vec![] });
        self.call(&Value::Func(c), vec![]).map(|_| ())
    }

    fn trace(&self, stop: usize, cur_ip: usize) -> Vec<(String, String, u32)> {
        let mut t = Vec::new();
        for (i, f) in self.frames.iter().enumerate().skip(stop).rev() {
            let p = &self.prog.funcs[f.closure.proto as usize];
            let ip = if i == self.frames.len() - 1 { cur_ip } else { f.ip };
            let line = p.lines.get(ip.saturating_sub(1)).copied().unwrap_or(0);
            t.push((p.file.clone(), p.name.clone(), line));
        }
        t
    }

    fn run(&mut self, stop: usize) -> Result<Value, RtErr> {
        let prog = self.prog.clone();
        macro_rules! fail {
            ($ip:expr, $($arg:tt)*) => {{
                let msg = format!($($arg)*);
                let trace = self.trace(stop, $ip);
                return Err(RtErr { msg, trace });
            }};
        }
        'outer: loop {
            let (pidx, mut ip, base, closure) = {
                let f = self.frames.last().expect("frame");
                (f.closure.proto as usize, f.ip, f.base, f.closure.clone())
            };
            let proto = &prog.funcs[pidx];
            let code = &proto.code;
            loop {
                if ip >= code.len() {
                    fail!(ip, "внутренняя ошибка: конец кода без return");
                }
                let op = &code[ip];
                ip += 1;
                self.steps += 1;
                if self.steps > self.step_limit {
                    fail!(ip, "скрипт выполняется слишком долго (возможен бесконечный цикл)");
                }
                match op {
                    Op::Const(i) => self.stack.push(match &prog.consts[*i as usize] {
                        Const::Num(n) => Value::Num(*n),
                        Const::Str(s) => Value::str(s),
                    }),
                    Op::Null => self.stack.push(Value::Null),
                    Op::True => self.stack.push(Value::Bool(true)),
                    Op::False => self.stack.push(Value::Bool(false)),
                    Op::Pop => {
                        self.stack.pop();
                    }
                    Op::Dup => {
                        let v = self.stack.last().cloned().unwrap_or(Value::Null);
                        self.stack.push(v);
                    }
                    Op::Dup2 => {
                        let n = self.stack.len();
                        let (a, b) = (self.stack[n - 2].clone(), self.stack[n - 1].clone());
                        self.stack.push(a);
                        self.stack.push(b);
                    }
                    Op::Local(s) => {
                        let v = self.stack[base + *s as usize].clone();
                        self.stack.push(v);
                    }
                    Op::SetLocal(s) => {
                        let v = self.stack.pop().unwrap_or(Value::Null);
                        self.stack[base + *s as usize] = v;
                    }
                    Op::CellGet(s) => {
                        let v = match &self.stack[base + *s as usize] {
                            Value::Cell(c) => c.borrow().clone(),
                            other => other.clone(),
                        };
                        self.stack.push(v);
                    }
                    Op::CellSet(s) => {
                        let v = self.stack.pop().unwrap_or(Value::Null);
                        let slot = base + *s as usize;
                        match &self.stack[slot] {
                            Value::Cell(c) => *c.borrow_mut() = v,
                            _ => self.stack[slot] = v,
                        }
                    }
                    Op::CellNew(s) => {
                        let v = self.stack.pop().unwrap_or(Value::Null);
                        self.stack[base + *s as usize] = Value::Cell(Rc::new(RefCell::new(v)));
                    }
                    Op::UpGet(i) => {
                        let v = closure.caps[*i as usize].borrow().clone();
                        self.stack.push(v);
                    }
                    Op::UpSet(i) => {
                        let v = self.stack.pop().unwrap_or(Value::Null);
                        *closure.caps[*i as usize].borrow_mut() = v;
                    }
                    Op::Global(g) => {
                        let v = self.globals[*g as usize].clone();
                        self.stack.push(v);
                    }
                    Op::SetGlobal(g) => {
                        let v = self.stack.pop().unwrap_or(Value::Null);
                        self.globals[*g as usize] = v;
                    }
                    Op::Builtin(b) => self.stack.push(Value::Native(*b)),
                    Op::Add => {
                        let b = self.stack.pop().unwrap();
                        let a = self.stack.pop().unwrap();
                        let r = match (&a, &b) {
                            (Value::Num(x), Value::Num(y)) => Value::Num(x + y),
                            (Value::Str(_), _) | (_, Value::Str(_)) => Value::string(format!("{}{}", a.display(), b.display())),
                            (Value::List(x), Value::List(y)) => {
                                let mut v = x.borrow().clone();
                                v.extend(y.borrow().iter().cloned());
                                Value::list(v)
                            }
                            _ => fail!(ip, "нельзя сложить {} и {}", a.type_name(), b.type_name()),
                        };
                        self.stack.push(r);
                    }
                    Op::Sub | Op::Mul | Op::Div | Op::Mod => {
                        let b = self.stack.pop().unwrap();
                        let a = self.stack.pop().unwrap();
                        let (x, y) = match (&a, &b) {
                            (Value::Num(x), Value::Num(y)) => (*x, *y),
                            _ => fail!(ip, "арифметика требует чисел, а не {} и {}", a.type_name(), b.type_name()),
                        };
                        let r = match op {
                            Op::Sub => x - y,
                            Op::Mul => x * y,
                            Op::Div => {
                                if y == 0.0 {
                                    fail!(ip, "деление на ноль")
                                }
                                x / y
                            }
                            _ => {
                                if y == 0.0 {
                                    fail!(ip, "деление на ноль")
                                }
                                x % y
                            }
                        };
                        self.stack.push(Value::Num(r));
                    }
                    Op::Neg => match self.stack.pop().unwrap() {
                        Value::Num(n) => self.stack.push(Value::Num(-n)),
                        o => fail!(ip, "унарный минус требует число, а не {}", o.type_name()),
                    },
                    Op::Not => {
                        let v = self.stack.pop().unwrap();
                        self.stack.push(Value::Bool(!v.truthy()));
                    }
                    Op::Eq | Op::Ne => {
                        let b = self.stack.pop().unwrap();
                        let a = self.stack.pop().unwrap();
                        let e = a.equals(&b);
                        self.stack.push(Value::Bool(if matches!(op, Op::Eq) { e } else { !e }));
                    }
                    Op::Lt | Op::Le | Op::Gt | Op::Ge => {
                        let b = self.stack.pop().unwrap();
                        let a = self.stack.pop().unwrap();
                        let ord = match (&a, &b) {
                            (Value::Num(x), Value::Num(y)) => x.partial_cmp(y),
                            (Value::Str(x), Value::Str(y)) => Some(x.cmp(y)),
                            _ => fail!(ip, "нельзя сравнить {} и {}", a.type_name(), b.type_name()),
                        };
                        use std::cmp::Ordering::*;
                        let r = match (op, ord) {
                            (_, None) => false,
                            (Op::Lt, Some(o)) => o == Less,
                            (Op::Le, Some(o)) => o != Greater,
                            (Op::Gt, Some(o)) => o == Greater,
                            (_, Some(o)) => o != Less,
                        };
                        self.stack.push(Value::Bool(r));
                    }
                    Op::Jump(t) => ip = *t as usize,
                    Op::JumpIfFalse(t) => {
                        if !self.stack.pop().unwrap().truthy() {
                            ip = *t as usize;
                        }
                    }
                    Op::AndJump(t) => {
                        if !self.stack.last().unwrap().truthy() {
                            ip = *t as usize;
                        } else {
                            self.stack.pop();
                        }
                    }
                    Op::OrJump(t) => {
                        if self.stack.last().unwrap().truthy() {
                            ip = *t as usize;
                        } else {
                            self.stack.pop();
                        }
                    }
                    Op::NullJump(t) => {
                        if !matches!(self.stack.last().unwrap(), Value::Null) {
                            ip = *t as usize;
                        } else {
                            self.stack.pop();
                        }
                    }
                    Op::Call(argc) => {
                        let n = *argc as usize;
                        let at = self.stack.len() - n;
                        let callee = self.stack[at - 1].clone();
                        match callee {
                            Value::Func(c) => {
                                if self.frames.len() >= MAX_FRAMES {
                                    fail!(ip, "слишком глубокая рекурсия");
                                }
                                let args = self.stack.split_off(at);
                                self.frames.last_mut().unwrap().ip = ip;
                                self.push_frame(c, args);
                                continue 'outer;
                            }
                            Value::Native(id) => {
                                let args = self.stack.split_off(at);
                                self.stack.pop();
                                self.frames.last_mut().unwrap().ip = ip;
                                match (builtins::TABLE[id as usize].1)(self, args) {
                                    Ok(v) => self.stack.push(v),
                                    Err(m) => fail!(ip, "{}", m),
                                }
                            }
                            other => fail!(ip, "нельзя вызвать значение типа {}", other.type_name()),
                        }
                    }
                    Op::Method(name, argc) => {
                        let n = *argc as usize;
                        let at = self.stack.len() - n;
                        let mut args = self.stack.split_off(at);
                        let obj = self.stack.pop().unwrap();
                        let mname = match &prog.consts[*name as usize] {
                            Const::Str(s) => s.clone(),
                            _ => String::new(),
                        };
                        self.frames.last_mut().unwrap().ip = ip;
                        // поле-функция в словаре
                        if let Value::Map(m) = &obj {
                            let f = m.borrow().get(mname.as_str()).cloned();
                            if let Some(f @ (Value::Func(_) | Value::Native(_))) = f {
                                match self.call(&f, args) {
                                    Ok(v) => self.stack.push(v),
                                    Err(e) => return Err(self.wrap(e, stop, ip)),
                                }
                                continue;
                            }
                        }
                        match builtins::lookup(&mname) {
                            Some(id) => {
                                args.insert(0, obj);
                                match (builtins::TABLE[id as usize].1)(self, args) {
                                    Ok(v) => self.stack.push(v),
                                    Err(m) => fail!(ip, "{}", m),
                                }
                            }
                            None => fail!(ip, "у значения типа {} нет метода «{}»", obj.type_name(), mname),
                        }
                    }
                    Op::Return => {
                        let r = self.stack.pop().unwrap_or(Value::Null);
                        let f = self.frames.pop().unwrap();
                        self.stack.truncate(f.base.saturating_sub(1));
                        if self.frames.len() == stop {
                            return Ok(r);
                        }
                        self.stack.push(r);
                        continue 'outer;
                    }
                    Op::NewList => self.stack.push(Value::list(vec![])),
                    Op::Push => {
                        let v = self.stack.pop().unwrap();
                        if let Some(Value::List(l)) = self.stack.last() {
                            l.borrow_mut().push(v);
                        }
                    }
                    Op::Extend => {
                        let v = self.stack.pop().unwrap();
                        let items: Vec<Value> = match &v {
                            Value::List(l) => l.borrow().clone(),
                            Value::Null => vec![],
                            Value::Iter(_) => match builtins::iter_to_vec(&v) {
                                Some(x) => x,
                                None => vec![],
                            },
                            o => fail!(ip, "«...» ожидает список, а не {}", o.type_name()),
                        };
                        if let Some(Value::List(l)) = self.stack.last() {
                            l.borrow_mut().extend(items);
                        }
                    }
                    Op::NewMap => self.stack.push(Value::map(BTreeMap::new())),
                    Op::MapSet(k) => {
                        let v = self.stack.pop().unwrap();
                        if let (Some(Value::Map(m)), Const::Str(key)) = (self.stack.last(), &prog.consts[*k as usize]) {
                            m.borrow_mut().insert(Rc::from(key.as_str()), v);
                        }
                    }
                    Op::MapSetDyn => {
                        let v = self.stack.pop().unwrap();
                        let k = self.stack.pop().unwrap();
                        if let Some(Value::Map(m)) = self.stack.last() {
                            m.borrow_mut().insert(Rc::from(k.display().as_str()), v);
                        }
                    }
                    Op::MapExtend => {
                        let v = self.stack.pop().unwrap();
                        match (&v, self.stack.last()) {
                            (Value::Map(o), Some(Value::Map(m))) => {
                                let items: Vec<_> = o.borrow().iter().map(|(k, v)| (k.clone(), v.clone())).collect();
                                m.borrow_mut().extend(items);
                            }
                            (Value::Null, _) => {}
                            _ => fail!(ip, "«...» в словаре ожидает словарь, а не {}", v.type_name()),
                        }
                    }
                    Op::Index => {
                        let i = self.stack.pop().unwrap();
                        let o = self.stack.pop().unwrap();
                        let r = match (&o, &i) {
                            (Value::List(l), Value::Num(n)) => {
                                let l = l.borrow();
                                let k = if *n < 0.0 { l.len() as f64 + n } else { *n };
                                if k >= 0.0 && (k as usize) < l.len() { l[k as usize].clone() } else { Value::Null }
                            }
                            (Value::Str(s), Value::Num(n)) => {
                                let cs: Vec<char> = s.chars().collect();
                                let k = if *n < 0.0 { cs.len() as f64 + n } else { *n };
                                if k >= 0.0 && (k as usize) < cs.len() { Value::string(cs[k as usize].to_string()) } else { Value::Null }
                            }
                            (Value::Map(m), k) => m.borrow().get(k.display().as_str()).cloned().unwrap_or(Value::Null),
                            (Value::Null, _) => fail!(ip, "индексация null"),
                            _ => fail!(ip, "нельзя взять элемент [{}] у {}", i.type_name(), o.type_name()),
                        };
                        self.stack.push(r);
                    }
                    Op::SetIndex => {
                        let v = self.stack.pop().unwrap();
                        let i = self.stack.pop().unwrap();
                        let o = self.stack.pop().unwrap();
                        match (&o, &i) {
                            (Value::List(l), Value::Num(n)) => {
                                let mut l = l.borrow_mut();
                                let k = if *n < 0.0 { l.len() as f64 + n } else { *n };
                                if k >= 0.0 && (k as usize) < l.len() {
                                    l[k as usize] = v;
                                } else if k >= 0.0 && k as usize == l.len() {
                                    l.push(v);
                                } else {
                                    drop(l);
                                    fail!(ip, "индекс {} вне списка", fmt_num(*n))
                                }
                            }
                            (Value::Map(m), k) => {
                                m.borrow_mut().insert(Rc::from(k.display().as_str()), v);
                            }
                            _ => fail!(ip, "нельзя присвоить элемент у {}", o.type_name()),
                        }
                    }
                    Op::Get(k) => {
                        let o = self.stack.pop().unwrap();
                        let name = match &prog.consts[*k as usize] {
                            Const::Str(s) => s.as_str(),
                            _ => "",
                        };
                        let r = match &o {
                            Value::Map(m) => m.borrow().get(name).cloned().unwrap_or(Value::Null),
                            Value::List(l) if name == "len" => Value::Num(l.borrow().len() as f64),
                            Value::Str(s) if name == "len" => Value::Num(s.chars().count() as f64),
                            Value::Null => fail!(ip, "нельзя взять поле «{}» у null", name),
                            other => fail!(ip, "у значения типа {} нет поля «{}»", other.type_name(), name),
                        };
                        self.stack.push(r);
                    }
                    Op::Set(k) => {
                        let v = self.stack.pop().unwrap();
                        let o = self.stack.pop().unwrap();
                        let name = match &prog.consts[*k as usize] {
                            Const::Str(s) => s.as_str(),
                            _ => "",
                        };
                        match &o {
                            Value::Map(m) => {
                                m.borrow_mut().insert(Rc::from(name), v);
                            }
                            Value::Null => fail!(ip, "нельзя записать поле «{}» в null", name),
                            other => fail!(ip, "нельзя записать поле «{}» в {}", name, other.type_name()),
                        }
                    }
                    Op::Closure(pi) => {
                        let p = &prog.funcs[*pi as usize];
                        let mut caps = Vec::with_capacity(p.caps.len());
                        for (from_local, idx) in &p.caps {
                            if *from_local {
                                match &self.stack[base + *idx as usize] {
                                    Value::Cell(c) => caps.push(c.clone()),
                                    other => caps.push(Rc::new(RefCell::new(other.clone()))),
                                }
                            } else {
                                caps.push(closure.caps[*idx as usize].clone());
                            }
                        }
                        self.stack.push(Value::Func(Rc::new(Closure { proto: *pi, caps })));
                    }
                    Op::Interp(n) => {
                        let at = self.stack.len() - *n as usize;
                        let parts = self.stack.split_off(at);
                        let mut s = String::new();
                        for p in &parts {
                            s.push_str(&p.display());
                        }
                        self.stack.push(Value::string(s));
                    }
                    Op::Range => {
                        let b = self.stack.pop().unwrap();
                        let a = self.stack.pop().unwrap();
                        match (&a, &b) {
                            (Value::Num(x), Value::Num(y)) => self.stack.push(Value::Iter(Rc::new(RefCell::new(IterState::Range(*x, *y, 0))))),
                            _ => fail!(ip, "диапазон a..b требует числа"),
                        }
                    }
                    Op::IterInit => {
                        let v = self.stack.pop().unwrap();
                        let it = match &v {
                            Value::List(l) => IterState::List(l.clone(), 0),
                            Value::Iter(_) => {
                                self.stack.push(v);
                                continue;
                            }
                            Value::Str(s) => IterState::Chars(s.chars().collect(), 0),
                            Value::Map(m) => IterState::Map(m.borrow().iter().map(|(k, v)| (k.clone(), v.clone())).collect(), 0),
                            Value::Null => IterState::List(Rc::new(RefCell::new(vec![])), 0),
                            o => fail!(ip, "нельзя перебирать значение типа {}", o.type_name()),
                        };
                        self.stack.push(Value::Iter(Rc::new(RefCell::new(it))));
                    }
                    Op::IterNext { slot, exit, idx } => {
                        let it = match &self.stack[base + *slot as usize] {
                            Value::Iter(i) => i.clone(),
                            _ => fail!(ip, "внутренняя ошибка итератора"),
                        };
                        let mut st = it.borrow_mut();
                        let next: Option<(Value, Value)> = match &mut *st {
                            IterState::List(l, i) => {
                                let l = l.borrow();
                                if *i < l.len() {
                                    *i += 1;
                                    Some((Value::Num((*i - 1) as f64), l[*i - 1].clone()))
                                } else {
                                    None
                                }
                            }
                            IterState::Range(a, b, i) => {
                                let asc = *a <= *b;
                                let v = if asc { *a + *i as f64 } else { *a - *i as f64 };
                                if (asc && v < *b) || (!asc && v > *b) {
                                    *i += 1;
                                    Some((Value::Num((*i - 1) as f64), Value::Num(v)))
                                } else {
                                    None
                                }
                            }
                            IterState::Chars(c, i) => {
                                if *i < c.len() {
                                    *i += 1;
                                    Some((Value::Num((*i - 1) as f64), Value::string(c[*i - 1].to_string())))
                                } else {
                                    None
                                }
                            }
                            IterState::Map(m, i) => {
                                if *i < m.len() {
                                    *i += 1;
                                    let (k, v) = m[*i - 1].clone();
                                    Some((Value::Str(k), v))
                                } else {
                                    None
                                }
                            }
                        };
                        drop(st);
                        match next {
                            Some((k, v)) => {
                                let is_map = matches!(&*it.borrow(), IterState::Map(..));
                                if *idx {
                                    self.stack.push(k);
                                    self.stack.push(v);
                                } else if is_map {
                                    self.stack.push(k);
                                } else {
                                    self.stack.push(v);
                                }
                            }
                            None => ip = *exit as usize,
                        }
                    }
                }
            }
        }
    }

    fn wrap(&self, mut e: RtErr, stop: usize, ip: usize) -> RtErr {
        let mut t = self.trace(stop, ip);
        t.extend(e.trace.drain(..));
        RtErr { msg: e.msg, trace: t }
    }
}
