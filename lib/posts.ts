import 'server-only';
import channelJson from '@/data/channel.json';
import { CATEGORIES } from './categories';
import type { CategoryId, FeaturedItem, Paragraph, Post, RawPost } from './types';
import { FEATURED, TITLE_OVERRIDES, CATEGORY_OVERRIDES } from '@/data/curation';

export const CHANNEL = {
  handle: channelJson.channel,
  url: channelJson.url,
  title: channelJson.title,
  counters: channelJson.counters as Record<string, string>,
  lastPostId: channelJson.lastPostId,
  fetchedAt: channelJson.fetchedAt,
};

const ARABIC = /[؀-ۿ]/;
const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
const fullText = (ps: Paragraph[]) => ps.map((p) => p.t).join('\n');
const count = (re: RegExp, s: string) => (s.match(re) ?? []).length;

/** Отнесение к рубрике по самому тексту; можно переопределить в data/curation.ts */
function classify(p: RawPost): CategoryId {
  if (CATEGORY_OVERRIDES[p.id]) return CATEGORY_OVERRIDES[p.id];
  const t = fullText(p.paragraphs);
  const head = p.paragraphs[0]?.t ?? '';
  if (/^Толкование/i.test(head) || /тафсир(а)? шейха/i.test(t)) return 'tafsir';
  const score: Record<CategoryId, number> = {
    tafsir: 0,
    quran: count(/\b[Сс]ура\b|\bаят(ы|ов|е)?\b|Коран/g, t) * 0.8,
    hadith: count(/хадис|передал|сообщается|ан-Насаи|аль-Бухари|Муслим|ат-Тирмизи|Ибн Маджа|Абу Дауд/gi, t),
    dua: count(/\bдуа\b|мольб|азкар|зикр|салават/gi, t) * 1.2,
    knowledge: count(/имам|шейх|фетв|фикх|учёны|ученые|книг/gi, t) * 0.9,
    reminders: 1.8,
  };
  return (Object.entries(score).sort((a, b) => b[1] - a[1])[0][0] as CategoryId) ?? 'reminders';
}

function cut(s: string, max: number) {
  if (s.length <= max) return s;
  const c = s.slice(0, max);
  return c.slice(0, Math.max(c.lastIndexOf(' '), max * 0.6)).replace(/[\s,;:—–-]+$/, '') + '…';
}

function deriveTitle(p: RawPost): string {
  if (TITLE_OVERRIDES[p.id]) return TITLE_OVERRIDES[p.id];
  const head = p.paragraphs[0]?.t ?? '';
  if (/^Толкование/i.test(head)) {
    const t = fullText(p.paragraphs);
    const refs = [...head.matchAll(/ас-Саади\s+(.+?)\s+(\d+):(\d+)/g)];
    const names = [...t.matchAll(/\(\s*([^()\d:]+?)\s*:\s*аят\s*(\d+)\s*\)/g)];
    const first = names[0];
    const last = names[names.length - 1];
    if (first) {
      const sura = refs[0]?.[2];
      const range = first[2] === last[2] ? first[2] : `${first[2]}–${last[2]}`;
      return `Тафсир ас-Саади: сура «${first[1].trim()}»${sura ? `, ${sura}:${range}` : `, аят ${range}`}`;
    }
    return 'Тафсир шейха ас-Саади';
  }
  const first = head.split('\n')[0];
  const sentence = first.split(/(?<=[.!?…])\s+/)[0] ?? first;
  return cut(sentence.replace(/[.:…\s]+$/, ''), 84);
}

function derivePreview(p: RawPost, title: string): string {
  const src = (p.paragraphs[0]?.t ?? '').split('\n')[0];
  const paras = p.paragraphs
    .filter((x) => !ARABIC.test(x.t) && !/^Толкование/i.test(x.t))
    .map((x) => x.t.replace(/\s+/g, ' ').trim());
  // абзац-заголовок не повторяем; совсем короткие абзацы-«выкрики» пропускаем
  const body = paras
    .map((t, i) => (i === 0 && !/^Тафсир/.test(title) && t.startsWith(src) && paras.length > 1 ? t.slice(src.length).trim() : t))
    .filter((t) => t.length >= 45);
  return cut((body.length ? body : paras).join(' '), 230);
}

export function getPosts(): Post[] {
  return (channelJson.posts as RawPost[])
    .map((raw) => {
      const title = deriveTitle(raw);
      const words = fullText(raw.paragraphs).split(/\s+/).length;
      return {
        id: raw.id,
        url: `${CHANNEL.url}/${raw.id}`,
        date: raw.date,
        dateLabel: dateFmt.format(new Date(raw.date)).replace(/\s?г\.$/, ''),
        title,
        preview: derivePreview(raw, title),
        category: classify(raw),
        paragraphs: raw.paragraphs,
        minutes: Math.max(1, Math.round(words / 180)),
      } satisfies Post;
    })
    .sort((a, b) => b.id - a.id);
}

/** Избранное: цитата принимается, только если она дословно есть в тексте публикации. */
export function getFeatured(posts: Post[]): FeaturedItem[] {
  const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();
  return FEATURED.flatMap((f) => {
    const post = posts.find((p) => p.id === f.postId);
    if (!post) return [];
    const hay = norm(fullText(post.paragraphs));
    const arabicLine = f.arabic === 'auto' ? fullText(post.paragraphs).split('\n').find((l) => ARABIC.test(l)) : f.arabic;
    const ok = hay.includes(norm(f.text)) && (!f.arabic || !!arabicLine);
    if (!ok) {
      console.warn(`[featured] цитата для ${f.postId} не найдена в тексте — пропущена`);
      return [];
    }
    return [{ ...f, arabic: arabicLine }];
  });
}

export function countByCategory(posts: Post[]) {
  return Object.fromEntries(CATEGORIES.map((c) => [c.id, posts.filter((p) => p.category === c.id).length])) as Record<CategoryId, number>;
}
