import * as chrono from 'chrono-node';
import { startOfDay } from 'date-fns';
import type { Priority, Recurrence } from './types';
import { dayKey } from './dates';

export type Lang = 'en' | 'ru';

export const detectLang = (text: string): Lang => (/[а-яё]/i.test(text) ? 'ru' : 'en');

export interface QuickAdd {
  kind: 'task' | 'event';
  title: string;
  /** Event start, or a timed task's start. */
  start?: number;
  end?: number;
  allDay?: boolean;
  /** Date-only due day for tasks. */
  due?: string;
  estimate?: number;
  priority: Priority;
  tags: string[];
  rrule?: Recurrence;
  hasTime: boolean;
  lang: Lang;
}

const EVENT_WORDS =
  /\b(meeting|meet|lunch|dinner|breakfast|brunch|call with|appointment|dentist|doctor|interview|party|class|lesson|flight|concert|date with|coffee with|session|standup|webinar|conference|wedding|birthday)\b|встреч|обед|ужин|завтрак|созвон|приём|прием|врач|стоматолог|собеседован|вечеринк|урок|занят|рейс|концерт|кофе с|день рождения|свидани/i;

const DURATION =
  /\b(?:for\s+|на\s+)?(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|час(?:а|ов)?|ч|минут[ауы]?|мин)(?![a-zа-я])/i;
const DURATION_WORDS: [RegExp, number][] = [
  [/\bfor\s+(?:an?\s+)?hour\b|\bна\s+час\b/i, 60],
  [/\bfor\s+half\s+an\s+hour\b|\bна\s+полчаса\b/i, 30],
  [/\bfor\s+(?:an?\s+)?hour\s+and\s+a\s+half\b|\bна\s+полтора\s+часа\b/i, 90],
];

const WEEKDAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAYS_RU = [/воскресень/, /понедельник/, /вторник/, /сред[уа]/, /четверг/, /пятниц/, /суббот/];

function parseRecurrence(text: string): { rrule?: Recurrence; rest: string } {
  const t = text.toLowerCase();
  let m = t.match(/\bevery\s+(other\s+)?(day|week|month|year|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b|\b(daily|weekly|monthly|yearly)\b/);
  if (m) {
    const word = m[2] ?? m[3];
    const interval = m[1] ? 2 : 1;
    let rrule: Recurrence;
    if (word === 'day' || word === 'daily') rrule = { freq: 'daily', interval };
    else if (word === 'week' || word === 'weekly') rrule = { freq: 'weekly', interval };
    else if (word === 'month' || word === 'monthly') rrule = { freq: 'monthly', interval };
    else if (word === 'year' || word === 'yearly') rrule = { freq: 'yearly', interval };
    else if (word === 'weekday') rrule = { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] };
    else rrule = { freq: 'weekly', interval, byDay: [WEEKDAYS_EN.indexOf(word)] };
    return { rrule, rest: text.slice(0, m.index) + text.slice(m.index! + m[0].length) };
  }
  m = t.match(/(?:кажд(?:ый|ую|ое|ые)|по)\s+(день|дням|недел[юи]|месяц|год|будням|понедельник\w*|вторник\w*|сред[уаы]\w*|четверг\w*|пятниц\w*|суббот\w*|воскресень\w*)/);
  if (m) {
    const w = m[1];
    let rrule: Recurrence;
    if (/^д(ень|ням)/.test(w)) rrule = { freq: 'daily', interval: 1 };
    else if (/^недел/.test(w)) rrule = { freq: 'weekly', interval: 1 };
    else if (/^месяц/.test(w)) rrule = { freq: 'monthly', interval: 1 };
    else if (/^год/.test(w)) rrule = { freq: 'yearly', interval: 1 };
    else if (/^будн/.test(w)) rrule = { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] };
    else rrule = { freq: 'weekly', interval: 1, byDay: [WEEKDAYS_RU.findIndex((r) => r.test(w))] };
    return { rrule, rest: text.slice(0, m.index) + text.slice(m.index! + m[0].length) };
  }
  return { rest: text };
}

const LEAD_IN =
  /^(?:(?:please\s+)?(?:new|add|create|make|schedule|set up|put)\s+(?:a\s+|an\s+)?(?:task|todo|to-do|event|reminder|meeting)?\s*(?::|-|to)?\s*|remind me to\s+|remind me\s+|i need to\s+|i have to\s+|i should\s+|task:\s*|event:\s*|(?:новая|новое|новый|добавь|добавить|создай|создать|запланируй|запланировать)\s+(?:задач[ауи]|событие|встречу|напоминание)?\s*:?\s*|напомни(?:\s+мне)?\s+|мне нужно\s+|надо\s+|нужно\s+|задача:\s*|событие:\s*)/i;

function cleanTitle(s: string) {
  let t = s
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+(?:at|on|by|from|in|для|в|во|на|к|с)\s*$/i, '')
    .replace(/^\s*(?:at|on|by|в|во|на)\s+/i, '')
    .replace(/^[\s,.;:—-]+|[\s,.;:—-]+$/g, '')
    .trim();
  // Lead-ins may repeat ("add a task: remind me to …").
  for (let i = 0; i < 2; i++) t = t.replace(LEAD_IN, '').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** Parses a quick-add phrase like "Lunch with Sam Friday 1pm for 1h" or "купить молоко завтра #дом !!". */
export function parseQuickAdd(input: string, ref = new Date(), forceKind?: 'task' | 'event'): QuickAdd {
  const lang = detectLang(input);
  let text = ` ${input.trim()} `;
  let kind: 'task' | 'event' | undefined = forceKind;
  if (/^\s*(?:new\s+|add\s+(?:a\s+|an\s+)?|create\s+(?:a\s+|an\s+)?)?(?:event|meeting)\b|^\s*(?:новое\s+)?событие\b|^\s*(?:новая\s+)?встреча\b/i.test(text)) kind ??= 'event';
  if (/^\s*(?:new\s+|add\s+(?:a\s+)?|create\s+(?:a\s+)?)?(?:task|todo|to-do)\b|^\s*(?:новая\s+)?задача\b|^\s*remind me\b|^\s*напомни\b/i.test(text)) kind ??= 'task';

  // Tags and priority markers.
  const tags: string[] = [];
  text = text.replace(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu, (_, t: string) => {
    tags.push(t.toLowerCase());
    return ' ';
  });
  let priority: Priority = 0;
  text = text.replace(/(?:^|\s)(!{1,3})(?=\s|$)/g, (_, b: string) => {
    priority = b.length as Priority;
    return ' ';
  });
  if (/\b(urgent|asap|high priority|important)\b|срочно|важно/i.test(text)) {
    priority = 3;
    text = text.replace(/\b(urgent|asap|high priority|important)\b|срочно|важно/gi, ' ');
  }

  // Duration ("for 1h", "на 30 минут").
  let estimate: number | undefined;
  for (const [re, min] of DURATION_WORDS) {
    if (re.test(text)) {
      estimate = min;
      text = text.replace(re, ' ');
      break;
    }
  }
  if (estimate === undefined) {
    const m = text.match(DURATION);
    // "in 2 hours" / "через 2 часа" is a start time, not a duration — leave it for chrono.
    if (m && !/(?:\bin|через)$/i.test(text.slice(0, m.index).trimEnd())) {
      const n = parseFloat(m[1].replace(',', '.'));
      const unit = m[2].toLowerCase();
      estimate = Math.round(/^(h|hr|hrs|hour|hours|ч|час|часа|часов)$/.test(unit) ? n * 60 : n);
      text = text.slice(0, m.index) + ' ' + text.slice(m.index! + m[0].length);
    }
  }

  const rec = parseRecurrence(text);
  text = rec.rest;

  // Dates and times.
  const parser = lang === 'ru' ? chrono.ru.casual : chrono.en.casual;
  const results = parser.parse(text, ref, { forwardDate: true });
  let start: number | undefined;
  let end: number | undefined;
  let hasTime = false;
  let due: string | undefined;
  const r = results[0];
  if (r) {
    hasTime = r.start.isCertain('hour');
    const s = r.start.date();
    if (hasTime) {
      start = s.getTime();
      if (r.end) end = r.end.date().getTime();
    } else {
      due = dayKey(s);
      start = startOfDay(s).getTime();
    }
    text = text.slice(0, r.index) + ' ' + text.slice(r.index + r.text.length);
  } else if (rec.rrule) {
    // "every monday" with no date: start on the next matching day.
    const d = startOfDay(ref);
    if (rec.rrule.byDay?.length) while (!rec.rrule.byDay.includes(d.getDay())) d.setDate(d.getDate() + 1);
    start = d.getTime();
    due = dayKey(d);
  }

  if (!kind) kind = EVENT_WORDS.test(text) && (hasTime || !!rec.rrule) ? 'event' : 'task';
  if (kind === 'event' && start !== undefined) {
    if (!hasTime) {
      end = start + 86_400_000;
    } else if (end === undefined) {
      end = start + (estimate ?? 60) * 60_000;
    }
  }

  return {
    kind,
    title: cleanTitle(text) || (lang === 'ru' ? 'Без названия' : 'Untitled'),
    start,
    end,
    allDay: kind === 'event' && start !== undefined && !hasTime ? true : undefined,
    due: due ?? (start !== undefined ? dayKey(start) : undefined),
    estimate,
    priority,
    tags,
    rrule: rec.rrule,
    hasTime,
    lang,
  };
}
