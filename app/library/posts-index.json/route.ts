import { getPosts } from '@/lib/posts';

export const dynamic = 'force-static';

/** Лёгкий список всех публикаций (без текста) для ленты, поиска и закладок. */
export function GET() {
  return Response.json(getPosts().map(({ paragraphs: _p, ...rest }) => rest));
}
