'use client';

import { motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES } from '@/lib/categories';
import { useApp } from '../AppProvider';
import { PostRow } from '../PostRow';
import { Screen } from '../Screen';
import { Group, SPRING, plural } from '../ui';

const STEP = 12;

export function FeedView() {
  const { posts, filter, setFilter, telegramUrl } = useApp();
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(STEP);
  useEffect(() => setShown(STEP), [filter, q]);

  const chips = useMemo(
    () => [{ id: 'all' as const, name: 'Все', n: posts.length }, ...CATEGORIES.map((c) => ({ id: c.id, name: c.name, n: posts.filter((p) => p.category === c.id).length })).filter((c) => c.n)],
    [posts],
  );
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return posts.filter((p) => (filter === 'all' || p.category === filter) && (!s || (p.title + ' ' + p.preview).toLowerCase().includes(s)));
  }, [posts, filter, q]);

  return (
    <Screen title="Лента" subtitle="Настоящие тексты канала — без правок по смыслу. Каждая публикация ведёт к оригиналу в Telegram.">
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.7rem)] z-30 -mx-4 space-y-3 px-4 pb-3 pt-1 md:-mx-6 md:px-6">
        <label className="glass flex h-11 items-center gap-2.5 rounded-full px-4">
          <Search size={18} className="shrink-0 text-label2" />
          <input
            id="feed-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            placeholder="Поиск по публикациям"
            className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-label3 [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="Очистить" className="grid size-5 place-items-center rounded-full bg-label3 text-bg">
              <X size={12} strokeWidth={3} />
            </button>
          )}
        </label>
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label="Рубрики">
          <div className="glass inline-flex w-max gap-1 rounded-full p-1">
            {chips.map((c) => {
              const on = filter === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setFilter(c.id)}
                  aria-pressed={on}
                  className={`relative whitespace-nowrap rounded-full px-4 py-2 text-[14.5px] font-semibold transition-colors duration-300 ${on ? 'text-tint-ink' : 'text-label2'}`}
                >
                  {on && <motion.span layoutId="chip-lens" className="absolute inset-0 rounded-full bg-tint" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
                  <span className="relative">
                    {c.name} <span className={on ? 'opacity-70' : 'text-label3'}>{c.n}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {list.length === 0 ? (
        <Group>
          <div className="p-6 text-center">
            <p className="text-[17px] font-semibold">Ничего не найдено</p>
            <p className="mt-1 text-label2">
              Попробуйте другой запрос или откройте{' '}
              <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-tint">
                канал
              </a>
              .
            </p>
          </div>
        </Group>
      ) : (
        <motion.div key={filter + q} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.045 } } }}>
          <Group>
            {list.slice(0, shown).map((p, i, a) => (
              <motion.div key={p.id} variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } } }}>
                <PostRow post={p} last={i === a.length - 1} />
              </motion.div>
            ))}
          </Group>
        </motion.div>
      )}

      {list.length > shown && (
        <motion.button whileTap={{ scale: 0.95 }} transition={SPRING} onClick={() => setShown((s) => s + STEP)} className="glass mx-auto mt-6 block rounded-full px-7 py-3 text-[16px] font-semibold text-tint">
          Показать ещё · {list.length - shown}
        </motion.button>
      )}
      <p className="mt-6 px-4 text-center text-[13px] text-label2">
        {list.length} {plural(list.length)}. Весь архив — в Telegram-канале.
      </p>
    </Screen>
  );
}
