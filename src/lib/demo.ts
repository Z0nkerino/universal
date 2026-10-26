// Sample data so the app looks alive on first launch. Every record is flagged `demo: true`
// and removeDemoData() deletes exactly those, leaving anything the user made.
import { addDays, startOfDay } from 'date-fns';
import { db, setKV, uid } from './db';
import { dayKey } from './dates';
import type { CalEvent, FocusSession, Goal, Habit, HabitLog, Idea, IdeaLink, MealEntry, MoodLog, Note, SleepLog, Task, WaterLog, WeightLog } from './types';
import { BUILTIN_FOODS } from '@/features/diet/foods';

const DEMO_TABLES = ['tasks', 'events', 'habits', 'habitLogs', 'goals', 'focus', 'notes', 'ideas', 'ideaLinks', 'ideaGroups', 'meals', 'water', 'weight', 'sleep', 'mood', 'chat'] as const;

/** Deterministic pseudo-random numbers so the sample week looks the same every time. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const p = (text: string) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
const h = (level: number, text: string) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
const li = (text: string, checked?: boolean) =>
  checked === undefined
    ? { type: 'listItem', content: [p(text)] }
    : { type: 'taskItem', attrs: { checked }, content: [p(text)] };

export async function hasDemoData() {
  return (await db.tasks.filter((t) => !!t.demo).count()) > 0 || (await db.notes.filter((n) => !!n.demo).count()) > 0;
}

export async function removeDemoData() {
  await db.transaction('rw', DEMO_TABLES.map((t) => db.table(t)), async () => {
    for (const t of DEMO_TABLES) await db.table(t).filter((r: { demo?: boolean }) => !!r.demo).delete();
  });
  await setKV('demo', false);
}

export async function seedDemoData(now = new Date()) {
  const r = rng(42);
  const today = startOfDay(now);
  const at = (dayOffset: number, h: number, m = 0) => {
    const d = addDays(today, dayOffset);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  const base = { demo: true as const, createdAt: at(-21, 9), updatedAt: at(-21, 9) };

  /* Sleep and mood: sleep drives mood and output, so the insights have something real to find. */
  const sleep: SleepLog[] = [];
  const mood: MoodLog[] = [];
  const sleepByDay: Record<string, number> = {};
  for (let d = -21; d <= 0; d++) {
    const hours = Math.round((6 + r() * 2.6 + (d % 7 === 0 ? 0.6 : 0)) * 4) / 4;
    const k = dayKey(addDays(today, d));
    sleepByDay[k] = hours;
    sleep.push({ id: uid(), date: k, hours, quality: (hours >= 7.5 ? 4 : hours >= 6.75 ? 3 : 2) as 2 | 3 | 4, demo: true });
    if (d < 0) {
      const score = Math.max(1, Math.min(5, Math.round(1.2 + (hours - 6) * 1.1 + r() * 1.2))) as MoodLog['score'];
      mood.push({ id: uid(), date: k, score, note: score >= 4 ? 'Good energy today' : score <= 2 ? 'Tired, slow start' : undefined, demo: true });
    }
  }

  /* Goals */
  const goalRun: Goal = { ...base, id: uid(), title: 'Run a 10K', why: 'Feel strong and have more energy', targetDate: dayKey(addDays(today, 45)), milestones: [
    { id: uid(), title: 'Run 3K without stopping', done: true },
    { id: uid(), title: 'Run 5K under 30 min', done: true },
    { id: uid(), title: 'Run 8K', done: false },
    { id: uid(), title: 'Race day: 10K', done: false },
  ] };
  const goalLaunch: Goal = { ...base, id: uid(), title: 'Launch the portfolio site', why: 'Show my work to new clients', targetDate: dayKey(addDays(today, 20)), milestones: [
    { id: uid(), title: 'Pick 6 best projects', done: true },
    { id: uid(), title: 'Write case studies', done: false },
    { id: uid(), title: 'Design and build', done: false },
    { id: uid(), title: 'Publish', done: false },
  ] };

  /* Tasks: a history of completions plus today's plan. */
  const tasks: Task[] = [];
  const history = ['Reply to client emails', 'Review pull requests', 'Grocery run', 'Plan the week', 'Update budget sheet', 'Call the bank', 'Draft blog post', 'Clean the desk', 'Prepare slides', 'Book dentist appointment', 'Pay electricity bill', 'Read 20 pages', 'Fix login bug', 'Laundry', 'Stretch session', 'Inbox zero'];
  let order = 0;
  for (let d = -21; d < 0; d++) {
    const k = dayKey(addDays(today, d));
    const sleepH = sleepByDay[k];
    const count = Math.max(1, Math.round(1.5 + (sleepH - 6) * 1.6 + r() * 2));
    for (let i = 0; i < count; i++) {
      const hour = [9, 10, 10, 11, 11, 14, 15, 16, 17, 20][Math.floor(r() * 10)];
      const est = [15, 30, 30, 45, 60][Math.floor(r() * 5)];
      tasks.push({ ...base, id: uid(), title: history[Math.floor(r() * history.length)], status: 'today', done: 1, doneAt: at(d, hour, Math.floor(r() * 50)), priority: Math.floor(r() * 4) as Task['priority'], tags: [], subtasks: [], due: k, estimate: est, order: order++ });
    }
  }
  const t = (title: string, x: Partial<Task>): Task => ({ ...base, id: uid(), title, status: 'today', done: 0, priority: 0, tags: [], subtasks: [], order: order++, ...x });
  const k0 = dayKey(today);
  tasks.push(
    t('Write case study: Brightline app', { priority: 3, top: 1, estimate: 90, energy: 'high', due: k0, goalId: goalLaunch.id, tags: ['work'], subtasks: [
      { id: uid(), title: 'Outline problem → solution → result', done: true },
      { id: uid(), title: 'Gather screenshots', done: false },
      { id: uid(), title: 'Write first draft', done: false },
    ] }),
    t('8K training run', { priority: 2, top: 1, estimate: 50, energy: 'high', due: k0, goalId: goalRun.id, tags: ['health'] }),
    t('Reply to Maya about the contract', { priority: 2, top: 1, estimate: 15, energy: 'low', due: k0, tags: ['work'] }),
    t('Pick up dry cleaning', { priority: 1, estimate: 20, energy: 'low', due: k0, tags: ['errands'] }),
    t('Review Q4 budget', { priority: 1, estimate: 45, energy: 'med', due: k0, tags: ['finance'] }),
    t('Water the plants', { estimate: 10, energy: 'low', due: k0, done: 1, doneAt: at(0, 8, 20) }),
    t('Research standing desks', { status: 'inbox', estimate: 30 }),
    t('Organize photo library', { status: 'someday', estimate: 120 }),
    t('Learn basic Spanish phrases', { status: 'someday', tags: ['learning'] }),
    t('Renew passport', { status: 'scheduled', due: dayKey(addDays(today, 6)), priority: 2, estimate: 40 }),
    t('Draft newsletter', { status: 'scheduled', due: dayKey(addDays(today, 2)), estimate: 60, energy: 'high', tags: ['work'] }),
    t('Call grandma', { status: 'inbox', estimate: 20 }),
  );

  /* Focus sessions from the completed history. */
  const focus: FocusSession[] = tasks
    .filter((x) => x.done && x.estimate && x.estimate >= 30 && r() > 0.35)
    .map((x) => {
      const minutes = Math.round((x.estimate! * (0.8 + r() * 0.6)) / 5) * 5;
      return { id: uid(), taskId: x.id, start: x.doneAt! - minutes * 60_000, end: x.doneAt!, minutes, demo: true };
    });

  /* Events */
  const ev = (title: string, x: Partial<CalEvent> & { start: number; end: number }): CalEvent => ({ ...base, id: uid(), title, color: 'blue', ...x });
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const atM = (d: number, hh: number, mm = 0) => {
    const x = addDays(monday, d);
    x.setHours(hh, mm, 0, 0);
    return x.getTime();
  };
  const events: CalEvent[] = [
    ev('Team standup', { start: atM(-14, 9, 30), end: atM(-14, 9, 45), color: 'violet', rrule: { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] }, reminder: 5 }),
    ev('Gym', { start: atM(-14, 18, 30), end: atM(-14, 19, 30), color: 'sky', rrule: { freq: 'weekly', interval: 1, byDay: [1, 3, 5] }, location: 'City Fitness' }),
    ev('Lunch with Sam', { start: at(0, 13), end: at(0, 14), color: 'pink', location: 'Olive & Thyme', reminder: 15 }),
    ev('Design review', { start: at(0, 15, 30), end: at(0, 16, 15), color: 'blue', reminder: 10 }),
    ev('Dentist', { start: at(3, 10), end: at(3, 10, 45), color: 'rose', reminder: 60 }),
    ev('Mom\'s birthday', { start: dayKeyStart(addDays(today, 5)), end: dayKeyStart(addDays(today, 6)), allDay: true, color: 'pink' }),
    ev('Client call: Brightline', { start: at(1, 11), end: at(1, 11, 45), color: 'blue', reminder: 10 }),
    ev('Coffee with Lina', { start: at(-2, 10), end: at(-2, 11), color: 'pink' }),
    ev('Yoga class', { start: at(2, 7, 30), end: at(2, 8, 30), color: 'sky' }),
    ev('Sprint planning', { start: at(-7, 14), end: at(-7, 15, 30), color: 'violet' }),
  ];

  /* Habits */
  const habits: Habit[] = [
    { ...base, id: uid(), name: 'Read 20 minutes', emoji: '📖', color: 'blue', target: 1, period: 'day', order: 0 },
    { ...base, id: uid(), name: 'Workout', emoji: '🏃', color: 'pink', target: 3, period: 'week', order: 1 },
    { ...base, id: uid(), name: 'Meditate', emoji: '🧘', color: 'blue', target: 1, period: 'day', order: 2 },
    { ...base, id: uid(), name: 'No phone after 10pm', emoji: '🌙', color: 'pink', target: 5, period: 'week', order: 3 },
  ];
  const habitLogs: HabitLog[] = [];
  for (let d = -21; d <= 0; d++) {
    const k = dayKey(addDays(today, d));
    const odds = [0.8, 0.45, 0.6, 0.65];
    habits.forEach((hb, i) => {
      if (d === 0 && i !== 0) return;
      if (r() < odds[i]) habitLogs.push({ id: uid(), habitId: hb.id, date: k, demo: true });
    });
  }

  /* Meals, water, weight */
  const byName = (n: string) => BUILTIN_FOODS.find((f) => f.name === n)!;
  const menus = [
    [['breakfast', 'Oatmeal with banana and honey', 1], ['breakfast', 'Cappuccino', 1], ['lunch', 'Chicken shawarma wrap', 1], ['snack', 'Apple', 1], ['dinner', 'Grilled salmon with rice', 1]],
    [['breakfast', 'Syrniki', 1], ['breakfast', 'Tea with sugar', 1], ['lunch', 'Borscht with sour cream', 1], ['lunch', 'Rye bread', 2], ['dinner', 'Chicken and vegetable stir-fry', 1], ['snack', 'Almonds', 1]],
    [['breakfast', 'Greek yogurt (plain, 2%)', 1], ['breakfast', 'Blueberries', 1], ['lunch', 'Falafel wrap', 1], ['snack', 'Protein bar', 1], ['dinner', 'Pelmeni with sour cream', 1]],
    [['breakfast', 'Shakshuka', 1], ['breakfast', 'Pita bread', 1], ['lunch', 'Caesar salad (chicken)', 1], ['dinner', 'Spaghetti bolognese', 1], ['snack', 'Dark chocolate 70%', 1]],
  ] as const;
  const meals: MealEntry[] = [];
  const water: WaterLog[] = [];
  const weight: WeightLog[] = [];
  for (let d = -21; d <= 0; d++) {
    const k = dayKey(addDays(today, d));
    const menu = menus[(d + 21) % menus.length];
    const items = d === 0 ? menu.filter(([slot]) => slot === 'breakfast') : menu;
    for (const [slot, name, servings] of items) {
      const f = byName(name);
      meals.push({ ...base, id: uid(), date: k, slot, foodId: f.id, name: f.name, servings, kcal: f.kcal * servings, protein: f.protein * servings, carbs: f.carbs * servings, fat: f.fat * servings });
    }
    const glasses = d === 0 ? 3 : 5 + Math.floor(r() * 4);
    for (let g = 0; g < glasses; g++) water.push({ id: uid(), date: k, ml: 250, at: at(d, 8 + g * 1.5), demo: true });
    if ((d + 21) % 2 === 0 || d === 0) weight.push({ id: uid(), date: k, kg: Math.round((78.4 - (d + 21) * 0.07 + (r() - 0.5) * 0.6) * 10) / 10, demo: true });
  }

  /* Notes */
  const noteDoc = (...content: unknown[]) => ({ type: 'doc', content });
  const notes: Note[] = [
    {
      ...base,
      id: uid(),
      title: 'Portfolio site plan',
      folder: 'Projects',
      tags: ['work', 'portfolio'],
      pinned: 1,
      links: ['Case study template'],
      content: noteDoc(
        h(1, 'Portfolio site plan'),
        p('Goal: a fast, simple site that shows six projects in depth.'),
        h(2, 'Pages'),
        { type: 'bulletList', content: [li('Home with three featured projects'), li('Work index'), li('About + contact')] },
        h(2, 'Next steps'),
        { type: 'taskList', content: [li('Choose the six projects', true), li('Write case studies using [[Case study template]]', false), li('Pick a domain', false)] },
      ),
      text: 'Portfolio site plan Goal: a fast, simple site that shows six projects in depth. Pages Home with three featured projects Work index About + contact Next steps Choose the six projects Write case studies using [[Case study template]] Pick a domain',
    },
    {
      ...base,
      id: uid(),
      title: 'Case study template',
      folder: 'Projects',
      tags: ['work', 'template'],
      pinned: 0,
      links: [],
      content: noteDoc(h(1, 'Case study template'), h(3, 'The problem'), p('What was broken, for whom, and why it mattered.'), h(3, 'What I did'), p('Two or three key decisions, with the reasoning.'), h(3, 'The result'), p('Numbers if possible. A quote from the client if not.')),
      text: 'Case study template The problem What was broken, for whom, and why it mattered. What I did Two or three key decisions, with the reasoning. The result Numbers if possible. A quote from the client if not.',
    },
    {
      ...base,
      id: uid(),
      title: '10K training notes',
      folder: 'Health',
      tags: ['running'],
      pinned: 0,
      links: [],
      content: noteDoc(h(1, '10K training notes'), p('Easy runs should feel conversational. One long run per week, add 1 km each week.'), { type: 'bulletList', content: [li('Week 1: 3K ×3'), li('Week 2: 4K ×3'), li('Week 3: 5K, 4K, 6K long run')] }),
      text: '10K training notes Easy runs should feel conversational. One long run per week, add 1 km each week. Week 1: 3K ×3 Week 2: 4K ×3 Week 3: 5K, 4K, 6K long run',
    },
    {
      ...base,
      id: uid(),
      title: 'Books to read',
      folder: 'Personal',
      tags: ['reading'],
      pinned: 0,
      links: [],
      content: noteDoc(h(1, 'Books to read'), { type: 'taskList', content: [li('Deep Work — Cal Newport', true), li('The Design of Everyday Things', false), li('Atomic Habits', true), li('Мастер и Маргарита', false)] }),
      text: 'Books to read Deep Work — Cal Newport The Design of Everyday Things Atomic Habits Мастер и Маргарита',
    },
  ];

  /* Ideas */
  const idea = (title: string, body: string, column: Idea['column'], x: number, y: number, color: Idea['color'] = 'none'): Idea => ({ ...base, id: uid(), title, body, column, x, y, color, order: order++ });
  const ideas: Idea[] = [
    idea('Weekly newsletter', 'Short notes on design and productivity, every Sunday.', 'exploring', 120, 120, 'blue'),
    idea('Podcast guest list', 'Five people whose work I admire.', 'raw', 420, 90),
    idea('Turn case studies into talks', 'Pitch to two local meetups.', 'raw', 420, 260, 'pink'),
    idea('Morning run club', 'Invite neighbours, Saturdays 8am.', 'doing', 120, 330),
    idea('Home office upgrade', 'Standing desk, better light, plants.', 'raw', 720, 160),
    idea('Learn watercolor', 'One small painting per week.', 'done', 720, 360),
  ];
  const ideaLinks: IdeaLink[] = [
    { id: uid(), from: ideas[0].id, to: ideas[2].id, demo: true },
    { id: uid(), from: ideas[1].id, to: ideas[2].id, demo: true },
  ];

  await db.transaction('rw', DEMO_TABLES.map((t) => db.table(t)), async () => {
    await db.tasks.bulkAdd(tasks);
    await db.events.bulkAdd(events);
    await db.habits.bulkAdd(habits);
    await db.habitLogs.bulkAdd(habitLogs);
    await db.goals.bulkAdd([goalRun, goalLaunch]);
    await db.focus.bulkAdd(focus);
    await db.notes.bulkAdd(notes);
    await db.ideas.bulkAdd(ideas);
    await db.ideaLinks.bulkAdd(ideaLinks);
    await db.meals.bulkAdd(meals);
    await db.water.bulkAdd(water);
    await db.weight.bulkAdd(weight);
    await db.sleep.bulkAdd(sleep);
    await db.mood.bulkAdd(mood);
  });
  await setKV('demo', true);
}

function dayKeyStart(d: Date) {
  return startOfDay(d).getTime();
}
