'use client';

import { ArrowUpRight, Bookmark, Share } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { CATEGORY_BY_ID } from '@/lib/categories';
import { postBody } from '@/lib/client-data';
import type { Paragraph } from '@/lib/types';
import { useApp } from './AppProvider';
import { CAT_META } from './catMeta';
import { Sheet } from './Sheet';
import { shareText } from './ui';

const AR = /[؀-ۿ]/g;
const isArabicLine = (s: string) => (s.match(AR) ?? []).length / Math.max(1, s.replace(/[\s\d\p{P}]/gu, '').length) > 0.5;

/** Публикация канала в листе: полный текст, закладка, переход к аятам тафсира. */
export function Reader() {
  const { posts, openId, close, isMarked, toggleMark, toast, openRoute } = useApp();
  const post = posts.find((p) => p.id === openId) ?? null;
  const [body, setBody] = useState<Paragraph[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!openId) return;
    setBody(null);
    setFailed(false);
    let alive = true;
    postBody(openId)
      .then((b) => alive && setBody(b))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [openId]);

  useEffect(() => {
    if (!post) return;
    history.replaceState(null, '', `#post-${post.id}`);
    return () => {
      if (location.hash.startsWith('#post-')) history.replaceState(null, '', location.pathname);
    };
  }, [post]);

  const id = post ? `p:${post.id}` : '';
  const marked = post ? isMarked(id) : false;

  return (
    <Sheet
      open={!!post}
      onClose={close}
      labelledBy="reader-title"
      header={
        post && (
          <>
            <a href={post.url} target="_blank" rel="noopener noreferrer" className="glass flex h-10 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold text-tint">
              Telegram <ArrowUpRight size={16} strokeWidth={2.4} />
            </a>
            <button
              onClick={() => toggleMark({ id, kind: 'post', title: post.title, sub: `Публикация · ${post.dateLabel}`, post: post.id })}
              aria-label={marked ? 'Убрать из закладок' : 'В закладки'}
              aria-pressed={marked}
              className="glass grid size-10 place-items-center rounded-full text-tint"
            >
              <Bookmark size={18} strokeWidth={2.2} fill={marked ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => body && shareText(`${post.title}\n\n${body.map((p) => p.t).join('\n\n')}\n\n${post.url}`, toast)}
              aria-label="Поделиться"
              className="glass grid size-10 place-items-center rounded-full text-tint"
            >
              <Share size={18} strokeWidth={2.2} />
            </button>
          </>
        )
      }
    >
      {post && (
        <>
          <div className="flex items-center gap-2 pt-2 text-[13px] text-label2">
            <span className="size-2 rounded-full" style={{ background: CAT_META[post.category].color }} />
            <span className="font-semibold">{CATEGORY_BY_ID[post.category].name}</span>
            <span>
              · {post.dateLabel} · {post.minutes} мин
            </span>
          </div>
          <h2 id="reader-title" className="font-display mt-3 text-[clamp(1.8rem,5vw,2.5rem)] font-bold leading-[1.08] tracking-[-0.04em]">
            {post.title}
          </h2>
          {post.refs && (
            <button
              onClick={() => {
                const [n, a] = post.refs!;
                close();
                openRoute([{ k: 'quran' }, { k: 'sura', n, a }]);
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-tint-soft px-4 py-2 text-[15px] font-semibold text-tint"
            >
              Читать аят в Коране · {post.refs[0]}:{post.refs[1]}
              {post.refs[2] !== post.refs[1] ? `–${post.refs[2]}` : ''}
            </button>
          )}
          <div className="mt-6 space-y-5 text-[18px] leading-[1.6] tracking-[-0.014em]">
            {!body && !failed && (
              <div aria-busy="true" className="space-y-3">
                {[92, 100, 84, 96, 60].map((w, i) => (
                  <div key={i} className="h-4 animate-pulse rounded-full bg-fill" style={{ width: `${w}%` }} />
                ))}
              </div>
            )}
            {failed && <p className="text-label2">Не удалось загрузить текст. Откройте публикацию в Telegram.</p>}
            {body?.map((p, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.035, 0.35), type: 'spring', stiffness: 180, damping: 24 }}
                className={p.q ? 'rounded-[20px] bg-tint-soft p-5 font-serif text-[1.45rem] italic leading-[1.4] text-tint' : undefined}
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
        </>
      )}
    </Sheet>
  );
}
