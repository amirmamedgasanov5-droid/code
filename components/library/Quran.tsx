'use client';

import { motion } from 'framer-motion';
import { Type } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { quranIndex, sura as loadSura, type QuranIndex, type Sura } from '@/lib/client-data';
import { BISMILLAH, norm } from '@/lib/library-meta';
import { useApp } from '../AppProvider';
import { Screen } from '../Screen';
import { Sheet } from '../Sheet';
import { Group, Row, Segmented, Switch, fmt } from '../ui';
import { Actions, SearchField } from './Cards';
import { useBack } from './nav';

const place = (t: string) => (t === 'm' ? 'Мекканская' : 'Мединская');

export function QuranScreen({ juz: juzInit }: { juz?: boolean }) {
  const { push } = useApp();
  const back = useBack();
  const [idx, setIdx] = useState<QuranIndex | null>(null);
  const [mode, setMode] = useState<'sura' | 'juz'>(juzInit ? 'juz' : 'sura');
  const [q, setQ] = useState('');
  useEffect(() => void quranIndex().then(setIdx), []);

  const list = useMemo(() => {
    if (!idx) return [];
    const s = norm(q.trim());
    return idx.suras.filter((x) => !s || String(x.n) === s || norm(`${x.tr} ${x.ru}`).includes(s) || x.ar.includes(s));
  }, [idx, q]);
  const total = idx?.suras.reduce((s, x) => s + x.v, 0) ?? 6236;

  return (
    <Screen title="Коран" subtitle={`114 сур · ${fmt(total)} аятов · арабский текст и перевод Э. Кулиева`} back={back}>
      <div className="space-y-4">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'sura', label: 'Суры' }, { value: 'juz', label: 'Джузы' }]} />
        {mode === 'sura' && <SearchField id="sura-filter" value={q} onChange={setQ} placeholder="Название или номер суры" />}
        {!idx ? (
          <Group>{Array.from({ length: 8 }, (_, i) => <div key={i} className="m-4 h-10 animate-pulse rounded-xl bg-fill" />)}</Group>
        ) : mode === 'sura' ? (
          list.length ? (
            <Group>
              {list.map((s, i) => (
                <Row key={s.n} onClick={() => push({ k: 'sura', n: s.n })} last={i === list.length - 1}>
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tint-soft text-[14px] font-bold tabular-nums text-tint">{s.n}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[17px] font-medium leading-tight">{s.tr}</p>
                      <p className="truncate text-[13px] text-label2">
                        {s.ru} · {place(s.t)} · {s.v} ая.
                      </p>
                    </div>
                    <span lang="ar" dir="rtl" className="text-[22px] leading-none">{s.ar}</span>
                  </div>
                </Row>
              ))}
            </Group>
          ) : (
            <Group><p className="p-5 text-center text-label2">Ничего не найдено</p></Group>
          )
        ) : (
          <Group>
            {idx.juz.map(([n, a], i) => (
              <Row key={i} onClick={() => push({ k: 'sura', n, a })} last={i === 29}>
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tint-soft text-[14px] font-bold tabular-nums text-tint">{i + 1}</span>
                  <div>
                    <p className="text-[17px] font-medium leading-tight">Джуз {i + 1}</p>
                    <p className="text-[13px] text-label2">
                      Начало: {idx.suras[n - 1].tr}, аят {a}
                    </p>
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

function TextSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, setSettings } = useApp();
  return (
    <Sheet open={open} onClose={onClose} size="medium" labelledBy="ts-title" header={<h2 id="ts-title" className="text-[17px] font-semibold">Вид текста</h2>}>
      <div className="space-y-3 pt-2">
        <Group>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[15px]">Размер арабского</span>
              <span lang="ar" className="quran text-label2" style={{ fontSize: `${settings.arSize}rem`, lineHeight: 1.3 }}>بِسْمِ</span>
            </div>
            <input type="range" min={1.4} max={3.2} step={0.1} value={settings.arSize} onChange={(e) => setSettings({ arSize: Number(e.target.value) })} aria-label="Размер арабского текста" className="mt-2 w-full accent-[var(--tint)]" />
          </div>
          <Row chevron={false}>
            <div className="flex items-center justify-between">
              <span className="text-[17px]">Перевод</span>
              <Switch checked={settings.translation} onChange={(v) => setSettings({ translation: v })} label="Показывать перевод" />
            </div>
          </Row>
          <Row chevron={false} last>
            <div className="flex items-center justify-between">
              <span className="text-[17px]">Транслитерация</span>
              <Switch checked={settings.translit} onChange={(v) => setSettings({ translit: v })} label="Показывать транслитерацию" />
            </div>
          </Row>
        </Group>
      </div>
    </Sheet>
  );
}

export function SuraScreen({ n, a }: { n: number; a?: number }) {
  const { settings, posts, loadPosts, open, push, setLastRead, stack, pop } = useApp();
  const back = useBack();
  const [idx, setIdx] = useState<QuranIndex | null>(null);
  const [data, setData] = useState<Sura | null>(null);
  const [err, setErr] = useState(false);
  const [aa, setAa] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const cur = useRef(0);
  const saved = useRef(0);

  useEffect(() => {
    setData(null);
    setErr(false);
    quranIndex().then(setIdx);
    loadSura(n).then(setData).catch(() => setErr(true));
    loadPosts();
  }, [n, loadPosts]);

  // переход к нужному аяту
  useEffect(() => {
    if (!data || !a) return;
    const t = setTimeout(() => {
      document.getElementById(`ay-${a}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setFlash(a);
      setTimeout(() => setFlash(null), 2200);
    }, 420);
    return () => clearTimeout(t);
  }, [data, a]);

  // «Продолжить чтение»
  useEffect(() => {
    if (!data) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && (cur.current = Number((e.target as HTMLElement).dataset.ayah))),
      { rootMargin: '-18% 0px -72% 0px' },
    );
    document.querySelectorAll('[data-ayah]').forEach((el) => io.observe(el));
    const t = setInterval(() => {
      if (cur.current && cur.current !== saved.current) {
        saved.current = cur.current;
        setLastRead(n, cur.current);
      }
    }, 2500);
    return () => {
      io.disconnect();
      clearInterval(t);
    };
  }, [data, n, setLastRead]);

  const info = idx?.suras[n - 1];
  const tafsir = useMemo(() => posts.filter((p) => p.refs && p.refs[0] === n), [posts, n]);

  return (
    <Screen
      title={info ? info.tr : `Сура ${n}`}
      subtitle={info ? `${n}. ${info.ru} · ${place(info.t)} · ${info.v} аятов` : undefined}
      back={back}
      trailing={
        <button onClick={() => setAa(true)} aria-label="Вид текста" className="glass grid size-10 place-items-center rounded-full text-tint">
          <Type size={19} strokeWidth={2.2} />
        </button>
      }
    >
      {info && (
        <p lang="ar" dir="rtl" className="quran -mt-1 mb-4 px-1 text-center text-[2.6rem] leading-[1.5]">
          سورة {info.ar}
        </p>
      )}
      {n !== 1 && n !== 9 && (
        <p lang="ar" dir="rtl" className="quran mb-4 text-center text-[1.9rem] leading-[1.9] text-label2">
          {BISMILLAH}
        </p>
      )}
      {err && <Group><p className="p-5 text-center text-label2">Не удалось загрузить суру. Проверьте соединение.</p></Group>}
      {!data && !err && (
        <Group>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-3 p-5">
              <div className="ml-auto h-7 w-3/4 animate-pulse rounded-full bg-fill" />
              <div className="h-4 w-full animate-pulse rounded-full bg-fill" />
            </div>
          ))}
        </Group>
      )}
      {data && (
        <Group>
          {data.a.map((ar, i) => {
            const ay = i + 1;
            const link = tafsir.find((p) => p.refs && ay >= p.refs[1] && ay <= p.refs[2]);
            const text = `${ar}\n\n${data.r[i]}\n\n— Коран ${n}:${ay} (перевод Э. Кулиева)`;
            return (
              <motion.article
                key={ay}
                id={`ay-${ay}`}
                data-ayah={ay}
                animate={{ backgroundColor: flash === ay ? 'var(--tint-soft)' : 'rgba(0,0,0,0)' }}
                transition={{ duration: 0.6 }}
                className="relative scroll-mt-28 px-4 pb-3 pt-3"
              >
                <div className="flex items-center justify-between">
                  <span className="grid h-7 min-w-7 place-items-center rounded-full bg-tint-soft px-2 text-[13px] font-bold tabular-nums text-tint">{n}:{ay}</span>
                  <Actions markId={`q:${n}:${ay}`} mark={{ id: `q:${n}:${ay}`, kind: 'quran', title: `Сура ${info?.tr ?? n}, аят ${ay}`, sub: data.r[i], route: [{ k: 'quran' }, { k: 'sura', n, a: ay }] }} text={text} />
                </div>
                <p lang="ar" dir="rtl" className="quran mt-1 text-right" style={{ fontSize: `${settings.arSize}rem` }}>{ar}</p>
                {settings.translit && <p className="mt-2 text-[15px] italic leading-snug text-label2">{data.t[i]}</p>}
                {settings.translation && <p className="mt-2 text-[17px] leading-[1.45]">{data.r[i]}</p>}
                {link && (
                  <button onClick={() => open(link.id)} className="mt-2 inline-flex items-center gap-1 rounded-full bg-tint-soft px-3 py-1.5 text-[13px] font-semibold text-tint">
                    Тафсир ас-Саади из канала
                  </button>
                )}
                {ay < data.a.length && <span aria-hidden className="absolute bottom-0 left-4 right-0 h-px bg-sep" />}
              </motion.article>
            );
          })}
        </Group>
      )}
      {data && idx && (
        <div className="mt-6 flex justify-between gap-3">
          {n > 1 ? (
            <button onClick={() => (stack.length > 1 && stack[stack.length - 2]?.k === 'sura' ? pop() : push({ k: 'sura', n: n - 1 }))} className="glass rounded-full px-5 py-3 text-[15px] font-semibold text-tint">
              ‹ {idx.suras[n - 2].tr}
            </button>
          ) : <span />}
          {n < 114 && (
            <button onClick={() => push({ k: 'sura', n: n + 1 })} className="glass rounded-full px-5 py-3 text-[15px] font-semibold text-tint">
              {idx.suras[n].tr} ›
            </button>
          )}
        </div>
      )}
      <TextSettings open={aa} onClose={() => setAa(false)} />
    </Screen>
  );
}
