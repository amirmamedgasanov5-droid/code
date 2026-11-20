'use client';
import type { Paragraph, PostLite } from './types';

const cache = new Map<string, Promise<unknown>>();

/** Загрузка статического JSON с кешем; при ошибке запись очищается, чтобы можно было повторить. */
export function getJSON<T>(url: string): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json() as Promise<T>;
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

export type SuraInfo = { n: number; ar: string; tr: string; ru: string; t: 'm' | 'd'; v: number };
export type QuranIndex = {
  suras: SuraInfo[];
  juz: [number, number][];
  translations: { id: string; name: string }[];
  pages: [number, number][];
  hizb: [number, number][];
  manzil: [number, number][];
  ruku: [number, number][];
  sajda: [number, number][];
};
export type Sura = { n: number; a: string[]; r: string[] };
/** n — номер, b — книга, a — арабский, x — перевод (русский или английский), g — оценка из источника */
export type Hadith = { n: number; b: number; a: string; x: string; g?: string };
export type HadithBook = { b: number; c: number; ch: number[] };
export type HadithIndex = { id: string; ru: string; ar: string; author: string; about: string; lang: 'ru' | 'ar'; total: number; books: HadithBook[] };
export type AzkarCategory = { title: string; items: { ar: string; n: number; q?: [number, number, string][] }[] };
export type NameOfAllah = { i: number; ar: string; tr: string; ru: string; q: number; refs: [number, number][]; more: number; qi: number; refsI: [number, number][] };
export type TafsirInfo = { id: string; name: string; author: string; note: string; chunkOf: number[] };
/** [первый аят, текст]: один комментарий действует до следующего фрагмента */
export type TafsirSura = [number, string][];

export const quranIndex = () => getJSON<QuranIndex>('/library/quran/index.json');
export const sura = (n: number) => getJSON<Sura>(`/library/quran/${n}.json`);
/** Все аяты одного перевода: массив из 114 массивов */
export const translation = (id: string) => getJSON<string[][]>(`/library/quran/tr/${id}.json`);
export const quranRu = () => translation('kuliev');
export const tafsirIndex = () => getJSON<TafsirInfo[]>('/library/tafsir/index.json');
export async function tafsirSura(info: TafsirInfo, n: number): Promise<TafsirSura> {
  const chunk = await getJSON<Record<number, TafsirSura>>(`/library/tafsir/${info.id}/${info.chunkOf[n - 1]}.json`);
  return chunk[n] ?? [];
}
export const hadithIndex = (c: string) => getJSON<HadithIndex>(`/library/hadith/${c}/index.json`);
export const hadithChunk = (c: string, k: number) => getJSON<Hadith[]>(`/library/hadith/${c}/c${k}.json`);
export async function hadithBook(c: string, b: number): Promise<Hadith[]> {
  const idx = await hadithIndex(c);
  const chunks = idx.books.find((x) => x.b === b)?.ch ?? [];
  const parts = await Promise.all(chunks.map((k) => hadithChunk(c, k)));
  return parts.flat().filter((h) => h.b === b);
}
export const azkar = () => getJSON<AzkarCategory[]>('/library/azkar.json');
export const names = () => getJSON<NameOfAllah[]>('/library/names.json');
export const postsIndex = () => getJSON<PostLite[]>('/library/posts-index.json');
export async function postBody(id: number): Promise<Paragraph[]> {
  const chunk = await getJSON<Record<number, Paragraph[]>>(`/library/posts/c${Math.floor(id / 100)}.json`);
  return chunk[id] ?? [];
}

export const COLLECTIONS = ['bukhari', 'muslim', 'abudawud', 'nawawi'] as const;
