// Модель проекта: набор файлов (текст или бинарь) + список пустых папок.
import { store, prefs } from './store.js';
import { templateFiles, TEMPLATES, DEFAULT_TEMPLATE } from './templates.js';
import { utf8, fromUtf8, safePath, validateManifest, b64encode, b64decode } from './nob.js';
import { isTextPath } from './util.js';

export class Project {
  constructor(data = {}) {
    this.id = data.id || 'p' + Math.random().toString(36).slice(2, 9);
    this.name = data.name || 'Untitled';
    this.files = new Map(); // path -> string | Uint8Array
    this.dirs = new Set(data.dirs || []);
    for (const [p, v] of Object.entries(data.files || {})) this.files.set(p, v);
    this.listeners = new Set();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(ev) {
    for (const l of this.listeners) l(ev);
  }

  has(p) {
    return this.files.has(p);
  }
  read(p) {
    return this.files.get(p);
  }
  readText(p) {
    const v = this.files.get(p);
    return typeof v === 'string' ? v : v ? fromUtf8(v) : undefined;
  }
  paths() {
    return [...this.files.keys()].sort((a, b) => a.localeCompare(b));
  }

  write(p, content, { silent = false, origin } = {}) {
    safePath(p);
    const isNew = !this.files.has(p);
    this.files.set(p, content);
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) this.dirs.delete(parts.slice(0, i).join('/')); // папка перестала быть пустой
    if (!silent) this.emit({ type: isNew ? 'create' : 'write', path: p, origin });
  }

  delete(p) {
    if (this.files.delete(p)) this.emit({ type: 'delete', path: p });
  }

  deleteDir(d) {
    const gone = [];
    for (const p of [...this.files.keys()]) if (p.startsWith(d + '/')) {
      this.files.delete(p);
      gone.push(p);
    }
    for (const x of [...this.dirs]) if (x === d || x.startsWith(d + '/')) this.dirs.delete(x);
    this.emit({ type: 'delete-dir', path: d, paths: gone });
  }

  rename(from, to) {
    safePath(to);
    if (this.files.has(to)) throw new Error('файл уже существует: ' + to);
    this.files.set(to, this.files.get(from));
    this.files.delete(from);
    this.emit({ type: 'rename', path: from, to });
  }

  renameDir(from, to) {
    safePath(to);
    for (const p of this.files.keys()) if (p.startsWith(to + '/') || p === to) throw new Error('путь занят: ' + to);
    const map = [];
    for (const p of [...this.files.keys()]) if (p.startsWith(from + '/')) {
      const np = to + p.slice(from.length);
      this.files.set(np, this.files.get(p));
      this.files.delete(p);
      map.push([p, np]);
    }
    for (const x of [...this.dirs]) if (x === from || x.startsWith(from + '/')) {
      this.dirs.delete(x);
      this.dirs.add(to + x.slice(from.length));
    }
    this.emit({ type: 'rename-dir', path: from, to, map });
  }

  mkdir(d) {
    safePath(d);
    this.dirs.add(d);
    this.emit({ type: 'mkdir', path: d });
  }

  manifest() {
    try {
      return { value: JSON.parse(this.readText('manifest.json') ?? ''), error: null };
    } catch (e) {
      return { value: null, error: e.message };
    }
  }

  /** Проблемы проекта: манифест + синтаксис JSON. */
  problems() {
    const out = [];
    const m = this.manifest();
    if (!this.has('manifest.json')) out.push({ path: 'manifest.json', severity: 'error', text: 'нет manifest.json' });
    else if (m.error) out.push({ path: 'manifest.json', severity: 'error', text: 'JSON: ' + m.error });
    else {
      const v = validateManifest(m.value, this.files);
      v.errors.forEach((t) => out.push({ path: 'manifest.json', severity: 'error', text: t }));
      v.warnings.forEach((t) => out.push({ path: 'manifest.json', severity: 'warning', text: t }));
    }
    for (const [p, v] of this.files) {
      if (p !== 'manifest.json' && p.endsWith('.json') && typeof v === 'string') {
        try {
          JSON.parse(v);
        } catch (e) {
          out.push({ path: p, severity: 'error', text: 'JSON: ' + e.message });
        }
      }
    }
    return out;
  }

  /** Файлы для сборки: { path: Uint8Array } без manifest.json. */
  buildFiles() {
    const out = {};
    for (const [p, v] of this.files) {
      if (p === 'manifest.json' || p.endsWith('/.gitkeep')) continue;
      out[p] = typeof v === 'string' ? utf8(v) : v;
    }
    return out;
  }

  snapshot() {
    return { files: new Map(this.files), dirs: new Set(this.dirs) };
  }
  restore(snap) {
    this.files = new Map(snap.files);
    this.dirs = new Set(snap.dirs);
    this.emit({ type: 'restore' });
  }

  serialize() {
    const files = {};
    for (const [p, v] of this.files) files[p] = typeof v === 'string' ? v : { b64: b64encode(v) };
    return { id: this.id, name: this.name, dirs: [...this.dirs], files };
  }
  static deserialize(d) {
    const files = {};
    for (const [p, v] of Object.entries(d.files || {})) files[p] = typeof v === 'string' ? v : b64decode(v.b64);
    return new Project({ ...d, files });
  }

  /** Создаёт проект из набора файлов { path: Uint8Array } (+ manifest). */
  static fromFiles(name, files, manifest) {
    const p = new Project({ name });
    if (manifest) p.files.set('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
    for (const [path, data] of Object.entries(files)) p.files.set(path, isTextPath(path) ? fromUtf8(data) : data);
    return p;
  }

  static fromTemplate(key) {
    const t = TEMPLATES[key];
    const p = new Project({ name: t.manifest.name });
    for (const [path, c] of Object.entries(templateFiles(key))) p.files.set(path, c);
    return p;
  }
}

/** Список проектов, текущий проект, сохранение. */
export class Workspace {
  constructor() {
    this.projects = new Map();
    this.currentId = null;
    this.onSaved = null;
    this._timer = null;
  }
  get current() {
    return this.projects.get(this.currentId);
  }

  async load() {
    const ids = (await store.get('project-index')) || [];
    for (const id of ids) {
      const d = await store.get('project:' + id);
      if (d) {
        const p = Project.deserialize(d);
        this.projects.set(id, p);
        this.attach(p);
      }
    }
    this.currentId = prefs.get('current', null);
    if (!this.projects.has(this.currentId)) this.currentId = this.projects.keys().next().value || null;
    if (!this.current) {
      const p = Project.fromTemplate(DEFAULT_TEMPLATE);
      this.add(p);
    }
  }

  add(p) {
    this.projects.set(p.id, p);
    this.switch(p.id);
    this.attach(p);
    this.saveNow();
  }
  attach(p) {
    p.on(() => {
      if (p.id === this.currentId) this.scheduleSave();
    });
  }

  switch(id) {
    this.currentId = id;
    prefs.set('current', id);
  }

  async remove(id) {
    this.projects.delete(id);
    await store.del('project:' + id);
    if (this.currentId === id) {
      this.currentId = this.projects.keys().next().value || null;
      if (!this.currentId) this.add(Project.fromTemplate(DEFAULT_TEMPLATE));
      else this.switch(this.currentId);
    }
    await this.saveNow();
  }

  scheduleSave() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.saveNow(), 400);
  }

  async saveNow() {
    clearTimeout(this._timer);
    try {
      await store.set('project-index', [...this.projects.keys()]);
      const cur = this.current;
      if (cur) await store.set('project:' + cur.id, cur.serialize());
      this.onSaved && this.onSaved();
    } catch (e) {
      console.warn('не удалось сохранить', e);
    }
  }
}
