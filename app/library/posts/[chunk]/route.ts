import { getPosts } from '@/lib/posts';

export const dynamic = 'force-static';
export const dynamicParams = false;

/** Тексты публикаций пачками по 50 id: /library/posts/c80.json */
const chunkOf = (id: number) => Math.floor(id / 50);


export function generateStaticParams() {
  return [...new Set(getPosts().map((p) => chunkOf(p.id)))].map((c) => ({ chunk: `c${c}.json` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ chunk: string }> }) {
  const { chunk } = await params;
  const c = Number(chunk.replace(/\D/g, ''));
  const out: Record<number, unknown> = {};
  for (const p of getPosts()) if (chunkOf(p.id) === c) out[p.id] = p.paragraphs;
  return Response.json(out);
}
