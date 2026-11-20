#!/usr/bin/env node
/**
 * Собирает библиотеку знаний в public/library из открытых наборов данных.
 * Ничего не пишется вручную: тексты берутся как есть, только раскладываются по файлам.
 *
 *  Коран            — арабский текст (Узмани), перевод Э. Кулиева, транслитерация: пакет npm `quran-cloud`
 *                      (данные The Noble Qur'an Encyclopedia / Tanzil, CC BY-SA 4.0). QURAN_SRC=путь к dist/chapters/ru
 *  Хадисы           — Сахих аль-Бухари, Сахих Муслим, Сунан Абу Дауда: hadith-api (fawazahmed0), русские и арабские издания
 *  Хисн аль-Муслим  — пакет npm @kazishariar/hisnul-muslim-data (арабский текст и транслитерация)
 *  Джузы            — пакет npm quran-meta
 *
 *  node scripts/build-library.mjs         (нужен NODE_USE_ENV_PROXY=1 за прокси)
 */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import * as meta from 'quran-meta/hafs';

const OUT = resolve('public/library');
const HADITH = 'https://raw.githubusercontent.com/fawazahmed0/hadith-api/1/editions';
const w = async (p, data) => {
  await mkdir(resolve(OUT, p, '..'), { recursive: true });
  // в источниках встречаются битые символы U+FFFD (потерянные при их конвертации) — убираем, чтобы не показывать «�»
  await writeFile(resolve(OUT, p), JSON.stringify(data).replace(/\uFFFD/g, ''));
};

/* ——— Коран ——— */
async function quran() {
  let src = process.env.QURAN_SRC;
  if (!src) {
    const tmp = resolve('.scratch/quran-cloud');
    if (!existsSync(`${tmp}/package/dist`)) {
      await mkdir(tmp, { recursive: true });
      execSync('npm pack quran-cloud --silent && tar xzf quran-cloud-*.tgz', { cwd: tmp, stdio: 'inherit' });
    }
    src = `${tmp}/package/dist/chapters/ru`;
  }
  const index = [];
  const ru = [];
  for (let n = 1; n <= 114; n++) {
    const c = JSON.parse(await readFile(`${src}/${n}.json`, 'utf8'));
    index.push({ n, ar: c.name, tr: c.transliteration, ru: c.translation, t: c.type === 'meccan' ? 'm' : 'd', v: c.verses.length });
    await w(`quran/${n}.json`, { n, a: c.verses.map((v) => v.text), r: c.verses.map((v) => v.translation), t: c.verses.map((v) => v.transliteration) });
    ru.push(c.verses.map((v) => v.translation));
  }
  const juz = Array.from({ length: 30 }, (_, i) => meta.getJuzMeta(i + 1).first);
  await w('quran/index.json', { suras: index, juz });
  await w('quran/ru.json', ru);
  console.log('Коран: 114 сур,', index.reduce((s, x) => s + x.v, 0), 'аятов');
}

/* ——— Хадисы ——— */
const HADITH_SETS = [
  { id: 'bukhari', ru: 'Сахих аль-Бухари', ar: 'صحيح البخاري', author: 'Имам аль-Бухари', about: 'Перевод на русский: Абдуллах Нирша и редакторы Daura.com' },
  { id: 'muslim', ru: 'Сахих Муслим', ar: 'صحيح مسلم', author: 'Имам Муслим', about: 'В русском издании источника переведена только часть хадисов' },
  { id: 'abudawud', ru: 'Сунан Абу Дауда', ar: 'سنن أبي داود', author: 'Имам Абу Дауд', about: 'В русском издании источника переведена только часть хадисов' },
];
const GRADES = { sahih: 'сахих', hasan: 'хасан', daif: 'да‘иф', "da'if": 'да‘иф' };
const grade = (gs) =>
  (gs ?? [])
    .map((g) => `${GRADES[String(g.grade).toLowerCase()] ?? g.grade}${g.name ? ` · ${g.name}` : ''}`)
    .join('; ');

async function hadith() {
  for (const set of HADITH_SETS) {
    const get = async (e) => (await fetch(`${HADITH}/${e}-${set.id}.json`)).json();
    const [ruEd, arEd] = await Promise.all([get('rus'), get('ara')]);
    const ar = new Map(arEd.hadiths.map((h) => [h.hadithnumber, h.text]));
    const books = new Map();
    let total = 0;
    // книга определяется по диапазону номеров из метаданных набора (поле reference.book у части хадисов пустое)
    const ranges = Object.entries(ruEd.metadata.section_details)
      .map(([b, d]) => ({ b: Number(b), from: d.hadithnumber_first, to: d.hadithnumber_last }))
      .filter((r) => r.to > 0);
    const bookOf = (h) => ranges.find((r) => h.hadithnumber >= r.from && h.hadithnumber <= r.to)?.b ?? h.reference?.book ?? 0;
    for (const h of ruEd.hadiths) {
      const text = (h.text ?? '').trim();
      if (!text) continue;
      const b = bookOf(h);
      if (!books.has(b)) books.set(b, []);
      books.get(b).push({ n: h.hadithnumber, ar: (ar.get(h.hadithnumber) ?? '').trim(), ru: text, ...(grade(h.grades) ? { g: grade(h.grades) } : {}) });
      total++;
    }
    const names = ruEd.metadata.sections;
    const list = [...books.keys()].sort((a, b) => a - b).map((b) => ({ b, en: names[b] || '', c: books.get(b).length }));
    for (const [b, items] of books) await w(`hadith/${set.id}/${b}.json`, items);
    await w(`hadith/${set.id}/index.json`, { ...set, total, books: list });
    console.log(`${set.ru}: ${total} хадисов, ${list.length} книг`);
  }
}

/* ——— Хисн аль-Муслим ——— */
async function hisn() {
  const raw = JSON.parse(await readFile('node_modules/@kazishariar/hisnul-muslim-data/data.json', 'utf8'));
  const sections = [];
  for (const d of raw.data) {
    let s = sections[sections.length - 1];
    if (!s || s.title !== d.section) sections.push((s = { title: d.section, items: [] }));
    s.items.push({ id: d.id, ar: d.arabic, tr: d.transliteration });
  }
  await w('hisn.json', sections);
  console.log('Хисн аль-Муслим:', raw.data.length, 'текстов,', sections.length, 'разделов');
}

await rm(OUT, { recursive: true, force: true });
await quran();
await hadith();
await hisn();
