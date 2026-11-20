'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { useApp } from './AppProvider';
import { Button } from './Button';
import { Emblem } from './Geometry';
import { EXPO, Lines, Magnetic } from './motion';
import { Today } from './Today';

export function Hero({ fridayPostId }: { fridayPostId?: number }) {
  const { ready, telegramUrl } = useApp();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const lift = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const rot = useTransform(scrollYProgress, [0, 1], [0, 28]);

  const rise = (d: number) => ({
    initial: { opacity: 0, y: 24 },
    animate: ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 },
    transition: { duration: 1.1, delay: d, ease: EXPO },
  });

  return (
    <section ref={ref} id="top" className="relative isolate overflow-hidden pt-[4.5rem]">
      <div
        aria-hidden
        className="lattice pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [mask-image:radial-gradient(60%_60%_at_72%_42%,black,transparent_78%)]"
      />

      <div className="mx-auto grid min-h-[calc(100svh-4.5rem)] max-w-[88rem] grid-cols-1 items-center gap-6 px-5 pb-10 pt-8 sm:px-8 lg:grid-cols-12 lg:gap-8 lg:px-12 lg:pb-14">
        <motion.div style={{ y: lift, opacity: fade }} className="order-2 lg:order-1 lg:col-span-7">
          <motion.p {...rise(0.05)} className="eyebrow flex items-center gap-3">
            <span className="h-px w-8 bg-gold" /> Telegram-канал · для сестёр
          </motion.p>

          <Lines
            as="h1"
            on="ready"
            delay={0.12}
            className="font-display mt-6 text-[clamp(3.4rem,min(10.5vw,14.5vh),8.6rem)] font-medium leading-[0.9] tracking-[-0.025em]"
            lines={['Прямой путь', 'начинается', <span key="h" className="italic text-forest">с сердца.</span>]}
          />

          <motion.p {...rise(0.7)} className="mt-6 max-w-[33rem] text-[1.1875rem] leading-[1.6] text-ink/80">
            <span className="font-medium text-ink">Хидая</span> — «наставление на прямой путь». Аяты и тафсир, хадисы и дуа, короткие напоминания —
            спокойно, с источниками и на русском.
          </motion.p>

          <motion.div {...rise(0.85)} className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-3">
            <Magnetic>
              <Button href={telegramUrl} external>
                Присоединиться в Telegram
              </Button>
            </Magnetic>
            <Button href="#publications" variant="ghost" icon="down">
              Читать публикации
            </Button>
          </motion.div>

          <motion.div {...rise(1.05)} className="mt-9 grid max-w-[33rem] grid-cols-1 gap-8 border-t border-line pt-6 sm:grid-cols-2">
            <figure>
              <p className="eyebrow mb-2 !text-mute">Сура «Аль-Фатиха», 1:6</p>
              <blockquote>
                <p lang="ar" dir="rtl" className="quran text-[1.7rem] leading-[1.9] text-forest-deep">
                  ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ
                </p>
                <p className="font-display text-[1.35rem] italic leading-tight text-ink">«Веди нас прямым путём»</p>
              </blockquote>
            </figure>
            <Today fridayPostId={fridayPostId} />
          </motion.div>
        </motion.div>

        <motion.div
          className="order-1 mx-auto w-[min(78vw,26rem)] lg:order-2 lg:col-span-5 lg:w-full lg:max-w-[40rem]"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={ready ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.94 }}
          transition={{ duration: 1.6, ease: EXPO }}
          style={{ rotate: rot }}
        >
          <Emblem animate />
        </motion.div>
      </div>

      <motion.a
        href="#about"
        aria-label="Прокрутить вниз"
        {...rise(1.4)}
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-mute lg:flex"
      >
        <span className="eyebrow">Листать</span>
        <span className="relative h-10 w-px overflow-hidden bg-line">
          <motion.span
            className="absolute inset-x-0 top-0 h-1/2 bg-gold"
            animate={{ y: ['-100%', '200%'] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </span>
      </motion.a>
    </section>
  );
}
