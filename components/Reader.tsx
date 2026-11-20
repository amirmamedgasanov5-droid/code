'use client';

import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { ArrowUpRight, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CATEGORY_BY_ID } from '@/lib/categories';
import type { Paragraph } from '@/lib/types';
import { useApp } from './AppProvider';
import { CAT_META } from './catMeta';

const cache = new Map<number, Paragraph[]>();
const AR = /[؀-ۿ]/g;
const isArabicLine = (s: string) => (s.match(AR) ?? []).length / Math.max(1, s.replace(/[\s\d\p{P}]/gu, '').length) > 0.5;

/** Лист в стиле iOS: выезжает снизу, закрывается свайпом вниз. */
export function Reader() {
  const { posts, openId, close } = useApp();
  const post = posts.find((p) => p.id === openId) ?? null;
  const drag = useDragControls();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const [body, setBody] = useState<Paragraph[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!openId) return;
    setFailed(false);
    const hit = cache.get(openId);
    if (hit) return setBody(hit);
    setBody(null);
    let alive = true;
    fetch(`/posts/${openId}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: { paragraphs: Paragraph[] }) => {
        cache.set(openId, j.paragraphs);
        if (alive) setBody(j.paragraphs);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [openId]);

  useEffect(() => {
    if (!post) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    closeRef.current?.focus();
    history.replaceState(null, '', `#post-${post.id}`);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key !== 'Tab' || !panelRef.current) return;
      const f = panelRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled])');
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
      if (location.hash.startsWith('#post-')) history.replaceState(null, '', location.pathname);
      returnTo.current?.focus?.();
    };
  }, [post, close]);

  return (
    <AnimatePresence>
      {post && (
        <div className="fixed inset-0 z-[90]" key="reader">
          <motion.div
            className="absolute inset-0 bg-black/45 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
            onClick={close}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reader-title"
            className="absolute inset-x-0 bottom-0 top-[max(28px,env(safe-area-inset-top))] mx-auto flex max-w-[46rem] flex-col overflow-hidden rounded-t-[34px] bg-bg shadow-[0_-20px_80px_rgb(0_0_0/0.35)] md:top-10"
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
              if (info.offset.y > 130 || info.velocity.y > 700) close();
            }}
          >
            <div className="relative shrink-0 touch-none px-5 pb-3 pt-2.5" onPointerDown={(e) => drag.start(e)}>
              <span aria-hidden className="mx-auto mb-3 block h-[5px] w-10 rounded-full bg-label3/60" />
              <div className="flex items-center justify-between gap-3">
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onPointerDown={(e) => e.stopPropagation()}
                  className="glass flex h-10 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold text-tint"
                >
                  Telegram <ArrowUpRight size={16} strokeWidth={2.4} />
                </a>
                <button
                  ref={closeRef}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={close}
                  aria-label="Закрыть"
                  className="glass grid size-10 place-items-center rounded-full"
                >
                  <X size={19} strokeWidth={2.4} />
                </button>
              </div>
            </div>

            <div className="sheet-scroll flex-1 overflow-y-auto px-6 pb-[max(3rem,env(safe-area-inset-bottom))] sm:px-10">
              <div className="flex items-center gap-2 pt-3 text-[13px] text-label2">
                <span className="size-2 rounded-full" style={{ background: CAT_META[post.category].color }} />
                <span className="font-semibold">{CATEGORY_BY_ID[post.category].name}</span>
                <span>
                  · {post.dateLabel} · {post.minutes} мин
                </span>
              </div>
              <h2 id="reader-title" className="font-display mt-3 text-[clamp(1.9rem,5vw,2.6rem)] font-bold leading-[1.06] tracking-[-0.04em]">
                {post.title}
              </h2>
              <div className="mt-7 space-y-5 text-[18px] leading-[1.62] tracking-[-0.011em]">
                {!body && !failed && (
                  <div aria-busy="true" className="space-y-3">
                    {[92, 100, 84, 96, 60].map((w, i) => (
                      <div key={i} className="h-4 animate-pulse rounded-full bg-sep" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                )}
                {failed && <p className="text-label2">Не удалось загрузить текст. Откройте публикацию в Telegram.</p>}
                {body?.map((p, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.04, 0.4), type: 'spring', stiffness: 180, damping: 24 }}
                    className={p.q ? 'rounded-[22px] bg-tint-soft p-5 font-serif text-[1.45rem] italic leading-[1.4] text-tint' : undefined}
                  >
                    {p.t.split('\n').map((line, j) =>
                      isArabicLine(line) ? (
                        <span key={j} lang="ar" dir="rtl" className="quran my-2 block text-[1.75rem]">
                          {line}
                        </span>
                      ) : (
                        <span key={j} className="block">
                          {line}
                        </span>
                      ),
                    )}
                  </motion.div>
                ))}
              </div>
              <p className="mt-10 text-[13px] text-label2">Источник: Telegram-канал @hidaya_islam1</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
