'use client';
import type { BookChapter } from './client-data';

/** Книги, добавленные пользователем из файла, хранятся только на его устройстве (IndexedDB). */
export type LocalBook = { id: string; chapters: BookChapter[]; added: number };

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('hidaya', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('books', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const tx = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const d = await db();
  return new Promise((res, rej) => {
    const r = fn(d.transaction('books', mode).objectStore('books'));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
};
export const localIds = async () => {
  try {
    return (await tx('readonly', (s) => s.getAllKeys())) as string[];
  } catch {
    return [];
  }
};
export const localGet = (id: string) => tx<LocalBook | undefined>('readonly', (s) => s.get(id));
export const localPut = (b: LocalBook) => tx('readwrite', (s) => s.put(b));
export const localDelete = (id: string) => tx('readwrite', (s) => s.delete(id));

/** Делит текст на главы по строкам «# Название»; без заголовков — на части примерно по 4 000 знаков. */
export function parseBook(text: string): BookChapter[] {
  const clean = text.replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '');
  const chapters: BookChapter[] = [];
  const hasHeads = /^# /m.test(clean);
  if (hasHeads) {
    for (const part of clean.split(/^# /m)) {
      const [title, ...rest] = part.split('\n');
      const p = rest.join('\n').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
      if (p.length) chapters.push({ t: title.trim() || `Часть ${chapters.length + 1}`, p });
    }
  } else {
    const paras = clean.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
    let cur: string[] = [];
    let len = 0;
    for (const x of paras) {
      cur.push(x);
      len += x.length;
      if (len > 4000) {
        chapters.push({ t: `Часть ${chapters.length + 1}`, p: cur });
        cur = [];
        len = 0;
      }
    }
    if (cur.length) chapters.push({ t: `Часть ${chapters.length + 1}`, p: cur });
  }
  return chapters;
}
