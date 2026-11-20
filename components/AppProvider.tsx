'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import type { CategoryId, PostLite } from '@/lib/types';
import { Loader } from './Loader';
import { Reader } from './Reader';

type Filter = CategoryId | 'all';

type Ctx = {
  ready: boolean;
  filter: Filter;
  setFilter: (f: Filter) => void;
  posts: PostLite[];
  openId: number | null;
  open: (id: number) => void;
  close: () => void;
  telegramUrl: string;
};

const AppCtx = createContext<Ctx | null>(null);

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

export function AppProvider({
  posts,
  telegramUrl,
  children,
}: {
  posts: PostLite[];
  telegramUrl: string;
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<number | null>(null);

  const open = useCallback((id: number) => setOpenId(id), []);
  const close = useCallback(() => setOpenId(null), []);

  // открыть публикацию по ссылке вида #post-4039
  useEffect(() => {
    const m = window.location.hash.match(/^#post-(\d+)$/);
    if (m) setOpenId(Number(m[1]));
  }, []);

  const value = useMemo(
    () => ({ ready, filter, setFilter, posts, openId, open, close, telegramUrl }),
    [ready, filter, posts, openId, open, close, telegramUrl],
  );

  return (
    <AppCtx.Provider value={value}>
      <MotionConfig reducedMotion="user">
        <Loader onDone={() => setReady(true)} />
        {children}
        <Reader />
      </MotionConfig>
    </AppCtx.Provider>
  );
}
