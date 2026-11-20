'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useApp, type Tab } from './AppProvider';
import { Reader } from './Reader';
import { Splash } from './Splash';
import { TabBar } from './TabBar';
import { BookmarksView } from './views/BookmarksView';
import { ChannelView } from './views/ChannelView';
import { FeedView } from './views/FeedView';
import { HomeView } from './views/HomeView';
import { LibraryView } from './views/LibraryView';
import { TodayView } from './views/TodayView';

const VIEWS: Record<Tab, React.ComponentType> = {
  home: HomeView,
  library: LibraryView,
  feed: FeedView,
  bookmarks: BookmarksView,
  today: TodayView,
  channel: ChannelView,
};

function Toast() {
  const { toastMsg } = useApp();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(14px,env(safe-area-inset-top))] z-[120] flex justify-center">
      <AnimatePresence>
        {toastMsg && (
          <motion.div key={toastMsg} initial={{ opacity: 0, y: -24, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16, scale: 0.95 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }} role="status" className="glass rounded-full px-5 py-2.5 text-[15px] font-semibold">
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Shell() {
  const { tab } = useApp();
  const reduce = useReducedMotion();
  const saved = useRef<Partial<Record<Tab, number>>>({});
  const current = useRef<Tab>(tab);
  current.current = tab;

  useEffect(() => {
    const onScroll = () => {
      saved.current[current.current] = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const View = VIEWS[tab];
  return (
    <>
      <main id="main" className="md:pl-[6.5rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.988 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 28 } }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.988, transition: { duration: 0.13 } }}
            onAnimationStart={(def) => {
              if (typeof def === 'object' && 'y' in def && def.y === 0) window.scrollTo(0, saved.current[tab] ?? 0);
            }}
          >
            <View />
          </motion.div>
        </AnimatePresence>
      </main>
      <TabBar />
      <Reader />
      <Toast />
      <Splash />
    </>
  );
}
