import type { Category } from './types';

export const CATEGORIES: Category[] = [
  {
    id: 'quran',
    name: 'Коран',
    arabic: 'القرآن',
    translit: 'al-Qur’ān',
    blurb: 'Аяты, на которые опираются напоминания канала, — с переводом и пояснением к ним.',
  },
  {
    id: 'tafsir',
    name: 'Тафсир',
    arabic: 'التفسير',
    translit: 'at-Tafsīr',
    blurb: 'Толкование аятов: в канале это прежде всего тафсир шейха Абдуррахмана ас-Саади — по несколько аятов за раз.',
  },
  {
    id: 'hadith',
    name: 'Хадис',
    arabic: 'الحديث',
    translit: 'al-Ḥadīth',
    blurb: 'Слова и наставления Пророка ﷺ с указанием источников и разбором того, как им следовать.',
  },
  {
    id: 'reminders',
    name: 'Напоминания',
    arabic: 'تذكير',
    translit: 'Tadhkīr',
    blurb: 'Короткие размышления о сердце, времени и ответственности — чтобы остановиться посреди дня.',
  },
  {
    id: 'dua',
    name: 'Дуа и зикр',
    arabic: 'الدعاء',
    translit: 'ad-Duʿāʾ',
    blurb: 'Мольбы и поминание Аллаха: что читать и когда — утренние азкары, последний час пятницы.',
  },
  {
    id: 'knowledge',
    name: 'Исламские знания',
    arabic: 'العلم',
    translit: 'al-ʿIlm',
    blurb: 'Слова учёных, разъяснения по вопросам веры и повседневной жизни, фетвы с указанием источников.',
  },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
  Category['id'],
  Category
>;
