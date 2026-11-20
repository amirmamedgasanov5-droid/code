'use client';

import { motion, type Variants } from 'framer-motion';
import { ChevronRight } from 'lucide-react';

export const SPRING = { type: 'spring', stiffness: 380, damping: 32, mass: 0.9 } as const;
export const SOFT = { type: 'spring', stiffness: 170, damping: 24, mass: 1 } as const;
export const EASE = [0.32, 0.72, 0, 1] as const; // iOS-кривая

export const stagger = (s = 0.06, d = 0): Variants => ({ hidden: {}, show: { transition: { staggerChildren: s, delayChildren: d } } });
export const rise: Variants = {
  hidden: { opacity: 0, y: 26, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 220, damping: 24, mass: 0.9 } },
};

/** Сгруппированный список в стиле iOS Settings */
export function Group({ children, header, footer, className = '' }: { children: React.ReactNode; header?: string; footer?: string; className?: string }) {
  return (
    <section className={className}>
      {header && <h2 className="mb-2 px-4 text-[13px] font-medium uppercase tracking-[0.04em] text-label2">{header}</h2>}
      <div className="overflow-hidden rounded-[26px] bg-surface">{children}</div>
      {footer && <p className="mt-2 px-4 text-[13px] leading-snug text-label2">{footer}</p>}
    </section>
  );
}

/** Строка списка с нажатием «как в iOS»: подсветка и лёгкое сжатие */
export function Row({
  children,
  onClick,
  href,
  chevron = true,
  last,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  chevron?: boolean;
  last?: boolean;
  className?: string;
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">{children}</div>
      {chevron && <ChevronRight size={18} strokeWidth={2.2} className="shrink-0 text-label3" />}
      {!last && <span aria-hidden className="absolute bottom-0 left-4 right-0 h-px bg-sep" />}
    </>
  );
  const cls = `relative flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 active:bg-tint-soft ${className}`;
  if (href)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    );
  return (
    <motion.button whileTap={{ scale: 0.985 }} transition={SPRING} onClick={onClick} className={cls}>
      {inner}
    </motion.button>
  );
}

export function Pill({ children, tone = 'tint' }: { children: React.ReactNode; tone?: 'tint' | 'plain' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none ${tone === 'tint' ? 'bg-tint-soft text-tint' : 'bg-sep text-label2'}`}>
      {children}
    </span>
  );
}

/** Основная кнопка: заливка тоном, пружинное нажатие */
export function Button({
  children,
  href,
  onClick,
  variant = 'filled',
  external,
  className = '',
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: 'filled' | 'glass';
  external?: boolean;
  className?: string;
}) {
  const cls = `inline-flex h-[52px] items-center justify-center gap-2 rounded-full px-7 text-[17px] font-semibold ${
    variant === 'filled' ? 'bg-tint text-tint-ink shadow-[0_10px_24px_-10px_var(--tint)]' : 'glass text-label'
  } ${className}`;
  const p = { whileTap: { scale: 0.94 }, whileHover: { scale: 1.03 }, transition: SPRING };
  if (href)
    return (
      <motion.a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className={cls} {...p}>
        {children}
      </motion.a>
    );
  return (
    <motion.button onClick={onClick} className={cls} {...p}>
      {children}
    </motion.button>
  );
}

export const plural = (n: number) => {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return 'публикация';
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'публикации';
  return 'публикаций';
};
