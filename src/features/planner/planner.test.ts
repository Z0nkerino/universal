import { describe, expect, it } from 'vitest';
import { planDay } from './scheduler';
import { bestStreak, consistency, currentStreak } from './habits';
import { linearRegression, movingAverage, pearson, percentLift } from '@/lib/stats';
import type { Habit, Task } from '@/lib/types';

const day = new Date(2026, 9, 26);
const at = (h: number, m = 0) => new Date(2026, 9, 26, h, m).getTime();
const task = (p: Partial<Task>): Task => ({ id: Math.random().toString(36), title: 't', status: 'today', done: 0, priority: 0, tags: [], subtasks: [], order: 0, createdAt: 0, updatedAt: 0, ...p });

describe('planDay', () => {
  it('fits tasks around events with buffers, most urgent first', () => {
    const a = task({ id: 'a', priority: 3, estimate: 60, energy: 'high' });
    const b = task({ id: 'b', priority: 1, estimate: 30, energy: 'low' });
    const busy = [{ start: at(10), end: at(11) }];
    const r = planDay([b, a], busy, { day, dayStartMin: 9 * 60, dayEndMin: 18 * 60 });
    expect(r.unscheduled).toEqual([]);
    for (const s of r.scheduled) {
      expect(s.end <= at(9, 50) || s.start >= at(11, 10)).toBe(true);
    }
    const A = r.scheduled.find((s) => s.taskId === 'a')!;
    // High-energy work lands in the productive late morning, not the evening.
    expect(new Date(A.start).getHours()).toBeLessThan(13);
  });
  it('reports tasks that cannot fit', () => {
    const r = planDay([task({ id: 'big', estimate: 600 })], [], { day, dayStartMin: 9 * 60, dayEndMin: 12 * 60 });
    expect(r.unscheduled).toEqual(['big']);
  });
  it('never schedules in the past', () => {
    const r = planDay([task({ id: 'x', estimate: 30 })], [], { day, notBefore: at(14, 7) });
    expect(r.scheduled[0].start).toBeGreaterThanOrEqual(at(14, 15));
  });
});

describe('habits', () => {
  const daily: Habit = { id: 'h', name: 'Read', emoji: '📖', color: 'blue', target: 1, period: 'day', order: 0, createdAt: new Date(2026, 9, 1).getTime(), updatedAt: 0 };
  const weekly: Habit = { ...daily, target: 3, period: 'week' };
  const today = new Date(2026, 9, 26); // Monday
  it('daily streak tolerates today not done yet', () => {
    const logs = new Set(['2026-10-23', '2026-10-24', '2026-10-25']);
    expect(currentStreak(daily, logs, today, 1)).toBe(3);
    logs.add('2026-10-26');
    expect(currentStreak(daily, logs, today, 1)).toBe(4);
    expect(bestStreak(daily, logs, today, 1)).toBe(4);
  });
  it('weekly 3x streak counts full weeks', () => {
    // Weeks (Mon start): Oct 12–18 has 3, Oct 19–25 has 3, current week in progress.
    const logs = new Set(['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19', '2026-10-20', '2026-10-25']);
    expect(currentStreak(weekly, logs, today, 1)).toBe(2);
    expect(consistency(weekly, logs, today, 1)).toBeCloseTo(2 / 4);
  });
});

describe('stats', () => {
  it('computes correlation, regression and lift', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2], [1, 2])).toBeNaN();
    expect(linearRegression([0, 1, 2], [1, 3, 5])).toEqual({ slope: 2, intercept: 1 });
    expect(movingAverage([1, null, 3, 5], 2)).toEqual([1, 1, 3, 4]);
    expect(percentLift([4, 4, 4], [5, 5, 5])).toBe(25);
    expect(percentLift([4, 4], [5, 5, 5])).toBeNull();
  });
});
