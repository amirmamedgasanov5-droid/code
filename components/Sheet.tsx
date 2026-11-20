'use client';

import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

/** Нижний лист iOS: пружинный выезд, свайп вниз закрывает, Esc и тап по фону тоже. */
export function Sheet({
  open,
  onClose,
  children,
  header,
  labelledBy,
  size = 'large',
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  header?: React.ReactNode;
  labelledBy?: string;
  size?: 'large' | 'medium';
}) {
  const drag = useDragControls();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !panel.current) return;
      const f = panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,[tabindex="0"]');
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      html.style.overflow = prev;
      returnTo.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90]">
          <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} onClick={onClose} />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            className={`absolute inset-x-0 bottom-0 mx-auto flex max-w-[46rem] flex-col overflow-hidden rounded-t-[34px] bg-bg shadow-[0_-20px_80px_rgb(0_0_0/0.35)] ${size === 'large' ? 'top-[max(28px,env(safe-area-inset-top))] md:top-10' : 'max-h-[80dvh] md:bottom-10 md:rounded-b-[34px]'}`}
            initial={{ y: '102%' }}
            animate={{ y: 0 }}
            exit={{ y: '102%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 32 }}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.02, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 130 || info.velocity.y > 700) onClose();
            }}
          >
            <div className="relative shrink-0 touch-none px-5 pb-3 pt-2.5" onPointerDown={(e) => drag.start(e)}>
              <span aria-hidden className="mx-auto mb-3 block h-[5px] w-10 rounded-full bg-label3" />
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
                  {header}
                </div>
                <button ref={closeRef} onPointerDown={(e) => e.stopPropagation()} onClick={onClose} aria-label="Закрыть" className="glass grid size-10 shrink-0 place-items-center rounded-full">
                  <X size={19} strokeWidth={2.4} />
                </button>
              </div>
            </div>
            <div className="sheet-scroll flex-1 overflow-y-auto px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-8">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
