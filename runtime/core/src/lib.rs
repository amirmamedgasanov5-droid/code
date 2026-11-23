//! Noodle: язык Noodle Script + Noodle UI, компилятор, виртуальная машина и нативный UI-рендерер.
//!
//! Одно ядро работает везде: в окне ОС, без окна (тесты, скриншоты) и в WebAssembly (превью в Studio).

pub mod app;
pub mod ast;
pub mod builtins;
pub mod bytecode;
pub mod compiler;
pub mod lexer;
pub mod paint;
pub mod parser;
pub mod text;
pub mod ui;
pub mod value;
pub mod vm;

#[cfg(target_arch = "wasm32")]
pub mod wasm;

use serde::Serialize;

/// Диагностика компиляции.
#[derive(Clone, Debug, Serialize)]
pub struct Diag {
    pub file: String,
    pub line: u32,
    pub col: u32,
    pub msg: String,
}

impl std::fmt::Display for Diag {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}:{}:{}: {}", self.file, self.line, self.col, self.msg)
    }
}

pub use app::{App, Key};
pub use bytecode::Program;

/// Компилирует набор файлов `.nui`/`.ns` (в порядке списка) в программу.
pub fn compile(files: &[(String, String)]) -> Result<Program, Vec<Diag>> {
    compiler::compile_files(files)
}
