import { About } from '@/components/About';
import { AppProvider } from '@/components/AppProvider';
import { Community } from '@/components/Community';
import { Featured } from '@/components/Featured';
import { Footer } from '@/components/Footer';
import { Hero } from '@/components/Hero';
import { Knowledge } from '@/components/Knowledge';
import { Nav } from '@/components/Nav';
import { Publications } from '@/components/Publications';
import { CATEGORIES } from '@/lib/categories';
import { CHANNEL, countByCategory, getFeatured, getPosts } from '@/lib/posts';
import type { PostLite } from '@/lib/types';

export default function Page() {
  const full = getPosts();
  const posts: PostLite[] = full.map(({ paragraphs: _p, ...rest }) => rest);
  const counts = countByCategory(full);
  const featured = getFeatured(full);
  const friday = posts.find((p) => /пятниц/i.test(p.title) || p.title.startsWith('Пятница'))?.id;

  const items = CATEGORIES.map((c) => ({
    id: c.id,
    count: counts[c.id],
    latest: posts.find((p) => p.category === c.id) ?? null,
  }));

  const num = (k: string) => Number((CHANNEL.counters[k] ?? '0').replace(/\D/g, '')) || 0;
  const stats = [
    { value: Math.floor(CHANNEL.lastPostId / 100) * 100, suffix: '+', label: 'сообщений в канале' },
    { value: num('photos'), label: 'изображений' },
    { value: num('videos'), label: 'видео' },
  ].filter((s) => s.value > 0);

  const updated = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }).format(
    new Date(CHANNEL.fetchedAt),
  );

  return (
    <AppProvider posts={posts} telegramUrl={CHANNEL.url}>
      <Nav />
      <main id="main">
        <Hero fridayPostId={friday} />
        <About stats={stats} />
        <Knowledge items={items} />
        <Publications total={Math.floor(CHANNEL.lastPostId / 100) * 100} />
        <Featured items={featured} posts={posts} />
        <Community telegramUrl={CHANNEL.url} latest={posts[0] ?? null} />
      </main>
      <Footer telegramUrl={CHANNEL.url} updated={updated} />
    </AppProvider>
  );
}
