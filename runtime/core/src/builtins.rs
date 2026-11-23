//! Встроенные функции Noodle Script.
use crate::value::*;
use crate::vm::{Nav, Timer, Vm};
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

pub type NativeFn = fn(&mut Vm, Vec<Value>) -> Result<Value, String>;
type R = Result<Value, String>;

fn arg_err(f: &str, i: usize, want: &str, got: &Value) -> String {
    format!("{}: аргумент {} должен быть {}, а не {}", f, i + 1, want, got.type_name())
}
fn num(a: &[Value], i: usize, f: &str) -> Result<f64, String> {
    match a.get(i) {
        Some(Value::Num(n)) => Ok(*n),
        Some(o) => Err(arg_err(f, i, "числом", o)),
        None => Err(format!("{}: не хватает аргумента {}", f, i + 1)),
    }
}
fn text(a: &[Value], i: usize, f: &str) -> Result<Rc<str>, String> {
    match a.get(i) {
        Some(Value::Str(s)) => Ok(s.clone()),
        Some(o) => Err(arg_err(f, i, "строкой", o)),
        None => Err(format!("{}: не хватает аргумента {}", f, i + 1)),
    }
}
fn list(a: &[Value], i: usize, f: &str) -> Result<ListRef, String> {
    match a.get(i) {
        Some(Value::List(l)) => Ok(l.clone()),
        Some(o) => Err(arg_err(f, i, "списком", o)),
        None => Err(format!("{}: не хватает аргумента {}", f, i + 1)),
    }
}
fn func(a: &[Value], i: usize, f: &str) -> Result<Value, String> {
    match a.get(i) {
        Some(v @ (Value::Func(_) | Value::Native(_))) => Ok(v.clone()),
        Some(o) => Err(arg_err(f, i, "функцией", o)),
        None => Err(format!("{}: не хватает аргумента {}", f, i + 1)),
    }
}
fn call(vm: &mut Vm, f: &Value, args: Vec<Value>) -> R {
    vm.call(f, args).map_err(|e| e.render())
}
fn opt(a: &[Value], i: usize) -> Value {
    a.get(i).cloned().unwrap_or(Value::Null)
}

pub fn iter_to_vec(v: &Value) -> Option<Vec<Value>> {
    match v {
        Value::List(l) => Some(l.borrow().clone()),
        Value::Iter(it) => {
            let mut st = it.borrow_mut();
            match &mut *st {
                IterState::Range(a, b, i) => {
                    let asc = *a <= *b;
                    let mut out = vec![];
                    loop {
                        let x = if asc { *a + *i as f64 } else { *a - *i as f64 };
                        if (asc && x < *b) || (!asc && x > *b) {
                            out.push(Value::Num(x));
                            *i += 1;
                            if out.len() > 10_000_000 {
                                break;
                            }
                        } else {
                            break;
                        }
                    }
                    Some(out)
                }
                _ => None,
            }
        }
        Value::Str(s) => Some(s.chars().map(|c| Value::string(c.to_string())).collect()),
        _ => None,
    }
}

fn items(v: &Value, f: &str) -> Result<Vec<Value>, String> {
    iter_to_vec(v).ok_or_else(|| arg_err(f, 0, "списком", v))
}

// ───────────── общие ─────────────

fn b_print(vm: &mut Vm, a: Vec<Value>) -> R {
    let s: Vec<String> = a.iter().map(|v| v.display()).collect();
    vm.log("log", s.join(" "));
    Ok(Value::Null)
}
fn b_str(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::string(opt(&a, 0).display()))
}
fn b_repr(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::string(opt(&a, 0).repr()))
}
pub fn to_num(v: &Value) -> Value {
    match v {
        Value::Num(n) => Value::Num(*n),
        Value::Bool(b) => Value::Num(if *b { 1.0 } else { 0.0 }),
        Value::Str(s) => s.trim().replace(',', ".").parse::<f64>().map(Value::Num).unwrap_or(Value::Null),
        _ => Value::Null,
    }
}
fn b_num(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(to_num(&opt(&a, 0)))
}
fn b_int(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(match to_num(&opt(&a, 0)) {
        Value::Num(n) => Value::Num(n.trunc()),
        o => o,
    })
}
fn b_bool(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::Bool(opt(&a, 0).truthy()))
}
fn b_type(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::str(opt(&a, 0).type_name()))
}
fn b_len(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::Num(match opt(&a, 0) {
        Value::Str(s) => s.chars().count() as f64,
        Value::List(l) => l.borrow().len() as f64,
        Value::Map(m) => m.borrow().len() as f64,
        Value::Null => 0.0,
        o => return Err(arg_err("len", 0, "строкой, списком или словарём", &o)),
    }))
}
fn b_json(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::string(opt(&a, 0).to_json().to_string()))
}
fn b_parse_json(_: &mut Vm, a: Vec<Value>) -> R {
    let s = text(&a, 0, "parse_json")?;
    Ok(serde_json::from_str::<serde_json::Value>(&s).map(|j| Value::from_json(&j)).unwrap_or(Value::Null))
}

// ───────────── математика ─────────────

fn b_abs(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::Num(num(&a, 0, "abs")?.abs()))
}
fn b_floor(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::Num(num(&a, 0, "floor")?.floor()))
}
fn b_ceil(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::Num(num(&a, 0, "ceil")?.ceil()))
}
fn b_round(_: &mut Vm, a: Vec<Value>) -> R {
    let n = num(&a, 0, "round")?;
    let d = if a.len() > 1 { num(&a, 1, "round")? } else { 0.0 };
    let m = 10f64.powf(d);
    Ok(Value::Num((n * m).round() / m))
}
fn b_sqrt(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::Num(num(&a, 0, "sqrt")?.sqrt()))
}
fn b_pow(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::Num(num(&a, 0, "pow")?.powf(num(&a, 1, "pow")?)))
}
fn b_sin(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::Num(num(&a, 0, "sin")?.sin()))
}
fn b_cos(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::Num(num(&a, 0, "cos")?.cos()))
}
fn minmax(a: Vec<Value>, name: &str, max: bool) -> R {
    let vals: Vec<Value> = if a.len() == 1 { items(&a[0], name)? } else { a };
    let mut best: Option<f64> = None;
    for v in &vals {
        let n = v.as_num().ok_or_else(|| arg_err(name, 0, "числом", v))?;
        best = Some(match best {
            None => n,
            Some(b) => if max { b.max(n) } else { b.min(n) },
        });
    }
    Ok(best.map(Value::Num).unwrap_or(Value::Null))
}
fn b_min(_: &mut Vm, a: Vec<Value>) -> R {
    minmax(a, "min", false)
}
fn b_max(_: &mut Vm, a: Vec<Value>) -> R {
    minmax(a, "max", true)
}
fn b_clamp(_: &mut Vm, a: Vec<Value>) -> R {
    let (x, lo, hi) = (num(&a, 0, "clamp")?, num(&a, 1, "clamp")?, num(&a, 2, "clamp")?);
    Ok(Value::Num(x.max(lo).min(hi)))
}
fn rnd(vm: &mut Vm) -> f64 {
    let mut x = vm.host.rng;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    vm.host.rng = x;
    (x >> 11) as f64 / (1u64 << 53) as f64
}
fn b_random(vm: &mut Vm, a: Vec<Value>) -> R {
    let r = rnd(vm);
    Ok(Value::Num(if a.len() >= 2 {
        let (lo, hi) = (num(&a, 0, "random")?, num(&a, 1, "random")?);
        (lo + r * (hi - lo + 1.0)).floor()
    } else if a.len() == 1 {
        (r * num(&a, 0, "random")?).floor()
    } else {
        r
    }))
}

// ───────────── строки ─────────────

fn b_upper(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::string(text(&a, 0, "upper")?.to_uppercase()))
}
fn b_lower(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::string(text(&a, 0, "lower")?.to_lowercase()))
}
fn b_trim(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::str(text(&a, 0, "trim")?.trim()))
}
fn b_split(_: &mut Vm, a: Vec<Value>) -> R {
    let s = text(&a, 0, "split")?;
    let sep = text(&a, 1, "split")?;
    Ok(Value::list(if sep.is_empty() { s.chars().map(|c| Value::string(c.to_string())).collect() } else { s.split(&*sep).map(Value::str).collect() }))
}
fn b_join(_: &mut Vm, a: Vec<Value>) -> R {
    let l = list(&a, 0, "join")?;
    let sep = if a.len() > 1 { text(&a, 1, "join")?.to_string() } else { String::new() };
    let parts: Vec<String> = l.borrow().iter().map(|v| v.display()).collect();
    Ok(Value::string(parts.join(&sep)))
}
fn b_replace(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::string(text(&a, 0, "replace")?.replace(&*text(&a, 1, "replace")?, &*text(&a, 2, "replace")?)))
}
fn b_starts_with(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::Bool(text(&a, 0, "starts_with")?.starts_with(&*text(&a, 1, "starts_with")?)))
}
fn b_ends_with(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::Bool(text(&a, 0, "ends_with")?.ends_with(&*text(&a, 1, "ends_with")?)))
}
fn b_repeat(_: &mut Vm, a: Vec<Value>) -> R {
    let n = num(&a, 1, "repeat")?.max(0.0).min(10000.0) as usize;
    Ok(Value::string(text(&a, 0, "repeat")?.repeat(n)))
}
fn b_pad_start(_: &mut Vm, a: Vec<Value>) -> R {
    let s = opt(&a, 0).display();
    let n = num(&a, 1, "pad_start")? as usize;
    let ch = if a.len() > 2 { text(&a, 2, "pad_start")?.chars().next().unwrap_or(' ') } else { ' ' };
    let len = s.chars().count();
    Ok(Value::string(if len >= n { s } else { format!("{}{}", ch.to_string().repeat(n - len), s) }))
}
fn b_pad_end(_: &mut Vm, a: Vec<Value>) -> R {
    let s = opt(&a, 0).display();
    let n = num(&a, 1, "pad_end")? as usize;
    let ch = if a.len() > 2 { text(&a, 2, "pad_end")?.chars().next().unwrap_or(' ') } else { ' ' };
    let len = s.chars().count();
    Ok(Value::string(if len >= n { s } else { format!("{}{}", s, ch.to_string().repeat(n - len)) }))
}
fn b_fixed(_: &mut Vm, a: Vec<Value>) -> R {
    let n = num(&a, 0, "fixed")?;
    let d = if a.len() > 1 { num(&a, 1, "fixed")? as usize } else { 2 };
    Ok(Value::string(format!("{:.*}", d.min(12), n)))
}
fn b_index_of(_: &mut Vm, a: Vec<Value>) -> R {
    match opt(&a, 0) {
        Value::Str(s) => {
            let n = text(&a, 1, "index_of")?;
            Ok(Value::Num(s.find(&*n).map(|b| s[..b].chars().count() as f64).unwrap_or(-1.0)))
        }
        Value::List(l) => {
            let t = opt(&a, 1);
            Ok(Value::Num(l.borrow().iter().position(|x| x.equals(&t)).map(|i| i as f64).unwrap_or(-1.0)))
        }
        o => Err(arg_err("index_of", 0, "строкой или списком", &o)),
    }
}
fn b_contains(_: &mut Vm, a: Vec<Value>) -> R {
    let needle = opt(&a, 1);
    Ok(Value::Bool(match opt(&a, 0) {
        Value::Str(s) => s.contains(&*needle.display()),
        Value::List(l) => l.borrow().iter().any(|x| x.equals(&needle)),
        Value::Map(m) => m.borrow().contains_key(needle.display().as_str()),
        Value::Null => false,
        o => return Err(arg_err("contains", 0, "строкой, списком или словарём", &o)),
    }))
}
fn b_slice(_: &mut Vm, a: Vec<Value>) -> R {
    let norm = |n: f64, len: usize| -> usize {
        let l = len as f64;
        (if n < 0.0 { (l + n).max(0.0) } else { n.min(l) }) as usize
    };
    match opt(&a, 0) {
        Value::Str(s) => {
            let cs: Vec<char> = s.chars().collect();
            let from = norm(num(&a, 1, "slice")?, cs.len());
            let to = if a.len() > 2 { norm(num(&a, 2, "slice")?, cs.len()) } else { cs.len() };
            Ok(Value::string(if from < to { cs[from..to].iter().collect() } else { String::new() }))
        }
        Value::List(l) => {
            let l = l.borrow();
            let from = norm(num(&a, 1, "slice")?, l.len());
            let to = if a.len() > 2 { norm(num(&a, 2, "slice")?, l.len()) } else { l.len() };
            Ok(Value::list(if from < to { l[from..to].to_vec() } else { vec![] }))
        }
        o => Err(arg_err("slice", 0, "строкой или списком", &o)),
    }
}

// ───────────── списки и словари ─────────────

fn b_push(_: &mut Vm, a: Vec<Value>) -> R {
    let l = list(&a, 0, "push")?;
    for v in &a[1..] {
        l.borrow_mut().push(v.clone());
    }
    let n = l.borrow().len();
    Ok(Value::Num(n as f64))
}
fn b_pop(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(list(&a, 0, "pop")?.borrow_mut().pop().unwrap_or(Value::Null))
}
fn b_insert(_: &mut Vm, a: Vec<Value>) -> R {
    let l = list(&a, 0, "insert")?;
    let i = (num(&a, 1, "insert")?.max(0.0) as usize).min(l.borrow().len());
    l.borrow_mut().insert(i, opt(&a, 2));
    Ok(Value::Null)
}
fn b_remove(_: &mut Vm, a: Vec<Value>) -> R {
    let l = list(&a, 0, "remove")?;
    let i = num(&a, 1, "remove")?;
    let len = l.borrow().len();
    let k = if i < 0.0 { len as f64 + i } else { i };
    if k >= 0.0 && (k as usize) < len {
        Ok(l.borrow_mut().remove(k as usize))
    } else {
        Ok(Value::Null)
    }
}
fn b_delete(_: &mut Vm, a: Vec<Value>) -> R {
    match opt(&a, 0) {
        Value::Map(m) => Ok(m.borrow_mut().remove(opt(&a, 1).display().as_str()).unwrap_or(Value::Null)),
        o => Err(arg_err("delete", 0, "словарём", &o)),
    }
}
fn b_concat(_: &mut Vm, a: Vec<Value>) -> R {
    let mut out = Vec::new();
    for (i, v) in a.iter().enumerate() {
        out.extend(items(v, "concat").map_err(|_| arg_err("concat", i, "списком", v))?);
    }
    Ok(Value::list(out))
}
fn b_reverse(_: &mut Vm, a: Vec<Value>) -> R {
    match opt(&a, 0) {
        Value::Str(s) => Ok(Value::string(s.chars().rev().collect())),
        _ => {
            let mut v = items(&opt(&a, 0), "reverse")?;
            v.reverse();
            Ok(Value::list(v))
        }
    }
}
fn cmp_default(a: &Value, b: &Value) -> std::cmp::Ordering {
    match (a, b) {
        (Value::Num(x), Value::Num(y)) => x.partial_cmp(y).unwrap_or(std::cmp::Ordering::Equal),
        (Value::Str(x), Value::Str(y)) => x.cmp(y),
        _ => a.display().cmp(&b.display()),
    }
}
fn b_sort(vm: &mut Vm, a: Vec<Value>) -> R {
    let mut v = items(&opt(&a, 0), "sort")?;
    if a.len() > 1 {
        let f = func(&a, 1, "sort")?;
        let mut err = None;
        v.sort_by(|x, y| {
            if err.is_some() {
                return std::cmp::Ordering::Equal;
            }
            match call(vm, &f, vec![x.clone(), y.clone()]) {
                Ok(Value::Num(n)) => n.partial_cmp(&0.0).unwrap_or(std::cmp::Ordering::Equal),
                Ok(_) => std::cmp::Ordering::Equal,
                Err(e) => {
                    err = Some(e);
                    std::cmp::Ordering::Equal
                }
            }
        });
        if let Some(e) = err {
            return Err(e);
        }
    } else {
        v.sort_by(cmp_default);
    }
    Ok(Value::list(v))
}
fn b_sort_by(vm: &mut Vm, a: Vec<Value>) -> R {
    let v = items(&opt(&a, 0), "sort_by")?;
    let f = func(&a, 1, "sort_by")?;
    let mut keyed = Vec::new();
    for x in v {
        let k = call(vm, &f, vec![x.clone()])?;
        keyed.push((k, x));
    }
    keyed.sort_by(|p, q| cmp_default(&p.0, &q.0));
    Ok(Value::list(keyed.into_iter().map(|(_, x)| x).collect()))
}
fn b_map(vm: &mut Vm, a: Vec<Value>) -> R {
    let v = items(&opt(&a, 0), "map")?;
    let f = func(&a, 1, "map")?;
    let mut out = Vec::with_capacity(v.len());
    for (i, x) in v.into_iter().enumerate() {
        out.push(call(vm, &f, vec![x, Value::Num(i as f64)])?);
    }
    Ok(Value::list(out))
}
fn b_filter(vm: &mut Vm, a: Vec<Value>) -> R {
    let v = items(&opt(&a, 0), "filter")?;
    let f = func(&a, 1, "filter")?;
    let mut out = Vec::new();
    for (i, x) in v.into_iter().enumerate() {
        if call(vm, &f, vec![x.clone(), Value::Num(i as f64)])?.truthy() {
            out.push(x);
        }
    }
    Ok(Value::list(out))
}
fn b_find(vm: &mut Vm, a: Vec<Value>) -> R {
    let v = items(&opt(&a, 0), "find")?;
    let f = func(&a, 1, "find")?;
    for x in v {
        if call(vm, &f, vec![x.clone()])?.truthy() {
            return Ok(x);
        }
    }
    Ok(Value::Null)
}
fn b_find_index(vm: &mut Vm, a: Vec<Value>) -> R {
    let v = items(&opt(&a, 0), "find_index")?;
    let f = func(&a, 1, "find_index")?;
    for (i, x) in v.into_iter().enumerate() {
        if call(vm, &f, vec![x])?.truthy() {
            return Ok(Value::Num(i as f64));
        }
    }
    Ok(Value::Num(-1.0))
}
fn b_reduce(vm: &mut Vm, a: Vec<Value>) -> R {
    let v = items(&opt(&a, 0), "reduce")?;
    let f = func(&a, 2, "reduce")?;
    let mut acc = opt(&a, 1);
    for x in v {
        acc = call(vm, &f, vec![acc, x])?;
    }
    Ok(acc)
}
fn b_any(vm: &mut Vm, a: Vec<Value>) -> R {
    let v = items(&opt(&a, 0), "any")?;
    let f = func(&a, 1, "any")?;
    for x in v {
        if call(vm, &f, vec![x])?.truthy() {
            return Ok(Value::Bool(true));
        }
    }
    Ok(Value::Bool(false))
}
fn b_all(vm: &mut Vm, a: Vec<Value>) -> R {
    let v = items(&opt(&a, 0), "all")?;
    let f = func(&a, 1, "all")?;
    for x in v {
        if !call(vm, &f, vec![x])?.truthy() {
            return Ok(Value::Bool(false));
        }
    }
    Ok(Value::Bool(true))
}
fn b_sum(_: &mut Vm, a: Vec<Value>) -> R {
    let mut s = 0.0;
    for x in items(&opt(&a, 0), "sum")? {
        s += x.as_num().ok_or_else(|| arg_err("sum", 0, "списком чисел", &x))?;
    }
    Ok(Value::Num(s))
}
fn b_keys(_: &mut Vm, a: Vec<Value>) -> R {
    match opt(&a, 0) {
        Value::Map(m) => Ok(Value::list(m.borrow().keys().map(|k| Value::Str(k.clone())).collect())),
        Value::Null => Ok(Value::list(vec![])),
        o => Err(arg_err("keys", 0, "словарём", &o)),
    }
}
fn b_values(_: &mut Vm, a: Vec<Value>) -> R {
    match opt(&a, 0) {
        Value::Map(m) => Ok(Value::list(m.borrow().values().cloned().collect())),
        Value::Null => Ok(Value::list(vec![])),
        o => Err(arg_err("values", 0, "словарём", &o)),
    }
}
fn b_has(_: &mut Vm, a: Vec<Value>) -> R {
    match opt(&a, 0) {
        Value::Map(m) => Ok(Value::Bool(m.borrow().contains_key(opt(&a, 1).display().as_str()))),
        o => Err(arg_err("has", 0, "словарём", &o)),
    }
}
fn b_range(_: &mut Vm, a: Vec<Value>) -> R {
    let (lo, hi) = if a.len() >= 2 { (num(&a, 0, "range")?, num(&a, 1, "range")?) } else { (0.0, num(&a, 0, "range")?) };
    if (hi - lo).abs() > 5_000_000.0 {
        return Err("range: слишком большой диапазон".into());
    }
    Ok(Value::Iter(Rc::new(RefCell::new(IterState::Range(lo, hi, 0)))))
}
fn b_list(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(Value::list(items(&opt(&a, 0), "list")?))
}
fn b_copy(_: &mut Vm, a: Vec<Value>) -> R {
    Ok(match opt(&a, 0) {
        Value::List(l) => Value::list(l.borrow().clone()),
        Value::Map(m) => Value::map(m.borrow().clone()),
        o => o,
    })
}

// ───────────── система ─────────────

fn b_now(vm: &mut Vm, _: Vec<Value>) -> R {
    Ok(Value::Num(vm.host.now_ms))
}
fn civil(days: i64) -> (i64, i64, i64) {
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}
fn b_time_parts(vm: &mut Vm, a: Vec<Value>) -> R {
    let ms = if a.is_empty() { vm.host.now_ms } else { num(&a, 0, "time_parts")? };
    let secs = (ms / 1000.0).floor() as i64 + vm.host.tz_min as i64 * 60;
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let (y, m, d) = civil(days);
    let mut map = std::collections::BTreeMap::new();
    for (k, v) in [("year", y), ("month", m), ("day", d), ("hour", rem / 3600), ("minute", rem % 3600 / 60), ("second", rem % 60), ("weekday", (days + 4).rem_euclid(7))] {
        map.insert(Rc::from(k), Value::Num(v as f64));
    }
    map.insert(Rc::from("ms"), Value::Num(ms.rem_euclid(1000.0).floor()));
    Ok(Value::map(map))
}
fn timer(vm: &mut Vm, a: &[Value], every: bool, name: &str) -> R {
    let ms = num(a, 0, name)?.max(if every { 16.0 } else { 0.0 });
    let f = func(a, 1, name)?;
    let id = vm.host.next_timer;
    vm.host.next_timer += 1;
    vm.host.timers.push(Timer { id, fire_at: vm.host.now_ms + ms, interval: if every { Some(ms) } else { None }, f });
    Ok(Value::Num(id as f64))
}
fn b_after(vm: &mut Vm, a: Vec<Value>) -> R {
    timer(vm, &a, false, "after")
}
fn b_every(vm: &mut Vm, a: Vec<Value>) -> R {
    timer(vm, &a, true, "every")
}
fn b_cancel(vm: &mut Vm, a: Vec<Value>) -> R {
    let id = num(&a, 0, "cancel")? as u32;
    vm.host.timers.retain(|t| t.id != id);
    vm.host.cancelled.push(id);
    Ok(Value::Null)
}
fn b_goto(vm: &mut Vm, a: Vec<Value>) -> R {
    vm.host.nav.push(Nav::Goto(text(&a, 0, "goto")?.to_string()));
    Ok(Value::Null)
}
fn b_back(vm: &mut Vm, _: Vec<Value>) -> R {
    vm.host.nav.push(Nav::Back);
    Ok(Value::Null)
}
fn b_toast(vm: &mut Vm, a: Vec<Value>) -> R {
    vm.host.toasts.push(opt(&a, 0).display());
    Ok(Value::Null)
}
fn b_vibrate(vm: &mut Vm, a: Vec<Value>) -> R {
    vm.host.vibrations.push(if a.is_empty() { 30 } else { num(&a, 0, "vibrate")?.max(1.0) as u32 });
    Ok(Value::Null)
}
fn b_exit(vm: &mut Vm, _: Vec<Value>) -> R {
    vm.host.exit = true;
    Ok(Value::Null)
}
fn b_redraw(vm: &mut Vm, _: Vec<Value>) -> R {
    vm.host.redraw = true;
    Ok(Value::Null)
}
fn b_save(vm: &mut Vm, a: Vec<Value>) -> R {
    let k = text(&a, 0, "save")?;
    vm.host.storage.insert(format!("user:{}", k), opt(&a, 1).to_json().to_string());
    vm.host.storage_dirty = true;
    Ok(Value::Null)
}
fn b_load(vm: &mut Vm, a: Vec<Value>) -> R {
    let k = text(&a, 0, "load")?;
    Ok(match vm.host.storage.get(&format!("user:{}", k)) {
        Some(s) => serde_json::from_str::<serde_json::Value>(s).map(|j| Value::from_json(&j)).unwrap_or_else(|_| opt(&a, 1)),
        None => opt(&a, 1),
    })
}

macro_rules! table {
    ($( $name:expr => $f:ident ),* $(,)?) => {
        pub static TABLE: &[(&str, NativeFn)] = &[ $( ($name, $f as NativeFn) ),* ];
    };
}

table! {
    "print" => b_print, "str" => b_str, "repr" => b_repr, "num" => b_num, "int" => b_int, "bool" => b_bool, "type" => b_type, "len" => b_len,
    "json" => b_json, "parse_json" => b_parse_json,
    "abs" => b_abs, "floor" => b_floor, "ceil" => b_ceil, "round" => b_round, "sqrt" => b_sqrt, "pow" => b_pow, "sin" => b_sin, "cos" => b_cos,
    "min" => b_min, "max" => b_max, "clamp" => b_clamp, "random" => b_random,
    "upper" => b_upper, "lower" => b_lower, "trim" => b_trim, "split" => b_split, "join" => b_join, "replace" => b_replace,
    "starts_with" => b_starts_with, "ends_with" => b_ends_with, "repeat" => b_repeat, "pad_start" => b_pad_start, "pad_end" => b_pad_end,
    "fixed" => b_fixed, "index_of" => b_index_of, "contains" => b_contains, "slice" => b_slice,
    "push" => b_push, "pop" => b_pop, "insert" => b_insert, "remove" => b_remove, "delete" => b_delete, "concat" => b_concat, "reverse" => b_reverse,
    "sort" => b_sort, "sort_by" => b_sort_by, "map" => b_map, "filter" => b_filter, "find" => b_find, "find_index" => b_find_index,
    "reduce" => b_reduce, "any" => b_any, "all" => b_all, "sum" => b_sum, "keys" => b_keys, "values" => b_values, "has" => b_has,
    "range" => b_range, "list" => b_list, "copy" => b_copy,
    "now" => b_now, "time_parts" => b_time_parts, "after" => b_after, "every" => b_every, "cancel" => b_cancel,
    "goto" => b_goto, "back" => b_back, "toast" => b_toast, "vibrate" => b_vibrate, "exit" => b_exit, "redraw" => b_redraw,
    "save" => b_save, "load" => b_load,
}

thread_local! {
    static INDEX: HashMap<&'static str, u16> = TABLE.iter().enumerate().map(|(i, (n, _))| (*n, i as u16)).collect();
}

pub fn lookup(name: &str) -> Option<u16> {
    INDEX.with(|m| m.get(name).copied())
}

pub fn names() -> Vec<&'static str> {
    TABLE.iter().map(|(n, _)| *n).collect()
}
