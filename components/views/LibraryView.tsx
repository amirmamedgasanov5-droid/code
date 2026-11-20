'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, CircleHelp, HandHeart, Layers, Newspaper, Quote, ScrollText } from 'lucide-react';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { COLLECTIONS, hadithIndex, quranIndex, quranRu, type HadithIndex, type QuranIndex } from '@/lib/client-data';
import { HADITH_NAMES, norm } from '@/lib/library-meta';
import { useApp, type Route } from '../AppProvider';
import { BookScreen, CollScreen, HadithScreen } from '../library/Hadith';
import { HisnScreen, HisnSectionScreen } from '../library/Hisn';
import { QuranScreen, SuraScreen } from '../library/Quran';
import { SourcesScreen } from '../library/Sources';
import { SearchField } from '../library/Cards';
import { PostRow } from '../PostRow';
import { Screen } from '../Screen';
import { Group, Row, fmt, plural } from '../ui';

function Tile({ Icon, color }: { Icon: typeof BookOpen; color: string }) {
  return (
    <span className="grid size-[34px] shrink-0 place-items-center rounded-[9px] text-white" style={{ background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 72%, black))` }}>
      <Icon size={19} strokeWidth={2} />
    </span>
  );
}

function Results({ q }: { q: string }) {
  const { push, posts, loadPosts } = useApp();
  const [idx, setIdx] = useState<QuranIndex | null>(null);
  const [ru, setRu] = useState<string[][] | null>(null);
  useEffect(() => {
    quranIndex().then(setIdx);
    quranRu().then(setRu);
    loadPosts();
  }, [loadPosts]);

  const s = norm(q.trim());
  const ref = q.trim().match(/^(\d{1,3})\s*[:.,]\s*(\d{1,3})$/);
  const suras = idx ? idx.suras.filter((x) => norm(`${x.tr} ${x.ru}`).includes(s) || x.ar.includes(q.trim())).slice(0, 5) : [];
  const verses: { n: number; a: number; t: string }[] = [];
  if (ru && s.length >= 3) {
    outer: for (let i = 0; i < ru.length; i++) for (let j = 0; j < ru[i].length; j++) if (norm(ru[i][j]).includes(s)) {
      verses.push({ n: i + 1, a: j + 1, t: ru[i][j] });
      if (verses.length >= 30) break outer;
    }
  }
  const ps = posts.filter((p) => norm(p.title + ' ' + p.preview).includes(s)).slice(0, 15);
  const nothing = !ref && !suras.length && !verses.length && !ps.length;

  return (
    <div className="space-y-6">
      {ref && idx && Number(ref[1]) >= 1 && Number(ref[1]) <= 114 && (
        <Group>
          <Row onClick={() => push({ k: 'sura', n: Number(ref[1]), a: Number(ref[2]) })} last>
            <p className="text-[17px] font-semibold">Перейти к аяту {ref[1]}:{ref[2]}</p>
            <p className="text-[13px] text-label2">{idx.suras[Number(ref[1]) - 1].tr}</p>
          </Row>
        </Group>
      )}
      {suras.length > 0 && (
        <Group header="Суры">
          {suras.map((x, i) => (
            <Row key={x.n} onClick={() => push({ k: 'sura', n: x.n })} last={i === suras.length - 1}>
              <p className="text-[17px] font-medium">{x.n}. {x.tr} <span className="text-label2">· {x.ru}</span></p>
            </Row>
          ))}
        </Group>
      )}
      {verses.length > 0 && (
        <Group header="Аяты Корана">
          {verses.map((v, i) => (
            <Row key={`${v.n}:${v.a}`} onClick={() => push({ k: 'sura', n: v.n, a: v.a })} last={i === verses.length - 1} className="py-3">
              <p className="text-[12px] font-semibold text-tint">{idx?.suras[v.n - 1].tr} · {v.n}:{v.a}</p>
              <p className="mt-0.5 line-clamp-3 text-[15px] leading-snug">{v.t}</p>
            </Row>
          ))}
        </Group>
      )}
      <Group header="Хадисы">
        {COLLECTIONS.map((c, i) => (
          <Row key={c} onClick={() => push({ k: 'coll', c, q: q.trim() })} last={i === COLLECTIONS.length - 1}>
            <p className="text-[16px]">Искать «{q.trim()}» в сборнике <span className="font-semibold">{HADITH_NAMES[c].ru}</span></p>
          </Row>
        ))}
      </Group>
      {ps.length > 0 && (
        <Group header="Публикации канала">
          {ps.map((p, i) => <PostRow key={p.id} post={p} last={i === ps.length - 1} />)}
        </Group>
      )}
      {nothing && !ru && <p className="px-4 text-center text-label2">Ищем…</p>}
    </div>
  );
}

function Root() {
  const { push, go, setFilter, posts, total, loadPosts } = useApp();
  const [hi, setHi] = useState<Record<string, HadithIndex>>({});
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  useEffect(() => {
    loadPosts();
    COLLECTIONS.forEach((c) => hadithIndex(c).then((i) => setHi((s) => ({ ...s, [c]: i }))));
  }, [loadPosts]);
  const hadiths = Object.values(hi).reduce((s, i) => s + i.total, 0);
  const tafsir = posts.filter((p) => p.category === 'tafsir').length;
  const searching = dq.trim().length >= 2;

  return (
    <Screen title="Библиотека" subtitle="Коран, хадисы, дуа и все публикации канала — в одном месте.">
      <div className="space-y-6">
        <SearchField id="lib-search" value={q} onChange={setQ} placeholder="Коран, хадисы, публикации · 2:255" />
        {searching ? (
          <Results q={dq} />
        ) : (
          <>
            <Group header="Коран" footer="Арабский текст и перевод Э. Кулиева. Закладки, продолжение чтения, настройка шрифта.">
              <Row onClick={() => push({ k: 'quran' })}>
                <div className="flex items-center gap-3"><Tile Icon={BookOpen} color="#2f7d5b" /><div><p className="text-[17px]">Коран</p><p className="text-[13px] text-label2">114 сур · 6 236 аятов</p></div></div>
              </Row>
              <Row onClick={() => push({ k: 'quran', juz: true })} last>
                <div className="flex items-center gap-3"><Tile Icon={Layers} color="#2b6e8f" /><div><p className="text-[17px]">Джузы</p><p className="text-[13px] text-label2">30 частей для чтения по порядку</p></div></div>
              </Row>
            </Group>

            <Group header="Хадисы">
              <Row onClick={() => push({ k: 'hadith' })} last>
                <div className="flex items-center gap-3"><Tile Icon={Quote} color="#b8893b" /><div><p className="text-[17px]">Хадисы</p><p className="text-[13px] text-label2">Бухари, Муслим, Абу Дауд{hadiths ? ` · ${fmt(hadiths)} ${plural(hadiths, 'хадис', 'хадиса', 'хадисов')}` : ''}</p></div></div>
              </Row>
            </Group>

            <Group header="Дуа">
              <Row onClick={() => push({ k: 'hisn' })} last>
                <div className="flex items-center gap-3"><Tile Icon={HandHeart} color="#6b5bb0" /><div><p className="text-[17px]">Хисн аль-Муслим</p><p className="text-[13px] text-label2">298 дуа и азкаров · арабский текст</p></div></div>
              </Row>
            </Group>

            <Group header="Из канала">
              <Row onClick={() => { setFilter('tafsir'); go('feed'); }}>
                <div className="flex items-center gap-3"><Tile Icon={ScrollText} color="#2b6e8f" /><div><p className="text-[17px]">Тафсир ас-Саади</p><p className="text-[13px] text-label2">{tafsir} {plural(tafsir, 'публикация', 'публикации', 'публикаций')} в канале</p></div></div>
              </Row>
              <Row onClick={() => { setFilter('all'); go('feed'); }} last>
                <div className="flex items-center gap-3"><Tile Icon={Newspaper} color="#c0566b" /><div><p className="text-[17px]">Все публикации</p><p className="text-[13px] text-label2">Обновляются автоматически · {fmt(Math.max(posts.length, 1))}+</p></div></div>
              </Row>
            </Group>

            <Group>
              <Row onClick={() => push({ k: 'sources' })} last>
                <div className="flex items-center gap-3"><Tile Icon={CircleHelp} color="#7a5c45" /><div><p className="text-[17px]">Источники</p><p className="text-[13px] text-label2">Откуда тексты и как им доверять</p></div></div>
              </Row>
            </Group>
          </>
        )}
      </div>
      <span className="hidden">{total}</span>
    </Screen>
  );
}

function render(r: Route | undefined) {
  if (!r) return <Root />;
  switch (r.k) {
    case 'quran':
      return <QuranScreen juz={r.juz} />;
    case 'sura':
      return <SuraScreen n={r.n} a={r.a} />;
    case 'hadith':
      return <HadithScreen />;
    case 'coll':
      return <CollScreen c={r.c} q={r.q} />;
    case 'book':
      return <BookScreen c={r.c} b={r.b} n={r.n} />;
    case 'hisn':
      return <HisnScreen />;
    case 'hisnsec':
      return <HisnSectionScreen i={r.i} />;
    case 'sources':
      return <SourcesScreen />;
  }
}

const keyOf = (r?: Route) => (r ? JSON.stringify(r) : 'root');

export function LibraryView() {
  const { stack, dir } = useApp();
  const route = stack[stack.length - 1];
  const key = keyOf(route) + stack.length;
  const saved = useRef<Record<string, number>>({});
  const cur = useRef(key);
  cur.current = key;
  useEffect(() => {
    const onScroll = () => (saved.current[cur.current] = window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="overflow-x-clip">
      <AnimatePresence mode="popLayout" custom={dir} initial={false}>
        <motion.div
          key={key}
          custom={dir}
          variants={{
            enter: (d: number) => ({ x: d > 0 ? '100%' : '-26%', opacity: d > 0 ? 1 : 0.6 }),
            center: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 34 } },
            exit: (d: number) => ({ x: d > 0 ? '-26%' : '100%', opacity: d > 0 ? 0.55 : 1, transition: { type: 'spring', stiffness: 300, damping: 34 } }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          className="bg-bg"
          onAnimationStart={(def) => {
            if (def === 'center') window.scrollTo(0, route && dir > 0 ? 0 : (saved.current[key] ?? 0));
          }}
        >
          {render(route)}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
