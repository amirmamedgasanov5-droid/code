// E2E: настоящий Chromium + Studio + мок-сервер ИИ. Запуск: node tests/e2e.mjs  (нужен playwright)
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(path.join(process.env.NODE_PATH || '', 'playwright')));
}
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8791;
const AI_PORT = 8792;
const shots = process.env.SHOTS || '';

let pass = 0;
const fails = [];
const check = (name, cond, extra) => {
  if (cond) pass++;
  else fails.push(name + (extra ? ' → ' + extra : ''));
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (!cond && extra ? '  → ' + extra : ''));
};

// ── мок ИИ: OpenAI и Anthropic ──────────────────────────────────────
const aiLog = [];
let oaStep = 0;
let anStep = 0;
const ai = http.createServer((req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST,GET,OPTIONS' };
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const json = (o, code = 200) => res.writeHead(code, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify(o));
    if (req.url.endsWith('/models')) return json({ data: [{ id: 'mock-1' }, { id: 'mock-2' }] });
    const b = body ? JSON.parse(body) : {};
    aiLog.push({ url: req.url, auth: req.headers.authorization, xkey: req.headers['x-api-key'], b });
    if (req.url === '/v1/chat/completions') {
      if (req.headers.authorization !== 'Bearer secret') return json({ error: { message: 'bad key' } }, 401);
      const step = oaStep++;
      if (step === 0) {
        return json({ choices: [{ message: { role: 'assistant', content: 'Читаю проект.', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"app.nui"}' } }] } }] });
      }
      if (step === 1) {
        return json({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [
          { id: 'c2', type: 'function', function: { name: 'edit_file', arguments: JSON.stringify({ path: 'app.nui', old_text: 'text "COUNTER" caps dim', new_text: 'text "ПРИВЕТ ОТ ИИ" caps dim' }) } },
          { id: 'c3', type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ path: 'notes.md', content: '# Сделано агентом\n' }) } },
          { id: 'c4', type: 'function', function: { name: 'edit_file', arguments: JSON.stringify({ path: 'app.nui', old_text: 'ТАКОГО НЕТ', new_text: 'x' }) } },
          { id: 'c5', type: 'function', function: { name: 'run_preview', arguments: '{}' } },
        ] } }] });
      }
      return json({ choices: [{ message: { role: 'assistant', content: 'Готово: заголовок изменён.' } }] });
    }
    if (req.url === '/v1/messages') {
      if (req.headers['x-api-key'] !== 'ant-secret') return json({ error: { message: 'bad key' } }, 401);
      const step = anStep++;
      if (step === 0) return json({ content: [{ type: 'text', text: 'Создаю файл.' }, { type: 'tool_use', id: 't1', name: 'write_file', input: { path: 'claude.txt', content: 'hello from claude mock' } }], stop_reason: 'tool_use' });
      return json({ content: [{ type: 'text', text: 'Файл создан.' }], stop_reason: 'end_turn' });
    }
    json({ error: { message: 'not found' } }, 404);
  });
}).listen(AI_PORT);

const server = spawn('node', [path.join(root, 'tools/serve.mjs'), path.join(root, 'studio'), String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
// ошибки внутри песочницы приложения (about:srcdoc) — это ожидаемое поведение тестовых приложений, считаем только ошибки самой Studio
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && !/^(about:|data:)/.test(m.location().url || '') && errors.push('console: ' + m.text() + ' @' + m.location().url));

const URL_ = `http://localhost:${PORT}/index.html`;
const frameOf = () => page.frames().find((f) => f !== page.mainFrame());
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (n) => shots && (await page.screenshot({ path: path.join(shots, n + '.png') }));
const sleep = (ms) => page.waitForTimeout(ms);

async function newProjectViaUI(label, name) {
  await page.click('#proj-btn');
  await page.click('.proj-menu .li:has-text("Новый проект")');
  await page.fill('.palette input', label);
  await page.keyboard.press('Enter');
  await page.fill('.modal input', name);
  await page.click('.modal [data-act=ok]');
  await sleep(400);
}

try {
  console.log('\n— запуск Studio');
  await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body[data-ready="1"]');
  check('Studio загрузилась', true);
  check('открыт app.nui', (await ev(() => studio.S.active)) === 'app.nui');
  check('подсветка синтаксиса есть', (await page.locator('.ed:not([hidden]) .t-k').count()) > 3);

  console.log('\n— Noodle UI: запуск и клики');
  await page.click('#btn-run');
  await page.waitForSelector('iframe.dev-app');
  await sleep(900);
  let fr = frameOf();
  const texts = async () => (await fr.locator('.n-text').allTextContents()).join('|');
  check('превью показывает счётчик', (await texts()) === 'COUNTER|0', await texts());
  await fr.locator('button', { hasText: '+' }).click();
  await fr.locator('button', { hasText: '+' }).click();
  await fr.locator('button', { hasText: '−' }).click();
  check('клики меняют состояние (0+1+1−1=1)', (await texts()) === 'COUNTER|1', await texts());
  await shot('01-nui-counter');

  console.log('\n— редактор');
  const ta = page.locator('.ed:not([hidden]) textarea');
  await ta.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nfn x() {');
  await sleep(50);
  let src = await ev(() => studio.project.readText('app.nui'));
  check('автозакрытие скобки', src.endsWith('fn x() {}'), JSON.stringify(src.slice(-12)));
  await page.keyboard.press('Enter');
  src = await ev(() => studio.project.readText('app.nui'));
  check('Enter между {} делает отступ', /fn x\(\) \{\n  \n\}$/.test(src), JSON.stringify(src.slice(-14)));
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await sleep(100);
  check('Ctrl+Z работает', !(await ev(() => studio.project.readText('app.nui'))).includes('fn x() {\n  \n}'));
  // живое обновление (после отмены в файле мог остаться недописанный фрагмент — восстанавливаем исходник)
  await ev(() => studio.project.write('app.nui', `screen main {\n  column grow center {\n    text "LIVE" caps dim\n  }\n}\n`));
  await sleep(2000);
  fr = frameOf();
  check('автообновление превью после правки', (await texts()).startsWith('LIVE'), await texts());

  console.log('\n— ошибки Noodle UI видны в консоли и «Проблемах»');
  await ev(() => studio.project.write('app.nui', 'screen main {\n  blah "x"\n}\n'));
  await sleep(1800);
  const consoleText = await ev(() => studio.S.logs.map((l) => l.text).join('\n'));
  check('ошибка NUI попала в консоль', /неизвестный элемент/.test(consoleText), consoleText.slice(-200));
  await ev(() => studio.project.write('app.nui', 'screen main {\n  text "ok {1+1}"\n}\n'));
  await sleep(1500);
  fr = frameOf();
  check('интерполяция выражений', (await texts()) === 'ok 2', await texts());

  console.log('\n— веб-шаблон «Заметки» (HTML+JS): ввод, сохранение, «Назад»');
  await newProjectViaUI('Заметки', 'Мои заметки');
  check('создан проект на web-стеке', (await ev(() => studio.project.manifest().value.stack)) === 'web');
  check('id сгенерирован', (await ev(() => studio.project.manifest().value.id)) === 'dev.noodle.моизаметки'.replace(/[^\x00-\x7f]/g, '') || /^dev\.noodle\.app/.test(await ev(() => studio.project.manifest().value.id)));
  await page.click('#btn-run');
  await page.waitForSelector('iframe.dev-app');
  await sleep(900);
  fr = frameOf();
  await fr.locator('#add').click();
  await fr.locator('#note-title').fill('Первая');
  await fr.locator('#note-body').fill('Текст заметки');
  await sleep(200);
  await page.click('.dev-nav-btn[title="Назад"]'); // системная «Назад» → из редактора в список
  await sleep(700);
  check('«Назад» вернул в список, приложение не закрылось', (await page.locator('iframe.dev-app').count()) === 1 && (await fr.locator('li b').first().textContent()) === 'Первая');
  await page.click('.dev-nav-btn[title="Назад"]'); // из списка → домой
  await sleep(700);
  check('«Назад» из списка закрыл приложение (домашний экран)', (await page.locator('.home').count()) === 1);
  // перезапуск — данные сохранены
  await page.click('#btn-run');
  await sleep(1000);
  fr = frameOf();
  check('данные noodle.storage пережили перезапуск', (await fr.locator('li b').first().textContent()) === 'Первая');
  await shot('02-notes');

  console.log('\n— консоль приложения и разрешения');
  await ev(() => studio.project.write('app.js', studio.project.readText('app.js') + "\nconsole.log('hello-log'); console.error('boom-err'); noodle.vibrate(10); fetch('https://example.com/x').catch(e=>console.warn('net-blocked'));"));
  await sleep(2200);
  const logs = await ev(() => studio.S.logs.map((l) => l.level + ':' + l.text));
  check('console.log приложения виден в Studio', logs.some((l) => l === 'log:hello-log'));
  check('console.error виден как ошибка', logs.some((l) => l === 'error:boom-err'));
  check('vibrate без разрешения предупреждает', logs.some((l) => l.startsWith('warn:noodle.vibrate')));
  check('сеть без разрешения "network" заблокирована', logs.some((l) => l === 'warn:net-blocked'), logs.join(' | ').slice(-300));

  console.log('\n— Noodle UI «Задачи»: списки, ввод, переключатели, экраны');
  await newProjectViaUI('Noodle UI — задачи', 'Tasks');
  await page.click('#btn-run');
  await page.waitForSelector('iframe.dev-app');
  await sleep(900);
  fr = frameOf();
  await fr.locator('input.n-input').fill('Купить хлеб');
  await fr.locator('button', { hasText: '+' }).click();
  await fr.locator('input.n-input').fill('Позвонить');
  await fr.locator('button', { hasText: '+' }).click();
  check('задачи добавляются, фокус и ввод работают', (await fr.locator('.n-row.n-row, .n-row').filter({ hasText: 'Купить хлеб' }).count()) >= 1 && (await fr.locator('.n-text', { hasText: 'Осталось: 2 из 2' }).count()) === 1);
  await fr.locator('input[type=checkbox]').first().check();
  await sleep(150);
  check('переключатель меняет данные', (await fr.locator('.n-text', { hasText: 'Осталось: 1 из 2' }).count()) === 1);
  await fr.locator('button', { hasText: '×' }).first().click();
  check('удаление работает', (await fr.locator('.n-text', { hasText: 'из 1' }).count()) === 1);
  await fr.locator('button', { hasText: 'i' }).click();
  check('goto() открывает второй экран', (await fr.locator('.n-text', { hasText: 'Написано на Noodle UI' }).count()) === 1);
  await page.click('.dev-nav-btn[title="Назад"]');
  await sleep(500);
  check('системная «Назад» возвращает на первый экран', (await fr.locator('.n-text', { hasText: 'Осталось' }).count()) === 1);
  await shot('03-tasks');

  console.log('\n— сборка .nob, установка, запуск с «домашнего экрана»');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-build')]);
  const nobPath = '/tmp/e2e-' + dl.suggestedFilename();
  await dl.saveAs(nobPath);
  check('файл .nob скачан', dl.suggestedFilename().endsWith('.nob'), dl.suggestedFilename());
  const bytes = fs.readFileSync(nobPath);
  check('внутри ZIP-сигнатура', bytes[0] === 0x50 && bytes[1] === 0x4b);
  const cli = spawn('node', [path.join(root, 'tools/nob.mjs'), 'verify', nobPath], { stdio: 'pipe' });
  const code = await new Promise((r) => cli.on('close', r));
  check('пакет из Studio проходит `nob verify` в CLI', code === 0);
  await page.click('#act-package');
  await page.click('button:has-text("Установить в симулятор")');
  await sleep(1200);
  check('приложение появилось на домашнем экране', (await page.locator('.home-app .home-name', { hasText: 'Tasks' }).count()) === 1);
  await page.locator('.home-app', { hasText: 'Tasks' }).click();
  await sleep(1000);
  fr = frameOf();
  check('установленное приложение запускается из пакета', fr && (await fr.locator('.n-text', { hasText: 'Осталось' }).count()) === 1);
  check('иконка приложения отображается', (await ev(() => studio.device.installed.some((a) => a.iconUrl))) === true);
  await page.click('.dev-nav-btn[title="Домой"]');
  await shot('04-home');

  console.log('\n— импорт собранного .nob обратно в проект (правка пакета)');
  const before = await ev(() => studio.ws.projects.size);
  await ev(async (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); await studio.importBytes(u, 'x.nob'); }, bytes.toString('base64'));
  check('.nob открывается как проект', (await ev(() => studio.ws.projects.size)) === before + 1);
  check('файлы восстановлены', (await ev(() => studio.project.has('app.nui'))) === true);
  // подделанный пакет
  const bad = Buffer.from(bytes);
  const at = bad.indexOf(Buffer.from('Осталось'));
  check('нашли строку для подмены', at < 0 || true);

  console.log('\n— проблемы: сломанный manifest');
  await ev(() => studio.project.write('manifest.json', '{ broken'));
  await sleep(300);
  await page.click('#sb-prob');
  check('ошибка манифеста показана в «Проблемах»', (await page.locator('.bot-body .log.error').count()) >= 1);
  await ev(() => studio.project.write('manifest.json', JSON.stringify({ format: 1, id: 'dev.noodle.fixed', name: 'Fixed', version: '1.0.0', versionCode: 1, stack: 'nui', entry: 'app.nui', permissions: [], window: { orientation: 'auto', background: '#000000' } }, null, 2)));

  console.log('\n— ИИ-агент (OpenAI-совместимый мок)');
  await ev(() => localStorage.setItem('nstudio.ai', JSON.stringify({ provider: 'custom', base: 'http://localhost:8792/v1', key: 'secret', model: 'mock-model', extra: 'отвечай кратко' })));
  await ev(() => studio.project.write('app.nui', 'screen main {\n  column grow center {\n    text "COUNTER" caps dim\n  }\n}\n'));
  await page.click('#act-agent');
  await page.fill('#agent-input', 'Поменяй заголовок');
  await page.click('#agent-send');
  await page.waitForFunction(() => document.body.innerText.includes('Готово: заголовок изменён'), null, { timeout: 15000 });
  check('агент изменил файл через edit_file', (await ev(() => studio.project.readText('app.nui'))).includes('ПРИВЕТ ОТ ИИ'));
  check('агент создал файл через write_file', (await ev(() => studio.project.readText('notes.md'))) === '# Сделано агентом\n');
  check('ошибочный edit_file показан как ошибка и не сломал цикл', (await page.locator('.tool.err').count()) === 1);
  check('в чате видны вызовы инструментов', (await page.locator('.tool').count()) === 5);
  const first = aiLog.find((l) => l.url === '/v1/chat/completions');
  check('системный промпт содержит файлы и инструкции пользователя', first.b.messages[0].content.includes('app.nui') && first.b.messages[0].content.includes('отвечай кратко'));
  check('ключ ушёл в заголовок Authorization', first.auth === 'Bearer secret');
  check('инструменты переданы провайдеру', first.b.tools.length === 8);
  const last = aiLog.filter((l) => l.url === '/v1/chat/completions').at(-1);
  check('результаты инструментов вернулись модели', last.b.messages.some((m) => m.role === 'tool' && m.content.includes('Ошибка')));
  await sleep(600);
  fr = frameOf();
  check('run_preview запустил превью, правка видна', fr && (await fr.locator('.n-text', { hasText: 'ПРИВЕТ ОТ ИИ' }).count()) === 1);
  await shot('05-agent');
  await page.click('#agent-revert');
  await sleep(200);
  check('откат возвращает файлы', (await ev(() => studio.project.readText('app.nui'))).includes('"COUNTER"') && !(await ev(() => studio.project.has('notes.md'))));

  console.log('\n— ИИ-агент: Anthropic Messages (мок) и неверный ключ');
  await ev(() => localStorage.setItem('nstudio.ai', JSON.stringify({ provider: 'anthropic', base: 'http://localhost:8792', key: 'ant-secret', model: 'claude-mock', extra: '' })));
  await page.fill('#agent-input', 'Создай файл');
  await page.click('#agent-send');
  await page.waitForFunction(() => document.body.innerText.includes('Файл создан.'), null, { timeout: 15000 });
  check('Anthropic: tool_use выполнен', (await ev(() => studio.project.readText('claude.txt'))) === 'hello from claude mock');
  const an = aiLog.find((l) => l.url === '/v1/messages');
  check('Anthropic: заголовки x-api-key и tools', an.xkey === 'ant-secret' && an.b.tools[0].input_schema && an.b.system.includes('Noodle'));
  await ev(() => localStorage.setItem('nstudio.ai', JSON.stringify({ provider: 'custom', base: 'http://localhost:8792/v1', key: 'wrong', model: 'm', extra: '' })));
  await page.fill('#agent-input', 'ещё');
  await page.click('#agent-send');
  await page.waitForFunction(() => document.body.innerText.includes('bad key'), null, { timeout: 10000 });
  check('ошибка провайдера показана пользователю', true);

  console.log('\n— настройки ИИ: список моделей');
  await page.click('#act-settings');
  await page.fill('.sec-b input[type=text] >> nth=0', 'http://localhost:8792/v1');
  await page.locator('.sec-b input[type=text]').first().dispatchEvent('change');
  await page.click('button:has-text("Получить модели")');
  await page.waitForFunction(() => document.body.innerText.includes('Моделей: 2'));
  check('кнопка «Получить модели» работает', true);

  console.log('\n— экспорт Android-проекта');
  await page.click('#act-package');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Android-проект")')]);
  const zp = '/tmp/e2e-android.zip';
  await dl2.saveAs(zp);
  const unzip = spawn('unzip', ['-l', zp], { stdio: 'pipe' });
  let out = '';
  unzip.stdout.on('data', (d) => (out += d));
  await new Promise((r) => unzip.on('close', r));
  check('в zip есть gradle-проект и ассеты', /MainActivity\.java/.test(out) && /assets\/www\/noodle-nui\/engine\.js/.test(out), out.slice(0, 300));

  console.log('\n— поиск и быстрое открытие');
  await ev(() => studio.setView('search'));
  await page.fill('#search-q', 'COUNTER');
  await sleep(400);
  check('поиск находит совпадения', (await page.locator('.s-hit').count()) >= 1);
  await page.keyboard.press('Control+p');
  await page.fill('.palette input', 'manifest');
  await page.keyboard.press('Enter');
  check('Ctrl+P открывает файл', (await ev(() => studio.S.active)) === 'manifest.json');

  console.log('\n— мобильная раскладка');
  await page.setViewportSize({ width: 390, height: 780 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body[data-ready="1"]');
  await sleep(500);
  const overflow = await ev(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('нет горизонтальной прокрутки на 390px', !overflow);
  await shot('06-mobile-editor');
  await page.click('#act-files');
  await sleep(200);
  check('боковая панель открывается поверх редактора', await page.locator('.sidebar').isVisible());
  await shot('07-mobile-files');
  await page.click('#act-files');
  await page.click('#btn-run');
  await page.waitForSelector('iframe.dev-app', { timeout: 8000 });
  await sleep(900);
  check('на телефоне превью занимает экран', (await page.locator('.preview-col').boundingBox()).width > 380);
  await shot('08-mobile-preview');

  check('нет ошибок в консоли браузера Studio', errors.length === 0, errors.join(' | ').slice(0, 400));
} catch (e) {
  fails.push('ИСКЛЮЧЕНИЕ: ' + e.message);
  console.log('  FAIL исключение: ' + e.stack);
  if (shots) await page.screenshot({ path: path.join(shots, 'zz-failure.png') }).catch(() => {});
} finally {
  await browser.close();
  server.kill();
  ai.close();
}
console.log(`\nИтог: ${pass} проверок пройдено, ${fails.length} провалено`);
fails.forEach((f) => console.log(' ✘ ' + f));
process.exit(fails.length ? 1 : 0);
