export const HADITH_NAMES: Record<string, { ru: string; ar: string; author: string }> = {
  bukhari: { ru: 'Сахих аль-Бухари', ar: 'صحيح البخاري', author: 'Имам аль-Бухари' },
  muslim: { ru: 'Сахих Муслим', ar: 'صحيح مسلم', author: 'Имам Муслим' },
  abudawud: { ru: 'Сунан Абу Дауда', ar: 'سنن أبي داود', author: 'Имам Абу Дауд' },
};
export const BISMILLAH = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';
export const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
