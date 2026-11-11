import { describe, expect, it } from 'vitest';
import { applyAlternative, parseQuickAdd } from './nlp';

const ref = new Date(2026, 9, 26, 10, 0); // Monday 26 Oct 2026, 10:00
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();

describe('parseQuickAdd', () => {
  it('parses the brief example as a 1h event', () => {
    const r = parseQuickAdd('Lunch with Sam Friday 1pm for 1h', ref);
    expect(r).toMatchObject({ kind: 'event', title: 'Lunch with Sam', start: at(30, 13), end: at(30, 14) });
  });
  it('creates a timed task from "new task tomorrow 5pm gym"', () => {
    const r = parseQuickAdd('new task tomorrow 5pm gym', ref);
    expect(r).toMatchObject({ kind: 'task', title: 'Gym', start: at(27, 17), due: '2026-10-27', hasTime: true });
  });
  it('reads duration, tags and priority', () => {
    const r = parseQuickAdd('Write report #work !! for 90 min', ref);
    expect(r).toMatchObject({ kind: 'task', title: 'Write report', estimate: 90, priority: 2, tags: ['work'] });
  });
  it('treats "in 2 hours" as a start time, not a duration', () => {
    const r = parseQuickAdd('call mom in 2 hours', ref);
    expect(r.start).toBe(at(26, 12));
    expect(r.estimate).toBeUndefined();
    expect(r.title).toBe('Call mom');
  });
  it('date-only task gets a due day', () => {
    const r = parseQuickAdd('buy milk the day after tomorrow', ref);
    expect(r).toMatchObject({ kind: 'task', title: 'Buy milk', due: '2026-10-28', hasTime: false });
  });
  it('handles recurrence', () => {
    const r = parseQuickAdd('Team standup every weekday 9:30am for 15 min', ref);
    expect(r.kind).toBe('event');
    expect(r.rrule).toEqual({ freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] });
    expect(r.end! - r.start!).toBe(15 * 60_000);
    expect(r.title).toBe('Team standup');
  });
  it('parses Russian', () => {
    const r = parseQuickAdd('Встреча с Сашей в пятницу в 15:00 на 2 часа', ref);
    expect(r).toMatchObject({ kind: 'event', title: 'Встреча с Сашей', start: at(30, 15), end: at(30, 17), lang: 'ru' });
    const t = parseQuickAdd('напомни купить молоко завтра #дом срочно', ref);
    expect(t).toMatchObject({ kind: 'task', title: 'Купить молоко', due: '2026-10-27', priority: 3, tags: ['дом'] });
  });
  it('keeps plain text as an inbox task', () => {
    const r = parseQuickAdd('Read the new design doc', ref);
    expect(r).toMatchObject({ kind: 'task', title: 'Read the new design doc', start: undefined, due: undefined });
  });
});

describe('quick add phrases', () => {
  const slice = (input: string, kind: string) => {
    const r = parseQuickAdd(input, ref);
    return r.spans.filter((s) => s.kind === kind).map((s) => input.slice(s.start, s.end));
  };

  it('"Gym tomorrow 7pm" is a timed task, with the time highlighted', () => {
    const r = parseQuickAdd('Gym tomorrow 7pm', ref);
    expect(r).toMatchObject({ kind: 'task', title: 'Gym', start: at(27, 19), hasTime: true, alternatives: [] });
    expect(slice('Gym tomorrow 7pm', 'time')).toEqual(['tomorrow 7pm']);
  });

  it('"Call mom every Sunday at 6" repeats weekly at 6 PM, with 6 AM one tap away', () => {
    const input = 'Call mom every Sunday at 6';
    const r = parseQuickAdd(input, ref);
    expect(r).toMatchObject({ kind: 'task', title: 'Call mom', rrule: { freq: 'weekly', interval: 1, byDay: [0] }, start: new Date(2026, 10, 1, 18).getTime() });
    expect(r.alternatives).toEqual([{ reason: 'meridiem', start: new Date(2026, 10, 1, 6).getTime() }]);
    expect(slice(input, 'repeat')).toEqual(['every Sunday']);
    const fixed = applyAlternative(r, r.alternatives[0]);
    expect(fixed.start).toBe(new Date(2026, 10, 1, 6).getTime());
    expect(applyAlternative(fixed, fixed.alternatives[0]).start).toBe(r.start);
  });

  it('"Pay rent on the 1st of every month" repeats monthly from the next 1st', () => {
    const r = parseQuickAdd('Pay rent on the 1st of every month', ref);
    expect(r).toMatchObject({ kind: 'task', title: 'Pay rent', rrule: { freq: 'monthly', interval: 1 }, due: '2026-11-01', hasTime: false });
  });

  it('a monthly day that has passed starts next month, and short months use their last day', () => {
    expect(parseQuickAdd('Invoice every month on the 15th', ref).due).toBe('2026-11-15');
    expect(parseQuickAdd('Backup on the 31st of each month', new Date(2026, 10, 3, 9)).due).toBe('2026-11-30');
    expect(parseQuickAdd('Pay rent on the 26th of every month', ref).due).toBe('2026-10-26'); // today still counts
  });

  it('"Read 20 min tonight !high" reads duration, an evening time and priority', () => {
    const input = 'Read 20 min tonight !high';
    const r = parseQuickAdd(input, ref);
    expect(r).toMatchObject({ kind: 'task', title: 'Read', estimate: 20, priority: 3, start: at(26, 20), hasTime: true });
    expect(r.alternatives[0]).toMatchObject({ reason: 'evening', start: at(26, 21) });
    expect(slice(input, 'priority')).toEqual(['!high']);
    expect(slice(input, 'duration')).toEqual(['20 min']);
  });

  it('priority words', () => {
    expect(parseQuickAdd('Taxes !medium', ref).priority).toBe(2);
    expect(parseQuickAdd('Taxes !low', ref).priority).toBe(1);
    expect(parseQuickAdd('Taxes !!!', ref)).toMatchObject({ priority: 3, title: 'Taxes' });
    expect(parseQuickAdd('Wow! Great news', ref).priority).toBe(0); // "!" inside a word isn't a marker
  });

  it('"next Friday" means the Friday of next week, with this Friday offered', () => {
    const r = parseQuickAdd('Dentist next Friday', ref);
    expect(r).toMatchObject({ title: 'Dentist', due: '2026-11-06' });
    expect(r.alternatives).toEqual([{ reason: 'next-weekday', due: '2026-10-30' }]);
    expect(applyAlternative(r, r.alternatives[0]).due).toBe('2026-10-30');
  });

  it('"every weekday" starts on the next weekday', () => {
    expect(parseQuickAdd('Stretch every weekday', ref)).toMatchObject({ rrule: { freq: 'weekly', byDay: [1, 2, 3, 4, 5] }, due: '2026-10-26' });
    expect(parseQuickAdd('Stretch every weekday', new Date(2026, 9, 31, 10)).due).toBe('2026-11-02'); // Saturday → Monday
  });

  it('a repeat at a time that already passed today starts at the next occurrence', () => {
    const sundayEvening = new Date(2026, 10, 1, 19); // Sunday 19:00
    expect(parseQuickAdd('Call mom every Sunday at 6pm', sundayEvening).start).toBe(new Date(2026, 10, 8, 18).getTime());
    expect(parseQuickAdd('Journal every day at 9pm', ref).start).toBe(at(26, 21));
    expect(parseQuickAdd('Vitamins every day at 8am', ref).start).toBe(at(27, 8));
  });

  it('past times: a bare time moves forward, an explicit "today" stays and is flagged', () => {
    expect(parseQuickAdd('Gym 7am', ref)).toMatchObject({ start: at(27, 7), past: undefined });
    expect(parseQuickAdd('Gym today 7am', ref)).toMatchObject({ start: at(26, 7), past: true });
    // "at 6" at 10 AM: 6 PM today is the sensible reading; tomorrow 6 AM is offered.
    const r = parseQuickAdd('Call Lina at 6', ref);
    expect(r.start).toBe(at(26, 18));
    expect(r.alternatives).toEqual([{ reason: 'meridiem', start: at(27, 6) }]);
  });

  it('"in 2 hours" and "in 30 minutes" are start times', () => {
    expect(parseQuickAdd('Stretch in 30 minutes', ref)).toMatchObject({ start: at(26, 10, 30), estimate: undefined, title: 'Stretch' });
  });

  it('parses the same phrases in Russian', () => {
    expect(parseQuickAdd('Позвонить маме каждое воскресенье в 18:00', ref)).toMatchObject({ title: 'Позвонить маме', rrule: { freq: 'weekly', byDay: [0] }, start: new Date(2026, 10, 1, 18).getTime() });
    expect(parseQuickAdd('Платить за квартиру 1-го числа каждого месяца', ref)).toMatchObject({ title: 'Платить за квартиру', rrule: { freq: 'monthly' }, due: '2026-11-01' });
    expect(parseQuickAdd('Читать 20 мин сегодня вечером !высокий', ref)).toMatchObject({ title: 'Читать', estimate: 20, priority: 3, start: at(26, 20) });
    expect(parseQuickAdd('Зарядка по будням', ref).rrule).toEqual({ freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] });
    const next = parseQuickAdd('Стоматолог в следующую пятницу', ref);
    expect(next).toMatchObject({ due: '2026-11-06' });
    expect(next.alternatives[0]).toMatchObject({ due: '2026-10-30' });
  });

  it('never fails on odd input', () => {
    for (const s of ['', '   ', '!!!', '#', 'every', 'on the 45th of every month', '7', 'tonight tonight']) {
      const r = parseQuickAdd(s, ref);
      expect(typeof r.title).toBe('string');
      expect(r.title.length).toBeGreaterThan(0);
    }
  });
});
