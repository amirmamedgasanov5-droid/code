'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { CATEGORIES } from '@/lib/categories';
import type { CategoryId, PostLite } from '@/lib/types';
import { useApp } from './AppProvider';
import { EXPO, Lines, Reveal } from './motion';

type Item = { id: CategoryId; count: number; latest: PostLite | null };

function plural(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'публикация';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'публикации';
  return 'публикаций';
}

function Detail({ item, compact = false }: { item: Item; compact?: boolean }) {
  const cat = CATEGORIES.find((c) => c.id === item.id)!;
  const { setFilter, open, telegramUrl } = useApp();
  return (
    <div className={compact ? 'pb-8 pt-1' : ''}>
      <p className="max-w-[30rem] text-[1.0625rem] leading-[1.7] text-ink/80">{cat.blurb}</p>
      {item.latest ? (
        <button
          onClick={() => open(item.latest!.id)}
          className="group mt-7 block w-full max-w-[30rem] border-t border-line pt-5 text-left"
        >
          <span className="eyebrow">Последнее · {item.latest.dateLabel}</span>
          <span className="font-display mt-3 block text-[1.6rem] font-medium leading-tight transition-transform duration-500 ease-expo group-hover:translate-x-1.5">
            {item.latest.title}
          </span>
          <span className="mt-2 line-clamp-2 block text-[0.95rem] text-mute">{item.latest.preview}</span>
        </button>
      ) : (
        <p className="mt-7 max-w-[30rem] border-t border-line pt-5 text-mute">
          В загруженной ленте пока нет публикаций этой рубрики — загляните в{' '}
          <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="u-link text-forest">
            канал
          </a>
          .
        </p>
      )}
      {item.count > 0 && (
        <a
          href="#publications"
          onClick={() => setFilter(item.id)}
          className="group mt-6 inline-flex items-center gap-2 text-[0.95rem] font-medium text-forest"
        >
          <span className="u-link pb-0.5">Все публикации рубрики</span>
          <ArrowRight size={16} strokeWidth={1.6} className="transition-transform duration-500 ease-expo group-hover:translate-x-1" />
        </a>
      )}
    </div>
  );
}

export function Knowledge({ items }: { items: Item[] }) {
  const [active, setActive] = useState<CategoryId>(items.find((i) => i.count > 0)?.id ?? items[0].id);
  const cur = items.find((i) => i.id === active)!;
  const curCat = CATEGORIES.find((c) => c.id === active)!;

  return (
    <section id="knowledge" className="relative bg-paper px-5 py-28 sm:px-8 sm:py-40 lg:px-12">
      <div className="mx-auto max-w-[88rem]">
        <header className="grid gap-8 lg:grid-cols-12">
          <Reveal className="lg:col-span-3">
            <p className="eyebrow flex items-center gap-3">
              <span className="h-px w-8 bg-gold" /> Знания
            </p>
          </Reveal>
          <div className="lg:col-span-9">
            <Lines
              lines={['Шесть дверей', <span key="i" className="italic text-forest">к одному смыслу</span>]}
              className="font-display text-[clamp(2.6rem,7vw,5.6rem)] font-medium leading-[0.98] tracking-[-0.02em]"
            />
          </div>
        </header>

        <div className="mt-16 grid gap-10 lg:mt-24 lg:grid-cols-12 lg:gap-8">
          <ul className="border-t border-line lg:col-span-7" role="list">
            {CATEGORIES.map((c, i) => {
              const item = items.find((x) => x.id === c.id)!;
              const on = active === c.id;
              return (
                <Reveal as="li" key={c.id} delay={i * 0.05} className="border-b border-line">
                  <button
                    onClick={() => setActive(c.id)}
                    onMouseEnter={() => window.matchMedia('(hover:hover)').matches && setActive(c.id)}
                    onFocus={() => setActive(c.id)}
                    aria-expanded={on}
                    aria-controls={`kn-${c.id}`}
                    className="group flex w-full items-baseline gap-4 py-6 text-left sm:gap-8 sm:py-7"
                  >
                    <span className={`eyebrow w-7 shrink-0 tabular-nums transition-colors duration-500 ${on ? '!text-gold' : ''}`}>0{i + 1}</span>
                    <span
                      className={`font-display flex-1 text-[clamp(2rem,4.6vw,3.6rem)] font-medium leading-none tracking-[-0.015em] transition-all duration-700 ease-expo ${
                        on ? 'translate-x-2 text-forest' : 'text-ink group-hover:translate-x-1'
                      }`}
                    >
                      {c.name}
                    </span>
                    <span lang="ar" dir="rtl" className={`text-2xl leading-none transition-colors duration-500 sm:text-3xl ${on ? 'text-forest' : 'text-mute/60'}`}>
                      {c.arabic}
                    </span>
                    <span className="hidden w-32 shrink-0 whitespace-nowrap text-right text-sm tabular-nums text-mute sm:block">
                      {item.count} {plural(item.count)}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {on && (
                      <motion.div
                        id={`kn-${c.id}`}
                        className="overflow-hidden pl-11 sm:pl-[3.75rem] lg:hidden"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.7, ease: EXPO }}
                      >
                        <Detail item={item} compact />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Reveal>
              );
            })}
          </ul>

          {/* Панель-образец: только на широких экранах */}
          <div className="relative hidden lg:col-span-5 lg:block">
            <div className="sticky top-28 overflow-hidden rounded-[1.75rem] border border-line bg-ivory p-10">
              <div aria-hidden className="lattice pointer-events-none absolute inset-0 opacity-[0.06]" />
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.55, ease: EXPO }}
                  className="relative"
                >
                  <p lang="ar" dir="rtl" className="quran text-center text-[7rem] leading-[1.25] text-forest-deep">
                    {curCat.arabic}
                  </p>
                  <p className="eyebrow mt-1 text-center">{curCat.translit}</p>
                  <div className="mx-auto my-8 h-px w-12 bg-gold" />
                  <Detail item={cur} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
