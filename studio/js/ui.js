// Диалоги, тосты, палитра команд. Свои реализации: в Android WebView нативные prompt()/confirm() не работают.
import { h } from './util.js';

const overlay = () => document.getElementById('overlay');

export function toast(text, kind) {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const t = h('div.toast' + (kind === 'err' ? '.err' : ''), text);
  box.append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 5000 : 2200);
}

function modal({ title, body, buttons, onClose }) {
  const close = (v) => {
    scrim.remove();
    document.removeEventListener('keydown', onKey, true);
    onClose(v);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close(undefined);
    }
  };
  const foot = h('div.mf');
  const scrim = h('div.scrim', { onmousedown: (e) => e.target === scrim && close(undefined) }, h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h3', title), h('div.mb', body), foot));
  for (const b of buttons) foot.append(h('button.btn' + (b.primary ? '.primary' : ''), { onclick: () => b.action(close), 'data-act': b.id }, b.label));
  document.addEventListener('keydown', onKey, true);
  overlay().append(scrim);
  return scrim;
}

export function prompt(title, { value = '', placeholder = '', ok = 'OK', note } = {}) {
  return new Promise((resolve) => {
    const inp = h('input', { type: 'text', value, placeholder, spellcheck: false, autocomplete: 'off' });
    const submit = (close) => close(inp.value.trim() || null);
    const scrim = modal({
      title,
      body: [inp, note ? h('div.hint', { style: { color: 'var(--dim)', marginTop: '6px', fontSize: '12px' } }, note) : null],
      buttons: [
        { id: 'cancel', label: 'Отмена', action: (c) => c(null) },
        { id: 'ok', label: ok, primary: true, action: submit },
      ],
      onClose: (v) => resolve(v ?? null),
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') scrim.querySelector('[data-act=ok]').click();
    });
    setTimeout(() => {
      inp.focus();
      const dot = value.lastIndexOf('.');
      inp.setSelectionRange(0, dot > 0 ? dot : value.length);
    }, 0);
  });
}

export function confirm(title, text, { ok = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    const scrim = modal({
      title,
      body: h('div', text),
      buttons: [
        { id: 'cancel', label: 'Отмена', action: (c) => c(false) },
        { id: 'ok', label: ok, primary: true, action: (c) => c(true) },
      ],
      onClose: (v) => resolve(!!v),
    });
    setTimeout(() => scrim.querySelector('[data-act=ok]').focus(), 0);
    void danger;
  });
}

export function alertBox(title, body) {
  return new Promise((resolve) => modal({ title, body, buttons: [{ id: 'ok', label: 'OK', primary: true, action: (c) => c(true) }], onClose: () => resolve() }));
}

/** Палитра команд / быстрое открытие. items: [{label, hint, run}] */
export function palette({ placeholder, items, onPick }) {
  let sel = 0;
  let shown = items;
  const inp = h('input', { type: 'text', placeholder, spellcheck: false, autocomplete: 'off', 'aria-label': placeholder });
  const ul = h('ul', { role: 'listbox' });
  const close = () => {
    scrim.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const score = (label, q) => {
    label = label.toLowerCase();
    if (!q) return 1;
    const i = label.indexOf(q);
    if (i >= 0) return 100 - i;
    let p = 0;
    for (const ch of q) {
      p = label.indexOf(ch, p);
      if (p < 0) return 0;
      p++;
    }
    return 1;
  };
  const draw = () => {
    ul.replaceChildren(
      ...shown.map((it, i) =>
        h('li' + (i === sel ? '.on' : ''), { role: 'option', onmousedown: (e) => { e.preventDefault(); pick(it); }, onmousemove: () => { if (sel !== i) { sel = i; draw(); } } }, it.label, it.hint ? h('small', it.hint) : null),
      ),
    );
    ul.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  const pick = (it) => {
    close();
    onPick(it);
  };
  const filter = () => {
    const q = inp.value.trim().toLowerCase();
    shown = items
      .map((it) => ({ it, s: score(it.label, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.it)
      .slice(0, 60);
    sel = 0;
    draw();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      sel = Math.min(shown.length - 1, sel + 1);
      draw();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      sel = Math.max(0, sel - 1);
      draw();
    } else if (e.key === 'Enter' && shown[sel]) {
      e.preventDefault();
      pick(shown[sel]);
    }
  };
  const scrim = h('div.scrim', { onmousedown: (e) => e.target === scrim && close() }, h('div.palette', inp, ul));
  inp.addEventListener('input', filter);
  document.addEventListener('keydown', onKey, true);
  overlay().append(scrim);
  filter();
  inp.focus();
}

/** Простое меню у кнопки. items: [{label, run, on} | '-'] */
export function menu(anchor, items, { right = false } = {}) {
  const r = anchor.getBoundingClientRect();
  const close = () => {
    scrim.remove();
    box.remove();
  };
  const box = h('div.proj-menu', { style: { top: r.bottom + 2 + 'px', left: Math.max(4, right ? r.right - 300 : r.left) + 'px' } });
  const scrim = h('div.ctx-scrim', { onmousedown: close });
  for (const it of items) {
    if (it === '-') box.append(h('hr'));
    else if (it.header) box.append(h('div.h', it.header));
    else box.append(h('div.li' + (it.on ? '.on' : ''), { onclick: () => { close(); it.run(); } }, it.label));
  }
  document.body.append(scrim, box);
}
