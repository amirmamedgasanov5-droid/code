'use client';

import { Bookmark as BookmarkIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp, type BKind } from '../AppProvider';
import { SearchField } from '../library/Cards';
import { Screen } from '../Screen';
import { Group, Row, Segmented, SwipeRow } from '../ui';
import { norm } from '@/lib/library-meta';

const KINDS: { value: BKind | 'all'; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'quran', label: 'Коран' },
  { value: 'hadith', label: 'Хадисы' },
  { value: 'dua', label: 'Азкары' },
  { value: 'post', label: 'Лента' },
];
const ICON_LABEL: Record<BKind, string> = { quran: 'Коран', hadith: 'Хадис', dua: 'Азкар', name: 'Имя Аллаха', post: 'Публикация' };

export function BookmarksView() {
  const { bookmarks, removeMark, openRoute, open, lastRead, go } = useApp();
  const [kind, setKind] = useState<BKind | 'all'>('all');
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = norm(q.trim());
    return bookmarks.filter((b) => (kind === 'all' || b.kind === kind || (kind === 'dua' && b.kind === 'name')) && (!s || norm(`${b.title} ${b.sub ?? ''}`).includes(s)));
  }, [bookmarks, kind, q]);

  return (
    <Screen title="Закладки" subtitle={bookmarks.length ? `${bookmarks.length} сохранено на этом устройстве. Свайп влево — удалить.` : 'Сохраняйте аяты, хадисы, дуа и публикации.'}>
      <div className="space-y-4">
        {lastRead && (
          <Group header="Продолжить чтение">
            <Row onClick={() => openRoute([{ k: 'quran' }, { k: 'sura', n: lastRead.n, a: lastRead.a }])} last>
              <p className="text-[17px] font-medium">Коран · сура {lastRead.n}, аят {lastRead.a}</p>
              <p className="text-[13px] text-label2">{new Date(lastRead.ts).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}</p>
            </Row>
          </Group>
        )}
        {bookmarks.length > 0 && (
          <>
            <SearchField id="bm-search" value={q} onChange={setQ} placeholder="Поиск по закладкам" />
            <Segmented value={kind} onChange={setKind} options={KINDS} />
          </>
        )}
        {list.length ? (
          <Group>
            {list.map((b, i) => (
              <SwipeRow key={b.id} onDelete={() => removeMark(b.id)} last={i === list.length - 1}>
                <Row
                  chevron={false}
                  onClick={() => (b.post ? open(b.post) : b.route && openRoute(b.route))}
                  className="py-3"
                >
                  <p className="text-[12px] font-semibold uppercase tracking-[0.03em] text-tint">{ICON_LABEL[b.kind]}</p>
                  <p className="mt-0.5 text-[17px] font-medium leading-snug">{b.title}</p>
                  {b.sub && <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug text-label2">{b.sub}</p>}
                </Row>
              </SwipeRow>
            ))}
          </Group>
        ) : (
          <div className="grid place-items-center px-6 py-16 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-tint-soft text-tint"><BookmarkIcon size={28} strokeWidth={1.8} /></span>
            <p className="mt-4 text-[20px] font-bold tracking-[-0.03em]">{bookmarks.length ? 'Ничего не найдено' : 'Пока пусто'}</p>
            <p className="mt-1 max-w-xs text-[15px] text-label2">{bookmarks.length ? 'Измените запрос или раздел.' : 'Нажмите на закладку рядом с аятом, хадисом, дуа или публикацией — они появятся здесь.'}</p>
            {!bookmarks.length && <button onClick={() => go('library')} className="mt-5 rounded-full bg-tint px-6 py-3 text-[16px] font-semibold text-tint-ink">Открыть библиотеку</button>}
          </div>
        )}
      </div>
    </Screen>
  );
}
