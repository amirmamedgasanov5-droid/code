'use client';

import { motion } from 'framer-motion';
import { ArrowUpRight, ExternalLink, Globe } from 'lucide-react';
import { useApp } from '../AppProvider';
import { QrCode } from '../QrCode';
import { Screen } from '../Screen';
import { Button, Group, Row } from '../ui';

const STEPS = ['Откройте канал по кнопке или наведите камеру на QR-код.', 'Нажмите «Присоединиться» в Telegram.', 'Включите уведомления, чтобы напоминания приходили вовремя.'];

export function ChannelView() {
  const { telegramUrl, stats, updated, posts, qr, go } = useApp();
  return (
    <Screen title="Канал" subtitle="Хидая живёт в Telegram. Здесь — всё, что нужно, чтобы присоединиться." back={{ label: 'Главная', onClick: () => go('home') }}>
      <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 22 }} className="relative overflow-hidden rounded-[20px] p-7 text-white" style={{ background: '#1f6b43' }}>
          
          <div className="relative flex items-center gap-4">
            <span lang="ar" className="grid size-16 place-items-center rounded-[18px] bg-white/15 pb-2 text-[3.2rem] leading-none text-white">ه</span>
            <div>
              <p className="text-[22px] font-bold leading-tight tracking-[-0.03em]">𝐇𝐈𝐃𝐀𝐘𝐀</p>
              <p className="text-[15px] opacity-75">@hidaya_islam1 · Telegram-канал</p>
            </div>
          </div>
          <p className="relative mt-8 text-[2.1rem] font-bold leading-[1.05] tracking-[-0.04em]">Присоединяйтесь к&nbsp;Хидае</p>
          <p className="relative mt-3 max-w-sm text-[16px] leading-snug opacity-85">Канал в Telegram: напоминания, тафсир ас-Саади и сунны дня. Вход только для сестёр.</p>
          <motion.a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            whileTap={{ scale: 0.94 }}
            whileHover={{ scale: 1.03 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="relative mt-7 inline-flex h-[52px] items-center gap-2 rounded-full bg-white px-7 text-[17px] font-semibold text-[#0b2a1d]"
          >
            Открыть в Telegram <ArrowUpRight size={19} strokeWidth={2.4} />
          </motion.a>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 22, delay: 0.08 }} className="grid place-items-center rounded-[20px] bg-surface p-7 text-center">
          <div className="size-[11rem] overflow-hidden rounded-[22px] border border-sep bg-white p-1.5"><QrCode qr={qr} label="QR-код со ссылкой на Telegram-канал Хидаи" /></div>
          <p className="mt-4 max-w-[15rem] text-[15px] leading-snug text-label2">Наведите камеру телефона на код — канал откроется в Telegram.</p>
          <p className="mt-1 text-[14px] font-semibold text-tint">t.me/hidaya_islam1</p>
        </motion.div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Group header="Как присоединиться">
          {STEPS.map((s, i) => (
            <Row key={s} chevron={false} last={i === STEPS.length - 1}>
              <div className="flex items-center gap-3.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-tint-soft text-[15px] font-bold text-tint">{i + 1}</span>
                <span className="text-[16px] leading-snug">{s}</span>
              </div>
            </Row>
          ))}
        </Group>
        <Group header="В канале" footer={`На сайте — ${posts.length} текстовых публикаций канала. Данные обновлены ${updated}.`}>
          {stats.map((s) => (
            <Row key={s.label} chevron={false}>
              <div className="flex items-center justify-between">
                <span className="text-[16px]">{s.label}</span>
                <span className="text-[16px] font-semibold tabular-nums text-label2">
                  {s.value.toLocaleString('ru-RU')}
                  {s.suffix}
                </span>
              </div>
            </Row>
          ))}
          <Row href="https://t.me/s/hidaya_islam1" chevron={false} last>
            <div className="flex items-center gap-2.5 text-tint">
              <Globe size={19} strokeWidth={2} />
              <span className="flex-1 text-[16px] font-medium">Веб-лента канала</span>
              <ExternalLink size={16} />
            </div>
          </Row>
        </Group>
      </div>
    </Screen>
  );
}
