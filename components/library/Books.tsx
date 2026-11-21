'use client';

import { Check, Clock, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { bookIndex, type BookMeta } from '@/lib/client-data';
import { useStored } from '@/lib/hooks';
import { localAll, localDelete, localPut, parseBook, type LocalBook } from '@/lib/localbooks';
import { norm } from '@/lib/library-meta';
import { useApp, type Route, type Tab } from '../AppProvider';
import { Screen } from '../Screen';
import { Group, Row, Segmented } from '../ui';
import { SearchField } from './Cards';
import { useBack } from './nav';

type Item = { id: string; t: string; a: string; d: string; route?: Route[]; tab?: Tab };
type Section = { h: string; items: Item[] };

const STATUS = [
  { value: 'none', label: 'Нет' },
  { value: 'want', label: 'Хочу' },
  { value: 'reading', label: 'Читаю' },
  { value: 'done', label: 'Прочитал' },
] as const;
type Status = (typeof STATUS)[number]['value'];
const NEXT: Record<Status, Status> = { none: 'want', want: 'reading', reading: 'done', done: 'none' };

/** Только книги, текст которых есть в приложении: каждая открывается одним нажатием. */
const SECTIONS: Section[] = [
  {
    h: 'Коран',
    items: [{ id: 'quran', t: 'Коран', a: 'Арабский текст, переводы Э. Кулиева и Абу Адель', d: '114 сур, закладки, указатели, тафсир к каждому аяту.', route: [{ k: 'quran' }] }],
  },
  {
    h: 'Тафсир на русском',
    items: [
      { id: 'saadi', t: 'Тафсир ас-Саади', a: 'Абдуррахман ас-Саади', d: 'Краткое и ясное толкование всего Корана.', route: [{ k: 'tafsirs' }, { k: 'tafsir', id: 'saadi' }] },
      { id: 'kathir', t: 'Тафсир Ибн Касира', a: 'Исмаил ибн Касир', d: 'Толкование через Коран, Сунну и слова предшественников.', route: [{ k: 'tafsirs' }, { k: 'tafsir', id: 'kathir' }] },
      { id: 'mukhtasar', t: 'Аль-Мухтасар', a: 'Центр тафсира коранических исследований', d: 'Сжатое разъяснение смысла аятов.', route: [{ k: 'tafsirs' }, { k: 'tafsir', id: 'mukhtasar' }] },
    ],
  },
  {
    h: 'Тафсир на арабском',
    items: [
      { id: 'saadi-ar', t: 'Тайсир аль-Карим ар-Рахман', a: 'Абдуррахман ас-Саади', d: 'Арабский оригинал тафсира ас-Саади.', route: [{ k: 'tafsirs' }, { k: 'tafsir', id: 'saadi-ar' }] },
      { id: 'muyassar', t: 'Ат-Тафсир аль-Муяссар', a: 'Комплекс имени короля Фахда', d: 'Краткий и ясный тафсир.', route: [{ k: 'tafsirs' }, { k: 'tafsir', id: 'muyassar' }] },
      { id: 'mukhtasar-ar', t: 'Аль-Мухтасар фи тафсир аль-Куръан', a: 'Центр тафсира коранических исследований', d: 'Арабский оригинал краткого тафсира.', route: [{ k: 'tafsirs' }, { k: 'tafsir', id: 'mukhtasar-ar' }] },
      { id: 'jazairi', t: 'Айсар ат-Тафасир', a: 'Абу Бакр аль-Джазаири', d: 'Тафсир для широкого круга читателей.', route: [{ k: 'tafsirs' }, { k: 'tafsir', id: 'jazairi' }] },
      { id: 'qayyim', t: 'Тафсир Ибн аль-Каййима', a: 'Ибн аль-Каййим', d: 'Толкования аятов из трудов имама.', route: [{ k: 'tafsirs' }, { k: 'tafsir', id: 'qayyim' }] },
    ],
  },
  {
    h: 'Хадисы',
    items: [
      { id: 'bukhari', t: 'Сахих аль-Бухари', a: 'Имам аль-Бухари', d: '7 502 хадиса на русском и арабском, по книгам.', route: [{ k: 'hadith' }, { k: 'coll', c: 'bukhari' }] },
      { id: 'muslim', t: 'Сахих Муслим', a: 'Имам Муслим', d: '2 719 переведённых хадисов на русском и арабском.', route: [{ k: 'hadith' }, { k: 'coll', c: 'muslim' }] },
      { id: 'abudawud', t: 'Сунан Абу Дауда', a: 'Имам Абу Дауд', d: 'Только хадисы, оценённые аль-Албани как «сахих».', route: [{ k: 'hadith' }, { k: 'coll', c: 'abudawud' }] },
      { id: 'tirmidhi', t: 'Джами‘ ат-Тирмизи', a: 'Имам ат-Тирмизи', d: 'Только хадисы, оценённые аль-Албани как «сахих»; арабский текст (английский — по кнопке EN).', route: [{ k: 'hadith' }, { k: 'coll', c: 'tirmidhi' }] },
      { id: 'arbain', t: 'Сорок хадисов', a: 'Имам ан-Навави', d: 'Основы религии в сорока хадисах (арабский текст).', route: [{ k: 'hadith' }, { k: 'coll', c: 'nawawi' }] },
    ],
  },
  {
    h: 'Азкары и имена Аллаха',
    items: [
      { id: 'hisn', t: 'Хисн аль-Муслим', a: 'Саид аль-Кахтани', d: '267 азкаров в 132 разделах (в порядке книги и по группам), с числом повторений.', route: [{ k: 'hisn' }] },
      { id: 'names', t: '99 имён Аллаха', a: 'По риваяте ат-Тирмизи', d: 'Смысл имён и места упоминания в Коране.', route: [{ k: 'names' }] },
    ],
  },
  {
    h: 'Из канала',
    items: [{ id: 'channel', t: 'Публикации канала Хидая', a: 'Telegram @hidaya_islam1', d: 'Все текстовые публикации; новые добавляются автоматически.', tab: 'feed' }],
  },
];
const ALL = SECTIONS.flatMap((s) => s.items);

export function BooksScreen() {
  const { openRoute, push, go, toast } = useApp();
  const back = useBack();
  const [status, setStatus] = useStored<Record<string, Status>>('hidaya-books', {});
  const [q, setQ] = useState('');
  const [site, setSite] = useState<BookMeta[]>([]);
  const [mine, setMine] = useState<LocalBook[]>([]);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bookIndex().then(setSite);
    localAll().then(setMine);
  }, []);

  const total = ALL.length + site.length + mine.length;
  const match = (t: string, a: string) => !q.trim() || norm(`${t} ${a}`).includes(norm(q.trim()));
  const sections = useMemo(() => SECTIONS.map((s) => ({ ...s, items: s.items.filter((b) => match(b.t, b.a)) })).filter((s) => s.items.length), [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (st: Status) => Object.values(status).filter((x) => x === st).length;

  const importFile = async (f: File) => {
    try {
      const chapters = parseBook(await f.text());
      if (!chapters.length) return toast('В файле нет текста');
      const title = f.name.replace(/\.(txt|md)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Моя книга';
      const id = `local-${Date.now()}`;
      await localPut({ id, title, chapters, added: Date.now() });
      setMine(await localAll());
      toast('Книга добавлена на это устройство');
      push({ k: 'bookread', id });
    } catch {
      toast('Не удалось прочитать файл');
    }
  };

  const statusBtn = (id: string) => {
    const st = status[id] ?? 'none';
    return (
      <span
        role="button"
        tabIndex={0}
        aria-label={`Отметка: ${STATUS.find((x) => x.value === st)!.label}. Нажмите, чтобы сменить`}
        onClick={(e) => { e.stopPropagation(); setStatus({ ...status, [id]: NEXT[st] }); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setStatus({ ...status, [id]: NEXT[st] }); } }}
        className={`grid h-8 min-w-8 shrink-0 place-items-center rounded-full px-2.5 text-[12px] font-semibold ${st === 'done' ? 'bg-tint text-tint-ink' : st === 'none' ? 'border border-sep text-label3' : 'bg-fill text-label2'}`}
      >
        {st === 'none' ? <Plus size={15} strokeWidth={2.6} /> : st === 'done' ? <Check size={15} strokeWidth={3} /> : <span className="flex items-center gap-1"><Clock size={13} strokeWidth={2.6} />{st === 'want' ? 'Хочу' : 'Читаю'}</span>}
      </span>
    );
  };

  const line = (b: { id: string; t: string; a: string; d?: string }) => (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-medium leading-tight">{b.t}</p>
        <p className="mt-0.5 text-[14px] text-label2">{b.a}</p>
        {b.d && <p className="mt-0.5 text-[13px] leading-snug text-label2">{b.d}</p>}
      </div>
      {statusBtn(b.id)}
    </div>
  );

  return (
    <Screen title="Книги" subtitle={`${total} ${total % 10 === 1 && total % 100 !== 11 ? 'книга' : 'книг'} — все открываются здесь.`} back={back}>
      <div className="space-y-5">
        <SearchField id="books-search" value={q} onChange={setQ} placeholder="Название или автор" />
        {(count('done') || count('reading') || count('want')) > 0 && (
          <div className="flex gap-2 text-[13px] font-semibold">
            <span className="rounded-full bg-tint-soft px-3 py-1.5 text-tint">Прочитано: {count('done')}</span>
            <span className="rounded-full bg-fill px-3 py-1.5 text-label2">Читаю: {count('reading')}</span>
            <span className="rounded-full bg-fill px-3 py-1.5 text-label2">Хочу: {count('want')}</span>
          </div>
        )}
        {sections.map((sec) => (
          <Group key={sec.h} header={sec.h}>
            {sec.items.map((b, i) => (
              <Row key={b.id} onClick={() => (b.route ? openRoute(b.route) : b.tab && go(b.tab))} last={i === sec.items.length - 1}>
                {line(b)}
              </Row>
            ))}
          </Group>
        ))}

        {(site.length > 0 || mine.length > 0 || !q.trim()) && (
          <Group header="Мои книги" footer="Книги из файлов .txt и .md хранятся только на этом устройстве. Тексты чужих изданий добавляйте, только если у вас есть на это право.">
            {site.filter((b) => match(b.title, b.author)).map((b) => (
              <Row key={b.id} onClick={() => push({ k: 'bookread', id: b.id })}>{line({ id: b.id, t: b.title, a: b.author, d: `${b.ch} глав` })}</Row>
            ))}
            {mine.filter((b) => match(b.title, '')).map((b) => (
              <Row key={b.id} onClick={() => push({ k: 'bookread', id: b.id })}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[17px] font-medium leading-tight">{b.title}</p>
                    <p className="mt-0.5 text-[13px] text-label2">{b.chapters.length} глав · на этом устройстве</p>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Удалить книгу"
                    onClick={async (e) => { e.stopPropagation(); await localDelete(b.id); setMine(await localAll()); toast('Книга удалена'); }}
                    className="grid size-8 shrink-0 place-items-center rounded-full text-red"
                  >
                    <Trash2 size={17} />
                  </span>
                </div>
              </Row>
            ))}
            <input ref={file} type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
            <Row onClick={() => file.current?.click()} chevron={false} last>
              <div className="flex items-center gap-2.5 text-tint">
                <Plus size={19} strokeWidth={2.6} />
                <span className="text-[17px] font-medium">Добавить книгу из файла</span>
              </div>
            </Row>
          </Group>
        )}
      </div>
    </Screen>
  );
}
