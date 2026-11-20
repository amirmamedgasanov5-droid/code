import { AppProvider, type AppData } from '@/components/AppProvider';
import { Shell } from '@/components/Shell';
import { CHANNEL, getFeatured, getPosts } from '@/lib/posts';
import { qrPath } from '@/lib/qr';
import type { PostLite } from '@/lib/types';

export default function Page() {
  const full = getPosts();
  const all: PostLite[] = full.map(({ paragraphs: _p, ...rest }) => rest);
  const posts = all.slice(0, 30); // остальное подгружается при открытии ленты
  const num = (k: string) => Number((CHANNEL.counters[k] ?? '0').replace(/\D/g, '')) || 0;

  const data: AppData = {
    posts,
    total: Math.floor(CHANNEL.lastPostId / 100) * 100,
    featured: getFeatured(full),
    stats: [
      { value: Math.floor(CHANNEL.lastPostId / 100) * 100, suffix: '+', label: 'сообщений в канале' },
      { value: num('photos'), label: 'изображений' },
      { value: num('videos'), label: 'видео' },
      { value: num('links'), label: 'ссылок' },
    ].filter((s) => s.value > 0),
    telegramUrl: CHANNEL.url,
    qr: qrPath(CHANNEL.url),
    updated: new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }).format(new Date(CHANNEL.fetchedAt)).replace(/\s?г\.$/, ''),
    fridayPostId: all.find((p) => p.title.startsWith('Пятница'))?.id,
  };

  return (
    <AppProvider data={data}>
      <Shell />
      {/* Текст для поисковиков и чтения без JavaScript */}
      <div className="sr-only">
        <h1>Хидая — Telegram-канал для сестёр</h1>
        <p>Аяты и тафсир ас-Саади, хадисы, дуа и ежедневные напоминания на русском языке. Канал: {CHANNEL.url}</p>
        <ul>
          {all.slice(0, 12).map((p) => (
            <li key={p.id}>
              <a href={p.url}>{p.title}</a> — {p.preview}
            </li>
          ))}
        </ul>
      </div>
    </AppProvider>
  );
}
