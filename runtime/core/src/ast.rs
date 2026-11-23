//! Синтаксическое дерево Noodle Script / Noodle UI.
use std::rc::Rc;

#[derive(Clone, Copy, Debug, Default)]
pub struct Pos {
    pub line: u32,
    pub col: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum BinOp {
    Add,
    Sub,
    Mul,
    Div,
    Mod,
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
}

#[derive(Clone, Debug)]
pub enum Part {
    Lit(String),
    Expr(Expr),
}

#[derive(Clone, Debug)]
pub enum Item {
    Spread(Expr),
    One(Expr),
}

#[derive(Clone, Debug)]
pub enum MapItem {
    Spread(Expr),
    Pair(Expr, Expr),
}

#[derive(Clone, Debug)]
pub enum Expr {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Interp(Vec<Part>),
    List(Vec<Item>),
    Map(Vec<MapItem>),
    Ident(String, Pos),
    Neg(Box<Expr>, Pos),
    Not(Box<Expr>),
    Bin(BinOp, Box<Expr>, Box<Expr>, Pos),
    And(Box<Expr>, Box<Expr>),
    Or(Box<Expr>, Box<Expr>),
    Coalesce(Box<Expr>, Box<Expr>),
    Cond(Box<Expr>, Box<Expr>, Box<Expr>),
    Range(Box<Expr>, Box<Expr>, Pos),
    Call(Box<Expr>, Vec<Expr>, Pos),
    Method(Box<Expr>, String, Vec<Expr>, Pos),
    Member(Box<Expr>, String, Pos),
    Index(Box<Expr>, Box<Expr>, Pos),
    Func(Rc<FuncDecl>),
}

#[derive(Clone, Debug)]
pub struct FuncDecl {
    pub name: String,
    pub params: Vec<String>,
    pub body: Vec<Stmt>,
    /// внутри есть вложенные функции/обработчики — тогда локальные переменные хранятся в «ячейках»
    pub has_inner: bool,
    pub pos: Pos,
}

#[derive(Clone, Debug)]
pub enum Stmt {
    Let(String, Expr, Pos),
    Assign(Expr, Option<BinOp>, Expr, Pos),
    Expr(Expr, Pos),
    If(Vec<(Expr, Vec<Stmt>)>, Option<Vec<Stmt>>),
    While(Expr, Vec<Stmt>),
    For(Option<String>, String, Expr, Vec<Stmt>, Pos),
    Return(Option<Expr>, Pos),
    Break(Pos),
    Continue(Pos),
}

#[derive(Clone, Debug)]
pub enum Attr {
    Val(Expr),
    Flag,
    Handler(Rc<FuncDecl>),
    Bind(Expr),
}

#[derive(Clone, Debug)]
pub enum Ui {
    Elem { tag: String, text: Option<Expr>, attrs: Vec<(String, Attr)>, children: Vec<Ui>, pos: Pos },
    If { cond: Expr, then: Vec<Ui>, other: Vec<Ui> },
    Each { iter: Expr, var: String, idx: Option<String>, body: Vec<Ui>, pos: Pos },
    Let(String, Expr, Pos),
}

#[derive(Clone, Debug)]
pub enum TopItem {
    State { name: String, init: Expr, persist: bool, pos: Pos },
    Let { name: String, init: Expr, pos: Pos },
    Fn(Rc<FuncDecl>),
    Screen { name: String, func: Rc<FuncDecl>, ui: Vec<Ui>, pos: Pos },
    App(String),
}
