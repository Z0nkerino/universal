// Afina's daily briefing and evening reflection, written from the user's real data.
// Deterministic: always available, and the language model can rephrase it when present.
import { addDays, startOfDay } from 'date-fns';
import { db } from '@/lib/db';
import { dayKey, fmtTime } from '@/lib/dates';
import { expandEvents } from '@/features/calendar/recurrence';
import { useSettings } from '@/lib/settings';
import { getWeather, weatherSentence } from '@/features/connectors/weather';
import { mean } from '@/lib/stats';

type Lang = 'en' | 'ru';

const plural = (n: number, en: [string, string], ru: [string, string, string], lang: Lang) => {
  if (lang === 'en') return `${n} ${n === 1 ? en[0] : en[1]}`;
  const m10 = n % 10;
  const m100 = n % 100;
  const form = m10 === 1 && m100 !== 11 ? ru[0] : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? ru[1] : ru[2];
  return `${n} ${form}`;
};

export async function gatherDay(now = new Date()) {
  const d0 = startOfDay(now);
  const key = dayKey(d0);
  const to = addDays(d0, 1).getTime();
  const occ = expandEvents(await db.events.where('start').below(to).toArray(), d0.getTime(), to);
  const open = await db.tasks.where('done').equals(0).toArray();
  const today = open.filter((t) => t.status === 'today' || (t.due && t.due <= key) || t.top);
  const overdue = open.filter((t) => t.due && t.due < key);
  const doneToday = await db.tasks.where('doneAt').aboveOrEqual(d0.getTime()).toArray();
  const habits = await db.habits.filter((h) => !h.archived && h.period === 'day').toArray();
  const logs = await db.habitLogs.where('date').equals(key).toArray();
  const sleep = await db.sleep.where('date').equals(key).first();
  const recentSleep = await db.sleep.where('date').between(dayKey(addDays(d0, -7)), key).toArray();
  const focus = await db.focus.where('start').aboveOrEqual(d0.getTime()).toArray();
  return { now, occ, today, overdue, doneToday, habits, habitsDone: logs.length, sleep, recentSleep, focusMin: focus.reduce((a, f) => a + f.minutes, 0) };
}

export async function morningBriefing(lang: Lang, now = new Date()): Promise<string> {
  const d = await gatherDay(now);
  const parts: string[] = [];
  const wx = weatherSentence(await getWeather(), lang, now.getTime());
  if (wx) parts.push(wx);
  const timed = d.occ.filter((o) => !o.event.allDay && o.end > now.getTime());
  const next = timed[0];
  const top = [...d.today].sort((a, b) => (b.top ?? 0) - (a.top ?? 0) || b.priority - a.priority)[0];

  if (lang === 'ru') {
    if (d.sleep) parts.push(d.sleep.hours >= useSettings.getState().targets.sleepH - 0.5 ? `Ты спал(а) ${d.sleep.hours} ч — хороший старт.` : `Сон был коротким (${d.sleep.hours} ч), так что начни с лёгкого.`);
    if (timed.length) parts.push(`Сегодня ${plural(timed.length, ['', ''], ['событие', 'события', 'событий'], 'ru')}${next ? `, ближайшее — «${next.event.title}» в ${fmtTime(next.start)}` : ''}.`);
    else parts.push('В календаре свободно — отличный день для глубокой работы.');
    if (d.today.length) parts.push(`${plural(d.today.length, ['', ''], ['задача', 'задачи', 'задач'], 'ru')} на сегодня${top ? `; главное — «${top.title}»` : ''}.`);
    if (d.overdue.length) parts.push(`${plural(d.overdue.length, ['', ''], ['просроченная', 'просроченные', 'просроченных'], 'ru')} — разберём?`);
    if (!d.today.length && !timed.length) parts.push('Добавь одну задачу, которая сделает день удачным.');
    return parts.slice(0, 3).join(' ');
  }

  if (d.sleep) parts.push(d.sleep.hours >= useSettings.getState().targets.sleepH - 0.5 ? `You slept ${d.sleep.hours} h — good fuel for today.` : `Short night (${d.sleep.hours} h), so ease in with something light.`);
  if (timed.length) parts.push(`${plural(timed.length, ['event', 'events'], ['', '', ''], 'en')} today${next ? `, next up “${next.event.title}” at ${fmtTime(next.start)}` : ''}.`);
  else parts.push('Your calendar is clear — a good day for deep work.');
  if (d.today.length) parts.push(`${plural(d.today.length, ['task', 'tasks'], ['', '', ''], 'en')} on your plate${top ? `; start with “${top.title}”` : ''}.`);
  if (d.overdue.length) parts.push(`${plural(d.overdue.length, ['task is', 'tasks are'], ['', '', ''], 'en')} overdue — want to reschedule?`);
  if (!d.today.length && !timed.length) parts.push('Add one thing that would make today a win.');
  return parts.slice(0, 3).join(' ');
}

export async function eveningReflection(lang: Lang, now = new Date()): Promise<string> {
  const d = await gatherDay(now);
  const left = d.today.length;
  const avgSleep = mean(d.recentSleep.map((s) => s.hours));
  if (lang === 'ru') {
    const parts = [`Сегодня сделано: ${plural(d.doneToday.length, ['', ''], ['задача', 'задачи', 'задач'], 'ru')}${d.focusMin ? `, ${d.focusMin} мин фокуса` : ''}.`];
    if (d.habits.length) parts.push(`Привычки: ${d.habitsDone} из ${d.habits.length}.`);
    parts.push(left ? `${plural(left, ['', ''], ['задача осталась', 'задачи остались', 'задач осталось'], 'ru')} — перенести на завтра?` : 'Всё закрыто. Отдыхай без чувства вины.');
    if (!Number.isNaN(avgSleep) && avgSleep < 7) parts.push(`В среднем ты спишь ${avgSleep.toFixed(1)} ч — может, лечь пораньше?`);
    return parts.join(' ');
  }
  const parts = [`Today you finished ${plural(d.doneToday.length, ['task', 'tasks'], ['', '', ''], 'en')}${d.focusMin ? ` and focused for ${d.focusMin} min` : ''}.`];
  if (d.habits.length) parts.push(`Habits: ${d.habitsDone} of ${d.habits.length}.`);
  parts.push(left ? `${plural(left, ['task is', 'tasks are'], ['', '', ''], 'en')} still open — move them to tomorrow?` : 'Everything’s closed out. Rest without guilt.');
  if (!Number.isNaN(avgSleep) && avgSleep < 7) parts.push(`You’ve averaged ${avgSleep.toFixed(1)} h of sleep this week — maybe an early night?`);
  return parts.join(' ');
}

/** Moves today's unfinished tasks to tomorrow (keeps them unscheduled). */
export async function rollOverToTomorrow(now = new Date()) {
  const key = dayKey(now);
  const tomorrow = dayKey(addDays(now, 1));
  const open = await db.tasks.where('done').equals(0).filter((t) => t.status === 'today' || (!!t.due && t.due <= key)).toArray();
  for (const t of open) await db.tasks.update(t.id, { due: tomorrow, status: 'scheduled', start: undefined, end: undefined, top: 0, updatedAt: Date.now() });
  return open.length;
}
