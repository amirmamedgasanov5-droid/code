'use client';

import { motion } from 'framer-motion';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { COLLECTIONS, hadithBook, hadithIndex, type Hadith, type HadithIndex } from '@/lib/client-data';
import { HADITH_NAMES, norm } from '@/lib/library-meta';
import { useApp, type Route } from '../AppProvider';
import { Screen } from '../Screen';
import { Group, Row, fmt, plural } from '../ui';
import { Actions, SearchField } from './Cards';
import { useBack } from './nav';

export function HadithCard({ c, b, h, flash }: { c: string; b: number; h: Hadith; flash?: boolean }) {
  const { settings } = useApp();
  const name = HADITH_NAMES[c].ru;
  const route: Route[] = [{ k: 'hadith' }, { k: 'coll', c }, { k: 'book', c, b, n: h.n }];
  return (
    <motion.article id={`h-${h.n}`} animate={{ backgroundColor: flash ? 'var(--tint-soft)' : 'rgba(0,0,0,0)' }} transition={{ duration: 0.6 }} className="relative scroll-mt-28 px-4 pb-4 pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-full bg-tint-soft px-2.5 py-1 text-[12px] font-bold tabular-nums text-tint">№ {h.n}</span>
          {h.g && <span className="rounded-full bg-fill px-2.5 py-1 text-[12px] font-semibold text-label2">{h.g}</span>}
        </div>
        <Actions markId={`h:${c}:${h.n}`} mark={{ id: `h:${c}:${h.n}`, kind: 'hadith', title: `${name}, № ${h.n}`, sub: h.ru, route }} text={`${h.ru}\n\n— ${name}, хадис № ${h.n}`} />
      </div>
      {settings.hadithAr && h.ar && <p lang="ar" dir="rtl" className="quran mt-2 text-right text-[1.45rem] leading-[2.1]">{h.ar}</p>}
      <p className="mt-2 whitespace-pre-line text-[17px] leading-[1.5]">{h.ru}</p>
      <span aria-hidden className="absolute bottom-0 left-4 right-0 h-px bg-sep" />
    </motion.article>
  );
}

export function HadithScreen() {
  const { push } = useApp();
  const back = useBack();
  const [idx, setIdx] = useState<Record<string, HadithIndex>>({});
  useEffect(() => {
    COLLECTIONS.forEach((c) => hadithIndex(c).then((i) => setIdx((s) => ({ ...s, [c]: i }))));
  }, []);
  const total = Object.values(idx).reduce((s, i) => s + i.total, 0);
  return (
    <Screen title="Хадисы" subtitle={total ? `${fmt(total)} хадисов на русском и арабском` : 'Три сборника на русском и арабском'} back={back}>
      <Group footer="Тексты — из открытого набора данных. Русский перевод в нём есть не для всех хадисов: показаны только переведённые. Для проверки сверяйтесь с печатными изданиями.">
        {COLLECTIONS.map((c, i) => {
          const m = HADITH_NAMES[c];
          const x = idx[c];
          return (
            <Row key={c} onClick={() => push({ k: 'coll', c })} last={i === COLLECTIONS.length - 1}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1 py-0.5">
                  <p className="text-[17px] font-medium leading-tight">{m.ru}</p>
                  <p className="text-[13px] text-label2">{m.author}{x ? ` · ${fmt(x.total)} ${plural(x.total, 'хадис', 'хадиса', 'хадисов')} · ${x.books.length} книг` : ''}</p>
                </div>
                <span lang="ar" dir="rtl" className="text-[21px] leading-none">{m.ar}</span>
              </div>
            </Row>
          );
        })}
      </Group>
    </Screen>
  );
}

const bookTitle = (b: number, en?: string) => (b === 0 ? (en ? 'Вступление' : 'Без раздела') : `Книга ${b}`);

type Hit = { b: number; h: Hadith };

export function CollScreen({ c, q: q0 }: { c: string; q?: string }) {
  const { push } = useApp();
  const back = useBack();
  const [idx, setIdx] = useState<HadithIndex | null>(null);
  const [q, setQ] = useState(q0 ?? '');
  const dq = useDeferredValue(q.trim());
  const [hits, setHits] = useState<Hit[]>([]);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const m = HADITH_NAMES[c];

  useEffect(() => void hadithIndex(c).then(setIdx), [c]);

  // поиск по всему сборнику: книги читаются пачками, результаты появляются по ходу
  useEffect(() => {
    if (!idx || dq.length < 3) {
      setHits([]);
      setProgress(null);
      return;
    }
    let alive = true;
    const needle = norm(dq);
    const num = /^\d+$/.test(dq) ? Number(dq) : null;
    const found: Hit[] = [];
    const books = idx.books;
    setHits([]);
    (async () => {
      for (let i = 0; i < books.length && alive; i += 6) {
        const part = await Promise.all(books.slice(i, i + 6).map((bk) => hadithBook(c, bk.b).then((hs) => ({ b: bk.b, hs })).catch(() => ({ b: bk.b, hs: [] as Hadith[] }))));
        for (const { b, hs } of part) for (const h of hs) if ((num !== null && h.n === num) || norm(h.ru).includes(needle)) found.push({ b, h });
        if (!alive) return;
        setHits(found.slice(0, 80));
        setProgress([Math.min(i + 6, books.length), books.length]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [idx, dq, c]);

  const searching = dq.length >= 3;
  return (
    <Screen title={m.ru} subtitle={`${m.author}${idx ? ` · ${fmt(idx.total)} хадисов` : ''}`} back={back}>
      <div className="space-y-4">
        <SearchField id="hadith-search" value={q} onChange={setQ} placeholder={`Поиск по сборнику или номер`} />
        {searching ? (
          <>
            {progress && progress[0] < progress[1] && <p className="px-2 text-[13px] text-label2">Проверено книг: {progress[0]} из {progress[1]} · найдено {hits.length}</p>}
            {hits.length > 0 ? (
              <Group>
                {hits.map(({ b, h }) => (
                  <div key={`${b}-${h.n}`}>
                    <Row onClick={() => push({ k: 'book', c, b, n: h.n })} className="py-3">
                      <p className="text-[12px] font-semibold text-tint">№ {h.n} · {bookTitle(b)}</p>
                      <p className="mt-0.5 line-clamp-4 text-[15px] leading-snug">{h.ru}</p>
                    </Row>
                  </div>
                ))}
              </Group>
            ) : (
              progress && progress[0] >= progress[1] && <Group><p className="p-5 text-center text-label2">Ничего не найдено</p></Group>
            )}
          </>
        ) : !idx ? (
          <Group>{Array.from({ length: 6 }, (_, i) => <div key={i} className="m-4 h-10 animate-pulse rounded-xl bg-fill" />)}</Group>
        ) : (
          <Group header="Книги" footer={idx.about}>
            {idx.books.map((bk, i) => (
              <Row key={bk.b} onClick={() => push({ k: 'book', c, b: bk.b })} last={i === idx.books.length - 1}>
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tint-soft text-[14px] font-bold tabular-nums text-tint">{bk.b}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[17px] font-medium leading-tight">{bookTitle(bk.b, bk.en)}</p>
                    <p className="truncate text-[13px] text-label2">{bk.en ? `${bk.en} · ` : ''}{bk.c} {plural(bk.c, 'хадис', 'хадиса', 'хадисов')}</p>
                  </div>
                </div>
              </Row>
            ))}
          </Group>
        )}
      </div>
    </Screen>
  );
}

const PAGE = 25;
export function BookScreen({ c, b, n }: { c: string; b: number; n?: number }) {
  const { settings, setSettings } = useApp();
  const back = useBack();
  const [items, setItems] = useState<Hadith[] | null>(null);
  const [idx, setIdx] = useState<HadithIndex | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [flash, setFlash] = useState<number | null>(null);
  const jumped = useRef(false);

  useEffect(() => {
    setItems(null);
    jumped.current = false;
    hadithBook(c, b).then((hs) => {
      setItems(hs);
      if (n) setShown(Math.max(PAGE, hs.findIndex((h) => h.n === n) + 10));
    });
    hadithIndex(c).then(setIdx);
  }, [c, b, n]);

  useEffect(() => {
    if (!items || !n || jumped.current) return;
    jumped.current = true;
    const t = setTimeout(() => {
      document.getElementById(`h-${n}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setFlash(n);
      setTimeout(() => setFlash(null), 2200);
    }, 450);
    return () => clearTimeout(t);
  }, [items, n]);

  const en = idx?.books.find((x) => x.b === b)?.en;
  return (
    <Screen
      title={bookTitle(b, idx?.books.find((x) => x.b === b)?.en)}
      subtitle={`${HADITH_NAMES[c].ru}${en ? ` · ${en}` : ''}${items ? ` · ${items.length} ${plural(items.length, 'хадис', 'хадиса', 'хадисов')}` : ''}`}
      back={back}
      trailing={
        <button onClick={() => setSettings({ hadithAr: !settings.hadithAr })} aria-pressed={settings.hadithAr} aria-label="Показывать арабский текст" className={`glass grid size-10 place-items-center rounded-full text-[19px] ${settings.hadithAr ? 'text-tint' : 'text-label2'}`}>
          <span lang="ar" className="leading-none">ع</span>
        </button>
      }
    >
      {!items ? (
        <Group>{Array.from({ length: 3 }, (_, i) => <div key={i} className="m-4 h-24 animate-pulse rounded-xl bg-fill" />)}</Group>
      ) : (
        <>
          <Group>{items.slice(0, shown).map((h) => <HadithCard key={h.n} c={c} b={b} h={h} flash={flash === h.n} />)}</Group>
          {items.length > shown && (
            <button onClick={() => setShown((s) => s + PAGE)} className="glass mx-auto mt-6 block rounded-full px-7 py-3 text-[16px] font-semibold text-tint">
              Показать ещё · {items.length - shown}
            </button>
          )}
        </>
      )}
    </Screen>
  );
}
