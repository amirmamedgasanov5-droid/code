#!/usr/bin/env node
/**
 * Собирает библиотеку знаний в public/library из открытых наборов данных.
 * Тексты не пишутся вручную: они берутся как есть и только раскладываются по файлам.
 * Состав ограничен источниками, которые принимаются ахлю-сунной.
 *
 *  Коран        арабский текст (Узмани) и транслитерация — пакет npm `quran-cloud` (quranenc.com / Tanzil, CC BY-SA 4.0);
 *               русские переводы Э. Кулиева и Абу Адель — quran-api (fawazahmed0);
 *               указатели (страницы мусхафа, джузы, хизбы, манзили, места саджды) — пакет quran-meta
 *  Тафсир       ас-Саади, Ибн Касир, «Аль-Мухтасар» на русском — tafsir_api (spa5k), данные QUL (tarteel.ai)
 *  Хадисы       Сахих аль-Бухари и Сахих Муслим (русский + арабский);
 *               Абу Дауд, Тирмизи, Насаи, Ибн Маджа — ТОЛЬКО хадисы, оценённые аль-Албани как «сахих»;
 *               «Сорок хадисов ан-Навави» (арабский + английский) — hadith-api (fawazahmed0)
 *  Азкары       «Хисн аль-Муслим» (Са‘ид аль-Кахтани), арабский текст и число повторений — Adhkar-json (rn0x);
 *               транслитерация — @kazishariar/hisnul-muslim-data
 *  99 имён      список — data/names-of-allah.json, места упоминания в Коране считаются по тексту
 *
 *  NODE_USE_ENV_PROXY=1 node scripts/build-library.mjs     (кеш скачанного: .scratch/src, нужен интернет)
 */
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import * as meta from 'quran-meta/hafs';

const OUT = resolve('public/library');
const SRC = resolve('.scratch/src');
const RAW = 'https://raw.githubusercontent.com';

const clean = (s) => s.replace(/�/g, ''); // битые символы в источниках
const w = async (p, data) => {
  await mkdir(dirname(resolve(OUT, p)), { recursive: true });
  await writeFile(resolve(OUT, p), clean(JSON.stringify(data)));
};

async function download(url, file) {
  const path = resolve(SRC, file);
  if (existsSync(path) && (await stat(path)).size > 2) return JSON.parse(await readFile(path, 'utf8'));
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(90000) });
      if (!r.ok) throw new Error(String(r.status));
      const text = await r.text();
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text);
      return JSON.parse(text);
    } catch (e) {
      if (i === 3) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  }));
  return out;
}
/** Раскладывает элементы по файлам-пачкам примерно одного размера (в символах JSON) */
function chunkBySize(items, target) {
  const chunks = [[]];
  let size = 0;
  for (const it of items) {
    const len = JSON.stringify(it).length;
    if (size + len > target && chunks.at(-1).length) {
      chunks.push([]);
      size = 0;
    }
    chunks.at(-1).push(it);
    size += len;
  }
  return chunks;
}

/* ——— Коран ——— */
/** Русские названия сур (общепринятая транскрипция) */
const SURA_RU = ["Аль-Фатиха", "Аль-Бакара", "Али Имран", "Ан-Ниса", "Аль-Маида", "Аль-Анам", "Аль-Араф", "Аль-Анфаль", "Ат-Тауба", "Юнус", "Худ", "Юсуф", "Ар-Раад", "Ибрахим", "Аль-Хиджр", "Ан-Нахль", "Аль-Исра", "Аль-Кахф", "Марьям", "Та Ха", "Аль-Анбия", "Аль-Хаджж", "Аль-Муминун", "Ан-Нур", "Аль-Фуркан", "Аш-Шуара", "Ан-Намль", "Аль-Касас", "Аль-Анкабут", "Ар-Рум", "Лукман", "Ас-Саджда", "Аль-Ахзаб", "Саба", "Фатыр", "Йа Син", "Ас-Саффат", "Сад", "Аз-Зумар", "Гафир", "Фуссылат", "Аш-Шура", "Аз-Зухруф", "Ад-Духан", "Аль-Джасия", "Аль-Ахкаф", "Мухаммад", "Аль-Фатх", "Аль-Худжурат", "Каф", "Аз-Зарият", "Ат-Тур", "Ан-Наджм", "Аль-Камар", "Ар-Рахман", "Аль-Вакиа", "Аль-Хадид", "Аль-Муджадаля", "Аль-Хашр", "Аль-Мумтахана", "Ас-Сафф", "Аль-Джумуа", "Аль-Мунафикун", "Ат-Тагабун", "Ат-Талак", "Ат-Тахрим", "Аль-Мульк", "Аль-Калям", "Аль-Хакка", "Аль-Мааридж", "Нух", "Аль-Джинн", "Аль-Муззаммиль", "Аль-Муддассир", "Аль-Кыяма", "Аль-Инсан", "Аль-Мурсалят", "Ан-Наба", "Ан-Назиат", "Абаса", "Ат-Таквир", "Аль-Инфитар", "Аль-Мутаффифин", "Аль-Иншикак", "Аль-Бурудж", "Ат-Тарик", "Аль-Аля", "Аль-Гашия", "Аль-Фаджр", "Аль-Баляд", "Аш-Шамс", "Аль-Лейль", "Ад-Духа", "Аш-Шарх", "Ат-Тин", "Аль-Аляк", "Аль-Кадр", "Аль-Баййина", "Аз-Зальзаля", "Аль-Адият", "Аль-Кариа", "Ат-Такасур", "Аль-Аср", "Аль-Хумаза", "Аль-Филь", "Курайш", "Аль-Маун", "Аль-Каусар", "Аль-Кафирун", "Ан-Наср", "Аль-Масад", "Аль-Ихлас", "Аль-Фаляк", "Ан-Нас"];

const TRANSLATIONS = [
  { id: 'kuliev', name: 'Эльмир Кулиев', ed: 'rus-elmirkuliev' },
  { id: 'abuadel', name: 'Абу Адель', ed: 'rus-abuadel' },
];

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
  const suras = [];
  const kuliev = [];
  for (let n = 1; n <= 114; n++) {
    const c = JSON.parse(await readFile(`${src}/${n}.json`, 'utf8'));
    suras.push({ n, ar: c.name, tr: SURA_RU[n - 1], ru: c.translation, t: c.type === 'meccan' ? 'm' : 'd', v: c.verses.length });
    kuliev.push(c.verses.map((v) => v.translation));
    await w(`quran/${n}.json`, { n, a: c.verses.map((v) => v.text), r: kuliev[n - 1] });
  }
  const firsts = (n, get) => Array.from({ length: n }, (_, i) => get(i + 1).first);
  const juz = firsts(30, meta.getJuzMeta);
  const sajda = meta.SajdaList.map((x) => meta.findSurahAyahByAyahId(Array.isArray(x) ? x[0] : x));
  await w('quran/index.json', {
    suras,
    juz,
    translations: TRANSLATIONS.map(({ id, name }) => ({ id, name })),
    pages: firsts(604, meta.getPageMeta),
    hizb: firsts(240, meta.getRubAlHizbMeta),
    manzil: firsts(7, meta.getManzilMeta),
    ruku: firsts(556, meta.getRukuMeta),
    sajda,
  });
  await w('quran/tr/kuliev.json', kuliev);
  for (const t of TRANSLATIONS.filter((x) => x.id !== 'kuliev')) {
    const ed = await download(`${RAW}/fawazahmed0/quran-api/1/editions/${t.ed}.json`, `quran/${t.ed}.json`);
    const bySura = suras.map((s) => Array(s.v).fill(''));
    for (const v of ed.quran) bySura[v.chapter - 1][v.verse - 1] = v.text.trim();
    const miss = bySura.flat().filter((x) => !x).length;
    await w(`quran/tr/${t.id}.json`, bySura);
    console.log(`  перевод «${t.name}»: пропусков ${miss}`);
  }
  console.log('Коран: 114 сур,', suras.reduce((s, x) => s + x.v, 0), 'аятов,', TRANSLATIONS.length, 'переводов');
}

/* ——— Тафсир ——— */
const TAFSIRS = [
  { id: 'saadi', slug: 'ru-tafseer-al-saddi', name: 'Тафсир ас-Саади', author: 'Шейх Абдуррахман ас-Саади', note: 'Классический краткий тафсир; именно его отрывки публикует канал.' },
  { id: 'kathir', slug: 'ru-tafsir-ibne-kahtir', name: 'Тафсир Ибн Касира', author: 'Имам Исмаил ибн Касир', note: 'Подробный тафсир с хадисами и сообщениями предшественников.' },
  { id: 'mukhtasar', slug: 'russian-mokhtasar', name: 'Аль-Мухтасар', author: 'Центр тафсира коранических исследований', note: 'Краткое и понятное разъяснение смысла аятов.' },
];

async function tafsir() {
  const items = [];
  for (const t of TAFSIRS) {
    const per = await pool(Array.from({ length: 114 }, (_, i) => i + 1), 10, (n) => download(`${RAW}/spa5k/tafsir_api/main/tafsir/${t.slug}/${n}.json`, `tafsir/${t.slug}/${n}.json`));
    // подряд идущие одинаковые тексты (один комментарий к нескольким аятам) хранятся один раз
    const suras = per.map((list) => {
      const out = [];
      for (const a of [...list].sort((x, y) => x.ayah - y.ayah)) {
        const text = (a.text ?? '').replace(/ /g, ' ').trim();
        if (!text || out.at(-1)?.[1] === text) continue;
        out.push([a.ayah, text]);
      }
      return out;
    });
    const chunks = chunkBySize(suras.map((s, i) => ({ n: i + 1, s })), 1_000_000);
    const chunkOf = [];
    for (let k = 0; k < chunks.length; k++) {
      const obj = {};
      for (const { n, s } of chunks[k]) {
        obj[n] = s;
        chunkOf[n - 1] = k;
      }
      await w(`tafsir/${t.id}/${k}.json`, obj);
    }
    items.push({ id: t.id, name: t.name, author: t.author, note: t.note, chunkOf });
    console.log(`Тафсир «${t.name}»: ${chunks.length} файлов, ${suras.flat().length} фрагментов`);
  }
  await w('tafsir/index.json', items);
}

/* ——— Хадисы ——— */
const SAHIH_NOTE = 'Показаны только хадисы, которые аль-Албани оценил как «сахих» (по данным открытого набора hadith-api). Остальные хадисы сборника здесь намеренно не приводятся.';
const HADITH_SETS = [
  { id: 'bukhari', ru: 'Сахих аль-Бухари', ar: 'صحيح البخاري', author: 'Имам аль-Бухари', lang: 'ru', filter: null, about: 'Самая достоверная книга после Книги Аллаха. Русский перевод: Абдуллах Нирша и редакторы Daura.com; показаны переведённые хадисы.' },
  { id: 'muslim', ru: 'Сахих Муслим', ar: 'صحيح مسلم', author: 'Имам Муслим', lang: 'ru', filter: null, about: 'Вторая по достоверности книга после Корана. В русском издании источника переведена только часть хадисов — показаны переведённые.' },
  { id: 'abudawud', ru: 'Сунан Абу Дауда', ar: 'سنن أبي داود', author: 'Имам Абу Дауд', lang: 'ru', filter: 'albani', about: SAHIH_NOTE },
  { id: 'nawawi', ru: 'Сорок хадисов ан-Навави', ar: 'الأربعون النووية', author: 'Имам ан-Навави', lang: 'ar', filter: null, about: 'Знаменитый сборник основ религии. Арабский текст; русского перевода в открытых данных нет (его можно добавить файлом data/translations/nawawi.json).' },
];
const GRADES = { sahih: 'сахих', hasan: 'хасан', daif: 'да‘иф', "da'if": 'да‘иф' };
const grade = (gs) => (gs ?? []).map((g) => `${GRADES[String(g.grade).toLowerCase()] ?? g.grade}${g.name ? ` · ${g.name}` : ''}`).join('; ');
/** оценка аль-Албани «сахих» (в т. ч. «сахих — согласованный», «сахих Муслима»), без «сахих ли-гайрихи» */
const albaniSahih = (gs) => (gs ?? []).some((g) => g.name === 'Al-Albani' && /^sahih/i.test(g.grade) && !/lighairihi/i.test(g.grade));

async function hadith() {
  for (const set of HADITH_SETS) {
    const tx = await download(`${RAW}/fawazahmed0/hadith-api/1/editions/${set.lang === 'ru' ? 'rus' : 'ara'}-${set.id}.json`, `hadith/${set.lang === 'ru' ? 'ru' : 'ara'}-${set.id}.json`);
    // дополнительные русские переводы, добавленные вручную: data/translations/<id>.json = { "<номер>": "текст" }
    let extra = {};
    try {
      extra = JSON.parse(await readFile(`data/translations/${set.id}.json`, 'utf8'));
    } catch {}
    const ar = await download(`${RAW}/fawazahmed0/hadith-api/1/editions/ara-${set.id}.json`, `hadith/ara-${set.id}.json`);
    const arMap = new Map(ar.hadiths.map((h) => [String(h.hadithnumber), h.text]));
    const ranges = Object.entries(tx.metadata.section_details ?? {})
      .map(([b, d]) => ({ b: Number(b), from: d.hadithnumber_first, to: d.hadithnumber_last }))
      .filter((r) => r.to > 0);
    const bookOf = (h) => ranges.find((r) => h.hadithnumber >= r.from && h.hadithnumber <= r.to)?.b ?? h.reference?.book ?? 0;

    // оценки берём из английского издания (в русском изданиях Абу Дауда их нет)
    const gradeSrc = set.filter ? await download(`${RAW}/fawazahmed0/hadith-api/1/editions/eng-${set.id}.json`, `hadith/en-${set.id}.json`) : null;
    const grades = new Map((gradeSrc?.hadiths ?? []).map((h) => [String(h.hadithnumber), h.grades]));
    const all = tx.hadiths
      .filter((h) => (h.text ?? '').trim())
      .filter((h) => !set.filter || albaniSahih(grades.get(String(h.hadithnumber))))
      .map((h) => ({ n: h.hadithnumber, b: bookOf(h), a: (arMap.get(String(h.hadithnumber)) ?? '').trim(), x: set.lang === 'ru' ? h.text.trim() : (extra[h.hadithnumber] ?? ''), ...(set.filter ? { g: 'сахих · аль-Албани' } : {}) }))
      .sort((p, q) => p.n - q.n);
    const chunks = chunkBySize(all, 700_000);
    const books = new Map();
    for (let k = 0; k < chunks.length; k++) {
      await w(`hadith/${set.id}/c${k}.json`, chunks[k]);
      for (const h of chunks[k]) {
        if (!books.has(h.b)) books.set(h.b, { b: h.b, c: 0, ch: [] });
        const bk = books.get(h.b);
        bk.c++;
        if (!bk.ch.includes(k)) bk.ch.push(k);
      }
    }
    await w(`hadith/${set.id}/index.json`, { ...set, total: all.length, books: [...books.values()].sort((p, q) => p.b - q.b) });
    console.log(`${set.ru}: ${all.length} хадисов, ${books.size} книг, ${chunks.length} файлов`);
  }
}

/* ——— Азкары: «Хисн аль-Муслим» ——— */
const strip = (t) => t.replace(/[\u064B-\u065F\u0670\u0640\u06D6-\u06ED]/g, '').replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\u0621-\u064A ]/g, '').replace(/\s+/g, ' ').trim();

/** сильно упрощённая запись для сравнения: без огласовок, алифов, хамз и различий в написании ي/ى */
const loose = (t) => strip(t).replace(/[اءأإؤئ]/g, '').replace(/ /g, '');
const shingles = (t) => Array.from({ length: Math.max(0, t.length - 3) }, (_, i) => t.slice(i, i + 4));

async function azkar() {
  const src = await download(`${RAW}/rn0x/Adhkar-json/main/adhkar.json`, 'adhkar/adhkar.json');
  // аяты Корана с переводом Кулиева — чтобы показать смысл тех азкаров, которые являются аятами
  const verses = [];
  const suraLen = [];
  const suraTr = [];
  for (let n = 1; n <= 114; n++) {
    const sura = JSON.parse(await readFile(resolve(OUT, `quran/${n}.json`), 'utf8'));
    suraLen.push(sura.a.length);
    suraTr.push(sura.r);
    sura.a.forEach((ar, i) => {
      const key = loose(ar);
      if (key.length >= 10) verses.push({ n, a: i + 1, key, ru: sura.r[i] });
    });
  }
  let withRu = 0;
  const cats = src.map((c) => ({
    title: c.category,
    items: c.array.map((x) => {
      const text = loose(x.text.replace(/\([^)]*\)/g, ' '));
      const grams = new Set(shingles(text));
      const found = verses
        .map((v) => {
          const sh = shingles(v.key);
          return { v, share: sh.filter((g) => grams.has(g)).length / Math.max(1, sh.length), pos: text.indexOf(v.key.slice(0, 4)) };
        })
        .filter((h) => h.share >= 0.9 && h.pos >= 0)
        .sort((p, q) => q.v.key.length - p.v.key.length);
      // берём самые длинные совпадения, не перекрывающие друг друга (иначе 2:255 тянет за собой 3:2 и 42:4)
      const picked = [];
      for (const h of found) if (!picked.some((p) => h.pos >= p.pos && h.pos < p.pos + p.v.key.length)) picked.push(h);
      picked.sort((p, q) => p.pos - q.pos);
      const covered = picked.reduce((sum, h) => sum + h.v.key.length, 0);
      let q = [];
      if (picked.length && covered / text.length >= 0.5) {
        // подряд идущие аяты одной суры: заполняем пропуски; короткая сура берётся целиком
        const bySura = new Map();
        for (const h of picked) bySura.set(h.v.n, [...(bySura.get(h.v.n) ?? []), h.v.a]);
        for (const [n, list] of bySura) {
          const total = suraLen[n - 1];
          const from = total <= 6 && n !== 1 ? 1 : Math.min(...list);
          const to = total <= 6 && n !== 1 ? total : Math.max(...list);
          for (let a = from; a <= to; a++) q.push([n, a, suraTr[n - 1][a - 1]]);
        }
        withRu++;
      }
      return { ar: x.text.trim(), n: x.count, ...(q.length ? { q } : {}) };
    }),
  }));
  await w('azkar.json', cats);
  console.log('Азкары:', cats.reduce((s, c) => s + c.items.length, 0), 'текстов,', cats.length, 'разделов, из них аятов с переводом', withRu);
}

/* ——— Книги из data/books/*.md ——— */
async function books() {
  const { readdir } = await import('node:fs/promises');
  let files = [];
  try {
    files = (await readdir('data/books')).filter((f) => f.endsWith('.md') && f !== 'README.md');
  } catch {}
  const index = [];
  for (const f of files) {
    const raw = await readFile(`data/books/${f}`, 'utf8');
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    const head = Object.fromEntries((m?.[1] ?? '').split('\n').map((l) => l.split(/:\s*/, 2)).filter((x) => x[1]));
    const body = m?.[2] ?? raw;
    const id = head.id || f.replace(/\.md$/, '');
    const chapters = [];
    for (const part of body.split(/^# /m)) {
      const [title, ...rest] = part.split('\n');
      const paras = rest.join('\n').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
      if (!paras.length) continue;
      chapters.push({ t: title.trim() || `Часть ${chapters.length + 1}`, p: paras });
    }
    await w(`books/${id}.json`, { id, chapters });
    index.push({ id, title: head.title || id, author: head.author || '', ch: chapters.length });
  }
  await w('books/index.json', index);
  console.log('Книги из data/books:', index.length);
}

/* ——— 99 имён Аллаха: места упоминания в Коране считаются по тексту ——— */
async function names() {
  const list = JSON.parse(await readFile('data/names-of-allah.json', 'utf8'));
  const quranText = [];
  for (let n = 1; n <= 114; n++) {
    const sura = JSON.parse(await readFile(resolve(OUT, `quran/${n}.json`), 'utf8'));
    // в Коране долгое «а» часто пишется без алифа (надстрочный знак), поэтому алифы при сравнении отбрасываются
    sura.a.forEach((ar, i) => quranText.push({ n, a: i + 1, words: strip(ar).replace(/ا/g, '').split(' ') }));
  }
  const PREFIX = ['', 'و', 'ف', 'ب', 'ل', 'ك', 'وب', 'فب', 'ول', 'فل', 'وك'];
  const find = (key) => {
    const refs = [];
    let count = 0;
    for (const v of quranText) {
      let hit = 0;
      for (let k = 0; k + key.length <= v.words.length; k++) {
        const ok = key.every((w2, j) => (j === 0 ? PREFIX.some((p) => v.words[k] === p + w2) : v.words[k + j] === w2));
        if (ok) hit++;
      }
      if (hit) {
        count += hit;
        refs.push([v.n, v.a]);
      }
    }
    return { count, refs };
  };
  const out = list.map(([ar, tr, ru], i) => {
    const key = strip(ar).replace(/ا/g, '').split(' ');
    const def = find(key);
    // форма без артикля («рахим», «рауф» и т. п.) — только если с артиклем в Коране не найдено
    const bare = !def.count && key[0].startsWith('ل') && key[0].length > 3 ? find([key[0].slice(1), ...key.slice(1)]) : { count: 0, refs: [] };
    return { i: i + 1, ar, tr, ru, q: def.count, refs: def.refs.slice(0, 40), more: Math.max(0, def.refs.length - 40), qi: bare.count, refsI: bare.refs.slice(0, 40) };
  });
  await w('names.json', out);
  console.log('Имена Аллаха:', out.length, ', с артиклем в Коране:', out.filter((x) => x.q).length, ', без артикля:', out.filter((x) => !x.q && x.qi).length);
}

await rm(OUT, { recursive: true, force: true });
await quran();
await tafsir();
await hadith();
await azkar();
await names();
await books();
