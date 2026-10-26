import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, startOfDay } from 'date-fns';
import type { CalEvent, Occurrence } from '@/lib/types';

const MAX_OCCURRENCES = 2000;

/** Expands events (including recurring ones) into concrete occurrences overlapping [from, to). */
export function expandEvents(events: CalEvent[], from: number, to: number): Occurrence[] {
  const out: Occurrence[] = [];
  for (const ev of events) {
    const dur = ev.end - ev.start;
    const skip = new Set(ev.exdates ?? []);
    const push = (start: number) => {
      if (start < to && start + dur > from && !skip.has(start)) out.push({ event: ev, start, end: start + dur });
    };
    const r = ev.rrule;
    if (!r) {
      push(ev.start);
      continue;
    }
    const until = Math.min(r.until ?? Infinity, to);
    const interval = Math.max(1, r.interval || 1);
    let n = 0;
    const counted = () => r.count !== undefined && n >= r.count;

    if (r.freq === 'weekly' && r.byDay?.length) {
      // Walk week by week from the series' week, emitting each selected weekday.
      const base = new Date(ev.start);
      const weekZero = startOfDay(addDays(base, -base.getDay()));
      const days = [...r.byDay].sort();
      for (let w = 0; n < MAX_OCCURRENCES; w += interval) {
        const weekStart = addWeeks(weekZero, w);
        if (weekStart.getTime() > until) break;
        for (const wd of days) {
          const d = addDays(weekStart, wd);
          d.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), 0);
          const t = d.getTime();
          if (t < ev.start) continue;
          if (t > until || counted()) break;
          n++;
          push(t);
        }
        if (counted()) break;
      }
      continue;
    }

    const step = { daily: addDays, weekly: addWeeks, monthly: addMonths, yearly: addYears }[r.freq];
    const base = new Date(ev.start);
    // Jump close to the window for long-running daily/weekly series instead of iterating from the start.
    let i = 0;
    if (r.count === undefined && (r.freq === 'daily' || r.freq === 'weekly')) {
      const days = differenceInCalendarDays(new Date(from), base) - 1;
      const per = r.freq === 'daily' ? interval : interval * 7;
      if (days > per) i = Math.floor(days / per);
    }
    for (; n < MAX_OCCURRENCES; i++) {
      const t = step(base, i * interval).getTime();
      if (t > until || counted()) break;
      n++;
      push(t);
    }
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function describeRecurrence(ev: CalEvent): string | null {
  const r = ev.rrule;
  if (!r) return null;
  const every = r.interval > 1 ? `Every ${r.interval} ` : 'Every ';
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.freq];
  let s = r.interval > 1 ? `${every}${unit}s` : r.freq === 'daily' ? 'Daily' : r.freq === 'weekly' ? 'Weekly' : r.freq === 'monthly' ? 'Monthly' : 'Yearly';
  if (r.freq === 'weekly' && r.byDay?.length) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    s += ` on ${r.byDay.map((d) => names[d]).join(', ')}`;
  }
  return s;
}
