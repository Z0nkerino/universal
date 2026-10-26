// Afina's local intelligence engine: deterministic, always available, bilingual.
// It recognises what the user wants and does it through the same actions the app's
// screens use. The on-device language model (llm.ts) only steps in for what this can't parse.
import * as chronoEn from 'chrono-node/en';
import * as chronoRu from 'chrono-node/ru';
import { addDays, startOfDay, startOfWeek } from 'date-fns';
import { db } from '@/lib/db';
import {
  addWater, createIdea, createGoal, createNote, createTask, deleteEvent, deleteIdea, deleteNote, deleteTask, logFood, logMood, logSleep, logWeight, quickAdd, setTaskDone, updateEvent, updateTask,
} from '@/lib/actions';
import { detectLang, type Lang } from '@/lib/nlp';
import { dayKey, fmt, fmtTime, todayKey } from '@/lib/dates';
import { useSettings } from '@/lib/settings';
import { mean, sum } from '@/lib/stats';
import type { CalEvent, Food, MoodLog, Note, Task } from '@/lib/types';
import type { Route } from '@/app/router';
import { BUILTIN_FOODS } from '@/features/diet/foods';
import { expandEvents } from '@/features/calendar/recurrence';
import { breakDownTask } from '@/features/planner/breakdown';
import { planMyDay } from '@/features/planner/planDay';
import { currentStreak } from '@/features/planner/habits';
import { searchNotes } from '@/features/notes/search';
import { eveningReflection, morningBriefing } from './briefing';
import { parseFoodSentence } from './foodParse';

export type ConfirmAction = { kind: 'delete_task' | 'delete_event' | 'delete_note' | 'delete_idea'; id: string; title: string };

export interface AfinaReply {
  text: string;
  /** Suggested follow-ups, sent as messages when tapped. */
  chips?: string[];
  /** A destructive action waiting for the user's explicit OK. */
  confirm?: ConfirmAction;
  /** Reverts what this reply just did. */
  undo?: () => Promise<unknown>;
  navigate?: Route;
  /** false = the engine didn't understand; let the language model try. */
  handled: boolean;
}

const L = (lang: Lang, en: string, ru: string) => (lang === 'ru' ? ru : en);

/** "1 task" / "2 tasks"; Russian picks one of three forms (задача / задачи / задач). */
export function pl(lang: Lang, n: number, en: [string, string], ru: [string, string, string]) {
  if (lang === 'en') return `${n} ${n === 1 ? en[0] : en[1]}`;
  const m10 = n % 10;
  const m100 = n % 100;
  return `${n} ${m10 === 1 && m100 !== 11 ? ru[0] : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? ru[1] : ru[2]}`;
}
const TASKS: [[string, string], [string, string, string]] = [['task', 'tasks'], ['задачу', 'задачи', 'задач']];
const isQuestion = (s: string) => /\?\s*$/.test(s) || /^(how|what|when|which|who|where|did|do|does|am|is|are|was|were|have|has|can|should|show|tell|list|give|сколько|как|что|когда|какой|какая|какие|где|покажи|расскажи|был[аи]?|есть ли|могу)\b/i.test(s.trim()) || /^(сколько|как|что|когда|какой|какая|какие|где|покажи|расскажи)\s/i.test(s.trim());

/* ---------- Fuzzy lookup ---------- */

const tokens = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1);

export function bestMatch<T>(items: T[], query: string, title: (t: T) => string): T | null {
  const q = tokens(query);
  if (!q.length) return null;
  let best: { item: T; score: number } | null = null;
  for (const item of items) {
    const tt = tokens(title(item));
    const full = title(item).toLowerCase();
    let score = 0;
    if (full === query.toLowerCase().trim()) score = 100;
    else if (full.includes(query.toLowerCase().trim())) score = 60;
    const hits = q.filter((w) => tt.some((t) => t.startsWith(w) || w.startsWith(t))).length;
    score += (hits / q.length) * 40 + (hits / Math.max(tt.length, 1)) * 10;
    if (!best || score > best.score) best = { item, score };
  }
  return best && best.score >= 25 ? best.item : null;
}

/* ---------- Helpers ---------- */

async function customAndBuiltinFoods(): Promise<Food[]> {
  return [...(await db.foods.toArray()), ...BUILTIN_FOODS];
}

function list(items: string[]) {
  return items.map((s) => `• ${s}`).join('\n');
}

async function agenda(day: Date, lang: Lang) {
  const d0 = startOfDay(day);
  const to = addDays(d0, 1).getTime();
  const occ = expandEvents(await db.events.where('start').below(to).toArray(), d0.getTime(), to);
  const tasks = await db.tasks.where('start').between(d0.getTime(), to).filter((t) => !t.done).toArray();
  const items = [
    ...occ.filter((o) => o.event.allDay || o.end - o.start >= 86_400_000).map((o) => ({ t: -1, s: `${o.event.title} (${L(lang, 'all day', 'весь день')})` })),
    ...occ.filter((o) => !o.event.allDay && o.end - o.start < 86_400_000).map((o) => ({ t: o.start, s: `${fmtTime(o.start)} ${o.event.title}` })),
    ...tasks.map((t) => ({ t: t.start!, s: `${fmtTime(t.start!)} ${t.title} ${L(lang, '(task)', '(задача)')}` })),
  ].sort((a, b) => a.t - b.t);
  return items.map((i) => i.s);
}

function extractiveSummary(note: Note, sentences = 3) {
  const parts = note.text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12 && s !== note.title);
  if (!parts.length) return note.text.slice(0, 200);
  // Prefer sentences that share words with the rest of the note (a simple centrality score).
  const freq = new Map<string, number>();
  for (const w of tokens(note.text)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const scored = parts.map((p, i) => ({ p, i, s: sum(tokens(p).map((w) => freq.get(w) ?? 0)) / Math.sqrt(tokens(p).length + 1) }));
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, sentences)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.p)
    .join(' ');
}

/* ---------- Intents ---------- */

type Handler = (text: string, lang: Lang, m: RegExpMatchArray) => Promise<AfinaReply | null>;

const HELP: Handler = async (_t, lang) => ({
  handled: true,
  text: L(
    lang,
    'I can add tasks and events, log meals, water, sleep, mood and weight, plan your day around your calendar, break big tasks into small steps, and answer questions about your own data. Try one of these:',
    'Я могу добавлять задачи и события, записывать еду, воду, сон, настроение и вес, планировать день вокруг календаря, разбивать большие задачи на шаги и отвечать на вопросы о твоих данных. Попробуй:',
  ),
  chips: lang === 'ru' ? ['Спланируй мой день', 'Как я спал на этой неделе?', 'Съел шаурму и колу на обед', 'Разбей «написать отчёт» на шаги'] : ['Plan my day', 'How did I sleep this week?', 'I ate shawarma and a Coke for lunch', 'Break down “write the report”'],
});

const BRIEFING: Handler = async (_t, lang) => {
  const text = await morningBriefing(lang);
  const items = await agenda(new Date(), lang);
  return { handled: true, text: items.length ? `${text}\n\n${list(items)}` : text, chips: lang === 'ru' ? ['Спланируй мой день', 'Когда я свободен завтра?'] : ['Plan my day', 'When am I free tomorrow?'] };
};

const REFLECTION: Handler = async (_t, lang) => ({
  handled: true,
  text: await eveningReflection(lang),
  chips: lang === 'ru' ? ['Перенеси незаконченное на завтра', 'Как я спал на этой неделе?'] : ['Move unfinished tasks to tomorrow', 'How did I sleep this week?'],
});

const PLAN: Handler = async (_t, lang) => {
  const r = await planMyDay();
  if (!r.scheduled.length && !r.unscheduled.length) return { handled: true, text: L(lang, 'Everything on today’s list already has a time. Nothing to move.', 'У всех задач на сегодня уже есть время.') };
  const lines = r.scheduled.map((s) => `${fmtTime(s.start)}–${fmtTime(s.end)} ${s.task.title}`);
  const n = pl(lang, r.scheduled.length, ...TASKS);
  let text = L(lang, `Done — I blocked time for ${n} around your events, with demanding work in your sharpest hours.`, `Готово — расставил ${n} вокруг событий, сложное — на твои самые продуктивные часы.`);
  if (lines.length) text += `\n\n${list(lines)}`;
  if (r.unscheduled.length) text += `\n\n${L(lang, 'Didn’t fit today', 'Не поместилось сегодня')}: ${r.unscheduled.map((t) => t.title).join(', ')}.`;
  return { handled: true, text, undo: r.undo, chips: lang === 'ru' ? ['Открой планировщик'] : ['Open my timeline'], navigate: undefined };
};

const BREAKDOWN: Handler = async (_t, lang, m) => {
  const raw = (m[1] ?? '').replace(/^["“«']|["”»']$/g, '').trim();
  if (!raw) return { handled: true, text: L(lang, 'Which task should I break down?', 'Какую задачу разбить на шаги?') };
  const what = raw[0].toUpperCase() + raw.slice(1);
  const open = await db.tasks.where('done').equals(0).toArray();
  const existing = bestMatch(open, what, (t) => t.title);
  const steps = breakDownTask(existing?.title ?? what);
  const subtasks = steps.map((title) => ({ id: crypto.randomUUID(), title, done: false }));
  if (existing) {
    const before = existing.subtasks;
    await updateTask(existing.id, { subtasks: [...existing.subtasks, ...subtasks] });
    return { handled: true, text: `${L(lang, `Here’s “${existing.title}” in small steps. Start with the first — it takes a couple of minutes.`, `Вот «${existing.title}» по шагам. Начни с первого — это пара минут.`)}\n\n${list(steps)}`, undo: () => updateTask(existing.id, { subtasks: before }), chips: lang === 'ru' ? ['Начать на 2 минуты'] : ['Just start for 2 minutes'] };
  }
  const task = await createTask({ title: what, subtasks, status: 'today', due: todayKey() });
  return { handled: true, text: `${L(lang, `I added “${task.title}” for today, split into steps:`, `Добавил «${task.title}» на сегодня, по шагам:`)}\n\n${list(steps)}`, undo: () => deleteTask(task.id), chips: lang === 'ru' ? ['Начать на 2 минуты'] : ['Just start for 2 minutes'] };
};

const WATER: Handler = async (text, lang) => {
  const t = text.toLowerCase();
  let ml = 0;
  const mlM = t.match(/(\d+(?:[.,]\d+)?)\s*(ml|мл|l|л|liters?|litres?|литр\w*)\b/);
  const glassM = t.match(/(\d+|a|an|one|two|three|four|один|одну|два|две|три|четыре)\s+(glass(?:es)?|cups?|bottles?|стакан\w*|бутылк\w*)/);
  const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, один: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4 };
  if (mlM) ml = parseFloat(mlM[1].replace(',', '.')) * (/^(l|л|liter|litre|литр)/.test(mlM[2]) ? 1000 : 1);
  else if (glassM) ml = (Number(glassM[1]) || words[glassM[1]] || 1) * (/bottle|бутыл/.test(glassM[2]) ? 500 : 250);
  else ml = 250;
  ml = Math.round(ml);
  const rec = await addWater(ml);
  const total = sum((await db.water.where('date').equals(todayKey()).toArray()).map((w) => w.ml));
  const target = useSettings.getState().targets.waterMl;
  return { handled: true, text: L(lang, `Logged ${ml} ml. You’re at ${total} of ${target} ml today${total >= target ? ' — goal reached 💧' : ''}.`, `Записал ${ml} мл. Сегодня ${total} из ${target} мл${total >= target ? ' — цель достигнута 💧' : ''}.`), undo: () => db.water.delete(rec as string) };
};

const FOOD: Handler = async (text, lang) => {
  const foods = await customAndBuiltinFoods();
  const { items, slot } = parseFoodSentence(text, foods);
  if (!items.length) return null;
  const found = items.filter((i) => i.food);
  const missing = items.filter((i) => !i.food).map((i) => i.query);
  const created: string[] = [];
  for (const i of found) created.push((await logFood(i.food!, i.servings, slot)).id);
  const kcal = Math.round(sum(found.map((i) => i.food!.kcal * i.servings)));
  const day = await db.meals.where('date').equals(todayKey()).toArray();
  const total = Math.round(sum(day.map((m) => m.kcal)));
  const target = useSettings.getState().targets.kcal;
  const names = found.map((i) => `${i.servings !== 1 ? `${i.servings}× ` : ''}${lang === 'ru' && i.food!.nameRu ? i.food!.nameRu : i.food!.name}`);
  let reply = found.length
    ? L(lang, `Logged ${names.join(' + ')} — about ${kcal} kcal. That’s ${total} of ${target} kcal today.`, `Записал: ${names.join(' + ')} — примерно ${kcal} ккал. Сегодня ${total} из ${target} ккал.`)
    : '';
  if (missing.length) reply += `${reply ? ' ' : ''}${L(lang, `I couldn’t find “${missing.join('”, “')}” in the food list — you can add it as a custom food in Health.`, `Не нашёл «${missing.join('», «')}» в базе — можно добавить как свой продукт в разделе Здоровье.`)}`;
  return { handled: true, text: reply, undo: created.length ? () => db.meals.bulkDelete(created) : undefined, chips: lang === 'ru' ? ['Сколько калорий сегодня?'] : ['How many calories today?'] };
};

const WEIGHT_LOG: Handler = async (_t, lang, m) => {
  const kg = parseFloat((m[1] ?? m[2]).replace(',', '.'));
  if (!(kg > 20 && kg < 400)) return null;
  await logWeight(kg);
  return { handled: true, text: L(lang, `Logged ${kg} kg.`, `Записал вес: ${kg} кг.`), chips: lang === 'ru' ? ['Как меняется мой вес?'] : ['What’s my weight trend?'] };
};

const SLEEP_LOG: Handler = async (_t, lang, m) => {
  const h = parseFloat(m[1].replace(',', '.'));
  if (!(h > 0 && h <= 16)) return null;
  await logSleep(h);
  const goal = useSettings.getState().targets.sleepH;
  return { handled: true, text: h >= goal - 0.5 ? L(lang, `Logged ${h} h of sleep. Nicely rested.`, `Записал сон: ${h} ч. Хорошо отдохнул(а).`) : L(lang, `Logged ${h} h. A bit short — go easy on yourself today.`, `Записал ${h} ч. Маловато — береги силы сегодня.`) };
};

const MOOD_WORDS: [RegExp, MoodLog['score']][] = [
  [/(amazing|fantastic|great|awesome|wonderful|отлично|прекрасно|супер|замечательно)/i, 5],
  [/(good|fine|happy|хорошо|неплохо)/i, 4],
  [/(okay|ok|alright|meh|so-so|нормально|так себе)/i, 3],
  [/(tired|low|down|sad|stressed|устал|грустно|плохо|стресс)/i, 2],
  [/(terrible|awful|horrible|miserable|ужасно|отвратительно)/i, 1],
];
const MOOD_LOG: Handler = async (text, lang, m) => {
  const n = m[1] ? Math.round(Number(m[1])) : MOOD_WORDS.find(([re]) => re.test(text))?.[1];
  if (!n || n < 1 || n > 5) return null;
  await logMood(n as MoodLog['score'], text.length < 140 ? text : undefined);
  const lines = lang === 'ru' ? ['Тяжёлый день. Сделай что-то маленькое и доброе для себя.', 'Записал. Может, короткая прогулка поможет?', 'Записал. Ровный день — тоже хорошо.', 'Рад(а) слышать! Записал.', 'Отлично! Записал — пусть так и продолжается.'] : ['Rough one. Do one small kind thing for yourself today.', 'Noted. A short walk might help.', 'Noted. Steady is good too.', 'Glad to hear it — logged.', 'Love that. Logged — keep it rolling.'];
  return { handled: true, text: lines[n - 1] };
};

const COMPLETE: Handler = async (_t, lang, m) => {
  const what = m[1].trim();
  const open = await db.tasks.where('done').equals(0).toArray();
  const t = bestMatch(open, what, (x) => x.title);
  if (!t) return { handled: true, text: L(lang, `I couldn’t find an open task like “${what}”.`, `Не нашёл открытую задачу «${what}».`) };
  await setTaskDone(t.id, true);
  const left = open.length - 1;
  return { handled: true, text: L(lang, `Checked off “${t.title}”. ${left ? `${left} to go.` : 'That’s everything!'}`, `Отметил «${t.title}» выполненной. ${left ? `Осталось ${left}.` : 'Это всё!'}`), undo: () => setTaskDone(t.id, false) };
};

const DELETE: Handler = async (_t, lang, m) => {
  const kind = (m[1] ?? '').toLowerCase();
  const what = m[2].trim().replace(/^["“«']|["”»']$/g, '');
  const pick = async (): Promise<ConfirmAction | null> => {
    if (!kind || /task|задач/.test(kind)) {
      const t = bestMatch(await db.tasks.toArray(), what, (x) => x.title);
      if (t) return { kind: 'delete_task', id: t.id, title: t.title };
    }
    if (!kind || /event|meeting|событи|встреч/.test(kind)) {
      const e = bestMatch(await db.events.toArray(), what, (x) => x.title);
      if (e) return { kind: 'delete_event', id: e.id, title: e.title };
    }
    if (!kind || /note|заметк/.test(kind)) {
      const n = bestMatch(await db.notes.toArray(), what, (x) => x.title);
      if (n) return { kind: 'delete_note', id: n.id, title: n.title };
    }
    if (!kind || /idea|иде/.test(kind)) {
      const i = bestMatch(await db.ideas.toArray(), what, (x) => x.title);
      if (i) return { kind: 'delete_idea', id: i.id, title: i.title };
    }
    return null;
  };
  const target = await pick();
  if (!target) return { handled: true, text: L(lang, `I couldn’t find anything called “${what}”.`, `Не нашёл ничего с названием «${what}».`) };
  const label = { delete_task: L(lang, 'task', 'задачу'), delete_event: L(lang, 'event', 'событие'), delete_note: L(lang, 'note', 'заметку'), delete_idea: L(lang, 'idea', 'идею') }[target.kind];
  return { handled: true, text: L(lang, `Delete the ${label} “${target.title}”? This can’t be undone.`, `Удалить ${label} «${target.title}»? Это нельзя отменить.`), confirm: target };
};

export async function runConfirmed(a: ConfirmAction, lang: Lang): Promise<AfinaReply> {
  if (a.kind === 'delete_task') await deleteTask(a.id);
  if (a.kind === 'delete_event') await deleteEvent(a.id);
  if (a.kind === 'delete_note') await deleteNote(a.id);
  if (a.kind === 'delete_idea') await deleteIdea(a.id);
  return { handled: true, text: L(lang, `Deleted “${a.title}”.`, `Удалил «${a.title}».`) };
}

const MOVE: Handler = async (_t, lang, m) => {
  const what = m[1].trim();
  const when = m[2].trim();
  const parser = lang === 'ru' ? chronoRu.casual : chronoEn.casual;
  const r = parser.parse(when, new Date(), { forwardDate: true })[0];
  if (!r) return { handled: true, text: L(lang, `When should I move it to? Try “tomorrow 3pm”.`, `На когда перенести? Например, «завтра в 15:00».`) };
  const date = r.start.date();
  const hasTime = r.start.isCertain('hour');
  const task = bestMatch(await db.tasks.where('done').equals(0).toArray(), what, (x) => x.title);
  const event = task ? null : bestMatch(await db.events.toArray(), what, (x) => x.title);
  if (task) {
    const before: Partial<Task> = { due: task.due, start: task.start, end: task.end, status: task.status };
    const start = hasTime ? date.getTime() : undefined;
    const dur = (task.estimate ?? 30) * 60_000;
    await updateTask(task.id, { due: dayKey(date), start, end: start ? start + dur : undefined, status: dayKey(date) === todayKey() ? 'today' : 'scheduled', remindAt: start });
    return { handled: true, text: L(lang, `Moved “${task.title}” to ${fmt(date, 'EEEE d MMM')}${hasTime ? ` at ${fmtTime(date)}` : ''}.`, `Перенёс «${task.title}» на ${fmt(date, 'EEEE d MMM')}${hasTime ? ` в ${fmtTime(date)}` : ''}.`), undo: () => updateTask(task.id, before) };
  }
  if (event) {
    if (event.rrule) return { handled: true, text: L(lang, `“${event.title}” repeats — move it from the calendar so you can choose this one or the whole series.`, `«${event.title}» повторяется — перенеси его в календаре, чтобы выбрать одно или все.`), navigate: 'calendar' };
    const dur = event.end - event.start;
    const s = new Date(event.start);
    const target = new Date(date);
    if (!hasTime) target.setHours(s.getHours(), s.getMinutes(), 0, 0);
    const before: Partial<CalEvent> = { start: event.start, end: event.end };
    await updateEvent(event.id, { start: target.getTime(), end: target.getTime() + dur });
    return { handled: true, text: L(lang, `Moved “${event.title}” to ${fmt(target, 'EEEE d MMM')} at ${fmtTime(target)}.`, `Перенёс «${event.title}» на ${fmt(target, 'EEEE d MMM')} в ${fmtTime(target)}.`), undo: () => updateEvent(event.id, before) };
  }
  return { handled: true, text: L(lang, `I couldn’t find “${what}” in your tasks or calendar.`, `Не нашёл «${what}» в задачах или календаре.`) };
};

const NOTE: Handler = async (_t, lang, m) => {
  const body = m[1].trim();
  const [first, ...rest] = body.split(/(?<=[.!?])\s+|\n/);
  const n = await createNote({ title: first.slice(0, 80), text: body, content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: first.slice(0, 80) }] }, ...(rest.length ? [{ type: 'paragraph', content: [{ type: 'text', text: rest.join(' ') }] }] : [])] } });
  return { handled: true, text: L(lang, `Saved a note: “${n.title}”.`, `Сохранил заметку: «${n.title}».`), undo: () => deleteNote(n.id), chips: lang === 'ru' ? ['Открой заметки'] : ['Open notes'] };
};

const IDEA: Handler = async (_t, lang, m) => {
  const body = m[1].trim();
  const i = await createIdea({ title: body.slice(0, 90) });
  return { handled: true, text: L(lang, `Captured the idea “${i.title}”. Want to turn it into a plan?`, `Записал идею «${i.title}». Превратить её в план?`), undo: () => deleteIdea(i.id), chips: lang === 'ru' ? [`Преврати идею «${i.title}» в план`] : [`Turn “${i.title}” into a plan`] };
};

const IDEA_PLAN: Handler = async (_t, lang, m) => {
  const what = m[1].replace(/^["“«']|["”»']$/g, '').trim();
  const idea = bestMatch(await db.ideas.toArray(), what, (x) => x.title);
  const title = idea?.title ?? what;
  const steps = breakDownTask(title).slice(0, 5);
  const goal = await createGoal({ title, why: idea?.body || undefined, milestones: steps.map((s) => ({ id: crypto.randomUUID(), title: s, done: false })) });
  if (idea) await db.ideas.update(idea.id, { column: 'doing', updatedAt: Date.now() });
  return { handled: true, text: `${L(lang, `Made “${title}” a goal with ${steps.length} milestones:`, `Сделал «${title}» целью с ${steps.length} этапами:`)}\n\n${list(steps)}`, undo: () => db.goals.delete(goal.id), chips: lang === 'ru' ? ['Открой цели'] : ['Open goals'] };
};

const SUMMARIZE: Handler = async (_t, lang, m) => {
  const what = m[1].replace(/^["“«']|["”»']$/g, '').trim();
  const notes = await db.notes.toArray();
  const note = bestMatch(notes, what, (n) => n.title) ?? searchNotes(notes, what)[0]?.note;
  if (!note) return { handled: true, text: L(lang, `I couldn’t find a note about “${what}”.`, `Не нашёл заметку про «${what}».`) };
  return { handled: true, text: `${L(lang, `“${note.title}” in brief:`, `«${note.title}» кратко:`)} ${extractiveSummary(note)}` };
};

/* ---------- Questions about the user's data ---------- */

async function weekWindow(text: string) {
  const lastWeek = /last week|прошл\w* недел/i.test(text);
  const today = startOfDay(new Date());
  if (/today|сегодня/i.test(text)) return { from: today, to: addDays(today, 1), label: ['today', 'сегодня'] as const };
  if (/yesterday|вчера/i.test(text)) return { from: addDays(today, -1), to: today, label: ['yesterday', 'вчера'] as const };
  const ws = startOfWeek(today, { weekStartsOn: useSettings.getState().weekStart });
  if (lastWeek) return { from: addDays(ws, -7), to: ws, label: ['last week', 'на прошлой неделе'] as const };
  // "This week" early in the week means "lately": use the last 7 days so there's something to say.
  return { from: addDays(today, -6), to: addDays(today, 1), label: ['over the last 7 days', 'за последние 7 дней'] as const };
}

const Q_SLEEP: Handler = async (text, lang) => {
  const w = await weekWindow(text);
  const logs = await db.sleep.where('date').between(dayKey(w.from), dayKey(addDays(w.to, -1)), true, true).toArray();
  if (!logs.length) return { handled: true, text: L(lang, 'No sleep logged for that period yet. Tell me “slept 7.5 hours” to start.', 'Сон за этот период не записан. Скажи «спал 7,5 часов».') };
  const avg = mean(logs.map((l) => l.hours));
  const best = [...logs].sort((a, b) => b.hours - a.hours)[0];
  const worst = [...logs].sort((a, b) => a.hours - b.hours)[0];
  const goal = useSettings.getState().targets.sleepH;
  const verdict = avg >= goal - 0.25 ? L(lang, 'Right on your goal.', 'Ровно по цели.') : avg >= goal - 1 ? L(lang, `A little under your ${goal} h goal.`, `Чуть меньше цели в ${goal} ч.`) : L(lang, `Well under your ${goal} h goal — worth protecting your evenings.`, `Заметно меньше цели в ${goal} ч — стоит беречь вечера.`);
  return {
    handled: true,
    text: L(
      lang,
      `You averaged ${avg.toFixed(1)} h across ${pl(lang, logs.length, ['night', 'nights'], ['', '', ''])} ${w.label[0]}. Best: ${best.hours} h (${fmt(new Date(best.date), 'EEE')}), shortest: ${worst.hours} h (${fmt(new Date(worst.date), 'EEE')}). ${verdict}`,
      `В среднем ${avg.toFixed(1)} ч, ${pl(lang, logs.length, ['', ''], ['ночь', 'ночи', 'ночей'])} ${w.label[1]}. Лучшая: ${best.hours} ч (${fmt(new Date(best.date), 'EEE')}), самая короткая: ${worst.hours} ч (${fmt(new Date(worst.date), 'EEE')}). ${verdict}`,
    ),
    chips: lang === 'ru' ? ['Как сон влияет на настроение?'] : ['Does sleep affect my mood?'],
  };
};

const Q_TASKS: Handler = async (text, lang) => {
  const w = await weekWindow(text);
  const done = await db.tasks.where('doneAt').between(w.from.getTime(), w.to.getTime()).toArray();
  if (!done.length) return { handled: true, text: L(lang, `Nothing checked off ${w.label[0]} yet. Want me to plan your day?`, `${w.label[1][0].toUpperCase() + w.label[1].slice(1)} пока ничего не выполнено. Спланировать день?`), chips: lang === 'ru' ? ['Спланируй мой день'] : ['Plan my day'] };
  const top = done.slice(-5).map((t) => t.title);
  return { handled: true, text: L(lang, `You finished ${pl(lang, done.length, ...TASKS)} ${w.label[0]}, including:\n\n${list(top)}`, `${w.label[1][0].toUpperCase() + w.label[1].slice(1)} выполнено задач: ${done.length}, например:\n\n${list(top)}`) };
};

const Q_TIME: Handler = async (text, lang) => {
  const w = await weekWindow(text);
  const focus = await db.focus.where('start').between(w.from.getTime(), w.to.getTime()).toArray();
  const tasks = new Map((await db.tasks.toArray()).map((t) => [t.id, t]));
  const byTitle = new Map<string, number>();
  for (const f of focus) {
    const title = (f.taskId && tasks.get(f.taskId)?.title) || L(lang, 'Unlabelled focus', 'Фокус без задачи');
    byTitle.set(title, (byTitle.get(title) ?? 0) + f.minutes);
  }
  const occ = expandEvents(await db.events.where('start').below(w.to.getTime()).toArray(), w.from.getTime(), w.to.getTime()).filter((o) => !o.event.allDay && o.end - o.start < 86_400_000);
  const byEvent = new Map<string, number>();
  for (const o of occ) byEvent.set(o.event.title, (byEvent.get(o.event.title) ?? 0) + (Math.min(o.end, Date.now()) - o.start) / 60_000);
  const rows = [...[...byTitle].map(([k, v]) => ({ k, v, kind: 'focus' })), ...[...byEvent].filter(([, v]) => v > 0).map(([k, v]) => ({ k, v, kind: 'event' }))].sort((a, b) => b.v - a.v).slice(0, 5);
  if (!rows.length) return { handled: true, text: L(lang, 'I don’t have tracked time for that period yet — focus sessions and calendar events are what I count.', 'За этот период нет учтённого времени — я считаю сессии фокуса и события календаря.') };
  const fmtMin = (m: number) => (m >= 60 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`);
  return { handled: true, text: `${L(lang, `Where your time went ${w.label[0]}:`, `Куда ушло время ${w.label[1]}:`)}\n\n${list(rows.map((r) => `${r.k} — ${fmtMin(r.v)}${r.kind === 'event' ? L(lang, ' (calendar)', ' (календарь)') : ''}`))}` };
};

const Q_CALORIES: Handler = async (_t, lang) => {
  const meals = await db.meals.where('date').equals(todayKey()).toArray();
  const t = useSettings.getState().targets;
  if (!meals.length) return { handled: true, text: L(lang, 'Nothing logged today yet. Tell me what you ate, like “oatmeal and a latte for breakfast”.', 'Сегодня ещё ничего не записано. Скажи, что ты съел, например «овсянку и латте на завтрак».') };
  const k = Math.round(sum(meals.map((m) => m.kcal)));
  const p = Math.round(sum(meals.map((m) => m.protein)));
  const c = Math.round(sum(meals.map((m) => m.carbs)));
  const f = Math.round(sum(meals.map((m) => m.fat)));
  return { handled: true, text: L(lang, `${k} of ${t.kcal} kcal so far (${t.kcal - k >= 0 ? `${t.kcal - k} left` : `${k - t.kcal} over`}). Protein ${p}/${t.protein} g, carbs ${c}/${t.carbs} g, fat ${f}/${t.fat} g.`, `${k} из ${t.kcal} ккал (${t.kcal - k >= 0 ? `осталось ${t.kcal - k}` : `перебор ${k - t.kcal}`}). Белки ${p}/${t.protein} г, углеводы ${c}/${t.carbs} г, жиры ${f}/${t.fat} г.`) };
};

const Q_WEIGHT: Handler = async (_t, lang) => {
  const logs = (await db.weight.toArray()).sort((a, b) => a.date.localeCompare(b.date));
  if (logs.length < 2) return { handled: true, text: L(lang, 'I need at least two weigh-ins to see a trend. Tell me “I weigh 72.5”.', 'Нужно хотя бы два взвешивания. Скажи «вешу 72,5».') };
  const recent = logs.filter((l) => l.date >= dayKey(addDays(new Date(), -28)));
  const series = recent.length >= 2 ? recent : logs;
  const days = (new Date(series.at(-1)!.date).getTime() - new Date(series[0].date).getTime()) / 86_400_000 || 1;
  const perWeek = ((series.at(-1)!.kg - series[0].kg) / days) * 7;
  return { handled: true, text: L(lang, `You’re at ${series.at(-1)!.kg} kg — ${perWeek >= 0 ? '+' : ''}${perWeek.toFixed(2)} kg a week over the last ${Math.round(days)} days (${series.length} weigh-ins).`, `Сейчас ${series.at(-1)!.kg} кг — ${perWeek >= 0 ? '+' : ''}${perWeek.toFixed(2)} кг в неделю за ${Math.round(days)} дн. (${series.length} взвешиваний).`) };
};

const Q_HABITS: Handler = async (_t, lang) => {
  const habits = await db.habits.filter((h) => !h.archived).toArray();
  if (!habits.length) return { handled: true, text: L(lang, 'You’re not tracking any habits yet.', 'Ты пока не отслеживаешь привычки.') };
  const logs = await db.habitLogs.toArray();
  const ws = useSettings.getState().weekStart;
  const rows = habits.map((h) => ({ h, s: currentStreak(h, new Set(logs.filter((l) => l.habitId === h.id).map((l) => l.date)), new Date(), ws) })).sort((a, b) => b.s - a.s);
  return { handled: true, text: `${L(lang, 'Current streaks:', 'Текущие серии:')}\n\n${list(rows.map(({ h, s }) => `${h.emoji} ${h.name} — ${s} ${h.period === 'day' ? L(lang, s === 1 ? 'day' : 'days', 'дн.') : L(lang, s === 1 ? 'week' : 'weeks', 'нед.')}`))}` };
};

const Q_AGENDA: Handler = async (text, lang) => {
  const tomorrow = /tomorrow|завтра/i.test(text);
  const day = tomorrow ? addDays(new Date(), 1) : new Date();
  const items = await agenda(day, lang);
  const open = (await db.tasks.where('done').equals(0).toArray()).filter((t) => !t.start && (t.due === dayKey(day) || (!tomorrow && (t.status === 'today' || t.top))));
  const label = tomorrow ? L(lang, 'Tomorrow', 'Завтра') : L(lang, 'Today', 'Сегодня');
  if (!items.length && !open.length) return { handled: true, text: L(lang, `${label} is clear.`, `${label} свободно.`) };
  let reply = items.length ? `${label}:\n\n${list(items)}` : `${label}: ${L(lang, 'no events.', 'событий нет.')}`;
  if (open.length) reply += `\n\n${L(lang, 'Also on your list', 'Ещё в списке')}: ${open.slice(0, 5).map((t) => t.title).join(', ')}${open.length > 5 ? '…' : ''}.`;
  return { handled: true, text: reply, chips: lang === 'ru' ? ['Спланируй мой день'] : ['Plan my day'] };
};

const Q_FREE: Handler = async (text, lang) => {
  const tomorrow = /tomorrow|завтра/i.test(text);
  const day = startOfDay(tomorrow ? addDays(new Date(), 1) : new Date());
  const { dayStartH, dayEndH } = useSettings.getState();
  const to = addDays(day, 1).getTime();
  const busy = [
    ...expandEvents(await db.events.where('start').below(to).toArray(), day.getTime(), to).filter((o) => !o.event.allDay && o.end - o.start < 86_400_000),
    ...(await db.tasks.where('start').between(day.getTime(), to).toArray()).map((t) => ({ start: t.start!, end: t.end ?? t.start! + 1_800_000 })),
  ].sort((a, b) => a.start - b.start);
  let cursor = Math.max(day.getTime() + dayStartH * 3_600_000, tomorrow ? 0 : Date.now());
  const end = day.getTime() + dayEndH * 3_600_000;
  const gaps: string[] = [];
  for (const b of busy) {
    if (b.start - cursor >= 30 * 60_000 && cursor < end) gaps.push(`${fmtTime(cursor)}–${fmtTime(Math.min(b.start, end))}`);
    cursor = Math.max(cursor, b.end);
  }
  if (end - cursor >= 30 * 60_000) gaps.push(`${fmtTime(cursor)}–${fmtTime(end)}`);
  const label = tomorrow ? L(lang, 'tomorrow', 'завтра') : L(lang, 'today', 'сегодня');
  return { handled: true, text: gaps.length ? `${L(lang, `Free ${label}:`, `Свободно ${label}:`)}\n\n${list(gaps)}` : L(lang, `No free blocks of 30+ minutes ${label}.`, `Свободных окон от 30 минут ${label} нет.`) };
};

const Q_MOOD: Handler = async (text, lang) => {
  const w = await weekWindow(text);
  const logs = await db.mood.where('date').between(dayKey(w.from), dayKey(addDays(w.to, -1)), true, true).toArray();
  if (!logs.length) return { handled: true, text: L(lang, 'No mood logged for that period.', 'Настроение за этот период не записано.') };
  return { handled: true, text: L(lang, `Your mood averaged ${mean(logs.map((l) => l.score)).toFixed(1)} / 5 ${w.label[0]} (${pl(lang, logs.length, ['day', 'days'], ['', '', ''])} logged).`, `Среднее настроение ${mean(logs.map((l) => l.score)).toFixed(1)} / 5 ${w.label[1]} (${pl(lang, logs.length, ['', ''], ['день', 'дня', 'дней'])}).`) };
};

const Q_SLEEP_MOOD: Handler = async (_t, lang) => {
  const sleep = new Map((await db.sleep.toArray()).map((s) => [s.date, s.hours]));
  const pairs = (await db.mood.toArray()).filter((m) => sleep.has(m.date)).map((m) => [sleep.get(m.date)!, m.score] as const);
  if (pairs.length < 7) return { handled: true, text: L(lang, `I have ${pairs.length} days with both sleep and mood — I need at least 7 to say anything honest.`, `Есть ${pairs.length} дней с данными о сне и настроении — нужно хотя бы 7, чтобы сказать что-то честное.`) };
  const { pearson } = await import('@/lib/stats');
  const r = pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
  const strength = Math.abs(r) >= 0.7 ? L(lang, 'strongly', 'сильно') : Math.abs(r) >= 0.4 ? L(lang, 'moderately', 'умеренно') : Math.abs(r) >= 0.2 ? L(lang, 'weakly', 'слабо') : '';
  if (!strength) return { handled: true, text: L(lang, `Across ${pairs.length} days I don’t see a clear link (r = ${r.toFixed(2)}).`, `За ${pairs.length} дней явной связи нет (r = ${r.toFixed(2)}).`) };
  return { handled: true, text: L(lang, `Yes — across ${pairs.length} days, sleep and mood are ${strength} ${r > 0 ? 'linked: more sleep, better mood' : 'inversely linked'} (r = ${r.toFixed(2)}).`, `Да — за ${pairs.length} дней сон и настроение ${strength} связаны${r > 0 ? ': больше сна — лучше настроение' : ' обратно'} (r = ${r.toFixed(2)}).`), chips: lang === 'ru' ? ['Открой аналитику'] : ['Open insights'] };
};

const Q_WATER: Handler = async (_t, lang) => {
  const ml = sum((await db.water.where('date').equals(todayKey()).toArray()).map((w) => w.ml));
  const target = useSettings.getState().targets.waterMl;
  return { handled: true, text: L(lang, `${ml} of ${target} ml today.`, `${ml} из ${target} мл сегодня.`), chips: lang === 'ru' ? ['Выпил стакан воды'] : ['Drank a glass of water'] };
};

const ROLLOVER: Handler = async (_t, lang) => {
  const { rollOverToTomorrow } = await import('./briefing');
  const n = await rollOverToTomorrow();
  return { handled: true, text: n ? L(lang, `Moved ${pl(lang, n, ['unfinished task', 'unfinished tasks'], ['', '', ''])} to tomorrow. Tomorrow-you has it.`, `Перенёс на завтра: ${pl(lang, n, ['', ''], ['задачу', 'задачи', 'задач'])}.`) : L(lang, 'Nothing left to move.', 'Переносить нечего.') };
};

const NAV: [RegExp, Route][] = [
  [/(calendar|календар)/i, 'calendar'],
  [/(timeline|planner|tasks|планировщик|задачи)/i, 'today'],
  [/(notes|заметк)/i, 'notes'],
  [/(ideas|идеи)/i, 'ideas'],
  [/(health|food|здоровье)/i, 'health'],
  [/(insights|analytics|stats|аналитик)/i, 'insights'],
  [/(goals|цели)/i, 'today'],
  [/(settings|настройки)/i, 'settings'],
];
const NAVIGATE: Handler = async (text, lang) => {
  const hit = NAV.find(([re]) => re.test(text));
  if (!hit) return null;
  if (/goals|цели/i.test(text)) (await import('@/features/today/store')).useTodayTab.getState().set('goals');
  else if (/timeline|planner|tasks|планировщик|задачи/i.test(text)) (await import('@/features/today/store')).useTodayTab.getState().set('tasks');
  return { handled: true, text: L(lang, 'Opening it.', 'Открываю.'), navigate: hit[1] };
};

const CREATE: Handler = async (text, lang) => {
  const { kind, record, parsed } = await quickAdd(text);
  if (kind === 'event') {
    const e = record as CalEvent;
    return { handled: true, text: L(lang, `Added “${e.title}” on ${fmt(e.start, 'EEEE d MMM')}${e.allDay ? '' : ` at ${fmtTime(e.start)}–${fmtTime(e.end)}`}${e.rrule ? ', repeating' : ''}.`, `Добавил «${e.title}» на ${fmt(e.start, 'EEEE d MMM')}${e.allDay ? '' : ` в ${fmtTime(e.start)}–${fmtTime(e.end)}`}${e.rrule ? ', с повтором' : ''}.`), undo: () => deleteEvent(e.id), chips: lang === 'ru' ? ['Открой календарь'] : ['Open calendar'] };
  }
  const t = record as Task;
  const when = t.start ? `${fmt(t.start, 'EEE d MMM')}, ${fmtTime(t.start)}` : t.due ? fmt(new Date(t.due + 'T00:00'), 'EEEE d MMM') : null;
  return { handled: true, text: L(lang, `Added the task “${t.title}”${when ? ` for ${when}` : ' to your inbox'}${parsed.priority === 3 ? ', high priority' : ''}.`, `Добавил задачу «${t.title}»${when ? ` на ${when}` : ' во входящие'}${parsed.priority === 3 ? ', высокий приоритет' : ''}.`), undo: () => deleteTask(t.id), chips: lang === 'ru' ? ['Разбей её на шаги'] : ['Break it into steps'] };
};

/** Ordered rules: the first pattern that matches handles the message. */
const RULES: [RegExp, Handler][] = [
  [/^(help|what can you do|\?|помощь|что ты умеешь|помоги)\b/i, HELP],
  [/^(hi|hello|hey|good morning|morning|brief me|briefing|morning briefing|what'?s my day|my day|привет|доброе утро|утро|брифинг|мой день)\b[!. ]*$/i, BRIEFING],
  [/(how was my day|evening (review|reflection|check-?in)|reflect|wrap up (the|my) day|итоги дня|как прош[её]л (мой )?день|вечерний обзор)/i, REFLECTION],
  [/(move|push|roll)( all)? (my )?unfinished( tasks)? to tomorrow|перенеси незаконченное на завтра/i, ROLLOVER],
  [/(plan|schedule|organi[sz]e|map out) (my|the|today'?s?) ?(day|today|schedule)|^plan today|(спланируй|распланируй|составь план)( мой| на)? (день|сегодня)/i, PLAN],
  [/^(?:please )?(?:break|split|chunk)(?: down| up)?\s+(?:the task\s+)?(.+?)(?:\s+(?:into|in)\s+(?:small(?:er)?\s+|tiny\s+)?steps)?[.!]?$/i, BREAKDOWN],
  [/^(?:break it into steps|разбей (?:её|ее|это) на шаги)$/i, async (t, lang) => {
    const last = (await db.tasks.orderBy('createdAt').last()) as Task | undefined;
    return last ? BREAKDOWN(t, lang, [t, last.title] as unknown as RegExpMatchArray) : null;
  }],
  [/^(?:разбей|раздели|разложи)\s+(?:задачу\s+)?(.+?)(?:\s+на\s+(?:маленькие\s+)?шаги)?[.!]?$/i, BREAKDOWN],
  [/^(?:just start for 2 minutes|начать на 2 минуты)$/i, async (_t, lang) => {
    const { useFocusMode } = await import('@/features/planner/store');
    const top = (await db.tasks.where('done').equals(0).toArray()).sort((a, b) => (b.top ?? 0) - (a.top ?? 0) || b.priority - a.priority)[0];
    useFocusMode.getState().start(top?.id, 2);
    return { handled: true, text: L(lang, 'Two minutes. That’s all. Go.', 'Две минуты. И всё. Поехали.') };
  }],
  [/^(?:mark|tick off|check off|complete|finish(?:ed)?|done(?: with)?:?|i (?:finished|did|completed|am done with))\s+(.+?)(?:\s+(?:as\s+)?(?:done|complete))?[.!]?$/i, COMPLETE],
  [/^(?:отметь|сделал[аи]?|закончил[аи]?|выполнил[аи]?)\s+(.+?)(?:\s+(?:как\s+)?(?:выполненн\w*|сделанн\w*))?[.!]?$/i, COMPLETE],
  [/^(?:please )?(?:delete|remove|cancel|trash)\s+(?:the\s+|my\s+)?(task|event|meeting|note|idea)?\s*(.+)$/i, DELETE],
  [/^(?:удали|отмени|убери)\s+(задачу|событие|встречу|заметку|идею)?\s*(.+)$/i, DELETE],
  [/^(?:move|reschedule|push|shift)\s+(.+?)\s+(?:to|until|on)\s+(.+)$/i, MOVE],
  [/^(?:перенеси|передвинь)\s+(.+?)\s+на\s+(.+)$/i, MOVE],
  [/^(?:summari[sz]e|tl;?dr|recap)\s+(?:my\s+)?(?:the\s+)?(?:note\s+)?(?:about\s+|on\s+)?(.+?)\??$/i, SUMMARIZE],
  [/^(?:кратко перескажи|перескажи|резюмируй|кратко)\s+(?:заметку\s+)?(?:про\s+)?(.+)$/i, SUMMARIZE],
  [/^(?:turn|make|convert)\s+(?:the\s+|my\s+)?(?:idea\s+)?(.+?)\s+into\s+a\s+plan[.!]?$/i, IDEA_PLAN],
  [/^(?:преврати|сделай)\s+идею\s+(.+?)\s+в\s+план[.!]?$/i, IDEA_PLAN],
  [/^(?:note|make a note|take a note|write down|jot down)[:\s]+(.+)$/i, NOTE],
  [/^(?:заметка|запиши|создай заметку)[:\s]+(.+)$/i, NOTE],
  [/^(?:idea|new idea|capture idea)[:\s]+(.+)$/i, IDEA],
  [/^(?:идея|новая идея)[:\s]+(.+)$/i, IDEA],
  [/^(?:open|show|go to)\s+(?:my\s+)?(.+)$|^(?:открой|покажи)\s+(.+)$/i, NAVIGATE],
];

/** Questions, checked when the message reads like a question. */
const QUESTIONS: [RegExp, Handler][] = [
  [/(sleep|slept|bed|сон|спал|сплю)/i, async (t, l, m) => ((/mood|настроени/i.test(t) ? Q_SLEEP_MOOD : Q_SLEEP)(t, l, m))],
  [/(spend|spent|most time|time go|where.*time|потратил|больше всего времени|куда ушло)/i, Q_TIME],
  [/(tasks?|get done|finish|accomplish|задач|сделал|выполнил)/i, Q_TASKS],
  [/(calorie|kcal|eat|ate|macro|protein|калори|ккал|съел|белк|ел сегодня)/i, Q_CALORIES],
  [/(weight|weigh|вес|вешу)/i, Q_WEIGHT],
  [/(habit|streak|привычк|сери)/i, Q_HABITS],
  [/(free|available|open slot|свобод|окн)/i, Q_FREE],
  [/(mood|feel|настроени)/i, Q_MOOD],
  [/(water|hydrat|вод)/i, Q_WATER],
  [/(next|schedule|agenda|on (today|tomorrow)|calendar|have (today|tomorrow)|what'?s (on|up)|что у меня|расписани|что дальше|что сегодня|что завтра)/i, Q_AGENDA],
];

/** Logging statements ("slept 7h", "drank 2 glasses of water", "I ate …"). */
const LOGS: [RegExp, Handler][] = [
  [/(?:drank|drink|had|выпил[аи]?|пил[аи]?)\b.*\b(?:water|воды|воду)|^(?:water|вода)\s+\d|\d+\s*(?:ml|мл)\s+(?:of\s+)?(?:water|воды)|^drank a glass of water$/i, WATER],
  [/(?:выпил[аи]?|пил[аи]?)\s+.*(?:воды|воду)/i, WATER],
  [/^(?:i\s+)?(?:slept|sleep was|got)\s+(\d+(?:[.,]\d+)?)\s*(?:h|hrs?|hours?)(?:\s+of sleep)?/i, SLEEP_LOG],
  [/(?:спал[аи]?|поспал[аи]?|сон)\s+(\d+(?:[.,]\d+)?)\s*(?:ч|час)/i, SLEEP_LOG],
  [/(?:i\s+)?(?:weigh(?:ed)?|weight(?:\s+is)?:?)\s+(\d+(?:[.,]\d+)?)\s*(?:kg)?|(?:вешу|вес:?)\s+(\d+(?:[.,]\d+)?)/i, WEIGHT_LOG],
  [/(?:mood|настроение)\s*(?:is|:|—|-)?\s*([1-5])\b|^(?:i\s+)?(?:feel|am feeling|feeling|i'?m feeling|i'?m)\s+(?:so\s+|really\s+|pretty\s+|very\s+)?(?:amazing|fantastic|great|awesome|wonderful|good|fine|happy|okay|ok|alright|meh|so-so|tired|low|down|sad|stressed|terrible|awful|horrible|miserable)\b|^(?:чувствую себя|мне|настроение)\s+(?:очень\s+)?(?:отлично|прекрасно|супер|замечательно|хорошо|неплохо|нормально|так себе|устал\w*|грустно|плохо|ужасно)/i, MOOD_LOG],
  [/^(?:i\s+)?(?:just\s+)?(?:ate|had|have eaten|eaten|'ve eaten|grabbed)\s+|^(?:я\s+)?(?:съел[аи]?|поел[аи]?|скушал[аи]?|ел[аи]?)\s+|^(?:я\s+)?выпил[аи]?\s+(?!воды)|^(?:i\s+)?drank\s+(?!.*water)/i, FOOD],
];

const CREATE_TRIGGER = /^(?:please\s+)?(?:add|new|create|make|schedule|set up|book|remind me|put|plan|добавь|создай|новая|новое|новый|напомни|запланируй|поставь)\b|^(?:task|todo|event|meeting|задача|событие|встреча)\b[:\s]/i;

export async function respond(input: string): Promise<AfinaReply> {
  const text = input.trim();
  const lang = detectLang(text);
  if (!text) return { handled: true, text: '' };

  for (const [re, h] of RULES) {
    const m = text.match(re);
    if (m) {
      const r = await h(text, lang, m);
      if (r) return r;
    }
  }
  for (const [re, h] of LOGS) {
    const m = text.match(re);
    if (m) {
      const r = await h(text, lang, m);
      if (r) return r;
    }
  }
  if (isQuestion(text)) {
    for (const [re, h] of QUESTIONS) {
      const m = text.match(re);
      if (m) {
        const r = await h(text, lang, m);
        if (r) return r;
      }
    }
  }
  const noMatch = [] as unknown as RegExpMatchArray;
  if (CREATE_TRIGGER.test(text)) return (await CREATE(text, lang, noMatch))!;
  // A statement with a date or time ("dentist friday 3pm") is most likely something to schedule.
  if (!isQuestion(text) && (lang === 'ru' ? chronoRu.casual : chronoEn.casual).parse(text).length && text.split(/\s+/).length <= 14) return (await CREATE(text, lang, noMatch))!;
  return { handled: false, text: '' };
}

/** What Afina says when neither the engine nor the model can help. */
export function fallback(lang: Lang): AfinaReply {
  return {
    handled: true,
    text: L(lang, 'I’m not sure what you mean yet. I’m best at tasks, events, food, sleep and questions about your data — try one of these:', 'Пока не понял. Лучше всего я справляюсь с задачами, событиями, едой, сном и вопросами о твоих данных — попробуй:'),
    chips: lang === 'ru' ? ['Спланируй мой день', 'Что у меня сегодня?', 'Как я спал на этой неделе?'] : ['Plan my day', 'What’s on today?', 'How did I sleep this week?'],
  };
}
