import { create } from 'zustand';
import { startOfDay } from 'date-fns';
import { choose } from '@/ui/Confirm';
import { createEvent, skipOccurrence, updateEvent } from '@/lib/actions';
import type { Occurrence } from '@/lib/types';

export type CalView = 'day' | 'week' | 'month' | 'year';
export const ORDER: CalView[] = ['day', 'week', 'month', 'year'];

export const useCalendarState = create<{ view: CalView; cursor: number; set: (p: Partial<{ view: CalView; cursor: number }>) => void }>((set) => ({
  // Phones get the day view; a week of columns doesn't fit.
  view: typeof window !== 'undefined' && window.innerWidth < 640 ? 'day' : 'week',
  cursor: startOfDay(new Date()).getTime(),
  set: (p) => set(p),
}));

/** Moves one occurrence; for a repeating series, asks whether to move just this one or all. */
export async function moveOccurrence(o: Pick<Occurrence, 'event' | 'start' | 'end'>, start: number, end: number, tr: (s: string) => string) {
  const ev = o.event;
  if (!ev.rrule) return updateEvent(ev.id, { start, end });
  const which = await choose({ title: tr('Move repeating event'), options: [{ label: tr('Only this event'), value: 'one', primary: true }, { label: tr('All events in the series'), value: 'all' }] });
  if (which === 'one') {
    await skipOccurrence(ev.id, o.start);
    const { id: _i, createdAt: _c, updatedAt: _u, rrule: _r, exdates: _x, uid: _uid, ...rest } = ev;
    await createEvent({ ...rest, start, end });
  } else if (which === 'all') {
    const delta = start - o.start;
    await updateEvent(ev.id, { start: ev.start + delta, end: ev.start + delta + (end - start) });
  }
}

