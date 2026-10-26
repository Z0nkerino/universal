import { addDays, startOfWeek } from 'date-fns';
import type { Habit } from '@/lib/types';
import { dayKey, fromDayKey } from '@/lib/dates';

/** Progress toward the habit's target in the period containing `day` (0–1, may exceed 1). */
export function periodProgress(h: Habit, logs: Set<string>, day: Date, weekStartsOn: 0 | 1) {
  if (h.period === 'day') return (logs.has(dayKey(day)) ? 1 : 0) / Math.max(1, h.target);
  const ws = startOfWeek(day, { weekStartsOn });
  let n = 0;
  for (let i = 0; i < 7; i++) if (logs.has(dayKey(addDays(ws, i)))) n++;
  return n / Math.max(1, h.target);
}

/**
 * Current streak in periods (days for daily habits, weeks for weekly ones). The current
 * period counts if it's already met, and doesn't break the streak if it's still in progress.
 */
export function currentStreak(h: Habit, logs: Set<string>, today: Date, weekStartsOn: 0 | 1) {
  let streak = 0;
  if (h.period === 'day') {
    let d = today;
    if (!logs.has(dayKey(d))) d = addDays(d, -1);
    while (logs.has(dayKey(d))) {
      streak++;
      d = addDays(d, -1);
    }
    return streak;
  }
  let ws = startOfWeek(today, { weekStartsOn });
  if (periodProgress(h, logs, ws, weekStartsOn) < 1) ws = addDays(ws, -7);
  while (periodProgress(h, logs, ws, weekStartsOn) >= 1) {
    streak++;
    ws = addDays(ws, -7);
  }
  return streak;
}

export function bestStreak(h: Habit, logs: Set<string>, today: Date, weekStartsOn: 0 | 1) {
  if (!logs.size) return 0;
  const first = [...logs].sort()[0];
  let best = 0;
  let run = 0;
  if (h.period === 'day') {
    for (let d = fromDayKey(first); d <= today; d = addDays(d, 1)) {
      run = logs.has(dayKey(d)) ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  }
  for (let ws = startOfWeek(fromDayKey(first), { weekStartsOn }); ws <= today; ws = addDays(ws, 7)) {
    run = periodProgress(h, logs, ws, weekStartsOn) >= 1 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Share of the last `days` days (daily) or weeks (weekly) in which the target was met. */
export function consistency(h: Habit, logs: Set<string>, today: Date, weekStartsOn: 0 | 1, days = 28) {
  const since = Math.max(fromDayKey(dayKey(h.createdAt)).getTime(), addDays(today, -days + 1).getTime());
  if (h.period === 'day') {
    let met = 0;
    let total = 0;
    for (let d = new Date(since); d <= today; d = addDays(d, 1)) {
      total++;
      if (logs.has(dayKey(d))) met++;
    }
    return total ? met / total : 0;
  }
  let met = 0;
  let total = 0;
  // Only completed weeks count, so a fresh week doesn't drag the number down.
  const thisWeek = startOfWeek(today, { weekStartsOn });
  for (let ws = startOfWeek(new Date(since), { weekStartsOn }); ws < thisWeek; ws = addDays(ws, 7)) {
    total++;
    if (periodProgress(h, logs, ws, weekStartsOn) >= 1) met++;
  }
  return total ? met / total : periodProgress(h, logs, today, weekStartsOn) >= 1 ? 1 : 0;
}
