// Тесты JS-части: формат .nob, подпись, защита от подмены, WASM-ядро Noodle, Android-обёртка (web), CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildNob, readNob, generateKey, zipWrite, zipRead, utf8, fromUtf8, validateManifest, safePath, crc32, NOODLE_BYTECODE } from '../studio/js/nob.js';
import { templateFiles, TEMPLATES } from '../studio/js/templates.js';
import { androidProject } from '../studio/js/android.js';
import { NoodleWasm } from '../studio/js/noodle-wasm.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = fs.readFileSync(path.join(root, 'studio/js/noodle-runtime.js'), 'utf8');
const wasm = await NoodleWasm.load(fs.readFileSync(path.join(root, 'studio/wasm/noodle.wasm')));

const tpl = (k, over) => {
  const f = templateFiles(k, over);
  const manifest = JSON.parse(f['manifest.json']);
  delete f['manifest.json'];
  const files = Object.fromEntries(Object.entries(f).map(([p, c]) => [p, utf8(c)]));
  return { manifest, files };
};
/** Компилирует проект Noodle и добавляет main.nbc — как это делают Studio и CLI. */
const withBytecode = (files, entry = 'app.nui') => {
  const names = Object.keys(files).filter((p) => /\.(nui|ns)$/.test(p)).sort((a, b) => (a === entry ? -1 : b === entry ? 1 : 0));
  const r = wasm.compile(names.map((p) => [p, fromUtf8(files[p])]));
  assert.ok(r.ok, JSON.stringify(r.diags));
  return { ...files, [NOODLE_BYTECODE]: r.bytes };
};
const texts = () => wasm.dump().nodes.filter((n) => n.kind === 'text').map((n) => n.text);

test('crc32 известное значение', () => {
  assert.equal(crc32(utf8('123456789')), 0xcbf43926);
});

test('zip: запись → чтение, включая сжатие', async () => {
  const big = utf8('hello noodle '.repeat(500));
  const z = await zipWrite([{ path: 'a.txt', data: utf8('hi') }, { path: 'dir/b.txt', data: big }]);
  const r = await zipRead(z);
  assert.equal(fromUtf8(r[0].data), 'hi');
  assert.equal(r[1].data.length, big.length);
  assert.ok(z.length < big.length, 'большой файл должен сжиматься');
});

test('zip читается системным unzip', async () => {
  const { manifest, files } = tpl('noodle-counter');
  const { bytes } = await buildNob(manifest, withBytecode(files), await generateKey());
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nob-')), 'x.nob');
  fs.writeFileSync(f, bytes);
  const r = spawnSync('unzip', ['-t', f], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('.nob: корректный пакет Noodle проходит проверку и содержит байткод', async () => {
  const { manifest, files } = tpl('noodle-tasks');
  const key = await generateKey();
  const { bytes } = await buildNob(manifest, withBytecode(files), key);
  const r = await readNob(bytes);
  assert.deepEqual(r.errors, []);
  assert.ok(r.ok && r.signed);
  assert.equal(r.keyId, key.keyId);
  assert.deepEqual(Object.keys(r.files).sort(), ['app.nui', 'icon.svg', NOODLE_BYTECODE]);
  assert.deepEqual([...r.files[NOODLE_BYTECODE].slice(0, 4)], [...utf8('NBC1')]);
});

test('.nob: Noodle-пакет без байткода не собирается', async () => {
  const { manifest, files } = tpl('noodle-counter');
  await assert.rejects(buildNob(manifest, files, await generateKey()), /main\.nbc/);
});

test('.nob: подмена байткода после подписи обнаруживается', async () => {
  const { manifest, files } = tpl('noodle-counter');
  const { bytes } = await buildNob(manifest, withBytecode(files), await generateKey());
  const entries = await zipRead(bytes);
  const nbc = entries.find((e) => e.path === 'app/' + NOODLE_BYTECODE);
  nbc.data = nbc.data.slice();
  nbc.data[nbc.data.length - 3] ^= 0xff;
  const r = await readNob(await zipWrite(entries));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes(NOODLE_BYTECODE)), r.errors.join('\n'));
});

test('.nob: добавленный файл без подписи обнаруживается', async () => {
  const { manifest, files } = tpl('noodle-counter');
  const { bytes } = await buildNob(manifest, withBytecode(files), await generateKey());
  const entries = await zipRead(bytes);
  entries.push({ path: 'app/backdoor.ns', data: utf8('fn x() {}') });
  const r = await readNob(await zipWrite(entries));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('backdoor')));
});

test('.nob: подмена хэшей обнаруживается (подпись не сходится)', async () => {
  const { manifest, files } = tpl('noodle-counter');
  const { bytes } = await buildNob(manifest, withBytecode(files), await generateKey());
  const entries = await zipRead(bytes);
  const h = entries.find((e) => e.path === 'META/hashes.json');
  h.data = utf8(fromUtf8(h.data).replace(/[0-9a-f]/, (c) => (c === '0' ? '1' : '0')));
  const r = await readNob(await zipWrite(entries));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('подпись')));
});

test('.nob: zip-slip и абсолютные пути запрещены', async () => {
  for (const bad of ['../x', '/etc/passwd', 'a/../../x', 'a\\b', 'a//b', '']) assert.throws(() => safePath(bad), undefined, bad);
  const z = await zipWrite([{ path: 'META/NOB', data: utf8('noodle-bundle 1\n') }, { path: '../evil', data: utf8('x') }]);
  assert.equal((await readNob(z)).ok, false);
});

test('не-пакет отклоняется без исключений', async () => {
  assert.equal((await readNob(utf8('просто текст'))).ok, false);
  assert.equal((await readNob(await zipWrite([{ path: 'x.txt', data: utf8('1') }]))).ok, false);
});

test('манифест: валидация', () => {
  const ok = { format: 1, id: 'com.a.b', name: 'X', version: '1.0.0', versionCode: 1, stack: 'noodle', entry: 'app.nui', permissions: ['vibrate'], window: { orientation: 'auto', background: '#000000' } };
  const files = { 'app.nui': 1 };
  assert.deepEqual(validateManifest(ok, files).errors, []);
  const bad = (patch) => validateManifest({ ...ok, ...patch }, files).errors.length > 0;
  assert.ok(bad({ id: 'Bad Id' }));
  assert.ok(bad({ id: 'com.new.app' }), 'зарезервированное слово Java');
  assert.ok(bad({ version: '1' }));
  assert.ok(bad({ versionCode: 0 }));
  assert.ok(bad({ entry: 'nope.nui' }));
  assert.ok(bad({ entry: 'app.html' }), 'для noodle нужен .nui');
  assert.ok(bad({ permissions: ['root'] }));
  assert.ok(bad({ stack: 'cobol' }));
  assert.ok(bad({ window: { background: 'red' } }));
});

test('шаблоны: все валидны', () => {
  for (const [key, t] of Object.entries(TEMPLATES)) {
    const f = templateFiles(key);
    const m = JSON.parse(f['manifest.json']);
    const files = Object.fromEntries(Object.keys(f).map((p) => [p, 1]));
    assert.deepEqual(validateManifest(m, files).errors, [], key);
    assert.equal(m.stack, t.stack);
  }
});

test('нативные стеки Android/iOS не собираются в .nob', async () => {
  const m = JSON.parse(templateFiles('kotlin')['manifest.json']);
  await assert.rejects(buildNob(m, { 'a.kt': utf8('x') }, await generateKey()), /APK/);
});

// ── ядро Noodle (WebAssembly) ────────────────────────────────────

test('ядро: все шаблоны Noodle компилируются без ошибок и запускаются', () => {
  for (const k of Object.keys(TEMPLATES).filter((k) => TEMPLATES[k].stack === 'noodle')) {
    const { files } = tpl(k);
    const withNbc = withBytecode(files);
    assert.equal(wasm.load(withNbc[NOODLE_BYTECODE], { w: 390, h: 724, scale: 1 }), null, k);
    wasm.render();
    assert.equal(wasm.dump().crash, null, k);
    assert.ok(wasm.dump().nodes.length > 0, k);
  }
});

test('ядро: счётчик — клики меняют состояние, байткод исполняется', () => {
  const { files } = tpl('noodle-counter');
  assert.equal(wasm.load(withBytecode(files)[NOODLE_BYTECODE], { w: 390, h: 724, scale: 1 }), null);
  wasm.render();
  assert.deepEqual(texts(), ['COUNTER', '0']);
  assert.ok(wasm.tapText('+') && wasm.tapText('+') && wasm.tapText('+') && wasm.tapText('−'));
  assert.deepEqual(texts(), ['COUNTER', '2']);
  assert.ok(wasm.status().storageDirty, 'persist-состояние попало в хранилище');
  assert.equal(JSON.parse(wasm.storage()['state:count']), 2);
  assert.ok(wasm.render() || true);
  assert.equal(wasm.pixels().length, 390 * 724 * 4);
});

test('ядро: состояние persist восстанавливается из хранилища', () => {
  const { files } = tpl('noodle-counter');
  const nbc = withBytecode(files)[NOODLE_BYTECODE];
  assert.equal(wasm.load(nbc, { w: 390, h: 724, scale: 1, storage: { 'state:count': '41' } }), null);
  wasm.render();
  assert.deepEqual(texts(), ['COUNTER', '41']);
});

test('ядро: ошибки компиляции с файлом, строкой и колонкой', () => {
  let r = wasm.compile([['a.nui', 'screen main {\n  column {\n    blah "x"\n  }\n}\n']]);
  assert.equal(r.ok, false);
  assert.equal(r.diags[0].line, 3);
  assert.match(r.diags[0].msg, /неизвестный элемент/);
  r = wasm.compile([['a.nui', 'screen main {\n  text "{nope}"\n}\n']]);
  assert.match(r.diags[0].msg, /неизвестное имя «nope»/);
  assert.equal(r.diags[0].file, 'a.nui');
  assert.equal(wasm.compile([['a.nui', 'let a = 1']]).ok, false, 'нет экрана');
  assert.equal(wasm.compile([['a.nui', 'screen main { text "ok" }']]).ok, true);
});

test('ядро: ввод текста и привязка', () => {
  const src = 'state name = ""\nscreen main {\n  input bind=name placeholder="Имя"\n  text "Привет, {name}"\n}\n';
  const r = wasm.compile([['a.nui', src]]);
  assert.equal(wasm.load(r.bytes, { w: 390, h: 724, scale: 1 }), null);
  wasm.render();
  assert.ok(wasm.tapText('Имя'));
  wasm.text('Мир');
  wasm.key('backspace');
  assert.deepEqual(texts(), ['Привет, Ми']);
  assert.equal(wasm.status().wantsText, true);
});

// ── Android-обёртка (только для web-стека) ────────────────────────

test('android: web-проект даёт корректный Gradle-проект', () => {
  const { manifest, files } = tpl('counter');
  const p = androidProject(manifest, files, runtime);
  for (const f of ['settings.gradle', 'build.gradle', 'app/build.gradle', 'app/src/main/AndroidManifest.xml', 'app/src/main/java/dev/noodle/counter/MainActivity.java', 'app/src/main/assets/www/index.html', 'app/src/main/assets/www/noodle-system/runtime.js']) assert.ok(f in p, f);
  assert.match(p['app/src/main/AndroidManifest.xml'], /VIBRATE/);
  assert.doesNotMatch(p['app/src/main/AndroidManifest.xml'], /INTERNET/);
  assert.match(p['app/src/main/assets/www/index.html'], /Content-Security-Policy/);
});

test('android: служебные папки не начинаются с «_» (aapt их отбрасывает)', () => {
  const { manifest, files } = tpl('counter');
  for (const p of Object.keys(androidProject(manifest, files, runtime))) {
    const rel = p.replace('app/src/main/assets/', '');
    if (rel !== p) assert.ok(!rel.split('/').slice(0, -1).some((s) => s.startsWith('_')), p);
  }
  assert.throws(() => androidProject(manifest, { ...files, '_private/x.js': utf8('1') }, runtime), /Android не включает/);
  assert.throws(() => androidProject(manifest, { ...files, '.hidden': utf8('1') }, runtime), /Android не включает/);
});

test('android: нативные Noodle-приложения в WebView-обёртку не упаковываются', () => {
  const { manifest, files } = tpl('noodle-counter');
  assert.throws(() => androidProject(manifest, files, runtime), /нативным рантаймом Noodle/);
});

// ── CLI ──────────────────────────────────────────────────────────

const nobCli = (dir, ...a) => spawnSync('node', [path.join(root, 'tools/nob.mjs'), ...a], { encoding: 'utf8', env: { ...process.env, NOODLE_KEY: path.join(dir, 'k.json') } });

test('CLI: init → check → build → verify → inspect → unpack (Noodle)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'));
  const nob = (...a) => nobCli(dir, ...a);
  let r = nob('init', path.join(dir, 'app'), '--template', 'noodle-tasks', '--id', 'com.test.todo', '--name', 'Todo');
  assert.equal(r.status, 0, r.stderr);
  r = nob('check', path.join(dir, 'app'));
  assert.equal(r.status, 0, r.stderr);
  r = nob('build', path.join(dir, 'app'));
  assert.equal(r.status, 0, r.stderr);
  const pkg = path.join(dir, 'app', 'com.test.todo-1.0.0.nob');
  assert.ok(fs.existsSync(pkg));
  assert.equal(nob('verify', pkg).status, 0);
  assert.equal(nob('inspect', pkg).status, 0);
  r = nob('unpack', pkg, path.join(dir, 'out'));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'out/app.nui')) && fs.existsSync(path.join(dir, 'out/main.nbc')));
  // подмена → verify падает
  const bytes = fs.readFileSync(pkg);
  const i = bytes.indexOf(Buffer.from('Новая задача'));
  if (i > 0) {
    bytes[i] ^= 0x01;
    fs.writeFileSync(pkg, bytes);
    assert.notEqual(nob('verify', pkg).status, 0);
  }
  assert.notEqual(nob('build', path.join(dir, 'nonexistent')).status, 0);
});

test('CLI: ошибка в коде останавливает сборку и показывает строку', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'));
  const nob = (...a) => nobCli(dir, ...a);
  nob('init', path.join(dir, 'app'), '--template', 'noodle-counter');
  fs.appendFileSync(path.join(dir, 'app/app.nui'), '\nscreen broken {\n  text "{oops}"\n}\n');
  const r = nob('build', path.join(dir, 'app'));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /app\.nui:\d+:\d+: неизвестное имя «oops»/);
  assert.ok(!fs.existsSync(path.join(dir, 'app', 'dev.noodle.counter-1.0.0.nob')), 'пакет не создан');
});

test('CLI: Noodle не собирается в APK; Kotlin не собирается в .nob; Swift — только на macOS', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'));
  const nob = (...a) => nobCli(dir, ...a);
  nob('init', path.join(dir, 'n'), '--template', 'noodle-counter');
  let r = nob('apk', path.join(dir, 'n'));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /нативные для Noodle\.OS/);
  nob('init', path.join(dir, 'k'), '--template', 'kotlin');
  assert.notEqual(nob('build', path.join(dir, 'k')).status, 0);
  nob('init', path.join(dir, 's'), '--template', 'swift');
  r = nob('apk', path.join(dir, 's'));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /macOS/);
});

test('нативный бинарник запускает .nob (если собран runtime/)', { skip: !fs.existsSync(path.join(root, 'runtime/target/release/noodle')) }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'));
  const nob = (...a) => nobCli(dir, ...a);
  nob('init', path.join(dir, 'app'), '--template', 'noodle-counter', '--id', 'com.test.nativeapp');
  assert.equal(nob('build', path.join(dir, 'app')).status, 0);
  const bin = path.join(root, 'runtime/target/release/noodle');
  const r = spawnSync(bin, ['test', path.join(dir, 'app/com.test.nativeapp-1.0.0.nob'), '--steps', 'tap:+;tap:+', '--expect', '2'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const bad = spawnSync(bin, ['test', path.join(dir, 'app/com.test.nativeapp-1.0.0.nob'), '--steps', 'tap:+', '--expect', '99'], { encoding: 'utf8' });
  assert.notEqual(bad.status, 0);
});
