'use client';

import { motion } from 'framer-motion';
import { ArrowUpRight, BookOpen, ChevronRight, Gem, HandHeart, Quote, ScrollText, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { COLLECTIONS, hadithBook, hadithIndex, quranIndex, sura as loadSura, type Hadith, type QuranIndex, type Sura } from '@/lib/client-data';
import { HADITH_NAMES } from '@/lib/library-meta';
import { hijriParts } from '@/lib/hijri';
import { useApp } from '../AppProvider';
import { Screen } from '../Screen';
import { Button, Pill, SPRING, fmt, rise, stagger } from '../ui';

/** «Аят дня» и «Хадис дня»: выбираются по дате из настоящих текстов библиотеки */
function useDaily() {
  const [ayah, setAyah] = useState<{ n: number; a: number; ar: string; ru: string; name: string } | null>(null);
  const [hadith, setHadith] = useState<{ c: string; b: number; h: Hadith } | null>(null);

  useEffect(() => {
    const day = Math.floor(Date.now() / 864e5);
    const rnd = (k: number) => ((day * 2654435761 + k * 40503) >>> 0) % 1000003;
    let alive = true;
    (async () => {
      try {
        const idx: QuranIndex = await quranIndex();
        const total = idx.suras.reduce((s, x) => s + x.v, 0);
        for (let t = 0; t < 12 && alive; t++) {
          let g = (rnd(1 + t) % total) + 1;
          let n = 1;
          while (g > idx.suras[n - 1].v) g -= idx.suras[n++ - 1].v;
          const s: Sura = await loadSura(n);
          if (s.r[g - 1].length <= 230 && s.a[g - 1].length <= 190) {
            if (alive) setAyah({ n, a: g, ar: s.a[g - 1], ru: s.r[g - 1], name: idx.suras[n - 1].tr });
            break;
          }
        }
        const c = 'bukhari';
        const hi = await hadithIndex(c);
        for (let t = 0; t < 8 && alive; t++) {
          const bk = hi.books[rnd(50 + t) % hi.books.length];
          const hs = (await hadithBook(c, bk.b)).filter((h) => h.x.length > 90 && h.x.length < 330);
          if (hs.length) {
            if (alive) setHadith({ c, b: bk.b, h: hs[rnd(70 + t) % hs.length] });
            break;
          }
        }
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, []);
  return { ayah, hadith };
}

function Card({ children, className = '', onClick, tint }: { children: React.ReactNode; className?: string; onClick?: () => void; tint?: boolean }) {
  const cls = `relative overflow-hidden rounded-[26px] p-5 text-left ${tint ? 'text-white' : 'bg-surface'} ${className}`;
  const style = tint ? { background: 'linear-gradient(165deg,#2c8f5a,#124f2d)' } : undefined;
  if (!onClick) return <motion.div variants={rise} style={style} className={cls}>{children}</motion.div>;
  return (
    <motion.button variants={rise} style={style} onClick={onClick} whileTap={{ scale: 0.97 }} transition={SPRING} className={cls}>
      {children}
    </motion.button>
  );
}

export function HomeView() {
  const { posts, featured, ready, go, open, openRoute, lastRead, telegramUrl, bookmarks } = useApp();
  const { ayah, hadith } = useDaily();
  const latest = posts[0];
  const [hadithTotal, setHadithTotal] = useState(0);
  useEffect(() => {
    Promise.all(COLLECTIONS.map((c) => hadithIndex(c))).then((l) => setHadithTotal(l.reduce((s, i) => s + i.total, 0))).catch(() => {});
  }, []);
  const [date, setDate] = useState<{ g: string; h: string } | null>(null);
  useEffect(() => {
    const n = new Date();
    const h = hijriParts(n);
    setDate({ g: new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long' }).format(n), h: h ? `${h.day} ${h.month} ${h.year} г. х.` : '' });
  }, []);
  const show = ready ? 'show' : 'hidden';
  const sections = [
    { Icon: BookOpen, label: 'Коран', color: '#2f7d5b', go: () => openRoute([{ k: 'quran' }]) },
    { Icon: ScrollText, label: 'Тафсир', color: '#2b6e8f', go: () => openRoute([{ k: 'tafsirs' }]) },
    { Icon: Quote, label: 'Хадисы', color: '#b8893b', go: () => openRoute([{ k: 'hadith' }]) },
    { Icon: HandHeart, label: 'Азкары', color: '#6b5bb0', go: () => openRoute([{ k: 'hisn' }]) },
    { Icon: Gem, label: '99 имён', color: '#c0566b', go: () => openRoute([{ k: 'names' }]) },
    { Icon: Trophy, label: 'Викторины', color: '#d9822b', go: () => openRoute([{ k: 'quizzes' }]) },
  ];

  return (
    <Screen title="Хидая" subtitle={date ? `${date.g.replace(/^./, (c) => c.toUpperCase())} · ${date.h}` : undefined}>
      <motion.div variants={stagger(0.07, 0.05)} initial="hidden" animate={show} className="space-y-3">
        <motion.div variants={rise} className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {sections.map(({ Icon, label, color, go: fn }) => (
            <motion.button key={label} onClick={fn} whileTap={{ scale: 0.93 }} transition={SPRING} className="flex flex-col items-center gap-2 rounded-[22px] bg-surface px-2 py-4">
              <span className="grid size-[46px] place-items-center rounded-[13px] text-white" style={{ background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 70%, black))` }}>
                <Icon size={24} strokeWidth={2} />
              </span>
              <span className="text-[13px] font-medium">{label}</span>
            </motion.button>
          ))}
        </motion.div>

        <div className="grid gap-3 md:grid-cols-2">
          <Card tint onClick={ayah ? () => openRoute([{ k: 'quran' }, { k: 'sura', n: ayah.n, a: ayah.a }]) : undefined} className="min-h-[15rem]">
            <p className="text-[12px] font-semibold uppercase tracking-[0.05em] opacity-75">Аят дня{ayah ? ` · ${ayah.name} ${ayah.n}:${ayah.a}` : ''}</p>
            {ayah ? (
              <>
                <p lang="ar" dir="rtl" className="quran mt-3 text-right text-[1.65rem] leading-[2]">{ayah.ar}</p>
                <p className="mt-3 text-[16px] leading-snug opacity-95">{ayah.ru}</p>
              </>
            ) : (
              <div className="mt-4 space-y-3"><div className="ml-auto h-7 w-3/4 animate-pulse rounded-full bg-white/20" /><div className="h-4 w-full animate-pulse rounded-full bg-white/20" /></div>
            )}
          </Card>

          <Card onClick={hadith ? () => openRoute([{ k: 'hadith' }, { k: 'coll', c: hadith.c }, { k: 'book', c: hadith.c, b: hadith.b, n: hadith.h.n }]) : undefined} className="min-h-[15rem]">
            <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-tint">Хадис дня{hadith ? ` · ${HADITH_NAMES[hadith.c].ru} № ${hadith.h.n}` : ''}</p>
            {hadith ? <p className="mt-3 line-clamp-[9] text-[17px] leading-[1.42]">{hadith.h.x}</p> : <div className="mt-4 space-y-3"><div className="h-4 w-full animate-pulse rounded-full bg-fill" /><div className="h-4 w-5/6 animate-pulse rounded-full bg-fill" /><div className="h-4 w-2/3 animate-pulse rounded-full bg-fill" /></div>}
          </Card>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {lastRead && (
            <Card onClick={() => openRoute([{ k: 'quran' }, { k: 'sura', n: lastRead.n, a: lastRead.a }])}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-label2">Продолжить чтение</p>
              <p className="mt-1.5 text-[22px] font-bold tracking-[-0.03em]">Сура {lastRead.n}, аят {lastRead.a}</p>
              <span className="mt-2 flex items-center gap-1 text-[15px] font-semibold text-tint">Открыть <ChevronRight size={17} strokeWidth={2.6} /></span>
            </Card>
          )}
          {latest && (
            <Card onClick={() => open(latest.id)} className={lastRead ? '' : 'md:col-span-2'}>
              <div className="flex items-center gap-2"><Pill>Последнее в канале</Pill><span className="text-[13px] text-label2">{latest.dateLabel}</span></div>
              <p className="mt-3 text-[clamp(1.4rem,3vw,1.9rem)] font-bold leading-[1.12] tracking-[-0.035em]">{latest.title}</p>
              <p className="mt-2 line-clamp-3 text-[15px] leading-snug text-label2">{latest.preview}</p>
            </Card>
          )}
        </div>

        {featured.length > 0 && (
          <motion.section variants={rise} className="-mx-4 pt-3 md:mx-0">
            <h2 className="mb-3 px-5 text-[22px] font-bold tracking-[-0.03em] md:px-1">Избранное из канала</h2>
            <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:px-1">
              {featured.map((f, i) => (
                <motion.button
                  key={f.postId + f.text.slice(0, 6)}
                  onClick={() => open(f.postId)}
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING}
                  className="flex h-[21rem] w-[min(82vw,21rem)] shrink-0 snap-center flex-col overflow-hidden rounded-[28px] p-6 text-left text-white md:w-[22rem]"
                  style={{ background: ['linear-gradient(165deg,#2c8f5a,#0f4426)', 'linear-gradient(165deg,#2f6f93,#102838)', 'linear-gradient(165deg,#86703f,#2b2316)'][i % 3] }}
                >
                  <span className="text-[12px] font-semibold uppercase tracking-[0.06em] opacity-75">{f.kind === 'ayah' ? 'Аят и тафсир' : 'Из публикации'}</span>
                  {f.kind === 'ayah' && f.arabic ? (
                    <>
                      <span lang="ar" dir="rtl" className="quran mt-4 block text-[1.4rem] leading-[2]">{f.arabic}</span>
                      <span className="mt-3 block text-[16px] leading-snug opacity-90">{f.text}</span>
                    </>
                  ) : (
                    <span className="font-serif mt-4 block text-[1.8rem] italic leading-[1.14]">«{f.text}»</span>
                  )}
                  <span className="mt-auto text-[13px] opacity-75">{f.source}</span>
                </motion.button>
              ))}
            </div>
          </motion.section>
        )}

        <motion.div variants={rise} className="grid gap-3 pt-3 md:grid-cols-[1.4fr_1fr]">
          <div className="rounded-[26px] bg-surface p-6">
            <p className="text-[24px] font-bold leading-[1.1] tracking-[-0.035em]">Хидая — в Telegram</p>
            <p className="mt-2 max-w-md text-[15px] leading-snug text-label2">Напоминания, тафсир ас-Саади и сунны дня приходят прямо в канал. Вход — только для сестёр.</p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button href={telegramUrl} external>Присоединиться <ArrowUpRight size={19} strokeWidth={2.4} /></Button>
              <Button variant="glass" onClick={() => go('channel')}>О канале</Button>
            </div>
          </div>
          <div className="rounded-[26px] bg-surface p-6">
            <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-label2">В вашей библиотеке</p>
            <p className="mt-2 text-[34px] font-bold leading-none tracking-[-0.045em] tabular-nums">{fmt(6236 + hadithTotal + 298 + posts.length)}</p>
            <p className="mt-1 text-[14px] text-label2">аятов, хадисов, дуа и публикаций; плюс тафсир на все 114 сур</p>
            <p className="mt-3 text-[14px] text-label2">Закладок: <span className="font-semibold text-label">{bookmarks.length}</span></p>
          </div>
        </motion.div>
      </motion.div>
    </Screen>
  );
}
