'use client';

import { motion } from 'framer-motion';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { quranIndex, sura as loadSura, tafsirIndex, tafsirSura, getJSON, type QuranIndex, type Sura, type TafsirInfo, type TafsirSura } from '@/lib/client-data';
import { norm } from '@/lib/library-meta';
import { useApp } from '../AppProvider';
import { Screen } from '../Screen';
import { Group, Row, fmt } from '../ui';
import { Actions, SearchField } from './Cards';
import { useBack } from './nav';

export function TafsirsScreen() {
  const { push } = useApp();
  const back = useBack();
  const [items, setItems] = useState<TafsirInfo[] | null>(null);
  useEffect(() => void tafsirIndex().then(setItems), []);
  return (
    <Screen title="Тафсир" subtitle="Толкование всего Корана на русском языке: аят за аятом." back={back}>
      <Group footer="Тексты — из открытого набора данных (QUL, tarteel.ai). Тафсир — это толкование, а не перевод; при вопросах обращайтесь к печатным изданиям и знающим людям.">
        {!items
          ? Array.from({ length: 3 }, (_, i) => <div key={i} className="m-4 h-12 animate-pulse rounded-xl bg-fill" />)
          : items.map((t, i) => (
              <Row key={t.id} onClick={() => push({ k: 'tafsir', id: t.id })} last={i === items.length - 1}>
                <p className="text-[17px] font-medium leading-tight">{t.name}</p>
                <p className="text-[13px] text-label2">{t.author}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-label2">{t.note}</p>
              </Row>
            ))}
      </Group>
    </Screen>
  );
}

type Hit = { n: number; from: number; snippet: string };

export function TafsirScreen({ id, q: q0 }: { id: string; q?: string }) {
  const { push } = useApp();
  const back = useBack();
  const [info, setInfo] = useState<TafsirInfo | null>(null);
  const [idx, setIdx] = useState<QuranIndex | null>(null);
  const [q, setQ] = useState(q0 ?? '');
  const dq = useDeferredValue(q.trim());
  const [hits, setHits] = useState<Hit[]>([]);
  const [progress, setProgress] = useState<[number, number] | null>(null);

  useEffect(() => {
    tafsirIndex().then((l) => setInfo(l.find((x) => x.id === id) ?? null));
    quranIndex().then(setIdx);
  }, [id]);

  // поиск по тексту тафсира: файлы читаются пачками, результаты появляются по ходу
  useEffect(() => {
    if (!info || dq.length < 3) {
      setHits([]);
      setProgress(null);
      return;
    }
    let alive = true;
    const needle = norm(dq);
    const found: Hit[] = [];
    const chunks = [...new Set(info.chunkOf)];
    setHits([]);
    (async () => {
      for (let i = 0; i < chunks.length && alive; i += 3) {
        const part = await Promise.all(chunks.slice(i, i + 3).map((k) => getJSON<Record<number, TafsirSura>>(`/library/tafsir/${info.id}/${k}.json`).catch(() => ({}) as Record<number, TafsirSura>)));
        for (const obj of part)
          for (const [n, entries] of Object.entries(obj))
            for (const [from, text] of entries) {
              const p = norm(text).indexOf(needle);
              if (p >= 0) found.push({ n: Number(n), from, snippet: `${p > 60 ? '…' : ''}${text.slice(Math.max(0, p - 60), p + 140)}…` });
            }
        if (!alive) return;
        found.sort((a, b) => a.n - b.n || a.from - b.from);
        setHits(found.slice(0, 60));
        setProgress([Math.min(i + 3, chunks.length), chunks.length]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [info, dq]);

  const searching = dq.length >= 3;
  return (
    <Screen title={info?.name ?? 'Тафсир'} subtitle={info?.author} back={back}>
      <div className="space-y-4">
        <SearchField id="tafsir-search" value={q} onChange={setQ} placeholder="Поиск по тексту тафсира" />
        {searching ? (
          <>
            {progress && progress[0] < progress[1] && <p className="px-2 text-[13px] text-label2">Проверено файлов: {progress[0]} из {progress[1]} · найдено {hits.length}</p>}
            {hits.length > 0 ? (
              <Group>
                {hits.map((h, i) => (
                  <Row key={`${h.n}:${h.from}:${i}`} onClick={() => push({ k: 'tafsirsura', id, n: h.n, a: h.from })} className="py-3">
                    <p className="text-[12px] font-semibold text-tint">{idx?.suras[h.n - 1].tr} · {h.n}:{h.from}</p>
                    <p className="mt-0.5 line-clamp-4 text-[15px] leading-snug">{h.snippet}</p>
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
          <Group header="Суры" footer={info?.note}>
            {idx.suras.map((s, i) => (
              <Row key={s.n} onClick={() => push({ k: 'tafsirsura', id, n: s.n })} last={i === 113}>
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tint-soft text-[14px] font-bold tabular-nums text-tint">{s.n}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[17px] font-medium leading-tight">{s.tr}</p>
                    <p className="truncate text-[13px] text-label2">{s.ru} · {fmt(s.v)} ая.</p>
                  </div>
                  <span lang="ar" dir="rtl" className="text-[21px] leading-none">{s.ar}</span>
                </div>
              </Row>
            ))}
          </Group>
        )}
      </div>
    </Screen>
  );
}

export function TafsirSuraScreen({ id, n, a }: { id: string; n: number; a?: number }) {
  const { settings, push, stack, pop } = useApp();
  const back = useBack();
  const [info, setInfo] = useState<TafsirInfo | null>(null);
  const [idx, setIdx] = useState<QuranIndex | null>(null);
  const [data, setData] = useState<Sura | null>(null);
  const [entries, setEntries] = useState<TafsirSura | null>(null);
  const [err, setErr] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const jumped = useRef(false);

  useEffect(() => {
    setData(null);
    setEntries(null);
    setErr(false);
    jumped.current = false;
    quranIndex().then(setIdx);
    loadSura(n).then(setData).catch(() => setErr(true));
    tafsirIndex().then((l) => {
      const t = l.find((x) => x.id === id);
      setInfo(t ?? null);
      if (t) tafsirSura(t, n).then(setEntries).catch(() => setErr(true));
    });
  }, [id, n]);

  const target = entries && a ? ([...entries].reverse().find((e) => e[0] <= a)?.[0] ?? null) : null;
  useEffect(() => {
    if (!target || !entries || !data || jumped.current) return;
    jumped.current = true;
    const t = setTimeout(() => {
      document.getElementById(`tf-${target}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      setFlash(target);
      setTimeout(() => setFlash(null), 2200);
    }, 450);
    return () => clearTimeout(t);
  }, [target, entries, data]);

  const info2 = idx?.suras[n - 1];
  return (
    <Screen title={info2 ? info2.tr : `Сура ${n}`} subtitle={info ? `${info.name} · ${info2?.ru ?? ''}` : undefined} back={back}>
      {err && <Group><p className="p-5 text-center text-label2">Не удалось загрузить. Проверьте соединение.</p></Group>}
      {(!entries || !data) && !err && <Group>{Array.from({ length: 3 }, (_, i) => <div key={i} className="m-4 h-28 animate-pulse rounded-xl bg-fill" />)}</Group>}
      {entries && data && (
        <div className="space-y-4">
          {entries.map(([from, text], i) => {
            const to = (entries[i + 1]?.[0] ?? data.a.length + 1) - 1;
            const bm = `t:${id}:${n}:${from}`;
            return (
              <motion.section key={from} id={`tf-${from}`} animate={{ backgroundColor: flash === from ? 'var(--tint-soft)' : 'var(--surface)' }} transition={{ duration: 0.6 }} className="scroll-mt-24 overflow-hidden rounded-[22px] bg-surface">
                <div className="flex items-center justify-between px-4 pt-3">
                  <span className="rounded-full bg-tint-soft px-2.5 py-1 text-[12px] font-bold tabular-nums text-tint">
                    {n}:{from}{to > from ? `–${to}` : ''}
                  </span>
                  <Actions markId={bm} mark={{ id: bm, kind: 'quran', title: `${info?.name ?? 'Тафсир'} · ${info2?.tr ?? n} ${n}:${from}${to > from ? `–${to}` : ''}`, sub: text.slice(0, 160), route: [{ k: 'tafsirs' }, { k: 'tafsir', id }, { k: 'tafsirsura', id, n, a: from }] }} text={`${text}\n\n— ${info?.name}, сура ${n}, аят ${from}${to > from ? `–${to}` : ''}`} />
                </div>
                <div className="mx-4 mt-1 rounded-[16px] bg-bg p-3.5">
                  {data.a.slice(from - 1, Math.min(to, from + 5)).map((ar, j) => (
                    <div key={j} className={j ? 'mt-3 border-t border-sep pt-3' : ''}>
                      <p lang="ar" dir="rtl" className="quran text-right" style={{ fontSize: `${Math.min(settings.arSize, 1.9)}rem` }}>{ar}</p>
                      <p className="mt-1 text-[15px] leading-snug text-label2">{data.r[from - 1 + j]}</p>
                    </div>
                  ))}
                  {to - from > 5 && <p className="mt-2 text-[13px] text-label2">…и ещё {to - from - 5} {to - from - 5 === 1 ? 'аят' : 'аятов'} — полностью в суре.</p>}
                </div>
                <div className="space-y-3 whitespace-pre-line px-4 pb-4 pt-3 text-[17px] leading-[1.6]">{text}</div>
              </motion.section>
            );
          })}
          <div className="flex justify-between gap-3 pt-2">
            {n > 1 ? <button onClick={() => (stack.length > 1 && stack[stack.length - 2]?.k === 'tafsirsura' ? pop() : push({ k: 'tafsirsura', id, n: n - 1 }))} className="rounded-full bg-surface px-5 py-3 text-[15px] font-semibold text-tint">‹ {idx?.suras[n - 2].tr}</button> : <span />}
            {n < 114 && <button onClick={() => push({ k: 'tafsirsura', id, n: n + 1 })} className="rounded-full bg-surface px-5 py-3 text-[15px] font-semibold text-tint">{idx?.suras[n].tr} ›</button>}
          </div>
        </div>
      )}
    </Screen>
  );
}
