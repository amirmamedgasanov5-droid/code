'use client';

import { useEffect, useState } from 'react';
import { names, quranIndex, type NameOfAllah, type QuranIndex } from '@/lib/client-data';
import { norm } from '@/lib/library-meta';
import { useApp } from '../AppProvider';
import { Screen } from '../Screen';
import { Group, Row, fmt, plural } from '../ui';
import { Actions, SearchField } from './Cards';
import { useBack } from './nav';

const CAVEAT =
  'Хадис «Поистине, у Аллаха девяносто девять имён…» передан аль-Бухари и Муслимом. Перечень имён в риваяте ат-Тирмизи, по которому составлен этот список, ряд учёных, включая Ибн Теймию и Ибн Усеймина, не считает словами Пророка ﷺ; они же отмечали, что имён Аллаха больше девяноста девяти. Перевод имён приблизителен — смысл каждого раскрывают книги учёных.';

export function NamesScreen() {
  const { push } = useApp();
  const back = useBack();
  const [list, setList] = useState<NameOfAllah[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => void names().then(setList), []);
  const s = norm(q.trim());
  const shown = list?.filter((n) => !s || norm(`${n.tr} ${n.ru}`).includes(s) || n.ar.includes(q.trim())) ?? [];
  return (
    <Screen title="99 имён Аллаха" subtitle="Арабское написание, смысл и места упоминания в Коране." back={back}>
      <div className="space-y-4">
        <SearchField id="names-search" value={q} onChange={setQ} placeholder="Имя или смысл" />
        {!list ? (
          <Group>{Array.from({ length: 6 }, (_, i) => <div key={i} className="m-4 h-12 animate-pulse rounded-xl bg-fill" />)}</Group>
        ) : shown.length ? (
          <Group footer={CAVEAT}>
            {shown.map((n, i) => (
              <Row key={n.i} onClick={() => push({ k: 'name', i: n.i })} last={i === shown.length - 1}>
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tint-soft text-[13px] font-bold tabular-nums text-tint">{n.i}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[17px] font-medium leading-tight">{n.tr}</p>
                    <p className="truncate text-[13px] text-label2">{n.ru}</p>
                  </div>
                  <span lang="ar" dir="rtl" className="quran text-[1.5rem] leading-none">{n.ar}</span>
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

export function NameScreen({ i }: { i: number }) {
  const { push } = useApp();
  const back = useBack();
  const [list, setList] = useState<NameOfAllah[] | null>(null);
  const [idx, setIdx] = useState<QuranIndex | null>(null);
  useEffect(() => {
    names().then(setList);
    quranIndex().then(setIdx);
  }, []);
  const n = list?.[i - 1];
  const id = `n:${i}`;
  return (
    <Screen title={n?.tr ?? `Имя ${i}`} subtitle={n ? n.ru : undefined} back={back}>
      {!n ? (
        <Group><div className="m-4 h-40 animate-pulse rounded-xl bg-fill" /></Group>
      ) : (
        <div className="space-y-5">
          <Group>
            <div className="px-4 pb-3 pt-4">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-tint-soft px-2.5 py-1 text-[12px] font-bold tabular-nums text-tint">Имя № {n.i}</span>
                <Actions markId={id} mark={{ id, kind: 'name', title: `${n.tr} — ${n.ar}`, sub: n.ru, route: [{ k: 'names' }, { k: 'name', i: n.i }] }} text={`${n.ar}\n${n.tr} — ${n.ru}\n\n— 99 имён Аллаха`} />
              </div>
              <p lang="ar" dir="rtl" className="quran py-6 text-center text-[4.4rem] leading-[1.4]">{n.ar}</p>
              <p className="text-center text-[22px] font-bold tracking-[-0.03em]">{n.tr}</p>
              <p className="mt-1 pb-3 text-center text-[17px] text-label2">{n.ru}</p>
            </div>
          </Group>
          <Group header="В Коране">
            <div className="p-4">
              {n.q > 0 ? (
                <>
                  <p className="text-[17px] leading-snug">
                    Это имя встречается в тексте Корана <span className="font-bold">{fmt(n.q)}</span> {plural(n.q, 'раз', 'раза', 'раз')} (подсчёт выполнен по арабскому тексту, с учётом слитных приставок).
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {n.refs.map(([s, a]) => (
                      <button key={`${s}:${a}`} onClick={() => push({ k: 'sura', n: s, a })} className="rounded-full bg-tint-soft px-3 py-1.5 text-[14px] font-semibold tabular-nums text-tint">
                        {s}:{a}
                      </button>
                    ))}
                    {n.more > 0 && <span className="px-2 py-1.5 text-[14px] text-label2">…и ещё {n.more} аятов</span>}
                  </div>
                  {idx && n.refs[0] && <p className="mt-3 text-[13px] text-label2">Первое упоминание: {idx.suras[n.refs[0][0] - 1].tr}, аят {n.refs[0][1]}.</p>}
                </>
              ) : n.qi > 0 ? (
                <>
                  <p className="text-[16px] leading-snug">С артиклем это имя в тексте Корана не встречается, но слово встречается <span className="font-bold">{fmt(n.qi)}</span> {plural(n.qi, 'раз', 'раза', 'раз')} без артикля (как описание Аллаха).</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {n.refsI.map(([s, a]) => (
                      <button key={`${s}:${a}`} onClick={() => push({ k: 'sura', n: s, a })} className="rounded-full bg-tint-soft px-3 py-1.5 text-[14px] font-semibold tabular-nums text-tint">
                        {s}:{a}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-[16px] leading-snug text-label2">В тексте Корана в такой форме это имя не встречается. Основанием служит Сунна, либо имя приводится в паре с другим именем — подробности в книгах учёных.</p>
              )}
            </div>
          </Group>
          <p className="px-4 text-[13px] leading-snug text-label2">{CAVEAT}</p>
        </div>
      )}
    </Screen>
  );
}
