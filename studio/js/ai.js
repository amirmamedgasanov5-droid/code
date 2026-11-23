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
    description: 'Перезапустить превью приложения и вернуть сообщения консоли (print, ошибки выполнения) за ~1.5 с после запуска. Вызывайте после правок.',
    parameters: { type: 'object', properties: {} },
  },
  { name: 'check_package', description: 'Скомпилировать проект и проверить manifest.json: вернёт ошибки с номерами строк либо «ok».', parameters: { type: 'object', properties: {} } },
];

const NOODLE_GUIDE = `Ты — агент-разработчик внутри Noodle Studio, IDE для НАТИВНЫХ приложений Noodle.OS. Приложения пишутся на Noodle UI (.nui, интерфейс) и Noodle Script (код), компилируются в байткод и исполняются нативным рантаймом (не веб, не Android). Ты правишь файлы проекта через инструменты.

ЯЗЫК (синтаксис в стиле Kotlin/Swift; блоки в {}, оператор заканчивается переводом строки или «;»)
Верхний уровень файла:
  app "Название"
  state имя = выражение [persist]     // глобальное состояние; persist — сохраняется между запусками
  let имя = выражение                  // глобальная константа/значение
  fn имя(параметры) { … }
  screen имя { элементы интерфейса }   // экран «main» (или первый) открывается при старте
Операторы: let x = e, x = e, x += e (также -= *= /= %=), a.b = e, a[i] = e, if/else if/else, while, for x in список, for i, x in список, for k, v in словарь, return, break, continue.
Выражения: числа, "строки с {интерполяцией выражений}" (\\{ — литеральная скобка), 'сырые строки', true/false/null, [список, ...другой], {ключ: значение, ...другой}, a.b, a[i], f(x), список.метод(x), fn(a, b) { … } и fn(x) => x * 2, a ? b : c, a ?? b, диапазон 0..10, операторы + - * / % == != < <= > >= && || !.
Ложь: null, false, 0, "". Списки и словари — ссылки. Типы: number, string, bool, list, map, function, null.
Встроенные функции (можно вызывать и как методы: items.push(x), s.upper()):
  print str num int bool type len repr json parse_json
  abs floor ceil round(x,знаков) sqrt pow sin cos min max clamp random(), random(n), random(a,b)
  upper lower trim split(s,sep) join(list,sep) replace starts_with ends_with repeat pad_start(s,n,ch) pad_end fixed(n,знаков) index_of contains slice(x,a,b)
  push pop insert(list,i,v) remove(list,i) delete(map,key) concat reverse sort(list[,cmp]) sort_by(list,fn) map filter find find_index reduce(list,init,fn) any all sum keys values has range(a,b) list copy
  now() time_parts(ms) → {year,month,day,hour,minute,second,weekday}
  after(мс, fn) every(мс, fn) cancel(id) goto("экран") back() toast(текст) vibrate(мс) exit() save(ключ, значение) load(ключ, по_умолчанию)
Хук fn on_back() { … } — вернуть true, если «Назад» обработано приложением.
После изменения state интерфейс перестраивается автоматически.

ИНТЕРФЕЙС (элемент пишется в одну строку: тип "текст" атрибут=значение флаг { дети })
Элементы: column, row, box, scroll, text "…", button "…", input, area (многострочное), toggle, slider, spacer, divider, bar "Заголовок", progress; внутри экранов также if условие { … } else { … }, each список as элемент[, индекс] { … }, let x = …
Атрибуты: padding px py pt pr pb pl gap width height (число или "50%") grow (число или флаг) align=start|center|end|stretch justify=start|center|end|between center (в контейнере — центрировать содержимое; в text — выровнять текст) bg color radius border size weight (300/400/600) dim caps mono bold min_height
  button: on=функция | on={ оператор; оператор } primary ghost full disabled={условие}
  input/area: bind=переменная (или поле a.b, a[i].c) placeholder="…" type=number|password on_submit=функция on={…}
  toggle: bind=переменная; slider: bind=переменная min max step; progress: value={0..1}
  bar "Заголовок" { кнопки справа } — кнопка «назад» появляется сама на втором и последующих экранах
Значение атрибута: число, "строка {с интерполяцией}", имя функции/переменной, {выражение} или {операторы} для on.
Цвета: "#RRGGBB", white, black, gray, red, green, blue, yellow. Дизайн по умолчанию — строгий чёрно-белый, без градиентов; нажимаемые элементы не меньше 44.
Изображений пока нет. Сети нет — приложение полностью офлайн; данные храните через state … persist или save/load.

ПРАВИЛА РАБОТЫ
- Сначала list_files/read_file, потом правь: edit_file для точечных правок, write_file для новых файлов.
- После правок вызови check_package (компиляция покажет ошибки с номерами строк), затем run_preview и посмотри консоль; исправь найденное.
- Не ломай manifest.json: stack "noodle", entry — файл .nui. Новые файлы .nui/.ns автоматически входят в сборку.
- Отвечай кратко, на языке пользователя; код не пересказывай.`;

const WEB_GUIDE = `Ты — агент-разработчик внутри Noodle Studio. Проект на стеке web: HTML/CSS/JS в песочнице с объектом noodle (storage.get/set, toast, vibrate, onBack, exit, saveFile, platform). Не подключай CDN — приложение должно работать офлайн. После правок вызови run_preview и check_package. Правь файлы через инструменты, отвечай кратко.`;

export function systemPrompt(project, extra, activePath) {
  const files = project.paths().map((p) => '  ' + p).join('\n');
  const stack = project.manifest().value?.stack || 'noodle';
  const guide = stack === 'noodle' ? NOODLE_GUIDE : WEB_GUIDE;
  return `${guide}

manifest.json: format=1, id (com.company.app), name, version (1.0.0), versionCode, stack, entry, icon (.svg/.png), permissions (["vibrate"]${stack === 'web' ? ', "network"' : ''}).

Файлы проекта «${project.name}» (стек ${stack}):
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
      if (host.check) return host.check();
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
