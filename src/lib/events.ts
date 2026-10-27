// A tiny in-app event bus. Actions announce what happened; connectors (webhooks) listen.

export type AppEventType = 'task.created' | 'task.completed' | 'event.created' | 'habit.done' | 'focus.finished' | 'idea.created';

export interface AppEvent {
  type: AppEventType;
  /** A short human description, e.g. the task's title. */
  title: string;
  at: number;
  data?: Record<string, unknown>;
}

type Listener = (e: AppEvent) => void;
const listeners = new Set<Listener>();

export function onAppEvent(fn: Listener) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function emitAppEvent(type: AppEventType, title: string, data?: Record<string, unknown>) {
  const e: AppEvent = { type, title, at: Date.now(), data };
  listeners.forEach((fn) => {
    try {
      fn(e);
    } catch {
      /* a listener's failure never breaks the action */
    }
  });
}
