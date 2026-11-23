// Noodle Bundle (.nob) — ядро формата.
// Работает без изменений в браузере и в Node.js 20+ (WebCrypto + CompressionStream).
//
// Контейнер: обычный ZIP (deflate/stored), поэтому .nob можно открыть любым архиватором.
//
//   META/NOB             "noodle-bundle 1"  — магическая строка (первая запись)
//   manifest.json        манифест приложения
//   app/…                файлы приложения (HTML/CSS/JS/WASM/картинки)
//   META/hashes.json     SHA-256 каждого файла пакета
//   META/signature.json  ECDSA P-256 подпись над байтами hashes.json + публичный ключ

export const NOB_FORMAT = 1;
export const NOB_EXT = '.nob';
export const NOB_MAGIC = 'noodle-bundle 1';

const enc = new TextEncoder();
const dec = new TextDecoder();
export const utf8 = (s) => enc.encode(s);
export const fromUtf8 = (b) => dec.decode(b);

// ───────────────────────────── утилиты ─────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function b64encode(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}

export function b64decode(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function sha256(bytes) {
  return toHex(await crypto.subtle.digest('SHA-256', bytes));
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}
const deflateRaw = (b) => pipe(b, new CompressionStream('deflate-raw'));
const inflateRaw = (b) => pipe(b, new DecompressionStream('deflate-raw'));

// ───────────────────────────── пути ─────────────────────────────

/** Нормализует путь внутри пакета. Бросает ошибку на опасных путях (zip-slip). */
export function safePath(p) {
  if (typeof p !== 'string' || !p) throw new Error('пустой путь');
  if (p.includes('\\') || p.includes('\0')) throw new Error(`недопустимый путь: ${p}`);
  if (p.startsWith('/')) throw new Error(`абсолютный путь запрещён: ${p}`);
  const parts = p.split('/');
  for (const s of parts) if (s === '' || s === '.' || s === '..') throw new Error(`недопустимый путь: ${p}`);
  return p;
}

// ───────────────────────────── ZIP ─────────────────────────────

/**
 * Пишет ZIP. entries: [{ path, data: Uint8Array }]. Порядок сохраняется,
 * время файлов фиксировано (1980-01-01) → сборка воспроизводима (одинаковые входы = одинаковые байты).
 */
export async function zipWrite(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = utf8(e.path);
    const data = e.data;
    const crc = crc32(data);
    let method = 0;
    let body = data;
    if (data.length > 64 && e.compress !== false) {
      const d = await deflateRaw(data);
      if (d.length < data.length) {
        method = 8;
        body = d;
      }
    }
    const lh = new Uint8Array(30 + name.length);
    const v = new DataView(lh.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true); // utf-8 имена
    v.setUint16(8, method, true);
    v.setUint16(10, 0, true);
    v.setUint16(12, 0x0021, true); // 1980-01-01
    v.setUint32(14, crc, true);
    v.setUint32(18, body.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, name.length, true);
    v.setUint16(28, 0, true);
    lh.set(name, 30);
    chunks.push(lh, body);
    central.push({ name, crc, method, csize: body.length, usize: data.length, offset });
    offset += lh.length + body.length;
  }
  const cdStart = offset;
  for (const c of central) {
    const ch = new Uint8Array(46 + c.name.length);
    const v = new DataView(ch.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 20, true);
    v.setUint16(8, 0x0800, true);
    v.setUint16(10, c.method, true);
    v.setUint16(12, 0, true);
    v.setUint16(14, 0x0021, true);
    v.setUint32(16, c.crc, true);
    v.setUint32(20, c.csize, true);
    v.setUint32(24, c.usize, true);
    v.setUint16(28, c.name.length, true);
    v.setUint32(42, c.offset, true);
    ch.set(c.name, 46);
    chunks.push(ch);
    offset += ch.length;
  }
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, offset - cdStart, true);
  ev.setUint32(16, cdStart, true);
  chunks.push(end);
  const out = new Uint8Array(offset + 22);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

const LIMITS = { entries: 5000, total: 256 * 1024 * 1024 };

/** Читает ZIP (stored + deflate). Возвращает [{ path, data }] с проверкой CRC и лимитов. */
export async function zipRead(bytes, { check = true } = {}) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('это не ZIP/.nob: не найден конец архива');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  if (count > LIMITS.entries) throw new Error('слишком много файлов в архиве');
  const out = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('повреждён каталог архива');
    const method = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    const csize = v.getUint32(p + 20, true);
    const usize = v.getUint32(p + 24, true);
    const nlen = v.getUint16(p + 28, true);
    const elen = v.getUint16(p + 30, true);
    const clen = v.getUint16(p + 32, true);
    const lho = v.getUint32(p + 42, true);
    const path = fromUtf8(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (path.endsWith('/')) continue; // каталог
    total += usize;
    if (total > LIMITS.total) throw new Error('архив слишком большой после распаковки');
    const lnlen = v.getUint16(lho + 26, true);
    const lelen = v.getUint16(lho + 28, true);
    const start = lho + 30 + lnlen + lelen;
    const raw = bytes.subarray(start, start + csize);
    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = await inflateRaw(raw);
    else throw new Error(`метод сжатия ${method} не поддерживается (${path})`);
    if (check && crc32(data) !== crc) throw new Error(`CRC не совпал: ${path}`);
    out.push({ path, data });
  }
  return out;
}

// ───────────────────────────── манифест ─────────────────────────────

export const PERMISSIONS = {
  network: 'Доступ в интернет (fetch/XHR/WebSocket)',
  vibrate: 'Вибрация',
};
export const ORIENTATIONS = ['portrait', 'landscape', 'auto'];
/** Стеки: web — HTML/CSS/JS, nui — Noodle UI; остальные собираются своими тулчейнами в APK/IPA. */
export const STACKS = { web: 'HTML + CSS + JS', nui: 'Noodle UI', kotlin: 'Kotlin (Android)', flutter: 'Flutter (Dart)', swift: 'Swift (iOS)' };
export const NATIVE_STACKS = ['kotlin', 'flutter', 'swift'];

const JAVA_RESERVED = new Set(
  'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null'.split(' '),
);

/**
 * Проверяет манифест. files — объект/Map с путями проекта (для проверки entry/icon).
 * Возвращает { errors: string[], warnings: string[] }.
 */
export function validateManifest(m, files) {
  const errors = [];
  const warnings = [];
  const has = (p) => (files instanceof Map ? files.has(p) : p in (files || {}));
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { errors: ['manifest.json должен быть объектом'], warnings };
  if (m.format !== NOB_FORMAT) errors.push(`format: ожидается ${NOB_FORMAT}`);
  if (typeof m.id !== 'string' || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(m.id))
    errors.push('id: формат com.company.app (строчные латинские, цифры, _; минимум 2 сегмента)');
  else if (m.id.split('.').some((s) => JAVA_RESERVED.has(s))) errors.push('id: сегмент совпадает с зарезервированным словом Java');
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 40) errors.push('name: строка 1–40 символов');
  if (typeof m.version !== 'string' || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(m.version)) errors.push('version: семвер, например 1.0.0');
  if (!Number.isInteger(m.versionCode) || m.versionCode < 1) errors.push('versionCode: целое число ≥ 1');
  const stack = m.stack === undefined ? 'web' : m.stack;
  if (!(stack in STACKS)) errors.push(`stack: ${Object.keys(STACKS).join(' | ')}`);
  const native = NATIVE_STACKS.includes(stack);
  if (!native) {
    const ext = stack === 'nui' ? '.nui' : '.html';
    if (typeof m.entry !== 'string' || !m.entry.endsWith(ext)) errors.push(`entry: путь к ${ext} файлу`);
    else if (files && !has(m.entry)) errors.push(`entry: файл «${m.entry}» не найден`);
  }
  if (native) {
    /* иконка нативных проектов лежит в ресурсах платформы */
  } else if (m.icon !== undefined) {
    if (typeof m.icon !== 'string' || !/\.(svg|png)$/i.test(m.icon)) errors.push('icon: путь к .svg или .png');
    else if (files && !has(m.icon)) errors.push(`icon: файл «${m.icon}» не найден`);
  } else warnings.push('icon не задана — будет иконка по умолчанию');
  if (native) warnings.push('нативный стек: пакет .nob не собирается, используйте «APK / проект»');
  if (m.permissions !== undefined) {
    if (!Array.isArray(m.permissions)) errors.push('permissions: массив строк');
    else for (const p of m.permissions) if (!(p in PERMISSIONS)) errors.push(`permissions: неизвестное разрешение «${p}»`);
  }
  const w = m.window;
  if (w !== undefined) {
    if (typeof w !== 'object' || w === null) errors.push('window: объект');
    else {
      if (w.orientation !== undefined && !ORIENTATIONS.includes(w.orientation)) errors.push(`window.orientation: ${ORIENTATIONS.join(' | ')}`);
      if (w.background !== undefined && !/^#[0-9a-fA-F]{6}$/.test(w.background)) errors.push('window.background: цвет вида #RRGGBB');
      if (w.statusBar !== undefined && !['light', 'dark'].includes(w.statusBar)) errors.push('window.statusBar: light | dark');
    }
  }
  return { errors, warnings };
}

export function defaultManifest(over = {}) {
  return {
    format: NOB_FORMAT,
    id: 'dev.noodle.myapp',
    name: 'My App',
    version: '1.0.0',
    versionCode: 1,
    entry: 'index.html',
    icon: 'icon.svg',
    permissions: [],
    window: { orientation: 'portrait', background: '#000000', statusBar: 'light' },
    ...over,
  };
}

// ───────────────────────────── подпись ─────────────────────────────

const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };

/** Создаёт ключ разработчика. Возвращает { privateKey: JWK, publicKey: JWK, keyId }. */
export async function generateKey() {
  const kp = await crypto.subtle.generateKey(ECDSA, true, ['sign', 'verify']);
  const privateKey = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const publicKey = await crypto.subtle.exportKey('jwk', kp.publicKey);
  return { privateKey, publicKey, keyId: await keyId(publicKey) };
}

export async function keyId(pubJwk) {
  return (await sha256(utf8(JSON.stringify({ x: pubJwk.x, y: pubJwk.y })))).slice(0, 16);
}

async function sign(key, bytes) {
  const k = await crypto.subtle.importKey('jwk', key.privateKey, ECDSA, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k, bytes));
}

// ───────────────────────────── сборка / чтение ─────────────────────────────

const stableJSON = (o) => JSON.stringify(o, null, 2) + '\n';

/**
 * Собирает .nob.
 * @param manifest  объект манифеста (будет провалидирован)
 * @param files     { 'index.html': Uint8Array, … } — файлы приложения БЕЗ префикса app/ и без manifest.json
 * @param key       ключ из generateKey()
 * @returns {Promise<{bytes, report}>}
 */
export async function buildNob(manifest, files, key) {
  const { errors } = validateManifest(manifest, files);
  if (errors.length) throw new Error('манифест не прошёл проверку:\n  • ' + errors.join('\n  • '));
  if (NATIVE_STACKS.includes(manifest.stack)) throw new Error(`стек «${manifest.stack}» собирается в APK/IPA, а не в .nob (nob apk)`);
  const paths = Object.keys(files).sort();
  for (const p of paths) {
    safePath(p);
    if (p === 'manifest.json') throw new Error('manifest.json передаётся отдельно');
  }
  const mBytes = utf8(stableJSON(manifest));
  const entries = [{ path: 'META/NOB', data: utf8(NOB_MAGIC + '\n'), compress: false }, { path: 'manifest.json', data: mBytes }];
  for (const p of paths) entries.push({ path: 'app/' + p, data: files[p] });
  const hashes = {};
  for (const e of entries) if (e.path !== 'META/NOB') hashes[e.path] = await sha256(e.data);
  const hBytes = utf8(stableJSON({ alg: 'sha256', files: hashes }));
  const sig = await sign(key, hBytes);
  const sBytes = utf8(
    stableJSON({ alg: 'ECDSA-P256-SHA256', keyId: key.keyId || (await keyId(key.publicKey)), publicKey: { kty: 'EC', crv: 'P-256', x: key.publicKey.x, y: key.publicKey.y }, signature: b64encode(sig) }),
  );
  entries.push({ path: 'META/hashes.json', data: hBytes }, { path: 'META/signature.json', data: sBytes });
  const bytes = await zipWrite(entries);
  return {
    bytes,
    report: {
      files: paths.length,
      rawSize: paths.reduce((n, p) => n + files[p].length, 0),
      size: bytes.length,
      sha256: await sha256(bytes),
      keyId: JSON.parse(fromUtf8(sBytes)).keyId,
    },
  };
}

/**
 * Читает и проверяет .nob. Никогда не бросает на плохой подписи — возвращает ok:false + errors.
 * @returns {{ok, errors, manifest, files, keyId, signed}}
 */
export async function readNob(bytes) {
  const errors = [];
  const res = { ok: false, errors, manifest: null, files: {}, keyId: null, signed: false };
  let entries;
  try {
    entries = await zipRead(bytes);
  } catch (e) {
    errors.push(e.message);
    return res;
  }
  const map = new Map();
  for (const e of entries) {
    try {
      safePath(e.path);
    } catch (err) {
      errors.push(err.message);
      return res;
    }
    map.set(e.path, e.data);
  }
  if (!map.has('META/NOB') || !fromUtf8(map.get('META/NOB')).startsWith('noodle-bundle')) {
    errors.push('нет META/NOB — это не Noodle Bundle');
    return res;
  }
  try {
    res.manifest = JSON.parse(fromUtf8(map.get('manifest.json')));
  } catch {
    errors.push('manifest.json отсутствует или повреждён');
    return res;
  }
  for (const [p, d] of map) if (p.startsWith('app/')) res.files[p.slice(4)] = d;
  const v = validateManifest(res.manifest, res.files);
  errors.push(...v.errors);
  // подпись и хэши
  try {
    const hBytes = map.get('META/hashes.json');
    const sig = JSON.parse(fromUtf8(map.get('META/signature.json')));
    const pub = await crypto.subtle.importKey('jwk', { ...sig.publicKey, ext: true }, ECDSA, false, ['verify']);
    const okSig = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64decode(sig.signature), hBytes);
    if (!okSig) errors.push('подпись недействительна');
    else {
      res.signed = true;
      res.keyId = await keyId(sig.publicKey);
    }
    const hashes = JSON.parse(fromUtf8(hBytes)).files;
    for (const [p, h] of Object.entries(hashes)) {
      if (!map.has(p)) errors.push(`в пакете нет файла ${p}`);
      else if ((await sha256(map.get(p))) !== h) errors.push(`файл изменён после подписи: ${p}`);
    }
    for (const p of map.keys()) if (!p.startsWith('META/') && !(p in hashes)) errors.push(`файл не покрыт подписью: ${p}`);
  } catch (e) {
    errors.push('подпись/хэши не читаются: ' + e.message);
  }
  res.ok = errors.length === 0;
  return res;
}

// ───────────────────────────── HTML-инъекция ─────────────────────────────

export const INJECT_BEGIN = '<!--noodle:begin-->';
export const INJECT_END = '<!--noodle:end-->';

/** Вставляет сниппет в <head> (или в начало документа). Снимается обратно через stripInjected(). */
export function injectHead(html, snippet) {
  const block = INJECT_BEGIN + snippet + INJECT_END;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + block);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + '<head>' + block + '</head>');
  return block + html;
}

export function stripInjected(html) {
  const re = new RegExp(INJECT_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + INJECT_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  return html.replace(re, '');
}

export const MIME = {
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon',
  wasm: 'application/wasm', txt: 'text/plain', md: 'text/markdown', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', mp3: 'audio/mpeg',
  ogg: 'audio/ogg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm',
};
export const mimeOf = (p) => MIME[(p.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
