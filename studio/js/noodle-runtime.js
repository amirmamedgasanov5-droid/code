/* Noodle.OS Runtime — подключается к каждому приложению автоматически.
 * Даёт приложению объект window.noodle. Работает в трёх режимах:
 *   preview — в песочнице внутри Noodle Studio (связь с Studio через postMessage)
 *   native  — внутри Android-обёртки (мост NoodleHost)
 *   web     — просто в браузере
 * Конфигурацию кладёт перед этим файлом сборщик: window.__NOODLE_CONFIG__ = { manifest, mode, storage, files }.
 */
(function () {
  'use strict';
  var cfg = window.__NOODLE_CONFIG__ || {};
  var manifest = cfg.manifest || {};
  var mode = cfg.mode || 'web';
  var perms = manifest.permissions || [];
  var host = window.NoodleHost; // только в native
  var toParent = function (msg) {
    msg.noodle = true;
    try { window.parent.postMessage(msg, '*'); } catch (e) {}
  };

  // ── console → Studio ─────────────────────────────────────────────
  if (mode === 'preview') {
    var fmt = function (a) {
      try {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === 'string') return a;
        return JSON.stringify(a);
      } catch (e) { return String(a); }
    };
    ['log', 'info', 'warn', 'error', 'debug'].forEach(function (lvl) {
      var orig = console[lvl];
      console[lvl] = function () {
        toParent({ type: 'console', level: lvl, text: [].map.call(arguments, fmt).join(' ') });
        return orig.apply(console, arguments);
      };
    });
    window.addEventListener('error', function (e) {
      toParent({ type: 'console', level: 'error', text: (e.message || 'Error') + (e.filename ? '  (' + String(e.filename).split('/').pop() + ':' + e.lineno + ')' : '') });
    });
    window.addEventListener('unhandledrejection', function (e) {
      toParent({ type: 'console', level: 'error', text: 'Unhandled rejection: ' + fmt(e.reason) });
    });
  }

  // ── хранилище ─────────────────────────────────────────────────────
  // В песочнице настоящий localStorage недоступен (opaque origin), поэтому подменяем его:
  // данные лежат в Studio и переживают перезагрузку превью.
  function makeStorage(initial, onChange) {
    var data = Object.assign({}, initial || {});
    var api = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); onChange('set', String(k), data[k]); },
      removeItem: function (k) { delete data[k]; onChange('remove', String(k)); },
      clear: function () { data = {}; onChange('clear'); },
      key: function (i) { return Object.keys(data)[i] === undefined ? null : Object.keys(data)[i]; },
    };
    Object.defineProperty(api, 'length', { get: function () { return Object.keys(data).length; } });
    return api;
  }
  if (mode === 'preview') {
    var ls = makeStorage(cfg.storage, function (op, key, value) { toParent({ type: 'storage', op: op, key: key, value: value }); });
    var ss = makeStorage({}, function () {});
    try { Object.defineProperty(window, 'localStorage', { configurable: true, value: ls }); } catch (e) {}
    try { Object.defineProperty(window, 'sessionStorage', { configurable: true, value: ss }); } catch (e) {}
  }

  var storage = {
    get: function (key, fallback) {
      try {
        var v = window.localStorage.getItem(key);
        return v === null ? (fallback === undefined ? null : fallback) : JSON.parse(v);
      } catch (e) { return fallback === undefined ? null : fallback; }
    },
    set: function (key, value) { window.localStorage.setItem(key, JSON.stringify(value)); },
    remove: function (key) { window.localStorage.removeItem(key); },
    clear: function () { window.localStorage.clear(); },
    keys: function () { var r = []; for (var i = 0; i < window.localStorage.length; i++) r.push(window.localStorage.key(i)); return r; },
  };

  // ── fetch локальных файлов (preview) ──────────────────────────────
  if (mode === 'preview' && cfg.files) {
    var realFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : input && input.url;
      if (typeof url === 'string' && !/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith('//')) {
        var p = url.split('#')[0].split('?')[0].replace(/^\.\//, '').replace(/^\//, '');
        if (cfg.files[p]) return realFetch.call(window, cfg.files[p], init);
        return Promise.resolve(new Response('Not found: ' + p, { status: 404, statusText: 'Not Found' }));
      }
      return realFetch.call(window, input, init);
    };
  }

  // ── UI-помощники ──────────────────────────────────────────────────
  var toastTimer;
  function toast(msg) {
    if (host && host.toast) { host.toast(String(msg)); return; }
    var el = document.getElementById('__noodle_toast');
    if (!el) {
      el = document.createElement('div');
      el.id = '__noodle_toast';
      el.style.cssText = 'position:fixed;left:50%;bottom:72px;transform:translateX(-50%);max-width:80vw;padding:10px 16px;background:#fff;color:#000;font:500 13px/1.3 system-ui,sans-serif;border-radius:2px;z-index:2147483647;opacity:0;transition:opacity .15s;pointer-events:none';
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = String(msg);
    el.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.opacity = '0'; }, 2000);
  }

  function has(p) { return perms.indexOf(p) >= 0; }

  var backHandler = null;
  window.__noodleBack = function () {
    try { return !!(backHandler && backHandler() === true); } catch (e) { return false; }
  };
  if (mode === 'preview') {
    window.addEventListener('message', function (e) {
      if (e.data && e.data.noodle && e.data.type === 'back') toParent({ type: 'back-result', handled: window.__noodleBack() });
    });
  }

  window.noodle = {
    version: '1.0',
    app: { id: manifest.id, name: manifest.name, version: manifest.version },
    platform: mode === 'native' ? 'android' : mode === 'preview' ? 'preview' : 'web',
    storage: storage,
    toast: toast,
    has: has,
    vibrate: function (ms) {
      if (!has('vibrate')) { console.warn('noodle.vibrate: в manifest.json нет разрешения "vibrate"'); return false; }
      ms = ms || 30;
      if (host && host.vibrate) { host.vibrate(ms | 0); return true; }
      if (navigator.vibrate) return navigator.vibrate(ms);
      return false;
    },
    // Обработчик системной кнопки «Назад». Верните true, если обработали нажатие сами.
    onBack: function (fn) { backHandler = fn; },
    // Закрыть приложение.
    exit: function () {
      if (host && host.exit) host.exit();
      else if (mode === 'preview') toParent({ type: 'exit' });
      else window.close();
    },
    // Сохранить файл пользователю (в «Загрузки» на Android, скачивание в браузере).
    saveFile: function (name, data, mime) {
      mime = mime || 'application/octet-stream';
      var bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      if (host && host.saveFile) {
        var s = '', CH = 0x8000;
        for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        var r = host.saveFile(name, mime, btoa(s));
        if (String(r).indexOf('ERR:') === 0) throw new Error(r);
        toast('Сохранено: ' + r);
        return r;
      }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return name;
    },
  };
  Object.freeze(window.noodle.app);
})();
