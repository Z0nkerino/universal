// All Insights numbers come from here: plain functions over the user's records.
// Every cross-insight has a minimum sample size and reports it; nothing is invented.
import { addDays, startOfDay } from 'date-fns';
import type { FocusSession, Habit, HabitLog, MealEntry, MoodLog, SleepLog, Task, WaterLog, WeightLog } from '@/lib/types';
import { dayKey } from '@/lib/dates';
import { describeCorrelation, linearRegression, mean, movingAverage, pearson, percentLift, sum } from '@/lib/stats';
import { consistency, currentStreak, bestStreak } from '@/features/planner/habits';

export interface Records {
  tasks: Task[];
  focus: FocusSession[];
  habits: Habit[];
  habitLogs: HabitLog[];
  meals: MealEntry[];
  water: WaterLog[];
  weight: WeightLog[];
  sleep: SleepLog[];
  mood: MoodLog[];
}

export interface Day {
  key: string;
  date: Date;
  tasksDone: number;
  focusMin: number;
  plannedMin: number;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  waterMl: number | null;
  sleepH: number | null;
  mood: number | null;
  weight: number | null;
}

export function buildDays(r: Records, days: number, end = new Date()): Day[] {
  const end0 = startOfDay(end);
  const keys = Array.from({ length: days }, (_, i) => dayKey(addDays(end0, i - days + 1)));
  const by = <T,>(items: T[], k: (x: T) => string) => {
    const m = new Map<string, T[]>();
    for (const x of items) {
      const key = k(x);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(x);
    }
    return m;
  };
  const done = by(r.tasks.filter((t) => t.done && t.doneAt), (t) => dayKey(t.doneAt!));
  const planned = by(r.tasks.filter((t) => t.start && t.end), (t) => dayKey(t.start!));
  const focus = by(r.focus, (f) => dayKey(f.start));
  const meals = by(r.meals, (m) => m.date);
  const water = by(r.water, (w) => w.date);
  const sleep = new Map(r.sleep.map((s) => [s.date, s.hours]));
  const mood = new Map(r.mood.map((m) => [m.date, m.score]));
  const weight = new Map(r.weight.map((w) => [w.date, w.kg]));
  return keys.map((key, i) => {
    const m = meals.get(key);
    const w = water.get(key);
    return {
      key,
      date: addDays(end0, i - days + 1),
      tasksDone: done.get(key)?.length ?? 0,
      focusMin: sum((focus.get(key) ?? []).map((f) => f.minutes)),
      plannedMin: sum((planned.get(key) ?? []).map((t) => (t.end! - t.start!) / 60_000)),
      kcal: m ? sum(m.map((x) => x.kcal)) : null,
      protein: m ? sum(m.map((x) => x.protein)) : null,
      carbs: m ? sum(m.map((x) => x.carbs)) : null,
      fat: m ? sum(m.map((x) => x.fat)) : null,
      waterMl: w ? sum(w.map((x) => x.ml)) : null,
      sleepH: sleep.get(key) ?? null,
      mood: mood.get(key) ?? null,
      weight: weight.get(key) ?? null,
    };
  });
}

/** Share of tasks due in the range that got done. */
export function completionRate(tasks: Task[], from: string, to: string) {
  const due = tasks.filter((t) => t.due && t.due >= from && t.due <= to);
  if (!due.length) return null;
  return { rate: due.filter((t) => t.done).length / due.length, n: due.length };
}

/** 7 × 24 grid (weekday × hour, Monday first) of completions plus focus sessions (in 25-min units). */
export function productiveHeatmap(tasks: Task[], focus: FocusSession[], since: number) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const add = (t: number, w: number) => {
    const d = new Date(t);
    grid[(d.getDay() + 6) % 7][d.getHours()] += w;
  };
  for (const t of tasks) if (t.doneAt && t.doneAt >= since) add(t.doneAt, 1);
  for (const f of focus) if (f.start >= since) add(f.start, f.minutes / 25);
  return grid;
}

/** The 2-hour window with the most completed work. */
export function peakWindow(grid: number[][]) {
  const byHour = new Array(24).fill(0);
  grid.forEach((row) => row.forEach((v, h) => (byHour[h] += v)));
  const total = sum(byHour);
  let best = 0;
  let at = 9;
  for (let h = 0; h < 23; h++) {
    const v = byHour[h] + byHour[h + 1];
    if (v > best) {
      best = v;
      at = h;
    }
  }
  return { start: at, end: at + 2, share: total ? best / total : 0, total };
}

export function habitStats(habits: Habit[], logs: HabitLog[], today: Date, weekStartsOn: 0 | 1) {
  return habits.map((h) => {
    const set = new Set(logs.filter((l) => l.habitId === h.id).map((l) => l.date));
    return { habit: h, streak: currentStreak(h, set, today, weekStartsOn), best: bestStreak(h, set, today, weekStartsOn), consistency: consistency(h, set, today, weekStartsOn) };
  });
}

/** Weight series with a 7-day moving average and the least-squares slope in kg/week. */
export function weightTrend(days: Day[]) {
  const ma = movingAverage(days.map((d) => d.weight), 7);
  const pts = days.map((d, i) => ({ x: i, y: d.weight })).filter((p): p is { x: number; y: number } => p.y !== null);
  const reg = pts.length >= 4 ? linearRegression(pts.map((p) => p.x), pts.map((p) => p.y)) : null;
  return { ma, perWeek: reg ? reg.slope * 7 : null, n: pts.length, first: pts[0]?.y ?? null, last: pts.at(-1)?.y ?? null };
}

/** Pairs a night's sleep (logged on the morning's date) with that day's mood. */
export function sleepMoodPairs(days: Day[]) {
  return days.filter((d) => d.sleepH !== null && d.mood !== null).map((d) => ({ sleep: d.sleepH!, mood: d.mood!, key: d.key }));
}

export interface Insight {
  id: string;
  title: string;
  detail: string;
  tone: 'blue' | 'pink' | 'neutral';
}

type Lang = 'en' | 'ru';

/** Cross-cutting findings, each backed by enough data points to mean something. */
export function crossInsights(days: Day[], grid: number[][], lang: Lang, targets: { kcal: number; sleepH: number }): Insight[] {
  const out: Insight[] = [];
  const past = days.slice(0, -1); // today isn't over yet
  const ru = lang === 'ru';

  // 1. Sleep → output.
  const slept = past.filter((d) => d.sleepH !== null);
  const good = slept.filter((d) => d.sleepH! >= 7).map((d) => d.tasksDone);
  const short = slept.filter((d) => d.sleepH! < 7).map((d) => d.tasksDone);
  const lift = percentLift(short, good);
  if (lift !== null && Math.abs(lift) >= 10) {
    out.push({
      id: 'sleep-tasks',
      tone: lift > 0 ? 'blue' : 'pink',
      title: ru
        ? `В дни, когда ты спишь 7+ часов, ты делаешь на ${Math.abs(lift)}% ${lift > 0 ? 'больше' : 'меньше'} задач.`
        : `On days you sleep 7+ hours you complete ${Math.abs(lift)}% ${lift > 0 ? 'more' : 'fewer'} tasks.`,
      detail: ru
        ? `${mean(good).toFixed(1)} против ${mean(short).toFixed(1)} задач в день · ${good.length} и ${short.length} дней`
        : `${mean(good).toFixed(1)} vs ${mean(short).toFixed(1)} tasks a day · based on ${good.length} and ${short.length} days`,
    });
  }

  // 2. Sleep ↔ mood.
  const pairs = sleepMoodPairs(past);
  if (pairs.length >= 7) {
    const r = pearson(pairs.map((p) => p.sleep), pairs.map((p) => p.mood));
    if (!Number.isNaN(r) && Math.abs(r) >= 0.3) {
      out.push({
        id: 'sleep-mood',
        tone: 'blue',
        title: ru ? `Сон и настроение связаны: чем больше спишь, тем ${r > 0 ? 'лучше' : 'хуже'} день.` : `Your sleep and mood move together — ${r > 0 ? 'more sleep, better days' : 'oddly, more sleep, lower mood'}.`,
        detail: ru ? `Корреляция r = ${r.toFixed(2)} · ${pairs.length} дней` : `${describeCorrelation(r)} (r = ${r.toFixed(2)}) · ${pairs.length} days`,
      });
    }
  }

  // 3. Focus → output.
  const focused = past.filter((d) => d.focusMin >= 30).map((d) => d.tasksDone);
  const unfocused = past.filter((d) => d.focusMin < 30).map((d) => d.tasksDone);
  const fl = percentLift(unfocused, focused);
  if (fl !== null && fl >= 15) {
    // Very large lifts read better as a multiple ("2.5× as many") than as a percentage.
    const times = (1 + fl / 100).toFixed(1);
    out.push({
      id: 'focus-tasks',
      tone: 'pink',
      title: ru
        ? fl >= 100 ? `В дни с 30+ минутами фокуса ты делаешь в ${times} раза больше задач.` : `Дни с 30+ минутами фокуса дают на ${fl}% больше выполненных задач.`
        : fl >= 100 ? `Days with 30+ focus minutes end with ${times}× as many tasks done.` : `Days with 30+ focus minutes end with ${fl}% more tasks done.`,
      detail: ru ? `${focused.length} дней с фокусом и ${unfocused.length} без` : `${focused.length} focused days vs ${unfocused.length} others`,
    });
  }

  // 4. Peak hours.
  const peak = peakWindow(grid);
  if (peak.total >= 10 && peak.share >= 0.2) {
    const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
    out.push({
      id: 'peak',
      tone: 'neutral',
      title: ru ? `Твои самые продуктивные часы — ${hh(peak.start)}–${hh(peak.end)}.` : `Your most productive hours are ${hh(peak.start)}–${hh(peak.end)}.`,
      detail: ru ? `${Math.round(peak.share * 100)}% выполненной работы приходится на это окно. «Спланировать день» ставит туда сложные задачи.` : `${Math.round(peak.share * 100)}% of your finished work lands in this window. “Plan my day” puts demanding tasks here.`,
    });
  }

  // 5. Calories vs target.
  const logged = past.filter((d) => d.kcal !== null && d.kcal > 300);
  if (logged.length >= 5) {
    const avg = mean(logged.map((d) => d.kcal!));
    const pct = Math.round((avg / targets.kcal) * 100);
    out.push({
      id: 'kcal',
      tone: pct > 110 ? 'pink' : 'blue',
      title: ru ? `В среднем ${Math.round(avg)} ккал в день — ${pct}% от цели.` : `You average ${Math.round(avg)} kcal a day — ${pct}% of your target.`,
      detail: ru ? `${logged.length} дней с записями` : `Across ${logged.length} logged days`,
    });
  }

  // 6. Sleep vs target.
  if (slept.length >= 5) {
    const avg = mean(slept.map((d) => d.sleepH!));
    if (avg < targets.sleepH - 0.5)
      out.push({
        id: 'sleep-target',
        tone: 'pink',
        title: ru ? `Ты спишь в среднем ${avg.toFixed(1)} ч — на ${(targets.sleepH - avg).toFixed(1)} ч меньше цели.` : `You're averaging ${avg.toFixed(1)} h of sleep — ${(targets.sleepH - avg).toFixed(1)} h under your goal.`,
        detail: ru ? `${slept.length} ночей` : `${slept.length} nights logged`,
      });
  }
  return out;
}

export interface WeeklyReview {
  from: Date;
  to: Date;
  tasksDone: number;
  tasksDelta: number | null;
  focusMin: number;
  focusDelta: number | null;
  avgSleep: number | null;
  avgMood: number | null;
  weightChange: number | null;
  avgKcal: number | null;
  bestDay: Day | null;
  suggestions: string[];
}

/** Summary of the 7 days ending on `end`, compared with the 7 before. */
export function weeklyReview(r: Records, end: Date, lang: Lang, targets: { kcal: number; sleepH: number }): WeeklyReview {
  const days = buildDays(r, 14, end);
  const prev = days.slice(0, 7);
  const cur = days.slice(7);
  const tot = (ds: Day[], k: 'tasksDone' | 'focusMin') => sum(ds.map((d) => d[k]));
  const avgOf = (ds: Day[], k: 'sleepH' | 'mood' | 'kcal') => {
    const v = ds.map((d) => d[k]).filter((x): x is number => x !== null);
    return v.length ? mean(v) : null;
  };
  const weights = cur.map((d) => d.weight).filter((x): x is number => x !== null);
  const best = [...cur].sort((a, b) => b.tasksDone + b.focusMin / 60 - (a.tasksDone + a.focusMin / 60))[0];
  const ru = lang === 'ru';
  const suggestions: string[] = [];
  const avgSleep = avgOf(cur, 'sleepH');
  if (avgSleep !== null && avgSleep < targets.sleepH - 0.5) suggestions.push(ru ? 'Попробуй ложиться на 30 минут раньше хотя бы 4 дня.' : 'Try going to bed 30 minutes earlier on at least 4 nights.');
  if (tot(cur, 'focusMin') < 120) suggestions.push(ru ? 'Запланируй два блока фокуса по 25 минут на самые важные задачи.' : 'Book two 25-minute focus blocks for your most important tasks.');
  const prevDone = tot(prev, 'tasksDone');
  if (prevDone && tot(cur, 'tasksDone') < prevDone * 0.7) suggestions.push(ru ? 'Неделя была тяжелее. Выбирай меньше задач на день — три главных.' : 'This week was lighter. Pick fewer tasks per day — just your top three.');
  const avgKcal = avgOf(cur, 'kcal');
  if (avgKcal !== null && avgKcal > targets.kcal * 1.15) suggestions.push(ru ? 'Калорий больше цели — добавь овощи к обеду и ужину.' : 'Calories ran over target — add vegetables to lunch and dinner.');
  if (!suggestions.length) suggestions.push(ru ? 'Хороший ритм. Сохрани то, что сработало, и добавь одну новую привычку.' : 'Good rhythm. Keep what worked and add one small new habit.');
  return {
    from: cur[0].date,
    to: cur[6].date,
    tasksDone: tot(cur, 'tasksDone'),
    tasksDelta: prevDone ? tot(cur, 'tasksDone') - prevDone : null,
    focusMin: tot(cur, 'focusMin'),
    focusDelta: tot(prev, 'focusMin') ? tot(cur, 'focusMin') - tot(prev, 'focusMin') : null,
    avgSleep,
    avgMood: avgOf(cur, 'mood'),
    weightChange: weights.length >= 2 ? Math.round((weights.at(-1)! - weights[0]) * 10) / 10 : null,
    avgKcal,
    bestDay: best && (best.tasksDone || best.focusMin) ? best : null,
    suggestions,
  };
}
