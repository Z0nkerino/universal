import { addDays, format, startOfDay, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { DayKey } from './types';
import { useSettings } from './settings';
import { resolveLang } from './i18n';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export function dayKey(d: Date | number = new Date()): DayKey {
  const x = typeof d === 'number' ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function fromDayKey(k: DayKey): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayKey = () => dayKey(new Date());
export const addDaysKey = (k: DayKey, n: number) => dayKey(addDays(fromDayKey(k), n));

/** The last `n` day keys ending today (oldest first). */
export function lastNDays(n: number, end: Date = new Date()): DayKey[] {
  return Array.from({ length: n }, (_, i) => dayKey(addDays(startOfDay(end), i - n + 1)));
}

export function weekStart(d: Date) {
  return startOfWeek(d, { weekStartsOn: useSettings.getState().weekStart });
}

function locale() {
  return resolveLang(useSettings.getState().language) === 'ru' ? ru : undefined;
}

/** Formats with the user's language. */
export function fmt(d: Date | number, pattern: string) {
  return format(d, pattern, { locale: locale() });
}

/** 9:30 or 9:30 AM per the 12/24h setting. */
export function fmtTime(d: Date | number) {
  return format(d, useSettings.getState().clock === '24h' ? 'HH:mm' : 'h:mm a', { locale: locale() });
}

/** Compact hour label for timeline gutters. */
export function fmtHour(h: number) {
  if (useSettings.getState().clock === '24h') return `${String(h).padStart(2, '0')}:00`;
  const hh = h % 12 || 12;
  return `${hh} ${h < 12 ? 'AM' : 'PM'}`;
}

export function fmtDuration(min: number) {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const minutesOfDay = (t: number) => {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
};

export function atMinutes(day: Date | DayKey, minutes: number) {
  const d = typeof day === 'string' ? fromDayKey(day) : startOfDay(day);
  return d.getTime() + minutes * MIN;
}
