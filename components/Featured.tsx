'use client';

import { ArrowRight } from 'lucide-react';
import type { FeaturedItem, PostLite } from '@/lib/types';
import { useApp } from './AppProvider';
import { Lines, Reveal } from './motion';

function ReadLink({ id }: { id: number }) {
  const { open } = useApp();
  return (
    <button onClick={() => open(id)} className="group mt-8 inline-flex items-center gap-2 text-[0.95rem] font-medium text-forest">
      <span className="u-link pb-0.5">Читать публикацию полностью</span>
      <ArrowRight size={16} strokeWidth={1.6} className="transition-transform duration-500 ease-expo group-hover:translate-x-1" />
    </button>
  );
}

export function Featured({ items, posts }: { items: FeaturedItem[]; posts: PostLite[] }) {
  if (!items.length) return null;
  const [lead, ...rest] = items;
  const dateOf = (id: number) => posts.find((p) => p.id === id)?.dateLabel;

  return (
    <section id="featured" className="relative px-5 py-28 sm:px-8 sm:py-40 lg:px-12">
      <div className="mx-auto max-w-[88rem]">
        <header className="grid gap-8 lg:grid-cols-12">
          <Reveal className="lg:col-span-3">
            <p className="eyebrow flex items-center gap-3">
              <span className="h-px w-8 bg-gold" /> Избранное
            </p>
          </Reveal>
          <div className="lg:col-span-9">
            <Lines
              lines={['Слова, к которым', <span key="i" className="italic text-forest">хочется вернуться</span>]}
              className="font-display text-[clamp(2.6rem,7vw,5.6rem)] font-medium leading-[0.98] tracking-[-0.02em]"
            />
          </div>
        </header>

        <div className="mt-16 grid gap-0 border-t border-ink/80 lg:mt-24 lg:grid-cols-12">
          <Reveal className="py-12 lg:col-span-7 lg:border-r lg:border-line lg:py-16 lg:pr-16">
            <span aria-hidden className="mb-8 block h-px w-14 bg-gold" />
            <blockquote>
              <p className="font-display text-[clamp(2.2rem,4.6vw,4.2rem)] font-medium italic leading-[1.08] tracking-[-0.015em] text-forest-deep">
                «{lead.text}»
              </p>
              <footer className="mt-8 text-sm text-mute">
                {lead.source}
                {dateOf(lead.postId) && <> · {dateOf(lead.postId)}</>}
              </footer>
            </blockquote>
            <ReadLink id={lead.postId} />
          </Reveal>

          <div className="lg:col-span-5">
            {rest.map((f, i) => (
              <Reveal key={f.postId + f.text.slice(0, 8)} delay={0.1 * (i + 1)} className="border-t border-line py-12 first:border-t-0 max-lg:border-t lg:py-14 lg:pl-14 lg:[&:not(:first-child)]:border-t">
                {f.kind === 'ayah' && f.arabic ? (
                  <>
                    <p lang="ar" dir="rtl" className="quran text-[clamp(1.7rem,3vw,2.35rem)] leading-[2.1] text-forest-deep">
                      {f.arabic}
                    </p>
                    <p className="font-display mt-5 text-[1.55rem] leading-[1.25] text-ink">{f.text}</p>
                  </>
                ) : (
                  <p className="font-display text-[clamp(1.7rem,2.6vw,2.2rem)] italic leading-[1.2] text-ink">«{f.text}»</p>
                )}
                <p className="mt-5 text-sm text-mute">{f.source}</p>
                <ReadLink id={f.postId} />
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
