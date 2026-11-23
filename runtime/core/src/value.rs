//! Значения Noodle Script.
use std::cell::RefCell;
use std::collections::BTreeMap;
use std::rc::Rc;

pub type MapRef = Rc<RefCell<BTreeMap<Rc<str>, Value>>>;
pub type ListRef = Rc<RefCell<Vec<Value>>>;

pub struct Closure {
    pub proto: u32,
    pub caps: Vec<Rc<RefCell<Value>>>,
}

pub enum IterState {
    List(ListRef, usize),
    Range(f64, f64, usize),
    Chars(Vec<char>, usize),
    Map(Vec<(Rc<str>, Value)>, usize),
}

#[derive(Clone)]
pub enum Value {
    Null,
    Bool(bool),
    Num(f64),
    Str(Rc<str>),
    List(ListRef),
    Map(MapRef),
    Func(Rc<Closure>),
    Native(u16),
    /// внутренняя ячейка (захваченные переменные)
    Cell(Rc<RefCell<Value>>),
    /// внутренний итератор цикла for
    Iter(Rc<RefCell<IterState>>),
}

pub fn fmt_num(n: f64) -> String {
    if n.is_nan() {
        "NaN".into()
    } else if n.is_infinite() {
        if n > 0.0 { "inf".into() } else { "-inf".into() }
    } else if n == n.trunc() && n.abs() < 1e15 {
        format!("{}", n as i64)
    } else {
        format!("{}", n)
    }
}

impl Value {
    pub fn str(s: &str) -> Value {
        Value::Str(Rc::from(s))
    }
    pub fn string(s: String) -> Value {
        Value::Str(Rc::from(s))
    }
    pub fn list(v: Vec<Value>) -> Value {
        Value::List(Rc::new(RefCell::new(v)))
    }
    pub fn map(m: BTreeMap<Rc<str>, Value>) -> Value {
        Value::Map(Rc::new(RefCell::new(m)))
    }
    pub fn truthy(&self) -> bool {
        match self {
            Value::Null => false,
            Value::Bool(b) => *b,
            Value::Num(n) => *n != 0.0 && !n.is_nan(),
            Value::Str(s) => !s.is_empty(),
            _ => true,
        }
    }
    pub fn type_name(&self) -> &'static str {
        match self {
            Value::Null => "null",
            Value::Bool(_) => "bool",
            Value::Num(_) => "number",
            Value::Str(_) => "string",
            Value::List(_) => "list",
            Value::Map(_) => "map",
            Value::Func(_) | Value::Native(_) => "function",
            Value::Cell(_) => "cell",
            Value::Iter(_) => "iterator",
        }
    }
    pub fn as_num(&self) -> Option<f64> {
        match self {
            Value::Num(n) => Some(*n),
            _ => None,
        }
    }
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::Str(s) => Some(s),
            _ => None,
        }
    }

    /// Текст для вывода: строки как есть, остальное как литерал.
    pub fn display(&self) -> String {
        match self {
            Value::Str(s) => s.to_string(),
            other => other.repr(),
        }
    }

    pub fn repr(&self) -> String {
        match self {
            Value::Null => "null".into(),
            Value::Bool(b) => b.to_string(),
            Value::Num(n) => fmt_num(*n),
            Value::Str(s) => format!("{:?}", s),
            Value::List(l) => {
                let v: Vec<String> = l.borrow().iter().map(|x| x.repr()).collect();
                format!("[{}]", v.join(", "))
            }
            Value::Map(m) => {
                let v: Vec<String> = m.borrow().iter().map(|(k, x)| format!("{}: {}", k, x.repr())).collect();
                format!("{{{}}}", v.join(", "))
            }
            Value::Func(_) | Value::Native(_) => "<fn>".into(),
            Value::Cell(c) => c.borrow().repr(),
            Value::Iter(_) => "<iter>".into(),
        }
    }

    pub fn equals(&self, o: &Value) -> bool {
        match (self, o) {
            (Value::Null, Value::Null) => true,
            (Value::Bool(a), Value::Bool(b)) => a == b,
            (Value::Num(a), Value::Num(b)) => a == b,
            (Value::Str(a), Value::Str(b)) => a == b,
            (Value::List(a), Value::List(b)) => {
                if Rc::ptr_eq(a, b) {
                    return true;
                }
                let (a, b) = (a.borrow(), b.borrow());
                a.len() == b.len() && a.iter().zip(b.iter()).all(|(x, y)| x.equals(y))
            }
            (Value::Map(a), Value::Map(b)) => {
                if Rc::ptr_eq(a, b) {
                    return true;
                }
                let (a, b) = (a.borrow(), b.borrow());
                a.len() == b.len() && a.iter().all(|(k, v)| b.get(k).map_or(false, |w| v.equals(w)))
            }
            (Value::Func(a), Value::Func(b)) => Rc::ptr_eq(a, b),
            (Value::Native(a), Value::Native(b)) => a == b,
            _ => false,
        }
    }

    pub fn to_json(&self) -> serde_json::Value {
        use serde_json::Value as J;
        match self {
            Value::Null | Value::Func(_) | Value::Native(_) | Value::Cell(_) | Value::Iter(_) => J::Null,
            Value::Bool(b) => J::Bool(*b),
            Value::Num(n) => {
                if *n == n.trunc() && n.abs() < 9e15 {
                    J::from(*n as i64)
                } else {
                    serde_json::Number::from_f64(*n).map(J::Number).unwrap_or(J::Null)
                }
            }
            Value::Str(s) => J::String(s.to_string()),
            Value::List(l) => J::Array(l.borrow().iter().map(|x| x.to_json()).collect()),
            Value::Map(m) => J::Object(m.borrow().iter().map(|(k, v)| (k.to_string(), v.to_json())).collect()),
        }
    }

    pub fn from_json(j: &serde_json::Value) -> Value {
        use serde_json::Value as J;
        match j {
            J::Null => Value::Null,
            J::Bool(b) => Value::Bool(*b),
            J::Number(n) => Value::Num(n.as_f64().unwrap_or(0.0)),
            J::String(s) => Value::str(s),
            J::Array(a) => Value::list(a.iter().map(Value::from_json).collect()),
            J::Object(o) => Value::map(o.iter().map(|(k, v)| (Rc::from(k.as_str()), Value::from_json(v))).collect()),
        }
    }
}
