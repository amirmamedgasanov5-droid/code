'use client';

import { useEffect, useState } from 'react';
import { azkar, type AzkarCategory } from '@/lib/client-data';
import { useApp } from '../AppProvider';
import { Screen } from '../Screen';
import { Group, Row, fmt } from '../ui';
import { Actions, SearchField } from './Cards';
import { useBack } from './nav';

const NOTE = 'Хисн аль-Муслим — сборник Саида аль-Кахтани из Корана и достоверной Сунны. Арабский текст и число повторений. Если азкар — аят Корана, под ним приведён перевод смысла Э. Кулиева; русского перевода остальных текстов в открытых данных нет.';

export function HisnScreen() {
  const { push } = useApp();
  const back = useBack();
  const [data, setData] = useState<AzkarCategory[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => void azkar().then(setData), []);
  const total = data?.reduce((s, x) => s + x.items.length, 0) ?? 0;
  const s = q.trim();
  const list = data?.map((c, i) => ({ c, i })).filter(({ c }) => !s || c.title.includes(s)) ?? [];
  return (
    <Screen title="Азкары" subtitle={data ? `Хисн аль-Муслим · ${fmt(total)} текстов в ${data.length} разделах` : 'Хисн аль-Муслим'} back={back}>
      <div className="space-y-4">
        <SearchField id="azkar-search" value={q} onChange={setQ} placeholder="Поиск по названию раздела (по-арабски)" />
        {!data ? (
          <Group>{Array.from({ length: 6 }, (_, i) => <div key={i} className="m-4 h-10 animate-pulse rounded-xl bg-fill" />)}</Group>
        ) : list.length ? (
          <Group footer={NOTE}>
            {list.map(({ c, i }, k) => (
              <Row key={i} onClick={() => push({ k: 'hisnsec', i })} last={k === list.length - 1}>
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tint-soft text-[13px] font-bold tabular-nums text-tint">{i + 1}</span>
                  <p lang="ar" dir="rtl" className="min-w-0 flex-1 text-[19px] leading-snug">{c.title}</p>
                  <span className="shrink-0 text-[13px] text-label2">{c.items.length}</span>
                </div>
              </Row>
            ))}
          </Group>
        ) : (
          <Group><p className="p-5 text-center text-label2">Ничего не найдено</p></Group>
        )}
      </div>
    </Screen>
  );
}

export function HisnSectionScreen({ i }: { i: number }) {
  const { settings } = useApp();
  const back = useBack();
  const [data, setData] = useState<AzkarCategory[] | null>(null);
  useEffect(() => void azkar().then(setData), []);
  const c = data?.[i];
  return (
    <Screen title={`Раздел ${i + 1}`} subtitle={c?.title} back={back}>
      {!c ? (
        <Group><div className="m-4 h-24 animate-pulse rounded-xl bg-fill" /></Group>
      ) : (
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
                  <Actions markId={id} mark={{ id, kind: 'dua', title: `Азкары · ${c.title}`, sub: d.q ? d.q.map((x) => x[2]).join(' ') : d.ar, route: [{ k: 'hisn' }, { k: 'hisnsec', i }] }} text={`${d.ar}${d.q ? `\n\nПеревод смысла (Э. Кулиев): ${d.q.map((x) => x[2]).join(' ')}` : ''}${d.n > 1 ? `\n\nПовторить: ${d.n}` : ''}\n\n— Хисн аль-Муслим`} />
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
      )}
    </Screen>
  );
}
