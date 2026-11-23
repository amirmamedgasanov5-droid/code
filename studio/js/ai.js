// ИИ-агент. Работает с любым провайдером:
//   kind "openai"    — любой OpenAI-совместимый /chat/completions (OpenAI, OpenRouter, Gemini, DeepSeek, Groq, Ollama, LM Studio…)
//   kind "anthropic" — Anthropic Messages API (Claude)
// Агент редактирует файлы проекта через инструменты и сам проверяет результат запуском превью.

export const PROVIDERS = {
  openai: { label: 'OpenAI', kind: 'openai', base: 'https://api.openai.com/v1', model: 'gpt-4o' },
  anthropic: { label: 'Anthropic (Claude)', kind: 'anthropic', base: 'https://api.anthropic.com', model: 'claude-sonnet-5-5' },
  gemini: { label: 'Google Gemini', kind: 'openai', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
  openrouter: { label: 'OpenRouter', kind: 'openai', base: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o' },
  deepseek: { label: 'DeepSeek', kind: 'openai', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  groq: { label: 'Groq', kind: 'openai', base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  ollama: { label: 'Ollama (локально)', kind: 'openai', base: 'http://localhost:11434/v1', model: 'qwen2.5-coder' },
  custom: { label: 'Свой (OpenAI-совместимый)', kind: 'openai', base: '', model: '' },
};

export const TOOLS = [
  { name: 'list_files', description: 'Список всех файлов проекта с размерами.', parameters: { type: 'object', properties: {} } },
  { name: 'read_file', description: 'Прочитать текстовый файл целиком.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  {
    name: 'write_file',
    description: 'Создать файл или полностью перезаписать его. Для небольших правок лучше edit_file.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
  },
  {
    name: 'edit_file',
    description: 'Заменить ровно одно вхождение old_text на new_text. old_text должен встречаться в файле ровно один раз (включите соседние строки для уникальности).',
    parameters: { type: 'object', properties: { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['path', 'old_text', 'new_text'] },
  },
  { name: 'delete_file', description: 'Удалить файл.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'rename_file', description: 'Переименовать/переместить файл.', parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] } },
  {
    name: 'run_preview',
    description: 'Перезапустить превью приложения и вернуть сообщения консоли и ошибки за ~1.5 с после запуска. Вызывайте после правок, чтобы убедиться, что приложение работает.',
    parameters: { type: 'object', properties: {} },
  },
  { name: 'check_package', description: 'Проверить manifest.json и проект на ошибки сборки .nob.', parameters: { type: 'object', properties: {} } },
];

export function systemPrompt(project, extra, activePath) {
  const files = project.paths().map((p) => '  ' + p).join('\n');
  return `Ты — агент-разработчик внутри Noodle Studio, IDE для приложений Noodle.OS. Ты редактируешь файлы проекта пользователя через инструменты.

Приложение Noodle — это папка с manifest.json и веб-файлами (HTML/CSS/JS, можно .wasm). Оно собирается в подписанный пакет .nob и запускается в песочнице Noodle.OS.
Рантайм добавляет глобальный объект \`noodle\`:
  noodle.storage.get(key, fallback) / set(key, value) / remove(key) / keys() — JSON-хранилище, переживает перезапуск
  noodle.toast(text) — всплывающее сообщение
  noodle.vibrate(ms) — вибрация (нужно разрешение "vibrate" в manifest.json)
  noodle.onBack(fn) — обработчик системной кнопки «Назад»; верни true, если обработал сам (иначе приложение закроется)
  noodle.exit() — закрыть приложение; noodle.saveFile(name, data, mime) — сохранить файл пользователю
  noodle.platform — 'preview' | 'android' | 'web'
Сеть (fetch/XHR к внешним адресам) работает только при "network" в permissions манифеста. Не подключай скрипты и шрифты с CDN: приложение должно работать офлайн.
manifest.json: format=1, id (com.company.app, строчные), name, version (1.0.0), versionCode (целое), entry (.html), icon (.svg/.png), permissions (["network","vibrate"]), window{orientation: portrait|landscape|auto, background:"#RRGGBB", statusBar: light|dark}.

Правила работы:
- Сначала посмотри нужные файлы (list_files/read_file), потом правь. Для точечных изменений используй edit_file, для новых файлов — write_file.
- Не ломай manifest.json; entry и icon должны указывать на существующие файлы.
- После правок вызови run_preview и исправь ошибки консоли, если они есть. В конце вызови check_package.
- Дизайн по умолчанию: строгий чёрно-белый, без градиентов и декоративных эффектов, крупные элементы, удобные для касания (≥44px).
- Отвечай кратко, на языке пользователя. Не пересказывай код — он уже в файлах.

Файлы проекта «${project.name}»:
${files}
${activePath ? `\nСейчас у пользователя открыт файл: ${activePath}\n` : ''}${extra ? `\nДополнительные инструкции пользователя:\n${extra}\n` : ''}`;
}

/** Выполнение инструментов над проектом. host: { project, runPreview(): Promise<string> } */
export async function execTool(host, name, args) {
  const p = host.project;
  const need = (k) => {
    if (typeof args[k] !== 'string') throw new Error(`нужен строковый параметр «${k}»`);
    return args[k].replace(/^\.\//, '').replace(/^\//, '');
  };
  switch (name) {
    case 'list_files':
      return p.paths().map((f) => `${f}  (${(typeof p.read(f) === 'string' ? p.read(f).length : p.read(f).length)} B)`).join('\n') || '(пусто)';
    case 'read_file': {
      const f = need('path');
      if (!p.has(f)) throw new Error('файла нет: ' + f);
      const v = p.read(f);
      if (typeof v !== 'string') return `(бинарный файл, ${v.length} байт)`;
      return v.length > 60000 ? v.slice(0, 60000) + '\n…(обрезано)' : v;
    }
    case 'write_file': {
      const f = need('path');
      if (typeof args.content !== 'string') throw new Error('нужен параметр content');
      const existed = p.has(f);
      p.write(f, args.content);
      return `${existed ? 'перезаписан' : 'создан'} ${f} (${args.content.split('\n').length} строк)`;
    }
    case 'edit_file': {
      const f = need('path');
      if (!p.has(f)) throw new Error('файла нет: ' + f);
      if (typeof args.old_text !== 'string' || typeof args.new_text !== 'string') throw new Error('нужны old_text и new_text');
      const text = p.readText(f);
      const n = args.old_text ? text.split(args.old_text).length - 1 : 0;
      if (n === 0) throw new Error('old_text не найден в файле (проверьте пробелы и отступы)');
      if (n > 1) throw new Error(`old_text встречается ${n} раз — добавьте контекст, чтобы он был уникален`);
      p.write(f, text.replace(args.old_text, () => args.new_text));
      return `изменён ${f}`;
    }
    case 'delete_file': {
      const f = need('path');
      if (!p.has(f)) throw new Error('файла нет: ' + f);
      if (f === 'manifest.json') throw new Error('manifest.json удалять нельзя');
      p.delete(f);
      return 'удалён ' + f;
    }
    case 'rename_file': {
      const from = need('from');
      const to = need('to');
      if (!p.has(from)) throw new Error('файла нет: ' + from);
      p.rename(from, to);
      return `${from} → ${to}`;
    }
    case 'run_preview':
      return host.runPreview();
    case 'check_package': {
      const pr = p.problems();
      return pr.length ? pr.map((x) => `${x.severity} ${x.path}: ${x.text}`).join('\n') : 'ok: ошибок нет, пакет можно собирать';
    }
    default:
      throw new Error('неизвестный инструмент: ' + name);
  }
}

// ───────────────────────────── адаптеры провайдеров ─────────────────────────────

const trimSlash = (s) => s.replace(/\/+$/, '');

async function post(url, headers, body, signal) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error(`сетевая ошибка (${e.message}). Проверьте адрес, интернет и CORS провайдера.`);
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 400);
    try {
      const j = JSON.parse(text);
      msg = j.error?.message || j.message || msg;
    } catch {
      /* не JSON */
    }
    throw new Error(`${res.status} ${res.statusText}: ${msg}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('ответ не JSON: ' + text.slice(0, 200));
  }
}

const parseArgs = (s) => {
  if (s && typeof s === 'object') return s;
  try {
    return s ? JSON.parse(s) : {};
  } catch {
    return { __error: 'аргументы инструмента — невалидный JSON' };
  }
};

class OpenAIAdapter {
  constructor(cfg) {
    this.cfg = cfg;
    this.messages = [];
  }
  init(system, userText) {
    this.messages = [{ role: 'system', content: system }, { role: 'user', content: userText }];
  }
  addUser(t) {
    this.messages.push({ role: 'user', content: t });
  }
  async step(signal) {
    const { base, key, model } = this.cfg;
    const body = {
      model,
      messages: this.messages,
      tools: TOOLS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
    };
    const j = await post(trimSlash(base) + '/chat/completions', key ? { authorization: 'Bearer ' + key } : {}, body, signal);
    const msg = j.choices?.[0]?.message;
    if (!msg) throw new Error('пустой ответ модели');
    const m = { role: 'assistant', content: msg.content ?? null };
    if (msg.tool_calls?.length) m.tool_calls = msg.tool_calls;
    this.messages.push(m);
    return {
      text: typeof msg.content === 'string' ? msg.content : '',
      calls: (msg.tool_calls || []).map((c) => ({ id: c.id, name: c.function?.name, args: parseArgs(c.function?.arguments) })),
    };
  }
  addResults(results) {
    for (const r of results) this.messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
  }
}

class AnthropicAdapter {
  constructor(cfg) {
    this.cfg = cfg;
    this.messages = [];
  }
  init(system, userText) {
    this.system = system;
    this.messages = [{ role: 'user', content: userText }];
  }
  addUser(t) {
    this.messages.push({ role: 'user', content: t });
  }
  async step(signal) {
    const { base, key, model } = this.cfg;
    const b = trimSlash(base);
    const url = b.endsWith('/v1') ? b + '/messages' : b + '/v1/messages';
    const body = {
      model,
      max_tokens: 8192,
      system: this.system,
      messages: this.messages,
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
    };
    const j = await post(url, { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body, signal);
    if (!Array.isArray(j.content)) throw new Error('пустой ответ модели');
    this.messages.push({ role: 'assistant', content: j.content });
    return {
      text: j.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n'),
      calls: j.content.filter((c) => c.type === 'tool_use').map((c) => ({ id: c.id, name: c.name, args: parseArgs(c.input) })),
    };
  }
  addResults(results) {
    this.messages.push({ role: 'user', content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content, is_error: !!r.error })) });
  }
}

export function makeAdapter(cfg) {
  return cfg.kind === 'anthropic' ? new AnthropicAdapter(cfg) : new OpenAIAdapter(cfg);
}

/** Список моделей провайдера (для подсказок в настройках). */
export async function listModels(cfg) {
  const b = trimSlash(cfg.base);
  const url = cfg.kind === 'anthropic' ? (b.endsWith('/v1') ? b : b + '/v1') + '/models?limit=100' : b + '/models';
  const headers = cfg.kind === 'anthropic' ? { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } : cfg.key ? { authorization: 'Bearer ' + cfg.key } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const j = await res.json();
  const arr = j.data || j.models || [];
  return arr.map((m) => (typeof m === 'string' ? m : (m.id || m.name || '').replace(/^models\//, ''))).filter(Boolean).sort();
}

/**
 * Цикл агента. events: { onText(t), onTool({name,args,status,result}), onStep() }.
 * Возвращает { steps, stopped }.
 */
export async function runAgent({ cfg, host, userText, history, extra, activePath, signal, events, maxSteps = 14 }) {
  const adapter = history.adapter && history.adapter.cfg.kind === cfg.kind ? history.adapter : makeAdapter(cfg);
  adapter.cfg = cfg;
  const sys = systemPrompt(host.project, extra, activePath);
  if (adapter.messages.length === 0) adapter.init(sys, userText);
  else {
    // свежий список файлов и системный промпт на каждый новый запрос
    if (cfg.kind === 'anthropic') adapter.system = sys;
    else adapter.messages[0] = { role: 'system', content: sys };
    adapter.addUser(userText);
  }
  history.adapter = adapter;
  for (let step = 0; step < maxSteps; step++) {
    if (signal.aborted) return { stopped: true };
    events.onStep && events.onStep(step);
    const r = await adapter.step(signal);
    if (r.text) events.onText(r.text);
    if (!r.calls.length) return { done: true };
    const results = [];
    for (const c of r.calls) {
      const ev = { name: c.name, args: c.args, status: 'run' };
      events.onTool(ev);
      try {
        if (c.args.__error) throw new Error(c.args.__error);
        const out = await execTool(host, c.name, c.args);
        results.push({ id: c.id, content: String(out) });
        ev.status = 'ok';
        ev.result = String(out);
      } catch (e) {
        results.push({ id: c.id, content: 'Ошибка: ' + e.message, error: true });
        ev.status = 'err';
        ev.result = e.message;
      }
      events.onTool(ev);
    }
    adapter.addResults(results);
  }
  events.onText(`Остановлено: достигнут лимит в ${maxSteps} шагов.`);
  return { limit: true };
}
