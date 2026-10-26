import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { seedDemoData } from '@/lib/demo';
import { todayKey } from '@/lib/dates';
import { respond, runConfirmed } from './engine';

const ok = async (text: string) => {
  const r = await respond(text);
  expect(r.handled, `not handled: ${text}`).toBe(true);
  expect(r.text.length, `empty reply: ${text}`).toBeGreaterThan(0);
  return r;
};

describe('Afina engine', () => {
  beforeAll(async () => {
    await seedDemoData();
  });

  it('logs the brief’s meal example', async () => {
    const before = await db.meals.where('date').equals(todayKey()).count();
    const r = await ok('I ate shawarma and a Coke for lunch');
    expect(await db.meals.where('date').equals(todayKey()).count()).toBe(before + 2);
    expect(r.text).toMatch(/Chicken shawarma wrap \+ Coca-Cola — about 760 kcal/);
    expect(r.undo).toBeTruthy();
    await r.undo!();
    expect(await db.meals.where('date').equals(todayKey()).count()).toBe(before);
  });

  it('logs food in Russian', async () => {
    const r = await ok('съел тарелку борща на ужин');
    expect(r.text).toMatch(/^Записал: Борщ/);
    const last = (await db.meals.orderBy('createdAt').last())!;
    expect(last).toMatchObject({ name: 'Borscht', slot: 'dinner' });
  });

  it('creates events and tasks from natural language', async () => {
    const r = await ok('Lunch with Sam Friday 1pm for 1h');
    expect(r.text).toMatch(/Added “Lunch with Sam” on Friday/);
    const t = await ok('remind me to call mom tomorrow 6pm');
    expect(t.text).toMatch(/Added the task “Call mom”/);
    const task = (await db.tasks.orderBy('createdAt').last())!;
    expect(new Date(task.start!).getHours()).toBe(18);
    expect(task.status).toBe('scheduled');
    const ru = await ok('напомни купить хлеб завтра');
    expect(ru.text).toMatch(/Добавил задачу «Купить хлеб»/);
  });

  it('plans the day and breaks tasks down', async () => {
    await ok('plan my day');
    const r = await ok('break down write the quarterly report into steps');
    expect(r.text).toMatch(/• /);
    const task = (await db.tasks.orderBy('createdAt').last())!;
    expect(task.title).toBe('Write the quarterly report');
    expect(task.subtasks.length).toBeGreaterThan(3);
    const existing = await ok('break down Review Q4 budget');
    expect(existing.text).toMatch(/Review Q4 budget/);
  });

  it('answers questions about the user’s own data', async () => {
    expect((await ok('How did I sleep this week?')).text).toMatch(/averaged \d+\.\d h across 7 nights over the last 7 days/);
    expect((await ok('What did I spend most time on?')).text).toMatch(/Where your time went/);
    expect((await ok('How many calories today?')).text).toMatch(/kcal/);
    expect((await ok('What’s my weight trend?')).text).toMatch(/kg a week/);
    expect((await ok('Does sleep affect my mood?')).text).toMatch(/r = /);
    expect((await ok('When am I free tomorrow?')).text).toMatch(/Free tomorrow|No free blocks/);
    expect((await ok('что у меня сегодня?')).text).toMatch(/Сегодня/);
    expect((await ok('как я спал на этой неделе?')).text).toMatch(/В среднем/);
  });

  it('logs water, sleep, weight and mood', async () => {
    const w0 = (await db.water.where('date').equals(todayKey()).toArray()).reduce((a, w) => a + w.ml, 0);
    await ok('drank 2 glasses of water');
    expect((await db.water.where('date').equals(todayKey()).toArray()).reduce((a, w) => a + w.ml, 0)).toBe(w0 + 500);
    await ok('slept 7.5 hours');
    expect((await db.sleep.where('date').equals(todayKey()).first())!.hours).toBe(7.5);
    await ok('I weigh 72.4 kg');
    expect((await db.weight.where('date').equals(todayKey()).first())!.kg).toBe(72.4);
    await ok('feeling great today');
    expect((await db.mood.where('date').equals(todayKey()).first())!.score).toBe(5);
  });

  it('completes and moves tasks', async () => {
    await ok('mark pick up dry cleaning done');
    expect((await db.tasks.filter((t) => t.title === 'Pick up dry cleaning').first())!.done).toBe(1);
    const r = await ok('move Review Q4 budget to tomorrow 3pm');
    expect(r.text).toMatch(/Moved “Review Q4 budget”/);
    const t = (await db.tasks.filter((x) => x.title === 'Review Q4 budget').first())!;
    expect(new Date(t.start!).getHours()).toBe(15);
  });

  it('always asks before deleting', async () => {
    const r = await ok('delete task Learn basic Spanish phrases');
    expect(r.confirm).toMatchObject({ kind: 'delete_task', title: 'Learn basic Spanish phrases' });
    expect(await db.tasks.filter((t) => t.title === 'Learn basic Spanish phrases').count()).toBe(1);
    await runConfirmed(r.confirm!, 'en');
    expect(await db.tasks.filter((t) => t.title === 'Learn basic Spanish phrases').count()).toBe(0);
  });

  it('captures notes and ideas and turns ideas into plans', async () => {
    await ok('note: buy flowers for mom on Saturday');
    expect((await db.notes.orderBy('updatedAt').last())!.title).toMatch(/buy flowers/);
    await ok('idea: a podcast about calm productivity');
    const plan = await ok('turn a podcast about calm productivity into a plan');
    expect(plan.text).toMatch(/goal with \d milestones/);
    expect((await ok('summarize my note about the portfolio site plan')).text).toMatch(/in brief/);
  });

  it('uses Russian plural forms', async () => {
    const { pl } = await import('./engine');
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => pl('ru', n, ['', ''], ['задачу', 'задачи', 'задач']))).toEqual(['1 задачу', '2 задачи', '5 задач', '11 задач', '21 задачу', '22 задачи', '25 задач']);
    expect(pl('en', 1, ['task', 'tasks'], ['', '', ''])).toBe('1 task');
  });

  it('lets the language model handle what it doesn’t understand', async () => {
    expect((await respond('what is the meaning of life?')).handled).toBe(false);
    expect((await respond('blorp zzz')).handled).toBe(false);
  });
});
