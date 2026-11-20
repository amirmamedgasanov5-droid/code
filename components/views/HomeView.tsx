'use client';

import { motion } from 'framer-motion';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CATEGORIES, CATEGORY_BY_ID } from '@/lib/categories';
import { hijriParts } from '@/lib/hijri';
import { useApp } from '../AppProvider';
import { CAT_META, CatIcon } from '../catMeta';
import { Emblem } from '../Geometry';
import { Screen } from '../Screen';
import { Button, Pill, SPRING, rise, stagger } from '../ui';

function Tile({ children, className = '', onClick, tone = 'surface' }: { children: React.ReactNode; className?: string; onClick?: () => void; tone?: 'surface' | 'tint' }) {
  const cls = `relative overflow-hidden rounded-[28px] p-5 text-left ${tone === 'tint' ? 'bg-tint text-tint-ink' : 'bg-surface'} ${className}`;
  if (!onClick) return <motion.div variants={rise} className={cls}>{children}</motion.div>;
  return (
    <motion.button variants={rise} onClick={onClick} whileTap={{ scale: 0.96 }} whileHover={{ y: -3 }} transition={SPRING} className={cls}>
      {children}
    </motion.button>
  );
}

export function HomeView() {
  const { posts, featured, items, ready, go, open, telegramUrl } = useApp();
  const latest = posts[0];
  const [today, setToday] = useState<{ h: ReturnType<typeof hijriParts>; wd: string } | null>(null);
  useEffect(() => {
    const n = new Date();
    setToday({ h: hijriParts(n), wd: new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long' }).format(n) });
  }, []);
  const show = ready ? 'show' : 'hidden';

  return (
    <Screen title="Хидая" hero>
      {/* Hero */}
      <motion.div variants={stagger(0.09, 0.05)} initial="hidden" animate={show} className="grid items-center gap-6 pt-2 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 lg:pt-8">
        <div>
          <motion.div variants={rise}>
            <Pill>Telegram-канал · для сестёр</Pill>
          </motion.div>
          <motion.h1 variants={rise} className="font-display mt-5 text-[clamp(2.9rem,9.2vw,5.9rem)] font-bold leading-[0.98] tracking-[-0.045em]">
            Прямой путь
            <br />
            начинается
            <br />
            <span className="bg-gradient-to-r from-tint to-gold bg-clip-text text-transparent">с сердца.</span>
          </motion.h1>
          <motion.p variants={rise} className="mt-5 max-w-[31rem] text-[19px] leading-[1.4] text-label2">
            Хидая — «наставление на прямой путь». Аяты и тафсир, хадисы и дуа, короткие напоминания — спокойно, с источниками и на русском.
          </motion.p>
          <motion.div variants={rise} className="mt-7 flex flex-wrap gap-3">
            <Button href={telegramUrl} external>
              Присоединиться
              <ArrowUpRight size={19} strokeWidth={2.4} />
            </Button>
            <Button variant="glass" onClick={() => go('feed')}>
              Читать
            </Button>
          </motion.div>
        </div>
        <motion.div variants={rise} className="mx-auto w-[min(76vw,24rem)] lg:w-full lg:max-w-[34rem]">
          <Emblem animate />
        </motion.div>
      </motion.div>

      {/* Bento */}
      <motion.div
        variants={stagger(0.07)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '0px 0px -12% 0px' }}
        className="mt-14 grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        {latest && (
          <Tile className="col-span-2 flex min-h-[19rem] flex-col md:row-span-2" onClick={() => open(latest.id)}>
            <div className="flex items-center gap-2">
              <Pill>Последнее в канале</Pill>
              <span className="text-[13px] text-label2">{latest.dateLabel}</span>
            </div>
            <p className="mt-5 text-[clamp(1.7rem,3.6vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.035em]">{latest.title}</p>
            <p className="mt-3 line-clamp-4 text-[16px] leading-snug text-label2">{latest.preview}</p>
            <span className="mt-auto flex items-center gap-1 pt-5 text-[16px] font-semibold text-tint">
              Читать <ChevronRight size={18} strokeWidth={2.6} />
            </span>
          </Tile>
        )}

        <Tile onClick={() => go('today')} className="min-h-[9rem]">
          <p className="text-[13px] font-semibold uppercase tracking-[0.05em] text-label2">Сегодня</p>
          <p className="mt-2 text-[3.4rem] font-bold leading-none tracking-[-0.05em] tabular-nums">{today?.h?.day ?? '–'}</p>
          <p className="mt-1.5 text-[14px] leading-tight text-label2">
            {today?.h ? `${today.h.month} ${today.h.year}` : ' '}
          </p>
          <p className="mt-0.5 text-[13px] leading-tight text-label3 first-letter:uppercase">{today?.wd ?? ' '}</p>
        </Tile>

        <Tile tone="tint" className="min-h-[9rem]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.05em] opacity-70">Аль-Фатиха · 1:6</p>
          <p lang="ar" dir="rtl" className="quran mt-2 text-[1.5rem] leading-[1.7]">
            ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ
          </p>
          <p className="mt-1 text-[15px] font-medium leading-tight">Веди нас прямым путём</p>
        </Tile>

        <Tile className="col-span-2" onClick={() => go('library')}>
          <div className="flex items-center justify-between">
            <p className="text-[19px] font-bold tracking-[-0.025em]">Знания</p>
            <ChevronRight size={20} className="text-label3" />
          </div>
          <div className="mt-4 flex -space-x-2">
            {CATEGORIES.map((c) => (
              <span key={c.id} className="rounded-[12px] ring-[3px] ring-surface">
                <CatIcon id={c.id} size={40} />
              </span>
            ))}
          </div>
          <p className="mt-3 text-[14px] text-label2">Коран, тафсир, хадис, напоминания, дуа и знания — {posts.length} публикаций</p>
        </Tile>

        <Tile className="col-span-2" onClick={() => go('channel')}>
          <div className="flex items-center justify-between">
            <p className="text-[19px] font-bold tracking-[-0.025em]">Telegram</p>
            <ChevronRight size={20} className="text-label3" />
          </div>
          <p className="mt-2 text-[15px] leading-snug text-label2">@hidaya_islam1 — вход только для сестёр. Откройте QR-код и присоединяйтесь.</p>
        </Tile>
      </motion.div>

      {/* Избранное */}
      {featured.length > 0 && (
        <motion.section
          className="-mx-4 mt-14 md:mx-0"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '0px 0px -10% 0px' }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        >
          <h2 className="mb-4 px-5 text-[1.7rem] font-bold tracking-[-0.03em] md:px-1">Избранное</h2>
          <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:px-1">
            {featured.map((f, i) => {
              const post = posts.find((p) => p.id === f.postId);
              const bg = [
                'linear-gradient(160deg,#256b4d,#0b2a1d)',
                'linear-gradient(160deg,#2d5a74,#0f2230)',
                'linear-gradient(160deg,#76623a,#2a2216)',
              ][i % 3];
              return (
                <motion.button
                  key={f.postId + f.text.slice(0, 6)}
                  onClick={() => open(f.postId)}
                  whileTap={{ scale: 0.97 }}
                  whileHover={{ y: -4 }}
                  transition={SPRING}
                  className="relative flex h-[24rem] w-[min(84vw,22rem)] shrink-0 snap-center flex-col overflow-hidden rounded-[34px] p-6 text-left text-white md:w-[24rem]"
                  style={{ background: bg }}
                >
                  <svg aria-hidden viewBox="-110 -110 220 220" className="absolute -right-20 -top-20 w-72 opacity-[0.14]" fill="none" stroke="#fff" strokeWidth="1">
                    <rect x="-80" y="-80" width="160" height="160" />
                    <rect x="-80" y="-80" width="160" height="160" transform="rotate(45)" />
                    <rect x="-50" y="-50" width="100" height="100" transform="rotate(22.5)" />
                  </svg>
                  <span className="relative text-[12px] font-semibold uppercase tracking-[0.07em] opacity-70">{f.kind === 'ayah' ? 'Аят и тафсир' : 'Из публикации'}</span>
                  {f.kind === 'ayah' && f.arabic ? (
                    <>
                      <span lang="ar" dir="rtl" className="quran relative mt-5 block text-[1.45rem] leading-[2]">
                        {f.arabic}
                      </span>
                      <span className="relative mt-3 block text-[16px] leading-snug opacity-90">{f.text}</span>
                    </>
                  ) : (
                    <span className="font-serif relative mt-5 block text-[1.85rem] italic leading-[1.14] tracking-[-0.01em]">«{f.text}»</span>
                  )}
                  <span className="relative mt-auto text-[13px] opacity-70">
                    {f.source}
                    {post ? ` · ${post.dateLabel}` : ''}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </motion.section>
      )}
    </Screen>
  );
}
