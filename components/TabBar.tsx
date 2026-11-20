'use client';

import { motion } from 'framer-motion';
import { Bookmark, BookOpen, CalendarDays, House, Newspaper } from 'lucide-react';
import { useApp, type Tab } from './AppProvider';
import { SPRING } from './ui';

const TABS: { id: Tab; label: string; Icon: typeof House }[] = [
  { id: 'home', label: 'Главная', Icon: House },
  { id: 'library', label: 'Библиотека', Icon: BookOpen },
  { id: 'feed', label: 'Лента', Icon: Newspaper },
  { id: 'bookmarks', label: 'Закладки', Icon: Bookmark },
  { id: 'today', label: 'Сегодня', Icon: CalendarDays },
];

/** Плавающий стеклянный таб-бар: снизу на телефоне, сбоку на планшете (как на iPad). */
export function TabBar() {
  const { tab, go, ready, openId, bookmarks } = useApp();
  const hide = !ready || openId !== null;
  return (
    <motion.nav
      aria-label="Основная навигация"
      className="glass fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-50 mx-auto flex h-[66px] max-w-[27rem] items-stretch rounded-[33px] p-1.5 md:inset-x-auto md:bottom-auto md:left-4 md:top-1/2 md:mx-0 md:h-auto md:w-[78px] md:max-w-none md:-translate-y-1/2 md:flex-col md:rounded-[39px] md:p-2 md:py-2.5"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={hide ? { opacity: 0, scale: 0.88, y: 30 } : { opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 22 }}
      style={{ pointerEvents: hide ? 'none' : 'auto' }}
    >
      {TABS.map(({ id, label, Icon }) => {
        const on = tab === id;
        return (
          <motion.button
            key={id}
            onClick={() => go(id)}
            aria-current={on ? 'page' : undefined}
            aria-label={label}
            whileTap={{ scale: 0.88 }}
            transition={SPRING}
            className={`relative z-10 flex flex-1 flex-col items-center justify-center gap-[3px] rounded-[27px] outline-offset-[-2px] transition-colors duration-300 md:h-[62px] md:flex-none ${on ? 'text-tint' : 'text-label2'}`}
          >
            {on && <motion.span layoutId="tab-lens" className="glass-lens absolute inset-0 -z-10 rounded-[27px]" transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.8 }} />}
            <motion.span className="relative" animate={{ y: on ? -1 : 0, scale: on ? 1.1 : 1 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }}>
              <Icon size={23} strokeWidth={on ? 2.3 : 1.9} fill={on && id === 'bookmarks' ? 'currentColor' : 'none'} />
              {id === 'bookmarks' && bookmarks.length > 0 && <span className="absolute -right-2 -top-1.5 grid min-w-[16px] place-items-center rounded-full bg-red px-1 text-[10px] font-bold leading-4 text-white">{bookmarks.length > 99 ? '99+' : bookmarks.length}</span>}
            </motion.span>
            <span className="text-[10px] font-semibold leading-none">{label}</span>
          </motion.button>
        );
      })}
    </motion.nav>
  );
}
