'use client';

import { useEffect, useState } from 'react';
import { hisn, type HisnSection } from '@/lib/client-data';
import { useApp } from '../AppProvider';
import { Screen } from '../Screen';
import { Group, Row, fmt } from '../ui';
import { Actions } from './Cards';
import { useBack } from './nav';

const NOTE = 'Арабский текст и транслитерация. Русского перевода в этом наборе данных нет — смысл дуа можно найти в хадисах и публикациях канала.';

export function HisnScreen() {
  const { push } = useApp();
  const back = useBack();
  const [data, setData] = useState<HisnSection[] | null>(null);
  useEffect(() => void hisn().then(setData), []);
  const total = data?.reduce((s, x) => s + x.items.length, 0) ?? 0;
  return (
    <Screen title="Хисн аль-Муслим" subtitle={data ? `${fmt(total)} дуа и азкаров · ${data.length} разделов` : 'Крепость мусульманина'} back={back}>
      {!data ? (
        <Group>{Array.from({ length: 6 }, (_, i) => <div key={i} className="m-4 h-10 animate-pulse rounded-xl bg-fill" />)}</Group>
      ) : (
        <Group footer={NOTE}>
          {data.map((s, i) => (
            <Row key={i} onClick={() => push({ k: 'hisnsec', i })} last={i === data.length - 1}>
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tint-soft text-[13px] font-bold tabular-nums text-tint">{i + 1}</span>
                <p lang="ar" dir="rtl" className="min-w-0 flex-1 truncate text-[19px] leading-snug">{s.title}</p>
                <span className="shrink-0 text-[13px] text-label2">{s.items.length}</span>
              </div>
            </Row>
          ))}
        </Group>
      )}
    </Screen>
  );
}

export function HisnSectionScreen({ i }: { i: number }) {
  const { settings } = useApp();
  const back = useBack();
  const [data, setData] = useState<HisnSection[] | null>(null);
  useEffect(() => void hisn().then(setData), []);
  const s = data?.[i];
  return (
    <Screen title={`Раздел ${i + 1}`} subtitle={s?.title} back={back}>
      {!s ? (
        <Group><div className="m-4 h-24 animate-pulse rounded-xl bg-fill" /></Group>
      ) : (
        <Group footer={NOTE}>
          {s.items.map((d, j) => {
            const id = `d:${d.id}`;
            return (
              <article key={d.id} className="relative px-4 pb-4 pt-3">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-tint-soft px-2.5 py-1 text-[12px] font-bold tabular-nums text-tint">{j + 1}</span>
                  <Actions markId={id} mark={{ id, kind: 'dua', title: `Хисн аль-Муслим · раздел ${i + 1}, ${j + 1}`, sub: d.tr, route: [{ k: 'hisn' }, { k: 'hisnsec', i }] }} text={`${d.ar}\n\n${d.tr}\n\n— Хисн аль-Муслим`} />
                </div>
                <p lang="ar" dir="rtl" className="quran mt-1 text-right" style={{ fontSize: `${settings.arSize}rem` }}>{d.ar}</p>
                <p className="mt-2 text-[15px] italic leading-snug text-label2">{d.tr}</p>
                {j < s.items.length - 1 && <span aria-hidden className="absolute bottom-0 left-4 right-0 h-px bg-sep" />}
              </article>
            );
          })}
        </Group>
      )}
    </Screen>
  );
}
