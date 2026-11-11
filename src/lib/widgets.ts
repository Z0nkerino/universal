import { addDays } from 'date-fns';
import { db } from './db';
import { dayKey } from './dates';
import { tNow } from './i18n';
import { useSettings } from './settings';
import type { Task } from './types';

/**
 * Feeds the native widgets (iOS Home/Lock Screen widgets and Live Activities, the Android home
 * screen widget). Native widgets can't read IndexedDB, so the app writes a small snapshot of
 * today's and tomorrow's tasks to a store they share (an App Group on iOS) every time tasks change.
 * Tasks checked off in a widget are queued there and applied here when the app is next active.
 */

export interface WidgetTask {
  id: string;
  title: string;
  day: string;
  start?: number;
  end?: number;
  done: boolean;
  priority: number;
  repeats?: boolean;
}

export interface WidgetSnapshot {
  version: 1;
  generatedAt: number;
  tasks: WidgetTask[];
  strings: { today: string; next: string; allDone: string; nothingPlanned: string; add: string; done: string; anytime: string; more: string };
  clock24: boolean;
}

interface PendingAction {
  type: 'complete' | 'uncomplete';
  id: string;
  at: number;
}

export interface WidgetsPlugin {
  setSnapshot(o: { json: string }): Promise<void>;
  takePendingActions(): Promise<{ actions: PendingAction[] }>;
  startActivity(o: { id: string; title: string; startedAt: number; endsAt: number; doneLabel: string }): Promise<{ started: boolean }>;
  updateActivity(o: { paused: boolean; remainingMs?: number; endsAt?: number }): Promise<void>;
  endActivity(o: { done: boolean }): Promise<void>;
}

/** The day a task belongs to on Today, if any. */
function dayOf(t: Task, today: string) {
  return t.due ?? (t.start ? dayKey(t.start) : t.status === 'today' ? today : undefined);
}

/** Today's tasks (overdue ones included), tasks done today, and tomorrow's, in the shape widgets read. */
export function buildSnapshot(tasks: Task[], now = new Date()): WidgetSnapshot {
  const today = dayKey(now);
  const tomorrow = dayKey(addDays(now, 1));
  const out: WidgetTask[] = [];
  for (const t of tasks) {
    const day = dayOf(t, today);
    if (!day) continue;
    if (t.done) {
      // Finished tasks only matter for today's progress.
      if (!t.doneAt || dayKey(t.doneAt) !== today) continue;
    } else if (day > tomorrow) continue;
    out.push({ id: t.id, title: t.title, day: t.done && day < today ? today : day, start: t.start, end: t.end, done: !!t.done, priority: t.priority, repeats: t.rrule ? true : undefined });
  }
  out.sort((a, b) => a.day.localeCompare(b.day) || (a.start ?? Infinity) - (b.start ?? Infinity) || b.priority - a.priority);
  return {
    version: 1,
    generatedAt: now.getTime(),
    tasks: out.slice(0, 80),
    strings: { today: tNow('Today'), next: tNow('Next'), allDone: tNow('All done'), nothingPlanned: tNow('Nothing planned'), add: tNow('Add'), done: tNow('Done'), anytime: tNow('Anytime'), more: tNow('more') },
    clock24: useSettings.getState().clock === '24h',
  };
}

/** Applies check-offs made in widgets. Returns how many tasks changed. */
export async function applyPendingActions(actions: PendingAction[]) {
  const { setTaskDone } = await import('./actions');
  let changed = 0;
  for (const a of [...actions].sort((x, y) => x.at - y.at)) {
    const t = await db.tasks.get(a.id);
    const done = a.type === 'complete';
    if (!t || !!t.done === done) continue;
    await setTaskDone(a.id, done);
    changed++;
  }
  return changed;
}

let plugin: WidgetsPlugin | null = null;
const native = () => !!(globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

async function getPlugin() {
  if (!native()) return null;
  if (!plugin) {
    const { registerPlugin } = await import('@capacitor/core');
    plugin = registerPlugin<WidgetsPlugin>('UniversalWidgets');
  }
  return plugin;
}

/** The running task or focus session as a Live Activity (iOS) or ongoing notification (Android). */
export const focusActivity = {
  async start(o: { id?: string; title: string; startedAt: number; endsAt: number }) {
    await (await getPlugin())?.startActivity({ id: o.id ?? '', title: o.title, startedAt: o.startedAt, endsAt: o.endsAt, doneLabel: tNow('Done') }).catch(() => undefined);
  },
  async pause(remainingMs: number) {
    await (await getPlugin())?.updateActivity({ paused: true, remainingMs }).catch(() => undefined);
  },
  async resume(endsAt: number) {
    await (await getPlugin())?.updateActivity({ paused: false, endsAt }).catch(() => undefined);
  },
  async end(done: boolean) {
    await (await getPlugin())?.endActivity({ done }).catch(() => undefined);
  },
};

/** Keeps the widgets in step with the app. Only does anything inside the iOS/Android apps. */
export function startWidgetSync() {
  if (!native()) return () => {};
  let stopped = false;
  let timer = 0;
  const cleanups: (() => void)[] = [];

  const push = () => {
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const p = await getPlugin();
      if (!p || stopped) return;
      await p.setSnapshot({ json: JSON.stringify(buildSnapshot(await db.tasks.toArray())) }).catch(() => undefined);
    }, 250);
  };
  const drain = async () => {
    const p = await getPlugin();
    if (!p || stopped) return;
    const { actions } = await p.takePendingActions().catch(() => ({ actions: [] as PendingAction[] }));
    if (actions.length) await applyPendingActions(actions);
    push();
  };

  void (async () => {
    const { liveQuery } = await import('dexie');
    const sub = liveQuery(() => db.tasks.toArray()).subscribe({ next: push });
    cleanups.push(() => sub.unsubscribe());
    cleanups.push(useSettings.subscribe((s, prev) => (s.language !== prev.language || s.clock !== prev.clock) && push()));
    const { App } = await import('@capacitor/app');
    const h = await App.addListener('appStateChange', ({ isActive }) => isActive && void drain());
    cleanups.push(() => void h.remove());
    await drain();
  })();

  return () => {
    stopped = true;
    clearTimeout(timer);
    cleanups.forEach((c) => c());
  };
}
