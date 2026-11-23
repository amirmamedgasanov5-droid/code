// Хранилище на IndexedDB (с запасным вариантом в памяти, если IDB недоступна).
const DB = 'noodle-studio';
const ST = 'kv';
let dbp = null;
const mem = new Map();

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(ST);
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => resolve(null);
      rq.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

async function tx(mode, fn) {
  const db = await open();
  if (!db) return fn(null);
  return new Promise((resolve, reject) => {
    const t = db.transaction(ST, mode);
    const r = fn(t.objectStore(ST));
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const store = {
  persistent: true,
  async get(key) {
    const db = await open();
    if (!db) return mem.get(key);
    return tx('readonly', (s) => s.get(key));
  },
  async set(key, value) {
    const db = await open();
    if (!db) return void mem.set(key, value);
    return tx('readwrite', (s) => s.put(value, key));
  },
  async del(key) {
    const db = await open();
    if (!db) return void mem.delete(key);
    return tx('readwrite', (s) => s.delete(key));
  },
  async keys(prefix = '') {
    const db = await open();
    if (!db) return [...mem.keys()].filter((k) => k.startsWith(prefix));
    const all = await tx('readonly', (s) => s.getAllKeys());
    return all.filter((k) => String(k).startsWith(prefix));
  },
};

/** localStorage с защитой от исключений. */
export const prefs = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('nstudio.' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('nstudio.' + key, JSON.stringify(value));
    } catch {
      /* квота/запрет — не критично */
    }
  },
};
