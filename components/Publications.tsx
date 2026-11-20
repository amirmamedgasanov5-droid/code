'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CATEGORIES, CATEGORY_BY_ID } from '@/lib/categories';
import { useApp } from './AppProvider';
import { EXPO, Lines, Reveal } from './motion';

const STEP = 6;

export function Publications({ total }: { total: number }) {
  const { posts, filter, setFilter, open, telegramUrl } = useApp();
  const [shown, setShown] = useState(STEP);

  useEffect(() => setShown(STEP), [filter]);

  const list = filter === 'all' ? posts : posts.filter((p) => p.category === filter);
  const chips = [{ id: 'all' as const, name: 'Все', n: posts.length }, ...CATEGORIES.map((c) => ({ id: c.id, name: c.name, n: posts.filter((p) => p.category === c.id).length })).filter((c) => c.n > 0)];

  return (
    <section id="publications" className="relative px-5 py-28 sm:px-8 sm:py-40 lg:px-12">
      <div className="mx-auto max-w-[88rem]">
        <header className="grid gap-8 lg:grid-cols-12">
          <Reveal className="lg:col-span-3">
            <p className="eyebrow flex items-center gap-3">
              <span className="h-px w-8 bg-gold" /> Публикации
            </p>
          </Reveal>
          <div className="lg:col-span-9">
            <Lines
              lines={['Из канала —', <span key="i" className="italic text-forest">последние записи</span>]}
              className="font-display text-[clamp(2.6rem,7vw,5.6rem)] font-medium leading-[0.98] tracking-[-0.02em]"
            />
            <Reveal delay={0.1}>
              <p className="mt-6 max-w-xl text-mute">
                Здесь — настоящие тексты канала, без правок по смыслу. Каждая публикация ведёт к оригиналу в Telegram.
              </p>
            </Reveal>
          </div>
        </header>

        <div className="mt-14 lg:grid lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-start-4 lg:col-span-9">
            <div className="-mx-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="Рубрики">
              <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
                {chips.map((c) => {
                  const on = filter === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setFilter(c.id)}
                      aria-pressed={on}
                      className={`relative whitespace-nowrap rounded-full border px-4 py-2 text-[0.9rem] transition-colors duration-300 ${
                        on ? 'border-transparent text-ivory' : 'border-line text-ink/80 hover:border-ink/40'
                      }`}
                    >
                      {on && <motion.span layoutId="chip" className="absolute inset-0 rounded-full bg-forest" transition={{ duration: 0.6, ease: EXPO }} />}
                      <span className="relative">
                        {c.name} <span className={`ml-1 tabular-nums ${on ? 'text-ivory/60' : 'text-mute'}`}>{c.n}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {list.length === 0 ? (
              <div className="mt-14 border-t border-line pt-10">
                <p className="max-w-md text-mute">
                  Публикации появятся здесь после синхронизации с каналом. А пока их можно читать прямо в Telegram.
                </p>
                <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="u-link mt-4 inline-block text-forest">
                  Открыть @hidaya_islam1
                </a>
              </div>
            ) : (
              <motion.ol key={filter} className="mt-10 border-t border-line" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.07 } } }}>
                {list.slice(0, shown).map((p) => (
                  <motion.li
                    key={p.id}
                    variants={{ hidden: { opacity: 0, y: 22 }, show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: EXPO } } }}
                    className="group relative border-b border-line"
                  >
                    <article className="grid gap-x-8 gap-y-3 py-8 transition-[padding] duration-700 ease-expo sm:grid-cols-[9.5rem_1fr] sm:py-10 sm:group-hover:pl-3">
                      <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
                        <time dateTime={p.date} className="text-[0.85rem] tabular-nums text-mute">
                          {p.dateLabel}
                        </time>
                        <span className="eyebrow !text-forest">{CATEGORY_BY_ID[p.category].name}</span>
                      </div>
                      <div>
                        <h3 className="font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-medium leading-[1.06] tracking-[-0.01em]">
                          <button
                            onClick={() => open(p.id)}
                            className="text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-offset-8"
                            aria-label={`Читать: ${p.title}`}
                          >
                            {p.title}
                          </button>
                        </h3>
                        <p className="mt-3 line-clamp-3 max-w-[40rem] text-[1rem] leading-[1.7] text-mute">{p.preview}</p>
                        <div className="relative z-10 mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.9rem]">
                          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                            Читать <span className="text-mute">· {p.minutes} мин</span>
                            <ArrowRight size={15} strokeWidth={1.6} className="transition-transform duration-500 ease-expo group-hover:translate-x-1.5" />
                          </span>
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-mute transition-colors hover:text-forest"
                          >
                            Оригинал в Telegram <ArrowUpRight size={14} strokeWidth={1.6} />
                          </a>
                        </div>
                      </div>
                    </article>
                  </motion.li>
                ))}
              </motion.ol>
            )}

            <AnimatePresence>
              {list.length > shown && (
                <motion.div exit={{ opacity: 0 }} className="mt-10 flex items-center justify-between gap-4">
                  <button
                    onClick={() => setShown((s) => s + STEP)}
                    className="rounded-full border border-ink/25 px-6 py-3 text-[0.95rem] font-medium transition-colors duration-500 hover:bg-ink hover:text-ivory"
                  >
                    Показать ещё
                  </button>
                  <span className="text-sm tabular-nums text-mute">
                    {Math.min(shown, list.length)} из {list.length}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="mt-12 text-sm text-mute">
              Показаны последние {posts.length} текстовых публикаций. Весь архив — в{' '}
              <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="u-link text-forest">
                канале
              </a>
              ; всего сообщений в нём — более {total.toLocaleString('ru-RU')}.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
