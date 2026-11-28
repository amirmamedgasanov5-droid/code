import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Banner } from '../types';

const TONES: Record<Banner['tone'], string> = {
  indigo: 'bg-brand-50 dark:bg-brand-950/30 border-brand-100 dark:border-brand-900/40 text-brand-900 dark:text-brand-100',
  slate: 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100',
  emerald: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-100',
  rose: 'bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900/40 text-rose-900 dark:text-rose-100',
};

interface Props {
  banners: Banner[];
}

export const BannerCarousel: React.FC<Props> = ({ banners }) => {
  const slides: React.ReactNode[] = [
    ...banners.map(b => (
      <section
        key={b.id}
        className={`rounded-2xl border px-6 py-7 sm:px-8 sm:py-9 flex flex-col md:flex-row md:items-center justify-between gap-6 min-h-[200px] ${TONES[b.tone] || TONES.indigo}`}
      >
        <div className="max-w-xl space-y-3">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">{b.title}</h2>
          {b.text && <p className="text-sm leading-relaxed opacity-80 whitespace-pre-wrap">{b.text}</p>}
          {b.linkUrl && (
            <a
              href={b.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium transition-colors"
            >
              {b.linkLabel || 'Ətraflı'} <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <div className="text-[11px] opacity-60">{b.authorName}</div>
        </div>
        {b.imageUrl && (
          <img
            src={b.imageUrl}
            alt={b.title}
            className="w-full md:w-72 h-40 md:h-44 object-cover rounded-xl shrink-0"
            referrerPolicy="no-referrer"
          />
        )}
      </section>
    )),
  ];

  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  const go = (next: number, direction: number) => {
    setDir(direction);
    setIdx(((next % count) + count) % count);
  };

  useEffect(() => {
    if (idx >= count) setIdx(0);
  }, [count, idx]);

  // Auto-advance every 3 seconds (paused only while a real mouse hovers).
  useEffect(() => {
    if (count < 2 || paused) return;
    const t = setTimeout(() => go(idx + 1, 1), 3000);
    return () => clearTimeout(t);
  }, [count, paused, idx]);

  const current = Math.min(idx, count - 1);

  if (count === 0) return null;

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      onPointerEnter={e => e.pointerType === 'mouse' && setPaused(true)}
      onPointerLeave={e => e.pointerType === 'mouse' && setPaused(false)}
    >
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={current}
          custom={dir}
          variants={{
            enter: (d: number) => ({ x: d > 0 ? 60 : -60, opacity: 0 }),
            center: { x: 0, opacity: 1 },
            exit: (d: number) => ({ x: d > 0 ? -60 : 60, opacity: 0 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
          drag={count > 1 ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={(_, info) => {
            if (info.offset.x < -60) go(idx + 1, 1);
            else if (info.offset.x > 60) go(idx - 1, -1);
          }}
        >
          {slides[current]}
        </motion.div>
      </AnimatePresence>
      {count > 1 && (
        <>
          <button
            onClick={() => go(idx - 1, -1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-surface/90 border border-border text-text flex items-center justify-center shadow-sm hover:bg-surface"
            aria-label="Əvvəlki"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => go(idx + 1, 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-surface/90 border border-border text-text flex items-center justify-center shadow-sm hover:bg-surface"
            aria-label="Növbəti"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => go(i, i > idx ? 1 : -1)}
                className={`h-1.5 rounded-full transition-all ${i === current ? 'w-5 bg-brand-600' : 'w-1.5 bg-brand-300'}`}
                aria-label={`Слайд ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
