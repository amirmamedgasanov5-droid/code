'use client';

import { useEffect, useMemo, useState } from 'react';
import { quranIndex, type QuranIndex } from '@/lib/client-data';
import { useApp, type IndexKind } from '../AppProvider';
import { Screen } from '../Screen';
import { Group, Row, fmt } from '../ui';
import { useBack } from './nav';

const KINDS: { kind: IndexKind; title: string; desc: string }[] = [
  { kind: 'alpha', title: 'Суры по алфавиту', desc: 'Названия в латинской транскрипции' },
  { kind: 'place', title: 'Мекканские и мединские', desc: 'Где ниспослана сура' },
  { kind: 'length', title: 'Суры по длине', desc: 'От самой длинной к самой короткой' },
  { kind: 'page', title: 'Страницы мусхафа', desc: '604 страницы Мединского мусхафа' },
  { kind: 'hizb', title: 'Хизбы и их четверти', desc: '60 хизбов, 240 четвертей' },
  { kind: 'manzil', title: 'Манзили', desc: '7 частей для чтения за неделю' },
  { kind: 'sajda', title: 'Аяты саджды', desc: '15 мест земного поклона при чтении' },
];

export function IndexesScreen() {
  const { push, openRoute } = useApp();
  const back = useBack();
  return (
    <Screen title="Указатели" subtitle="Быстрый поиск места в Коране: по названию, странице, части." back={back}>
      <div className="space-y-6">
        <Group footer="Деление на страницы, хизбы, манзили и места саджды — по Мединскому мусхафу (рива́я Хафса ‘ан ‘Асима); данные — пакет quran-meta.">
          {KINDS.map((k, i) => (
            <Row key={k.kind} onClick={() => push({ k: 'index', kind: k.kind })} last={i === KINDS.length - 1}>
              <p className="text-[17px] font-medium leading-tight">{k.title}</p>
              <p className="text-[13px] text-label2">{k.desc}</p>
            </Row>
          ))}
        </Group>
        <Group>
          <Row onClick={() => openRoute([{ k: 'quran', juz: true }])} last>
            <p className="text-[17px] font-medium leading-tight">Джузы</p>
            <p className="text-[13px] text-label2">30 частей</p>
          </Row>
        </Group>
      </div>
    </Screen>
  );
}

export function IndexScreen({ kind }: { kind: IndexKind }) {
  const { push } = useApp();
  const back = useBack();
  const [idx, setIdx] = useState<QuranIndex | null>(null);
  useEffect(() => void quranIndex().then(setIdx), []);
  const meta = KINDS.find((k) => k.kind === kind)!;
  const open = (n: number, a?: number) => push({ k: 'sura', n, a });

  const body = useMemo(() => {
    if (!idx) return null;
    const sura = (n: number) => idx.suras[n - 1];
    const suraRow = (s: (typeof idx.suras)[number], last: boolean, note?: string) => (
      <Row key={s.n} onClick={() => open(s.n)} last={last}>
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tint-soft text-[13px] font-bold tabular-nums text-tint">{s.n}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-medium leading-tight">{s.tr}</p>
            <p className="truncate text-[13px] text-label2">{note ?? `${s.ru} · ${s.v} ая.`}</p>
          </div>
          <span lang="ar" dir="rtl" className="text-[20px] leading-none">{s.ar}</span>
        </div>
      </Row>
    );
    const posRow = (key: string, title: string, [n, a]: [number, number], last: boolean, extra?: string) => (
      <Row key={key} onClick={() => open(n, a)} last={last}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[17px] font-medium">{title}</p>
          <p className="shrink-0 text-[14px] tabular-nums text-label2">{sura(n).tr} {n}:{a}</p>
        </div>
        {extra && <p className="text-[13px] text-label2">{extra}</p>}
      </Row>
    );
    switch (kind) {
      case 'alpha': {
        const l = [...idx.suras].sort((a, b) => a.tr.replace(/^(Al|An|Ar|As|Ash|At|Az|Ad|Adh)-/i, '').localeCompare(b.tr.replace(/^(Al|An|Ar|As|Ash|At|Az|Ad|Adh)-/i, '')));
        return <Group>{l.map((s, i) => suraRow(s, i === l.length - 1))}</Group>;
      }
      case 'place': {
        const m = idx.suras.filter((s) => s.t === 'm');
        const d = idx.suras.filter((s) => s.t === 'd');
        return (
          <div className="space-y-6">
            <Group header={`Мекканские · ${m.length}`}>{m.map((s, i) => suraRow(s, i === m.length - 1))}</Group>
            <Group header={`Мединские · ${d.length}`} footer="Деление принято по данным источника; у учёных есть расхождения по отдельным сурам.">{d.map((s, i) => suraRow(s, i === d.length - 1))}</Group>
          </div>
        );
      }
      case 'length': {
        const l = [...idx.suras].sort((a, b) => b.v - a.v || a.n - b.n);
        return <Group>{l.map((s, i) => suraRow(s, i === l.length - 1, `${fmt(s.v)} аятов · ${s.ru}`))}</Group>;
      }
      case 'page':
        return (
          <Group footer="Нажмите на номер страницы, чтобы открыть первый аят на ней.">
            <div className="grid grid-cols-5 gap-px bg-sep sm:grid-cols-8 md:grid-cols-10">
              {idx.pages.map((p, i) => (
                <button key={i} onClick={() => open(p[0], p[1])} className="bg-surface px-1 py-3 text-center transition-colors active:bg-fill">
                  <p className="text-[16px] font-semibold tabular-nums">{i + 1}</p>
                  <p className="text-[10px] tabular-nums text-label2">{p[0]}:{p[1]}</p>
                </button>
              ))}
            </div>
          </Group>
        );
      case 'hizb':
        return <Group>{idx.hizb.map((p, i) => posRow(String(i), `Хизб ${Math.floor(i / 4) + 1}, четверть ${(i % 4) + 1}`, p, i === idx.hizb.length - 1, i % 4 === 0 ? `Джуз ${Math.floor(i / 8) + 1}` : undefined))}</Group>;
      case 'manzil':
        return <Group>{idx.manzil.map((p, i) => posRow(String(i), `Манзиль ${i + 1}`, p, i === idx.manzil.length - 1))}</Group>;
      case 'sajda':
        return <Group footer="Места саджды по Мединскому мусхафу; учёные расходятся во мнениях о том, где она предписана.">{idx.sajda.map((p, i) => posRow(String(i), `Саджда ${i + 1}`, p, i === idx.sajda.length - 1))}</Group>;
    }
  }, [idx, kind]);

  return (
    <Screen title={meta.title} subtitle={meta.desc} back={back}>
      {body ?? <Group>{Array.from({ length: 8 }, (_, i) => <div key={i} className="m-4 h-10 animate-pulse rounded-xl bg-fill" />)}</Group>}
    </Screen>
  );
}
