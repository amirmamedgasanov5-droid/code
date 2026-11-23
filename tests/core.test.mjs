// Тесты ядра: формат .nob, подпись, защита от подмены, Noodle UI, генератор Android-проекта, CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildNob, readNob, generateKey, zipWrite, zipRead, utf8, fromUtf8, validateManifest, safePath, crc32 } from '../studio/js/nob.js';
import { templateFiles, TEMPLATES } from '../studio/js/templates.js';
import { parseNui, compileNui, splitInterp } from '../studio/js/nui.js';
import { androidProject } from '../studio/js/android.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = fs.readFileSync(path.join(root, 'studio/js/noodle-runtime.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'studio/js/nui-engine.js'), 'utf8');

const tpl = (k, over) => {
  const f = templateFiles(k, over);
  const manifest = JSON.parse(f['manifest.json']);
  delete f['manifest.json'];
  const files = Object.fromEntries(Object.entries(f).map(([p, c]) => [p, utf8(c)]));
  return { manifest, files };
};

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
  const { manifest, files } = tpl('counter');
  const key = await generateKey();
  const { bytes } = await buildNob(manifest, files, key);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nob-')), 'x.nob');
  fs.writeFileSync(f, bytes);
  const r = spawnSync('unzip', ['-t', f], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('.nob: сборка воспроизводима (одинаковые входы → одинаковые байты)', async () => {
  const { manifest, files } = tpl('notes');
  const key = await generateKey();
  const a = await buildNob(manifest, files, key);
  const b = await buildNob(manifest, files, key);
  assert.equal(a.report.sha256.length, 64);
  // ECDSA недетерминирована, поэтому сравниваем всё кроме подписи
  const ra = await zipRead(a.bytes);
  const rb = await zipRead(b.bytes);
  for (const e of ra) if (!e.path.endsWith('signature.json')) assert.deepEqual(e.data, rb.find((x) => x.path === e.path).data);
});

test('.nob: корректный пакет проходит проверку', async () => {
  const { manifest, files } = tpl('counter');
  const key = await generateKey();
  const { bytes } = await buildNob(manifest, files, key);
  const r = await readNob(bytes);
  assert.deepEqual(r.errors, []);
  assert.ok(r.ok && r.signed);
  assert.equal(r.keyId, key.keyId);
  assert.equal(r.manifest.id, manifest.id);
  assert.deepEqual(Object.keys(r.files).sort(), Object.keys(files).sort());
});

test('.nob: подмена файла после подписи обнаруживается', async () => {
  const { manifest, files } = tpl('counter');
  const key = await generateKey();
  const { bytes } = await buildNob(manifest, files, key);
  const entries = await zipRead(bytes);
  const app = entries.find((e) => e.path === 'app/app.js');
  app.data = utf8('alert("evil")');
  const tampered = await zipWrite(entries);
  const r = await readNob(tampered);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('app/app.js')), r.errors.join('\n'));
});

test('.nob: добавленный файл без подписи обнаруживается', async () => {
  const { manifest, files } = tpl('counter');
  const key = await generateKey();
  const { bytes } = await buildNob(manifest, files, key);
  const entries = await zipRead(bytes);
  entries.push({ path: 'app/backdoor.js', data: utf8('1') });
  const r = await readNob(await zipWrite(entries));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('backdoor')));
});

test('.nob: подмена хэшей и подписи чужим ключом обнаруживается', async () => {
  const { manifest, files } = tpl('counter');
  const key = await generateKey();
  const { bytes } = await buildNob(manifest, files, key);
  const entries = await zipRead(bytes);
  const h = entries.find((e) => e.path === 'META/hashes.json');
  h.data = utf8(fromUtf8(h.data).replace(/[0-9a-f]/, (c) => (c === '0' ? '1' : '0')));
  const r = await readNob(await zipWrite(entries));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('подпись')));
});

test('.nob: zip-slip и абсолютные пути запрещены', () => {
  for (const bad of ['../x', '/etc/passwd', 'a/../../x', 'a\\b', 'a//b', '']) assert.throws(() => safePath(bad), undefined, bad);
  assert.equal(safePath('a/b.js'), 'a/b.js');
});

test('.nob: файл с опасным путём в архиве отклоняется', async () => {
  const z = await zipWrite([{ path: 'META/NOB', data: utf8('noodle-bundle 1\n') }, { path: '../evil', data: utf8('x') }]);
  const r = await readNob(z);
  assert.equal(r.ok, false);
});

test('не-пакет отклоняется без исключений', async () => {
  assert.equal((await readNob(utf8('просто текст'))).ok, false);
  const z = await zipWrite([{ path: 'x.txt', data: utf8('1') }]);
  assert.equal((await readNob(z)).ok, false);
});

test('манифест: валидация', () => {
  const ok = { format: 1, id: 'com.a.b', name: 'X', version: '1.0.0', versionCode: 1, entry: 'index.html', permissions: ['network'], window: { orientation: 'auto', background: '#000000' } };
  const files = { 'index.html': 1 };
  assert.deepEqual(validateManifest(ok, files).errors, []);
  const bad = (patch) => validateManifest({ ...ok, ...patch }, files).errors.length > 0;
  assert.ok(bad({ id: 'Bad Id' }));
  assert.ok(bad({ id: 'com.new.app' }), 'зарезервированное слово Java');
  assert.ok(bad({ version: '1' }));
  assert.ok(bad({ versionCode: 0 }));
  assert.ok(bad({ entry: 'nope.html' }));
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

test('нативные стеки не собираются в .nob', async () => {
  const f = templateFiles('kotlin');
  const m = JSON.parse(f['manifest.json']);
  await assert.rejects(buildNob(m, { 'a.kt': utf8('x') }, await generateKey()), /APK/);
});

// ── Noodle UI ────────────────────────────────────────────────────

test('nui: парсер разбирает шаблоны без ошибок', () => {
  for (const k of ['nui-counter', 'nui-todo']) {
    const f = templateFiles(k);
    const app = compileNui({ 'app.nui': f['app.nui'] }, 'app.nui');
    assert.deepEqual(app.errors, [], k);
    assert.ok(app.order.includes('main'));
  }
});

test('nui: структура дерева', () => {
  const app = parseNui(`state n = 1 persist
fn f(a, b) { return a + b }
screen main {
  column gap=8 padding=16 {
    text "Привет, {n}" size=20 bold
    button "ОК" on={ n++ } disabled={n>5}
    each [1,2,3] as x, i {
      text "{x}"
    }
    if n > 1 { divider }
  }
}`);
  assert.deepEqual(app.errors, []);
  assert.equal(app.states[0].persist, true);
  assert.equal(app.fns[0].params, 'a, b');
  const col = app.screens.main.children[0];
  assert.equal(col.attrs.gap.v, 8);
  assert.equal(col.children[0].text, 'Привет, {n}');
  assert.equal(col.children[0].attrs.bold.t, 'flag');
  assert.equal(col.children[1].attrs.on.t, 'code');
  assert.equal(col.children[2].attrs.as.v, 'x');
  assert.equal(col.children[2].attrs.index.v, 'i');
  assert.equal(col.children[3].tag, 'if');
});

test('nui: ошибки с номерами строк', () => {
  const app = parseNui(`screen main {\n  column {\n    blah "x"\n    text "ok"\n  }\n}\n`);
  assert.equal(app.errors.length, 1);
  assert.equal(app.errors[0].line, 3);
  assert.match(app.errors[0].message, /неизвестный элемент/);
  const bad = parseNui('screen main {\n  text "не закрыта\n}');
  assert.ok(bad.errors.length > 0);
  assert.ok(compileNui({}, 'app.nui').errors.length > 0);
});

test('nui: интерполяция', () => {
  assert.deepEqual(splitInterp('a {b} c'), ['a ', { code: 'b' }, ' c']);
  assert.deepEqual(splitInterp('{ {a:1}.a }'), [{ code: ' {a:1}.a ' }]);
});

// ── Android ──────────────────────────────────────────────────────

test('android: web-проект даёт корректный Gradle-проект', () => {
  const { manifest, files } = tpl('counter');
  const p = androidProject(manifest, files, runtime, engine);
  for (const f of ['settings.gradle', 'build.gradle', 'app/build.gradle', 'app/src/main/AndroidManifest.xml', 'app/src/main/java/dev/noodle/counter/MainActivity.java', 'app/src/main/assets/www/index.html', 'app/src/main/assets/www/noodle-system/runtime.js']) assert.ok(f in p, f);
  assert.match(p['app/src/main/AndroidManifest.xml'], /VIBRATE/);
  assert.doesNotMatch(p['app/src/main/AndroidManifest.xml'], /INTERNET/);
  assert.match(p['app/src/main/assets/www/index.html'], /noodle:begin/);
  assert.match(p['app/src/main/assets/www/index.html'], /Content-Security-Policy/);
});

test('android: nui-проект получает хост-страницу и движок', () => {
  const { manifest, files } = tpl('nui-counter');
  const p = androidProject(manifest, files, runtime, engine);
  assert.ok('app/src/main/assets/www/noodle-nui/index.html' in p);
  assert.ok('app/src/main/assets/www/noodle-nui/engine.js' in p);
  assert.match(p['app/src/main/java/dev/noodle/counter/MainActivity.java'], /noodle-nui\/index\.html/);
  // все <script src> хост-страницы должны разрешаться в реальные файлы ассетов
  const html = p['app/src/main/assets/www/noodle-nui/index.html'];
  for (const m of html.matchAll(/<script src="([^"]+)"/g)) {
    const target = m[1].startsWith('/assets/') ? m[1].slice('/assets/'.length) : 'www/noodle-nui/' + m[1];
    assert.ok(('app/src/main/assets/' + target) in p, 'не найден ' + m[1]);
  }
});

test('android: служебные папки не начинаются с «_» (aapt их отбрасывает)', () => {
  for (const name of ['counter', 'nui-counter']) {
    const { manifest, files } = tpl(name);
    for (const p of Object.keys(androidProject(manifest, files, runtime, engine))) {
      const rel = p.replace('app/src/main/assets/', '');
      if (rel !== p) assert.ok(!rel.split('/').slice(0, -1).some((s) => s.startsWith('_')), p);
    }
  }
  const { manifest, files } = tpl('counter');
  assert.throws(() => androidProject(manifest, { ...files, '_private/x.js': utf8('1') }, runtime, engine), /Android не включает/);
  assert.throws(() => androidProject(manifest, { ...files, '.hidden': utf8('1') }, runtime, engine), /Android не включает/);
});

test('android: ошибки Noodle UI прерывают сборку', () => {
  const { manifest } = tpl('nui-counter');
  assert.throws(() => androidProject(manifest, { 'app.nui': utf8('screen main { blah }') }, runtime, engine), /Noodle UI/);
});

// ── CLI ──────────────────────────────────────────────────────────

test('CLI: init → build → verify → inspect → unpack', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'));
  const nob = (...a) => spawnSync('node', [path.join(root, 'tools/nob.mjs'), ...a], { encoding: 'utf8', env: { ...process.env, NOODLE_KEY: path.join(dir, 'k.json') } });
  let r = nob('init', path.join(dir, 'app'), '--template', 'nui-todo', '--id', 'com.test.todo', '--name', 'Todo');
  assert.equal(r.status, 0, r.stderr);
  r = nob('build', path.join(dir, 'app'));
  assert.equal(r.status, 0, r.stderr);
  const pkg = path.join(dir, 'app', 'com.test.todo-1.0.0.nob');
  assert.ok(fs.existsSync(pkg));
  assert.equal(nob('verify', pkg).status, 0);
  assert.equal(nob('inspect', pkg).status, 0);
  r = nob('unpack', pkg, path.join(dir, 'out'));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'out/app.nui')));
  // подмена → verify падает
  const bytes = fs.readFileSync(pkg);
  const i = bytes.indexOf(Buffer.from('Новая задача'));
  if (i > 0) {
    bytes[i] ^= 0x01;
    fs.writeFileSync(pkg, bytes);
    assert.notEqual(nob('verify', pkg).status, 0);
  }
  r = nob('build', path.join(dir, 'nonexistent'));
  assert.notEqual(r.status, 0);
});

test('CLI: нативные стеки не собираются в .nob, а swift — не в APK на Linux', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'));
  const nob = (...a) => spawnSync('node', [path.join(root, 'tools/nob.mjs'), ...a], { encoding: 'utf8' });
  nob('init', path.join(dir, 'k'), '--template', 'kotlin');
  assert.notEqual(nob('build', path.join(dir, 'k')).status, 0);
  nob('init', path.join(dir, 's'), '--template', 'swift');
  const r = nob('apk', path.join(dir, 's'));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /macOS/);
});
