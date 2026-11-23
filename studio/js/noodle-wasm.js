// Загрузчик нативного ядра Noodle (WebAssembly). Работает в браузере и в Node.js.
// Ядро — тот же Rust-код, что и в нативном рантайме: компилятор, виртуальная машина, раскладка и растеризатор.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const KEYS = { backspace: 0, delete: 1, left: 2, right: 3, home: 4, end: 5, enter: 6, escape: 7, tab: 8 };

export class NoodleWasm {
  /** @param source URL (строка), байты или уже скомпилированный WebAssembly.Module */
  static async load(source) {
    let module;
    if (source instanceof WebAssembly.Module) module = source;
    else if (typeof source === 'string') {
      const res = await fetch(source);
      if (!res.ok) throw new Error(`не удалось загрузить ядро Noodle: ${res.status} ${source}`);
      module = await WebAssembly.compile(await res.arrayBuffer());
    } else module = await WebAssembly.compile(source);
    const instance = await WebAssembly.instantiate(module, {});
    return new NoodleWasm(instance);
  }

  constructor(instance) {
    this.x = instance.exports;
  }

  get mem() {
    return new Uint8Array(this.x.memory.buffer);
  }
  put(bytes) {
    const p = this.x.alloc(bytes.length);
    this.mem.set(bytes, p);
    return p;
  }
  out() {
    return this.mem.slice(this.x.out_ptr(), this.x.out_ptr() + this.x.out_len());
  }
  outJson() {
    return JSON.parse(dec.decode(this.out()));
  }
  withStr(s, fn) {
    const b = enc.encode(s);
    const p = this.put(b);
    try {
      return fn(p, b.length);
    } finally {
      this.x.free_buf(p, b.length);
    }
  }

  /** files: [[имя, исходник], …]. Возвращает { ok:true, bytes } или { ok:false, diags:[{file,line,col,msg}] } */
  compile(files) {
    return this.withStr(JSON.stringify({ files }), (p, n) => {
      const ok = this.x.compile_json(p, n);
      return ok ? { ok: true, bytes: this.out() } : { ok: false, diags: this.outJson() };
    });
  }

  /** Запускает приложение из байткода. Возвращает null или текст ошибки. */
  load(nbc, { w, h, scale = 1, storage = {}, now = Date.now(), tz = -new Date().getTimezoneOffset() }) {
    const pp = this.put(nbc);
    const st = enc.encode(JSON.stringify(storage));
    const sp = this.put(st);
    try {
      const ok = this.x.app_load(pp, nbc.length, w, h, scale, sp, st.length, now, tz);
      return ok ? null : dec.decode(this.out());
    } finally {
      this.x.free_buf(pp, nbc.length);
      this.x.free_buf(sp, st.length);
    }
  }
  resize(w, h, scale) {
    this.x.app_resize(w, h, scale);
  }
  tick(now) {
    return this.x.app_tick(now) !== 0;
  }
  /** true — есть новый кадр; пиксели в .pixels() */
  render() {
    return this.x.app_render() !== 0;
  }
  pixels() {
    return this.mem.slice(this.x.pixels_ptr(), this.x.pixels_ptr() + this.x.pixels_len());
  }
  pointer(kind, x, y) {
    this.x.app_pointer(kind === 'down' ? 0 : kind === 'move' ? 1 : 2, x, y);
  }
  wheel(x, y, dy) {
    this.x.app_wheel(x, y, dy);
  }
  key(name) {
    if (name in KEYS) this.x.app_key(KEYS[name]);
  }
  text(s) {
    this.withStr(s, (p, n) => this.x.app_text(p, n));
  }
  back() {
    return this.x.app_back() !== 0;
  }
  tapText(s) {
    return this.withStr(s, (p, n) => this.x.app_tap_text(p, n)) !== 0;
  }
  /** биты: 1 — нужен ввод текста, 2 — приложение просит закрыться, 4 — изменилось хранилище */
  status() {
    const s = this.x.app_status();
    return { wantsText: !!(s & 1), exit: !!(s & 2), storageDirty: !!(s & 4) };
  }
  logs() {
    this.x.app_logs();
    return this.outJson();
  }
  storage() {
    this.x.app_storage();
    return this.outJson();
  }
  dump() {
    this.x.app_dump();
    return this.outJson();
  }
  vibrations() {
    this.x.app_vibrations();
    return this.outJson();
  }
}
