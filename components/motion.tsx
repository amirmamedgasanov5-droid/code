'use client';

import { motion, useMotionValue, useSpring, type Variants } from 'framer-motion';
import { useRef } from 'react';
import { useApp } from './AppProvider';

export const EXPO = [0.16, 1, 0.3, 1] as const;

export function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
  as = 'div',
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: 'div' | 'li' | 'p' | 'article' | 'span';
}) {
  const Tag = motion[as] as typeof motion.div;
  return (
    <Tag
      data-reveal
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 1, delay, ease: EXPO }}
    >
      {children}
    </Tag>
  );
}

/**
 * Заголовок, который поднимается из-под маски построчно.
 * on="ready" — после загрузочного экрана (hero); on="view" — при появлении в окне.
 */
export function Lines({
  lines,
  as: Tag = 'h2',
  className,
  on = 'view',
  delay = 0,
}: {
  lines: React.ReactNode[];
  as?: 'h1' | 'h2' | 'h3' | 'p';
  className?: string;
  on?: 'ready' | 'view';
  delay?: number;
}) {
  const { ready } = useApp();
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.11, delayChildren: delay } },
  };
  const line: Variants = {
    hidden: { y: '108%' },
    show: { y: '0%', transition: { duration: 1.15, ease: EXPO } },
  };
  const M = motion[Tag] as typeof motion.h2;
  const mode =
    on === 'ready'
      ? { initial: 'hidden', animate: ready ? 'show' : 'hidden' }
      : { initial: 'hidden', whileInView: 'show', viewport: { once: true, margin: '0px 0px -12% 0px' } };
  return (
    <M data-reveal-lines className={className} variants={container} {...mode}>
      {lines.map((l, i) => (
        <span key={i} className="block overflow-hidden pb-[0.12em] -mb-[0.12em]">
          <motion.span className="block will-change-transform" variants={line}>
            {l}
          </motion.span>
        </span>
      ))}
    </M>
  );
}

/** Лёгкое «магнитное» смещение для главных кнопок (только курсор мыши). */
export function Magnetic({ children, strength = 0.22 }: { children: React.ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.4 });
  return (
    <motion.div
      ref={ref}
      style={{ x, y, display: 'inline-block' }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
