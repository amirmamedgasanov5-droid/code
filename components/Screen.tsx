'use client';

import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion';
import { ChevronLeft, Send } from 'lucide-react';
import { useRef } from 'react';
import { useApp } from './AppProvider';
import { SPRING } from './ui';

/**
 * Экран как UIViewController: большой заголовок сжимается в стеклянную панель навигации,
 * кнопка «Назад» с названием предыдущего экрана и свайп от левого края.
 */
export function Screen({
  title,
  subtitle,
  back,
  trailing,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: { label: string; onClick: () => void };
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { telegramUrl } = useApp();
  const { scrollY } = useScroll();
  const bar = useTransform(scrollY, [24, 70], [0, 1]);
  const big = useTransform(scrollY, [0, 70], [1, 0]);
  const bigY = useTransform(scrollY, [0, 70], [0, -8]);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 md:pl-[6.5rem]">
        <motion.div style={{ opacity: bar }} className="glass absolute inset-x-0 top-0 h-[calc(env(safe-area-inset-top)+3.3rem)] rounded-none shadow-none before:hidden" />
        <div className="relative mx-auto flex h-[calc(env(safe-area-inset-top)+3.3rem)] max-w-[68rem] items-end justify-between px-4 pb-1.5">
          {back ? (
            <motion.button initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} onClick={back.onClick} whileTap={{ scale: 0.94 }} transition={SPRING} className="pointer-events-auto -ml-1 flex h-10 max-w-[45%] items-center gap-0.5 rounded-full pr-3 text-[17px] text-tint">
              <ChevronLeft size={26} strokeWidth={2.5} className="shrink-0" />
              <span className="truncate">{back.label}</span>
            </motion.button>
          ) : (
            <span />
          )}
          <motion.span style={{ opacity: bar }} className="pointer-events-none absolute inset-x-16 bottom-3 truncate text-center text-[17px] font-semibold">
            {title}
          </motion.span>
          <div className="pointer-events-auto flex items-center gap-2">
            {trailing ??
              (!back && (
                <motion.a href={telegramUrl} target="_blank" rel="noopener noreferrer" aria-label="Открыть канал в Telegram" whileTap={{ scale: 0.88 }} transition={SPRING} className="glass grid size-10 place-items-center rounded-full text-tint">
                  <Send size={18} strokeWidth={2.1} />
                </motion.a>
              ))}
          </div>
        </div>
      </header>

      {back && (
        <div
          aria-hidden
          className="fixed bottom-0 left-0 top-0 z-30 w-5 touch-pan-y md:hidden"
          onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
          onPointerMove={(e) => {
            const s = swipe.current;
            if (s && e.clientX - s.x > 64 && Math.abs(e.clientY - s.y) < 48) {
              swipe.current = null;
              back.onClick();
            }
          }}
          onPointerUp={() => (swipe.current = null)}
        />
      )}

      <div className="mx-auto max-w-[68rem] px-4 pb-44 pt-[calc(env(safe-area-inset-top)+4.4rem)] md:px-6 md:pb-24">
        <motion.div style={{ opacity: big, y: bigY }} className="mb-4 px-1">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.h1 key={title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="font-display text-[clamp(2rem,6vw,3.2rem)] font-bold leading-[1.08] tracking-[-0.04em]">
              {title}
            </motion.h1>
          </AnimatePresence>
          {subtitle && <p className="mt-1 max-w-xl text-[16px] leading-snug text-label2">{subtitle}</p>}
        </motion.div>
        {children}
      </div>
    </>
  );
}
