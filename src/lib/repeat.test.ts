import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { createTask, quickAdd, setTaskDone } from './actions';
import { nextOccurrence } from './repeat';

const at = (y: number, mo: number, d: number, h = 0, m = 0) => new Date(y, mo, d, h, m).getTime();
const NOW = at(2026, 9, 26, 10); // Monday 26 Oct 2026

describe('nextOccurrence', () => {
  it('steps daily, weekly, by weekday, monthly and yearly', () => {
    expect(nextOccurrence({ freq: 'daily', interval: 1 }, at(2026, 9, 26, 9), NOW)).toBe(at(2026, 9, 27, 9));
    expect(nextOccurrence({ freq: 'weekly', interval: 1, byDay: [0] }, at(2026, 10, 1, 18), NOW)).toBe(at(2026, 10, 8, 18));
    expect(nextOccurrence({ freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] }, at(2026, 9, 30, 8), NOW)).toBe(at(2026, 10, 2, 8)); // Fri → Mon
    expect(nextOccurrence({ freq: 'monthly', interval: 1 }, at(2026, 10, 1), NOW)).toBe(at(2026, 11, 1));
    expect(nextOccurrence({ freq: 'yearly', interval: 1 }, at(2026, 9, 26), NOW)).toBe(at(2027, 9, 26));
  });

  it('skips occurrences missed while the task sat undone', () => {
    // A daily task from a week ago, finished today, comes back tomorrow — not seven times.
    expect(nextOccurrence({ freq: 'daily', interval: 1 }, at(2026, 9, 19, 9), NOW)).toBe(at(2026, 9, 26, 9));
  });

  it('stops when the repeat has ended', () => {
    expect(nextOccurrence({ freq: 'daily', interval: 1, until: at(2026, 9, 26, 23) }, at(2026, 9, 26, 9), NOW)).toBeNull();
  });
});

describe('repeating tasks', () => {
  // Only Date is faked, so IndexedDB's timers keep running.
  beforeEach(() => (vi.useFakeTimers({ toFake: ['Date'] }), vi.setSystemTime(NOW)));
  afterEach(() => vi.useRealTimers());

  it('finishing one schedules the next; un-finishing takes it back', async () => {
    const { record } = await quickAdd('Water the plants every 2 days');
    expect(record).toBeDefined();
    const t = await createTask({ title: 'Call mom', rrule: { freq: 'weekly', interval: 1, byDay: [0] }, due: '2026-11-01', start: at(2026, 10, 1, 18), end: at(2026, 10, 1, 18, 30), remindAt: at(2026, 10, 1, 18) });
    await setTaskDone(t.id, true);
    const done = (await db.tasks.get(t.id))!;
    const next = (await db.tasks.get(done.nextId!))!;
    expect(next).toMatchObject({ title: 'Call mom', done: 0, due: '2026-11-08', start: at(2026, 10, 8, 18), end: at(2026, 10, 8, 18, 30), remindAt: at(2026, 10, 8, 18) });
    expect(next.rrule).toEqual(t.rrule);
    // Ticking it twice doesn't create two copies.
    await setTaskDone(t.id, true);
    expect(await db.tasks.filter((x) => x.title === 'Call mom').count()).toBe(2);
    await setTaskDone(t.id, false);
    expect(await db.tasks.get(next.id)).toBeUndefined();
    expect((await db.tasks.get(t.id))!.nextId).toBeUndefined();
  });

  it('quick add keeps the repeat on tasks', async () => {
    const { kind, record } = await quickAdd('Pay rent on the 1st of every month');
    expect(kind).toBe('task');
    expect((record as { rrule?: unknown }).rrule).toEqual({ freq: 'monthly', interval: 1 });
  });
});
