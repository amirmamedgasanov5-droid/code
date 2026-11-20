'use client';

import { animate, motion, useInView, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Reveal } from './motion';

function Word({ w, p, range }: { w: string; p: MotionValue<number>; range: [number, number] }) {
  const o = useTransform(p, range, [0.16, 1]);
  return (
    <motion.span style={{ opacity: o }} className="inline-block">
      {w}&nbsp;
    </motion.span>
  );
}

/** Текст «проявляется» по словам вслед за прокруткой. */
function Statement({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.82', 'end 0.5'] });
  const words = text.split(' ');
  return (
    <p
      ref={ref}
      className="font-display text-[clamp(2.1rem,5vw,4.1rem)] font-medium leading-[1.08] tracking-[-0.015em]"
      aria-label={text}
    >
      {reduce
        ? text
        : words.map((w, i) => (
            <Word key={i} w={w} p={scrollYProgress} range={[i / words.length, Math.min(1, (i + 3) / words.length)]} />
          ))}
    </p>
  );
}

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : 0);
  useEffect(() => {
    if (!inView || reduce) return;
    const c = animate(0, to, { duration: 2.2, ease: [0.16, 1, 0.3, 1], onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [inView, to, reduce]);
  return (
    <span ref={ref} className="tabular-nums">
      {v.toLocaleString('ru-RU').replace(/ /g, ' ')}
      {suffix}
    </span>
  );
}

const PRINCIPLES = [
  { n: 'I', t: 'Для сестёр', d: 'Вход — только для сестёр. Так сказано в описании канала.' },
  { n: 'II', t: 'С источниками', d: 'Аяты, хадисы и толкования приводятся со ссылками на суры, сборники и книги — их можно проверить и читать дальше.' },
  { n: 'III', t: 'Каждый день', d: 'Новое напоминание появляется почти ежедневно, а по пятницам — сунны этого дня.' },
];

export function About({ stats }: { stats: { value: number; suffix?: string; label: string }[] }) {
  return (
    <section id="about" className="relative px-5 py-28 sm:px-8 sm:py-40 lg:px-12">
      <div className="mx-auto grid max-w-[88rem] gap-12 lg:grid-cols-12 lg:gap-8">
        <Reveal className="lg:col-span-3">
          <p className="eyebrow flex items-center gap-3">
            <span className="h-px w-8 bg-gold" /> О Хидае
          </p>
          <p lang="ar" dir="rtl" className="mt-6 text-[2.2rem] leading-none text-forest">هداية</p>
          <p className="mt-2 max-w-[14rem] text-sm text-mute">hidāya — руководство, наставление на прямой путь</p>
        </Reveal>

        <div className="lg:col-span-9">
          <Statement text="Хидая — тихое место в ленте. Один аят, слово учёного, напоминание, после которого хочется помолчать. Без шума — только то, что оживляет сердце." />

          <div className="mt-16 grid gap-10 sm:grid-cols-2 sm:gap-14">
            <Reveal>
              <h3 className="eyebrow !text-ink">Миссия</h3>
              <p className="mt-4 text-[1.0625rem] leading-[1.75] text-ink/80">
                Напоминать о главном — о сердце, поминании Аллаха и подготовке к вечной жизни — коротко, ясно и там, где ты и так проводишь день:
                в Telegram. Без споров и суеты, с опорой на Коран, Сунну и слова учёных.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <h3 className="eyebrow !text-ink">Что внутри</h3>
              <p className="mt-4 text-[1.0625rem] leading-[1.75] text-ink/80">
                Тафсир шейха Абдуррахмана ас-Саади по несколько аятов за раз, хадисы с источниками, мольбы и азкары, размышления о времени и
                сердце, разъяснения по вопросам веры и семьи.
              </p>
            </Reveal>
          </div>

          <ol className="mt-20 divide-y divide-line border-y border-line">
            {PRINCIPLES.map((p, i) => (
              <Reveal as="li" key={p.n} delay={i * 0.06} className="group grid grid-cols-[3rem_1fr] items-baseline gap-x-4 gap-y-2 py-7 sm:grid-cols-[5rem_16rem_1fr]">
                <span className="font-display text-xl italic text-gold">{p.n}</span>
                <h3 className="font-display text-[1.9rem] font-medium leading-none transition-transform duration-700 ease-expo group-hover:translate-x-2">{p.t}</h3>
                <p className="col-start-2 text-mute sm:col-start-3">{p.d}</p>
              </Reveal>
            ))}
          </ol>

          <dl className="mt-16 grid grid-cols-3 gap-4">
            {stats.map((s) => (
              <Reveal key={s.label} className="min-w-0">
                <dd className="font-display text-[clamp(2.2rem,6vw,4.6rem)] font-medium leading-none tracking-tight text-forest">
                  <CountUp to={s.value} suffix={s.suffix} />
                </dd>
                <dt className="mt-3 text-[0.8rem] leading-snug text-mute sm:text-sm">{s.label}</dt>
              </Reveal>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
