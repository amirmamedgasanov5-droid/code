'use client';

import { useEffect, useState } from 'react';
import { useApp } from './AppProvider';

/** «Сегодня»: дата по хиджре считается в браузере (Intl), без внешних сервисов. */
export function Today({ fridayPostId }: { fridayPostId?: number }) {
  const { open } = useApp();
  const [info, setInfo] = useState<{ greg: string; hijri: string; friday: boolean } | null>(null);

  useEffect(() => {
    const now = new Date();
    let hijri = '';
    try {
      hijri = new Intl.DateTimeFormat('ru-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' })
        .format(now)
        .replace(/\s*г\.\s*(AH|АН)\s*$/i, '')
        .replace(/\s*(AH|АН)\s*$/i, '');
    } catch {}
    setInfo({
      greg: new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long' }).format(now),
      hijri,
      friday: now.getDay() === 5,
    });
  }, []);

  return (
    <div className="min-h-[3.2rem] text-sm" aria-live="polite">
      {info && (
        <>
          <p className="eyebrow mb-2 !text-mute">Сегодня</p>
          <p className="text-ink first-letter:uppercase">{info.greg}</p>
          {info.hijri && <p className="text-mute">{info.hijri} г. х.</p>}
          {info.friday && fridayPostId && (
            <button onClick={() => open(fridayPostId)} className="u-link mt-2 text-forest">
              Пятница — сунны этого дня
            </button>
          )}
        </>
      )}
    </div>
  );
}
