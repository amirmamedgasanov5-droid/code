// Noodle Studio — главный модуль: окно, панели, редактор, сборка, агент.
import { h, icon, esc, debounce, download, pickFiles, fmtBytes, langOf, isTextPath } from './util.js';
import { store, prefs } from './store.js';
import { Project, Workspace } from './project.js';
import { TEMPLATES } from './templates.js';
import { CodeEditor } from './editor.js';
import { Device, PROFILES, loadRuntime, sharedWasm } from './preview.js';
import { toast, prompt, confirm, alertBox, palette, menu } from './ui.js';
import { PROVIDERS, runAgent, listModels } from './ai.js';
import { androidProject } from './android.js';
import {
  buildNob, readNob, zipRead, zipWrite, generateKey, fromUtf8, utf8, validateManifest, PERMISSIONS, ORIENTATIONS, STACKS, NATIVE_STACKS, NOODLE_BYTECODE, stripInjected, mimeOf, sha256,
} from './nob.js';

const $ = (id) => document.getElementById(id);
const ws = new Workspace();
const narrow = matchMedia('(max-width: 860px)');

const S = {
  view: prefs.get('view', 'files'),
  tabs: [], // { path, editor }
  active: null,
  logs: [],
  output: [],
  bottomTab: 'console',
  live: prefs.get('live', true),
  expanded: new Set(prefs.get('expanded', [])),
  selected: null,
  installed: [],
  lastBuild: null,
  searchQ: '',
  searchCase: false,
  running: false,
  diags: [],
  agentSnap: null,
  agentBusy: false,
};
const project = () => ws.current;
const host = { project: null };
let device;

// ───────────────────────────── журнал ─────────────────────────────

function logConsole(entry) {
  S.logs.push({ ...entry, t: Date.now() });
  if (S.logs.length > 500) S.logs.shift();
  renderBottom();
  if (entry.level === 'error') updateStatus();
}
function logOut(text, kind = 'info') {
  S.output.push({ level: kind, text, source: 'studio', t: Date.now() });
  if (S.output.length > 300) S.output.shift();
  renderBottom();
}

// ───────────────────────────── проверка кода Noodle ─────────────────────────────

const stackOf = () => project().manifest().value?.stack || 'noodle';

/** Компилирует .nui/.ns проекта нативным ядром. Возвращает { ok, bytes?, diags } и обновляет «Проблемы». */
async function compileProject() {
  const p = project();
  const m = p.manifest().value;
  if (!m || stackOf() !== 'noodle') return { ok: true, diags: [], bytes: null };
  const names = p.paths().filter((f) => /\.(nui|ns)$/.test(f)).sort((a, b) => (a === m.entry ? -1 : b === m.entry ? 1 : 0));
  const wasm = await sharedWasm();
  const r = wasm.compile(names.map((f) => [f, p.readText(f) ?? '']));
  S.diags = r.ok ? [] : r.diags;
  renderBottom();
  updateStatus();
  return r.ok ? { ok: true, bytes: r.bytes, diags: [] } : { ok: false, diags: r.diags };
}
const recheck = debounce(() => { compileProject().catch(() => {}); }, 450);

// ───────────────────────────── каркас ─────────────────────────────

function buildFrame() {
  const tb = $('titlebar');
  tb.replaceChildren(
    h('div.brand', h('i'), h('span', 'Noodle Studio')),
    h('button.tb-btn.proj-btn', { id: 'proj-btn', title: 'Проекты', onclick: (e) => projectMenu(e.currentTarget) }, h('span', ''), icon('collapse', 12)),
    h('div.tb-spacer'),
    h('button.tb-btn.ghost', { id: 'btn-palette', title: 'Команды (Ctrl+Shift+P)', onclick: () => commandPalette() }, icon('search', 14), h('span.lbl-t', 'Команды')),
    h('button.tb-btn.ghost', { id: 'btn-build', title: 'Собрать .nob (Ctrl+Shift+B)', onclick: () => buildAction() }, icon('package', 14), h('span.lbl-t', 'Собрать')),
    h('button.tb-btn.primary', { id: 'btn-run', title: 'Запустить (Ctrl+Enter)', onclick: () => run() }, icon('play', 12), h('span.lbl-t', 'Запустить')),
    h('button.tb-btn.icon', { id: 'btn-prev', title: 'Превью', 'aria-label': 'Превью', onclick: () => togglePreview() }, icon('device', 16)),
  );

  const act = $('activity');
  const mk = (id, ic, title) => h('button.act-btn', { id: 'act-' + id, title, 'aria-label': title, onclick: () => setView(id) }, icon(ic, 22));
  act.replaceChildren(mk('files', 'files', 'Проводник (Ctrl+Shift+E)'), mk('search', 'search', 'Поиск (Ctrl+Shift+F)'), mk('agent', 'agent', 'ИИ-агент'), mk('package', 'package', 'Пакет и сборка'), h('div.act-spacer'), mk('settings', 'gear', 'Настройки'));

  $('statusbar').replaceChildren(
    h('button.sb-item', { id: 'sb-proj', onclick: () => setView('package') }),
    h('button.sb-item', { id: 'sb-prob', title: 'Проблемы', onclick: () => setBottom('problems', true) }),
    h('div.sb-sp'),
    h('span.sb-item.hide-m', { id: 'sb-saved' }, 'Автосохранение'),
    h('span.sb-item', { id: 'sb-cur' }),
    h('span.sb-item.hide-m', { id: 'sb-lang' }),
    h('button.sb-item.hide-m', { id: 'sb-key', title: 'Ключ подписи', onclick: () => setView('package') }),
  );

  // превью
  const pc = $('preview-col');
  const sel = h('select.pv-sel', { id: 'pv-profile', 'aria-label': 'Устройство', onchange: (e) => device.setProfile(e.target.value) }, PROFILES.map((p) => h('option', { value: p.id }, p.name)));
  pc.replaceChildren(
    h('div.pv-bar',
      h('div.pv-title', { id: 'pv-title' }, 'Noodle.OS'),
      sel,
      h('button.ib', { title: 'Повернуть', 'aria-label': 'Повернуть', onclick: () => device.rotate() }, icon('rotate', 16)),
      h('button.ib', { id: 'pv-live', title: 'Автообновление при правках', 'aria-label': 'Автообновление', onclick: toggleLive }, icon('reload', 16)),
      h('button.ib', { title: 'Перезапустить', 'aria-label': 'Перезапустить', onclick: () => run() }, icon('play', 14)),
      h('button.ib', { title: 'Закрыть превью', 'aria-label': 'Закрыть превью', onclick: () => togglePreview(false) }, icon('close', 16)),
    ),
    device.root,
  );
  sizeSplitters();
}

function sizeSplitters() {
  const root = document.documentElement.style;
  root.setProperty('--side-w', prefs.get('sideW', 300) + 'px');
  root.setProperty('--prev-w', prefs.get('prevW', 440) + 'px');
  root.setProperty('--bot-h', prefs.get('botH', 180) + 'px');
  const drag = (el, onMove) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('drag');
      const mv = (ev) => onMove(ev);
      const up = () => {
        el.classList.remove('drag');
        el.removeEventListener('pointermove', mv);
        el.removeEventListener('pointerup', up);
        device && device.fit();
      };
      el.addEventListener('pointermove', mv);
      el.addEventListener('pointerup', up);
    });
  };
  drag($('split-side'), (e) => {
    const w = Math.max(200, Math.min(560, e.clientX - 48));
    root.setProperty('--side-w', w + 'px');
    prefs.set('sideW', w);
  });
  drag($('split-prev'), (e) => {
    const r = $('workbench').getBoundingClientRect();
    const w = Math.max(280, Math.min(r.width - 260, r.right - e.clientX));
    root.setProperty('--prev-w', w + 'px');
    prefs.set('prevW', w);
  });
}

// ───────────────────────────── вид / панели ─────────────────────────────

function setView(v) {
  if (S.view === v && !document.body.classList.contains('side-off')) {
    document.body.classList.add('side-off');
    prefs.set('sideOff', true);
  } else {
    document.body.classList.remove('side-off');
    prefs.set('sideOff', false);
    S.view = v;
    prefs.set('view', v);
  }
  renderSidebar();
  syncActivity();
}
function syncActivity() {
  for (const b of document.querySelectorAll('.act-btn')) b.classList.toggle('on', b.id === 'act-' + S.view && !document.body.classList.contains('side-off'));
}

function togglePreview(force) {
  const off = document.body.classList.contains('prev-off');
  const open = force === undefined ? off : force;
  document.body.classList.toggle('prev-off', !open);
  prefs.set('prevOpen', open);
  $('btn-prev').classList.toggle('on', open);
  if (open) setTimeout(() => device.fit(), 30);
  if (open && narrow.matches) document.body.classList.add('side-off');
  syncActivity();
}
function toggleLive() {
  S.live = !S.live;
  prefs.set('live', S.live);
  $('pv-live').classList.toggle('on', S.live);
  toast(S.live ? 'Автообновление включено' : 'Автообновление выключено');
}

function setBottom(tab, open) {
  S.bottomTab = tab;
  if (open) document.body.classList.remove('bot-off');
  renderBottom();
}

// ───────────────────────────── проекты ─────────────────────────────

function slug(name) {
  let s = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!s || /^\d/.test(s)) s = 'app' + s;
  if (['new', 'int', 'class', 'do', 'if', 'for', 'try', 'case', 'enum', 'this', 'void', 'goto', 'const', 'final', 'import', 'package', 'public', 'private', 'static', 'switch', 'while', 'return', 'default', 'native', 'super', 'long', 'short', 'char', 'byte', 'float', 'double', 'boolean', 'break', 'else', 'assert', 'catch', 'extends', 'finally', 'implements', 'instanceof', 'interface', 'null', 'protected', 'strictfp', 'synchronized', 'throw', 'throws', 'transient', 'volatile', 'abstract', 'true', 'false', 'continue'].includes(s)) s += 'app';
  return s;
}

async function newProject() {
  const items = Object.entries(TEMPLATES).map(([key, t]) => ({ label: t.title, hint: STACKS[t.stack], key }));
  palette({
    placeholder: 'Выберите стек и шаблон…',
    items,
    onPick: async (it) => {
      const t = TEMPLATES[it.key];
      const name = await prompt('Название проекта', { value: t.manifest.name, ok: 'Создать' });
      if (!name) return;
      const p = Project.fromTemplate(it.key);
      p.name = name;
      const m = JSON.parse(p.readText('manifest.json'));
      m.name = name.slice(0, 40);
      m.id = 'dev.noodle.' + slug(name);
      p.write('manifest.json', JSON.stringify(m, null, 2) + '\n', { silent: true });
      openProject(p, true);
    },
  });
}

function openProject(p, add) {
  closeAllTabs();
  if (add) ws.add(p);
  else ws.switch(p.id);
  host.project = project();
  bindProject();
  const m = project().manifest().value;
  const first = m?.entry && project().has(m.entry) ? m.entry : project().paths().find((x) => /\.(nui|html|kt|dart|swift)$/.test(x)) || project().paths()[0];
  S.selected = null;
  if (first) openFile(first);
  renderAll();
  device.home();
  device.setInstalled(device.installed);
  if (narrow.matches) document.body.classList.add('side-off');
}

let unbind = null;
function bindProject() {
  unbind && unbind();
  const p = project();
  const live = debounce(() => {
    if (S.live && device.current && device.current.live && !document.body.classList.contains('prev-off')) run({ quiet: true });
  }, 700);
  unbind = p.on((ev) => {
    if (ev.type === 'rename') for (const t of S.tabs) if (t.path === ev.path) retarget(t, ev.to);
    if (ev.type === 'rename-dir') for (const [a, b] of ev.map) for (const t of S.tabs) if (t.path === a) retarget(t, b);
    if (ev.type === 'delete') closeTab(ev.path, true);
    if (ev.type === 'delete-dir') ev.paths.forEach((x) => closeTab(x, true));
    if (ev.type === 'restore') syncEditorsFromProject();
    if ((ev.type === 'write' || ev.type === 'create') && ev.origin !== 'editor') {
      const t = S.tabs.find((x) => x.path === ev.path);
      if (t && t.editor) t.editor.setValue(p.readText(ev.path) ?? '');
    }
    scheduleExplorer();
    updateStatus();
    recheck();
    live();
    if (S.view === 'package') schedulePackage();
  });
}
function retarget(tab, to) {
  tab.path = to;
  if (S.active) S.active = S.tabs.some((t) => t.path === S.active) ? S.active : to;
  renderTabs();
}
function syncEditorsFromProject() {
  for (const t of [...S.tabs]) {
    if (!project().has(t.path)) closeTab(t.path, true);
    else t.editor && t.editor.setValue(project().readText(t.path) ?? '');
  }
  renderAll();
}

function projectMenu(anchor) {
  const items = [{ header: 'Проекты' }];
  for (const p of ws.projects.values()) items.push({ label: (p.id === ws.currentId ? '● ' : '○ ') + p.name, on: p.id === ws.currentId, run: () => p.id !== ws.currentId && openProject(p, false) });
  items.push('-', { label: 'Новый проект…', run: newProject }, { label: 'Открыть .nob / .apk / .zip…', run: importFile }, { label: 'Переименовать проект…', run: renameProject }, { label: 'Удалить проект…', run: deleteProject });
  menu(anchor, items);
}
async function renameProject() {
  const n = await prompt('Название проекта', { value: project().name, ok: 'Переименовать' });
  if (!n) return;
  project().name = n;
  ws.saveNow();
  updateStatus();
}
async function deleteProject() {
  if (!(await confirm('Удалить проект?', `«${project().name}» будет удалён безвозвратно.`, { ok: 'Удалить' }))) return;
  closeAllTabs();
  await ws.remove(ws.currentId);
  host.project = project();
  bindProject();
  renderAll();
  device.home();
}

async function importFile() {
  const [f] = await pickFiles({ accept: '.nob,.apk,.zip' });
  if (!f) return;
  try {
    await importBytes(new Uint8Array(await f.arrayBuffer()), f.name);
  } catch (e) {
    toast('Не удалось открыть: ' + e.message, 'err');
  }
}

async function importBytes(bytes, filename) {
  const entries = await zipRead(bytes);
  const names = new Set(entries.map((e) => e.path));
  const base = filename.replace(/\.[^.]+$/, '');
  let files;
  let manifest;
  if (names.has('META/NOB')) {
    const r = await readNob(bytes);
    if (!r.manifest) throw new Error(r.errors.join('; '));
    if (!r.ok && !(await confirm('Пакет не прошёл проверку', r.errors.slice(0, 4).join('\n') + '\n\nОткрыть как проект без проверки?', { ok: 'Открыть' }))) return;
    files = r.files;
    delete files[NOODLE_BYTECODE]; // байткод — производный файл, пересоберётся из исходников
    manifest = r.manifest;
  } else if (names.has('assets/www/noodle-system/manifest.json')) {
    manifest = JSON.parse(fromUtf8(entries.find((e) => e.path === 'assets/www/noodle-system/manifest.json').data));
    files = {};
    for (const e of entries) {
      if (!e.path.startsWith('assets/www/') || e.path.startsWith('assets/www/noodle-system/')) continue;
      let d = e.data;
      if (e.path.endsWith('.html')) d = utf8(stripInjected(fromUtf8(d)));
      files[e.path.slice('assets/www/'.length)] = d;
    }
  } else if (names.has('manifest.json')) {
    files = {};
    for (const e of entries) files[e.path] = e.data;
    manifest = JSON.parse(fromUtf8(files['manifest.json']));
    delete files['manifest.json'];
  } else throw new Error('в архиве нет manifest.json — это не проект Noodle');
  const p = Project.fromFiles(manifest.name || base, files, manifest);
  openProject(p, true);
  toast(`Открыт проект «${p.name}» (${Object.keys(files).length} файлов)`);
}

// ───────────────────────────── проводник ─────────────────────────────

const scheduleExplorer = debounce(() => {
  if (S.view === 'files') renderExplorerTree();
}, 80);

function buildTree(p) {
  const root = { name: '', path: '', dir: true, kids: new Map() };
  const addDir = (parts) => {
    let n = root;
    parts.forEach((seg, i) => {
      if (!n.kids.has(seg)) n.kids.set(seg, { name: seg, path: parts.slice(0, i + 1).join('/'), dir: true, kids: new Map() });
      n = n.kids.get(seg);
    });
    return n;
  };
  for (const d of p.dirs) addDir(d.split('/'));
  for (const f of p.paths()) {
    const parts = f.split('/');
    const dir = addDir(parts.slice(0, -1));
    dir.kids.set(parts.at(-1), { name: parts.at(-1), path: f, dir: false });
  }
  return root;
}

function fileIcon(path) {
  return icon('file', 15);
}

function renderExplorerTree() {
  const box = $('tree');
  if (!box) return;
  const p = project();
  const rows = [];
  const walk = (node, depth) => {
    const kids = [...node.kids.values()].sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
    for (const k of kids) {
      const open = S.expanded.has(k.path);
      const row = h('div.row' + (S.selected === k.path || (!k.dir && S.active === k.path) ? '.sel' : ''), {
        style: { paddingLeft: 8 + depth * 14 + 'px' },
        role: 'treeitem',
        'data-path': k.path,
        onclick: () => {
          S.selected = k.path;
          if (k.dir) {
            open ? S.expanded.delete(k.path) : S.expanded.add(k.path);
            prefs.set('expanded', [...S.expanded]);
            renderExplorerTree();
          } else {
            openFile(k.path);
            if (narrow.matches) document.body.classList.add('side-off');
          }
        },
      },
        h('span.chev' + (k.dir && open ? '.open' : ''), k.dir ? icon('chevron', 12) : null),
        h('span.ico', k.dir ? icon('folder', 15) : fileIcon(k.path)),
        h('span.nm', k.name),
        h('span.ra',
          h('button.ib', { title: 'Переименовать', 'aria-label': 'Переименовать', onclick: (e) => { e.stopPropagation(); renameEntry(k); } }, icon('edit', 13)),
          h('button.ib', { title: 'Удалить', 'aria-label': 'Удалить', onclick: (e) => { e.stopPropagation(); deleteEntry(k); } }, icon('trash', 13)),
        ),
      );
      rows.push(row);
      if (k.dir && open) walk(k, depth + 1);
    }
  };
  walk(buildTree(p), 0);
  box.replaceChildren(...(rows.length ? rows : [h('div.empty-note', 'Проект пуст. Создайте файл кнопкой выше.')]));
}

function targetDir() {
  const s = S.selected;
  if (!s) return '';
  if (project().has(s)) return s.includes('/') ? s.slice(0, s.lastIndexOf('/')) : '';
  return s;
}

async function newFile() {
  const dir = targetDir();
  const name = await prompt('Новый файл', { value: dir ? dir + '/' : '', placeholder: 'путь/имя.расширение', ok: 'Создать' });
  if (!name) return;
  try {
    if (project().has(name)) return openFile(name);
    project().write(name, '');
    openFile(name);
  } catch (e) {
    toast(e.message, 'err');
  }
}
async function newFolder() {
  const dir = targetDir();
  const name = await prompt('Новая папка', { value: dir ? dir + '/' : '', ok: 'Создать' });
  if (!name) return;
  try {
    project().mkdir(name.replace(/\/+$/, ''));
    S.expanded.add(name.replace(/\/+$/, ''));
  } catch (e) {
    toast(e.message, 'err');
  }
}
async function uploadFiles() {
  const files = await pickFiles({ multiple: true });
  const dir = targetDir();
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const path = (dir ? dir + '/' : '') + f.name;
    project().write(path, isTextPath(f.name) ? fromUtf8(bytes) : bytes);
  }
  if (files.length) toast(`Загружено файлов: ${files.length}`);
}
async function renameEntry(k) {
  const to = await prompt('Переименовать', { value: k.path, ok: 'Переименовать' });
  if (!to || to === k.path) return;
  try {
    if (k.dir) {
      project().renameDir(k.path, to);
      if (S.expanded.delete(k.path)) S.expanded.add(to);
    } else project().rename(k.path, to);
    S.selected = to;
  } catch (e) {
    toast(e.message, 'err');
  }
}
async function deleteEntry(k) {
  if (k.path === 'manifest.json') return toast('manifest.json удалить нельзя', 'err');
  if (!(await confirm('Удалить?', `«${k.path}»${k.dir ? ' и всё внутри' : ''} будет удалён.`, { ok: 'Удалить' }))) return;
  k.dir ? project().deleteDir(k.path) : project().delete(k.path);
  S.selected = null;
}

function paneHead(title, ...acts) {
  return h('div.pane-head', h('span', title), h('div.acts', ...acts));
}

function viewFiles() {
  return [
    paneHead(project().name,
      h('button.ib', { title: 'Новый файл', 'aria-label': 'Новый файл', onclick: newFile }, icon('newfile', 16)),
      h('button.ib', { title: 'Новая папка', 'aria-label': 'Новая папка', onclick: newFolder }, icon('newfolder', 16)),
      h('button.ib', { title: 'Загрузить файлы', 'aria-label': 'Загрузить файлы', onclick: uploadFiles }, icon('upload', 16)),
      h('button.ib', { title: 'Свернуть всё', 'aria-label': 'Свернуть всё', onclick: () => { S.expanded.clear(); prefs.set('expanded', []); renderExplorerTree(); } }, icon('collapse', 16)),
    ),
    h('div.pane-body', h('div.tree', { id: 'tree', role: 'tree' })),
  ];
}

// ───────────────────────────── поиск ─────────────────────────────

function viewSearch() {
  const q = h('input', { type: 'search', id: 'search-q', placeholder: 'Поиск по проекту', value: S.searchQ, 'aria-label': 'Поиск', spellcheck: false });
  const out = h('div.pane-body', { id: 'search-out' });
  const doSearch = () => {
    S.searchQ = q.value;
    out.replaceChildren();
    const needle = S.searchCase ? q.value : q.value.toLowerCase();
    if (!needle) return;
    let total = 0;
    for (const f of project().paths()) {
      const v = project().read(f);
      if (typeof v !== 'string') continue;
      const hits = [];
      v.split('\n').forEach((line, i) => {
        const hay = S.searchCase ? line : line.toLowerCase();
        const at = hay.indexOf(needle);
        if (at >= 0 && total < 500) {
          hits.push({ line: i + 1, at, text: line });
          total++;
        }
      });
      if (!hits.length) continue;
      out.append(h('div.s-file', icon('file', 14), f, h('span', { style: { color: 'var(--dim)', fontWeight: 400 } }, hits.length)));
      for (const hit of hits) {
        const a = hit.text.slice(Math.max(0, hit.at - 24), hit.at);
        const m = hit.text.slice(hit.at, hit.at + needle.length);
        const b = hit.text.slice(hit.at + needle.length, hit.at + needle.length + 60);
        out.append(h('div.s-hit', { onclick: () => { openFile(f, hit.line, hit.at + 1); if (narrow.matches) document.body.classList.add('side-off'); } }, hit.line + '  ' + a.trimStart(), h('mark', m), b));
      }
    }
    if (!total) out.append(h('div.empty-note', 'Ничего не найдено'));
  };
  q.addEventListener('input', debounce(doSearch, 120));
  const cs = h('button.ib' + (S.searchCase ? '.on' : ''), { title: 'Учитывать регистр', 'aria-label': 'Учитывать регистр', onclick: (e) => { S.searchCase = !S.searchCase; e.currentTarget.classList.toggle('on', S.searchCase); doSearch(); } }, h('span', { style: { font: '600 12px var(--mono)' } }, 'Aa'));
  setTimeout(() => { q.value && doSearch(); }, 0);
  return [paneHead('Поиск'), h('div', { style: { padding: '0 12px 8px', display: 'flex', gap: '6px' } }, q, cs), out];
}

// ───────────────────────────── редактор ─────────────────────────────

function renderTabs() {
  const box = $('tabs');
  box.replaceChildren(
    ...S.tabs.map((t) =>
      h('div.tab' + (t.path === S.active ? '.on' : ''), { role: 'tab', 'aria-selected': t.path === S.active, title: t.path, onclick: () => activate(t.path), onauxclick: (e) => e.button === 1 && closeTab(t.path) },
        h('span', t.path.split('/').at(-1)),
        h('span.x', { role: 'button', 'aria-label': 'Закрыть вкладку', onclick: (e) => { e.stopPropagation(); closeTab(t.path); } }, icon('close', 12)),
      ),
    ),
  );
  box.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const c = $('crumbs');
  c.replaceChildren(...(S.active ? S.active.split('/').flatMap((s, i, a) => (i ? [h('span', '›'), h(i === a.length - 1 ? 'b' : 'span', s)] : [h(i === a.length - 1 ? 'b' : 'span', s)])) : []));
}

function openFile(path, line, col) {
  const p = project();
  if (!p.has(path)) return toast('Файл не найден: ' + path, 'err');
  let t = S.tabs.find((x) => x.path === path);
  if (!t) {
    t = { path, editor: null, view: null };
    const v = p.read(path);
    if (typeof v === 'string') {
      t.editor = new CodeEditor({
        text: v,
        lang: langOf(path),
        onChange: (text) => {
          p.write(t.path, text, { origin: 'editor' });
        },
        onCursor: (c) => {
          if (S.active === t.path) $('sb-cur').textContent = `Стр ${c.line}, стлб ${c.col}` + (c.sel ? ` (${c.sel})` : '');
        },
      });
      t.editor.el.hidden = true;
      $('editor-host').append(t.editor.el);
    } else {
      t.view = binaryView(path, v);
      t.view.hidden = true;
      $('editor-host').append(t.view);
    }
    S.tabs.push(t);
  }
  activate(path);
  if (line && t.editor) t.editor.goto(line, col || 1);
}

function binaryView(path, bytes) {
  const isImg = /\.(png|jpe?g|gif|webp|ico)$/i.test(path);
  const url = isImg ? URL.createObjectURL(new Blob([bytes], { type: mimeOf(path) })) : null;
  return h('div.binary-view', h('div', isImg ? h('img', { src: url, alt: path }) : null, h('p', `${path} — бинарный файл, ${fmtBytes(bytes.length)}`)));
}

function activate(path) {
  S.active = path;
  S.selected = path;
  for (const t of S.tabs) {
    const el = t.editor ? t.editor.el : t.view;
    el.hidden = t.path !== path;
  }
  const t = S.tabs.find((x) => x.path === path);
  $('welcome')?.remove();
  renderTabs();
  if (S.view === 'files') renderExplorerTree();
  $('sb-lang').textContent = t?.editor ? { js: 'JavaScript', json: 'JSON', css: 'CSS', html: 'HTML', md: 'Markdown', nui: 'Noodle UI', kt: 'Kotlin', swift: 'Swift', dart: 'Dart', yaml: 'YAML', text: 'Текст' }[t.editor.lang] || t.editor.lang : '';
  if (t?.editor && !narrow.matches) t.editor.focus();
  if (t?.editor) t.editor.cursor();
  else $('sb-cur').textContent = '';
}

function closeTab(path, silent) {
  const i = S.tabs.findIndex((x) => x.path === path);
  if (i < 0) return;
  const [t] = S.tabs.splice(i, 1);
  t.editor ? t.editor.destroy() : t.view.remove();
  if (S.active === path) {
    const n = S.tabs[Math.min(i, S.tabs.length - 1)];
    S.active = null;
    if (n) activate(n.path);
  }
  if (!S.tabs.length) showWelcome();
  renderTabs();
  void silent;
}
function closeAllTabs() {
  for (const t of S.tabs) t.editor ? t.editor.destroy() : t.view.remove();
  S.tabs = [];
  S.active = null;
}
function showWelcome() {
  if ($('welcome')) return;
  $('editor-host').append(
    h('div.welcome', { id: 'welcome' },
      h('div', h('h2', 'Noodle Studio'), h('p', 'Откройте файл слева или создайте новый.'),
        h('div.kbd-list',
          h('span', 'Быстро открыть файл'), h('span', h('kbd', 'Ctrl'), ' ', h('kbd', 'P')),
          h('span', 'Команды'), h('span', h('kbd', 'Ctrl'), ' ', h('kbd', 'Shift'), ' ', h('kbd', 'P')),
          h('span', 'Запустить'), h('span', h('kbd', 'Ctrl'), ' ', h('kbd', 'Enter')),
          h('span', 'Собрать пакет'), h('span', h('kbd', 'Ctrl'), ' ', h('kbd', 'Shift'), ' ', h('kbd', 'B')),
        ))),
  );
}

// ───────────────────────────── нижняя панель ─────────────────────────────

function renderBottom() {
  const box = $('bottom');
  if (!box) return;
  const probs = allProblems();
  const errs = S.logs.filter((l) => l.level === 'error').length;
  const tab = (id, label, n) => h('button.bot-tab' + (S.bottomTab === id ? '.on' : ''), { onclick: () => setBottom(id) }, label, n ? h('span.n', n) : null);
  const list = S.bottomTab === 'console' ? S.logs : S.bottomTab === 'output' ? S.output : null;
  const body = h('div.bot-body', { id: 'bot-body' });
  if (list) {
    if (!list.length) body.append(h('div.bot-empty', S.bottomTab === 'console' ? 'Консоль приложения пуста. Запустите приложение — console.log попадёт сюда.' : 'Здесь появится журнал сборки.'));
    for (const l of list) body.append(h('div.log.' + l.level, h('span.lv', { 'aria-hidden': 'true' }, { error: 'ERR', warn: 'WARN', info: 'INFO', log: 'LOG', debug: 'DBG' }[l.level] || 'LOG'), h('span', l.text)));
  } else {
    if (!probs.length) body.append(h('div.bot-empty', 'Проблем не найдено.'));
    for (const x of probs) body.append(h('div.log.click.' + (x.severity === 'error' ? 'error' : 'warn'), { onclick: () => openFile(x.path, x.line, x.col) }, h('span.lv', x.severity === 'error' ? 'ERR' : 'WARN'), h('span', x.text), h('span.src', x.path)));
  }
  box.replaceChildren(
    h('div.bot-tabs', tab('console', 'Консоль', errs), tab('output', 'Журнал'), tab('problems', 'Проблемы', probs.filter((x) => x.severity === 'error').length),
      h('div.tb-spacer'),
      h('button.ib', { title: 'Очистить', 'aria-label': 'Очистить', onclick: () => { if (S.bottomTab === 'console') S.logs = []; if (S.bottomTab === 'output') S.output = []; renderBottom(); } }, icon('trash', 14)),
      h('button.ib', { title: 'Скрыть панель', 'aria-label': 'Скрыть панель', onclick: () => { document.body.classList.add('bot-off'); prefs.set('botOff', true); } }, icon('close', 14)),
    ),
    body,
  );
  body.scrollTop = body.scrollHeight;
}

function allProblems() {
  const out = project().problems();
  for (const d of S.diags) out.push({ path: d.file, severity: 'error', text: `${d.line}:${d.col}  ${d.msg}`, line: d.line, col: d.col });
  return out;
}

function updateStatus() {
  const p = project();
  if (!p || !$('proj-btn')) return;
  $('proj-btn').firstChild.textContent = p.name;
  const m = p.manifest().value;
  $('sb-proj').textContent = `${p.name} · ${STACKS[m?.stack || 'noodle'] || m?.stack}`;
  const pr = allProblems();
  const e = pr.filter((x) => x.severity === 'error').length;
  const w = pr.length - e;
  $('sb-prob').textContent = `✕ ${e}  ! ${w}`;
  $('sb-key').textContent = 'ключ: ' + (prefs.get('signkey', null)?.keyId || 'нет');
  $('pv-title').textContent = device.current ? device.current.manifest.name : 'Noodle.OS';
  if (document.getElementById('bot-body') && S.bottomTab === 'problems') renderBottom();
}

// ───────────────────────────── запуск ─────────────────────────────

async function run({ quiet } = {}) {
  const p = project();
  const mr = p.manifest();
  if (mr.error || !mr.value) {
    setBottom('problems', true);
    return toast('manifest.json не читается: ' + (mr.error || 'пусто'), 'err');
  }
  if (!quiet) {
    logConsole({ level: 'info', text: `— запуск «${mr.value.name}» —`, source: 'studio' });
    togglePreview(true);
  }
  await device.launch({ manifest: mr.value, files: p.files, live: true });
  $('pv-title').textContent = mr.value.name;
}

// ───────────────────────────── ключ, сборка, установка ─────────────────────────────

async function getKey(create = true) {
  let k = prefs.get('signkey', null);
  if (!k && create) {
    k = await generateKey();
    prefs.set('signkey', k);
    logOut(`создан ключ подписи ${k.keyId}`);
    updateStatus();
  }
  return k;
}

function manifestOrFail() {
  const m = project().manifest();
  if (m.error) {
    toast('manifest.json: ' + m.error, 'err');
    setBottom('problems', true);
    return null;
  }
  return m.value;
}

async function buildPackage() {
  const m = manifestOrFail();
  if (!m) return null;
  if (NATIVE_STACKS.includes(m.stack)) {
    toast(`Стек «${STACKS[m.stack]}» собирается в APK: экспортируйте проект`, 'err');
    return null;
  }
  const files = project().buildFiles();
  if ((m.stack || 'noodle') === 'noodle') {
    const c = await compileProject();
    if (!c.ok) {
      c.diags.forEach((d) => logOut(`${d.file}:${d.line}:${d.col}  ${d.msg}`, 'error'));
      setBottom('problems', true);
      toast(`Сборка остановлена: ошибок в коде — ${c.diags.length}`, 'err');
      return null;
    }
    files[NOODLE_BYTECODE] = c.bytes;
    logOut(`компиляция: ${names0(files)} файл(ов) → ${NOODLE_BYTECODE} (${fmtBytes(c.bytes.length)})`);
  }
  const key = await getKey();
  try {
    const { bytes, report } = await buildNob(m, files, key);
    const name = `${m.id}-${m.version}.nob`;
    S.lastBuild = { name, bytes, report, time: Date.now() };
    logOut(`✔ ${name}: ${report.files} файлов, ${fmtBytes(report.rawSize)} → ${fmtBytes(report.size)}, sha256 ${report.sha256.slice(0, 16)}…, ключ ${report.keyId}`);
    return S.lastBuild;
  } catch (e) {
    logOut(e.message, 'error');
    setBottom('output', true);
    toast('Сборка не удалась — см. журнал', 'err');
    return null;
  }
}

const names0 = (files) => Object.keys(files).filter((f) => /\.(nui|ns)$/.test(f)).length;

async function buildAction() {
  const b = await buildPackage();
  if (!b) return;
  download(b.name, b.bytes);
  toast(`Собрано: ${b.name} (${fmtBytes(b.bytes.length)})`);
  if (S.view === 'package') renderSidebar();
}

async function installBytes(bytes) {
  const r = await readNob(bytes);
  if (!r.ok) throw new Error('пакет не прошёл проверку: ' + r.errors[0]);
  await store.set('app:' + r.manifest.id, { bytes, installedAt: Date.now() });
  await refreshInstalled();
  logOut(`установлено: ${r.manifest.name} ${r.manifest.version} (подпись ${r.keyId} проверена)`);
  return r.manifest;
}

async function installAction() {
  const b = await buildPackage();
  if (!b) return;
  try {
    const m = await installBytes(b.bytes);
    togglePreview(true);
    device.home();
    toast(`«${m.name}» установлено в симулятор`);
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function refreshInstalled() {
  const keys = await store.keys('app:');
  const list = [];
  for (const k of keys) {
    const rec = await store.get(k);
    if (!rec) continue;
    const r = await readNob(rec.bytes);
    if (!r.manifest) continue;
    const files = new Map();
    for (const [pth, d] of Object.entries(r.files)) files.set(pth, isTextPath(pth) ? fromUtf8(d) : d);
    const ic = r.manifest.icon && r.files[r.manifest.icon];
    const app = {
      manifest: r.manifest,
      size: rec.bytes.length,
      signed: r.signed,
      keyId: r.keyId,
      bytes: rec.bytes,
      iconUrl: ic ? URL.createObjectURL(new Blob([ic], { type: mimeOf(r.manifest.icon) })) : null,
      launch: () => device.launch({ manifest: r.manifest, files, nbc: r.files[NOODLE_BYTECODE] }),
    };
    list.push(app);
  }
  S.installed = list.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  device.setInstalled(S.installed);
  if (S.view === 'package') renderSidebar();
}

async function exportAndroid() {
  const m = manifestOrFail();
  if (!m) return;
  if ((m.stack || 'noodle') !== 'web') return exportSource();
  try {
    const proj = androidProject(m, project().buildFiles(), await loadRuntime());
    const entries = Object.keys(proj).sort().map((path) => ({ path, data: typeof proj[path] === 'string' ? utf8(proj[path]) : proj[path] }));
    const bytes = await zipWrite(entries);
    const where = download(`${m.id}-android-project.zip`, bytes, 'application/zip');
    logOut(`Android-проект: ${entries.length} файлов → ${where}. Дальше: распаковать и выполнить «gradle assembleDebug».`);
    toast('Android-проект сохранён');
  } catch (e) {
    logOut(e.message, 'error');
    setBottom('output', true);
    toast('Не удалось собрать Android-проект — см. журнал', 'err');
  }
}

async function exportSource() {
  const p = project();
  const entries = [{ path: 'manifest.json', data: utf8(p.readText('manifest.json') ?? '{}') }];
  for (const [path, v] of p.files) if (path !== 'manifest.json') entries.push({ path, data: typeof v === 'string' ? utf8(v) : v });
  const bytes = await zipWrite(entries);
  download(`${slug(p.name)}-source.zip`, bytes, 'application/zip');
  toast('Исходники сохранены');
}

// ───────────────────────────── панель «Пакет» ─────────────────────────────

const schedulePackage = debounce(() => S.view === 'package' && renderSidebar(), 250);

function writeManifest(mutate) {
  const r = project().manifest();
  if (r.error) return toast('Исправьте manifest.json: ' + r.error, 'err');
  const m = structuredClone(r.value);
  mutate(m);
  project().write('manifest.json', JSON.stringify(m, null, 2) + '\n');
  const t = S.tabs.find((x) => x.path === 'manifest.json');
  t && t.editor && t.editor.setValue(project().readText('manifest.json'));
}

function viewPackage() {
  const p = project();
  const mr = p.manifest();
  const m = mr.value;
  const out = [paneHead('Пакет и сборка')];
  const body = h('div.pane-body');
  out.push(body);
  if (mr.error || !m) {
    body.append(h('div.sec-b', h('div.msg.err', 'manifest.json повреждён: ' + (mr.error || 'пусто')), h('button.btn', { onclick: () => openFile('manifest.json') }, 'Открыть manifest.json')));
    return out;
  }
  const native = NATIVE_STACKS.includes(m.stack);
  const stack = m.stack || 'noodle';
  const field = (label, el, hint) => h('div.field', h('label', label), el, hint ? h('div.hint', hint) : null);
  const inp = (key, type = 'text', conv = (v) => v) => h('input', { type, value: String(m[key] ?? ''), spellcheck: false, onchange: (e) => writeManifest((x) => { x[key] = conv(e.target.value); }) });

  const form = h('div.sec-b',
    field('Стек', h('select', { onchange: (e) => changeStack(e.target.value) }, Object.entries(STACKS).map(([k, v]) => h('option', { value: k, selected: k === stack }, v))), native ? 'Нативный проект: превью в браузере недоступно.' : null),
    field('Название', inp('name')),
    field('ID пакета', inp('id'), 'com.company.app — строчные латинские'),
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } }, field('Версия', inp('version')), field('versionCode', inp('versionCode', 'number', (v) => parseInt(v, 10) || 1))),
  );
  if (!native) {
    const ext = stack === 'noodle' ? /\.nui$/ : /\.html?$/;
    form.append(
      field('Точка входа', h('select', { onchange: (e) => writeManifest((x) => { x.entry = e.target.value; }) }, p.paths().filter((f) => ext.test(f)).map((f) => h('option', { value: f, selected: f === m.entry }, f)))),
      field('Иконка', h('select', { onchange: (e) => writeManifest((x) => { if (e.target.value) x.icon = e.target.value; else delete x.icon; }) }, [h('option', { value: '' }, '(по умолчанию)'), ...p.paths().filter((f) => /\.(svg|png)$/i.test(f)).map((f) => h('option', { value: f, selected: f === m.icon }, f))])),
      field('Ориентация', h('select', { onchange: (e) => writeManifest((x) => { x.window = { ...(x.window || {}), orientation: e.target.value }; }) }, ORIENTATIONS.map((o) => h('option', { value: o, selected: o === (m.window?.orientation || 'auto') }, o)))),
      field('Цвет фона', h('input', { type: 'text', value: m.window?.background || '#000000', spellcheck: false, onchange: (e) => writeManifest((x) => { x.window = { ...(x.window || {}), background: e.target.value }; }) })),
    );
  }
  form.append(
    h('div.field', h('label', 'Разрешения'), h('div.checks', Object.entries(PERMISSIONS).map(([k, d]) => h('label.chk', h('input', { type: 'checkbox', checked: (m.permissions || []).includes(k), onchange: (e) => writeManifest((x) => { const s = new Set(x.permissions || []); e.target.checked ? s.add(k) : s.delete(k); x.permissions = [...s]; }) }), h('span', k, h('small', d)))))),
  );
  body.append(h('div.sec', h('div.sec-h', 'Манифест'), form));

  const pr = p.problems().filter((x) => x.severity === 'error');
  const build = h('div.sec-b');
  if (pr.length) build.append(h('div.msg.err', `Ошибок: ${pr.length}. `, pr[0].text));
  else build.append(h('div.msg', 'Проект готов к сборке.'));
  if (!native) {
    build.append(
      h('div.btn-row', { style: { marginBottom: '8px' } },
        h('button.btn.primary', { onclick: buildAction }, icon('download', 14), 'Собрать .nob'),
        h('button.btn', { onclick: installAction }, icon('app', 14), 'Установить в симулятор')),
      h('div.btn-row', stack === 'web' ? h('button.btn', { onclick: exportAndroid }, 'Android-проект (.zip)') : null, h('button.btn', { onclick: exportSource }, 'Исходники (.zip)')),
    );
  } else {
    build.append(h('div.btn-row', h('button.btn.primary', { onclick: exportSource }, icon('download', 14), 'Исходники проекта (.zip)')));
  }
  if (S.lastBuild) {
    const r = S.lastBuild.report;
    build.append(h('dl.kv', { style: { marginTop: '12px' } }, h('dt', 'Файл'), h('dd', S.lastBuild.name), h('dt', 'Размер'), h('dd', `${fmtBytes(r.size)} (файлов: ${r.files})`), h('dt', 'SHA-256'), h('dd', r.sha256), h('dt', 'Ключ'), h('dd', r.keyId)));
  }
  body.append(h('div.sec', h('div.sec-h', 'Сборка'), build));

  const cli = {
    noodle: ['node tools/nob.mjs init my-app --template noodle-counter', 'node tools/nob.mjs check my-app', 'node tools/nob.mjs build my-app      # → .nob с байткодом', 'noodle run my-app                  # нативное окно (runtime/)'],
    web: ['node tools/nob.mjs init my-app --template counter', 'node tools/nob.mjs build my-app', 'node tools/nob.mjs apk my-app'],
    kotlin: ['node tools/nob.mjs init my-app --template kotlin', 'ANDROID_HOME=~/Android/Sdk node tools/nob.mjs apk my-app'],
    flutter: ['node tools/nob.mjs init my-app --template flutter', 'node tools/nob.mjs apk my-app   # нужен Flutter SDK'],
    swift: ['brew install xcodegen', 'xcodegen generate', 'xcodebuild -scheme NoodleSwift build'],
  }[stack];
  body.append(h('div.sec', h('div.sec-h', 'Из терминала'), h('div.sec-b', h('div.pre-log', cli.join('\n')), h('div.btn-row', { style: { marginTop: '8px' } }, h('button.btn', { onclick: () => { navigator.clipboard?.writeText(cli.join('\n')); toast('Скопировано'); } }, 'Копировать')))));

  const key = prefs.get('signkey', null);
  body.append(h('div.sec', h('div.sec-h', 'Подпись'), h('div.sec-b',
    h('dl.kv', h('dt', 'Ключ'), h('dd', key ? key.keyId : 'будет создан при первой сборке')),
    h('div.btn-row', { style: { marginTop: '10px' } },
      h('button.btn', { onclick: async () => { if (key && !(await confirm('Новый ключ?', 'Старые пакеты останутся валидными, но обновления должны подписываться тем же ключом.', { ok: 'Создать' }))) return; prefs.set('signkey', null); await getKey(); renderSidebar(); } }, 'Новый ключ'),
      key ? h('button.btn', { onclick: () => download('noodle-key.json', JSON.stringify(key, null, 2), 'application/json') }, 'Экспорт') : null,
      h('button.btn', { onclick: async () => { const [f] = await pickFiles({ accept: '.json' }); if (!f) return; try { const k = JSON.parse(await f.text()); if (!k.privateKey || !k.publicKey) throw new Error('это не файл ключа'); prefs.set('signkey', k); updateStatus(); renderSidebar(); } catch (e) { toast(e.message, 'err'); } } }, 'Импорт')),
    h('p', { style: { color: 'var(--dim)', fontSize: '12px' } }, 'Приватный ключ хранится в этом браузере. Экспортируйте его, чтобы подписывать обновления с другого устройства.'))));

  const inst = h('div.list');
  if (!S.installed.length) inst.append(h('div.li', h('div.grow', { style: { color: 'var(--dim)' } }, 'Ничего не установлено')));
  for (const a of S.installed) {
    inst.append(h('div.li', h('div.grow', a.manifest.name, h('small', `${a.manifest.version} · ${fmtBytes(a.size)} · ${a.signed ? 'подпись ' + a.keyId : 'без подписи'}`)),
      h('button.ib', { title: 'Запустить', 'aria-label': 'Запустить', onclick: () => { togglePreview(true); a.launch(); } }, icon('play', 14)),
      h('button.ib', { title: 'Скачать .nob', 'aria-label': 'Скачать .nob', onclick: () => download(`${a.manifest.id}-${a.manifest.version}.nob`, a.bytes) }, icon('download', 14)),
      h('button.ib', { title: 'Удалить', 'aria-label': 'Удалить', onclick: async () => { await store.del('app:' + a.manifest.id); await device.clearAppData(a.manifest.id); await refreshInstalled(); } }, icon('trash', 14))));
  }
  body.append(h('div.sec', h('div.sec-h', 'Установлено в симулятор'), inst, h('div.sec-b', h('div.btn-row', h('button.btn', { onclick: installFromFile }, 'Установить .nob из файла…')))));
  return out;
}

async function installFromFile() {
  const [f] = await pickFiles({ accept: '.nob' });
  if (!f) return;
  try {
    const m = await installBytes(new Uint8Array(await f.arrayBuffer()));
    toast(`«${m.name}» установлено`);
    togglePreview(true);
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function changeStack(stack) {
  if (!(await confirm('Сменить стек?', `Изменится поле stack в manifest.json на «${STACKS[stack]}». Файлы проекта не меняются — для нового стека обычно нужен другой шаблон (меню проектов → Новый проект).`, { ok: 'Сменить' }))) return renderSidebar();
  writeManifest((m) => {
    m.stack = stack;
    if (stack === 'noodle' && !String(m.entry).endsWith('.nui')) m.entry = project().paths().find((f) => f.endsWith('.nui')) || 'app.nui';
    if (stack === 'web' && !String(m.entry).endsWith('.html')) m.entry = project().paths().find((f) => f.endsWith('.html')) || 'index.html';
  });
  renderSidebar();
}

// ───────────────────────────── настройки ─────────────────────────────

function aiCfg() {
  return { provider: 'anthropic', base: PROVIDERS.anthropic.base, key: '', model: PROVIDERS.anthropic.model, extra: '', ...prefs.get('ai', {}) };
}

function viewSettings() {
  const c = aiCfg();
  const save = () => prefs.set('ai', c);
  const dl = h('datalist', { id: 'models' });
  const f = (label, el, hint) => h('div.field', h('label', label), el, hint ? h('div.hint', hint) : null);
  const base = h('input', { type: 'text', value: c.base, spellcheck: false, placeholder: 'https://…', onchange: (e) => { c.base = e.target.value.trim(); save(); } });
  const model = h('input', { type: 'text', value: c.model, list: 'models', spellcheck: false, placeholder: 'название модели', onchange: (e) => { c.model = e.target.value.trim(); save(); } });
  const key = h('input', { type: 'password', value: c.key, autocomplete: 'off', spellcheck: false, placeholder: 'ключ API', onchange: (e) => { c.key = e.target.value.trim(); save(); } });
  const sel = h('select', { onchange: (e) => { const pr = PROVIDERS[e.target.value]; c.provider = e.target.value; c.base = pr.base; c.model = pr.model; base.value = c.base; model.value = c.model; save(); } }, Object.entries(PROVIDERS).map(([k, v]) => h('option', { value: k, selected: k === c.provider }, v.label)));
  const status = h('div.hint');
  const fontSel = h('select', { onchange: (e) => { prefs.set('fontSize', +e.target.value); applyFont(); } }, [12, 13, 14, 15, 16, 18].map((n) => h('option', { value: n, selected: n === prefs.get('fontSize', 13) }, n + ' px')));
  return [
    paneHead('Настройки'),
    h('div.pane-body',
      h('div.sec', h('div.sec-h', 'ИИ-провайдер'), h('div.sec-b',
        f('Провайдер', sel, 'Любой OpenAI-совместимый API или Claude.'),
        f('Адрес API', base),
        f('Ключ API', key, 'Хранится только на этом устройстве (localStorage) и уходит только провайдеру.'),
        f('Модель', model), dl,
        f('Инструкции агенту', h('textarea.fld', { rows: 3, value: c.extra, placeholder: 'Например: «всегда пиши комментарии по-русски»', onchange: (e) => { c.extra = e.target.value; save(); } })),
        h('div.btn-row',
          h('button.btn', { onclick: async () => { status.textContent = 'Запрашиваю список моделей…'; try { const ms = await listModels({ kind: PROVIDERS[c.provider].kind, base: c.base, key: c.key }); dl.replaceChildren(...ms.map((m) => h('option', { value: m }))); status.textContent = `Моделей: ${ms.length}. Начните вводить название.`; } catch (e) { status.textContent = 'Ошибка: ' + e.message; } } }, 'Получить модели'),
        ),
        status)),
      h('div.sec', h('div.sec-h', 'Редактор'), h('div.sec-b', f('Размер шрифта', fontSel))),
      h('div.sec', h('div.sec-h', 'Данные'), h('div.sec-b',
        h('div.btn-row',
          h('button.btn', { onclick: async () => { if (await confirm('Сбросить Studio?', 'Все проекты, установленные приложения и ключ будут удалены.', { ok: 'Сбросить' })) { for (const k of await store.keys('')) await store.del(k); localStorage.clear(); location.reload(); } } }, 'Сбросить всё')),
        h('p', { style: { color: 'var(--dim)', fontSize: '12px' } }, 'Noodle Studio 1.0 · формат .nob v1'))),
    ),
  ];
}
function applyFont() {
  const n = prefs.get('fontSize', 13);
  document.documentElement.style.setProperty('--ed-size', n + 'px');
  document.documentElement.style.setProperty('--ed-lh', Math.round(n * 1.55) + 'px');
}

// ───────────────────────────── агент ─────────────────────────────

let agentUI = null;

function mdLite(text) {
  const parts = text.split(/```(?:\w+)?\n?([\s\S]*?)```/g);
  const box = h('div.body');
  parts.forEach((part, i) => {
    if (i % 2) box.append(h('pre', h('code', part.replace(/\n$/, ''))));
    else if (part) {
      const span = h('span');
      span.innerHTML = esc(part).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
      box.append(span);
    }
  });
  return box;
}

function agentPanel() {
  if (agentUI) return agentUI.root;
  const chat = h('div.chat', { id: 'chat', role: 'log', 'aria-live': 'polite' });
  const ta = h('textarea', { id: 'agent-input', placeholder: 'Что сделать? Например: «добавь тёмный/светлый режим» или «исправь ошибку в консоли»', rows: 3, 'aria-label': 'Сообщение агенту' });
  const meta = h('span.meta', { id: 'agent-meta' });
  const sendBtn = h('button.btn.primary', { id: 'agent-send', onclick: () => sendAgent() }, icon('send', 14), 'Отправить');
  const revert = h('button.ib', { id: 'agent-revert', title: 'Откатить изменения агента', 'aria-label': 'Откатить изменения агента', disabled: true, onclick: revertAgent }, icon('undo', 15));
  const clear = h('button.ib', { title: 'Новый диалог', 'aria-label': 'Новый диалог', onclick: () => { if (S.agentBusy) return; agentUI.history = {}; chat.replaceChildren(intro()); } }, icon('plus', 16));
  const intro = () => h('div.m', h('div.who', 'Агент'), h('div.body', 'Опишите задачу — я сам прочитаю файлы, внесу правки и проверю запуском. Подключите ИИ в «Настройках» (любой OpenAI-совместимый API или Claude).'));
  chat.append(intro());
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendAgent();
    }
  });
  agentUI = { chat, ta, meta, sendBtn, revert, history: {}, abort: null, root: null };
  agentUI.root = h('div', { style: { display: 'contents' } }, paneHead('ИИ-агент', revert, clear), chat, h('div.composer', ta, h('div.row2', meta, sendBtn)));
  return agentUI.root;
}

function msg(role, content) {
  const el = h('div.m.' + role, h('div.who', role === 'user' ? 'Вы' : 'Агент'), typeof content === 'string' ? (role === 'user' ? h('div.body', content) : mdLite(content)) : content);
  agentUI.chat.append(el);
  agentUI.chat.scrollTop = agentUI.chat.scrollHeight;
  return el;
}

function toolView(ev) {
  const a = ev.args || {};
  const label = ev.name + (a.path ? ' ' + a.path : a.from ? ` ${a.from} → ${a.to}` : '');
  const head = h('div.tool-h', h('i.st'), h('span.t', label));
  const bodyEl = h('div.tool-b', { hidden: true });
  const el = h('div.tool.run', head, bodyEl);
  head.addEventListener('click', () => (bodyEl.hidden = !bodyEl.hidden));
  el.update = (e) => {
    el.className = 'tool ' + e.status;
    bodyEl.textContent = e.result || '';
    if (e.name === 'write_file' && a.content) bodyEl.textContent = (e.result || '') + '\n\n' + a.content.slice(0, 1200);
    if (e.name === 'edit_file') bodyEl.textContent = (e.result || '') + `\n\n− ${String(a.old_text).slice(0, 400)}\n+ ${String(a.new_text).slice(0, 400)}`;
  };
  return el;
}

async function sendAgent(textOverride) {
  const ui = agentUI;
  if (S.agentBusy) {
    ui.abort && ui.abort.abort();
    return;
  }
  const text = (textOverride ?? ui.ta.value).trim();
  if (!text) return;
  const cfg = aiCfg();
  const pr = PROVIDERS[cfg.provider];
  const needKey = cfg.provider !== 'ollama' && !/localhost|127\.0\.0\.1/.test(cfg.base);
  if (!cfg.base || !cfg.model || (needKey && !cfg.key)) {
    msg('agent', 'Сначала настройте ИИ: адрес, модель и ключ API (панель «Настройки»).');
    setView('settings');
    return;
  }
  ui.ta.value = '';
  msg('user', text);
  S.agentBusy = true;
  ui.sendBtn.replaceChildren(icon('stop', 12), 'Стоп');
  ui.meta.textContent = `${cfg.model} · думаю…`;
  ui.abort = new AbortController();
  S.agentSnap = project().snapshot();
  ui.revert.disabled = false;
  const toolEls = new Map();
  let typing = null;
  try {
    await runAgent({
      cfg: { kind: pr.kind, base: cfg.base, key: cfg.key, model: cfg.model },
      host: {
        project: project(),
        check: async () => {
          const c = await compileProject();
          const pr = allProblems().filter((x) => x.severity === 'error');
          return c.ok && !pr.length ? 'ok: ошибок нет, пакет можно собирать' : pr.map((x) => `error ${x.path}: ${x.text}`).join('\n');
        },
        runPreview: async () => {
          const mark = S.logs.length;
          await run({ quiet: false });
          await new Promise((r) => setTimeout(r, 1600));
          const new_ = S.logs.slice(mark).filter((l) => l.source !== 'studio' || l.level !== 'info');
          if (!new_.length) return 'Запущено. Консоль пуста — ошибок нет.';
          return new_.map((l) => `[${l.level}] ${l.text}`).join('\n').slice(0, 4000);
        },
      },
      userText: text,
      history: ui.history,
      extra: cfg.extra,
      activePath: S.active,
      signal: ui.abort.signal,
      events: {
        onStep: () => { ui.meta.textContent = `${cfg.model} · работаю…`; },
        onText: (t) => msg('agent', t),
        onTool: (ev) => {
          let el = toolEls.get(ev);
          if (!el) {
            el = toolView(ev);
            toolEls.set(ev, el);
            ui.chat.append(el);
          }
          el.update(ev);
          ui.chat.scrollTop = ui.chat.scrollHeight;
        },
      },
    });
  } catch (e) {
    if (e.name !== 'AbortError') msg('agent', 'Ошибка: ' + e.message);
    else msg('agent', 'Остановлено.');
  } finally {
    typing && typing.remove();
    S.agentBusy = false;
    ui.sendBtn.replaceChildren(icon('send', 14), 'Отправить');
    ui.meta.textContent = '';
    renderAll(false);
  }
}

function revertAgent() {
  if (!S.agentSnap || S.agentBusy) return;
  project().restore(S.agentSnap);
  S.agentSnap = null;
  agentUI.revert.disabled = true;
  msg('agent', 'Изменения агента откатаны.');
}

// ───────────────────────────── палитра, горячие клавиши ─────────────────────────────

function commandPalette() {
  const cmds = [
    { label: '> Запустить', hint: 'Ctrl+Enter', run: () => run() },
    { label: '> Собрать .nob', hint: 'Ctrl+Shift+B', run: buildAction },
    { label: '> Установить в симулятор', run: installAction },
    { label: '> Экспорт Android-проекта (.zip)', run: exportAndroid },
    { label: '> Экспорт исходников (.zip)', run: exportSource },
    { label: '> Новый файл', run: newFile },
    { label: '> Новая папка', run: newFolder },
    { label: '> Новый проект', run: newProject },
    { label: '> Открыть .nob / .apk / .zip', run: importFile },
    { label: '> Показать/скрыть превью', run: () => togglePreview() },
    { label: '> Показать/скрыть панель', hint: 'Ctrl+J', run: toggleBottom },
    { label: '> Проводник', run: () => setView('files') },
    { label: '> Поиск по проекту', hint: 'Ctrl+Shift+F', run: () => setView('search') },
    { label: '> ИИ-агент', run: () => setView('agent') },
    { label: '> Настройки ИИ', run: () => setView('settings') },
    { label: '> Закрыть вкладку', hint: 'Ctrl+W', run: () => S.active && closeTab(S.active) },
  ];
  palette({ placeholder: 'Введите команду…', items: cmds, onPick: (it) => it.run() });
}
function quickOpen() {
  palette({ placeholder: 'Открыть файл…', items: project().paths().map((p) => ({ label: p, path: p })), onPick: (it) => openFile(it.path) });
}
function toggleBottom() {
  const off = document.body.classList.toggle('bot-off');
  prefs.set('botOff', off);
}

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); ws.saveNow(); toast('Сохранено'); }
  else if (k === 'p' && e.shiftKey) { e.preventDefault(); commandPalette(); }
  else if (k === 'p') { e.preventDefault(); quickOpen(); }
  else if (k === 'enter') { e.preventDefault(); run(); }
  else if (k === 'b' && e.shiftKey) { e.preventDefault(); buildAction(); }
  else if (k === 'b') { e.preventDefault(); setView(S.view); }
  else if (k === 'j') { e.preventDefault(); toggleBottom(); }
  else if (k === 'f' && e.shiftKey) { e.preventDefault(); setView('search'); setTimeout(() => $('search-q')?.focus(), 30); }
  else if (k === 'e' && e.shiftKey) { e.preventDefault(); setView('files'); }
  else if (k === 'w' && S.active) { e.preventDefault(); closeTab(S.active); }
});

// ───────────────────────────── сборка окна ─────────────────────────────

function renderSidebar() {
  const sb = $('sidebar');
  const keepAgent = S.view === 'agent';
  const views = { files: viewFiles, search: viewSearch, agent: () => [agentPanel()], package: viewPackage, settings: viewSettings };
  const nodes = views[S.view]();
  if (!keepAgent && agentUI && agentUI.root.parentNode === sb) agentUI.root.remove();
  sb.replaceChildren(...nodes);
  if (S.view === 'files') renderExplorerTree();
  if (S.view === 'agent') setTimeout(() => { agentUI.chat.scrollTop = agentUI.chat.scrollHeight; }, 0);
  syncActivity();
}

function renderAll(sidebar = true) {
  renderTabs();
  if (sidebar) renderSidebar();
  renderBottom();
  updateStatus();
  if (!S.tabs.length) showWelcome();
}

async function main() {
  await ws.load();
  host.project = project();
  device = new Device({
    onConsole: logConsole,
    onDiagnostics: (d) => { S.diags = d; renderBottom(); updateStatus(); },
    onState: (s) => {
      S.running = s.running;
      if (typeof updateStatus === 'function' && project()) updateStatus();
    },
  });
  buildFrame();
  applyFont();
  if (prefs.get('botOff', false)) document.body.classList.add('bot-off');
  const startPrev = narrow.matches ? false : prefs.get('prevOpen', true);
  document.body.classList.toggle('prev-off', !startPrev);
  $('btn-prev').classList.toggle('on', startPrev);
  $('pv-live').classList.toggle('on', S.live);
  if (narrow.matches || prefs.get('sideOff', false)) document.body.classList.add('side-off');
  bindProject();
  await refreshInstalled();
  const m = project().manifest().value;
  const first = m?.entry && project().has(m.entry) ? m.entry : project().paths()[0];
  if (first) openFile(first);
  renderAll();
  compileProject().catch(() => {});
  setTimeout(() => device.fit(), 50);
  narrow.addEventListener('change', () => device.fit());
  window.addEventListener('resize', () => device.fit());
  // отладочный доступ (тесты, консоль браузера)
  window.studio = { ws, S, compileProject, get project() { return project(); }, get device() { return device; }, run, openFile, buildPackage, installBytes, refreshInstalled, importBytes, sendAgent, setView, getKey, exportAndroid };
  // системная «Назад» в Android-обёртке: сначала закрываем превью/боковую панель, потом выходим
  window.noodle && window.noodle.onBack(() => {
    if (narrow.matches && !document.body.classList.contains('prev-off')) { togglePreview(false); return true; }
    if (narrow.matches && !document.body.classList.contains('side-off')) { document.body.classList.add('side-off'); syncActivity(); return true; }
    return false;
  });
  document.body.dataset.ready = '1';
}

main().catch((e) => {
  document.body.append(h('pre', { style: { color: '#fff', padding: '24px', whiteSpace: 'pre-wrap' } }, 'Не удалось запустить Studio:\n' + (e.stack || e.message)));
  console.error(e);
});

void alertBox;
void validateManifest;
void sha256;
