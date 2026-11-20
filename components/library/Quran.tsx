'use client';

import { motion } from 'framer-motion';
import { BookText, Check, Type } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { quranIndex, sura as loadSura, tafsirIndex, tafsirSura, translation, type QuranIndex, type Sura, type TafsirInfo, type TafsirSura } from '@/lib/client-data';
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

function TextSettings({ open, onClose, translations }: { open: boolean; onClose: () => void; translations: { id: string; name: string }[] }) {
  const { settings, setSettings } = useApp();
  return (
    <Sheet open={open} onClose={onClose} size="medium" labelledBy="ts-title" header={<h2 id="ts-title" className="text-[17px] font-semibold">Вид текста</h2>}>
      <div className="space-y-5 pt-2">
        <Group>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[15px]">Размер арабского</span>
              <span lang="ar" className="quran text-label2" style={{ fontSize: `${settings.arSize}rem`, lineHeight: 1.3 }}>بِسْمِ</span>
            </div>
            <input type="range" min={1.4} max={3.2} step={0.1} value={settings.arSize} onChange={(e) => setSettings({ arSize: Number(e.target.value) })} aria-label="Размер арабского текста" className="mt-2 w-full accent-[var(--tint)]" />
          </div>
          <Row chevron={false} last>
            <div className="flex items-center justify-between">
              <span className="text-[17px]">Перевод</span>
              <Switch checked={settings.translation} onChange={(v) => setSettings({ translation: v })} label="Показывать перевод" />
            </div>
          </Row>
        </Group>
        <Group header="Перевод смыслов">
          {translations.map((t, i) => (
            <Row key={t.id} chevron={false} onClick={() => setSettings({ translationId: t.id })} last={i === translations.length - 1}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[17px]">{t.name}</span>
                {settings.translationId === t.id && <Check size={20} strokeWidth={2.6} className="text-tint" />}
              </div>
            </Row>
          ))}
        </Group>
      </div>
    </Sheet>
  );
}

/** Тафсир к одному аяту: переключатель книг, комментарий, листание по аятам */
function TafsirSheet({ n, ayah, onChange, onClose, data, tr }: { n: number; ayah: number | null; onChange: (a: number) => void; onClose: () => void; data: Sura; tr: string[] }) {
  const { settings, setSettings } = useApp();
  const [infos, setInfos] = useState<TafsirInfo[]>([]);
  const [cache, setCache] = useState<Record<string, TafsirSura>>({});
  const [err, setErr] = useState(false);
  useEffect(() => void tafsirIndex().then(setInfos).catch(() => setErr(true)), []);
  const info = infos.find((i) => i.id === settings.tafsirId) ?? infos[0];
  useEffect(() => {
    if (!info || ayah === null || cache[`${info.id}:${n}`]) return;
    let alive = true;
    tafsirSura(info, n).then((t) => alive && setCache((c) => ({ ...c, [`${info.id}:${n}`]: t }))).catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [info, n, ayah, cache]);

  const entries = info ? cache[`${info.id}:${n}`] : undefined;
  let text = '';
  let range = '';
  if (entries && ayah !== null) {
    let k = -1;
    entries.forEach((e, i) => e[0] <= ayah && (k = i));
    if (k >= 0) {
      text = entries[k][1];
      const from = entries[k][0];
      const to = (entries[k + 1]?.[0] ?? data.a.length + 1) - 1;
      if (to > from) range = `Комментарий к аятам ${from}–${to}`;
    }
  }
  return (
    <Sheet open={ayah !== null} onClose={onClose} labelledBy="taf-title" header={<h2 id="taf-title" className="truncate text-[17px] font-semibold">Тафсир · {n}:{ayah}</h2>}>
      {ayah !== null && (
        <div className="space-y-4 pt-1">
          <Segmented value={info?.id ?? settings.tafsirId} onChange={(id) => setSettings({ tafsirId: id })} options={(infos.length ? infos : [{ id: 'saadi', name: 'Ас-Саади' }]).map((i) => ({ value: i.id, label: i.name.replace('Тафсир ', '') }))} />
          <div className="rounded-[20px] bg-surface p-4">
            <p lang="ar" dir="rtl" className="quran text-right text-[1.5rem] leading-[2.1]">{data.a[ayah - 1]}</p>
            <p className="mt-2 text-[16px] leading-snug text-label2">{tr[ayah - 1]}</p>
          </div>
          {info && <p className="px-1 text-[13px] text-label2">{info.name} · {info.author}</p>}
          {range && <p className="px-1 text-[13px] font-semibold text-tint">{range}</p>}
          {err && <p className="text-label2">Не удалось загрузить тафсир. Проверьте соединение.</p>}
          {!entries && !err && <div className="space-y-3">{[95, 100, 88, 70].map((w, i) => <div key={i} className="h-4 animate-pulse rounded-full bg-fill" style={{ width: `${w}%` }} />)}</div>}
          {entries && <div className="whitespace-pre-line text-[17px] leading-[1.6]">{text || 'К этому аяту в данном тафсире нет отдельного комментария.'}</div>}
          <div className="flex justify-between gap-3 pt-2">
            <button disabled={ayah <= 1} onClick={() => onChange(ayah - 1)} className="rounded-full bg-surface px-5 py-3 text-[15px] font-semibold text-tint disabled:opacity-35">‹ Аят {ayah - 1}</button>
            <button disabled={ayah >= data.a.length} onClick={() => onChange(ayah + 1)} className="rounded-full bg-surface px-5 py-3 text-[15px] font-semibold text-tint disabled:opacity-35">Аят {ayah + 1} ›</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export function SuraScreen({ n, a }: { n: number; a?: number }) {
  const { settings, posts, loadPosts, open, push, setLastRead, stack, pop } = useApp();
  const back = useBack();
  const [idx, setIdx] = useState<QuranIndex | null>(null);
  const [data, setData] = useState<Sura | null>(null);
  const [alt, setAlt] = useState<string[][] | null>(null);
  const [err, setErr] = useState(false);
  const [aa, setAa] = useState(false);
  const [taf, setTaf] = useState<number | null>(null);
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

  // выбранный перевод (Кулиев лежит в файле суры, остальные — отдельными файлами)
  useEffect(() => {
    if (settings.translationId === 'kuliev') return void setAlt(null);
    let alive = true;
    translation(settings.translationId).then((t) => alive && setAlt(t)).catch(() => alive && setAlt(null));
    return () => {
      alive = false;
    };
  }, [settings.translationId]);

  useEffect(() => {
    if (!data || !a) return;
    const t = setTimeout(() => {
      document.getElementById(`ay-${a}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setFlash(a);
      setTimeout(() => setFlash(null), 2200);
    }, 420);
    return () => clearTimeout(t);
  }, [data, a]);

  useEffect(() => {
    if (!data) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (cur.current = Number((e.target as HTMLElement).dataset.ayah))), { rootMargin: '-18% 0px -72% 0px' });
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
  const tr = alt?.[n - 1] ?? data?.r ?? [];
  const trName = idx?.translations.find((t) => t.id === settings.translationId)?.name ?? 'Э. Кулиев';
  const channelTafsir = useMemo(() => posts.filter((p) => p.refs && p.refs[0] === n), [posts, n]);

  return (
    <Screen
      title={info ? info.tr : `Сура ${n}`}
      subtitle={info ? `${n}. ${info.ru} · ${place(info.t)} · ${info.v} аятов` : undefined}
      back={back}
      trailing={
        <button onClick={() => setAa(true)} aria-label="Вид текста и перевод" className="glass grid size-10 place-items-center rounded-full text-tint">
          <Type size={19} strokeWidth={2.2} />
        </button>
      }
    >
      {info && <p lang="ar" dir="rtl" className="quran -mt-1 mb-4 px-1 text-center text-[2.6rem] leading-[1.5]">سورة {info.ar}</p>}
      {n !== 1 && n !== 9 && <p lang="ar" dir="rtl" className="quran mb-4 text-center text-[1.9rem] leading-[1.9] text-label2">{BISMILLAH}</p>}
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
        <Group footer={settings.translation ? `Перевод смыслов: ${trName}` : undefined}>
          {data.a.map((ar, i) => {
            const ay = i + 1;
            const link = channelTafsir.find((p) => p.refs && ay >= p.refs[1] && ay <= p.refs[2]);
            const text = `${ar}\n\n${tr[i]}\n\n— Коран ${n}:${ay} (${trName})`;
            return (
              <motion.article key={ay} id={`ay-${ay}`} data-ayah={ay} animate={{ backgroundColor: flash === ay ? 'var(--tint-soft)' : 'rgba(0,0,0,0)' }} transition={{ duration: 0.6 }} className="relative scroll-mt-28 px-4 pb-3 pt-3">
                <div className="flex items-center justify-between">
                  <span className="grid h-7 min-w-7 place-items-center rounded-full bg-tint-soft px-2 text-[13px] font-bold tabular-nums text-tint">{n}:{ay}</span>
                  <div className="flex items-center">
                    <button onClick={() => setTaf(ay)} aria-label="Тафсир" className="grid size-9 place-items-center rounded-full text-label2 transition-colors active:bg-fill">
                      <BookText size={19} strokeWidth={2} />
                    </button>
                    <Actions markId={`q:${n}:${ay}`} mark={{ id: `q:${n}:${ay}`, kind: 'quran', title: `Сура ${info?.tr ?? n}, аят ${ay}`, sub: tr[i], route: [{ k: 'quran' }, { k: 'sura', n, a: ay }] }} text={text} />
                  </div>
                </div>
                <p lang="ar" dir="rtl" className="quran mt-1 text-right" style={{ fontSize: `${settings.arSize}rem` }}>{ar}</p>
                {settings.translation && <p className="mt-2 text-[17px] leading-[1.45]">{tr[i]}</p>}
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
            <button onClick={() => (stack.length > 1 && stack[stack.length - 2]?.k === 'sura' ? pop() : push({ k: 'sura', n: n - 1 }))} className="rounded-full bg-surface px-5 py-3 text-[15px] font-semibold text-tint">
              ‹ {idx.suras[n - 2].tr}
            </button>
          ) : <span />}
          {n < 114 && (
            <button onClick={() => push({ k: 'sura', n: n + 1 })} className="rounded-full bg-surface px-5 py-3 text-[15px] font-semibold text-tint">
              {idx.suras[n].tr} ›
            </button>
          )}
        </div>
      )}
      <TextSettings open={aa} onClose={() => setAa(false)} translations={idx?.translations ?? []} />
      {data && <TafsirSheet n={n} ayah={taf} onChange={setTaf} onClose={() => setTaf(null)} data={data} tr={tr} />}
    </Screen>
  );
}
