'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Compass, Newspaper, Sunrise } from 'lucide-react';
import { useState } from 'react';
import { CATEGORIES, CATEGORY_BY_ID } from '@/lib/categories';
import type { CategoryId } from '@/lib/types';
import { useApp } from '../AppProvider';
import { CatIcon } from '../catMeta';
import { PostRow } from '../PostRow';
import { Screen } from '../Screen';
import { Group, Row, plural } from '../ui';

const PRINCIPLES = [
  { Icon: Compass, t: 'Для сестёр', d: 'Вход — только для сестёр. Так сказано в описании канала.' },
  { Icon: Newspaper, t: 'С источниками', d: 'Аяты, хадисы и толкования приводятся со ссылками на суры, сборники и книги.' },
  { Icon: Sunrise, t: 'Каждый день', d: 'Новое напоминание почти ежедневно, а по пятницам — сунны этого дня.' },
];

export function LibraryView() {
  const { items, posts, setFilter, go } = useApp();
  const [cat, setCat] = useState<CategoryId | null>(null);
  const info = cat ? CATEGORY_BY_ID[cat] : null;
  const list = cat ? posts.filter((p) => p.category === cat).slice(0, 30) : [];

  return (
    <Screen
      title={info ? info.name : 'Знания'}
      subtitle={info ? info.blurb : 'Шесть рубрик канала. Выберите, с чего начать.'}
      back={info ? { label: 'Знания', onClick: () => setCat(null) } : undefined}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {!cat ? (
          <motion.div
            key="root"
            initial={{ x: '-22%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-22%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className="space-y-8"
          >
            <Group>
              {CATEGORIES.map((c, i) => {
                const it = items.find((x) => x.id === c.id)!;
                return (
                  <Row key={c.id} onClick={() => setCat(c.id)} last={i === CATEGORIES.length - 1}>
                    <div className="flex items-center gap-3.5">
                      <CatIcon id={c.id} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[17px] font-medium leading-tight">{c.name}</p>
                        <p className="text-[13px] text-label2">
                          {it.count} {plural(it.count)}
                        </p>
                      </div>
                      <span lang="ar" dir="rtl" className="text-[22px] leading-none text-label3">
                        {c.arabic}
                      </span>
                    </div>
                  </Row>
                );
              })}
            </Group>

            <Group header="О Хидае">
              <div className="p-5">
                <p className="font-display text-[1.45rem] font-bold leading-[1.15] tracking-[-0.03em]">Тихое место в ленте.</p>
                <p className="mt-2.5 text-[16px] leading-snug text-label2">
                  Один аят, слово учёного, напоминание, после которого хочется помолчать. Напоминать о главном — о сердце, поминании Аллаха и подготовке к вечной жизни —
                  коротко, ясно и там, где вы и так проводите день: в Telegram.
                </p>
              </div>
              {PRINCIPLES.map(({ Icon, t, d }, i) => (
                <Row key={t} chevron={false} last={i === PRINCIPLES.length - 1}>
                  <div className="flex items-start gap-3.5 py-0.5">
                    <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-tint-soft text-tint">
                      <Icon size={19} strokeWidth={2.1} />
                    </span>
                    <div>
                      <p className="text-[16px] font-semibold leading-tight">{t}</p>
                      <p className="mt-0.5 text-[14.5px] leading-snug text-label2">{d}</p>
                    </div>
                  </div>
                </Row>
              ))}
            </Group>
          </motion.div>
        ) : (
          <motion.div
            key={cat}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className="space-y-4"
          >
            {list.length ? (
              <Group>
                {list.map((p, i) => (
                  <PostRow key={p.id} post={p} last={i === list.length - 1} />
                ))}
              </Group>
            ) : (
              <Group>
                <p className="p-5 text-label2">В загруженной ленте пока нет публикаций этой рубрики.</p>
              </Group>
            )}
            <button
              onClick={() => {
                setFilter(cat);
                go('feed');
              }}
              className="w-full rounded-full py-3 text-center text-[16px] font-semibold text-tint"
            >
              Открыть в ленте
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Screen>
  );
}
