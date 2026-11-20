'use client';

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useApp } from './AppProvider';
import { StarMark } from './Geometry';
import { NAV } from '@/lib/nav';
import { EXPO } from './motion';

export function Nav() {
  const { ready, telegramUrl } = useApp();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string>('');
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 24);
    setHidden(y > 160 && y > prev + 2 && !open ? true : y < prev - 2 ? false : hidden);
  });

  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    NAV.forEach((n) => {
      const el = document.getElementById(n.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onResize = () => window.innerWidth >= 1024 && setOpen(false);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  return (
    <>
      <motion.header
        className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500 ${
          scrolled && !open ? 'border-b border-line bg-ivory/80 backdrop-blur-xl' : 'border-b border-transparent'
        }`}
        initial={{ y: '-100%' }}
        animate={{ y: ready && !hidden ? 0 : '-100%' }}
        transition={{ duration: 0.8, ease: EXPO }}
      >
        <nav aria-label="Основная навигация" className="mx-auto flex h-[4.5rem] max-w-[88rem] items-center justify-between px-5 sm:px-8 lg:px-12">
          <a href="#top" className="group flex items-center gap-3" aria-label="Хидая — на главную" onClick={() => setOpen(false)}>
            <span className="transition-transform duration-[900ms] ease-expo group-hover:rotate-[135deg]">
              <StarMark size={30} />
            </span>
            <span className="font-display text-[1.65rem] font-semibold leading-none tracking-[-0.01em]">Хидая</span>
          </a>

          <ul className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <li key={n.id}>
                <a
                  href={`#${n.id}`}
                  className={`relative block rounded-full px-4 py-2 text-[0.9rem] transition-colors duration-300 ${
                    active === n.id ? 'text-ink' : 'text-mute hover:text-ink'
                  }`}
                  aria-current={active === n.id ? 'true' : undefined}
                >
                  {n.label}
                  {active === n.id && (
                    <motion.span
                      layoutId="nav-dot"
                      className="absolute inset-x-4 -bottom-0.5 h-px bg-gold"
                      transition={{ duration: 0.6, ease: EXPO }}
                    />
                  )}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group hidden items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-[0.88rem] font-medium text-ivory transition-colors duration-500 hover:bg-forest-deep sm:inline-flex"
            >
              Открыть Telegram
              <span aria-hidden className="transition-transform duration-500 ease-expo group-hover:translate-x-0.5">→</span>
            </a>
            <button
              className="relative grid size-11 place-items-center rounded-full border border-line lg:hidden"
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
              onClick={() => setOpen((v) => !v)}
            >
              <motion.span className="absolute h-px w-5 bg-ink" animate={{ y: open ? 0 : -3.5, rotate: open ? 45 : 0 }} transition={{ duration: 0.5, ease: EXPO }} />
              <motion.span className="absolute h-px w-5 bg-ink" animate={{ y: open ? 0 : 3.5, rotate: open ? -45 : 0 }} transition={{ duration: 0.5, ease: EXPO }} />
            </button>
          </div>
        </nav>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            className="fixed inset-0 z-40 flex flex-col bg-ivory px-6 pb-10 pt-28 lg:hidden"
            initial={{ clipPath: 'inset(0 0 100% 0)' }}
            animate={{ clipPath: 'inset(0 0 0% 0)' }}
            exit={{ clipPath: 'inset(0 0 100% 0)' }}
            transition={{ duration: 0.8, ease: EXPO }}
          >
            <div aria-hidden className="lattice pointer-events-none absolute inset-0 opacity-[0.06] [mask-image:linear-gradient(to_bottom,transparent,black_40%)]" />
            <ul className="relative flex flex-1 flex-col justify-center gap-1">
              {NAV.map((n, i) => (
                <li key={n.id} className="overflow-hidden">
                  <motion.a
                    href={`#${n.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-baseline gap-4 border-b border-line py-4 font-display text-[2.6rem] font-medium leading-none"
                    initial={{ y: '110%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '110%' }}
                    transition={{ duration: 0.9, delay: 0.12 + i * 0.06, ease: EXPO }}
                  >
                    <span className="eyebrow !text-gold tabular-nums">0{i + 1}</span>
                    {n.label}
                  </motion.a>
                </li>
              ))}
            </ul>
            <motion.a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-forest px-7 py-4 font-medium text-ivory"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.5, duration: 0.8, ease: EXPO }}
            >
              Присоединиться в Telegram →
            </motion.a>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
