import { describe, expect, it } from 'vitest';
import { db } from './db';
import { createTask } from './actions';
import { applyPendingActions, buildSnapshot } from './widgets';
import type { Task } from './types';

const now = new Date(2026, 9, 26, 10); // Monday 26 Oct
const at = (d: number, h: number) => new Date(2026, 9, d, h).getTime();
const task = (p: Partial<Task>): Task => ({ id: Math.random().toString(36).slice(2), title: 't', status: 'inbox', done: 0, priority: 0, tags: [], subtasks: [], order: 0, createdAt: 0, updatedAt: 0, ...p });

describe('widget snapshot', () => {
  it('holds today (overdue included), what was done today and tomorrow — nothing else', () => {
    const s = buildSnapshot(
      [
        task({ id: 'gym', title: 'Gym', due: '2026-10-26', start: at(26, 19), end: at(26, 20) }),
        task({ id: 'late', title: 'Overdue', due: '2026-10-24', priority: 3 }),
        task({ id: 'doneToday', title: 'Stretch', due: '2026-10-26', done: 1, doneAt: at(26, 8) }),
        task({ id: 'doneYesterday', title: 'Old', due: '2026-10-25', done: 1, doneAt: at(25, 9) }),
        task({ id: 'tomorrow', title: 'Dentist', due: '2026-10-27', start: at(27, 15) }),
        task({ id: 'later', title: 'Later', due: '2026-10-30' }),
        task({ id: 'inbox', title: 'Someday maybe' }),
        task({ id: 'today', title: 'Call mom', status: 'today', rrule: { freq: 'weekly', interval: 1, byDay: [0] } }),
      ],
      now,
    );
    expect(s.tasks.map((x) => x.id)).toEqual(['late', 'gym', 'doneToday', 'today', 'tomorrow']);
    expect(s.tasks.find((x) => x.id === 'today')).toMatchObject({ day: '2026-10-26', repeats: true });
    expect(s.tasks.find((x) => x.id === 'doneToday')).toMatchObject({ done: true });
    expect(s.strings.next).toBe('Next');
    expect(JSON.parse(JSON.stringify(s))).toEqual(s); // plain JSON for the native side
  });
});

describe('widget check-offs', () => {
  it('applies queued actions in order and skips ones already applied', async () => {
    const a = await createTask({ title: 'From widget' });
    const b = await createTask({ title: 'Checked then unchecked' });
    const changed = await applyPendingActions([
      { type: 'complete', id: a.id, at: 1 },
      { type: 'uncomplete', id: b.id, at: 3 },
      { type: 'complete', id: b.id, at: 2 },
      { type: 'complete', id: 'gone', at: 4 },
    ]);
    expect((await db.tasks.get(a.id))!.done).toBe(1);
    expect((await db.tasks.get(b.id))!.done).toBe(0);
    expect(changed).toBe(3);
    expect(await applyPendingActions([{ type: 'complete', id: a.id, at: 5 }])).toBe(0);
  });
});
