'use client';

import { motion } from 'framer-motion';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { COLLECTIONS, hadithBook, hadithChunk, hadithIndex, type Hadith, type HadithIndex } from '@/lib/client-data';
import { FORTY_COLLECTIONS, HADITH_NAMES, MAIN_COLLECTIONS, SUNAN_COLLECTIONS, norm } from '@/lib/library-meta';
import { useApp, type Route } from '../AppProvider';
import { Screen } from '../Screen';
import { Group, Row, fmt, plural } from '../ui';
import { Actions, SearchField } from './Cards';
import { useBack } from './nav';

const bookTitle = (b: number) => (b === 0 ? 'Вступление' : `Книга ${b}`);

export function HadithCard({ c, h, flash }: { c: string; h: Hadith; flash?: boolean }) {
  const { settings } = useApp();
  const name = HADITH_NAMES[c].ru;
  const route: Route[] = [{ k: 'hadith' }, { k: 'coll', c }, { k: 'book', c, b: h.b, n: h.n }];
  return (
    <motion.article id={`h-${h.n}`} animate={{ backgroundColor: flash ? 'var(--tint-soft)' : 'rgba(0,0,0,0)' }} transition={{ duration: 0.6 }} className="relative scroll-mt-28 px-4 pb-4 pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-full bg-tint-soft px-2.5 py-1 text-[12px] font-bold tabular-nums text-tint">№ {h.n}</span>
          {h.g && <span className="rounded-full bg-fill px-2.5 py-1 text-[12px] font-semibold text-label2">{h.g}</span>}
        </div>
        <Actions markId={`h:${c}:${h.n}`} mark={{ id: `h:${c}:${h.n}`, kind: 'hadith', title: `${name}, № ${h.n}`, sub: h.x || h.a, route }} text={`${h.a}${h.x ? `\n\n${h.x}` : ''}\n\n— ${name}, хадис № ${h.n}`} />
      </div>
      {(settings.hadithAr || !h.x) && h.a && <p lang="ar" dir="rtl" className="quran mt-2 text-right text-[1.45rem] leading-[2.1]">{h.a}</p>}
      {h.x ? <p className="mt-2 whitespace-pre-line text-[17px] leading-[1.5]">{h.x}</p> : <p className="mt-2 text-[14px] text-label2">Русского перевода этого текста в источниках нет.</p>}
      <span aria-hidden className="absolute bottom-0 left-4 right-0 h-px bg-sep" />
    </motion.article>
  );
}

function CollRow({ c, x, last, onClick }: { c: string; x?: HadithIndex; last: boolean; onClick: () => void }) {
  const m = HADITH_NAMES[c];
  return (
    <Row onClick={onClick} last={last}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 py-0.5">
          <p className="text-[17px] font-medium leading-tight">{m.ru}</p>
          <p className="text-[13px] text-label2">{m.author}{x ? ` · ${fmt(x.total)} ${plural(x.total, 'хадис', 'хадиса', 'хадисов')}${x.books.length > 1 ? ` · ${x.books.length} книг` : ''}` : ''}</p>
        </div>
        <span lang="ar" dir="rtl" className="text-[21px] leading-none">{m.ar}</span>
      </div>
    </Row>
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
    <Screen title="Хадисы" subtitle={total ? `${fmt(total)} хадисов, только достоверные` : 'Только достоверные хадисы'} back={back}>
      <div className="space-y-6">
        <Group header="Два «Сахиха»" footer="Самые достоверные книги после Книги Аллаха. Русский перевод есть не у всех хадисов — показаны переведённые.">
          {MAIN_COLLECTIONS.map((c, i) => <CollRow key={c} c={c} x={idx[c]} last={i === MAIN_COLLECTIONS.length - 1} onClick={() => push({ k: 'coll', c })} />)}
        </Group>
        <Group header="Сборник «Сунан»" footer="Приводятся только хадисы, которые аль-Албани оценил как «сахих» (по данным открытого набора hadith-api); слабые хадисы намеренно не показываются. Оценки учёных могут расходиться — при сомнениях спрашивайте знающих людей.">
          {SUNAN_COLLECTIONS.map((c, i) => <CollRow key={c} c={c} x={idx[c]} last={i === SUNAN_COLLECTIONS.length - 1} onClick={() => push({ k: 'coll', c })} />)}
        </Group>
        <Group header="Сорок хадисов" footer="Арабский текст. Русского перевода в открытых данных нет.">
          {FORTY_COLLECTIONS.map((c, i) => <CollRow key={c} c={c} x={idx[c]} last={i === FORTY_COLLECTIONS.length - 1} onClick={() => push({ k: 'coll', c })} />)}
        </Group>
        <Group header="Что такое «Сунан»?">
          <div className="space-y-2 p-4 text-[15px] leading-snug text-label2">
            <p>«Сунан» — вид сборников хадисов, где хадисы расставлены по темам фикха: очищение, молитва, пост, торговля, брак и так далее. Так составлены «Сунан» Абу Дауда, ат-Тирмизи, ан-Насаи и Ибн Маджи.</p>
            <p>Вместе с «Сахихом» аль-Бухари и «Сахихом» Муслима их называют «шестью книгами» (аль-кутуб ас-ситта). В «Сахихах» собраны только достоверные хадисы, а в «Сунанах» есть и более слабые, поэтому здесь из них берутся лишь «сахих».</p>
          </div>
        </Group>
      </div>
    </Screen>
  );
}

type Hit = { h: Hadith };

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

  // поиск по всему сборнику: файлы читаются пачками, результаты появляются по ходу
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
    const n = Math.max(...idx.books.flatMap((b) => b.ch)) + 1;
    setHits([]);
    (async () => {
      for (let i = 0; i < n && alive; i += 4) {
        const part = await Promise.all(Array.from({ length: Math.min(4, n - i) }, (_, j) => hadithChunk(c, i + j).catch(() => [] as Hadith[])));
        for (const hs of part) for (const h of hs) if ((num !== null && h.n === num) || norm(h.x).includes(needle)) found.push({ h });
        if (!alive) return;
        setHits(found.slice(0, 80));
        setProgress([Math.min(i + 4, n), n]);
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
        <SearchField id="hadith-search" value={q} onChange={setQ} placeholder="Поиск по сборнику или номер" />
        {searching ? (
          <>
            {progress && progress[0] < progress[1] && <p className="px-2 text-[13px] text-label2">Проверено файлов: {progress[0]} из {progress[1]} · найдено {hits.length}</p>}
            {hits.length > 0 ? (
              <Group>
                {hits.map(({ h }) => (
                  <Row key={h.n} onClick={() => push({ k: 'book', c, b: h.b, n: h.n })} className="py-3">
                    <p className="text-[12px] font-semibold text-tint">№ {h.n} · {bookTitle(h.b)}</p>
                    <p className="mt-0.5 line-clamp-4 text-[15px] leading-snug">{h.x}</p>
                  </Row>
                ))}
              </Group>
            ) : (
              progress && progress[0] >= progress[1] && <Group><p className="p-5 text-center text-label2">Ничего не найдено</p></Group>
            )}
          </>
        ) : !idx ? (
          <Group>{Array.from({ length: 6 }, (_, i) => <div key={i} className="m-4 h-10 animate-pulse rounded-xl bg-fill" />)}</Group>
        ) : (
          <Group header={idx.books.length > 1 ? 'Книги' : 'Хадисы'} footer={idx.about}>
            {idx.books.length === 1 ? (
              <Row onClick={() => push({ k: 'book', c, b: idx.books[0].b })} last>
                <p className="text-[17px] font-medium">Читать все {idx.total} хадисов</p>
              </Row>
            ) : (
              idx.books.map((bk, i) => (
                <Row key={bk.b} onClick={() => push({ k: 'book', c, b: bk.b })} last={i === idx.books.length - 1}>
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tint-soft text-[14px] font-bold tabular-nums text-tint">{bk.b}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[17px] font-medium leading-tight">{bookTitle(bk.b)}</p>
                      <p className="truncate text-[13px] text-label2">{bk.c} {plural(bk.c, 'хадис', 'хадиса', 'хадисов')}</p>
                    </div>
                  </div>
                </Row>
              ))
            )}
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

  const single = idx?.books.length === 1;
  return (
    <Screen
      title={single ? HADITH_NAMES[c].ru : bookTitle(b)}
      subtitle={`${single ? HADITH_NAMES[c].author : HADITH_NAMES[c].ru}${items ? ` · ${items.length} ${plural(items.length, 'хадис', 'хадиса', 'хадисов')}` : ''}`}
      back={back}
      trailing={
        <button onClick={() => setSettings({ hadithAr: !settings.hadithAr })} aria-pressed={settings.hadithAr} aria-label="Показывать арабский текст" className={`glass grid size-10 place-items-center rounded-full text-[19px] ${settings.hadithAr ? 'text-tint' : 'text-label2'}`}>
          <span lang="ar" className="leading-none">ع</span>
        </button>
      }
    >
      {!items || !idx ? (
        <Group>{Array.from({ length: 3 }, (_, i) => <div key={i} className="m-4 h-24 animate-pulse rounded-xl bg-fill" />)}</Group>
      ) : (
        <>
          <Group>{items.slice(0, shown).map((h) => <HadithCard key={h.n} c={c} h={h} flash={flash === h.n} />)}</Group>
          {items.length > shown && (
            <button onClick={() => setShown((s) => s + PAGE)} className="mx-auto mt-6 block rounded-full bg-surface px-7 py-3 text-[16px] font-semibold text-tint">
              Показать ещё · {items.length - shown}
            </button>
          )}
        </>
      )}
    </Screen>
  );
}
