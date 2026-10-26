// Event and task reminders while the app is open (or installed and running in the background).
// Uses system notifications when allowed, otherwise an in-app toast. Wording stays gentle.
import { startOfDay } from 'date-fns';
import { db } from './db';
import { dayKey, fmtTime } from './dates';
import { useSettings } from './settings';
import { tNow } from './i18n';
import { expandEvents } from '@/features/calendar/recurrence';
import { toast } from '@/ui/Toast';

const FIRED_KEY = 'up.reminders.fired';
const WINDOW = 5 * 60_000; // late reminders older than this are skipped, not spammed

function loadFired(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}
function saveFired(s: Set<string>) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify([...s].slice(-300)));
  } catch {
    /* storage unavailable */
  }
}

export function notify(title: string, body: string, tag: string) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, tag, icon: '/brand/icon-192.png', silent: false });
      return;
    } catch {
      /* some platforms only allow notifications from a service worker */
    }
  }
  toast(`${title} · ${body}`, { ms: 8000 });
}

export async function checkReminders(now = Date.now()) {
  if (!useSettings.getState().reminders) return;
  const fired = loadFired();
  const to = now + 2 * 86_400_000;
  const occ = expandEvents(await db.events.where('start').below(to).toArray(), now - 86_400_000, to);
  for (const o of occ) {
    if (o.event.reminder === undefined) continue;
    const at = o.start - o.event.reminder * 60_000;
    const key = `e:${o.event.id}:${o.start}`;
    if (at <= now && at > now - WINDOW && !fired.has(key)) {
      fired.add(key);
      const when = o.event.reminder === 0 ? tNow('Starting now') : `${tNow('At')} ${fmtTime(o.start)}`;
      notify(o.event.title, `${when}${o.event.location ? ` · ${o.event.location}` : ''}`, key);
    }
  }
  const tasks = await db.tasks.where('done').equals(0).filter((t) => !!t.remindAt && t.remindAt <= now && t.remindAt > now - WINDOW).toArray();
  for (const t of tasks) {
    const key = `t:${t.id}:${t.remindAt}`;
    if (fired.has(key)) continue;
    fired.add(key);
    notify(tNow('Gentle nudge'), t.title, key);
  }

  // Once a day, around 1pm: if nothing's done yet, suggest just starting.
  const d = new Date(now);
  const nudgeKey = `nudge:${dayKey(d)}`;
  if (d.getHours() === 13 && !fired.has(nudgeKey)) {
    fired.add(nudgeKey);
    const done = await db.tasks.where('doneAt').aboveOrEqual(startOfDay(d).getTime()).count();
    const open = await db.tasks.where('done').equals(0).filter((t) => t.status === 'today' || (!!t.due && t.due <= dayKey(d))).toArray();
    if (!done && open.length) {
      const top = open.sort((a, b) => (b.top ?? 0) - (a.top ?? 0) || b.priority - a.priority)[0];
      notify(tNow('How about two minutes?'), `${tNow('Just start')}: ${top.title}`, nudgeKey);
    }
  }
  saveFired(fired);
}

let timer = 0;
export function startReminders() {
  clearInterval(timer);
  void checkReminders();
  timer = window.setInterval(() => void checkReminders(), 30_000);
  return () => clearInterval(timer);
}

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported' as const;
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}
