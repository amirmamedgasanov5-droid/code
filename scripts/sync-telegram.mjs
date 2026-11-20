#!/usr/bin/env node
/**
 * Забирает публичные публикации канала с https://t.me/s/<channel> и сохраняет
 * их в data/channel.json. Ничего не выдумывает: только то, что отдаёт Telegram.
 *
 * - Если сеть недоступна, остаётся прежний data/channel.json (сборка не падает).
 * - Запуск вручную:  npm run sync
 * - Глубина истории: SYNC_PAGES=20 npm run sync   (≈20 сообщений на страницу)
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHANNEL = 'hidaya_islam1';
const PAGES = Number(process.env.SYNC_PAGES ?? 16);
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../data/channel.json');
const MIN_TEXT = 140; // короткие подписи к картинкам в ленту не берём

const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (m) => entities[m] ?? m);

// Декоративные символы канала (разделители, эмодзи) не несут смысла и в интерфейсе не нужны.
const PICTO = /[\p{Extended_Pictographic}\ufe0f\u200b\u200c\u200d\ufeff]/gu;
const FIXES = [
  [/🤩егодня/g, 'Сегодня'],
  [/🤩ятница/g, 'Пятница'],
  [/Пророк Мухаммад 🌱/g, 'Пророк Мухаммад ﷺ'],
  [/Пророка 🌱/g, 'Пророка ﷺ'],
  [/🎥/g, '—'],
];

function cleanText(html) {
  let t = html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  t = decode(t).replace(/\u00a0/g, ' ');
  for (const [re, to] of FIXES) t = t.replace(re, to);
  const paras = [];
  let buf = [];
  let quote = false;
  const flush = () => {
    if (buf.length) paras.push({ t: buf.join('\n').trim(), ...(quote ? { q: true } : {}) });
    buf = [];
    quote = false;
  };
  for (const raw of t.split('\n')) {
    const isQ = /^[\s\u200b]*⚜/u.test(raw);
    const line = raw.replace(PICTO, '').replace(/[ \t]+/g, ' ').trim();
    if (!line) {
      flush();
      continue;
    }
    if (isQ && buf.length) flush();
    if (!buf.length) quote = isQ;
    buf.push(line);
  }
  flush();
  return paras.filter((p) => p.t);
}

function parsePage(html) {
  const out = [];
  for (const block of html.split('tgme_widget_message_wrap').slice(1)) {
    const id = block.match(/data-post="[^/]+\/(\d+)"/)?.[1];
    const date = block.match(/<time[^>]*datetime="([^"]+)"/)?.[1];
    const text = block.match(/js-message_text[^>]*>([\s\S]*?)<\/div>\s*(?:<div class="tgme_widget_message_(?:footer|reactions)|<\/div>|<div class="tgme_widget_message_(?:info|meta))/)?.[1]
      ?? block.match(/js-message_text[^>]*>([\s\S]*?)<\/div>/)?.[1];
    if (!id || !date) continue;
    out.push({ id: +id, date, paragraphs: text ? cleanText(text) : [] });
  }
  return out;
}

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; HidayaSync/1.0)' }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

async function main() {
  let first;
  try {
    first = await get(`https://t.me/s/${CHANNEL}`);
  } catch (e) {
    console.warn(`[sync] Telegram недоступен (${e.message}). Использую сохранённый data/channel.json.`);
    return;
  }

  const title = decode(first.match(/tgme_channel_info_header_title[^>]*>(?:<span[^>]*>)?([\s\S]*?)<\/(?:span|div)>/)?.[1]?.replace(/<[^>]+>/g, '') ?? 'HIDAYA').trim();
  const counters = {};
  for (const m of first.matchAll(/counter_value">([^<]+)<\/span> <span class="counter_type">([^<]+)</g)) counters[m[2]] = m[1];

  let all = parsePage(first);
  let before = Math.min(...all.map((p) => p.id));
  for (let i = 1; i < PAGES && Number.isFinite(before); i++) {
    try {
      const page = parsePage(await get(`https://t.me/s/${CHANNEL}?before=${before}`));
      if (!page.length) break;
      all = all.concat(page);
      before = Math.min(...page.map((p) => p.id));
    } catch (e) {
      console.warn(`[sync] страница ${i}: ${e.message}`);
      break;
    }
  }

  const seen = new Set();
  const posts = all
    .filter((p) => !seen.has(p.id) && seen.add(p.id))
    .map((p) => ({ ...p, length: p.paragraphs.reduce((n, x) => n + x.t.length, 0) }))
    .filter((p) => p.length >= MIN_TEXT)
    .sort((a, b) => b.id - a.id)
    .map(({ length, ...p }) => p);

  const data = {
    channel: CHANNEL,
    title,
    url: `https://t.me/${CHANNEL}`,
    counters,
    lastPostId: Math.max(...all.map((p) => p.id)),
    fetchedAt: new Date().toISOString(),
    posts,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data, null, 2) + '\n');
  console.log(`[sync] ${posts.length} публикаций, последний id ${data.lastPostId}, счётчики:`, counters);
}

main().catch((e) => {
  console.warn('[sync] ошибка, использую сохранённые данные:', e.message);
});
