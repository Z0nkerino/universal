import type { Lang } from './nlp';
import type { Recurrence } from './types';

/** The repeat choices offered in task and event editors. */
export const REPEAT_PRESETS: { value: string; label: string; rule?: Recurrence }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day', rule: { freq: 'daily', interval: 1 } },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)', rule: { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] } },
  { value: 'weekly', label: 'Every week', rule: { freq: 'weekly', interval: 1 } },
  { value: 'biweekly', label: 'Every 2 weeks', rule: { freq: 'weekly', interval: 2 } },
  { value: 'monthly', label: 'Every month', rule: { freq: 'monthly', interval: 1 } },
  { value: 'yearly', label: 'Every year', rule: { freq: 'yearly', interval: 1 } },
];

const same = (a: Recurrence, b: Recurrence) =>
  a.freq === b.freq && (a.interval || 1) === (b.interval || 1) && [...(a.byDay ?? [])].sort().join() === [...(b.byDay ?? [])].sort().join();

/** The preset a rule matches, or 'custom' for anything else (e.g. "every Sunday"), which editors keep as is. */
export function repeatPreset(r?: Recurrence) {
  if (!r) return 'none';
  return REPEAT_PRESETS.find((p) => p.rule && same(p.rule, r))?.value ?? 'custom';
}

const DAYS = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  short: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ru: ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'],
  ruShort: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'],
};
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** "Every Sunday", "Every weekday", "Monthly on the 1st", "Каждое воскресенье"… `anchor` is the first occurrence. */
export function describeRepeat(r: Recurrence, lang: Lang, anchor?: number): string {
  const n = Math.max(1, r.interval || 1);
  const days = r.byDay ?? [];
  const weekdays = days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d));
  if (lang === 'ru') {
    if (r.freq === 'daily') return n === 1 ? 'Каждый день' : `Каждые ${n} дн.`;
    if (r.freq === 'weekly') {
      if (weekdays) return 'По будням';
      if (days.length === 1) return `${n === 2 ? 'Раз в две недели в' : [0, 3, 5, 6].includes(days[0]) ? 'Каждую' : 'Каждый'} ${DAYS.ru[days[0]]}`.replace('Каждую воскресенье', 'Каждое воскресенье').replace('Каждый воскресенье', 'Каждое воскресенье');
      if (days.length) return `Каждую неделю: ${days.map((d) => DAYS.ruShort[d]).join(', ')}`;
      return n === 1 ? 'Каждую неделю' : `Раз в ${n} нед.`;
    }
    if (r.freq === 'monthly') return anchor ? `Каждый месяц ${new Date(anchor).getDate()}-го` : 'Каждый месяц';
    return 'Каждый год';
  }
  if (r.freq === 'daily') return n === 1 ? 'Every day' : `Every ${n} days`;
  if (r.freq === 'weekly') {
    if (weekdays) return 'Every weekday';
    if (days.length === 1) return `Every ${n === 2 ? 'other ' : ''}${DAYS.en[days[0]]}`;
    if (days.length) return `Every ${days.map((d) => DAYS.short[d]).join(', ')}`;
    return n === 1 ? 'Every week' : `Every ${n} weeks`;
  }
  if (r.freq === 'monthly') return anchor ? `Monthly on the ${ordinal(new Date(anchor).getDate())}` : n === 1 ? 'Every month' : `Every ${n} months`;
  return n === 1 ? 'Every year' : `Every ${n} years`;
}
