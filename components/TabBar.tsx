'use client';

import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { useApp, type Tab } from './AppProvider';
import { BookmarkIcon, BooksIcon, CalendarIcon, HouseIcon, NewsIcon } from './TabIcons';

const TABS: { id: Tab; label: string; Icon: typeof HouseIcon }[] = [
  { id: 'home', label: 'Главная', Icon: HouseIcon },
  { id: 'library', label: 'Библиотека', Icon: BooksIcon },
  { id: 'feed', label: 'Лента', Icon: NewsIcon },
  { id: 'bookmarks', label: 'Закладки', Icon: BookmarkIcon },
  { id: 'today', label: 'Сегодня', Icon: CalendarIcon },
];

/**
 * Таб-бар iOS 26 («жидкое стекло»): плавающая капсула, выбранная вкладка подсвечена
 * «линзой». Если зажать бар и вести пальцем, линза едет за пальцем и слегка увеличивается.
 * На планшете бар вертикальный и стоит сбоку.
 */
export function TabBar() {
  const { tab, go, ready, openId, bookmarks } = useApp();
  const hide = !ready || openId !== null;
  const nav = useRef<HTMLElement>(null);
  const [press, setPress] = useState<number | null>(null);
  const active = Math.max(0, TABS.findIndex((t) => t.id === (tab === 'channel' ? 'home' : tab)));
  const shown = press ?? active;

  const indexAt = (e: React.PointerEvent) => {
    const r = nav.current!.getBoundingClientRect();
    const vertical = r.height > r.width;
    const pos = vertical ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
    return Math.min(TABS.length - 1, Math.max(0, Math.floor(pos * TABS.length)));
  };

  return (
    <motion.nav
      ref={nav}
      aria-label="Основная навигация"
      className="ios-bar fixed inset-x-5 bottom-[max(10px,env(safe-area-inset-bottom))] z-50 mx-auto flex h-[64px] max-w-[24rem] touch-none select-none items-stretch rounded-full p-1 md:inset-x-auto md:bottom-auto md:left-4 md:top-1/2 md:mx-0 md:h-auto md:w-[72px] md:max-w-none md:-translate-y-1/2 md:flex-col md:py-1.5"
      initial={{ opacity: 0, scale: 0.85, y: 20 }}
      animate={hide ? { opacity: 0, scale: 0.9, y: 24 } : { opacity: 1, scale: press !== null ? 1.025 : 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      style={{ pointerEvents: hide ? 'none' : 'auto' }}
      onPointerDown={(e) => {
        setPress(indexAt(e));
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => press !== null && setPress(indexAt(e))}
      onPointerUp={(e) => {
        if (press === null) return;
        const i = indexAt(e);
        setPress(null);
        try {
          navigator.vibrate?.(6);
        } catch {}
        go(TABS[i].id);
      }}
      onPointerCancel={() => setPress(null)}
    >
      {TABS.map(({ id, label, Icon }, i) => {
        const on = shown === i;
        return (
          <button
            key={id}
            onClick={(e) => e.detail === 0 && go(id)}
            aria-current={active === i ? 'page' : undefined}
            aria-label={label}
            className={`relative z-10 flex flex-1 flex-col items-center justify-center gap-[2px] rounded-full outline-offset-[-2px] transition-colors duration-200 md:h-[60px] md:flex-none ${on ? 'text-tint' : 'text-label2'}`}
          >
            {on && (
              <motion.span
                layoutId="tab-lens"
                className="ios-lens absolute inset-0 -z-10 rounded-full"
                animate={{ scale: press !== null ? 1.1 : 1 }}
                transition={{ type: 'spring', stiffness: 460, damping: 34, mass: 0.7 }}
              />
            )}
            <span className="relative">
              <Icon filled={on} size={27} />
              {id === 'bookmarks' && bookmarks.length > 0 && (
                <span className="absolute -right-2 -top-1 grid min-w-[16px] place-items-center rounded-full bg-red px-1 text-[10px] font-bold leading-4 text-white">{bookmarks.length > 99 ? '99+' : bookmarks.length}</span>
              )}
            </span>
            <span className="text-[10px] font-medium leading-none tracking-[0.01em]">{label}</span>
          </button>
        );
      })}
    </motion.nav>
  );
}
