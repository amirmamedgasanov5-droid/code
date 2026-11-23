// Превью: собирает документ приложения для песочницы и показывает его в «устройстве Noodle.OS».
import { h, icon } from './util.js';
import { utf8, injectHead, mimeOf, fromUtf8, b64encode } from './nob.js';
import { store } from './store.js';
import { NoodleWasm } from './noodle-wasm.js';
import { NATIVE_STACKS, STACKS } from './nob.js';

let runtimeSrcCache = null;
export async function loadRuntime() {
  if (!runtimeSrcCache) runtimeSrcCache = await (await fetch(new URL('./noodle-runtime.js', import.meta.url))).text();
  return runtimeSrcCache;
}

let wasmP = null;
/** Общий экземпляр нативного ядра Noodle (компилятор + рантайм). */
export function sharedWasm() {
  wasmP ||= NoodleWasm.load(new URL('../wasm/noodle.wasm', import.meta.url).href);
  return wasmP;
}

const bytesOf = (v) => (typeof v === 'string' ? utf8(v) : v);
const dirname = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

function resolvePath(from, spec) {
  spec = spec.split('#')[0].split('?')[0];
  const parts = spec.startsWith('/') ? [] : dirname(from).split('/').filter(Boolean);
  for (const seg of spec.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}
const isRelative = (u) => typeof u === 'string' && u !== '' && !/^[a-z][a-z0-9+.-]*:/i.test(u) && !u.startsWith('//') && !u.startsWith('#');

/**
 * Собирает srcdoc для iframe: все ссылки на локальные файлы заменяются на blob:-URL,
 * ES-импорты внутри JS переписываются, в <head> добавляется рантайм Noodle.
 * @returns {{ html: string, urls: string[], warnings: string[] }}
 */
export function buildPreviewDoc(files, manifest, { storage = {}, runtime }) {
  const urls = [];
  const warnings = [];
  const cache = new Map();
  // песочница без allow-same-origin не может грузить blob: родителя, поэтому ресурсы отдаём как data:-URL
  const mk = (data, path) => {
    const bytes = typeof data === 'string' ? utf8(data) : data;
    return `data:${mimeOf(path)};base64,${b64encode(bytes)}`;
  };

  function rewriteJs(code, from, stack) {
    return code.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{0,2}\/[^'"\n]+)\2/g, (m, pre, q, spec) => {
      const target = resolvePath(from, spec);
      const u = urlFor(target, stack);
      return u ? pre + q + u + q : m;
    });
  }
  function rewriteCss(code, from, stack) {
    return code
      .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, spec) => {
        if (!isRelative(spec)) return m;
        const u = urlFor(resolvePath(from, spec), stack);
        return u ? `url("${u}")` : m;
      })
      .replace(/@import\s+(['"])([^'"]+)\1/g, (m, q, spec) => {
        if (!isRelative(spec)) return m;
        const u = urlFor(resolvePath(from, spec), stack);
        return u ? `@import "${u}"` : m;
      });
  }
  function urlFor(path, stack = []) {
    if (cache.has(path)) return cache.get(path);
    if (!files.has(path)) return null;
    if (stack.includes(path)) {
      warnings.push(`циклический импорт: ${[...stack, path].join(' → ')} (в превью не поддерживается)`);
      return null;
    }
    const v = files.get(path);
    const ext = path.split('.').pop().toLowerCase();
    let data = bytesOf(v);
    if (typeof v === 'string' && (ext === 'js' || ext === 'mjs')) data = rewriteJs(v, path, [...stack, path]);
    else if (typeof v === 'string' && ext === 'css') data = rewriteCss(v, path, [...stack, path]);
    const u = mk(data, path);
    cache.set(path, u);
    return u;
  }

  const entry = manifest.entry;
  const src = files.get(entry);
  if (src === undefined) throw new Error(`entry «${entry}» не найден`);
  const doc = new DOMParser().parseFromString(fromTextOrBytes(src), 'text/html');
  const fix = (el, attr) => {
    const val = el.getAttribute(attr);
    if (!isRelative(val)) return;
    const u = urlFor(resolvePath(entry, val), [entry]);
    if (u) el.setAttribute(attr, u);
    else warnings.push(`не найден файл: ${val}`);
  };
  doc.querySelectorAll('script[src], img[src], source[src], audio[src], video[src], track[src], embed[src]').forEach((el) => fix(el, 'src'));
  doc.querySelectorAll('link[href]').forEach((el) => fix(el, 'href'));
  doc.querySelectorAll('video[poster]').forEach((el) => fix(el, 'poster'));
  doc.querySelectorAll('script:not([src])').forEach((el) => {
    if (!el.type || el.type === 'module' || el.type === 'text/javascript') el.textContent = rewriteJs(el.textContent, entry, [entry]);
  });
  doc.querySelectorAll('style').forEach((el) => (el.textContent = rewriteCss(el.textContent, entry, [entry])));

  // карта локальных файлов для fetch() внутри приложения
  const map = {};
  for (const p of files.keys()) {
    if (p === 'manifest.json' || /\.(html?)$/i.test(p)) continue;
    const before = warnings.length;
    const u = urlFor(p, []);
    if (u) map[p] = u;
    warnings.length = before; // шум от «циклов» при прямом обходе не нужен
  }
  for (const p of files.keys()) if (/\.html?$/i.test(p) && p !== entry) map[p] = mk(bytesOf(files.get(p)), p);

  const perms = manifest.permissions || [];
  const csp = perms.includes('network') ? '' : `<meta http-equiv="Content-Security-Policy" content="connect-src blob: data:">`;
  const config = JSON.stringify({ manifest, mode: 'preview', storage, files: map }).replace(/</g, '\\u003c');
  const rt = runtime.replace(/<\/script/gi, '<\\/script');
  const snippet = `${csp}<script>window.__NOODLE_CONFIG__=${config};</script><script>${rt}</script>`;
  const html = injectHead('<!doctype html>\n' + doc.documentElement.outerHTML, snippet);
  return { html, urls, warnings: [...new Set(warnings)] };
}

function fromTextOrBytes(v) {
  return typeof v === 'string' ? v : fromUtf8(v);
}

// ───────────────────────────── устройство ─────────────────────────────

export const PROFILES = [
  { id: 'phone', name: 'Телефон 390×844', w: 390, h: 844 },
  { id: 'small', name: 'Компакт 360×640', w: 360, h: 640 },
  { id: 'tablet', name: 'Планшет 768×1024', w: 768, h: 1024 },
];

export class Device {
  constructor({ onConsole, onState, onDiagnostics }) {
    this.onDiagnostics = onDiagnostics;
    this.onConsole = onConsole || (() => {});
    this.onState = onState || (() => {});
    this.profile = PROFILES[0];
    this.landscape = false;
    this.urls = [];
    this.installed = [];
    this.current = null;
    this.appdata = {};
    this._saveTimers = {};

    this.time = h('span.sb-time', '');
    this.screen = h('div.dev-screen');
    this.statusbar = h('div.dev-status', this.time, h('span.sb-right', h('i.sb-sig'), h('i.sb-bat')));
    this.backBtn = h('button.dev-nav-btn', { title: 'Назад', 'aria-label': 'Назад', onclick: () => this.back() }, icon('back', 16));
    this.homeBtn = h('button.dev-nav-btn', { title: 'Домой', 'aria-label': 'Домой', onclick: () => this.home() }, h('i.home-dot'));
    this.nav = h('div.dev-nav', this.backBtn, this.homeBtn, h('span.dev-nav-spacer'));
    this.device = h('div.device', this.statusbar, this.screen, this.nav);
    this.scaler = h('div.dev-scaler', this.device);
    this.root = h('div.dev-stage', this.scaler);

    window.addEventListener('message', (e) => this.onMessage(e));
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.root);
    this.tick();
    setInterval(() => this.tick(), 20000);
    this.applySize();
    this.home();
  }

  get size() {
    const { w, h } = this.profile;
    return this.landscape ? { w: h, h: w } : { w, h };
  }

  tick() {
    const d = new Date();
    this.time.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (this.clock) this.clock.textContent = this.time.textContent;
  }

  applySize() {
    const { w, h } = this.size;
    this.device.style.width = w + 'px';
    this.device.style.height = h + 'px';
    this.device.classList.toggle('landscape', this.landscape);
    this.fit();
    if (this.native && this.current) this.launch(this.current);
  }
  setProfile(id) {
    this.profile = PROFILES.find((p) => p.id === id) || PROFILES[0];
    this.applySize();
  }
  rotate() {
    this.landscape = !this.landscape;
    this.applySize();
  }
  fit() {
    const { w, h } = this.size;
    const r = this.root.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const extra = 18; // рамка
    const s = Math.min(1, (r.width - 24) / (w + extra), (r.height - 24) / (h + 44 + 56 + extra));
    const sc = Math.max(0.2, s);
    this.device.style.transform = `scale(${sc})`;
    this.scaler.style.width = (w + extra) * sc + 'px';
    this.scaler.style.height = (h + 44 + extra) * sc + 'px';
    this.scale = sc;
    this.updateNativeScale();
  }

  clear() {
    this.stopNative();
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
    this.screen.replaceChildren();
    this.frame = null;
  }

  async storageFor(id) {
    if (!(id in this.appdata)) this.appdata[id] = (await store.get('appdata:' + id)) || {};
    return this.appdata[id];
  }

  /** Запустить приложение. source: { manifest, files: Map<path,string|Uint8Array>, label } */
  async launch(source) {
    this.current = source;
    const stack = source.manifest.stack || 'noodle';
    if (NATIVE_STACKS.includes(stack)) {
      this.clear();
      this.device.classList.remove('in-app');
      this.screen.style.background = '#000';
      this.screen.append(h('div.dev-error', h('b', `Нативный проект: ${STACKS[stack]}`), h('p', 'Этот стек собирается своим тулчейном и в превью Studio не запускается.'), h('p', stack === 'swift' ? 'Соберите проект в Xcode на macOS.' : 'Соберите APK командой nob apk и поставьте на устройство или эмулятор.')));
      this.onState({ running: false });
      return;
    }
    if (stack === 'noodle') return this.launchNative(source);
    const runtime = await loadRuntime();
    const run = source;
    const storage = await this.storageFor(source.manifest.id);
    this.clear();
    let built;
    try {
      built = buildPreviewDoc(run.files, run.manifest, { storage, runtime });
    } catch (e) {
      this.screen.append(h('div.dev-error', h('b', 'Не удалось запустить'), h('pre', e.message)));
      this.onConsole({ level: 'error', text: 'Запуск: ' + e.message, source: 'studio' });
      this.onState({ running: false });
      return;
    }
    this.urls = built.urls;
    built.warnings.forEach((w) => this.onConsole({ level: 'warn', text: w, source: 'studio' }));
    const bg = source.manifest.window?.background || '#000';
    this.screen.style.background = bg;
    this.device.dataset.status = source.manifest.window?.statusBar === 'dark' ? 'dark' : 'light';
    this.frame = h('iframe.dev-app', {
      sandbox: 'allow-scripts allow-forms allow-modals allow-pointer-lock',
      title: source.manifest.name,
      allow: 'clipboard-write',
    });
    this.frame.srcdoc = built.html;
    this.screen.append(this.frame);
    this.device.classList.add('in-app');
    this.onState({ running: true, name: source.manifest.name });
  }


  // ───────────── нативные приложения Noodle (WebAssembly-ядро + canvas) ─────────────

  stopNative() {
    const n = this.native;
    if (!n) return;
    cancelAnimationFrame(n.raf);
    n.ime.remove();
    n.canvas.remove();
    this.native = null;
  }

  /** Область приложения в логических пикселях (экран минус статус-бар). */
  appArea() {
    const { w, h } = this.size;
    return { w, h: h - 24 - 48 };
  }
  renderScale() {
    return Math.min(3, Math.max(1, Math.round((window.devicePixelRatio || 1) * (this.scale || 1) * 2) / 2));
  }
  updateNativeScale() {
    const n = this.native;
    if (!n) return;
    const rs = this.renderScale();
    if (rs === n.rs) return;
    const { w: aw, h: ah } = this.appArea();
    n.rs = rs;
    n.canvas.width = Math.round(aw * rs);
    n.canvas.height = Math.round(ah * rs);
    n.wasm.resize(aw, ah, rs);
    n.ctx = n.canvas.getContext('2d');
  }

  async launchNative(source) {
    this.clear();
    const wasm = await sharedWasm();
    let nbc = source.nbc;
    if (!nbc) {
      const entry = source.manifest.entry;
      const names = [...source.files.keys()].filter((p) => /\.(nui|ns)$/.test(p)).sort((a, b) => (a === entry ? -1 : b === entry ? 1 : 0));
      const srcs = names.map((p) => [p, typeof source.files.get(p) === 'string' ? source.files.get(p) : new TextDecoder().decode(source.files.get(p))]);
      const r = wasm.compile(srcs);
      this.onDiagnostics && this.onDiagnostics(r.ok ? [] : r.diags);
      if (!r.ok) {
        this.device.classList.remove('in-app');
        this.screen.style.background = '#000';
        this.screen.append(h('div.dev-error', h('b', `Ошибки в коде: ${r.diags.length}`), h('pre', r.diags.slice(0, 8).map((d) => `${d.file}:${d.line}:${d.col}\n${d.msg}`).join('\n\n'))));
        r.diags.forEach((d) => this.onConsole({ level: 'error', text: `${d.file}:${d.line}:${d.col}  ${d.msg}`, source: 'nui' }));
        this.onState({ running: false });
        return;
      }
      nbc = r.bytes;
      this.lastNbc = nbc;
    } else this.onDiagnostics && this.onDiagnostics([]);

    const id = source.manifest.id;
    const storage = (await store.get('nstorage:' + id)) || {};
    const { w: aw, h: ah } = this.appArea();
    const rs = this.renderScale();
    const err = wasm.load(nbc, { w: aw, h: ah, scale: rs, storage });
    if (err) {
      this.screen.append(h('div.dev-error', h('b', 'Не удалось запустить'), h('pre', err)));
      this.onConsole({ level: 'error', text: 'Запуск: ' + err, source: 'studio' });
      this.onState({ running: false });
      return;
    }
    const canvas = h('canvas.dev-native', { width: Math.round(aw * rs), height: Math.round(ah * rs), tabindex: '0', 'aria-label': source.manifest.name });
    canvas.style.width = aw + 'px';
    canvas.style.height = ah + 'px';
    const ime = h('textarea.dev-ime', { 'aria-hidden': 'true', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', spellcheck: false, tabindex: '-1' });
    this.screen.append(canvas, ime);
    const bg = source.manifest.window?.background || '#000';
    this.screen.style.background = bg;
    this.device.dataset.status = source.manifest.window?.statusBar === 'dark' ? 'dark' : 'light';
    this.device.classList.add('in-app');
    const n = (this.native = { wasm, canvas, ime, ctx: canvas.getContext('2d'), rs, id, raf: 0, wantsText: false, lastLog: 0, store });
    this.wireNativeInput(n);
    const loop = () => {
      if (this.native !== n) return;
      const now = Date.now();
      wasm.tick(now);
      if (wasm.render()) {
        const px = wasm.pixels();
        n.ctx.putImageData(new ImageData(new Uint8ClampedArray(px.buffer), n.canvas.width, n.canvas.height), 0, 0);
      }
      const st = wasm.status();
      if (st.storageDirty) store.set('nstorage:' + id, wasm.storage());
      if (st.wantsText !== n.wantsText) {
        n.wantsText = st.wantsText;
        if (st.wantsText) ime.focus({ preventScroll: true });
        else if (document.activeElement === ime) canvas.focus({ preventScroll: true });
      }
      if (st.exit) return this.home();
      if (now - n.lastLog > 100) {
        n.lastLog = now;
        for (const l of wasm.logs()) this.onConsole({ level: l.level === 'error' ? 'error' : 'log', text: l.text, source: 'app' });
        const vib = wasm.vibrations();
        if (vib.length && source.manifest.permissions?.includes('vibrate') && navigator.vibrate) navigator.vibrate(vib[vib.length - 1]);
      }
      n.raf = requestAnimationFrame(loop);
    };
    n.raf = requestAnimationFrame(loop);
    this.onState({ running: true, name: source.manifest.name });
  }

  wireNativeInput(n) {
    const { canvas, ime, wasm } = n;
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height)];
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      canvas.focus({ preventScroll: true });
      wasm.pointer('down', ...pos(e));
    });
    canvas.addEventListener('pointermove', (e) => wasm.pointer('move', ...pos(e)));
    const up = (e) => {
      wasm.pointer('up', ...pos(e));
      // фокус на скрытое поле — в обработчике жеста, чтобы открылась экранная клавиатура
      if (wasm.status().wantsText) {
        n.wantsText = true;
        ime.focus({ preventScroll: true });
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [x, y] = pos(e);
      wasm.wheel(x, y, e.deltaY * (canvas.width / canvas.getBoundingClientRect().width));
    }, { passive: false });
    const KEYMAP = { Backspace: 'backspace', Delete: 'delete', ArrowLeft: 'left', ArrowRight: 'right', Home: 'home', End: 'end', Enter: 'enter', Escape: 'escape', Tab: 'tab' };
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = KEYMAP[e.key];
      if (k === 'escape' && !wasm.status().wantsText) {
        e.preventDefault();
        return this.back();
      }
      if (k) {
        if (k === 'tab' && !wasm.status().wantsText) return;
        e.preventDefault();
        wasm.key(k);
      } else if (e.target === canvas && e.key.length === 1) {
        e.preventDefault();
        wasm.text(e.key);
      }
    };
    canvas.addEventListener('keydown', onKey);
    ime.addEventListener('keydown', onKey);
    ime.addEventListener('beforeinput', (e) => {
      if (e.inputType === 'deleteContentBackward') {
        e.preventDefault();
        wasm.key('backspace');
      } else if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') {
        e.preventDefault();
        wasm.key('enter');
      }
    });
    ime.addEventListener('input', () => {
      if (ime.value) wasm.text(ime.value);
      ime.value = '';
    });
  }

  reload() {
    if (this.current) return this.launch(this.current);
    this.home();
  }

  home() {
    this.clear();
    this.current = null;
    this.device.classList.remove('in-app');
    this.device.dataset.status = 'light';
    this.screen.style.background = '#000';
    this.clock = h('div.home-clock', this.time.textContent);
    const date = h('div.home-date', new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }));
    const grid = h('div.home-grid');
    if (!this.installed.length) grid.append(h('div.home-empty', 'Нет установленных приложений.', h('br'), 'Соберите .nob и нажмите «Установить».'));
    for (const app of this.installed) {
      grid.append(
        h('button.home-app', { onclick: () => app.launch(), title: app.manifest.name },
          h('span.home-icon', app.iconUrl ? h('img', { src: app.iconUrl, alt: '' }) : h('b', app.manifest.name[0])),
          h('span.home-name', app.manifest.name)),
      );
    }
    this.screen.append(h('div.home', this.clock, date, grid));
    this.onState({ running: false });
  }

  setInstalled(list) {
    this.installed.forEach((a) => a.iconUrl && URL.revokeObjectURL(a.iconUrl));
    this.installed = list;
    if (!this.current) this.home();
  }

  back() {
    if (this.native) {
      if (!this.native.wasm.back()) this.home();
      return;
    }
    if (!this.frame) return;
    this._backTimer = setTimeout(() => this.home(), 400);
    this.frame.contentWindow.postMessage({ noodle: true, type: 'back' }, '*');
  }

  onMessage(e) {
    const d = e.data;
    if (!d || d.noodle !== true || !this.frame || e.source !== this.frame.contentWindow) return;
    if (d.type === 'console') this.onConsole({ level: d.level, text: d.text, source: 'app' });
    else if (d.type === 'back-result') {
      clearTimeout(this._backTimer);
      if (!d.handled) this.home();
    } else if (d.type === 'exit') this.home();
    else if (d.type === 'storage') {
      const id = this.current?.manifest.id;
      if (!id) return;
      const data = this.appdata[id] || (this.appdata[id] = {});
      if (d.op === 'set') data[d.key] = d.value;
      else if (d.op === 'remove') delete data[d.key];
      else if (d.op === 'clear') for (const k of Object.keys(data)) delete data[k];
      clearTimeout(this._saveTimers[id]);
      this._saveTimers[id] = setTimeout(() => store.set('appdata:' + id, data), 300);
    }
  }

  async clearAppData(id) {
    this.appdata[id] = {};
    await store.del('appdata:' + id);
  }
}
