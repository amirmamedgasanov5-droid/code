export type CategoryId = 'quran' | 'tafsir' | 'hadith' | 'reminders' | 'dua' | 'knowledge';

export type Paragraph = { t: string; q?: boolean };

export type RawPost = { id: number; date: string; paragraphs: Paragraph[] };

export type Post = {
  id: number;
  url: string;
  date: string; // ISO
  dateLabel: string;
  title: string;
  preview: string;
  category: CategoryId;
  paragraphs: Paragraph[];
  minutes: number;
};

export type Category = {
  id: CategoryId;
  name: string;
  arabic: string;
  translit: string;
  blurb: string;
};

export type FeaturedItem = {
  postId: number;
  kind: 'quote' | 'ayah';
  text: string;
  arabic?: string;
  source: string;
};

/** Облегчённая публикация для клиента: полный текст подгружается из /posts/<id>.json */
export type PostLite = Omit<Post, 'paragraphs'>;
