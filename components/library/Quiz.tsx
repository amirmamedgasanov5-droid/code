'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { names, quranIndex, sura as loadSura, type NameOfAllah, type QuranIndex } from '@/lib/client-data';
import { useStored } from '@/lib/hooks';
import { useApp } from '../AppProvider';
import { Screen } from '../Screen';
import { Group, Row, SPRING } from '../ui';
import { useBack } from './nav';

type Q = { prompt: string; ar?: string; options: string[]; answer: number; note?: string };
type Mode = { id: string; title: string; desc: string };

export const MODES: Mode[] = [
  { id: 'ayah', title: 'Из какой суры аят?', desc: 'Арабский аят — выберите суру' },
  { id: 'count', title: 'Сколько аятов?', desc: 'Число аятов в суре' },
  { id: 'place', title: 'Мекка или Медина?', desc: 'Где ниспослана сура' },
  { id: 'number', title: 'Номер суры', desc: 'Какой по счёту является сура' },
  { id: 'juz', title: 'Начало джуза', desc: 'С какой суры начинается джуз' },
  { id: 'meaning', title: 'Смысл имени Аллаха', desc: 'Что означает имя' },
  { id: 'name', title: 'Имя по смыслу', desc: 'Какое имя соответствует смыслу' },
];

const rnd = (n: number) => Math.floor(Math.random() * n);
const shuffle = <T,>(a: T[]) => a.map((x) => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
const pick = <T,>(a: T[], k: number, not: (x: T) => boolean = () => false) => shuffle(a.filter((x) => !not(x))).slice(0, k);

async function make(mode: string, idx: QuranIndex, nm: NameOfAllah[]): Promise<Q> {
  const S = idx.suras;
  const place = (t: string) => (t === 'm' ? 'Мекканская' : 'Мединская');
  switch (mode) {
    case 'ayah': {
      for (let t = 0; t < 10; t++) {
        const s = S[rnd(114)];
        const d = await loadSura(s.n);
        const ok = d.a.map((x, i) => [x, i] as const).filter(([x]) => x.length >= 24 && x.length <= 120);
        if (!ok.length) continue;
        const [ar, i] = ok[rnd(ok.length)];
        const wrong = pick(S, 3, (x) => x.n === s.n);
        const opts = shuffle([s, ...wrong]);
        return { prompt: 'Из какой суры этот аят?', ar, options: opts.map((x) => `${x.n}. ${x.tr}`), answer: opts.indexOf(s), note: `${s.tr} ${s.n}:${i + 1}` };
      }
      throw new Error('no ayah');
    }
    case 'count': {
      const s = S[rnd(114)];
      const set = new Set<number>([s.v]);
      while (set.size < 4) set.add(Math.max(3, s.v + (rnd(2) ? 1 : -1) * (1 + rnd(Math.max(4, Math.round(s.v / 3))))));
      const opts = shuffle([...set]);
      return { prompt: `Сколько аятов в суре «${s.tr}»?`, options: opts.map(String), answer: opts.indexOf(s.v), note: `В суре ${s.n}. ${s.tr} — ${s.v} аятов` };
    }
    case 'place': {
      const s = S[rnd(114)];
      return { prompt: `Сура «${s.tr}» — мекканская или мединская?`, options: ['Мекканская', 'Мединская'], answer: s.t === 'm' ? 0 : 1, note: `${s.tr}: ${place(s.t)}, ${s.v} аятов` };
    }
    case 'number': {
      const s = S[rnd(114)];
      const set = new Set<number>([s.n]);
      while (set.size < 4) set.add(Math.min(114, Math.max(1, s.n + (rnd(2) ? 1 : -1) * (1 + rnd(12)))));
      const opts = shuffle([...set]);
      return { prompt: `Какой по счёту является сура «${s.tr}»?`, options: opts.map(String), answer: opts.indexOf(s.n), note: `${s.tr} — сура № ${s.n}` };
    }
    case 'juz': {
      const j = rnd(30);
      const s = S[idx.juz[j][0] - 1];
      const wrong = pick(S, 3, (x) => x.n === s.n);
      const opts = shuffle([s, ...wrong]);
      return { prompt: `С какой суры начинается ${j + 1}-й джуз?`, options: opts.map((x) => x.tr), answer: opts.indexOf(s), note: `Джуз ${j + 1} начинается с ${s.tr}, аят ${idx.juz[j][1]}` };
    }
    case 'meaning': {
      const n = nm[rnd(nm.length)];
      const wrong = pick(nm, 3, (x) => x.i === n.i || x.ru === n.ru);
      const opts = shuffle([n, ...wrong]);
      return { prompt: `Что означает имя Аллаха «${n.tr}»?`, ar: n.ar, options: opts.map((x) => x.ru), answer: opts.indexOf(n), note: `${n.tr} (${n.ar}) — ${n.ru}` };
    }
    default: {
      const n = nm[rnd(nm.length)];
      const wrong = pick(nm, 3, (x) => x.i === n.i || x.tr === n.tr);
      const opts = shuffle([n, ...wrong]);
      return { prompt: `Какое имя Аллаха означает «${n.ru}»?`, options: opts.map((x) => x.tr), answer: opts.indexOf(n), note: `${n.tr} (${n.ar}) — ${n.ru}` };
    }
  }
}

type Best = Record<string, number>;
const ROUND = 10;

export function QuizzesScreen() {
  const { push } = useApp();
  const back = useBack();
  const [best] = useStored<Best>('hidaya-quiz', {});
  return (
    <Screen title="Викторины" subtitle="Вопросы составляются из текстов библиотеки — ответы всегда сверены с источником." back={back}>
      <Group footer="Раунд — 10 вопросов. Лучший результат хранится только на этом устройстве.">
        {MODES.map((m, i) => (
          <Row key={m.id} onClick={() => push({ k: 'quiz', mode: m.id })} last={i === MODES.length - 1}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[17px] font-medium leading-tight">{m.title}</p>
                <p className="text-[13px] text-label2">{m.desc}</p>
              </div>
              {best[m.id] !== undefined && <span className="shrink-0 rounded-full bg-tint-soft px-2.5 py-1 text-[12px] font-bold tabular-nums text-tint">{best[m.id]}/{ROUND}</span>}
            </div>
          </Row>
        ))}
      </Group>
    </Screen>
  );
}

export function QuizScreen({ mode }: { mode: string }) {
  const back = useBack();
  const { toast } = useApp();
  const m = MODES.find((x) => x.id === mode) ?? MODES[0];
  const [best, setBest] = useStored<Best>('hidaya-quiz', {});
  const [data, setData] = useState<{ idx: QuranIndex; nm: NameOfAllah[] } | null>(null);
  const [q, setQ] = useState<Q | null>(null);
  const [n, setN] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(false);

  const next = useCallback(async (d: { idx: QuranIndex; nm: NameOfAllah[] }) => {
    setChosen(null);
    try {
      setQ(await make(mode, d.idx, d.nm));
    } catch {
      setErr(true);
    }
  }, [mode]);

  const start = useCallback(
    (d: { idx: QuranIndex; nm: NameOfAllah[] }) => {
      setN(0);
      setScore(0);
      setStreak(0);
      setDone(false);
      setQ(null);
      next(d);
    },
    [next],
  );

  useEffect(() => {
    Promise.all([quranIndex(), names()]).then(([idx, nm]) => {
      const d = { idx, nm };
      setData(d);
      start(d);
    }).catch(() => setErr(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const answer = (i: number) => {
    if (chosen !== null || !q) return;
    setChosen(i);
    const ok = i === q.answer;
    setScore((s) => s + (ok ? 1 : 0));
    setStreak((s) => (ok ? s + 1 : 0));
    try {
      navigator.vibrate?.(ok ? 10 : [25, 40, 25]);
    } catch {}
  };

  const advance = () => {
    if (!data) return;
    if (n + 1 >= ROUND) {
      setDone(true);
      if ((best[m.id] ?? -1) < score) {
        setBest({ ...best, [m.id]: score });
        toast('Новый рекорд!');
      }
      return;
    }
    setN(n + 1);
    setQ(null);
    next(data);
  };

  return (
    <Screen title={m.title} subtitle={done ? 'Раунд завершён' : `Вопрос ${Math.min(n + 1, ROUND)} из ${ROUND} · верных ответов: ${score}`} back={back}>
      <div className="mx-auto max-w-xl">
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-fill">
          <motion.div className="h-full rounded-full bg-tint" animate={{ width: `${((done ? ROUND : n + (chosen !== null ? 1 : 0)) / ROUND) * 100}%` }} transition={SPRING} />
        </div>
        {err && <Group><p className="p-5 text-center text-label2">Не удалось подготовить вопрос. Проверьте соединение.</p></Group>}
        {done ? (
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING} className="rounded-[18px] bg-surface p-8 text-center">
            <p className="text-[13px] font-semibold uppercase tracking-[0.05em] text-label2">Результат</p>
            <p className="mt-2 text-[4.5rem] font-bold leading-none tracking-[-0.05em] tabular-nums text-tint">{score}<span className="text-label3">/{ROUND}</span></p>
            <p className="mt-3 text-[17px] text-label2">{score >= 9 ? 'Отличный результат.' : score >= 6 ? 'Хороший результат, можно лучше.' : 'Повторите материал и попробуйте снова.'}</p>
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={() => data && start(data)} className="rounded-full bg-tint px-7 py-3 text-[16px] font-semibold text-tint-ink">Ещё раз</button>
              <button onClick={back.onClick} className="rounded-full bg-surface px-7 py-3 text-[16px] font-semibold text-tint">К списку</button>
            </div>
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            {q ? (
              <motion.div key={n} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="space-y-3">
                <div className="rounded-[18px] bg-surface p-5">
                  <p className="text-[20px] font-bold leading-snug tracking-[-0.03em]">{q.prompt}</p>
                  {q.ar && <p lang="ar" dir="rtl" className="quran mt-3 text-center text-[1.7rem] leading-[2.1]">{q.ar}</p>}
                </div>
                <div className="space-y-2">
                  {q.options.map((o, i) => {
                    const state = chosen === null ? 'idle' : i === q.answer ? 'right' : i === chosen ? 'wrong' : 'dim';
                    return (
                      <motion.button
                        key={i}
                        onClick={() => answer(i)}
                        whileTap={{ scale: chosen === null ? 0.97 : 1 }}
                        animate={state === 'wrong' ? { x: [0, -8, 8, -5, 5, 0] } : {}}
                        transition={{ duration: 0.4 }}
                        className={`flex w-full items-center justify-between gap-3 rounded-[16px] px-5 py-4 text-left text-[17px] font-medium transition-colors ${
                          state === 'right' ? 'bg-tint text-tint-ink' : state === 'wrong' ? 'bg-red text-white' : state === 'dim' ? 'bg-surface opacity-50' : 'bg-surface'
                        }`}
                      >
                        <span>{o}</span>
                        {state === 'right' && <Check size={20} strokeWidth={3} />}
                        {state === 'wrong' && <X size={20} strokeWidth={3} />}
                      </motion.button>
                    );
                  })}
                </div>
                {chosen !== null && (
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-[16px] bg-tint-soft p-4 text-[15px] leading-snug">
                    <p className="font-semibold text-tint">{chosen === q.answer ? 'Верно!' : 'Неверно.'}{streak > 1 && chosen === q.answer ? ` Серия: ${streak}` : ''}</p>
                    {q.note && <p className="mt-0.5 text-label2">{q.note}</p>}
                    <button onClick={advance} className="mt-3 rounded-full bg-tint px-6 py-2.5 text-[15px] font-semibold text-tint-ink">{n + 1 >= ROUND ? 'Завершить' : 'Дальше'}</button>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              !err && <div key="load" className="space-y-3"><div className="h-28 animate-pulse rounded-[18px] bg-fill" /><div className="h-14 animate-pulse rounded-[16px] bg-fill" /><div className="h-14 animate-pulse rounded-[16px] bg-fill" /></div>
            )}
          </AnimatePresence>
        )}
      </div>
    </Screen>
  );
}
