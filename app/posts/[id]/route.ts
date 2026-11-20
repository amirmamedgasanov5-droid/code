import { getPosts } from '@/lib/posts';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return getPosts().map((p) => ({ id: `${p.id}.json` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = getPosts().find((p) => `${p.id}.json` === id);
  if (!post) return new Response('not found', { status: 404 });
  return Response.json({ id: post.id, paragraphs: post.paragraphs });
}
