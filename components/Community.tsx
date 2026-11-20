import { Button } from './Button';
import { Lines, Reveal } from './motion';
import { QrCode } from './QrCode';
import { StarMark } from './Geometry';
import type { PostLite } from '@/lib/types';
import { ring, star } from '@/lib/geometry';

const STEPS = [
  'Откройте канал по кнопке или наведите камеру на QR-код.',
  'Нажмите «Присоединиться» в Telegram.',
  'Включите уведомления, чтобы напоминания приходили вовремя.',
];

function BigStar() {
  return (
    <svg viewBox="-310 -310 620 620" fill="none" aria-hidden className="pointer-events-none absolute -right-[30%] -top-[8%] w-[60rem] max-w-none opacity-[0.22] lg:-right-[12%]">
      <g className="spin-slow" stroke="#d3c195" strokeWidth="0.8" strokeLinejoin="round">
        <path d={star(8, 2, 290, 0)} />
        <path d={star(8, 3, 222, 22.5)} />
        <path d={ring(8, 222, 22.5)} strokeOpacity=".6" />
        <path d={ring(16, 298, 0)} strokeOpacity=".5" />
      </g>
    </svg>
  );
}

export function Community({ telegramUrl, latest }: { telegramUrl: string; latest: PostLite | null }) {
  return (
    <section id="community" className="on-dark relative isolate overflow-hidden rounded-t-[2.25rem] bg-forest-deep px-5 pb-28 pt-28 text-ivory sm:rounded-t-[4rem] sm:px-8 sm:pb-36 sm:pt-40 lg:px-12">
      <div aria-hidden className="lattice-light pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [mask-image:radial-gradient(70%_60%_at_20%_30%,black,transparent)]" />
      <BigStar />

      <div className="relative mx-auto grid max-w-[88rem] gap-16 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-7">
          <Reveal>
            <p className="eyebrow flex items-center gap-3 !text-gold-soft">
              <span className="h-px w-8 bg-gold" /> Сообщество
            </p>
          </Reveal>
          <Lines
            className="font-display mt-8 text-[clamp(2.7rem,6.4vw,5.9rem)] font-medium leading-[0.94] tracking-[-0.025em]"
            lines={['Присоединяйтесь', <span key="i" className="italic text-gold-soft">к Хидае</span>]}
          />
          <Reveal delay={0.1}>
            <p className="mt-8 max-w-[32rem] text-[1.1875rem] leading-[1.65] text-ivory/75">
              Напоминания приходят прямо в Telegram — коротко и без лишних шагов. Вход в канал — только для сестёр.
            </p>
          </Reveal>
          <Reveal delay={0.2} className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Button href={telegramUrl} external variant="light">
              Открыть канал в Telegram
            </Button>
            <span className="text-sm text-ivory/55">t.me/hidaya_islam1</span>
          </Reveal>

          <ol className="mt-16 max-w-[32rem] divide-y divide-ivory/12 border-y border-ivory/12">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s} delay={i * 0.08} className="grid grid-cols-[2.5rem_1fr] items-baseline py-5">
                <span className="font-display text-xl italic text-gold-soft">{i + 1}</span>
                <span className="text-ivory/80">{s}</span>
              </Reveal>
            ))}
          </ol>
        </div>

        <Reveal delay={0.15} className="lg:col-span-5 lg:pt-6">
          <div className="rounded-[1.75rem] border border-ivory/15 bg-ivory/[0.04] p-7 backdrop-blur-sm sm:p-9">
            <div className="flex items-center gap-4">
              <span className="grid size-14 place-items-center rounded-full border border-ivory/20">
                <StarMark size={30} stroke="#f5f0e6" accent="#d3c195" />
              </span>
              <div>
                <p className="text-[1.05rem] font-medium leading-tight">𝐇𝐈𝐃𝐀𝐘𝐀</p>
                <p className="text-sm text-ivory/55">@hidaya_islam1 · Telegram-канал</p>
              </div>
            </div>

            {latest && (
              <div className="mt-8 border-t border-ivory/12 pt-6">
                <p className="eyebrow !text-gold-soft">Последнее в канале · {latest.dateLabel}</p>
                <p className="font-display mt-3 text-[1.7rem] font-medium leading-[1.12]">{latest.title}</p>
                <p className="mt-3 line-clamp-3 text-[0.95rem] leading-[1.65] text-ivory/65">{latest.preview}</p>
                <a href={latest.url} target="_blank" rel="noopener noreferrer" className="u-link mt-4 inline-block text-[0.95rem] text-gold-soft">
                  Читать в Telegram
                </a>
              </div>
            )}

            <div className="mt-8 flex items-center gap-5 border-t border-ivory/12 pt-6">
              <div className="size-[7.5rem] shrink-0 overflow-hidden rounded-xl">
                <QrCode value={telegramUrl} label="QR-код со ссылкой на Telegram-канал Хидаи" />
              </div>
              <p className="text-sm leading-relaxed text-ivory/65">
                Уже за компьютером? Наведите камеру телефона на код — канал откроется в Telegram.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
