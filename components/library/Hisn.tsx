'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { azkar, type AzkarData } from '@/lib/client-data';
import { norm } from '@/lib/library-meta';
import { useApp } from '../AppProvider';
import { Screen } from '../Screen';
import { Group, Row, Segmented, fmt } from '../ui';
import { Actions, SearchField } from './Cards';
import { useBack } from './nav';

const NOTE = 'Хисн аль-Муслим — сборник Саида аль-Кахтани из Корана и достоверной Сунны. Арабский текст и число повторений. Если азкар — аят Корана, под ним приведён перевод смысла Э. Кулиева; русского перевода остальных текстов в открытых данных нет.';

export function HisnScreen() {
  const { push } = useApp();
  const back = useBack();
  const [data, setData] = useState<AzkarData | null>(null);
  const [mode, setMode] = useState<'all' | 'groups'>('all');
  const [open, setOpen] = useState<number | null>(0);
  const [q, setQ] = useState('');
  useEffect(() => void azkar().then(setData), []);

  const total = data?.cats.reduce((s, x) => s + x.items.length, 0) ?? 0;
  const s = norm(q.trim());
  const match = (i: number) => !s || norm(data!.cats[i].ru).includes(s) || data!.cats[i].title.includes(q.trim()) || String(i + 1) === s;
  const flat = useMemo(() => (data ? data.cats.map((_, i) => i).filter(match) : []), [data, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const row = (i: number, last: boolean) => {
    const c = data!.cats[i];
    return (
      <Row key={i} onClick={() => push({ k: 'hisnsec', i })} last={last}>
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tint-soft text-[13px] font-bold tabular-nums text-tint">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] leading-snug">{c.ru}</p>
            <p lang="ar" dir="rtl" className="truncate text-right text-[15px] leading-snug text-label2">{c.title}</p>
          </div>
          {c.items.length > 1 && <span className="shrink-0 text-[13px] text-label2">{c.items.length}</span>}
        </div>
      </Row>
    );
  };

  return (
    <Screen title="Азкары" subtitle={data ? `Хисн аль-Муслим · ${fmt(total)} текстов в ${data.cats.length} разделах` : 'Хисн аль-Муслим'} back={back}>
      <div className="space-y-4">
        <SearchField id="azkar-search" value={q} onChange={setQ} placeholder="Название раздела или номер" />
        <Segmented value={mode} onChange={setMode} options={[{ value: 'all', label: 'Все' }, { value: 'groups', label: 'Группы' }]} />
        {!data ? (
          <Group>{Array.from({ length: 6 }, (_, i) => <div key={i} className="m-4 h-10 animate-pulse rounded-xl bg-fill" />)}</Group>
        ) : mode === 'all' || s ? (
          flat.length ? <Group footer={NOTE}>{flat.map((i, k) => row(i, k === flat.length - 1))}</Group> : <Group><p className="p-5 text-center text-label2">Ничего не найдено</p></Group>
        ) : (
          <div className="space-y-3">
            {data.groups.map((g, gi) => (
              <section key={g.t} className="overflow-hidden rounded-[16px] bg-surface">
                <button onClick={() => setOpen(open === gi ? null : gi)} aria-expanded={open === gi} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                  <span className="flex-1 text-[17px] font-semibold">{g.t}</span>
                  <span className="text-[13px] text-label2">{g.ids.length}</span>
                  <ChevronDown size={18} strokeWidth={2.4} className={`text-label3 transition-transform duration-300 ${open === gi ? 'rotate-180' : ''}`} />
                </button>
                {open === gi && <div className="border-t border-sep">{g.ids.map((i, k) => row(i, k === g.ids.length - 1))}</div>}
              </section>
            ))}
            <p className="px-4 text-[13px] leading-snug text-label2">{NOTE}</p>
          </div>
        )}
      </div>
    </Screen>
  );
}

export function HisnSectionScreen({ i }: { i: number }) {
  const { settings, push, pop, stack } = useApp();
  const back = useBack();
  const [data, setData] = useState<AzkarData | null>(null);
  useEffect(() => void azkar().then(setData), []);
  const c = data?.cats[i];
  const go = (n: number) => (stack[stack.length - 2]?.k === 'hisnsec' ? pop() : push({ k: 'hisnsec', i: n }));
  return (
    <Screen title={c?.ru ?? `Раздел ${i + 1}`} subtitle={c ? `Раздел ${i + 1} · ${c.title}` : undefined} back={back}>
      {!c ? (
        <Group><div className="m-4 h-24 animate-pulse rounded-xl bg-fill" /></Group>
      ) : (
        <>
          <Group footer={NOTE}>
            {c.items.map((d, j) => {
              const id = `d:${i}:${j}`;
              return (
                <article key={j} className="relative px-4 pb-4 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-tint-soft px-2.5 py-1 text-[12px] font-bold tabular-nums text-tint">{j + 1}</span>
                      {d.n > 1 && <span className="rounded-full bg-fill px-2.5 py-1 text-[12px] font-semibold text-label2">повторить {d.n} {d.n >= 2 && d.n <= 4 ? 'раза' : 'раз'}</span>}
                    </div>
                    <Actions markId={id} mark={{ id, kind: 'dua', title: `Азкары · ${c.ru}`, sub: d.q ? d.q.map((x) => x[2]).join(' ') : d.ar, route: [{ k: 'hisn' }, { k: 'hisnsec', i }] }} text={`${c.ru}\n\n${d.ar}${d.q ? `\n\nПеревод смысла (Э. Кулиев): ${d.q.map((x) => x[2]).join(' ')}` : ''}${d.n > 1 ? `\n\nПовторить: ${d.n}` : ''}\n\n— Хисн аль-Муслим`} />
                  </div>
                  <p lang="ar" dir="rtl" className="quran mt-1 text-right" style={{ fontSize: `${settings.arSize}rem` }}>{d.ar}</p>
                  {d.q && (
                    <div className="mt-2 rounded-[14px] bg-bg p-3 text-[15px] leading-snug">
                      <p className="mb-1 text-[12px] font-semibold text-label2">Перевод смысла (Э. Кулиев)</p>
                      {d.q.map(([sn, an, tx]) => (
                        <p key={`${sn}:${an}`}><span className="font-semibold tabular-nums text-tint">{sn}:{an}</span> {tx}</p>
                      ))}
                    </div>
                  )}
                  {j < c.items.length - 1 && <span aria-hidden className="absolute bottom-0 left-4 right-0 h-px bg-sep" />}
                </article>
              );
            })}
          </Group>
          <div className="mt-5 flex justify-between gap-3">
            {i > 0 ? <button onClick={() => go(i - 1)} className="rounded-full bg-surface px-5 py-3 text-[15px] font-semibold text-tint">‹ {i}</button> : <span />}
            {data && i < data.cats.length - 1 && <button onClick={() => push({ k: 'hisnsec', i: i + 1 })} className="rounded-full bg-surface px-5 py-3 text-[15px] font-semibold text-tint">{i + 2} ›</button>}
          </div>
        </>
      )}
    </Screen>
  );
}
