import { BookOpen, GraduationCap, HandHeart, Heart, Quote, ScrollText, type LucideIcon } from 'lucide-react';
import type { CategoryId } from '@/lib/types';

export const CAT_META: Record<CategoryId, { Icon: LucideIcon; color: string }> = {
  quran: { Icon: BookOpen, color: '#2f7d5b' },
  tafsir: { Icon: ScrollText, color: '#2b6e8f' },
  hadith: { Icon: Quote, color: '#b8893b' },
  reminders: { Icon: Heart, color: '#c0566b' },
  dua: { Icon: HandHeart, color: '#6b5bb0' },
  knowledge: { Icon: GraduationCap, color: '#7a5c45' },
};

export function CatIcon({ id, size = 34 }: { id: CategoryId; size?: number }) {
  const { Icon, color } = CAT_META[id];
  return (
    <span className="grid shrink-0 place-items-center text-white" style={{ width: size, height: size, borderRadius: size * 0.28, background: color }}>
      <Icon size={size * 0.56} strokeWidth={2} />
    </span>
  );
}
