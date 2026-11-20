'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { postsIndex } from '@/lib/client-data';
import { useStored } from '@/lib/hooks';
import type { Qr } from './QrCode';
import type { CategoryId, FeaturedItem, PostLite } from '@/lib/types';

export type Tab = 'home' | 'library' | 'feed' | 'bookmarks' | 'today' | 'channel';
export const TAB_IDS: Tab[] = ['home', 'library', 'feed', 'bookmarks', 'today', 'channel'];

/** Маршруты внутри «Библиотеки» (стек как в UINavigationController) */
export type Route =
  | { k: 'quran'; juz?: boolean }
  | { k: 'sura'; n: number; a?: number }
  | { k: 'hadith' }
  | { k: 'coll'; c: string; q?: string }
  | { k: 'book'; c: string; b: number; n?: number }
  | { k: 'hisn' }
  | { k: 'hisnsec'; i: number }
  | { k: 'names' }
  | { k: 'name'; i: number }
  | { k: 'indexes' }
  | { k: 'index'; kind: IndexKind }
  | { k: 'quizzes' }
  | { k: 'quiz'; mode: string }
  | { k: 'books' }
  | { k: 'tafsirs' }
  | { k: 'tafsir'; id: string; q?: string }
  | { k: 'tafsirsura'; id: string; n: number; a?: number }
  | { k: 'sources' };

export type IndexKind = 'alpha' | 'place' | 'length' | 'page' | 'hizb' | 'manzil' | 'sajda';
export type BKind = 'quran' | 'hadith' | 'dua' | 'name' | 'post';
export type Bookmark = { id: string; kind: BKind; title: string; sub?: string; route?: Route[]; post?: number; ts: number };
export type Settings = { arSize: number; translation: boolean; translit: boolean; hadithAr: boolean; translationId: string; tafsirId: string };
export type LastRead = { n: number; a: number; ts: number } | null;

export type AppData = {
  posts: PostLite[];
  total: number;
  featured: FeaturedItem[];
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
  // библиотека
  stack: Route[];
  dir: 1 | -1;
  push: (r: Route) => void;
  pop: () => void;
  openRoute: (s: Route[]) => void;
  allPosts: boolean;
  loadPosts: () => void;
  // закладки и настройки
  bookmarks: Bookmark[];
  isMarked: (id: string) => boolean;
  toggleMark: (b: Omit<Bookmark, 'ts'>) => void;
  removeMark: (id: string) => void;
  settings: Settings;
  setSettings: (s: Partial<Settings>) => void;
  lastRead: LastRead;
  setLastRead: (n: number, a: number) => void;
  toast: (msg: string) => void;
  toastMsg: string | null;
};

const AppCtx = createContext<Ctx | null>(null);
export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

const DEFAULTS: Settings = { arSize: 1.7, translation: true, translit: false, hadithAr: true, translationId: 'kuliev', tafsirId: 'saadi' };

export function AppProvider({ data, children }: { data: AppData; children: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>('home');
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<CategoryId | 'all'>('all');
  const [openId, setOpenId] = useState<number | null>(null);
  const [stack, setStack] = useState<Route[]>([]);
  const [dir, setDir] = useState<1 | -1>(1);
  const [posts, setPosts] = useState<PostLite[]>(data.posts);
  const [allPosts, setAll] = useState(false);
  const [bookmarks, setBookmarks] = useStored<Bookmark[]>('hidaya-bookmarks', []);
  const [settings, setSettingsRaw] = useStored<Settings>('hidaya-settings', DEFAULTS);
  const [lastRead, setLastReadRaw] = useStored<LastRead>('hidaya-lastread', null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout>>(undefined);

  const go = useCallback((t: Tab) => {
    setTab(t);
    history.replaceState(null, '', t === 'home' ? location.pathname : `#${t}`);
  }, []);

  const loading = useRef(false);
  const loadPosts = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    postsIndex()
      .then((all) => {
        setPosts(all);
        setAll(true);
      })
      .catch(() => (loading.current = false));
  }, []);

  useEffect(() => {
    const h = location.hash.slice(1);
    const m = h.match(/^post-(\d+)$/);
    if (m) setOpenId(Number(m[1]));
    else if ((TAB_IDS as string[]).includes(h)) setTab(h as Tab);
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToastMsg(null), 1800);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      ...data,
      posts,
      tab,
      go,
      ready,
      setReady,
      filter,
      setFilter,
      openId,
      open: (id) => setOpenId(id),
      close: () => setOpenId(null),
      stack,
      dir,
      push: (r) => {
        setDir(1);
        setStack((s) => [...s, r]);
      },
      pop: () => {
        setDir(-1);
        setStack((s) => s.slice(0, -1));
      },
      openRoute: (s) => {
        setDir(1);
        setStack(s);
        setTab('library');
        history.replaceState(null, '', '#library');
      },
      allPosts,
      loadPosts,
      bookmarks,
      isMarked: (id) => bookmarks.some((b) => b.id === id),
      toggleMark: (b) => {
        if (bookmarks.some((x) => x.id === b.id)) {
          setBookmarks(bookmarks.filter((x) => x.id !== b.id));
          toast('Убрано из закладок');
        } else {
          setBookmarks([{ ...b, ts: Date.now() }, ...bookmarks]);
          toast('Добавлено в закладки');
        }
        try {
          navigator.vibrate?.(8);
        } catch {}
      },
      removeMark: (id) => setBookmarks(bookmarks.filter((x) => x.id !== id)),
      settings,
      setSettings: (s) => setSettingsRaw({ ...settings, ...s }),
      lastRead,
      setLastRead: (n, a) => setLastReadRaw({ n, a, ts: Date.now() }),
      toast,
      toastMsg,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, posts, tab, go, ready, filter, openId, stack, dir, allPosts, loadPosts, bookmarks, settings, lastRead, toastMsg, toast],
  );

  return (
    <AppCtx.Provider value={value}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </AppCtx.Provider>
  );
}
