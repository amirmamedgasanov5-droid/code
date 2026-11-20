'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useApp, type Tab } from './AppProvider';
import { ChannelView } from './views/ChannelView';
import { FeedView } from './views/FeedView';
import { HomeView } from './views/HomeView';
import { LibraryView } from './views/LibraryView';
import { TodayView } from './views/TodayView';
import { Reader } from './Reader';
import { Splash } from './Splash';
import { TabBar } from './TabBar';

const VIEWS: Record<Tab, React.ComponentType> = {
  home: HomeView,
  library: LibraryView,
  feed: FeedView,
  today: TodayView,
  channel: ChannelView,
};

function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="blob blob-a -left-[10vw] -top-[12vh] size-[55vmax] max-h-[44rem] max-w-[44rem]" />
      <div className="blob blob-b -bottom-[16vh] -right-[12vw] size-[50vmax] max-h-[40rem] max-w-[40rem]" />
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
      <Ambient />
      <main id="main" className="md:pl-[6.5rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 28 } }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.985, transition: { duration: 0.14 } }}
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
      <Splash />
    </>
  );
}
