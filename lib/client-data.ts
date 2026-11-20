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
export type QuranIndex = { suras: SuraInfo[]; juz: [number, number][] };
export type Sura = { n: number; a: string[]; r: string[]; t: string[] };
export type Hadith = { n: number; ar: string; ru: string; g?: string };
export type HadithIndex = { id: string; ru: string; ar: string; author: string; about: string; total: number; books: { b: number; en: string; c: number }[] };
export type HisnSection = { title: string; items: { id: string; ar: string; tr: string }[] };

export const quranIndex = () => getJSON<QuranIndex>('/library/quran/index.json');
export const sura = (n: number) => getJSON<Sura>(`/library/quran/${n}.json`);
export const quranRu = () => getJSON<string[][]>('/library/quran/ru.json');
export const hadithIndex = (c: string) => getJSON<HadithIndex>(`/library/hadith/${c}/index.json`);
export const hadithBook = (c: string, b: number) => getJSON<Hadith[]>(`/library/hadith/${c}/${b}.json`);
export const hisn = () => getJSON<HisnSection[]>('/library/hisn.json');
export const postsIndex = () => getJSON<PostLite[]>('/library/posts-index.json');
export async function postBody(id: number): Promise<Paragraph[]> {
  const chunk = await getJSON<Record<number, Paragraph[]>>(`/library/posts/c${Math.floor(id / 50)}.json`);
  return chunk[id] ?? [];
}

export const COLLECTIONS = ['bukhari', 'muslim', 'abudawud'] as const;
