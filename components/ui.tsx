'use client';

import { motion, useMotionValue, useTransform, type Variants } from 'framer-motion';
import { ChevronRight, Trash2 } from 'lucide-react';
import { useId } from 'react';

export const SPRING = { type: 'spring', stiffness: 380, damping: 32, mass: 0.9 } as const;

export const stagger = (s = 0.06, d = 0): Variants => ({ hidden: {}, show: { transition: { staggerChildren: s, delayChildren: d } } });
export const rise: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 220, damping: 24, mass: 0.9 } },
};

/** Сгруппированный список (inset grouped) */
export function Group({ children, header, footer, className = '' }: { children: React.ReactNode; header?: string; footer?: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      {header && <h2 className="mb-1.5 px-4 text-[13px] uppercase tracking-[-0.01em] text-label2">{header}</h2>}
      <div className="overflow-hidden rounded-[16px] bg-surface">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[13px] leading-snug text-label2">{footer}</p>}
    </section>
  );
}

/** Строка списка: подсветка при нажатии, шеврон, разделитель */
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
      {chevron && <ChevronRight size={17} strokeWidth={2.4} className="shrink-0 text-label3" />}
      {!last && <span aria-hidden className="absolute bottom-0 left-4 right-0 h-px bg-sep" />}
    </>
  );
  const cls = `relative flex w-full items-center gap-3 px-4 py-[11px] text-left transition-colors duration-100 active:bg-fill ${className}`;
  if (href)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    );
  if (!onClick) return <div className={cls}>{inner}</div>;
  return (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

export function Pill({ children, tone = 'tint' }: { children: React.ReactNode; tone?: 'tint' | 'plain' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none ${tone === 'tint' ? 'bg-tint-soft text-tint' : 'bg-fill text-label2'}`}>
      {children}
    </span>
  );
}

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
  const cls = `inline-flex h-[50px] items-center justify-center gap-2 rounded-full px-7 text-[17px] font-semibold ${
    variant === 'filled' ? 'bg-tint text-tint-ink' : 'bg-surface text-tint'
  } ${className}`;
  const p = { whileTap: { scale: 0.95 }, transition: SPRING };
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

/** Сегментированный контрол с «ползунком» как в iOS */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className = '',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  const id = useId();
  return (
    <div role="tablist" className={`flex rounded-[10px] bg-fill p-[2px] ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} role="tab" aria-selected={on} onClick={() => onChange(o.value)} className="relative flex-1 rounded-[8px] px-3 py-[6px] text-[13px] font-semibold">
            {on && <motion.span layoutId={id} className="absolute inset-0 rounded-[8px] bg-surface shadow-[0_3px_8px_rgb(0_0_0/0.12),0_1px_1px_rgb(0_0_0/0.1)]" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Переключатель в стиле iOS */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-300 ${checked ? 'bg-tint' : 'bg-fill'}`}>
      <motion.span
        className="absolute left-[2px] top-[2px] size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_1px_1px_rgb(0_0_0/0.16)]"
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 600, damping: 32 }}
      />
    </button>
  );
}

/** Строка со свайпом влево для удаления (как в Почте) */
export function SwipeRow({ children, onDelete, last }: { children: React.ReactNode; onDelete: () => void; last?: boolean }) {
  const x = useMotionValue(0);
  const w = useTransform(x, [-120, 0], [120, 0]);
  return (
    <div className="relative overflow-hidden">
      <motion.button style={{ width: w }} onClick={onDelete} aria-label="Удалить" className="absolute inset-y-0 right-0 grid place-items-center bg-red text-white">
        <Trash2 size={20} />
      </motion.button>
      <motion.div
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -120, right: 0 }}
        dragElastic={{ left: 0.2, right: 0 }}
        onDragEnd={(_, i) => {
          if (i.offset.x < -190 || i.velocity.x < -900) onDelete();
        }}
        className="relative bg-surface"
      >
        {children}
        {!last && <span aria-hidden className="absolute bottom-0 left-4 right-0 h-px bg-sep" />}
      </motion.div>
    </div>
  );
}

export const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
};
export const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/ /g, ' ');

export async function shareText(text: string, toast: (m: string) => void) {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Скопировано');
  } catch {
    toast('Не удалось скопировать');
  }
}
