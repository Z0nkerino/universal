import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { Occurrence, Task } from '@/lib/types';
import { expandEvents } from './recurrence';
import type { GridItem } from './TimeGrid';

/** All event occurrences overlapping [from, to), recurring series expanded. */
export function useOccurrences(from: number, to: number): Occurrence[] {
  return (
    useLiveQuery(async () => {
      const events = await db.events.where('start').below(to).toArray();
      return expandEvents(events, from, to);
    }, [from, to]) ?? []
  );
}

/** Time-blocked tasks inside [from, to). */
export function useBlockedTasks(from: number, to: number): Task[] {
  return useLiveQuery(() => db.tasks.where('start').between(from, to, true, false).toArray(), [from, to]) ?? [];
}

export function toGridItems(occ: Occurrence[], tasks: Task[]): GridItem[] {
  return [
    ...occ.map((o) => ({
      key: `e:${o.event.id}:${o.start}`,
      kind: 'event' as const,
      id: o.event.id,
      title: o.event.title,
      start: o.start,
      end: o.end,
      color: o.event.color,
      recurring: !!o.event.rrule,
      allDay: o.event.allDay || o.end - o.start >= 86_400_000,
      sub: o.event.location,
      occStart: o.start,
    })),
    ...tasks
      .filter((t) => t.start && t.end)
      .map((t) => ({ key: `t:${t.id}`, kind: 'task' as const, id: t.id, title: t.title, start: t.start!, end: t.end!, color: (t.priority === 3 ? 'pink' : 'blue') as GridItem['color'], done: !!t.done })),
  ];
}
