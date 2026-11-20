'use client';

import { CATEGORY_BY_ID } from '@/lib/categories';
import type { PostLite } from '@/lib/types';
import { useApp } from './AppProvider';
import { CAT_META } from './catMeta';
import { Row } from './ui';

export function PostRow({ post, last }: { post: PostLite; last?: boolean }) {
  const { open } = useApp();
  return (
    <Row onClick={() => open(post.id)} last={last} className="py-4">
      <div className="flex items-center gap-2 text-[13px] text-label2">
        <span className="size-2 rounded-full" style={{ background: CAT_META[post.category].color }} />
        <span className="font-medium">{CATEGORY_BY_ID[post.category].name}</span>
        <span>· {post.dateLabel}</span>
      </div>
      <p className="mt-1.5 text-[18px] font-semibold leading-[1.22] tracking-[-0.022em]">{post.title}</p>
      <p className="mt-1 line-clamp-2 text-[15px] leading-snug text-label2">{post.preview}</p>
    </Row>
  );
}
