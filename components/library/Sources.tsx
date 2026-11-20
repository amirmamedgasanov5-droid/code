'use client';

import { Screen } from '../Screen';
import { Group, Row } from '../ui';
import { useBack } from './nav';

const SOURCES = [
  { t: 'Коран', d: 'Арабский текст (Узмани) и русский перевод Эльмира Кулиева — The Noble Qur’an Encyclopedia (quranenc.com), транслитерация — Tanzil.net. Лицензия CC BY-SA 4.0. Набор: пакет quran-cloud.' },
  { t: 'Сахих аль-Бухари', d: 'Арабский текст и русский перевод (Абдуллах Нирша и редакторы Daura.com) — открытый набор hadith-api.' },
  { t: 'Сахих Муслим', d: 'Арабский текст и русский перевод — hadith-api. В русском издании источника переведена только часть хадисов, показаны переведённые.' },
  { t: 'Сунан Абу Дауда', d: 'Арабский текст и русский перевод — hadith-api. Показаны только переведённые хадисы; оценки приводятся так, как они указаны в источнике.' },
  { t: 'Хисн аль-Муслим', d: 'Арабский текст дуа и транслитерация — пакет @kazishariar/hisnul-muslim-data.' },
  { t: 'Публикации и тафсир ас-Саади', d: 'Тексты Telegram-канала @hidaya_islam1. Подтягиваются автоматически из публичной ленты канала.' },
];

export function SourcesScreen() {
  const back = useBack();
  return (
    <Screen title="Источники" subtitle="Откуда взяты тексты и как им доверять." back={back}>
      <div className="space-y-6">
        <Group>
          {SOURCES.map((s, i) => (
            <Row key={s.t} chevron={false} last={i === SOURCES.length - 1}>
              <p className="text-[17px] font-semibold leading-tight">{s.t}</p>
              <p className="mt-1 text-[15px] leading-snug text-label2">{s.d}</p>
            </Row>
          ))}
        </Group>
        <Group header="Важно">
          <div className="p-4 text-[15px] leading-snug text-label2">
            Все тексты загружены из открытых наборов данных без изменений; сайт ничего не добавляет от себя. Переводы смысла несовершенны, а наборы данных могут содержать опечатки.
            Для вопросов фикха и при сомнениях обращайтесь к печатным изданиям и знающим людям.
          </div>
        </Group>
      </div>
    </Screen>
  );
}
