'use client';

import { useEffect, useState } from 'react';
import { bookData, bookIndex, type BookChapter } from '@/lib/client-data';
import { useStored } from '@/lib/hooks';
import { localDelete, localGet } from '@/lib/localbooks';
import { useApp } from '../AppProvider';
import { Screen } from '../Screen';
import { Group, Row } from '../ui';
import { Actions } from './Cards';
import { useBack } from './nav';

const AR = /[؀-ۿ]/g;
const isAr = (s: string) => (s.match(AR) ?? []).length / Math.max(1, s.replace(/[\s\d\p{P}]/gu, '').length) > 0.5;

/** Читалка книги: оглавление и текст по главам; место чтения запоминается. */
export function BookReadScreen({ id, ch }: { id: string; ch?: number }) {
  const { pop, toast, settings } = useApp();
  const back = useBack();
  const [chapters, setChapters] = useState<BookChapter[] | null>(null);
  const [source, setSource] = useState<'site' | 'local'>('site');
  const [err, setErr] = useState(false);
  const [pos, setPos] = useStored<Record<string, number>>('hidaya-bookpos', {});
  const [title, setTitle] = useState('Книга');
  const [author, setAuthor] = useState('');
  const [open, setOpen] = useState<number | null>(ch ?? null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const idx = await bookIndex();
        const m = idx.find((x) => x.id === id);
        if (m) {
          if (alive) {
            setTitle(m.title);
            setAuthor(m.author);
          }
          const d = await bookData(id);
          if (alive) {
            setChapters(d.chapters);
            setSource('site');
          }
          return;
        }
        const l = await localGet(id);
        if (l && alive) {
          setTitle(l.title);
          setChapters(l.chapters);
          setSource('local');
        } else if (alive) setErr(true);
      } catch {
        if (alive) setErr(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (open !== null) setPos({ ...pos, [id]: open });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const c = open !== null && chapters ? chapters[open] : null;
  const bm = `b:${id}:${open ?? 0}`;

  return (
    <Screen
      title={c ? c.t : title}
      subtitle={c ? `${title} · глава ${open! + 1} из ${chapters!.length}` : author}
      back={c ? { label: 'Оглавление', onClick: () => setOpen(null) } : back}
    >
      {err && <Group><p className="p-5 text-center text-label2">Текст книги не найден.</p></Group>}
      {!chapters && !err && <Group>{Array.from({ length: 4 }, (_, i) => <div key={i} className="m-4 h-10 animate-pulse rounded-xl bg-fill" />)}</Group>}

      {chapters && !c && (
        <div className="space-y-5">
          {pos[id] !== undefined && chapters[pos[id]] && (
            <Group header="Продолжить">
              <Row onClick={() => setOpen(pos[id])} last>
                <p className="text-[17px] font-medium">{chapters[pos[id]].t}</p>
                <p className="text-[13px] text-label2">Глава {pos[id] + 1} из {chapters.length}</p>
              </Row>
            </Group>
          )}
          <Group header={`Оглавление · ${chapters.length}`} footer={source === 'local' ? 'Книга хранится только на этом устройстве.' : undefined}>
            {chapters.map((x, i) => (
              <Row key={i} onClick={() => { setOpen(i); window.scrollTo(0, 0); }} last={i === chapters.length - 1}>
                <div className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-tint-soft text-[13px] font-bold tabular-nums text-tint">{i + 1}</span>
                  <p className="min-w-0 flex-1 text-[17px] leading-snug">{x.t}</p>
                </div>
              </Row>
            ))}
          </Group>
          {source === 'local' && (
            <button
              onClick={async () => {
                await localDelete(id);
                toast('Книга удалена с этого устройства');
                pop();
              }}
              className="w-full rounded-full py-3 text-center text-[16px] font-semibold text-red"
            >
              Удалить с этого устройства
            </button>
          )}
        </div>
      )}

      {chapters && c && (
        <div className="space-y-4">
          <div className="flex justify-end"><Actions markId={bm} mark={{ id: bm, kind: 'book', title: `${title} · ${c.t}`, sub: c.p[0].slice(0, 140), route: [{ k: 'books' }, { k: 'bookread', id, ch: open! }] }} text={`${c.t}\n\n${c.p.join('\n\n')}\n\n— ${title}, ${author}`} /></div>
          <Group>
            <div className="space-y-4 px-4 py-4">
              {c.p.map((x, i) =>
                isAr(x) ? (
                  <p key={i} lang="ar" dir="rtl" className="quran text-right" style={{ fontSize: `${settings.arSize}rem` }}>{x}</p>
                ) : (
                  <p key={i} className="whitespace-pre-line text-[18px] leading-[1.6]">{x}</p>
                ),
              )}
            </div>
          </Group>
          <div className="flex justify-between gap-3 pt-1">
            {open! > 0 ? <button onClick={() => { setOpen(open! - 1); window.scrollTo(0, 0); }} className="rounded-full bg-surface px-5 py-3 text-[15px] font-semibold text-tint">‹ Глава {open}</button> : <span />}
            {open! < chapters.length - 1 && <button onClick={() => { setOpen(open! + 1); window.scrollTo(0, 0); }} className="rounded-full bg-surface px-5 py-3 text-[15px] font-semibold text-tint">Глава {open! + 2} ›</button>}
          </div>
        </div>
      )}
    </Screen>
  );
}
