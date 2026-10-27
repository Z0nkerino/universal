// Every change to user data goes through here, so screens and Afina behave identically.
import { db, stamp, uid } from './db';
import { dayKey, todayKey } from './dates';
import type { CalEvent, Food, Goal, Habit, Idea, IdeaColumn, MealEntry, MealSlot, MoodLog, Note, Task } from './types';
import { useSettings } from './settings';
import { emitAppEvent } from './events';
import { loadDateParsers, parseQuickAdd, type QuickAdd } from './nlp';

/* ---------- Tasks ---------- */

export type NewTask = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>> & { title: string };

export async function createTask(t: NewTask) {
  const day = t.due ?? (t.start ? dayKey(t.start) : undefined);
  const status = t.status ?? (day === undefined ? 'inbox' : day <= todayKey() ? 'today' : 'scheduled');
  const rec: Task = stamp({
    status,
    done: 0 as const,
    priority: 0 as const,
    tags: [],
    subtasks: [],
    order: Date.now(),
    ...t,
  }) as Task;
  await db.tasks.add(rec);
  emitAppEvent('task.created', rec.title, { id: rec.id, due: rec.due, start: rec.start });
  return rec;
}

export const updateTask = (id: string, patch: Partial<Task>) => db.tasks.update(id, { ...patch, updatedAt: Date.now() });

export async function setTaskDone(id: string, done: boolean) {
  await db.tasks.update(id, { done: done ? 1 : 0, doneAt: done ? Date.now() : undefined, updatedAt: Date.now() });
  if (done) {
    const t = await db.tasks.get(id);
    if (t) emitAppEvent('task.completed', t.title, { id });
  }
}

export const deleteTask = (id: string) => db.tasks.delete(id);

/** Moves a task onto the timeline (or off it with null). Keeps its duration. */
export async function scheduleTask(id: string, start: number | null, durationMin?: number) {
  const t = await db.tasks.get(id);
  if (!t) return;
  if (start === null) return updateTask(id, { start: undefined, end: undefined });
  const dur = durationMin ?? t.estimate ?? (t.start && t.end ? (t.end - t.start) / 60_000 : 30);
  const due = dayKey(start);
  return updateTask(id, { start, end: start + dur * 60_000, estimate: Math.round(dur), due, status: due === todayKey() ? 'today' : 'scheduled' });
}

/* ---------- Events ---------- */

export type NewEvent = Partial<Omit<CalEvent, 'id' | 'createdAt' | 'updatedAt'>> & { title: string; start: number; end: number };

export async function createEvent(e: NewEvent) {
  const rec = stamp({ color: useSettings.getState().eventColor, ...e }) as CalEvent;
  await db.events.add(rec);
  emitAppEvent('event.created', rec.title, { id: rec.id, start: rec.start, end: rec.end, allDay: !!rec.allDay });
  return rec;
}
export const updateEvent = (id: string, patch: Partial<CalEvent>) => db.events.update(id, { ...patch, updatedAt: Date.now() });
export const deleteEvent = (id: string) => db.events.delete(id);

/** Removes a single occurrence of a recurring event. */
export async function skipOccurrence(id: string, start: number) {
  const e = await db.events.get(id);
  if (e) await updateEvent(id, { exdates: [...(e.exdates ?? []), start] });
}

/** Creates a task or event from a quick-add phrase. */
export async function quickAdd(text: string, forceKind?: 'task' | 'event'): Promise<{ kind: 'task' | 'event'; parsed: QuickAdd; record: Task | CalEvent }> {
  await loadDateParsers();
  const { eventMinutes, eventReminder } = useSettings.getState();
  const p = parseQuickAdd(text, new Date(), forceKind, eventMinutes);
  if (p.kind === 'event' && p.start !== undefined) {
    const record = await createEvent({ title: p.title, start: p.start, end: p.end!, allDay: p.allDay, rrule: p.rrule, reminder: p.allDay || eventReminder < 0 ? undefined : eventReminder });
    return { kind: 'event', parsed: p, record };
  }
  const record = await createTask({
    title: p.title,
    due: p.due,
    start: p.hasTime ? p.start : undefined,
    end: p.hasTime ? p.start! + (p.estimate ?? 30) * 60_000 : undefined,
    estimate: p.estimate,
    priority: p.priority,
    tags: p.tags,
    remindAt: p.hasTime ? p.start : undefined,
  });
  return { kind: 'task', parsed: p, record };
}

/* ---------- Habits & goals ---------- */

export async function createHabit(h: Pick<Habit, 'name' | 'emoji' | 'target' | 'period'> & Partial<Habit>) {
  const count = await db.habits.count();
  const rec = stamp({ color: count % 2 ? 'pink' : 'blue', order: count, ...h }) as Habit;
  await db.habits.add(rec);
  return rec;
}

export async function toggleHabit(habitId: string, date = todayKey()) {
  const existing = await db.habitLogs.where('[habitId+date]').equals([habitId, date]).first();
  if (existing) await db.habitLogs.delete(existing.id);
  else {
    await db.habitLogs.add({ id: uid(), habitId, date });
    const h = await db.habits.get(habitId);
    if (h) emitAppEvent('habit.done', h.name, { id: habitId, date });
  }
  return !existing;
}

export async function deleteHabit(id: string) {
  await db.transaction('rw', db.habits, db.habitLogs, async () => {
    await db.habitLogs.where('habitId').equals(id).delete();
    await db.habits.delete(id);
  });
}

export async function createGoal(g: Pick<Goal, 'title'> & Partial<Goal>) {
  const rec = stamp({ milestones: [], ...g }) as Goal;
  await db.goals.add(rec);
  return rec;
}
export const updateGoal = (id: string, patch: Partial<Goal>) => db.goals.update(id, { ...patch, updatedAt: Date.now() });
export async function deleteGoal(id: string) {
  await db.transaction('rw', db.goals, db.tasks, async () => {
    await db.tasks.where('goalId').equals(id).modify({ goalId: undefined });
    await db.goals.delete(id);
  });
}

/* ---------- Focus ---------- */

export async function logFocus(taskId: string | undefined, start: number, end: number) {
  const minutes = Math.round((end - start) / 60_000);
  if (minutes < 1) return;
  await db.focus.add({ id: uid(), taskId, start, end, minutes });
  const task = taskId ? await db.tasks.get(taskId) : undefined;
  emitAppEvent('focus.finished', task?.title ?? '', { minutes });
}

/* ---------- Notes & ideas ---------- */

export async function createNote(n: Partial<Note> = {}) {
  const rec = stamp({ title: '', content: null, text: '', folder: 'Notes', tags: [], pinned: 0 as const, links: [], ...n }) as Note;
  await db.notes.add(rec);
  return rec;
}
export const updateNote = (id: string, patch: Partial<Note>) => db.notes.update(id, { ...patch, updatedAt: Date.now() });
export const deleteNote = (id: string) => db.notes.delete(id);

export async function createIdea(i: Partial<Idea> & { title: string }) {
  const n = await db.ideas.count();
  const rec = stamp({ body: '', column: 'raw' as IdeaColumn, x: 80 + (n % 5) * 260, y: 80 + Math.floor(n / 5) * 180, color: 'none' as const, order: Date.now(), ...i }) as Idea;
  await db.ideas.add(rec);
  emitAppEvent('idea.created', rec.title, { id: rec.id });
  return rec;
}
export const updateIdea = (id: string, patch: Partial<Idea>) => db.ideas.update(id, { ...patch, updatedAt: Date.now() });
export async function deleteIdea(id: string) {
  await db.transaction('rw', db.ideas, db.ideaLinks, async () => {
    await db.ideaLinks.where('from').equals(id).delete();
    await db.ideaLinks.where('to').equals(id).delete();
    await db.ideas.delete(id);
  });
}

/** Turns an idea into a task, note or goal, and marks the idea as being acted on. */
export async function convertIdea(id: string, to: 'task' | 'note' | 'goal') {
  const idea = await db.ideas.get(id);
  if (!idea) return null;
  let created: Task | Note | Goal;
  if (to === 'task') created = await createTask({ title: idea.title, notes: idea.body || undefined, tags: ['idea'] });
  else if (to === 'note') {
    const paras = (idea.body || '').split(/\n+/).filter(Boolean);
    created = await createNote({
      title: idea.title,
      text: `${idea.title}\n${idea.body}`,
      content: {
        type: 'doc',
        content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: idea.title }] }, ...paras.map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] }))],
      },
      folder: 'Ideas',
    });
  } else created = await createGoal({ title: idea.title, why: idea.body || undefined });
  await updateIdea(id, { column: idea.column === 'raw' ? 'exploring' : idea.column });
  return created;
}

/* ---------- Food & health ---------- */

export async function logFood(food: Pick<Food, 'name' | 'kcal' | 'protein' | 'carbs' | 'fat'> & { id?: string }, servings = 1, slot?: MealSlot, date = todayKey()) {
  const s = slot ?? guessMealSlot(new Date());
  const r = (n: number) => Math.round(n * servings * 10) / 10;
  const rec = stamp({
    date,
    slot: s,
    foodId: food.id,
    name: food.name,
    servings,
    kcal: Math.round(food.kcal * servings),
    protein: r(food.protein),
    carbs: r(food.carbs),
    fat: r(food.fat),
  }) as MealEntry;
  await db.meals.add(rec);
  return rec;
}

export function guessMealSlot(d: Date): MealSlot {
  const h = d.getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 22) return 'dinner';
  return 'snack';
}

export const addWater = (ml: number, date = todayKey()) => db.water.add({ id: uid(), date, ml, at: Date.now() });

export async function logWeight(kg: number, date = todayKey()) {
  await db.weight.where('date').equals(date).delete();
  await db.weight.add({ id: uid(), date, kg });
}
export async function logSleep(hours: number, date = todayKey(), quality?: 1 | 2 | 3 | 4 | 5) {
  await db.sleep.where('date').equals(date).delete();
  await db.sleep.add({ id: uid(), date, hours, quality });
}
export async function logMood(score: MoodLog['score'], note?: string, date = todayKey()) {
  await db.mood.where('date').equals(date).delete();
  await db.mood.add({ id: uid(), date, score, note });
}
