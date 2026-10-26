import { describe, expect, it } from 'vitest';
import { db } from './db';
import { hasDemoData, removeDemoData, seedDemoData } from './demo';
import { createTask, quickAdd } from './actions';

describe('demo data', () => {
  it('seeds every feature and removes only demo records', async () => {
    await seedDemoData(new Date(2026, 9, 26, 10));
    const mine = await createTask({ title: 'My own task' });
    await quickAdd('Lunch with Sam Friday 1pm for 1h');
    expect(await hasDemoData()).toBe(true);
    for (const t of ['tasks', 'events', 'habits', 'habitLogs', 'goals', 'focus', 'notes', 'ideas', 'meals', 'water', 'weight', 'sleep', 'mood'] as const) {
      expect(await db.table(t).count(), t).toBeGreaterThan(0);
    }
    await removeDemoData();
    expect(await hasDemoData()).toBe(false);
    expect((await db.tasks.toArray()).map((t) => t.id)).toEqual([mine.id]);
    expect(await db.events.count()).toBe(1);
    expect(await db.meals.count()).toBe(0);
  });
});

describe('createTask status', () => {
  it('files tasks by date', async () => {
    const { createTask } = await import('./actions');
    const { dayKey } = await import('./dates');
    const tomorrow = new Date(Date.now() + 86_400_000);
    tomorrow.setHours(10, 0, 0, 0);
    expect((await createTask({ title: 'a' })).status).toBe('inbox');
    expect((await createTask({ title: 'b', start: tomorrow.getTime() })).status).toBe('scheduled');
    expect((await createTask({ title: 'c', due: dayKey(new Date()) })).status).toBe('today');
  });
});
