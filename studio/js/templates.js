import { NATIVE_TEMPLATES } from './templates-native.js';

// Шаблоны проектов. Чистые данные — используются и Studio, и CLI (`nob init`).

const ICON = (glyph) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" fill="#000"/>
  <rect x="3" y="3" width="90" height="90" fill="none" stroke="#fff" stroke-width="2"/>
  ${glyph}
</svg>
`;

const BASE_CSS = `:root {
  --bg: #000;
  --fg: #fff;
  --dim: #8a8a8a;
  --line: #262626;
  --panel: #0d0d0d;
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { height: 100%; margin: 0; }
body {
  background: var(--bg);
  color: var(--fg);
  font: 16px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  display: flex;
  flex-direction: column;
}
button {
  font: inherit;
  color: var(--fg);
  background: transparent;
  border: 1px solid var(--fg);
  border-radius: 2px;
  padding: 12px 18px;
  cursor: pointer;
}
button:active { background: var(--fg); color: var(--bg); }
`;

const WEB_TEMPLATES = {
  counter: {
    stack: 'web',
    title: 'Счётчик',
    description: 'Минимальное приложение: кнопки, состояние, сохранение через noodle.storage.',
    manifest: { id: 'dev.noodle.counter', name: 'Counter', version: '1.0.0', versionCode: 1, permissions: ['vibrate'] },
    files: {
      'index.html': `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Counter</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header><span>COUNTER</span></header>
  <main>
    <div id="value">0</div>
    <div class="row">
      <button id="dec" aria-label="Минус">−</button>
      <button id="inc" aria-label="Плюс">+</button>
    </div>
    <button id="reset" class="ghost">Сбросить</button>
  </main>
  <script type="module" src="app.js"></script>
</body>
</html>
`,
      'style.css': BASE_CSS + `header { padding: 20px 24px; border-bottom: 1px solid var(--line); font-size: 12px; letter-spacing: .24em; color: var(--dim); }
main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 32px; }
#value { font-size: 120px; font-weight: 200; font-variant-numeric: tabular-nums; line-height: 1; }
.row { display: flex; gap: 16px; }
.row button { width: 84px; height: 84px; font-size: 32px; padding: 0; }
.ghost { border-color: var(--line); color: var(--dim); }
`,
      'app.js': `// Приложение Noodle — обычный JavaScript. Объект \`noodle\` даёт рантайм ОС.
import { clamp } from './util.js';

const el = document.getElementById('value');
let count = noodle.storage.get('count', 0);

function render() {
  el.textContent = count;
  noodle.storage.set('count', count);
}

document.getElementById('inc').onclick = () => { count = clamp(count + 1, -999, 999); noodle.vibrate(15); render(); };
document.getElementById('dec').onclick = () => { count = clamp(count - 1, -999, 999); noodle.vibrate(15); render(); };
document.getElementById('reset').onclick = () => { count = 0; render(); noodle.toast('Сброшено'); };

render();
console.log('Counter запущен, платформа:', noodle.platform);
`,
      'util.js': `export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
`,
      'icon.svg': ICON('<path d="M30 48h36M48 30v36" stroke="#fff" stroke-width="5" fill="none"/>'),
    },
  },

  notes: {
    stack: 'web',
    title: 'Заметки',
    description: 'Список заметок с сохранением, удалением и системной кнопкой «Назад».',
    manifest: { id: 'dev.noodle.notes', name: 'Notes', version: '1.0.0', versionCode: 1, permissions: [] },
    files: {
      'index.html': `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Notes</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <button id="back" hidden aria-label="Назад">←</button>
    <span id="title">NOTES</span>
    <button id="add" aria-label="Новая заметка">+</button>
  </header>
  <ul id="list"></ul>
  <section id="editor" hidden>
    <input id="note-title" placeholder="Заголовок" maxlength="60">
    <textarea id="note-body" placeholder="Текст"></textarea>
    <button id="del" class="ghost">Удалить</button>
  </section>
  <script type="module" src="app.js"></script>
</body>
</html>
`,
      'style.css': BASE_CSS + `header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
header span { font-size: 12px; letter-spacing: .24em; color: var(--dim); }
header button { width: 44px; height: 44px; padding: 0; font-size: 22px; }
header button[hidden] { display: block; visibility: hidden; }
ul { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1; }
li { padding: 16px; border-bottom: 1px solid var(--line); cursor: pointer; }
li:active { background: var(--panel); }
li b { display: block; font-weight: 500; }
li small { color: var(--dim); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.empty { color: var(--dim); text-align: center; padding: 64px 24px; cursor: default; border: 0; }
#editor { flex: 1; display: flex; flex-direction: column; padding: 16px; gap: 12px; min-height: 0; }
#editor[hidden] { display: none; }
input, textarea { background: transparent; color: var(--fg); border: 0; border-bottom: 1px solid var(--line); font: inherit; padding: 8px 0; outline: none; border-radius: 0; }
input { font-size: 22px; font-weight: 500; }
textarea { flex: 1; resize: none; border-bottom: 0; }
.ghost { border-color: var(--line); color: var(--dim); }
`,
      'app.js': `// Заметки: состояние в noodle.storage, экраны «список» и «редактор», системный «Назад».
const $ = (id) => document.getElementById(id);
let notes = noodle.storage.get('notes', []);
let current = null;

const save = () => noodle.storage.set('notes', notes);

function showList() {
  current = null;
  $('editor').hidden = true;
  $('list').hidden = false;
  $('back').hidden = true;
  $('add').hidden = false;
  $('title').textContent = 'NOTES';
  $('list').innerHTML = '';
  if (!notes.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Пока пусто. Нажмите +';
    $('list').append(li);
  }
  for (const n of notes) {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = n.title || 'Без названия';
    const s = document.createElement('small');
    s.textContent = n.body || '—';
    li.append(b, s);
    li.onclick = () => open(n.id);
    $('list').append(li);
  }
}

function open(id) {
  current = notes.find((n) => n.id === id);
  $('list').hidden = true;
  $('editor').hidden = false;
  $('back').hidden = false;
  $('add').hidden = true;
  $('title').textContent = 'EDIT';
  $('note-title').value = current.title;
  $('note-body').value = current.body;
}

$('add').onclick = () => {
  const n = { id: Date.now(), title: '', body: '' };
  notes.unshift(n);
  save();
  open(n.id);
  $('note-title').focus();
};
$('back').onclick = showList;
$('del').onclick = () => {
  notes = notes.filter((n) => n !== current);
  save();
  showList();
  noodle.toast('Удалено');
};
for (const id of ['note-title', 'note-body']) {
  $(id).oninput = () => {
    current.title = $('note-title').value;
    current.body = $('note-body').value;
    save();
  };
}

// Системная «Назад»: из редактора — в список; из списка — закрывает приложение.
noodle.onBack(() => {
  if (current) { showList(); return true; }
  return false;
});

showList();
`,
      'icon.svg': ICON('<path d="M32 30h32M32 44h32M32 58h20" stroke="#fff" stroke-width="4" fill="none"/>'),
    },
  },

  blank: {
    stack: 'web',
    title: 'Пустой',
    description: 'Только каркас: manifest, index.html, иконка.',
    manifest: { id: 'dev.noodle.blank', name: 'Blank', version: '1.0.0', versionCode: 1, permissions: [] },
    files: {
      'index.html': `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Blank</title>
  <style>
    html, body { height: 100%; margin: 0; background: #000; color: #fff; font: 16px system-ui, sans-serif; }
    body { display: grid; place-items: center; }
  </style>
</head>
<body>
  <p>Hello, Noodle.OS</p>
</body>
</html>
`,
      'icon.svg': ICON('<circle cx="48" cy="48" r="16" stroke="#fff" stroke-width="4" fill="none"/>'),
    },
  },
};

export const TEMPLATES = { ...NATIVE_TEMPLATES, ...WEB_TEMPLATES };

/** Файлы шаблона вместе с manifest.json (строки). Для CLI и Studio. */
export function templateFiles(key, over = {}) {
  const t = TEMPLATES[key];
  if (!t) throw new Error('нет такого шаблона: ' + key);
  const native = ['kotlin', 'flutter', 'swift'].includes(t.stack);
  const m = { format: 1, ...t.manifest, ...over };
  const ordered = { format: 1, id: m.id, name: m.name, version: m.version, versionCode: m.versionCode, stack: t.stack };
  if (!native) {
    ordered.entry = m.entry || 'index.html';
    ordered.icon = 'icon.svg';
  }
  ordered.permissions = m.permissions || [];
  if (!native) ordered.window = { orientation: 'portrait', background: '#000000', statusBar: 'light' };
  return { 'manifest.json': JSON.stringify(ordered, null, 2) + '\n', ...t.files };
}
