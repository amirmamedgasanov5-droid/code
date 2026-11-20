'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useApp } from './AppProvider';

/** Запуск как у приложения iOS: значок появляется и «раскрывается» в интерфейс. */
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
    }, 1100);
    const b = setTimeout(() => setPhase('gone'), 2000);
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
      className="splash fixed inset-0 z-[100] grid place-items-center bg-[#0b1f16]"
      role="status"
      aria-label="Загрузка"
      style={{ pointerEvents: open ? 'none' : 'auto' }}
      animate={{ opacity: open ? 0 : 1 }}
      transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1], delay: open ? 0.15 : 0 }}
    >
      <motion.div
        className="grid size-[128px] place-items-center rounded-[30px]"
        style={{ background: '#1f7a47' }}
        initial={{ scale: 0.55, opacity: 0 }}
        animate={open ? { scale: 22, opacity: 0 } : { scale: 1, opacity: 1 }}
        transition={open ? { duration: 0.9, ease: [0.7, 0, 0.84, 0] } : { type: 'spring', stiffness: 200, damping: 17 }}
      >
        <span lang="ar" className="-mt-2 text-[5.4rem] leading-none text-white">ه</span>
      </motion.div>
      <motion.p className="absolute bottom-[18vh] text-[15px] font-semibold tracking-[0.02em] text-white/70" initial={{ opacity: 0, y: 8 }} animate={{ opacity: open ? 0 : 1, y: 0 }} transition={{ delay: open ? 0 : 0.5, duration: 0.5 }}>
        Хидая
      </motion.p>
    </motion.div>
  );
}
