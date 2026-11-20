'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useApp } from './AppProvider';

const sq = 'M-30 -30H30V30H-30Z';

/** Запуск как у приложения iOS: значок прорисовывается и «раскрывается» в интерфейс. */
export function Splash() {
  const { setReady } = useApp();
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<'in' | 'open' | 'gone'>('in');

  useEffect(() => {
    let seen = false;
    try {
      seen = !!sessionStorage.getItem('hidaya-seen');
      sessionStorage.setItem('hidaya-seen', '1');
    } catch {}
    if (seen || reduce) {
      setPhase('gone');
      setReady(true);
      return;
    }
    const a = setTimeout(() => {
      setPhase('open');
      setReady(true);
    }, 1350);
    const b = setTimeout(() => setPhase('gone'), 2300);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'gone') return null;
  const open = phase === 'open';
  return (
    <motion.div
      className="splash fixed inset-0 z-[100] grid place-items-center"
      role="status"
      aria-label="Загрузка"
      style={{ background: '#0b1f16', pointerEvents: open ? 'none' : 'auto' }}
      animate={{ opacity: open ? 0 : 1 }}
      transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1], delay: open ? 0.15 : 0 }}
    >
      <motion.div
        className="relative grid size-[132px] place-items-center rounded-[34px]"
        style={{ background: 'linear-gradient(160deg,#256b4d,#0f3626)', boxShadow: 'inset 0 1px 0 rgb(255 255 255 /.25), 0 30px 80px rgb(0 0 0 /.45)' }}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={open ? { scale: 22, opacity: 0 } : { scale: 1, opacity: 1 }}
        transition={open ? { duration: 0.95, ease: [0.7, 0, 0.84, 0] } : { type: 'spring', stiffness: 200, damping: 18 }}
      >
        <svg width="84" height="84" viewBox="-44 -44 88 88" fill="none" aria-hidden>
          <motion.path d={sq} stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, delay: 0.25, ease: [0.16, 1, 0.3, 1] }} />
          <motion.path d={sq} transform="rotate(45)" stroke="#d3bd8a" strokeWidth="2.4" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, delay: 0.45, ease: [0.16, 1, 0.3, 1] }} />
        </svg>
      </motion.div>
      <motion.p
        className="absolute bottom-[18vh] text-[15px] font-medium tracking-[0.04em] text-white/70"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: open ? 0 : 1, y: 0 }}
        transition={{ delay: open ? 0 : 0.7, duration: 0.6 }}
      >
        Хидая
      </motion.p>
    </motion.div>
  );
}
