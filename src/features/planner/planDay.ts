import { addDays, startOfDay } from 'date-fns';
import { db } from '@/lib/db';
import { dayKey } from '@/lib/dates';
import { updateTask } from '@/lib/actions';
import { expandEvents } from '@/features/calendar/recurrence';
import { planDay, productivityFromHistory } from './scheduler';
import type { Task } from '@/lib/types';
import { useSettings } from '@/lib/settings';

export interface PlanOutcome {
  scheduled: { task: Task; start: number; end: number }[];
  unscheduled: Task[];
  undo: () => Promise<void>;
}

/** Time-blocks today's open tasks around events, using the user's own productive hours. */
export async function planMyDay(day = new Date()): Promise<PlanOutcome> {
  const d0 = startOfDay(day);
  const from = d0.getTime();
  const to = addDays(d0, 1).getTime();
  const key = dayKey(d0);
  const all = await db.tasks.where('done').equals(0).toArray();
  const candidates = all.filter((t) => !t.start && (t.status === 'today' || (t.due && t.due <= key) || t.top));
  const occurrences = expandEvents(await db.events.where('start').below(to).toArray(), from, to).filter((o) => !o.event.allDay && o.end - o.start < 86_400_000);
  const blocked = all.filter((t) => t.start && t.start < to && (t.end ?? t.start) > from).map((t) => ({ start: t.start!, end: t.end ?? t.start! + 1_800_000 }));

  const since = addDays(d0, -45).getTime();
  const doneTimes = (await db.tasks.where('doneAt').above(since).toArray()).map((t) => t.doneAt!);
  const focus = await db.focus.where('start').above(since).toArray();
  const result = planDay(candidates, [...occurrences, ...blocked], {
    day: d0,
    notBefore: key === dayKey(new Date()) ? Date.now() : undefined,
    dayStartMin: useSettings.getState().dayStartH * 60,
    dayEndMin: useSettings.getState().dayEndH * 60,
    productivity: productivityFromHistory(doneTimes, focus),
  });

  const byId = new Map(candidates.map((t) => [t.id, t]));
  for (const s of result.scheduled) {
    const t = byId.get(s.taskId)!;
    await updateTask(s.taskId, { start: s.start, end: s.end, due: key, status: 'today', estimate: t.estimate ?? Math.round((s.end - s.start) / 60_000) });
  }
  return {
    scheduled: result.scheduled.map((s) => ({ task: byId.get(s.taskId)!, start: s.start, end: s.end })),
    unscheduled: result.unscheduled.map((id) => byId.get(id)!),
    undo: async () => {
      for (const s of result.scheduled) {
        const orig = byId.get(s.taskId)!;
        await updateTask(s.taskId, { start: undefined, end: undefined, due: orig.due, status: orig.status, estimate: orig.estimate });
      }
    },
  };
}
