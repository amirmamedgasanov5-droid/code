'use client';

import { motion } from 'framer-motion';
import { BookOpen, House, Newspaper, Send, Sun } from 'lucide-react';
import { useApp, type Tab } from './AppProvider';
import { SPRING } from './ui';

const TABS: { id: Tab; label: string; Icon: typeof House }[] = [
  { id: 'home', label: 'Главная', Icon: House },
  { id: 'library', label: 'Знания', Icon: BookOpen },
  { id: 'feed', label: 'Лента', Icon: Newspaper },
  { id: 'today', label: 'Сегодня', Icon: Sun },
  { id: 'channel', label: 'Канал', Icon: Send },
];

/**
 * Летающий стеклянный таб-бар. На телефоне — плавающая капсула снизу,
 * на планшете и шире — вертикальная капсула сбоку, как на iPad.
 */
export function TabBar() {
  const { tab, go, ready, openId } = useApp();
  const hide = !ready || openId !== null;
  return (
    <motion.nav
      aria-label="Основная навигация"
      className="glass fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-50 mx-auto flex h-[68px] max-w-[26rem] items-stretch rounded-[34px] p-1.5 md:inset-x-auto md:bottom-auto md:left-4 md:top-1/2 md:mx-0 md:h-auto md:w-[78px] md:max-w-none md:-translate-y-1/2 md:flex-col md:rounded-[39px] md:p-2 md:py-2.5"
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
            className={`relative z-10 flex flex-1 flex-col items-center justify-center gap-[3px] rounded-[28px] outline-offset-[-2px] transition-colors duration-300 md:h-[62px] md:flex-none ${on ? 'text-tint' : 'text-label2'}`}
          >
            {on && (
              <motion.span
                layoutId="tab-lens"
                className="glass-lens absolute inset-0 -z-10 rounded-[28px]"
                transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.8 }}
              />
            )}
            <motion.span animate={{ y: on ? -1 : 0, scale: on ? 1.12 : 1 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }}>
              <Icon size={24} strokeWidth={on ? 2.3 : 1.9} />
            </motion.span>
            <span className="text-[10.5px] font-semibold leading-none tracking-[0.005em]">{label}</span>
          </motion.button>
        );
      })}
    </motion.nav>
  );
}
