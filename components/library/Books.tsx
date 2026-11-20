'use client';

import { BookOpenCheck, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStored } from '@/lib/hooks';
import { norm } from '@/lib/library-meta';
import { useApp, type Route } from '../AppProvider';
import { Screen } from '../Screen';
import { Sheet } from '../Sheet';
import { Group, Row, Segmented, plural } from '../ui';
import { SearchField } from './Cards';
import { useBack } from './nav';

type Level = 1 | 2 | 3;
type Book = { id: string; t: string; a: string; d: string; lvl: Level; app?: Route[] };
type Section = { h: string; items: Book[] };

const LEVELS: Record<Level, string> = { 1: 'Начальный', 2: 'Средний', 3: 'Продвинутый' };
const STATUS = [
  { value: 'none', label: 'Нет' },
  { value: 'want', label: 'Хочу' },
  { value: 'reading', label: 'Читаю' },
  { value: 'done', label: 'Прочитал' },
] as const;
type Status = (typeof STATUS)[number]['value'];

const SECTIONS: Section[] = [
  {
    h: 'Вероубеждение',
    items: [
      { id: 'usul3', t: 'Аль-Усуль ас-Саляса («Три основы»)', a: 'Мухаммад ибн Абдуль-Ваххаб', d: 'Краткое изложение основ: познание Господа, религии и Пророка ﷺ.', lvl: 1 },
      { id: 'qawaid4', t: 'Аль-Кава‘ид аль-Арба‘ («Четыре правила»)', a: 'Мухаммад ибн Абдуль-Ваххаб', d: 'Четыре правила, помогающие понять единобожие и многобожие.', lvl: 1 },
      { id: 'nawaqid', t: 'Нава‘ид аль-Ислам («Десять аннулирующих ислам»)', a: 'Мухаммад ибн Абдуль-Ваххаб', d: 'Десять вещей, которые выводят человека из ислама.', lvl: 1 },
      { id: 'tawhid', t: 'Китаб ат-Таухид', a: 'Мухаммад ибн Абдуль-Ваххаб', d: 'О единобожии и его противоположности — многобожии, с доводами из Корана и Сунны.', lvl: 2 },
      { id: 'kashf', t: 'Кашф аш-Шубухат', a: 'Мухаммад ибн Абдуль-Ваххаб', d: 'Разъяснение сомнений, которые приводят сторонники многобожия, и ответы на них.', lvl: 2 },
      { id: 'wasitiyya', t: 'Аль-Акыда аль-Васытыя', a: 'Ибн Теймия', d: 'Сжатое изложение убеждений ахлю-сунны валь-джамаа.', lvl: 2 },
      { id: 'lumah', t: 'Лум‘ат аль-И‘тикад', a: 'Ибн Кудама аль-Макдиси', d: 'Краткий свод убеждений последователей Сунны.', lvl: 2 },
      { id: 'tahawiyya', t: 'Аль-Акыда ат-Тахавия', a: 'Абу Джа‘фар ат-Тахави', d: 'Основы убеждений ахлю-сунны, изложенные в форме краткого свода.', lvl: 2 },
      { id: 'usulsunna', t: 'Усуль ас-Сунна', a: 'Имам Ахмад ибн Ханбаль', d: 'Основы Сунны в передаче одного из имамов ахлю-сунны.', lvl: 3 },
      { id: 'sharhsunna', t: 'Шарх ас-Сунна', a: 'аль-Барбахарий', d: 'Разъяснение убеждений предшественников и предостережение от нововведений.', lvl: 3 },
      { id: 'sharhtahawiyya', t: 'Шарх аль-Акыда ат-Тахавия', a: 'Ибн Аби-ль-Изз аль-Ханафи', d: 'Подробный разбор «Акыды ат-Тахави».', lvl: 3 },
      { id: 'sunnaabdullah', t: 'Китаб ас-Сунна', a: 'Абдуллах ибн Ахмад ибн Ханбаль', d: 'Сообщения о вероубеждении, собранные сыном имама Ахмада.', lvl: 3 },
      { id: 'fathmajid', t: 'Фатх аль-Маджид', a: 'Абдуррахман ибн Хасан Аль аш-Шейх', d: 'Комментарий к «Китаб ат-Таухид».', lvl: 3 },
      { id: 'ibana', t: 'Аль-Ибана аль-Кубра', a: 'Ибн Батта', d: 'Большой труд о вероубеждении и об уклонении от пути Сунны.', lvl: 3 },
    ],
  },
  {
    h: 'Коран и тафсир',
    items: [
      { id: 'quran', t: 'Коран: арабский текст и переводы смыслов', a: 'Кулиев, Абу Адель', d: '114 сур с переводом смыслов, закладками и указателями.', lvl: 1, app: [{ k: 'quran' }] },
      { id: 'saadi', t: 'Тайсир аль-Карим ар-Рахман (Тафсир ас-Саади)', a: 'Абдуррахман ас-Саади', d: 'Краткое и ясное толкование всего Корана.', lvl: 1, app: [{ k: 'tafsirs' }, { k: 'tafsir', id: 'saadi' }] },
      { id: 'mukhtasar', t: 'Аль-Мухтасар фи тафсир аль-Куръан аль-Карим', a: 'Центр тафсира коранических исследований', d: 'Сжатое разъяснение смысла аятов.', lvl: 1, app: [{ k: 'tafsirs' }, { k: 'tafsir', id: 'mukhtasar' }] },
      { id: 'kathir', t: 'Тафсир аль-Куръан аль-Азым (Тафсир Ибн Касира)', a: 'Исмаил ибн Касир', d: 'Толкование Корана через Коран, Сунну и слова предшественников.', lvl: 2, app: [{ k: 'tafsirs' }, { k: 'tafsir', id: 'kathir' }] },
      { id: 'usultafsir', t: 'Усуль фи ат-тафсир', a: 'Мухаммад ибн Салих аль-Усеймин', d: 'Основы толкования Корана.', lvl: 2 },
      { id: 'muqaddima', t: 'Мукаддима фи усуль ат-тафсир', a: 'Ибн Теймия', d: 'Принципы толкования Корана и причины разногласий в тафсире.', lvl: 2 },
      { id: 'baghawi', t: 'Ма‘алим ат-Танзиль', a: 'аль-Багави', d: 'Тафсир на основе сообщений предшественников.', lvl: 3 },
      { id: 'tabari', t: 'Джами‘ аль-Баян', a: 'ат-Табари', d: 'Один из величайших тафсиров, основанных на передаваемых сообщениях.', lvl: 3 },
      { id: 'adwa', t: 'Адва аль-Баян', a: 'Мухаммад аш-Шанкыти', d: 'Объяснение Корана через сам Коран.', lvl: 3 },
    ],
  },
  {
    h: 'Хадис',
    items: [
      { id: 'arbain', t: 'Аль-Арба‘ун ан-Нававия («Сорок хадисов»)', a: 'Имам ан-Навави', d: 'Основы религии в сорока хадисах (арабский текст).', lvl: 1, app: [{ k: 'hadith' }, { k: 'coll', c: 'nawawi' }] },
      { id: 'riyad', t: 'Рияд ас-Салихин', a: 'Имам ан-Навави', d: 'Хадисы о нравственности, поклонении и поведении мусульманина.', lvl: 1 },
      { id: 'bukhari', t: 'Сахих аль-Бухари', a: 'Имам аль-Бухари', d: 'Сборник достоверных хадисов; первая по достоверности книга после Корана.', lvl: 2, app: [{ k: 'hadith' }, { k: 'coll', c: 'bukhari' }] },
      { id: 'muslim', t: 'Сахих Муслим', a: 'Имам Муслим', d: 'Сборник достоверных хадисов; вторая по достоверности книга после Корана.', lvl: 2, app: [{ k: 'hadith' }, { k: 'coll', c: 'muslim' }] },
      { id: 'umda', t: 'Умдат аль-ахкам', a: 'Абдуль-Гани аль-Макдиси', d: 'Хадисы о предписаниях религии, взятые из двух «Сахихов».', lvl: 2 },
      { id: 'bulugh', t: 'Бульуг аль-марам', a: 'Ибн Хаджар аль-Аскаляни', d: 'Хадисы, на которых основаны вопросы фикха, с указанием степени достоверности.', lvl: 2 },
      { id: 'lulu', t: 'Аль-Лу’лу’ валь-Мардж‘ан', a: 'Мухаммад Фуад Абдуль-Баки', d: 'Хадисы, переданные и аль-Бухари, и Муслимом.', lvl: 2 },
      { id: 'adab', t: 'Аль-Адаб аль-Муфрад', a: 'Имам аль-Бухари', d: 'Хадисы о нравственности и поведении.', lvl: 2 },
      { id: 'baiquniyya', t: 'Аль-Манзума аль-Байкуния', a: 'Умар аль-Байкуни', d: 'Стихотворное введение в терминологию науки о хадисах.', lvl: 2 },
      { id: 'abudawud', t: 'Сунан Абу Дауда', a: 'Имам Абу Дауд', d: 'Сборник хадисов по темам фикха; в приложении — только оценённые как «сахих».', lvl: 3, app: [{ k: 'hadith' }, { k: 'coll', c: 'abudawud' }] },
      { id: 'tirmidhi', t: 'Джами‘ ат-Тирмизи', a: 'Имам ат-Тирмизи', d: 'Сборник хадисов с пояснением их степени и мнений учёных.', lvl: 3 },
      { id: 'nasai', t: 'Сунан ан-Насаи', a: 'Имам ан-Насаи', d: 'Сборник хадисов по темам фикха.', lvl: 3 },
      { id: 'ibnmajah', t: 'Сунан Ибн Маджа', a: 'Имам Ибн Маджа', d: 'Сборник хадисов по темам фикха.', lvl: 3 },
      { id: 'musnad', t: 'Муснад Ахмада', a: 'Имам Ахмад ибн Ханбаль', d: 'Огромный свод хадисов, упорядоченный по передатчикам-сподвижникам.', lvl: 3 },
      { id: 'mishkat', t: 'Мишкат аль-Масабих', a: 'ат-Табризи', d: 'Сборник хадисов по темам.', lvl: 3 },
      { id: 'nukhba', t: 'Нухбат аль-Фикар', a: 'Ибн Хаджар аль-Аскаляни', d: 'Краткий труд по терминологии науки о хадисах.', lvl: 3 },
      { id: 'sahiha', t: 'Сильсиля аль-Ахадис ас-Сахиха', a: 'Мухаммад Насыруддин аль-Албани', d: 'Свод хадисов, признанных автором достоверными.', lvl: 3 },
    ],
  },
  {
    h: 'Фикх и молитва',
    items: [
      { id: 'sifat', t: 'Сыфат Салят ан-Наби ﷺ', a: 'Мухаммад Насыруддин аль-Албани', d: 'Описание молитвы Пророка ﷺ от такбира до салама.', lvl: 1 },
      { id: 'umdafiqh', t: 'Умдат аль-фикх', a: 'Ибн Кудама аль-Макдиси', d: 'Краткое руководство по фикху для начинающих.', lvl: 1 },
      { id: 'mulakhkhas', t: 'Аль-Мулаххас аль-фикхи', a: 'Салих аль-Фаузан', d: 'Сжатое изложение фикха поклонения и взаимоотношений.', lvl: 2 },
      { id: 'fiqhsunna', t: 'Фикх ас-Сунна', a: 'Сайид Сабик', d: 'Свод правил фикха с доводами из Корана и Сунны.', lvl: 2 },
      { id: 'mughni', t: 'Аль-Мугни', a: 'Ибн Кудама аль-Макдиси', d: 'Обширный труд по сравнительному фикху.', lvl: 3 },
      { id: 'zad', t: 'Зад аль-Мустакни‘', a: 'аль-Хаджжави', d: 'Классический краткий текст ханбалитского фикха.', lvl: 3 },
      { id: 'mumti', t: 'Аш-Шарх аль-Мумти‘', a: 'Мухаммад ибн Салих аль-Усеймин', d: 'Комментарий к «Зад аль-Мустакни‘».', lvl: 3 },
      { id: 'usulilm', t: 'Аль-Усуль мин ‘ильм аль-усуль', a: 'Мухаммад ибн Салих аль-Усеймин', d: 'Основы науки о принципах фикха.', lvl: 2 },
      { id: 'rawda', t: 'Рауда ан-Назир', a: 'Ибн Кудама аль-Макдиси', d: 'Классический труд по принципам фикха.', lvl: 3 },
    ],
  },
  {
    h: 'Жизнеописание Пророка ﷺ и история',
    items: [
      { id: 'rahiq', t: 'Ар-Рахик аль-Махтум', a: 'Сафиюр-Рахман аль-Мубаракфури', d: 'Жизнеописание Пророка ﷺ.', lvl: 1 },
      { id: 'zadmaad', t: 'Зад аль-Ма‘ад', a: 'Ибн аль-Каййим', d: 'Руководство Пророка ﷺ в вере, поклонении и жизни.', lvl: 2 },
      { id: 'sirahisham', t: 'Ас-Сира ан-Набавия', a: 'Ибн Хишам', d: 'Классическое жизнеописание Пророка ﷺ.', lvl: 3 },
      { id: 'bidaya', t: 'Аль-Бидая ва-н-Нихая', a: 'Ибн Касир', d: 'Всемирная история от сотворения до времени автора.', lvl: 3 },
      { id: 'siyar', t: 'Сияр а‘лям ан-Нубаля', a: 'аз-Захаби', d: 'Жизнеописания выдающихся учёных и праведников.', lvl: 3 },
    ],
  },
  {
    h: 'Воспитание сердца и поведение',
    items: [
      { id: 'hisn', t: 'Хисн аль-Муслим', a: 'Саид аль-Кахтани', d: 'Азкары и мольбы из Корана и достоверной Сунны.', lvl: 1, app: [{ k: 'hisn' }] },
      { id: 'kabair', t: 'Аль-Кабаир', a: 'аз-Захаби', d: 'О больших грехах и предостережении от них.', lvl: 1 },
      { id: 'wabil', t: 'Аль-Вабиль ас-Сайиб', a: 'Ибн аль-Каййим', d: 'О поминании Аллаха и его пользе для сердца.', lvl: 1 },
      { id: 'fawaid', t: 'Аль-Фаваид', a: 'Ибн аль-Каййим', d: 'Собрание полезных наставлений о сердце и вере.', lvl: 2 },
      { id: 'jawab', t: 'Ад-Дауа‘ ва-д-дава‘ (Аль-Джаваб аль-Кафи)', a: 'Ибн аль-Каййим', d: 'О грехах, их последствиях и лечении сердца.', lvl: 2 },
      { id: 'rawdamuhibbin', t: 'Рауда аль-Мухиббин', a: 'Ибн аль-Каййим', d: 'О любви и сердечных привязанностях.', lvl: 2 },
      { id: 'madarij', t: 'Мадаридж ас-Саликин', a: 'Ибн аль-Каййим', d: 'Подробный труд о ступенях пути к Аллаху.', lvl: 3 },
      { id: 'adabsharia', t: 'Аль-Адаб аш-Шар‘ия', a: 'Ибн Муфлих', d: 'О нормах поведения и нравственности.', lvl: 3 },
    ],
  },
  {
    h: 'Арабский язык',
    items: [
      { id: 'ajurrumiyya', t: 'Аль-Аджуррумия', a: 'Ибн Аджурум', d: 'Классическое краткое введение в арабскую грамматику.', lvl: 1 },
      { id: 'arabiyya', t: 'Аль-‘Арабия бейна ядейк', a: 'Абдуррахман аль-Фаузан и др.', d: 'Учебный курс арабского языка для неарабов.', lvl: 1 },
      { id: 'qatr', t: 'Катр ан-нада ва балль ас-сада', a: 'Ибн Хишам аль-Ансари', d: 'Подробный труд по грамматике.', lvl: 3 },
      { id: 'alfiyya', t: 'Альфийя', a: 'Ибн Малик', d: 'Стихотворный свод грамматики в тысячу строк.', lvl: 3 },
    ],
  },
];

const ALL = SECTIONS.flatMap((s) => s.items);

export function BooksScreen() {
  const { openRoute } = useApp();
  const back = useBack();
  const [status, setStatus] = useStored<Record<string, Status>>('hidaya-books', {});
  const [lvl, setLvl] = useState<'all' | '1' | '2' | '3'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Book | null>(null);

  const match = (b: Book) => (lvl === 'all' || String(b.lvl) === lvl) && (!q.trim() || norm(`${b.t} ${b.a}`).includes(norm(q.trim())));
  const sections = useMemo(() => SECTIONS.map((s) => ({ ...s, items: s.items.filter(match) })).filter((s) => s.items.length), [lvl, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (st: Status) => ALL.filter((b) => status[b.id] === st).length;
  const inApp = ALL.filter((b) => b.app).length;
  const set = (b: Book, v: Status) => setStatus({ ...status, [b.id]: v });

  return (
    <Screen title="Путь знаний" subtitle={`${ALL.length} трудов учёных ахлю-сунны по порядку изучения. ${inApp} из них можно читать прямо здесь.`} back={back}>
      <div className="space-y-5">
        <SearchField id="books-search" value={q} onChange={setQ} placeholder="Название или автор" />
        <Segmented value={lvl} onChange={setLvl} options={[{ value: 'all', label: 'Все' }, { value: '1', label: 'Начальный' }, { value: '2', label: 'Средний' }, { value: '3', label: 'Продвинутый' }]} />
        {(count('done') || count('reading') || count('want')) > 0 && (
          <div className="flex gap-2 text-[13px] font-semibold">
            <span className="rounded-full bg-tint-soft px-3 py-1.5 text-tint">Прочитано: {count('done')}</span>
            <span className="rounded-full bg-fill px-3 py-1.5 text-label2">Читаю: {count('reading')}</span>
            <span className="rounded-full bg-fill px-3 py-1.5 text-label2">Хочу: {count('want')}</span>
          </div>
        )}
        {sections.length === 0 && <Group><p className="p-5 text-center text-label2">Ничего не найдено</p></Group>}
        {sections.map((sec) => (
          <Group key={sec.h} header={sec.h}>
            {sec.items.map((b, i) => (
              <Row key={b.id} onClick={() => setOpen(b)} last={i === sec.items.length - 1}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[17px] font-medium leading-tight">{b.t}</p>
                    <p className="mt-0.5 text-[14px] text-label2">{b.a}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold">
                      <span className="rounded-full bg-fill px-2 py-0.5 text-label2">{LEVELS[b.lvl]}</span>
                      {b.app && <span className="inline-flex items-center gap-1 rounded-full bg-tint-soft px-2 py-0.5 text-tint"><BookOpenCheck size={12} /> читать здесь</span>}
                      {status[b.id] === 'done' && <span className="inline-flex items-center gap-1 rounded-full bg-tint px-2 py-0.5 text-tint-ink"><Check size={12} strokeWidth={3} /> прочитано</span>}
                      {status[b.id] === 'reading' && <span className="rounded-full bg-fill px-2 py-0.5 text-label2">читаю</span>}
                      {status[b.id] === 'want' && <span className="rounded-full bg-fill px-2 py-0.5 text-label2">хочу прочитать</span>}
                    </div>
                  </div>
                </div>
              </Row>
            ))}
          </Group>
        ))}
        <p className="px-4 text-[13px] leading-snug text-label2">
          Перечень составлен по традиционному порядку изучения; уровни — ориентир. Читайте у знающих людей: {count('done') + count('reading') + count('want') === 0 ? 'отметьте книги, которые хотите прочитать, и следите за прогрессом.' : `в списке ${ALL.length} ${plural(ALL.length, 'книга', 'книги', 'книг')}.`}
        </p>
      </div>

      <Sheet open={!!open} onClose={() => setOpen(null)} size="medium" labelledBy="book-title" header={<span className="truncate text-[15px] font-semibold text-label2">{open ? LEVELS[open.lvl] : ''}</span>}>
        {open && (
          <div className="space-y-4 pt-1">
            <div>
              <h2 id="book-title" className="font-display text-[1.6rem] font-bold leading-tight tracking-[-0.035em]">{open.t}</h2>
              <p className="mt-1 text-[16px] font-medium text-tint">{open.a}</p>
              <p className="mt-2 text-[16px] leading-snug text-label2">{open.d}</p>
            </div>
            <div>
              <p className="mb-1.5 px-1 text-[13px] text-label2">Моя отметка</p>
              <Segmented value={status[open.id] ?? 'none'} onChange={(v) => set(open, v)} options={STATUS.map((s) => ({ value: s.value, label: s.label }))} />
            </div>
            {open.app ? (
              <button onClick={() => { const r = open.app!; setOpen(null); openRoute(r); }} className="w-full rounded-full bg-tint py-3.5 text-[17px] font-semibold text-tint-ink">
                Читать здесь
              </button>
            ) : (
              <a href={`https://yandex.ru/search/?text=${encodeURIComponent(`${open.t} ${open.a} читать`)}`} target="_blank" rel="noopener noreferrer" className="block w-full rounded-full bg-tint py-3.5 text-center text-[17px] font-semibold text-tint-ink">
                Найти в интернете
              </a>
            )}
            {!open.app && <p className="px-1 text-[13px] leading-snug text-label2">Текст этой книги в открытых данных на русском не найден, поэтому здесь её нет. Ищите проверенное издание.</p>}
          </div>
        )}
      </Sheet>
    </Screen>
  );
}
