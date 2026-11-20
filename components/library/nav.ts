'use client';
import { HADITH_NAMES } from '@/lib/library-meta';
import { useApp, type Route } from '../AppProvider';

export function routeLabel(r?: Route): string {
  if (!r) return 'Библиотека';
  switch (r.k) {
    case 'quran':
      return 'Коран';
    case 'hadith':
      return 'Хадисы';
    case 'coll':
      return HADITH_NAMES[r.c]?.ru ?? 'Сборник';
    case 'hisn':
      return 'Хисн аль-Муслим';
    case 'sura':
      return 'Сура';
    case 'book':
      return 'Книга';
    default:
      return 'Назад';
  }
}

/** Кнопка «Назад» с названием предыдущего экрана */
export function useBack() {
  const { stack, pop } = useApp();
  return { label: routeLabel(stack[stack.length - 2]), onClick: pop };
}
