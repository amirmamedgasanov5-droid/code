'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { ChevronLeft, Send } from 'lucide-react';
import { useApp } from './AppProvider';
import { SPRING } from './ui';

/**
 * Экран в духе iOS: большой заголовок, который по мере прокрутки
 * сжимается в стеклянную панель навигации.
 */
export function Screen({
  title,
  subtitle,
  back,
  hero,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: { label: string; onClick: () => void };
  hero?: boolean;
  children: React.ReactNode;
}) {
  const { telegramUrl } = useApp();
  const { scrollY } = useScroll();
  const bar = useTransform(scrollY, [30, 84], [0, 1]);
  const big = useTransform(scrollY, [0, 80], [1, 0]);
  const bigY = useTransform(scrollY, [0, 80], [0, -10]);

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 md:pl-[6.5rem]">
        <motion.div style={{ opacity: bar }} className="glass absolute inset-x-0 top-0 h-[calc(env(safe-area-inset-top)+3.4rem)] rounded-none shadow-none before:hidden" />
        <div className="relative mx-auto flex h-[calc(env(safe-area-inset-top)+3.4rem)] max-w-[68rem] items-end justify-between px-4 pb-2">
          {back ? (
            <motion.button
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={back.onClick}
              whileTap={{ scale: 0.92 }}
              transition={SPRING}
              className="glass pointer-events-auto flex h-10 items-center gap-0.5 rounded-full pl-2 pr-4 text-[16px] font-medium text-tint"
            >
              <ChevronLeft size={22} strokeWidth={2.4} /> {back.label}
            </motion.button>
          ) : (
            <span />
          )}
          <motion.span style={{ opacity: bar }} className="absolute inset-x-0 bottom-3 text-center text-[17px] font-semibold">
            {title}
          </motion.span>
          <motion.a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Открыть канал в Telegram"
            whileTap={{ scale: 0.88 }}
            whileHover={{ scale: 1.06 }}
            transition={SPRING}
            className="glass pointer-events-auto grid size-10 place-items-center rounded-full text-tint"
          >
            <Send size={18} strokeWidth={2.1} />
          </motion.a>
        </div>
      </header>

      <div className="mx-auto max-w-[68rem] px-4 pb-44 pt-[calc(env(safe-area-inset-top)+4.6rem)] md:px-6 md:pb-24">
        {!hero && (
          <motion.div style={{ opacity: big, y: bigY }} className="mb-5 px-1">
            <h1 className="font-display text-[clamp(2.2rem,6vw,3.4rem)] font-bold leading-[1.05] tracking-[-0.035em]">{title}</h1>
            {subtitle && <p className="mt-1.5 max-w-xl text-[17px] leading-snug text-label2">{subtitle}</p>}
          </motion.div>
        )}
        {children}
      </div>
    </>
  );
}
