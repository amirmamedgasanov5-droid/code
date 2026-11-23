/* Noodle UI engine — рисует приложение .nui (AST лежит в window.__NUI_APP__).
 * Реактивность простая и предсказуемая: после любого обработчика экран перерисовывается,
 * фокус и позиция курсора в полях ввода сохраняются. */
(function () {
  'use strict';
  var APP = window.__NUI_APP__;
  var root = document.getElementById('nui-root');
  var noodle = window.noodle || {
    storage: { get: function (k, f) { try { var v = localStorage.getItem(k); return v === null ? f : JSON.parse(v); } catch (e) { return f; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } },
    toast: function () {}, vibrate: function () {}, onBack: function () {}, exit: function () {}, platform: 'web',
  };

  var CSS = [
    ':root{--bg:#000;--fg:#fff;--dim:#8a8a8a;--line:#262626;--panel:#0d0d0d}',
    '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}',
    'html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '#nui-root{height:100%;display:flex;flex-direction:column;overflow:hidden}',
    '.n-screen{flex:1;min-height:0;display:flex;flex-direction:column}',
    '.n-column{display:flex;flex-direction:column;min-width:0;min-height:0}',
    '.n-row{display:flex;flex-direction:row;align-items:center;min-width:0}',
    '.n-box{min-width:0}',
    '.n-scroll{overflow:auto;flex:1;min-height:0}',
    '.n-text{margin:0;white-space:pre-wrap;word-break:break-word}',
    '.n-dim{color:var(--dim)}.n-caps{text-transform:uppercase;letter-spacing:.24em;font-size:12px}.n-mono{font-family:ui-monospace,Menlo,Consolas,monospace}',
    '.n-button{font:inherit;color:var(--fg);background:transparent;border:1px solid var(--fg);border-radius:2px;padding:12px 18px;cursor:pointer;min-height:44px;min-width:44px}',
    '.n-button:active:not(:disabled){background:var(--fg);color:var(--bg)}',
    '.n-button.n-primary{background:var(--fg);color:var(--bg);font-weight:600}',
    '.n-button.n-primary:active:not(:disabled){background:#bbb}',
    '.n-button.n-ghost{border-color:var(--line);color:var(--dim)}',
    '.n-button:disabled{opacity:.35;cursor:default}',
    '.n-input{font:inherit;color:var(--fg);background:transparent;border:0;border-bottom:1px solid var(--line);padding:10px 0;outline:none;border-radius:0;width:100%;min-height:44px}',
    '.n-input:focus{border-bottom-color:var(--fg)}',
    'textarea.n-input{resize:none;min-height:96px}',
    '.n-toggle{appearance:none;width:48px;height:28px;border:1px solid var(--fg);border-radius:2px;position:relative;background:transparent;cursor:pointer;margin:0;flex:none}',
    '.n-toggle::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;background:var(--dim);transition:left .12s}',
    '.n-toggle:checked::after{left:23px;background:var(--fg)}',
    '.n-divider{height:1px;background:var(--line);border:0;margin:0;align-self:stretch;flex:none}',
    '.n-bar{display:flex;align-items:center;gap:8px;padding:6px 8px 6px 16px;min-height:56px;border-bottom:1px solid var(--line);flex:none}',
    '.n-bar .n-back{border:0;min-width:44px;padding:0;font-size:22px}',
    '.n-bar-title{flex:1;font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--dim)}',
    '.n-err{padding:24px;font:13px/1.6 ui-monospace,Menlo,Consolas,monospace;color:#fff;white-space:pre-wrap}',
    '.n-err b{display:block;margin-bottom:8px;font-size:15px}',
  ].join('\n');
  var st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  function showErrors(list) {
    root.innerHTML = '';
    var d = document.createElement('div');
    d.className = 'n-err';
    d.innerHTML = '<b>Ошибка Noodle UI</b>';
    list.forEach(function (e) { d.appendChild(document.createTextNode((e.file ? e.file + ':' : '') + (e.line || '?') + '  ' + e.message + '\n')); });
    root.appendChild(d);
    list.forEach(function (e) { console.error('NUI ' + (e.file || '') + ':' + e.line + ' ' + e.message); });
  }
  if (APP.errors && APP.errors.length) return showErrors(APP.errors);

  // ── состояние ────────────────────────────────────────────────────
  var state = Object.create(null);
  var persistKeys = [];
  var codeCache = {};
  function mkExpr(code) {
    return codeCache['e' + code] || (codeCache['e' + code] = new Function('__s', 'with(__s){return (' + code + '\n)}'));
  }
  function mkStmt(code) {
    return codeCache['s' + code] || (codeCache['s' + code] = new Function('__s', 'event', 'with(__s){' + code + '\n}'));
  }
  function scopeOf(locals) {
    if (!locals) return rootScope;
    return new Proxy(locals, {
      has: function (t, k) { return k in t || k in state || k in window; },
      get: function (t, k) { return k === Symbol.unscopables ? undefined : k in t ? t[k] : k in state ? state[k] : window[k]; },
      set: function (t, k, v) { if (k in t) t[k] = v; else if (k in state) { state[k] = v; } else window[k] = v; return true; },
    });
  }
  var rootScope = new Proxy(state, {
    has: function (t, k) { return k in t || k in window; },
    get: function (t, k) { return k === Symbol.unscopables ? undefined : k in t ? t[k] : window[k]; },
    set: function (t, k, v) { if (k in t) t[k] = v; else window[k] = v; return true; },
  });
  function guard(f, what) {
    try { return f(); } catch (e) { console.error(what + ': ' + (e && e.message || e)); }
  }

  var screens = APP.screens;
  var stack = [APP.order.indexOf('main') >= 0 ? 'main' : APP.order[0]];
  var scheduled = false;

  state.goto = function (name) {
    if (!screens[name]) { console.error('goto: нет экрана «' + name + '»'); return; }
    stack.push(name);
    render();
  };
  state.back = function () {
    if (stack.length > 1) { stack.pop(); render(); return true; }
    return false;
  };
  state.render = function () { schedule(); };
  state.noodle = noodle;
  state.toast = function (t) { noodle.toast(t); };

  APP.states.forEach(function (s) {
    var v;
    try { v = mkExpr(s.expr)(rootScope); } catch (e) { console.error('state ' + s.name + ': ' + e.message); }
    if (s.persist) {
      persistKeys.push(s.name);
      var saved = noodle.storage.get('nui.' + s.name, undefined);
      if (saved !== undefined && saved !== null) v = saved;
    }
    state[s.name] = v;
  });
  APP.fns.forEach(function (f) {
    var factory = new Function('__s', 'with(__s){return ' + (f.async ? 'async ' : '') + 'function(' + f.params + '){' + f.body + '\n}}');
    var fn;
    try { fn = factory(rootScope); } catch (e) { console.error('fn ' + f.name + ': ' + e.message); return; }
    state[f.name] = function () {
      var r;
      try { r = fn.apply(null, arguments); } catch (e) { console.error(f.name + '(): ' + e.message); }
      if (r && r.then) r.then(schedule, function (e) { console.error(f.name + '(): ' + (e && e.message || e)); schedule(); });
      else schedule();
      return r;
    };
  });

  function persist() {
    persistKeys.forEach(function (k) { noodle.storage.set('nui.' + k, state[k]); });
  }
  var rendering = false;
  var burst = 0, burstAt = 0;
  function schedule() {
    if (scheduled || rendering) return; // вызовы fn во время отрисовки (чистые хелперы) не должны перерисовывать
    var now = Date.now();
    if (now - burstAt > 1000) { burst = 0; burstAt = now; }
    if (++burst > 200) { if (burst === 201) console.error('Слишком частые перерисовки — остановлено. Не меняйте state внутри выражений в разметке.'); return; }
    scheduled = true;
    Promise.resolve().then(function () { scheduled = false; persist(); render(); });
  }

  // ── интерполяция ─────────────────────────────────────────────────
  function interp(str, scope) {
    if (str.indexOf('{') < 0 && str.indexOf('\u0001') < 0) return str;
    var out = '';
    var i = 0;
    while (i < str.length) {
      var c = str[i];
      if (c === '\u0001') { out += '{'; i++; continue; }
      if (c === '{') {
        var d = 1, j = i + 1;
        while (j < str.length && d) { if (str[j] === '{') d++; else if (str[j] === '}') d--; j++; }
        if (d) { out += c; i++; continue; }
        var v = guard(function () { return mkExpr(str.slice(i + 1, j - 1))(scope); }, 'выражение {' + str.slice(i + 1, j - 1) + '}');
        out += v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : v;
        i = j;
      } else { out += c; i++; }
    }
    return out;
  }

  function attr(node, name, scope) {
    var a = node.attrs[name];
    if (!a) return undefined;
    if (a.t === 'str') return interp(a.v, scope);
    if (a.t === 'num' || a.t === 'flag') return a.v;
    return guard(function () { return mkExpr(a.v)(scope); }, name + '=' + a.v);
  }
  function handler(node, name, scope) {
    var a = node.attrs[name];
    if (!a) return null;
    return function (ev) {
      guard(function () {
        if (a.t === 'ref') { var f = mkExpr(a.v)(scope); if (typeof f === 'function') f(ev); else console.error(a.v + ' — не функция'); }
        else mkStmt(a.v)(scope, ev);
      }, name + '=' + a.v);
      schedule();
    };
  }
  function px(v) { return typeof v === 'number' ? v + 'px' : v; }

  // ── рендер ───────────────────────────────────────────────────────
  var counter = 0;
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; e.setAttribute('data-p', counter++); return e; }

  function layoutStyle(node, e, scope) {
    var s = e.style;
    var v;
    if ((v = attr(node, 'padding', scope)) !== undefined) s.padding = px(v);
    if ((v = attr(node, 'gap', scope)) !== undefined) s.gap = px(v);
    if ((v = attr(node, 'width', scope)) !== undefined) s.width = px(v);
    if ((v = attr(node, 'height', scope)) !== undefined) s.height = px(v);
    if ((v = attr(node, 'bg', scope)) !== undefined) s.background = v;
    if ((v = attr(node, 'radius', scope)) !== undefined) s.borderRadius = px(v);
    if (node.attrs.border) s.border = '1px solid var(--line)';
    if (node.attrs.grow) { s.flex = '1'; }
    if (node.attrs.center) { s.alignItems = 'center'; s.justifyContent = 'center'; }
    if ((v = attr(node, 'align', scope))) s.alignItems = { start: 'flex-start', end: 'flex-end', center: 'center', stretch: 'stretch' }[v] || v;
    if ((v = attr(node, 'justify', scope))) s.justifyContent = { start: 'flex-start', end: 'flex-end', center: 'center', between: 'space-between' }[v] || v;
    if (node.attrs.wrap) s.flexWrap = 'wrap';
  }

  function renderNode(node, scope, parent) {
    var e;
    var v;
    switch (node.tag) {
      case 'column': case 'row': case 'box': case 'scroll':
        e = el('div', 'n-' + node.tag);
        layoutStyle(node, e, scope);
        if (node.tag === 'scroll') e.style.flexDirection = 'column', e.style.display = 'flex';
        kids(node, e, scope);
        break;
      case 'text':
        e = el('div', 'n-text' + (node.attrs.dim ? ' n-dim' : '') + (node.attrs.caps ? ' n-caps' : '') + (node.attrs.mono ? ' n-mono' : ''));
        e.textContent = node.text !== null ? interp(node.text, scope) : '';
        if ((v = attr(node, 'size', scope)) !== undefined) e.style.fontSize = px(v);
        if ((v = attr(node, 'weight', scope)) !== undefined) e.style.fontWeight = v;
        if ((v = attr(node, 'color', scope)) !== undefined) e.style.color = v;
        if (node.attrs.center) e.style.textAlign = 'center';
        if (node.attrs.grow) e.style.flex = '1';
        if ((v = attr(node, 'padding', scope)) !== undefined) e.style.padding = px(v);
        if (node.attrs.size && node.attrs.size.v >= 40) e.style.lineHeight = '1.05';
        break;
      case 'button':
        e = el('button', 'n-button' + (node.attrs.primary ? ' n-primary' : '') + (node.attrs.ghost ? ' n-ghost' : ''));
        e.type = 'button';
        e.textContent = node.text !== null ? interp(node.text, scope) : '';
        var click = handler(node, 'on', scope);
        if (click) e.addEventListener('click', click);
        if (node.attrs.disabled && attr(node, 'disabled', scope)) e.disabled = true;
        if (node.attrs.full) e.style.width = '100%';
        if (node.attrs.grow) e.style.flex = '1';
        if ((v = attr(node, 'size', scope)) !== undefined) e.style.fontSize = px(v);
        if ((v = attr(node, 'width', scope)) !== undefined) e.style.width = px(v);
        if ((v = attr(node, 'height', scope)) !== undefined) e.style.height = px(v);
        break;
      case 'input': case 'area':
        e = el(node.tag === 'area' ? 'textarea' : 'input', 'n-input');
        if (node.tag === 'input') e.type = attr(node, 'type', scope) || 'text';
        if ((v = attr(node, 'placeholder', scope)) !== undefined) e.placeholder = v;
        var bind = node.attrs.bind && node.attrs.bind.v;
        if (bind) e.value = guard(function () { var x = mkExpr(bind)(scope); return x === undefined || x === null ? '' : x; }, 'bind=' + bind);
        var onch = handler(node, 'on', scope);
        e.addEventListener('input', function (ev) {
          if (bind) setBound(bind, e.type === 'number' ? (e.value === '' ? null : Number(e.value)) : e.value, scope);
          if (onch) onch(ev); else schedule();
        });
        if (node.attrs.grow) e.style.flex = '1';
        if (node.attrs.autofocus) setTimeout(function () { e.focus(); }, 0);
        break;
      case 'toggle':
        e = el('input', 'n-toggle');
        e.type = 'checkbox';
        var tb = node.attrs.bind && node.attrs.bind.v;
        if (tb) e.checked = !!guard(function () { return mkExpr(tb)(scope); }, 'bind=' + tb);
        e.addEventListener('change', function (ev) {
          if (tb) setBound(tb, e.checked, scope);
          var h = handler(node, 'on', scope);
          if (h) h(ev); else schedule();
        });
        break;
      case 'image':
        e = el('img');
        var src = attr(node, 'src', scope) || (node.text !== null ? interp(node.text, scope) : '');
        var files = (window.__NOODLE_CONFIG__ || {}).files;
        e.src = files && files[src] ? files[src] : src;
        e.alt = attr(node, 'alt', scope) || '';
        if ((v = attr(node, 'size', scope)) !== undefined) { e.style.width = px(v); e.style.height = px(v); }
        if ((v = attr(node, 'width', scope)) !== undefined) e.style.width = px(v);
        if ((v = attr(node, 'height', scope)) !== undefined) e.style.height = px(v);
        e.style.objectFit = 'cover';
        e.style.display = 'block';
        break;
      case 'spacer':
        e = el('div');
        if ((v = attr(node, 'size', scope)) !== undefined) { e.style.height = px(v); e.style.width = px(v); e.style.flex = 'none'; } else e.style.flex = '1';
        break;
      case 'divider':
        e = el('hr', 'n-divider');
        break;
      case 'bar':
        e = el('div', 'n-bar');
        if (stack.length > 1) {
          var bb = el('button', 'n-button n-back');
          bb.type = 'button';
          bb.textContent = '←';
          bb.setAttribute('aria-label', 'Назад');
          bb.addEventListener('click', function () { state.back(); });
          e.appendChild(bb);
        }
        var t = el('div', 'n-bar-title');
        t.textContent = node.text !== null ? interp(node.text, scope) : '';
        e.appendChild(t);
        kids(node, e, scope);
        break;
      case 'if':
        if (guard(function () { return mkExpr(node.attrs.cond.v)(scope); }, 'if ' + node.attrs.cond.v)) kids(node, parent, scope);
        return;
      case 'each':
        var list = guard(function () { return mkExpr(node.attrs.items.v)(scope); }, 'each ' + node.attrs.items.v) || [];
        var nm = node.attrs.as.v, ix = node.attrs.index && node.attrs.index.v;
        Array.prototype.forEach.call(list, function (item, i) {
          var loc = {};
          loc[nm] = item;
          if (ix) loc[ix] = i;
          var sc = scopeOf(loc);
          node.children.forEach(function (c) { renderNode(c, sc, parent); });
        });
        return;
      default:
        return;
    }
    parent.appendChild(e);
  }
  function kids(node, e, scope) { node.children.forEach(function (c) { renderNode(c, scope, e); }); }

  // запись в привязанную переменную (имя или путь вида user.name / items[i].done)
  function setBound(path, value, scope) {
    var fn = new Function('__s', '__v', 'with(__s){' + path + ' = __v}');
    guard(function () { fn(scope, value); }, 'bind=' + path);
  }

  function render() {
    var a = document.activeElement;
    var keep = a && root.contains(a) && a.getAttribute('data-p') !== null ? { p: a.getAttribute('data-p'), s: a.selectionStart, e: a.selectionEnd } : null;
    counter = 0;
    var name = stack[stack.length - 1];
    var scr = el('div', 'n-screen');
    var sc = screens[name];
    rendering = true;
    try { (sc ? sc.children : []).forEach(function (n) { renderNode(n, rootScope, scr); }); } finally { rendering = false; }
    root.replaceChildren(scr);
    if (keep) {
      var n = root.querySelector('[data-p="' + keep.p + '"]');
      if (n && n.tagName !== 'BUTTON') {
        n.focus();
        try { n.setSelectionRange(keep.s, keep.e); } catch (e) {}
      }
    }
  }

  noodle.onBack(function () { return state.back(); });
  render();
})();
