// Редактор кода: textarea (ввод, undo, выделение — нативные) + слой подсветки + нумерация строк.
// На каждый открытый файл — свой экземпляр, поэтому у каждого свой стек отмены.
import { h } from './util.js';
import { highlight } from './highlight.js';

const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
const CLOSERS = new Set([')', ']', '}', '"', "'", '`']);

export class CodeEditor {
  /**
   * @param {object} o  { text, lang, onChange(text), onCursor({line,col}), readOnly }
   */
  constructor(o) {
    this.lang = o.lang;
    this.onChange = o.onChange || (() => {});
    this.onCursor = o.onCursor || (() => {});
    this.gutterIn = h('div.gutter-in');
    this.gutter = h('div.gutter', this.gutterIn);
    this.code = h('code');
    this.pre = h('pre.hl', { 'aria-hidden': 'true' }, this.code);
    this.ta = h('textarea.ta', {
      spellcheck: false,
      autocapitalize: 'off',
      autocomplete: 'off',
      autocorrect: 'off',
      wrap: 'off',
      readOnly: !!o.readOnly,
      'aria-label': 'Редактор кода',
    });
    this.ta.value = o.text;
    this.el = h('div.ed', this.gutter, h('div.codewrap', this.pre, this.ta));
    this.lines = 0;
    this.ta.addEventListener('input', () => {
      this.refresh();
      this.onChange(this.ta.value);
    });
    this.ta.addEventListener('scroll', () => this.syncScroll());
    this.ta.addEventListener('keydown', (e) => this.keydown(e));
    for (const ev of ['keyup', 'click', 'focus']) this.ta.addEventListener(ev, () => this.cursor());
    document.addEventListener('selectionchange', this._sel = () => {
      if (document.activeElement === this.ta) this.cursor();
    });
    this.refresh();
  }

  get value() {
    return this.ta.value;
  }

  /** Программная замена текста (агент, переименование). Сбрасывает undo-стек — это ожидаемо. */
  setValue(text) {
    if (text === this.ta.value) return;
    this.ta.value = text;
    this.refresh();
  }

  focus() {
    this.ta.focus({ preventScroll: true });
  }

  destroy() {
    document.removeEventListener('selectionchange', this._sel);
    this.el.remove();
  }

  refresh() {
    const v = this.ta.value;
    this.code.innerHTML = highlight(v, this.lang) + '\n';
    const n = v.split('\n').length;
    if (n !== this.lines) {
      this.lines = n;
      this.gutterIn.replaceChildren(...Array.from({ length: n }, (_, i) => h('div.ln', { 'data-n': i + 1 }, String(i + 1))));
      this.gutter.style.width = Math.max(3, String(n).length + 2) + 'ch';
      this.activeLn = null;
    }
    this.syncScroll();
    this.cursor();
  }

  syncScroll() {
    const t = this.ta;
    this.code.style.transform = `translate(${-t.scrollLeft}px, ${-t.scrollTop}px)`;
    this.gutterIn.style.transform = `translateY(${-t.scrollTop}px)`;
  }

  cursor() {
    const v = this.ta.value;
    const pos = this.ta.selectionStart;
    const before = v.slice(0, pos);
    const line = before.split('\n').length;
    const col = pos - before.lastIndexOf('\n');
    if (this.activeLn !== line) {
      this.gutterIn.querySelector('.ln.on')?.classList.remove('on');
      this.gutterIn.children[line - 1]?.classList.add('on');
      this.activeLn = line;
    }
    this.onCursor({ line, col, sel: this.ta.selectionEnd - pos });
  }

  /** Перейти к строке (1-based) и прокрутить в видимую область. */
  goto(line, col = 1) {
    const lines = this.ta.value.split('\n');
    let pos = 0;
    for (let i = 0; i < Math.min(line - 1, lines.length - 1); i++) pos += lines[i].length + 1;
    pos += Math.min(col - 1, (lines[line - 1] || '').length);
    this.ta.focus({ preventScroll: true });
    this.ta.setSelectionRange(pos, pos);
    const lh = parseFloat(getComputedStyle(this.ta).lineHeight) || 20;
    this.ta.scrollTop = Math.max(0, (line - 1) * lh - this.ta.clientHeight / 3);
    this.syncScroll();
    this.cursor();
  }

  insert(text) {
    // execCommand сохраняет нативный undo; запасной путь — setRangeText
    this.ta.focus({ preventScroll: true });
    if (!document.execCommand || !document.execCommand('insertText', false, text)) {
      this.ta.setRangeText(text, this.ta.selectionStart, this.ta.selectionEnd, 'end');
      this.ta.dispatchEvent(new Event('input'));
    }
  }

  keydown(e) {
    const ta = this.ta;
    if (ta.readOnly || e.isComposing) return;
    const v = ta.value;
    const s = ta.selectionStart;
    const en = ta.selectionEnd;
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === 'Tab' && !mod) {
      e.preventDefault();
      if (s === en && !e.shiftKey) return this.insert('  ');
      // блочный отступ
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      const block = v.slice(ls, en);
      const lines = block.split('\n');
      const out = lines.map((l) => (e.shiftKey ? l.replace(/^ {1,2}/, '') : '  ' + l)).join('\n');
      ta.setSelectionRange(ls, en);
      this.insert(out);
      ta.setSelectionRange(ls, ls + out.length);
      return;
    }
    if (e.key === 'Enter' && !mod && !e.shiftKey) {
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      const indent = /^[ \t]*/.exec(v.slice(ls, s))[0];
      const prev = v[s - 1];
      const next = v[en];
      e.preventDefault();
      if ((prev === '{' && next === '}') || (prev === '[' && next === ']') || (prev === '(' && next === ')')) {
        const mid = '\n' + indent + '  ';
        this.insert(mid + '\n' + indent);
        const p = s + mid.length;
        ta.setSelectionRange(p, p);
      } else this.insert('\n' + indent + (/[{[(]$/.test(v.slice(ls, s).trimEnd()) ? '  ' : ''));
      return;
    }
    if (mod && e.key === '/') {
      e.preventDefault();
      return this.toggleComment();
    }
    if (mod || e.altKey) return;

    // парные скобки/кавычки
    if (e.key.length === 1) {
      if (CLOSERS.has(e.key) && s === en && v[s] === e.key) {
        e.preventDefault();
        ta.setSelectionRange(s + 1, s + 1);
        return;
      }
      const close = PAIRS[e.key];
      if (close && this.lang !== 'text' && this.lang !== 'md') {
        const next = v[en];
        const prev = v[s - 1];
        const quote = e.key === close;
        if (s !== en) {
          e.preventDefault();
          const sel = v.slice(s, en);
          this.insert(e.key + sel + close);
          ta.setSelectionRange(s + 1, s + 1 + sel.length);
          return;
        }
        if ((next === undefined || /[\s)\]}.,;:]/.test(next)) && !(quote && /[\w]/.test(prev || ''))) {
          e.preventDefault();
          this.insert(e.key + close);
          ta.setSelectionRange(s + 1, s + 1);
        }
      }
    }
  }

  toggleComment() {
    const v = this.ta.value;
    const s = this.ta.selectionStart;
    const en = this.ta.selectionEnd;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    let le = v.indexOf('\n', en);
    if (le < 0) le = v.length;
    const lines = v.slice(ls, le).split('\n');
    const [open, close] = this.lang === 'css' ? ['/* ', ' */'] : this.lang === 'html' ? ['<!-- ', ' -->'] : this.lang === 'js' ? ['// ', ''] : ['# ', ''];
    const isC = (l) => l.trim().startsWith(open.trim()) || !l.trim();
    const all = lines.every(isC);
    const out = lines
      .map((l) => {
        if (!l.trim()) return l;
        if (all) return l.replace(open, '').replace(open.trim(), '').replace(close ? new RegExp(close.replace(/[*/]/g, '\\$&') + '$') : /$^/, '');
        const ind = /^\s*/.exec(l)[0];
        return ind + open + l.slice(ind.length) + close;
      })
      .join('\n');
    this.ta.setSelectionRange(ls, le);
    this.insert(out);
    this.ta.setSelectionRange(ls, ls + out.length);
  }
}
