import { NAV } from '@/lib/nav';
import { StarMark } from './Geometry';

export function Footer({ telegramUrl, updated }: { telegramUrl: string; updated: string }) {
  return (
    <footer className="on-dark relative overflow-hidden bg-forest-deep px-5 pb-10 pt-4 text-ivory sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[88rem]">
        <div className="grid gap-12 border-t border-ivory/12 pt-14 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <a href="#top" className="inline-flex items-center gap-3" aria-label="Хидая — наверх">
              <StarMark size={32} stroke="#f5f0e6" accent="#d3c195" />
              <span className="font-display text-3xl font-semibold leading-none">Хидая</span>
            </a>
            <p className="mt-5 max-w-sm text-[0.95rem] leading-relaxed text-ivory/60">
              Витрина Telegram-канала @hidaya_islam1: аяты, тафсир, хадисы, дуа и напоминания для сестёр.
            </p>
          </div>

          <nav aria-label="Разделы сайта" className="lg:col-span-3 lg:col-start-7">
            <p className="eyebrow !text-gold-soft">Разделы</p>
            <ul className="mt-5 space-y-3">
              {NAV.map((n) => (
                <li key={n.id}>
                  <a href={`#${n.id}`} className="u-link text-ivory/80">
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="lg:col-span-3">
            <p className="eyebrow !text-gold-soft">Telegram</p>
            <ul className="mt-5 space-y-3">
              <li>
                <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="u-link text-ivory/80">
                  Канал @hidaya_islam1
                </a>
              </li>
              <li>
                <a href="https://t.me/s/hidaya_islam1" target="_blank" rel="noopener noreferrer" className="u-link text-ivory/80">
                  Веб-лента канала
                </a>
              </li>
            </ul>
          </div>
        </div>

        <p aria-hidden lang="ar" dir="rtl" className="select-none pt-16 text-center text-[clamp(7rem,28vw,22rem)] leading-[0.9] text-ivory/[0.045]">
          هداية
        </p>

        <div className="mt-6 flex flex-col gap-3 border-t border-ivory/12 pt-6 text-[0.8rem] text-ivory/45 sm:flex-row sm:justify-between">
          <p>Тексты публикаций принадлежат каналу @hidaya_islam1 и их авторам. Публикации синхронизированы: {updated}.</p>
          <a href="#top" className="u-link self-start text-ivory/70 sm:self-auto">
            Наверх ↑
          </a>
        </div>
      </div>
    </footer>
  );
}
