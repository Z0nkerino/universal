import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { addDays, startOfDay } from 'date-fns';
import { CalendarCheck2, ChevronDown, Inbox, Moon, Sparkles, Sun, Wand2 } from 'lucide-react';
import { db } from '@/lib/db';
import { scheduleTask, setTaskDone } from '@/lib/actions';
import type { Goal, Task, TaskStatus } from '@/lib/types';
import { dayKey, fmt, fromDayKey, todayKey } from '@/lib/dates';
import { Glass } from '@/ui/Glass';
import { LiquidIndicator, useActiveRect } from '@/ui/LiquidIndicator';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { toast } from '@/ui/Toast';
import { useDropZone, useDnd } from '@/ui/dnd';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { itemVariants, spring } from '@/lib/motion';
import { TimeGrid } from '@/features/calendar/TimeGrid';
import { toGridItems, useBlockedTasks, useOccurrences } from '@/features/calendar/data';
import { useEventEditor } from '@/features/calendar/EventEditor';
import { moveOccurrence } from '@/features/calendar/calendarState';
import { TaskRow } from './TaskRow';
import { QuickAdd } from './QuickAdd';
import { useTaskEditor } from './store';
import { planMyDay } from './planDay';

type ListId = 'today' | 'inbox' | 'scheduled' | 'someday';

const LISTS: { id: ListId; label: string; icon: typeof Sun; empty: [string, string] }[] = [
  { id: 'inbox', label: 'Inbox', icon: Inbox, empty: ['Inbox zero', 'Capture anything here. Sort it into Today, a date, or Someday later.'] },
  { id: 'today', label: 'Today', icon: Sun, empty: ['A clear day', 'Pull a task from your Inbox, or add one above.'] },
  { id: 'scheduled', label: 'Scheduled', icon: CalendarCheck2, empty: ['Nothing scheduled', 'Tasks with a future date show up here.'] },
  { id: 'someday', label: 'Someday', icon: Moon, empty: ['No someday ideas', 'Park things you might do later, so they stop nagging you.'] },
];

export function classify(t: Task, today: string): ListId {
  if (t.status === 'someday') return 'someday';
  if (t.top || t.status === 'today' || (t.due && t.due <= today) || (t.start && dayKey(t.start) <= today)) return 'today';
  if (t.due && t.due > today) return 'scheduled';
  if (t.status === 'scheduled') return 'scheduled';
  return 'inbox';
}

function sortToday(a: Task, b: Task) {
  return (b.top ?? 0) - (a.top ?? 0) || (a.start ?? Infinity) - (b.start ?? Infinity) || b.priority - a.priority || a.order - b.order;
}

/** A list tab you can drop a task onto to move it there. */
function ListTab({ list, index, active, count, onClick }: { list: (typeof LISTS)[number]; index: number; active: boolean; count: number; onClick: () => void }) {
  const t = useT();
  const over = useDnd((s) => s.over);
  const zone = `list-${list.id}`;
  const drop = useDropZone(zone, {
    accepts: ['task'],
    onDrop: async (item) => {
      const status: TaskStatus = list.id;
      const patch: Partial<Task> = { status, start: undefined, end: undefined };
      if (list.id === 'today') patch.due = todayKey();
      if (list.id === 'inbox' || list.id === 'someday') patch.due = undefined;
      if (list.id === 'scheduled') patch.due = dayKey(addDays(new Date(), 1));
      await db.tasks.update(item.id, { ...patch, updatedAt: Date.now() });
      toast(`${t('Moved to')} ${t(list.label)}`);
    },
  });
  return (
    <button
      {...drop}
      data-index={index}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'relative flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[12px] px-2 text-[13px] font-semibold transition-colors sm:flex-none sm:px-3.5',
        active ? 'text-fg' : 'text-fg/55 hover:text-fg/80',
        over === zone && 'bg-blue/15 text-blue',
      )}
    >
      <list.icon size={15} className="relative" aria-hidden />
      <span className="relative">{t(list.label)}</span>
      {count > 0 && <span className="relative text-[11px] font-bold tabular-nums text-fg/40">{count}</span>}
    </button>
  );
}

export function TasksView() {
  const t = useT();
  const [list, setList] = useState<ListId>('today');
  const [showDone, setShowDone] = useState(false);
  const [planning, setPlanning] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabRect = useActiveRect(tabsRef, LISTS.findIndex((l) => l.id === list));
  const openTask = useTaskEditor((s) => s.open);
  const { openNew, openExisting } = useEventEditor();
  const today = todayKey();
  const all = useLiveQuery(() => db.tasks.where('done').equals(0).toArray(), []) ?? [];
  const doneToday = useLiveQuery(() => db.tasks.where('doneAt').aboveOrEqual(startOfDay(new Date()).getTime()).toArray(), []) ?? [];
  const goals = useLiveQuery(() => db.goals.toArray(), []) ?? [];
  const goalById = useMemo(() => new Map(goals.map((g) => [g.id, g] as [string, Goal])), [goals]);

  const groups = useMemo(() => {
    const g: Record<ListId, Task[]> = { today: [], inbox: [], scheduled: [], someday: [] };
    for (const task of all) g[classify(task, today)].push(task);
    g.today.sort(sortToday);
    g.inbox.sort((a, b) => b.createdAt - a.createdAt);
    g.scheduled.sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '') || b.priority - a.priority);
    g.someday.sort((a, b) => b.createdAt - a.createdAt);
    return g;
  }, [all, today]);

  const d0 = startOfDay(new Date());
  const occ = useOccurrences(d0.getTime(), addDays(d0, 1).getTime());
  const blocked = useBlockedTasks(d0.getTime(), addDays(d0, 1).getTime());
  const items = useMemo(() => toGridItems(occ, blocked), [occ, blocked]);

  const runPlan = async () => {
    setPlanning(true);
    try {
      const r = await planMyDay();
      if (!r.scheduled.length && !r.unscheduled.length) toast(t('Nothing left to plan — every task for today has a time.'));
      else
        toast(`${t('Planned')} ${r.scheduled.length} ${t(r.scheduled.length === 1 ? 'task' : 'tasks')}${r.unscheduled.length ? ` · ${r.unscheduled.length} ${t('didn’t fit')}` : ''}`, { action: { label: t('Undo'), run: () => void r.undo() } });
    } finally {
      setPlanning(false);
    }
  };

  const current = groups[list];
  const meta = LISTS.find((l) => l.id === list)!;

  // Scheduled list is grouped by day.
  const scheduledGroups = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const task of groups.scheduled) {
      const k = task.due ?? '';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(task);
    }
    return [...m.entries()];
  }, [groups.scheduled]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
      <motion.div variants={itemVariants} className="min-w-0">
        <Glass shimmer={false} radius="xl" className="p-3 sm:p-4">
          <QuickAdd status={list === 'scheduled' ? undefined : list} placeholder={t('Add a task — “Call the bank tomorrow 10am #errands”')} />
          <div ref={tabsRef} className="relative mt-3 flex gap-1 rounded-[16px] bg-fg/[0.05] p-1" role="tablist" aria-label={t('Task lists')}>
            <LiquidIndicator rect={tabRect} axis="x" className="rounded-[12px] bg-bg shadow-[0_1px_2px_rgb(0_0_0/.08),0_2px_8px_rgb(0_0_0/.06)] dark:bg-white/[0.12]" />
            {LISTS.map((l, i) => (
              <ListTab key={l.id} index={i} list={l} active={list === l.id} count={groups[l.id].length} onClick={() => setList(l.id)} />
            ))}
          </div>
          <div className="mt-2 min-h-[240px]" role="tabpanel" aria-label={t(meta.label)}>
            {current.length === 0 ? (
              <EmptyState compact icon={meta.icon} title={t(meta.empty[0])} body={t(meta.empty[1])} />
            ) : list === 'scheduled' ? (
              scheduledGroups.map(([day, tasks]) => (
                <section key={day} className="mt-2">
                  <h3 className="px-3 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg/50">{day ? fmt(fromDayKey(day), 'EEEE, d MMMM') : t('No date')}</h3>
                  <ul>
                    <AnimatePresence initial={false}>
                      {tasks.map((task) => <TaskRow key={task.id} task={task} goal={task.goalId ? goalById.get(task.goalId) : undefined} />)}
                    </AnimatePresence>
                  </ul>
                </section>
              ))
            ) : (
              <ul className="mt-1">
                <AnimatePresence initial={false}>
                  {current.map((task) => <TaskRow key={task.id} task={task} goal={task.goalId ? goalById.get(task.goalId) : undefined} />)}
                </AnimatePresence>
              </ul>
            )}
            {list === 'today' && doneToday.length > 0 && (
              <div className="mt-2 border-t border-fg/[0.06] pt-2">
                <button type="button" onClick={() => setShowDone((v) => !v)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold text-fg/50 hover:text-fg/80" aria-expanded={showDone}>
                  <motion.span animate={{ rotate: showDone ? 0 : -90 }} transition={spring}><ChevronDown size={15} aria-hidden /></motion.span>
                  {t('Done today')} · {doneToday.length}
                </button>
                <AnimatePresence initial={false}>
                  {showDone && (
                    <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
                      {doneToday.map((task) => <TaskRow key={task.id} task={task} compact draggable={false} />)}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
          <p className="mt-2 hidden px-2 text-[12px] text-fg/40 sm:block">{t('Tip: drag a task onto the timeline to block time for it, or onto a list tab to move it.')}</p>
        </Glass>
      </motion.div>

      <motion.div variants={itemVariants} className="min-w-0">
        <Glass shimmer={false} radius="xl" className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2 px-1">
            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em]">{fmt(new Date(), 'EEEE, d MMMM')}</h2>
              <p className="text-[13px] text-fg/50">{t('Your timeline')}</p>
            </div>
            <Button size="sm" variant="brand" icon={planning ? Sparkles : Wand2} disabled={planning} onClick={() => void runPlan()}>
              {t('Plan my day')}
            </Button>
          </div>
          <TimeGrid
            days={[d0]}
            items={items}
            showDayHeaders={false}
            height="min(640px, calc(100dvh - 300px))"
            onCreate={(s, e) => openNew(s, e)}
            onOpen={(it) => (it.kind === 'task' ? openTask(it.id) : void openExisting(it.id, it.occStart))}
            onChange={(it, s, e) => {
              if (it.kind === 'task') void scheduleTask(it.id, s, (e - s) / 60_000);
              else {
                const o = occ.find((x) => x.event.id === it.id && x.start === it.occStart);
                if (o) void moveOccurrence(o, s, e, t);
              }
            }}
            onToggleTask={(it) => void setTaskDone(it.id, !it.done)}
            onDropTask={(id, s) => void scheduleTask(id, s).then(() => toast(t('Time blocked')))}
          />
        </Glass>
      </motion.div>
    </div>
  );
}
