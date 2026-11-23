//! Байткод Noodle и формат файла `.nbc`.
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum Op {
    Const(u32),
    Null,
    True,
    False,
    Pop,
    Dup,
    Dup2,
    Local(u16),
    SetLocal(u16),
    CellGet(u16),
    CellSet(u16),
    CellNew(u16),
    UpGet(u16),
    UpSet(u16),
    Global(u32),
    SetGlobal(u32),
    Builtin(u16),
    Add,
    Sub,
    Mul,
    Div,
    Mod,
    Neg,
    Not,
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    Jump(u32),
    JumpIfFalse(u32),
    AndJump(u32),
    OrJump(u32),
    NullJump(u32),
    Call(u8),
    Method(u32, u8),
    Return,
    NewList,
    Push,
    Extend,
    NewMap,
    MapSet(u32),
    MapSetDyn,
    MapExtend,
    Index,
    SetIndex,
    Get(u32),
    Set(u32),
    Closure(u32),
    Interp(u16),
    Range,
    IterInit,
    IterNext { slot: u16, exit: u32, idx: bool },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum Const {
    Num(f64),
    Str(String),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Proto {
    pub name: String,
    pub file: String,
    pub nparams: u16,
    pub nlocals: u16,
    pub boxed: bool,
    pub code: Vec<Op>,
    pub lines: Vec<u32>,
    /// (из локальной переменной родителя?, индекс)
    pub caps: Vec<(bool, u16)>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StateInfo {
    pub name: String,
    pub global: u32,
    pub persist: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Program {
    pub name: String,
    pub consts: Vec<Const>,
    pub funcs: Vec<Proto>,
    pub globals: Vec<String>,
    pub init: u32,
    pub screens: Vec<(String, u32)>,
    pub states: Vec<StateInfo>,
}

pub const MAGIC: &[u8; 4] = b"NBC1";

impl Program {
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut out = MAGIC.to_vec();
        out.extend(bincode::serialize(self).expect("serialize"));
        out
    }
    pub fn from_bytes(b: &[u8]) -> Result<Program, String> {
        if b.len() < 4 || &b[..4] != MAGIC {
            return Err("это не байткод Noodle (нет сигнатуры NBC1)".into());
        }
        bincode::deserialize(&b[4..]).map_err(|e| format!("повреждённый байткод: {}", e))
    }
}
