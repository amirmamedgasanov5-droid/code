'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Compass, LocateFixed, MapPin, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { hijriParts } from '@/lib/hijri';
import { useNow, useStored } from '@/lib/hooks';
import { PLACES, countdown, fmtTime, qibla, schedule, type Place } from '@/lib/prayer';
import { useApp } from '../AppProvider';
import { Screen } from '../Screen';
import { Group, Row, SPRING } from '../ui';

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ type: 'spring', stiffness: 160, damping: 22 }}
      className={`rounded-[28px] bg-surface p-5 ${className}`}
    >
      {children}
    </motion.section>
  );
}

function Prayers() {
  const now = useNow(1000);
  const [placeId, setPlaceId] = useStored<string>('hidaya-place', 'moscow');
  const [geo, setGeo] = useState<Place | null>(null);
  const [geoErr, setGeoErr] = useState('');
  const place = geo ?? PLACES.find((p) => p.id === placeId) ?? PLACES[0];

  const data = useMemo(() => (now ? schedule(place, now) : null), [place, now ? Math.floor(now.getTime() / 30000) : 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = useMemo(() => qibla(place), [place]);

  const locate = () => {
    setGeoErr('');
    if (!navigator.geolocation) return setGeoErr('Геолокация недоступна в этом браузере.');
    navigator.geolocation.getCurrentPosition(
      (p) => setGeo({ id: 'geo', name: 'Моё местоположение', lat: p.coords.latitude, lng: p.coords.longitude, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      () => setGeoErr('Не удалось определить место. Выберите город из списка.'),
      { timeout: 8000 },
    );
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-[0.05em] text-label2">Время намаза</p>
        <button onClick={locate} className="flex items-center gap-1.5 rounded-full bg-tint-soft px-3 py-1.5 text-[13px] font-semibold text-tint">
          <LocateFixed size={14} strokeWidth={2.4} /> Где я
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <MapPin size={18} className="text-tint" />
        <label className="relative flex-1">
          <span className="sr-only">Город</span>
          <select
            id="place"
            value={geo ? 'geo' : placeId}
            onChange={(e) => {
              setGeo(null);
              setPlaceId(e.target.value);
            }}
            className="w-full appearance-none bg-transparent pr-6 text-[17px] font-semibold outline-none"
          >
            {geo && <option value="geo">Моё местоположение</option>}
            {PLACES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronRight size={16} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 rotate-90 text-label3" />
        </label>
      </div>
      {geoErr && <p className="mt-2 text-[13px] text-[#c0566b]">{geoErr}</p>}

      <div className="mt-5 rounded-[22px] bg-tint p-5 text-tint-ink" aria-live="off">
        {data && now ? (
          <>
            <p className="text-[13px] font-semibold opacity-75">{data.tomorrow ? 'Завтра' : 'Следующая'} · {data.next.name}</p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <p className="text-[2.6rem] font-bold leading-none tracking-[-0.045em] tabular-nums">{countdown(data.next.at.getTime() - now.getTime())}</p>
              <p className="pb-1 text-[17px] font-semibold tabular-nums opacity-90">{fmtTime(data.next.at, place.tz)}</p>
            </div>
          </>
        ) : (
          <p className="h-[4.4rem]" />
        )}
      </div>

      <ul className="mt-3">
        {data?.list.map((p, i) => {
          const isNext = !data.tomorrow && p.key === data.next.key;
          const past = now ? p.at.getTime() < now.getTime() && !isNext : false;
          return (
            <li key={p.key} className={`relative flex items-center justify-between px-1 py-3 ${i ? 'border-t border-sep' : ''} ${past ? 'text-label3' : ''}`}>
              <span className={`flex items-center gap-2.5 text-[17px] ${isNext ? 'font-bold text-tint' : 'font-medium'}`}>
                <span className={`size-2 rounded-full ${isNext ? 'bg-tint' : past ? 'bg-sep' : 'bg-label3'}`} />
                {p.name}
              </span>
              <span className={`text-[17px] tabular-nums ${isNext ? 'font-bold text-tint' : ''}`}>{fmtTime(p.at, place.tz)}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex items-center gap-3 rounded-[18px] bg-surface2 p-3.5">
        <motion.span animate={{ rotate: q }} transition={{ type: 'spring', stiffness: 60, damping: 12 }} className="grid size-11 place-items-center rounded-full bg-tint-soft text-tint">
          <Compass size={22} strokeWidth={2} style={{ transform: 'rotate(-45deg)' }} />
        </motion.span>
        <div>
          <p className="text-[15px] font-semibold leading-tight">Кибла — {q}° от севера</p>
          <p className="text-[13px] text-label2">по часовой стрелке, для выбранного города</p>
        </div>
      </div>
      <p className="mt-3 text-[12.5px] leading-snug text-label2">
        Расчёт по методу Всемирной исламской лиги (мазхаб шафиитов для асра). Это ориентир: сверяйтесь с расписанием вашей мечети или муфтията.
      </p>
    </Card>
  );
}

function Tasbih() {
  const [count, setCount] = useStored<number>('hidaya-tasbih', 0);
  const [target, setTarget] = useStored<number>('hidaya-target', 33);
  const [pulse, setPulse] = useState(0);
  const R = 118;
  const C = 2 * Math.PI * R;
  const progress = target ? (count % target) / target : 0;
  const rounds = target ? Math.floor(count / target) : 0;

  const tap = () => {
    const n = count + 1;
    setCount(n);
    try {
      navigator.vibrate?.(target && n % target === 0 ? [30, 40, 60] : 12);
    } catch {}
    if (target && n % target === 0) setPulse((p) => p + 1);
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold uppercase tracking-[0.05em] text-label2">Тасбих</p>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-surface2 p-0.5" role="group" aria-label="Цель">
            {[33, 99, 0].map((t) => (
              <button key={t} onClick={() => setTarget(t)} aria-pressed={target === t} className={`rounded-full px-3 py-1 text-[13px] font-semibold transition-colors ${target === t ? 'bg-tint text-tint-ink' : 'text-label2'}`}>
                {t || '∞'}
              </button>
            ))}
          </div>
          <button onClick={() => setCount(0)} aria-label="Сбросить" className="grid size-8 place-items-center rounded-full bg-surface2 text-label2">
            <RotateCcw size={15} strokeWidth={2.3} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid place-items-center">
        <motion.button
          onClick={tap}
          whileTap={{ scale: 0.94 }}
          transition={SPRING}
          aria-label={`Засчитать. Сейчас ${count}`}
          className="relative grid size-[17rem] max-w-full place-items-center rounded-full"
        >
          <svg viewBox="0 0 260 260" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="130" cy="130" r={R} fill="none" strokeWidth="10" style={{ stroke: 'var(--sep)' }} />
            <motion.circle cx="130" cy="130" r={R} fill="none" strokeWidth="10" strokeLinecap="round" style={{ stroke: 'var(--tint)' }} strokeDasharray={C} animate={{ strokeDashoffset: C * (1 - progress) }} transition={{ type: 'spring', stiffness: 160, damping: 22 }} />
          </svg>
          <motion.span key={pulse} initial={{ scale: 1, opacity: 0.35 }} animate={{ scale: 1.25, opacity: 0 }} transition={{ duration: 0.8 }} className="pointer-events-none absolute inset-3 rounded-full border-2 border-tint" />
          <span className="relative flex flex-col items-center">
            <span className="relative h-[4.6rem] overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={count} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} className="block text-[4.4rem] font-bold leading-[4.6rem] tracking-[-0.05em] tabular-nums">
                  {count}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="text-[14px] text-label2">{target ? `${rounds} кругов по ${target}` : 'без цели'}</span>
          </span>
        </motion.button>
      </div>
      <p className="mt-2 text-center text-[13px] text-label2">Нажимайте на круг. Счёт хранится только на этом устройстве.</p>
    </Card>
  );
}

export function TodayView() {
  const { fridayPostId, open, posts } = useApp();
  const now = useNow(60000);
  const h = now ? hijriParts(now) : null;
  const friday = now ? now.getDay() === 5 : false;
  const days = now ? (5 - now.getDay() + 7) % 7 : 0;
  const fp = posts.find((p) => p.id === fridayPostId);

  return (
    <Screen title="Сегодня" subtitle="Дата, время намаза и тасбих — всё считается на вашем устройстве.">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <Card>
            <p className="text-[13px] font-semibold uppercase tracking-[0.05em] text-label2">По хиджре</p>
            <div className="mt-2 flex items-end gap-4">
              <p className="text-[5.4rem] font-bold leading-[0.9] tracking-[-0.06em] tabular-nums">{h?.day ?? '–'}</p>
              <div className="pb-1.5">
                <p className="text-[1.5rem] font-bold leading-tight tracking-[-0.03em]">{h?.month}</p>
                <p className="text-[15px] text-label2">{h ? `${h.year} г. х.` : ''}</p>
              </div>
            </div>
            <p className="mt-3 text-[15px] text-label2 first-letter:uppercase">
              {now ? new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now) : ' '}
            </p>
          </Card>

          <Card className={friday ? '!bg-tint !text-tint-ink' : ''}>
            <p className={`text-[13px] font-semibold uppercase tracking-[0.05em] ${friday ? 'opacity-75' : 'text-label2'}`}>Пятница</p>
            <p className="mt-1.5 text-[1.6rem] font-bold leading-[1.1] tracking-[-0.035em]">{friday ? 'Сегодня джума' : `До пятницы — ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`}</p>
            <p className={`mt-2 text-[15px] leading-snug ${friday ? 'opacity-85' : 'text-label2'}`}>Сура аль-Кяхф, много салаватов и дуа в последний час после асра.</p>
            {fp && (
              <button onClick={() => open(fp.id)} className={`mt-4 inline-flex items-center gap-1 text-[16px] font-semibold ${friday ? '' : 'text-tint'}`}>
                Читать публикацию <ChevronRight size={18} strokeWidth={2.6} />
              </button>
            )}
          </Card>
          <Tasbih />
        </div>
        <Prayers />
      </div>
    </Screen>
  );
}
