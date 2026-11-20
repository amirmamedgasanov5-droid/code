'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { EXPO } from './motion';

const sq = 'M-34 -34H34V34H-34Z';

/** Загрузочный экран: звезда прорисовывается, затем занавес уходит вверх. Один раз за сессию. */
export function Loader({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<'show' | 'exit' | 'gone'>('show');

  useEffect(() => {
    let seen = false;
    try {
      seen = !!sessionStorage.getItem('hidaya-seen');
      sessionStorage.setItem('hidaya-seen', '1');
    } catch {}
    if (seen || reduce) {
      setPhase('gone');
      onDone();
      return;
    }
    const t1 = setTimeout(() => {
      setPhase('exit');
      onDone();
    }, 1500);
    const t2 = setTimeout(() => setPhase('gone'), 2500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'gone') return null;

  return (
    <motion.div
      className="loader fixed inset-0 z-[100] grid place-items-center bg-forest-deep text-ivory"
      role="status"
      aria-label="Загрузка"
      initial={{ y: 0 }}
      animate={{ y: phase === 'exit' ? '-100%' : 0 }}
      transition={{ duration: 1, ease: EXPO }}
      style={{ borderBottomLeftRadius: phase === 'exit' ? '50% 8vh' : 0, borderBottomRightRadius: phase === 'exit' ? '50% 8vh' : 0 }}
    >
      <div className="flex flex-col items-center gap-7">
        <svg width="132" height="132" viewBox="-60 -60 120 120" fill="none" aria-hidden>
          <motion.path
            d={sq}
            stroke="#f5f0e6"
            strokeWidth="1.2"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, ease: EXPO }}
          />
          <motion.path
            d={sq}
            transform="rotate(45)"
            stroke="#d3c195"
            strokeWidth="1.2"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, delay: 0.25, ease: EXPO }}
          />
        </svg>
        <motion.div
          className="flex flex-col items-center gap-1"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.9, ease: EXPO }}
        >
          <span lang="ar" dir="rtl" className="text-4xl leading-none">هداية</span>
          <span className="eyebrow !text-gold-soft">Хидая</span>
        </motion.div>
      </div>
    </motion.div>
  );
}
