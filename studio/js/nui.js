// Noodle UI (.nui) — декларативный язык интерфейсов Noodle.OS. Парсер + генератор хост-страницы.
//
//   state count = 0 persist          состояние (persist — сохранять между запусками)
//   fn inc() { count += 1 }          функции (тело — JavaScript)
//   screen main {                    экран; первый экран или «main» открывается при старте
//     column padding=24 gap=16 {
//       text "Счёт: {count}" size=32
//       button "+" on=inc
//     }
//   }

export const NUI_TAGS = new Set(['column', 'row', 'box', 'text', 'button', 'input', 'area', 'toggle', 'image', 'spacer', 'divider', 'bar', 'if', 'each', 'scroll']);

class Scanner {
  constructor(src) {
    this.s = src;
    this.i = 0;
    this.line = 1;
  }
  get eof() {
    return this.i >= this.s.length;
  }
  peek(n = 0) {
    return this.s[this.i + n];
  }
  next() {
    const c = this.s[this.i++];
    if (c === '\n') this.line++;
    return c;
  }
  // пропуск пробелов; nl — включая переводы строк; комментарии // и /* */ всегда
  skip(nl) {
    for (;;) {
      const c = this.peek();
      if (c === ' ' || c === '\t' || c === '\r' || (nl && c === '\n')) this.next();
      else if (c === '/' && this.peek(1) === '/') while (!this.eof && this.peek() !== '\n') this.next();
      else if (c === '/' && this.peek(1) === '*') {
        this.next();
        this.next();
        while (!this.eof && !(this.peek() === '*' && this.peek(1) === '/')) this.next();
        this.next();
        this.next();
      } else break;
    }
  }
  ident() {
    const m = /^[A-Za-z_$][\w$-]*/.exec(this.s.slice(this.i, this.i + 80));
    if (!m) return null;
    this.i += m[0].length;
    return m[0];
  }
  string() {
    const q = this.next();
    let out = '';
    for (;;) {
      if (this.eof || this.peek() === '\n') throw this.err('строка не закрыта');
      const c = this.next();
      if (c === q) return out;
      if (c === '\\') {
        const n = this.next();
        out += n === 'n' ? '\n' : n === 't' ? '\t' : n === '{' ? '\u0001' : n;
      } else out += c;
    }
  }
  // читает {...} / (...) / [...] с учётом строк и вложенности; возвращает содержимое без внешних скобок
  balanced() {
    const open = this.next();
    const close = { '{': '}', '(': ')', '[': ']' }[open];
    const start = this.i;
    let depth = 1;
    while (!this.eof) {
      const c = this.peek();
      if (c === '"' || c === "'" || c === '`') {
        const q = this.next();
        while (!this.eof && this.peek() !== q) {
          if (this.peek() === '\\') this.next();
          this.next();
        }
        this.next();
        continue;
      }
      if (c === '/' && this.peek(1) === '/') {
        while (!this.eof && this.peek() !== '\n') this.next();
        continue;
      }
      if (c === open) depth++;
      else if (c === close && --depth === 0) {
        const body = this.s.slice(start, this.i);
        this.next();
        return body;
      }
      this.next();
    }
    throw this.err(`не закрыта скобка «${open}»`);
  }
  // выражение до конца строки (с учётом вложенных скобок/строк)
  expr() {
    const start = this.i;
    let depth = 0;
    while (!this.eof) {
      const c = this.peek();
      if (c === '"' || c === "'" || c === '`') {
        const q = this.next();
        while (!this.eof && this.peek() !== q) {
          if (this.peek() === '\\') this.next();
          this.next();
        }
        this.next();
        continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === '\n' && depth <= 0) break;
      else if (c === '/' && this.peek(1) === '/' && depth <= 0) break;
      this.next();
    }
    return this.s.slice(start, this.i).trim();
  }
  err(message) {
    return Object.assign(new Error(message), { nuiLine: this.line });
  }
}

/** Разбор строки с интерполяцией "Привет, {name}" → [ 'Привет, ', {code:'name'} ] */
export function splitInterp(str) {
  const parts = [];
  let buf = '';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '{') {
      let depth = 1;
      let j = i + 1;
      while (j < str.length && depth) {
        if (str[j] === '{') depth++;
        else if (str[j] === '}') depth--;
        j++;
      }
      if (depth) {
        buf += c;
        continue;
      }
      if (buf) parts.push(buf);
      buf = '';
      parts.push({ code: str.slice(i + 1, j - 1) });
      i = j - 1;
    } else buf += c === '\u0001' ? '{' : c;
  }
  if (buf) parts.push(buf);
  return parts;
}

function parseElement(sc, errors) {
  const line = sc.line;
  const tag = sc.ident();
  if (!tag) throw sc.err('ожидался элемент (column, row, text, button …)');
  if (!NUI_TAGS.has(tag)) throw sc.err(`неизвестный элемент «${tag}». Доступны: ${[...NUI_TAGS].join(', ')}`);
  const node = { tag, line, text: null, attrs: {}, children: [] };
  if (tag === 'if' || tag === 'each') {
    sc.skip(false);
    const start = sc.i;
    while (!sc.eof && sc.peek() !== '{' && sc.peek() !== '\n') sc.next();
    const head = sc.s.slice(start, sc.i).trim();
    if (sc.peek() !== '{') throw sc.err(`после «${tag} ${head}» ожидалась «{»`);
    if (tag === 'if') node.attrs.cond = { t: 'code', v: head };
    else {
      const m = /^(.+?)\s+as\s+([A-Za-z_$][\w$]*)(?:\s*,\s*([A-Za-z_$][\w$]*))?$/.exec(head);
      if (!m) throw sc.err('синтаксис: each список as элемент  (или as элемент, индекс)');
      node.attrs.items = { t: 'code', v: m[1].trim() };
      node.attrs.as = { t: 'id', v: m[2] };
      if (m[3]) node.attrs.index = { t: 'id', v: m[3] };
    }
    sc.next();
    node.children = parseBlock(sc, errors);
    return node;
  }
  for (;;) {
    sc.skip(false);
    const c = sc.peek();
    if (c === undefined || c === '\n' || c === '}') break;
    if (c === '{') {
      sc.next();
      node.children = parseBlock(sc, errors);
      break;
    }
    if (c === '"' || c === "'") {
      if (node.text !== null) throw sc.err('у элемента уже есть текст');
      node.text = sc.string();
      continue;
    }
    const name = sc.ident();
    if (!name) throw sc.err(`неожиданный символ «${c}»`);
    if (sc.peek() !== '=') {
      node.attrs[name] = { t: 'flag', v: true };
      continue;
    }
    sc.next();
    const v = sc.peek();
    if (v === '"' || v === "'") node.attrs[name] = { t: 'str', v: sc.string() };
    else if (v === '{') node.attrs[name] = { t: 'code', v: sc.balanced().trim() };
    else {
      const m = /^-?\d+(?:\.\d+)?/.exec(sc.s.slice(sc.i, sc.i + 30));
      if (m) {
        sc.i += m[0].length;
        node.attrs[name] = { t: 'num', v: Number(m[0]) };
      } else {
        const start = sc.i;
        while (!sc.eof && /[\w$.]/.test(sc.peek())) sc.next();
        if (sc.i === start) throw sc.err(`у «${name}=» нет значения`);
        node.attrs[name] = { t: 'ref', v: sc.s.slice(start, sc.i) };
      }
    }
  }
  return node;
}

function parseBlock(sc, errors) {
  const kids = [];
  for (;;) {
    sc.skip(true);
    if (sc.eof) throw sc.err('не закрыта «{»');
    if (sc.peek() === '}') {
      sc.next();
      return kids;
    }
    const startLine = sc.line;
    try {
      kids.push(parseElement(sc, errors));
    } catch (e) {
      if (e.nuiLine === undefined) throw e;
      errors.push({ line: e.nuiLine, message: e.message });
      // восстановление: пропустить строку
      while (!sc.eof && sc.peek() !== '\n') sc.next();
      if (sc.line === startLine && sc.eof) return kids;
    }
  }
}

/** Разбирает один .nui-файл. */
export function parseNui(src, file = 'app.nui') {
  const out = { states: [], fns: [], screens: {}, order: [], errors: [] };
  const sc = new Scanner(src);
  const errors = out.errors;
  while (true) {
    sc.skip(true);
    if (sc.eof) break;
    const line = sc.line;
    try {
      let kw = sc.ident();
      let isAsync = false;
      if (kw === 'async') {
        sc.skip(false);
        isAsync = true;
        kw = sc.ident();
      }
      if (kw === 'app' || kw === 'import') {
        sc.expr();
      } else if (kw === 'state') {
        sc.skip(false);
        const name = sc.ident();
        sc.skip(false);
        if (!name || sc.peek() !== '=') throw sc.err('синтаксис: state имя = значение');
        sc.next();
        let expr = sc.expr();
        let persist = false;
        const pm = /\s+persist$/.exec(expr);
        if (pm) {
          persist = true;
          expr = expr.slice(0, pm.index);
        }
        if (!expr) throw sc.err('у state нет начального значения');
        out.states.push({ name, expr, persist, line, file });
      } else if (kw === 'fn') {
        sc.skip(false);
        const name = sc.ident();
        sc.skip(false);
        if (!name || sc.peek() !== '(') throw sc.err('синтаксис: fn имя(параметры) { … }');
        const params = sc.balanced();
        sc.skip(true);
        if (sc.peek() !== '{') throw sc.err('после параметров ожидалась «{»');
        out.fns.push({ name, params, body: sc.balanced(), async: isAsync, line, file });
      } else if (kw === 'screen') {
        sc.skip(false);
        const name = sc.ident();
        sc.skip(false);
        if (!name || sc.peek() !== '{') throw sc.err('синтаксис: screen имя { … }');
        sc.next();
        out.screens[name] = { name, line, file, children: parseBlock(sc, errors) };
        out.order.push(name);
      } else throw sc.err(`на верхнем уровне допустимы: state, fn, screen (встретилось «${kw || sc.peek()}»)`);
    } catch (e) {
      if (e.nuiLine === undefined) throw e;
      errors.push({ line: e.nuiLine, message: e.message });
      while (!sc.eof && sc.peek() !== '\n') sc.next();
    }
  }
  for (const e of errors) e.file = file;
  return out;
}

/** Собирает все .nui проекта в одно приложение. entry — основной файл. */
export function compileNui(files, entry) {
  const names = [...(files instanceof Map ? files.keys() : Object.keys(files))].filter((p) => p.endsWith('.nui'));
  names.sort((a, b) => (a === entry ? -1 : b === entry ? 1 : a.localeCompare(b)));
  const app = { states: [], fns: [], screens: {}, order: [], errors: [] };
  const get = (p) => {
    const v = files instanceof Map ? files.get(p) : files[p];
    return typeof v === 'string' ? v : new TextDecoder().decode(v);
  };
  for (const p of names) {
    const r = parseNui(get(p), p);
    app.states.push(...r.states);
    app.fns.push(...r.fns);
    for (const n of r.order) {
      if (app.screens[n]) app.errors.push({ file: p, line: r.screens[n].line, message: `экран «${n}» уже объявлен в ${app.screens[n].file}` });
      else {
        app.screens[n] = r.screens[n];
        app.order.push(n);
      }
    }
    app.errors.push(...r.errors);
  }
  if (!names.length) app.errors.push({ file: entry, line: 1, message: 'нет ни одного .nui файла' });
  else if (!app.order.length) app.errors.push({ file: entry, line: 1, message: 'не объявлено ни одного экрана (screen main { … })' });
  return app;
}

/**
 * Хост-страница для запуска NUI-приложения в веб-рантайме (превью и Android-обёртка).
 * @param mode 'inline' — движок встроен в страницу (превью), 'file' — подключается файлом noodle-nui/engine.js
 */
export function nuiHostHtml(app, manifest, engineSrc, mode = 'inline') {
  const bg = manifest.window?.background || '#000000';
  const data = JSON.stringify({ name: manifest.name, states: app.states, fns: app.fns, screens: app.screens, order: app.order, errors: app.errors }).replace(/</g, '\\u003c');
  const engine = mode === 'inline' ? `<script>${engineSrc.replace(/<\/script/gi, '<\\/script')}</script>` : '<script src="engine.js"></script>';
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${String(manifest.name).replace(/</g, '&lt;')}</title>
<style>html,body{margin:0;height:100%;background:${bg}}</style>
</head><body><div id="nui-root"></div>
<script>window.__NUI_APP__=${data};</script>
${engine}
</body></html>
`;
}

/** Подготавливает исходники к запуску: для nui добавляет сгенерированную хост-страницу. */
export function prepareForRun(manifest, files, engineSrc, mode = 'inline') {
  if (manifest.stack !== 'nui') return { manifest, files };
  const app = compileNui(files, manifest.entry);
  const host = nuiHostHtml(app, manifest, engineSrc, mode);
  const out = files instanceof Map ? new Map(files) : { ...files };
  const hostPath = 'noodle-nui/index.html';
  if (out instanceof Map) out.set(hostPath, host);
  else out[hostPath] = typeof host === 'string' ? new TextEncoder().encode(host) : host;
  if (mode === 'file') {
    const e = new TextEncoder().encode(engineSrc);
    if (out instanceof Map) out.set('noodle-nui/engine.js', engineSrc);
    else out['noodle-nui/engine.js'] = e;
  }
  return { manifest: { ...manifest, entry: hostPath }, files: out, errors: app.errors };
}
