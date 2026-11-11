import { addDays, startOfDay } from 'date-fns';
import { expandEvents } from '@/features/calendar/recurrence';
import type { CalEvent, Recurrence, Task } from './types';
import { dayKey, fromDayKey } from './dates';

/**
 * The first occurrence of a repeat strictly after `base` and no earlier than today, so a task
 * finished late doesn't pile up missed copies. Null when the repeat has ended.
 */
export function nextOccurrence(rrule: Recurrence, base: number, now = Date.now()): number | null {
  const after = Math.max(base + 1, startOfDay(now).getTime());
  // A monthly or yearly repeat can be up to a year (or a few years for Feb 29) away.
  const horizon = addDays(new Date(after), rrule.freq === 'yearly' ? 366 * 4 * Math.max(1, rrule.interval) : 400 * Math.max(1, rrule.interval)).getTime();
  const series = { id: 'r', title: '', start: base, end: base + 1, color: 'blue', rrule, createdAt: 0, updatedAt: 0 } as CalEvent;
  const next = expandEvents([series], after, horizon).map((o) => o.start).filter((t) => t >= after).sort((a, b) => a - b)[0];
  return next ?? null;
}

/** When a task with a repeat is finished, the next copy of it (or null if the repeat has ended). */
export function nextTaskFor(t: Task, now = Date.now()): Omit<Task, 'id' | 'createdAt' | 'updatedAt'> | null {
  if (!t.rrule) return null;
  const base = t.start ?? (t.due ? fromDayKey(t.due).getTime() : startOfDay(t.createdAt).getTime());
  const next = nextOccurrence(t.rrule, base, now);
  if (next === null) return null;
  const shift = next - base;
  // A count-limited repeat ("10 times") counts down with each copy.
  const rrule = t.rrule.count !== undefined ? { ...t.rrule, count: t.rrule.count - 1 } : t.rrule;
  if (rrule.count !== undefined && rrule.count < 1) return null;
  const due = dayKey(next);
  const { id: _i, createdAt: _c, updatedAt: _u, doneAt: _d, nextId: _n, ...rest } = t;
  return {
    ...rest,
    rrule,
    done: 0,
    top: 0,
    due,
    start: t.start !== undefined ? t.start + shift : undefined,
    end: t.end !== undefined ? t.end + shift : undefined,
    remindAt: t.remindAt !== undefined ? t.remindAt + shift : undefined,
    subtasks: t.subtasks.map((s) => ({ ...s, done: false })),
    status: due <= dayKey(now) ? 'today' : 'scheduled',
    order: Date.now(),
  };
}
