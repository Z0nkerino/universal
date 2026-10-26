import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './nlp';

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
