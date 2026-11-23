#!/usr/bin/env node
// nob — CLI для Noodle.OS: создаёт проекты, собирает/проверяет .nob, собирает APK.
// Использует то же ядро, что и Noodle Studio (studio/js/nob.js).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildNob, readNob, generateKey, validateManifest, defaultManifest, sha256, utf8 } from '../studio/js/nob.js';
import { androidProject } from '../studio/js/android.js';
import { TEMPLATES, templateFiles } from '../studio/js/templates.js';
import { NATIVE_STACKS, STACKS } from '../studio/js/nob.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.join(here, '../studio/js/noodle-runtime.js');
const NUI_ENGINE = path.join(here, '../studio/js/nui-engine.js');
const IGNORE = new Set(['.git', 'node_modules', '.DS_Store', '.gitkeep', 'build', 'dist']);

const HELP = `nob — инструмент Noodle.OS

  nob init <папка> [--template nui-counter|nui-todo|counter|notes|blank|kotlin|flutter|swift] [--id com.me.app] [--name "Имя"]
  nob build [папка=.] [-o файл.nob] [--key ключ.json]   собрать и подписать .nob
  nob inspect <файл.nob>                                 показать манифест, файлы, ключ
  nob verify  <файл.nob>                                 проверить подпись и хэши (код выхода 0/1)
  nob unpack  <файл.nob> <папка>                         распаковать в проект
  nob android [папка|.nob] [-o папка]                    сгенерировать Android-проект (Gradle)
  nob apk     [папка|.nob] [-o файл.apk]                 собрать отладочный APK (нужны JDK 17+, Gradle, Android SDK)
  nob keygen  [файл.json]                                создать ключ подписи

Ключ по умолчанию: $NOODLE_KEY или ~/.noodle/dev-key.json (создаётся автоматически).
`;

function parse(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o') opt.o = argv[++i];
    else if (a.startsWith('--')) opt[a.slice(2)] = argv[++i];
    else pos.push(a);
  }
  return { pos, opt };
}

const die = (m) => {
  console.error('nob: ' + m);
  process.exit(1);
};
const fmt = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB');

function walk(dir, base = dir, out = {}) {
  for (const name of fs.readdirSync(dir)) {
    if (IGNORE.has(name) || name.endsWith('.nob') || name.endsWith('.apk')) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, base, out);
    else out[path.relative(base, full).split(path.sep).join('/')] = new Uint8Array(fs.readFileSync(full));
  }
  return out;
}

function loadProject(dir) {
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) die(`в «${dir}» нет manifest.json`);
  const all = walk(dir);
  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(all['manifest.json']));
  } catch (e) {
    die('manifest.json: ' + e.message);
  }
  delete all['manifest.json'];
  return { manifest, files: all };
}

async function loadKey(file) {
  const p = file || process.env.NOODLE_KEY || path.join(os.homedir(), '.noodle', 'dev-key.json');
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  const key = await generateKey();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(key, null, 2), { mode: 0o600 });
  console.log(`создан новый ключ подписи: ${p}  (keyId ${key.keyId})`);
  return key;
}

async function loadSource(src) {
  if (fs.statSync(src).isDirectory()) return loadProject(src);
  const r = await readNob(new Uint8Array(fs.readFileSync(src)));
  if (!r.ok) die('пакет не прошёл проверку:\n  • ' + r.errors.join('\n  • '));
  return { manifest: r.manifest, files: r.files };
}

async function nativeApk(src, m, opt) {
  if (m.stack === 'swift') die('Swift/SwiftUI собирается в IPA только на macOS (xcodegen generate && xcodebuild) — см. README.md в проекте');
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) die('не задан ANDROID_HOME (Android SDK: platforms;android-34, build-tools;34.0.0)');
  const work = path.join(src, 'build', 'native');
  fs.rmSync(work, { recursive: true, force: true });
  for (const [p, d] of Object.entries(walk(src))) {
    fs.mkdirSync(path.dirname(path.join(work, p)), { recursive: true });
    fs.writeFileSync(path.join(work, p), d);
  }
  const env = { ...process.env, ANDROID_HOME: sdk };
  let built;
  if (m.stack === 'kotlin') {
    const g = spawnSync(process.env.GRADLE || 'gradle', ['assembleDebug', '--console=plain', '-q'], { cwd: work, stdio: 'inherit', env });
    if (g.status !== 0) die('gradle завершился с ошибкой');
    built = path.join(work, 'app/build/outputs/apk/debug/app-debug.apk');
  } else {
    const fl = process.env.FLUTTER || 'flutter';
    if (spawnSync(fl, ['--version'], { stdio: 'ignore' }).status !== 0) die('Flutter SDK не найден в PATH (задайте FLUTTER=/путь/к/flutter)');
    if (!fs.existsSync(path.join(work, 'android'))) {
      const pkg = fs.readFileSync(path.join(work, 'pubspec.yaml'), 'utf8').match(/^name:\s*(\w+)/m)?.[1] || 'noodle_app';
      const org = m.id.split('.').slice(0, -1).join('.');
      if (spawnSync(fl, ['create', '--platforms=android', '--project-name', pkg, '--org', org, '.'], { cwd: work, stdio: 'inherit', env }).status !== 0) die('flutter create не удался');
    }
    if (spawnSync(fl, ['build', 'apk', '--debug'], { cwd: work, stdio: 'inherit', env }).status !== 0) die('flutter build не удался');
    built = path.join(work, 'build/app/outputs/flutter-apk/app-debug.apk');
  }
  const target = opt.o && opt.o.endsWith('.apk') ? opt.o : path.join(src, 'build', `${m.id}-${m.version}.apk`);
  fs.copyFileSync(built, target);
  console.log(`✔ APK (${STACKS[m.stack]}): ${target} (${fmt(fs.statSync(target).size)})`);
}

const commands = {
  async init({ pos, opt }) {
    const dir = pos[0];
    if (!dir) die('укажите папку: nob init my-app');
    const tpl = opt.template || 'nui-counter';
    if (!TEMPLATES[tpl]) die(`шаблоны: ${Object.keys(TEMPLATES).join(', ')}`);
    if (fs.existsSync(dir) && fs.readdirSync(dir).length) die(`папка «${dir}» не пуста`);
    const over = {};
    if (opt.id) over.id = opt.id;
    if (opt.name) over.name = opt.name;
    const files = templateFiles(tpl, over);
    const m = JSON.parse(files['manifest.json']);
    const v = validateManifest(m, files);
    if (v.errors.length) die(v.errors.join('\n'));
    for (const [p, c] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
      fs.writeFileSync(path.join(dir, p), c);
    }
    console.log(`создан проект «${m.name}» (${tpl}) в ${dir}\n  cd ${dir} && node ${path.relative(process.cwd(), process.argv[1])} build`);
  },

  async build({ pos, opt }) {
    const dir = pos[0] || '.';
    const { manifest, files } = loadProject(dir);
    if (NATIVE_STACKS.includes(manifest.stack)) die(`стек «${manifest.stack}» не собирается в .nob — используйте: nob apk ${dir}`);
    const key = await loadKey(opt.key);
    const { bytes, report } = await buildNob(manifest, files, key);
    const out = opt.o || path.join(dir, `${manifest.id}-${manifest.version}.nob`);
    fs.writeFileSync(out, bytes);
    console.log(`✔ ${out}\n  файлов: ${report.files}, ${fmt(report.rawSize)} → ${fmt(report.size)}\n  sha256: ${report.sha256}\n  ключ:   ${report.keyId}`);
  },

  async inspect({ pos }) {
    if (!pos[0]) die('укажите файл .nob');
    const r = await readNob(new Uint8Array(fs.readFileSync(pos[0])));
    console.log(JSON.stringify(r.manifest, null, 2));
    console.log(`\nфайлы (${Object.keys(r.files).length}):`);
    for (const [p, d] of Object.entries(r.files).sort()) console.log(`  ${fmt(d.length).padStart(9)}  ${p}`);
    console.log(`\nподпись: ${r.signed ? 'действительна, ключ ' + r.keyId : 'НЕТ'}\nпроверка: ${r.ok ? 'ok' : 'ОШИБКИ\n  • ' + r.errors.join('\n  • ')}`);
    process.exit(r.ok ? 0 : 1);
  },

  async verify({ pos }) {
    if (!pos[0]) die('укажите файл .nob');
    const r = await readNob(new Uint8Array(fs.readFileSync(pos[0])));
    if (r.ok) console.log(`✔ ${pos[0]}: подпись и хэши в порядке (ключ ${r.keyId})`);
    else console.error(`✘ ${pos[0]}:\n  • ` + r.errors.join('\n  • '));
    process.exit(r.ok ? 0 : 1);
  },

  async unpack({ pos }) {
    if (pos.length < 2) die('nob unpack <файл.nob> <папка>');
    const r = await readNob(new Uint8Array(fs.readFileSync(pos[0])));
    if (!r.ok) die('пакет не прошёл проверку:\n  • ' + r.errors.join('\n  • '));
    const out = { 'manifest.json': utf8(JSON.stringify(r.manifest, null, 2) + '\n'), ...r.files };
    for (const [p, d] of Object.entries(out)) {
      fs.mkdirSync(path.dirname(path.join(pos[1], p)), { recursive: true });
      fs.writeFileSync(path.join(pos[1], p), d);
    }
    console.log(`распаковано ${Object.keys(out).length} файлов в ${pos[1]}`);
  },

  async android({ pos, opt }) {
    const src = pos[0] || '.';
    const { manifest, files } = await loadSource(src);
    const v = validateManifest(manifest, files);
    if (v.errors.length) die('манифест:\n  • ' + v.errors.join('\n  • '));
    if (NATIVE_STACKS.includes(manifest.stack)) die(`«${manifest.stack}» — нативный проект, генерация WebView-обёртки не нужна: nob apk`);
    let proj;
    try {
      proj = androidProject(manifest, files, fs.readFileSync(RUNTIME, 'utf8'), fs.readFileSync(NUI_ENGINE, 'utf8'));
    } catch (e) {
      die(e.message);
    }
    const out = opt.o || path.join(fs.statSync(src).isDirectory() ? src : path.dirname(src), 'build', 'android');
    fs.rmSync(out, { recursive: true, force: true });
    for (const [p, c] of Object.entries(proj)) {
      fs.mkdirSync(path.dirname(path.join(out, p)), { recursive: true });
      fs.writeFileSync(path.join(out, p), c);
    }
    console.log(`✔ Android-проект: ${out}\n  дальше:  cd ${out} && gradle assembleDebug`);
    return { out, manifest };
  },

  async apk({ pos, opt }) {
    const src = pos[0] || '.';
    if (fs.statSync(src).isDirectory() && fs.existsSync(path.join(src, 'manifest.json'))) {
      const m = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
      if (NATIVE_STACKS.includes(m.stack)) return nativeApk(src, m, opt);
    }
    const { out, manifest } = await commands.android({ pos: [src], opt: { o: opt.o && !opt.o.endsWith('.apk') ? opt.o : undefined } });
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    if (!sdk) die('не задан ANDROID_HOME (путь к Android SDK с platforms;android-34 и build-tools;34.0.0)');
    const g = spawnSync(process.env.GRADLE || 'gradle', ['assembleDebug', '--console=plain', '-q'], { cwd: out, stdio: 'inherit', env: { ...process.env, ANDROID_HOME: sdk } });
    if (g.status !== 0) die('gradle завершился с ошибкой');
    const built = path.join(out, 'app/build/outputs/apk/debug/app-debug.apk');
    const target = opt.o && opt.o.endsWith('.apk') ? opt.o : path.join(path.dirname(out), `${manifest.id}-${manifest.version}.apk`);
    fs.copyFileSync(built, target);
    console.log(`✔ APK: ${target} (${fmt(fs.statSync(target).size)})  — отладочная подпись, ставится через adb install`);
  },

  async keygen({ pos }) {
    const p = pos[0] || path.join(os.homedir(), '.noodle', 'dev-key.json');
    if (fs.existsSync(p)) die(`${p} уже существует`);
    await loadKey(p);
  },
};

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === 'help' || cmd === '--help' || !commands[cmd]) {
  console.log(HELP);
  process.exit(cmd && !['help', '--help'].includes(cmd) ? 1 : 0);
}
await commands[cmd](parse(rest));
void sha256;
void defaultManifest;
