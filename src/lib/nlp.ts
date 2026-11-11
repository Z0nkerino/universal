import type { ParsedResult } from 'chrono-node';
import { useEffect, useState } from 'react';
import { startOfDay } from 'date-fns';
import type { Priority, Recurrence } from './types';
import { dayKey } from './dates';

export type Lang = 'en' | 'ru';

type DateParser = { parse: (text: string, ref?: Date, opt?: { forwardDate?: boolean }) => ParsedResult[] };
let parsers: Record<Lang, DateParser> | null = null;
let loading: Promise<void> | null = null;

/** Loads the date parsers, which stay out of the startup bundle. Safe to call repeatedly. */
export function loadDateParsers() {
  return (loading ??= Promise.all([import('chrono-node/en'), import('chrono-node/ru')]).then(([en, ru]) => {
    parsers = { en: en.casual, ru: ru.casual };
  }));
}

/** Loads the date parsers once `enabled` and re-renders when they're ready. */
export function useDateParsers(enabled = true) {
  const [ready, setReady] = useState(!!parsers);
  useEffect(() => {
    if (enabled && !ready) void loadDateParsers().then(() => setReady(true));
  }, [enabled, ready]);
  return ready;
}

export const detectLang = (text: string): Lang => (/[а-яё]/i.test(text) ? 'ru' : 'en');

/** A part of the typed text the parser understood — used to highlight it while typing. */
export interface Span {
  kind: 'date' | 'time' | 'repeat' | 'priority' | 'duration' | 'tag';
  /** Offsets into the original input. */
  start: number;
  end: number;
}

/** Another reasonable reading of something ambiguous, offered as a one-tap correction. */
export interface Alternative {
  reason: 'meridiem' | 'next-weekday' | 'evening';
  start?: number;
  due?: string;
}

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
  spans: Span[];
  alternatives: Alternative[];
  /** An explicit time that has already passed today ("today 7am" at 10am). Saved as typed. */
  past?: boolean;
}

const EVENT_WORDS =
  /\b(meeting|meet|lunch|dinner|breakfast|brunch|call with|appointment|dentist|doctor|interview|party|class|lesson|flight|concert|date with|coffee with|session|standup|webinar|conference|wedding|birthday)\b|встреч|обед|ужин|завтрак|созвон|приём|прием|врач|стоматолог|собеседован|вечеринк|урок|занят|рейс|концерт|кофе с|день рождения|свидани/i;

const DURATION =
  /\b(?:for\s+|на\s+)?(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|час(?:а|ов)?|ч|минут[ауы]?|мин)(?![a-zа-я])/i;
const DURATION_WORDS: [RegExp, number][] = [
  [/\bfor\s+(?:an?\s+)?hour\s+and\s+a\s+half\b|\bна\s+полтора\s+часа\b/i, 90],
  [/\bfor\s+half\s+an\s+hour\b|\bна\s+полчаса\b/i, 30],
  [/\bfor\s+(?:an?\s+)?hour\b|\bна\s+час\b/i, 60],
];

const WEEKDAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAYS_RU = [/воскресень/, /понедельник/, /вторник/, /сред[уа]/, /четверг/, /пятниц/, /суббот/];

/** "!high", "!urgent", "!medium", "!low" (and Russian), or "!", "!!", "!!!". */
const PRIORITY_WORDS: [RegExp, Priority][] = [
  [/(?:^|\s)(!(?:high|urgent|h|высокий|срочно|важно))(?=[\s,.]|$)/i, 3],
  [/(?:^|\s)(!(?:medium|med|m|средний))(?=[\s,.]|$)/i, 2],
  [/(?:^|\s)(!(?:low|l|низкий))(?=[\s,.]|$)/i, 1],
  [/(?:^|\s)(!{1,3})(?=[\s,.]|$)/, 0],
];

/** Text with matched parts blanked out by spaces of the same length, so offsets keep matching the input. */
class Scanner {
  text: string;
  spans: Span[] = [];
  constructor(input: string) {
    this.text = ` ${input} `;
  }
  /** Blanks text[from, to) and records it as a span (offsets shift by the leading space). */
  take(from: number, to: number, kind: Span['kind']) {
    this.text = this.text.slice(0, from) + ' '.repeat(to - from) + this.text.slice(to);
    this.spans.push({ kind, start: from - 1, end: to - 1 });
  }
  /** Finds `re`, blanks the match (or its group 1) and returns it. */
  grab(re: RegExp, kind: Span['kind'], group = 0) {
    const m = this.text.match(re);
    if (!m || m.index === undefined) return null;
    const part = m[group] ?? m[0];
    const from = m.index + m[0].indexOf(part);
    this.take(from, from + part.length, kind);
    return m;
  }
}

function parseRecurrence(sc: Scanner): Recurrence | undefined {
  const t = sc.text.toLowerCase();
  let m = t.match(/\bevery\s+(other\s+)?(day|week|month|year|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b|\b(daily|weekly|monthly|yearly)\b/);
  if (m && m.index !== undefined) {
    const word = m[2] ?? m[3];
    const interval = m[1] ? 2 : 1;
    sc.take(m.index, m.index + m[0].length, 'repeat');
    if (word === 'day' || word === 'daily') return { freq: 'daily', interval };
    if (word === 'week' || word === 'weekly') return { freq: 'weekly', interval };
    if (word === 'month' || word === 'monthly') return { freq: 'monthly', interval };
    if (word === 'year' || word === 'yearly') return { freq: 'yearly', interval };
    if (word === 'weekday') return { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] };
    return { freq: 'weekly', interval, byDay: [WEEKDAYS_EN.indexOf(word)] };
  }
  m = t.match(/(?:кажд(?:ый|ую|ое|ые|ого)|по)\s+(день|дням|недел[юи]|месяц|год|будням|понедельник[а-яё]*|вторник[а-яё]*|сред[уаы][а-яё]*|четверг[а-яё]*|пятниц[а-яё]*|суббот[а-яё]*|воскресень[а-яё]*)|(ежедневно|еженедельно|ежемесячно|ежегодно)/);
  if (m && m.index !== undefined) {
    const w = m[1] ?? m[2];
    sc.take(m.index, m.index + m[0].length, 'repeat');
    if (/^(д(ень|ням)|ежедн)/.test(w)) return { freq: 'daily', interval: 1 };
    if (/^(недел|еженед)/.test(w)) return { freq: 'weekly', interval: 1 };
    if (/^(месяц|ежемес)/.test(w)) return { freq: 'monthly', interval: 1 };
    if (/^(год|ежегод)/.test(w)) return { freq: 'yearly', interval: 1 };
    if (/^будн/.test(w)) return { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] };
    return { freq: 'weekly', interval: 1, byDay: [WEEKDAYS_RU.findIndex((r) => r.test(w))] };
  }
  return undefined;
}

/** "on the 1st of every month", "every month on the 15th", "1-го числа каждого месяца" → day of month. */
function parseMonthDay(sc: Scanner): number | undefined {
  const res = [
    /\b(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:day\s+)?of\s+(?:every|each|the)\s+month\b/i,
    /\b(?:every|each)\s+month\s+on\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/i,
    /\bmonthly\s+on\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/i,
    /(?:^|\s)(\d{1,2})(?:-?(?:го|е|ое))?\s+числ[ао]?\s+(?:каждого\s+)?месяца/i,
    /(?:каждый\s+месяц|ежемесячно)\s+(\d{1,2})(?:-?(?:го|е|ое))?\s+числ[ао]?/i,
    /(?:кажд(?:ое|ый))\s+(\d{1,2})(?:-?(?:е|ое))?\s+числ[ао]/i,
  ];
  for (const re of res) {
    const m = sc.text.match(re);
    if (!m || m.index === undefined) continue;
    const day = Number(m[1]);
    if (day < 1 || day > 31) continue;
    const from = m.index + (m[0].length - m[0].trimStart().length);
    sc.take(from, m.index + m[0].length, 'repeat');
    return day;
  }
  return undefined;
}

/** The next date (today included) that falls on `day`; short months use their last day. */
function nextMonthDay(day: number, ref: Date) {
  for (let add = 0; add < 13; add++) {
    const y = ref.getFullYear();
    const mo = ref.getMonth() + add;
    const last = new Date(y, mo + 1, 0).getDate();
    const d = new Date(y, mo, Math.min(day, last));
    if (d >= startOfDay(ref)) return d;
  }
  return startOfDay(ref);
}

const LEAD_IN =
  /^(?:(?:please\s+)?(?:new|add|create|make|schedule|set up|put)\s+(?:a\s+|an\s+)?(?:task|todo|to-do|event|reminder|meeting)?\s*(?::|-|to)?\s*|remind me to\s+|remind me\s+|i need to\s+|i have to\s+|i should\s+|task:\s*|event:\s*|(?:новая|новое|новый|добавь|добавить|создай|создать|запланируй|запланировать)\s+(?:задач[ауи]|событие|встречу|напоминание)?\s*:?\s*|напомни(?:\s+мне)?\s+|мне нужно\s+|надо\s+|нужно\s+|задача:\s*|событие:\s*)/i;

function cleanTitle(s: string) {
  let t = s
    .replace(/\s{2,}/g, ' ')
    .replace(/(?:\s+(?:at|on|by|from|in|для|в|во|на|к|с))+\s*$/i, '')
    .replace(/^\s*(?:at|on|by|в|во|на)\s+/i, '')
    .replace(/^[\s,.;:—-]+|[\s,.;:—-]+$/g, '')
    .trim();
  // Lead-ins may repeat ("add a task: remind me to …").
  for (let i = 0; i < 2; i++) t = t.replace(LEAD_IN, '').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

const EVENING = /^(tonight|this evening|сегодня вечером|вечером)$/i;

/**
 * Parses a quick-add phrase like "Gym tomorrow 7pm", "Call mom every Sunday at 6",
 * "Pay rent on the 1st of every month" or "купить молоко завтра #дом !!". Never fails: anything
 * it can't place stays in the title, and ambiguous readings come with alternatives.
 * `eventMinutes` is the length of an event that doesn't say how long it lasts.
 */
export function parseQuickAdd(input: string, ref = new Date(), forceKind?: 'task' | 'event', eventMinutes = 60): QuickAdd {
  const lang = detectLang(input);
  const sc = new Scanner(input);
  const alternatives: Alternative[] = [];
  let kind: 'task' | 'event' | undefined = forceKind;
  if (/^\s*(?:new\s+|add\s+(?:a\s+|an\s+)?|create\s+(?:a\s+|an\s+)?)?(?:event|meeting)\b|^\s*(?:новое\s+)?событие\b|^\s*(?:новая\s+)?встреча\b/i.test(sc.text)) kind ??= 'event';
  if (/^\s*(?:new\s+|add\s+(?:a\s+)?|create\s+(?:a\s+)?)?(?:task|todo|to-do)\b|^\s*(?:новая\s+)?задача\b|^\s*remind me\b|^\s*напомни\b/i.test(sc.text)) kind ??= 'task';

  // Tags.
  const tags: string[] = [];
  for (let m; (m = sc.text.match(/(?:^|\s)(#[\p{L}\p{N}_-]+)/u)); ) {
    tags.push(m[1].slice(1).toLowerCase());
    const from = m.index! + m[0].indexOf(m[1]);
    sc.take(from, from + m[1].length, 'tag');
  }

  // Priority.
  let priority: Priority = 0;
  for (const [re, level] of PRIORITY_WORDS) {
    const m = sc.grab(re, 'priority', 1);
    if (m) {
      priority = level || (m[1].length as Priority);
      break;
    }
  }
  if (!priority && sc.grab(/\b(urgent|asap|high priority|important)\b|срочно|важно/i, 'priority')) priority = 3;

  // Duration ("for 1h", "20 min", "на 30 минут").
  let estimate: number | undefined;
  for (const [re, min] of DURATION_WORDS) {
    if (sc.grab(re, 'duration')) {
      estimate = min;
      break;
    }
  }
  if (estimate === undefined) {
    const m = sc.text.match(DURATION);
    // "in 2 hours" / "через 2 часа" is a start time, not a duration — leave it for chrono.
    if (m && m.index !== undefined && !/(?:\bin|через)$/i.test(sc.text.slice(0, m.index).trimEnd())) {
      const n = parseFloat(m[1].replace(',', '.'));
      const unit = m[2].toLowerCase();
      estimate = Math.round(/^(h|hr|hrs|hour|hours|ч|час|часа|часов)$/.test(unit) ? n * 60 : n);
      sc.take(m.index, m.index + m[0].length, 'duration');
    }
  }

  // Repeats. A day of the month ("the 1st of every month") also fixes the first date.
  const monthDay = parseMonthDay(sc);
  let rrule: Recurrence | undefined = monthDay ? { freq: 'monthly', interval: 1 } : parseRecurrence(sc);

  // Dates and times.
  // Until the parsers have loaded (a moment after startup) phrases are read without dates.
  const results = parsers ? parsers[lang].parse(sc.text, ref, { forwardDate: true }) : [];
  let start: number | undefined;
  let end: number | undefined;
  let hasTime = false;
  let due: string | undefined;
  let past = false;
  /** Hours to the other half of the day when am/pm was guessed. */
  let meridiem = 0;
  const r = results[0];
  if (r) {
    const raw = r.text.trim();
    let d = r.start.date();
    hasTime = r.start.isCertain('hour');
    // "tonight" / "this evening": a sensible evening time, offered as a guess.
    if (!hasTime && EVENING.test(raw)) {
      d = new Date(d);
      d.setHours(20, 0, 0, 0);
      hasTime = true;
      alternatives.push({ reason: 'evening', start: new Date(d).setHours(21, 0, 0, 0) });
    }
    if (hasTime) {
      // "at 6" without am/pm: hours 1–7 are almost always the evening. Offer the other half too.
      if (!r.start.isCertain('meridiem') && d.getHours() >= 1 && d.getHours() <= 11 && !/\d{1,2}:\d{2}/.test(raw) && lang === 'en') {
        const am = new Date(d);
        const pm = new Date(d);
        if (!r.start.isCertain('day') && !r.start.isCertain('weekday')) {
          // chrono may have pushed a passed morning hour to tomorrow; judge both halves from today.
          am.setFullYear(ref.getFullYear(), ref.getMonth(), ref.getDate());
          pm.setFullYear(ref.getFullYear(), ref.getMonth(), ref.getDate());
        }
        pm.setHours(am.getHours() + 12);
        if (!r.start.isCertain('day') && !r.start.isCertain('weekday')) {
          if (am <= ref) am.setDate(am.getDate() + 1);
          if (pm <= ref) pm.setDate(pm.getDate() + 1);
        }
        const evening = d.getHours() <= 7;
        d = evening ? pm : am;
        meridiem = evening ? -12 : 12;
      }
      start = d.getTime();
      if (r.end) end = r.end.date().getTime();
      past = start < ref.getTime();
    } else {
      due = dayKey(d);
      start = startOfDay(d).getTime();
    }
    // "next Friday" could mean this coming Friday or the one after; offer the nearer one.
    if (/^(next|в следующ[а-яё]*|следующ[а-яё]*)\s/i.test(raw) && r.start.isCertain('weekday')) {
      const near = new Date(d);
      near.setDate(near.getDate() - 7);
      if (near > ref) alternatives.push({ reason: 'next-weekday', ...(hasTime ? { start: near.getTime() } : { due: dayKey(near) }) });
    }
    sc.take(r.index, r.index + r.text.length, hasTime ? 'time' : 'date');
  }

  // A repeat decides the first date when the text didn't name one ("every Sunday at 6").
  if (rrule) {
    const dayGiven = r && (r.start.isCertain('day') || r.start.isCertain('weekday'));
    if (monthDay) {
      const first = nextMonthDay(monthDay, ref);
      if (hasTime && start !== undefined) {
        const t = new Date(start);
        first.setHours(t.getHours(), t.getMinutes(), 0, 0);
        if (first <= ref) first.setMonth(first.getMonth() + 1, Math.min(monthDay, new Date(first.getFullYear(), first.getMonth() + 2, 0).getDate()));
        start = first.getTime();
      } else {
        start = first.getTime();
        due = dayKey(first);
      }
    } else if (!dayGiven) {
      const d = start !== undefined ? new Date(start) : startOfDay(ref);
      if (start !== undefined) d.setFullYear(ref.getFullYear(), ref.getMonth(), ref.getDate());
      const days = rrule.byDay?.length ? rrule.byDay : null;
      for (let i = 0; i < 8; i++) {
        const okDay = !days || days.includes(d.getDay());
        const okTime = !hasTime || d > ref;
        if (okDay && okTime) break;
        d.setDate(d.getDate() + 1);
      }
      start = d.getTime();
      if (!hasTime) due = dayKey(d);
    }
    past = false;
    // A repeat replaces the "this Friday / next Friday" question.
    for (let i = alternatives.length - 1; i >= 0; i--) if (alternatives[i].reason === 'next-weekday') alternatives.splice(i, 1);
  }

  // The other half of the day, judged from the final start (a repeat may have moved it).
  if (meridiem && start !== undefined) {
    let alt = start + meridiem * 3_600_000;
    if (alt <= ref.getTime() && !(r && r.start.isCertain('day'))) alt += 86_400_000;
    alternatives.push({ reason: 'meridiem', start: alt });
  }

  if (!kind) kind = EVENT_WORDS.test(sc.text) && (hasTime || !!rrule) ? 'event' : 'task';
  if (kind === 'event' && start !== undefined) {
    if (!hasTime) {
      end = start + 86_400_000;
    } else if (end === undefined) {
      end = start + (estimate ?? eventMinutes) * 60_000;
    }
  }

  return {
    kind,
    title: cleanTitle(sc.text) || (lang === 'ru' ? 'Без названия' : 'Untitled'),
    start,
    end,
    allDay: kind === 'event' && start !== undefined && !hasTime ? true : undefined,
    due: due ?? (start !== undefined ? dayKey(start) : undefined),
    estimate,
    priority,
    tags,
    rrule,
    hasTime,
    lang,
    spans: sc.spans.sort((a, b) => a.start - b.start),
    alternatives,
    past: past || undefined,
  };
}

/** Applies a one-tap correction to a parsed phrase. */
export function applyAlternative(q: QuickAdd, alt: Alternative): QuickAdd {
  const shift = alt.start !== undefined && q.start !== undefined ? alt.start - q.start : 0;
  const next = { ...q, start: alt.start ?? q.start, end: q.end !== undefined ? q.end + shift : undefined, due: alt.due ?? (alt.start !== undefined ? dayKey(alt.start) : q.due) };
  // The reading being replaced becomes the alternative, so the chip can switch back.
  const back: Alternative = { reason: alt.reason, ...(alt.start !== undefined ? { start: q.start } : { due: q.due }) };
  return { ...next, alternatives: q.alternatives.map((a) => (a === alt ? back : a)), past: undefined };
}
