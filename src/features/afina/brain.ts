// Decides how Afina answers: the deterministic engine first; if it doesn't understand and
// the on-device model is loaded, the model picks a tool (executed by the engine, so actions
// stay reliable) or answers from retrieved context. Nothing leaves the device.
import { addDays, startOfDay } from 'date-fns';
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';
import { db, uid } from '@/lib/db';
import { createTask, updateTask } from '@/lib/actions';
import { detectLang, type Lang } from '@/lib/nlp';
import { dayKey, fmt, fmtTime, todayKey } from '@/lib/dates';
import { useSettings } from '@/lib/settings';
import { mean, sum } from '@/lib/stats';
import { expandEvents } from '@/features/calendar/recurrence';
import { searchNotes } from '@/features/notes/search';
import { bestMatch, fallback, respond, type AfinaReply } from './engine';
import { complete, llmReady } from './llm';

const SYSTEM = `You are Afina, the assistant built into Universal Planner by Eternal Inc.
Personality: warm, sharp, concise, encouraging but honest, never cheesy. No emoji spam.
Always reply in the same language the user wrote in (English or Russian).
Keep replies to 1–3 short sentences unless the user asks for more.
Facts about the user come ONLY from CONTEXT. If something isn't in CONTEXT, say you don't know — never invent numbers, events or tasks.

You may perform at most one action. Respond ONLY with a JSON object:
{"tool": "<tool name or none>", "args": { ... }, "reply": "<what you say to the user>"}

Tools:
- create_task {"title": string, "when"?: string}         e.g. when: "tomorrow 5pm"
- create_event {"title": string, "when": string, "minutes"?: number}
- log_food {"items": string, "meal"?: "breakfast"|"lunch"|"dinner"|"snack"}   items in plain words, e.g. "2 eggs and a latte"
- log_water {"ml": number}
- log_sleep {"hours": number}
- log_mood {"score": 1-5, "note"?: string}
- log_weight {"kg": number}
- plan_day {}
- break_down {"task": string, "steps": string[]}       3–7 tiny concrete steps, each starting with a verb
- complete_task {"title": string}
- move {"title": string, "when": string}
- delete {"kind": "task"|"event"|"note"|"idea", "title": string}   (the app will ask the user to confirm)
- create_note {"title": string, "body": string}
- create_idea {"title": string}
- none — just answer`;

/** A compact snapshot of the user's data plus anything matching the message. */
export async function buildContext(text: string) {
  const now = new Date();
  const d0 = startOfDay(now);
  const lines: string[] = [`Now: ${fmt(now, 'EEEE d MMMM yyyy')}, ${fmtTime(now)}.`];
  const occ = expandEvents(await db.events.where('start').below(addDays(d0, 2).getTime()).toArray(), d0.getTime(), addDays(d0, 2).getTime());
  if (occ.length) lines.push(`Calendar (today & tomorrow): ${occ.slice(0, 12).map((o) => `${fmt(o.start, 'EEE')} ${o.event.allDay ? 'all day' : fmtTime(o.start)} ${o.event.title}`).join('; ')}.`);
  const open = (await db.tasks.where('done').equals(0).toArray()).sort((a, b) => (b.top ?? 0) - (a.top ?? 0) || b.priority - a.priority);
  if (open.length) lines.push(`Open tasks (${open.length}): ${open.slice(0, 12).map((t) => `${t.title}${t.due ? ` [due ${t.due}]` : ''}${t.start ? ` [at ${fmtTime(t.start)}]` : ''}`).join('; ')}.`);
  const since = dayKey(addDays(d0, -7));
  const sleep = await db.sleep.where('date').aboveOrEqual(since).toArray();
  if (sleep.length) lines.push(`Sleep, last 7 days: average ${mean(sleep.map((s) => s.hours)).toFixed(1)} h over ${sleep.length} nights.`);
  const mood = await db.mood.where('date').aboveOrEqual(since).toArray();
  if (mood.length) lines.push(`Mood, last 7 days: average ${mean(mood.map((m) => m.score)).toFixed(1)}/5.`);
  const done = await db.tasks.where('doneAt').above(addDays(d0, -7).getTime()).count();
  lines.push(`Tasks completed in the last 7 days: ${done}.`);
  const meals = await db.meals.where('date').equals(todayKey()).toArray();
  const t = useSettings.getState().targets;
  lines.push(`Food today: ${Math.round(sum(meals.map((m) => m.kcal)))} of ${t.kcal} kcal${meals.length ? ` (${meals.map((m) => m.name).join(', ')})` : ''}.`);
  const w = (await db.weight.toArray()).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (w) lines.push(`Latest weight: ${w.kg} kg (${w.date}).`);
  const goals = await db.goals.toArray();
  if (goals.length) lines.push(`Goals: ${goals.map((g) => `${g.title} (${g.milestones.filter((m) => m.done).length}/${g.milestones.length} milestones)`).join('; ')}.`);
  const notes = searchNotes(await db.notes.toArray(), text.split(/\s+/).filter((w) => w.length > 3).slice(0, 4).join(' ')).slice(0, 3);
  for (const h of notes) lines.push(`Note “${h.note.title}”: ${h.note.text.slice(0, 500)}`);
  const ideas = (await db.ideas.toArray()).filter((i) => text.toLowerCase().split(/\s+/).some((w) => w.length > 3 && i.title.toLowerCase().includes(w))).slice(0, 3);
  for (const i of ideas) lines.push(`Idea “${i.title}” (${i.column}): ${i.body}`);
  return lines.join('\n');
}

interface ToolCall {
  tool?: string;
  args?: Record<string, unknown>;
  reply?: string;
}

function parseJson(raw: string): ToolCall | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as ToolCall;
  } catch {
    return null;
  }
}

/** Turns a model tool call into something the engine executes deterministically. */
async function runTool(call: ToolCall, lang: Lang): Promise<AfinaReply | null> {
  const a = call.args ?? {};
  const s = (k: string) => String(a[k] ?? '').trim();
  const n = (k: string) => Number(a[k]);
  const say = (en: string, ru: string) => respond(lang === 'ru' ? ru : en);
  switch (call.tool) {
    case 'create_task':
      return say(`add task ${s('title')} ${s('when')}`, `добавь задачу ${s('title')} ${s('when')}`);
    case 'create_event':
      return say(`add event ${s('title')} ${s('when')}${a.minutes ? ` for ${n('minutes')} min` : ''}`, `событие: ${s('title')} ${s('when')}${a.minutes ? ` на ${n('minutes')} минут` : ''}`);
    case 'log_food':
      return say(`I ate ${s('items')}${a.meal ? ` for ${s('meal')}` : ''}`, `съел ${s('items')}${a.meal ? ` на ${({ breakfast: 'завтрак', lunch: 'обед', dinner: 'ужин', snack: 'перекус' } as Record<string, string>)[s('meal')] ?? ''}` : ''}`);
    case 'log_water':
      return say(`drank ${n('ml')} ml of water`, `выпил ${n('ml')} мл воды`);
    case 'log_sleep':
      return say(`slept ${n('hours')} hours`, `спал ${n('hours')} часов`);
    case 'log_mood':
      return say(`mood ${Math.round(n('score'))}`, `настроение ${Math.round(n('score'))}`);
    case 'log_weight':
      return say(`I weigh ${n('kg')} kg`, `вешу ${n('kg')}`);
    case 'plan_day':
      return say('plan my day', 'спланируй мой день');
    case 'break_down': {
      const steps = Array.isArray(a.steps) ? (a.steps as unknown[]).map(String).filter(Boolean).slice(0, 8) : [];
      if (steps.length < 2) return say(`break down ${s('task')}`, `разбей ${s('task')} на шаги`);
      const subtasks = steps.map((title) => ({ id: uid(), title, done: false }));
      const existing = bestMatch(await db.tasks.where('done').equals(0).toArray(), s('task'), (t) => t.title);
      if (existing) await updateTask(existing.id, { subtasks: [...existing.subtasks, ...subtasks] });
      else await createTask({ title: s('task'), subtasks, status: 'today', due: todayKey() });
      return { handled: true, text: `${call.reply ?? ''}\n\n${steps.map((x) => `• ${x}`).join('\n')}`.trim() };
    }
    case 'complete_task':
      return say(`mark ${s('title')} done`, `отметь ${s('title')}`);
    case 'move':
      return say(`move ${s('title')} to ${s('when')}`, `перенеси ${s('title')} на ${s('when')}`);
    case 'delete':
      return say(`delete ${s('kind')} ${s('title')}`, `удали ${s('kind') === 'event' ? 'событие' : s('kind') === 'note' ? 'заметку' : s('kind') === 'idea' ? 'идею' : 'задачу'} ${s('title')}`);
    case 'create_note':
      return say(`note: ${s('title')}. ${s('body')}`, `заметка: ${s('title')}. ${s('body')}`);
    case 'create_idea':
      return say(`idea: ${s('title')}`, `идея: ${s('title')}`);
    default:
      return null;
  }
}

export interface Turn {
  role: 'user' | 'afina';
  text: string;
}

export async function think(text: string, history: Turn[]): Promise<AfinaReply> {
  const lang = detectLang(text);
  const local = await respond(text);
  if (local.handled) return local;
  if (!llmReady()) return fallback(lang);

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: `${SYSTEM}\n\nCONTEXT:\n${await buildContext(text)}` },
    ...history.slice(-6).map((h) => ({ role: h.role === 'user' ? ('user' as const) : ('assistant' as const), content: h.text })),
    { role: 'user', content: text },
  ];
  try {
    const raw = await complete(messages, { json: true });
    const call = parseJson(raw);
    if (!call) return { handled: true, text: raw.trim() || fallback(lang).text };
    if (call.tool && call.tool !== 'none') {
      const r = await runTool(call, lang);
      if (r?.handled) return r;
    }
    return { handled: true, text: call.reply?.trim() || fallback(lang).text };
  } catch {
    return fallback(lang);
  }
}

