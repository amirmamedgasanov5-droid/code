import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab, PrayerTimes, Qibla } from 'adhan';

export type Place = { id: string; name: string; lat: number; lng: number; tz: string };

export const PLACES: Place[] = [
  { id: 'moscow', name: 'Москва', lat: 55.7558, lng: 37.6173, tz: 'Europe/Moscow' },
  { id: 'spb', name: 'Санкт-Петербург', lat: 59.9311, lng: 30.3609, tz: 'Europe/Moscow' },
  { id: 'kazan', name: 'Казань', lat: 55.7887, lng: 49.1221, tz: 'Europe/Moscow' },
  { id: 'makhachkala', name: 'Махачкала', lat: 42.9849, lng: 47.5047, tz: 'Europe/Moscow' },
  { id: 'grozny', name: 'Грозный', lat: 43.3181, lng: 45.6949, tz: 'Europe/Moscow' },
  { id: 'ufa', name: 'Уфа', lat: 54.7388, lng: 55.9721, tz: 'Asia/Yekaterinburg' },
  { id: 'ekb', name: 'Екатеринбург', lat: 56.8389, lng: 60.6057, tz: 'Asia/Yekaterinburg' },
  { id: 'nsk', name: 'Новосибирск', lat: 55.0084, lng: 82.9357, tz: 'Asia/Novosibirsk' },
  { id: 'baku', name: 'Баку', lat: 40.4093, lng: 49.8671, tz: 'Asia/Baku' },
  { id: 'almaty', name: 'Алматы', lat: 43.2389, lng: 76.8897, tz: 'Asia/Almaty' },
  { id: 'tashkent', name: 'Ташкент', lat: 41.2995, lng: 69.2401, tz: 'Asia/Tashkent' },
  { id: 'istanbul', name: 'Стамбул', lat: 41.0082, lng: 28.9784, tz: 'Europe/Istanbul' },
];

export const PRAYER_NAMES = [
  { key: 'fajr', name: 'Фаджр' },
  { key: 'sunrise', name: 'Восход' },
  { key: 'dhuhr', name: 'Зухр' },
  { key: 'asr', name: 'Аср' },
  { key: 'maghrib', name: 'Магриб' },
  { key: 'isha', name: 'Иша' },
] as const;
export type PrayerKey = (typeof PRAYER_NAMES)[number]['key'];

function timesFor(p: Place, date: Date) {
  const c = new Coordinates(p.lat, p.lng);
  const params = CalculationMethod.MuslimWorldLeague();
  params.madhab = Madhab.Shafi;
  params.highLatitudeRule = HighLatitudeRule.recommended(c);
  return new PrayerTimes(c, date, params);
}

/** Времена на сегодня и ближайшая следующая отметка (если день закончился — фаджр завтра). */
export function schedule(p: Place, now: Date) {
  const t = timesFor(p, now);
  const list = PRAYER_NAMES.map((n) => ({ ...n, at: t[n.key] as Date }));
  let next = list.find((x) => x.at.getTime() > now.getTime());
  let tomorrow = false;
  if (!next) {
    const tm = timesFor(p, new Date(now.getTime() + 864e5));
    next = { ...PRAYER_NAMES[0], at: tm.fajr };
    tomorrow = true;
  }
  return { list, next, tomorrow };
}

export const qibla = (p: Place) => Math.round(Qibla(new Coordinates(p.lat, p.lng)));

export const fmtTime = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit', timeZone: tz, hour12: false }).format(d);

export function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h} ч ${String(m).padStart(2, '0')} мин` : `${m}:${String(ss).padStart(2, '0')}`;
}
