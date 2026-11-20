'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Paragraph } from '@/lib/types';
import { CATEGORY_BY_ID } from '@/lib/categories';
import { useApp } from './AppProvider';
import { EXPO } from './motion';

const cache = new Map<number, Paragraph[]>();
const AR = /[؀-ۿ]/g;
const isArabicLine = (s: string) => ((s.match(AR) ?? []).length / Math.max(1, s.replace(/[\s\d\p{P}]/gu, '').length)) > 0.5;

/** Читалка: полный текст публикации в боковой панели (на телефоне — на весь экран). */
export function Reader() {
  const { posts, openId, close } = useApp();
  const post = posts.find((p) => p.id === openId) ?? null;
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
      if (location.hash.startsWith('#post-')) history.replaceState(null, '', location.pathname + location.search);
      returnTo.current?.focus?.();
    };
  }, [post, close]);

  return (
    <AnimatePresence>
      {post && (
        <div className="fixed inset-0 z-[90]" key="reader">
          <motion.div
            className="absolute inset-0 bg-forest-deep/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            onClick={close}
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reader-title"
            className="sheet-scroll absolute inset-y-0 right-0 flex w-full flex-col overflow-y-auto bg-paper sm:w-[min(46rem,92vw)] sm:rounded-l-[2rem]"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.8, ease: EXPO }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-paper/90 px-6 py-4 backdrop-blur sm:px-10">
              <span className="eyebrow">{CATEGORY_BY_ID[post.category].name}</span>
              <button
                ref={closeRef}
                onClick={close}
                aria-label="Закрыть"
                className="grid size-11 place-items-center rounded-full border border-line transition-colors hover:bg-ink hover:text-ivory"
              >
                <X size={18} strokeWidth={1.6} />
              </button>
            </div>

            <article className="px-6 pb-16 pt-10 sm:px-12 sm:pt-14">
              <p className="eyebrow">
                {post.dateLabel} · {post.minutes} мин чтения
              </p>
              <h2 id="reader-title" className="font-display mt-5 text-[2.4rem] font-medium leading-[1.04] tracking-[-0.01em] sm:text-[3.1rem]">
                {post.title}
              </h2>
              <div className="mt-10 space-y-6 text-[1.0625rem] leading-[1.8] text-ink/90">
                {!body && !failed && (
                  <div aria-busy="true" aria-label="Загрузка текста" className="space-y-3">
                    {[92, 100, 84, 96, 60].map((w, i) => (
                      <div key={i} className="h-4 animate-pulse rounded bg-sand" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                )}
                {failed && <p className="text-mute">Не удалось загрузить текст. Откройте публикацию в Telegram — ссылка ниже.</p>}
                {body?.map((p, i) => (
                  <div
                    key={i}
                    className={p.q ? 'border-l border-gold pl-5 font-display text-[1.45rem] italic leading-[1.5] text-forest-deep' : undefined}
                  >
                    {p.t.split('\n').map((line, j) =>
                      isArabicLine(line) ? (
                        <span key={j} lang="ar" dir="rtl" className="quran my-3 block text-[1.7rem] text-forest-deep">
                          {line}
                        </span>
                      ) : (
                        <span key={j} className="block">
                          {line}
                        </span>
                      ),
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-14 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-line pt-8">
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3.5 text-[0.95rem] font-medium text-ivory transition-colors hover:bg-forest-deep"
                >
                  Открыть в Telegram
                  <ArrowUpRight size={17} strokeWidth={1.7} className="transition-transform duration-500 ease-expo group-hover:rotate-45" />
                </a>
                <p className="text-sm text-mute">Источник: Telegram-канал @hidaya_islam1</p>
              </div>
            </article>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
