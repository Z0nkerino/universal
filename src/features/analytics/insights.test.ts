import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { seedDemoData } from '@/lib/demo';
import { buildDays, crossInsights, peakWindow, productiveHeatmap, weeklyReview, weightTrend, type Records } from './insights';

async function load(): Promise<Records> {
  const [tasks, focus, habits, habitLogs, meals, water, weight, sleep, mood] = await Promise.all([db.tasks.toArray(), db.focus.toArray(), db.habits.toArray(), db.habitLogs.toArray(), db.meals.toArray(), db.water.toArray(), db.weight.toArray(), db.sleep.toArray(), db.mood.toArray()]);
  return { tasks, focus, habits, habitLogs, meals, water, weight, sleep, mood };
}

describe('insights', () => {
  it('finds the real patterns in the sample data and reports sample sizes', async () => {
    const now = new Date(2026, 9, 26, 20);
    await seedDemoData(now);
    const r = await load();
    const days = buildDays(r, 22, now);
    expect(days).toHaveLength(22);
    // Totals match the raw records.
    const doneInRange = r.tasks.filter((t) => t.done && t.doneAt && t.doneAt >= days[0].date.getTime()).length;
    expect(days.reduce((a, d) => a + d.tasksDone, 0)).toBe(doneInRange);

    const grid = productiveHeatmap(r.tasks, r.focus, days[0].date.getTime());
    const insights = crossInsights(days, grid, 'en', { kcal: 2000, sleepH: 8 });
    const sleep = insights.find((i) => i.id === 'sleep-tasks');
    expect(sleep, JSON.stringify(insights.map((i) => i.title))).toBeTruthy();
    expect(sleep!.title).toMatch(/more tasks/);
    expect(sleep!.detail).toMatch(/based on \d+ and \d+ days/);
    expect(insights.find((i) => i.id === 'sleep-mood')).toBeTruthy();
    expect(peakWindow(grid).total).toBeGreaterThan(10);

    const wt = weightTrend(days);
    expect(wt.perWeek).not.toBeNull();
    expect(wt.perWeek!).toBeLessThan(0); // the sample weight drifts down

    const review = weeklyReview(r, now, 'en', { kcal: 2000, sleepH: 8 });
    expect(review.tasksDone).toBeGreaterThan(0);
    expect(review.suggestions.length).toBeGreaterThan(0);
  });

  it('says nothing when there is too little data', () => {
    const empty: Records = { tasks: [], focus: [], habits: [], habitLogs: [], meals: [], water: [], weight: [], sleep: [], mood: [] };
    const days = buildDays(empty, 7);
    expect(crossInsights(days, productiveHeatmap([], [], 0), 'en', { kcal: 2000, sleepH: 8 })).toEqual([]);
    expect(weightTrend(days).perWeek).toBeNull();
  });
});
