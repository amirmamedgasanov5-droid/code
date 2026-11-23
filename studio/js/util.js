// Общие помощники Studio.
import { b64encode, mimeOf } from './nob.js';

/** Мини-hyperscript: h('div.cls#id', {onclick, attr}, ...children) */
export function h(sel, attrs, ...kids) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(sel);
  const el = document.createElement(m && m[1] ? m[1] : 'div');
  for (const t of (m && m[2] ? m[2].match(/[.#][\w-]+/g) : []) || []) {
    if (t[0] === '.') el.classList.add(t.slice(1));
    else el.id = t.slice(1);
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs) )) {
    kids.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false && (k === 'spellcheck' || k === 'draggable')) {
      el.setAttribute(k, 'false');
      continue;
    }
    if (v === false || v == null) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function debounce(fn, ms) {
  let t;
  const d = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.flush = (...a) => {
    clearTimeout(t);
    fn(...a);
  };
  return d;
}

export const fmtBytes = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB');

/** Скачивание файла. В Android-обёртке идёт через мост NoodleHost, в браузере — через <a download>. */
export function download(name, bytes, mime) {
  mime = mime || mimeOf(name);
  if (typeof bytes === 'string') bytes = new TextEncoder().encode(bytes);
  if (window.NoodleHost && window.NoodleHost.saveFile) {
    const r = window.NoodleHost.saveFile(name, mime, b64encode(bytes));
    if (String(r).startsWith('ERR:')) throw new Error(r);
    return r;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1500);
  return name;
}

/** Выбор файлов с диска. */
export function pickFiles({ accept = '', multiple = false } = {}) {
  return new Promise((resolve) => {
    const inp = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    inp.addEventListener('change', () => {
      resolve([...inp.files]);
      inp.remove();
    });
    inp.addEventListener('cancel', () => {
      resolve([]);
      inp.remove();
    });
    document.body.append(inp);
    inp.click();
  });
}

const TEXT_EXT = /\.(html?|css|js|mjs|json|svg|txt|md|xml|csv|ts|tsx|jsx|map|webmanifest|yml|yaml|toml|ini|lua|py|nui|kt|kts|gradle|swift|dart|properties|java)$/i;
export const isTextPath = (p) => TEXT_EXT.test(p) || !/\.[a-z0-9]+$/i.test(p);

export function langOf(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return { js: 'js', mjs: 'js', ts: 'js', jsx: 'js', tsx: 'js', json: 'json', webmanifest: 'json', css: 'css', html: 'html', htm: 'html', svg: 'html', xml: 'html', md: 'md', nui: 'nui', ns: 'nui', kt: 'kt', kts: 'kt', gradle: 'kt', swift: 'swift', dart: 'dart', yml: 'yaml', yaml: 'yaml' }[ext] || 'text';
}

// ── иконки (24×24, stroke 1.5, currentColor) ───────────────────────────
const P = {
  files: 'M5 3.5h8l4 4V20.5H5zM13 3.5v4h4',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20',
  agent: 'M4 5.5h16v10H12l-4.5 4v-4H4zM8.5 10.5h7',
  package: 'M12 3l8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.3 3h-4l-.3 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.3 2.7h4l.3-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  play: 'M7 4.5v15l12-7.5z',
  newfile: 'M5 3.5h8l4 4V20.5H5zM13 3.5v4h4M11 11v6M8 14h6',
  newfolder: 'M3 6.5h6l2 2h10v11H3zM12 11.5v5M9.5 14h5',
  upload: 'M12 16V4M7 9l5-5 5 5M4 17v3h16v-3',
  collapse: 'M5 9l7 7 7-7',
  chevron: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  reload: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5',
  device: 'M7 3h10v18H7zM11 18h2',
  rotate: 'M4 8h13a3 3 0 0 1 3 3v6H7a3 3 0 0 1-3-3zM20 4v4h-4',
  send: 'M4 12l16-8-6 16-3-7z',
  stop: 'M6 6h12v12H6z',
  plus: 'M12 5v14M5 12h14',
  undo: 'M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 12',
  file: 'M6 3.5h7l4 4V20.5H6zM13 3.5v4h4',
  folder: 'M3 6.5h6l2 2h10v11H3z',
  sidebar: 'M4 5h16v14H4zM9 5v14',
  panel: 'M4 5h16v14H4zM4 14h16',
  key: 'M8 14a4 4 0 1 1 3.5-6H20v3h-2v2h-3v-2h-3.5A4 4 0 0 1 8 14z',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  check: 'M5 12.5l4.5 4.5L19 7',
  warn: 'M12 4l9 16H3zM12 10v4M12 17v.5',
  back: 'M15 5l-7 7 7 7',
  home: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
  app: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
};
export function icon(name, size = 18) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.5');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', P[name] || '');
  s.append(p);
  return s;
}
