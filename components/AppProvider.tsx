'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import type { Qr } from './QrCode';
import type { CategoryId, FeaturedItem, PostLite } from '@/lib/types';

export type Tab = 'home' | 'library' | 'feed' | 'today' | 'channel';
export const TAB_IDS: Tab[] = ['home', 'library', 'feed', 'today', 'channel'];

export type AppData = {
  posts: PostLite[];
  featured: FeaturedItem[];
  items: { id: CategoryId; count: number; latest: PostLite | null }[];
  stats: { label: string; value: number; suffix?: string }[];
  telegramUrl: string;
  qr: Qr;
  updated: string;
  fridayPostId?: number;
};

type Ctx = AppData & {
  tab: Tab;
  go: (t: Tab) => void;
  ready: boolean;
  setReady: (v: boolean) => void;
  filter: CategoryId | 'all';
  setFilter: (f: CategoryId | 'all') => void;
  openId: number | null;
  open: (id: number) => void;
  close: () => void;
};

const AppCtx = createContext<Ctx | null>(null);
export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

export function AppProvider({ data, children }: { data: AppData; children: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>('home');
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<CategoryId | 'all'>('all');
  const [openId, setOpenId] = useState<number | null>(null);

  const go = useCallback((t: Tab) => {
    setTab(t);
    history.replaceState(null, '', t === 'home' ? location.pathname : `#${t}`);
  }, []);

  useEffect(() => {
    const h = location.hash.slice(1);
    const m = h.match(/^post-(\d+)$/);
    if (m) setOpenId(Number(m[1]));
    else if ((TAB_IDS as string[]).includes(h)) setTab(h as Tab);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      ...data,
      tab,
      go,
      ready,
      setReady,
      filter,
      setFilter,
      openId,
      open: (id) => setOpenId(id),
      close: () => setOpenId(null),
    }),
    [data, tab, go, ready, filter, openId],
  );

  return (
    <AppCtx.Provider value={value}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </AppCtx.Provider>
  );
}
