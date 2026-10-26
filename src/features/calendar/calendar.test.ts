import { describe, expect, it } from 'vitest';
import { expandEvents } from './recurrence';
import { parseIcs, toIcs } from './ics';
import type { CalEvent } from '@/lib/types';

const ev = (p: Partial<CalEvent>): CalEvent => ({ id: 'e', title: 'T', start: 0, end: 0, color: 'blue', createdAt: 0, updatedAt: 0, ...p });
const t = (d: number, h = 9, mo = 9) => new Date(2026, mo, d, h).getTime();

describe('expandEvents', () => {
  it('expands weekly by weekday within a window', () => {
    const e = ev({ start: t(5), end: t(5, 10), rrule: { freq: 'weekly', interval: 1, byDay: [1, 3] } }); // Mon 5 Oct
    const occ = expandEvents([e], t(12, 0), t(19, 0));
    expect(occ.map((o) => new Date(o.start).getDate())).toEqual([12, 14]);
  });
  it('respects count, until and exdates', () => {
    const e = ev({ start: t(1), end: t(1, 10), rrule: { freq: 'daily', interval: 2, count: 3 }, exdates: [t(3)] });
    expect(expandEvents([e], t(1, 0), t(30, 0)).map((o) => new Date(o.start).getDate())).toEqual([1, 5]);
    const u = ev({ start: t(1), end: t(1, 10), rrule: { freq: 'daily', interval: 1, until: t(3, 23) } });
    expect(expandEvents([u], t(1, 0), t(30, 0))).toHaveLength(3);
  });
  it('finds occurrences of an old daily series far in the future quickly', () => {
    const e = ev({ start: new Date(2020, 0, 1, 8).getTime(), end: new Date(2020, 0, 1, 9).getTime(), rrule: { freq: 'daily', interval: 1 } });
    const occ = expandEvents([e], t(26, 0), t(27, 0));
    expect(occ).toHaveLength(1);
    expect(new Date(occ[0].start).getHours()).toBe(8);
  });
  it('includes multi-day events overlapping the window', () => {
    const e = ev({ start: t(10), end: t(13) });
    expect(expandEvents([e], t(12, 0), t(12, 23))).toHaveLength(1);
  });
});

describe('ics', () => {
  it('round-trips events including recurrence and alarms', () => {
    const src = [
      ev({ id: 'a', title: 'Yoga; stretch, breathe', start: t(6, 7), end: t(6, 8), location: 'Studio', rrule: { freq: 'weekly', interval: 1, byDay: [2, 4] }, reminder: 15 }),
      ev({ id: 'b', title: 'Holiday', start: new Date(2026, 11, 25).getTime(), end: new Date(2026, 11, 26).getTime(), allDay: true }),
    ];
    const back = parseIcs(toIcs(src));
    expect(back).toHaveLength(2);
    expect(back[0]).toMatchObject({ title: 'Yoga; stretch, breathe', start: t(6, 7), end: t(6, 8), location: 'Studio', reminder: 15, rrule: { freq: 'weekly', interval: 1, byDay: [2, 4] } });
    expect(back[1]).toMatchObject({ title: 'Holiday', allDay: true, start: src[1].start, end: src[1].end });
  });
  it('parses folded lines, DURATION and UTC times', () => {
    const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x1\r\nSUMMARY:A very long\r\n  title\r\nDTSTART:20261026T150000Z\r\nDURATION:PT1H30M\r\nEND:VEVENT\r\nEND:VCALENDAR';
    const [e] = parseIcs(ics);
    expect(e.title).toBe('A very long title');
    expect(e.start).toBe(Date.UTC(2026, 9, 26, 15));
    expect(e.end - e.start).toBe(90 * 60_000);
    expect(e.uid).toBe('x1');
  });
});
