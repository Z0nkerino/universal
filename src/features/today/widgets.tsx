import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { addDays, startOfDay } from 'date-fns';
import { ArrowRight, Clock3, Droplets, Flame, ListTodo, Play, Plus, Repeat, Star, Target, Timer } from 'lucide-react';
import { db } from '@/lib/db';
import { addWater, toggleHabit, updateTask } from '@/lib/actions';
import { dayKey, fmtTime, todayKey } from '@/lib/dates';
import { useNow } from '@/lib/hooks';
import { useSettings } from '@/lib/settings';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';
import { Rings, RING_PRESETS } from '@/ui/Rings';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { toast } from '@/ui/Toast';
import { useRouter } from '@/app/router';
import { TaskRow } from '@/features/planner/TaskRow';
import { useFocusMode, useTaskEditor } from '@/features/planner/store';
import { useHabitsData } from '@/features/planner/HabitsView';
import { goalProgress } from '@/features/planner/GoalsView';
import { useOccurrences } from '@/features/calendar/data';
import { EVENT_HEX } from '@/features/calendar/colors';
import { useEventEditor } from '@/features/calendar/EventEditor';
import { classify } from '@/features/planner/TasksView';
import { useTodayTab } from './store';

/** Remaining-time bar for whatever is happening right now. */
function NowBar({ start, end }: { start: number; end: number }) {
  const now = useNow(15_000).getTime();
  if (now < start || now >= end) return null;
  const p = (now - start) / (end - start);
  const left = Math.ceil((end - now) / 60_000);
  return (
    <div className="mt-1.5 flex items-center gap-2" aria-label={`${left} min left`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fg/[0.08]">
        <motion.div className="h-full rounded-full bg-brand" initial={false} animate={{ width: `${p * 100}%` }} transition={spring} />
      </div>
      <span className="text-[11px] font-semibold tabular-nums text-pink">{left}m</span>
    </div>
  );
}

export function TimelineWidget() {
  const t = useT();
  const now = useNow(60_000);
  const d0 = startOfDay(now);
  const occ = useOccurrences(d0.getTime(), addDays(d0, 1).getTime());
  const tasks = useLiveQuery(() => db.tasks.where('start').between(d0.getTime(), addDays(d0, 1).getTime()).toArray(), [d0.getTime()]) ?? [];
  const openTask = useTaskEditor((s) => s.open);
  const openEvent = useEventEditor((s) => s.openExisting);
  const setTab = useTodayTab((s) => s.set);
  const items = useMemo(
    () =>
      [
        ...occ.filter((o) => !o.event.allDay && o.end - o.start < 86_400_000).map((o) => ({ key: `${o.event.id}${o.start}`, title: o.event.title, start: o.start, end: o.end, color: EVENT_HEX[o.event.color], open: () => void openEvent(o.event.id, o.start), done: false, task: false })),
        ...tasks.map((x) => ({ key: x.id, title: x.title, start: x.start!, end: x.end ?? x.start! + 1_800_000, color: '#2F6BFF', open: () => openTask(x.id), done: !!x.done, task: true })),
      ]
        .filter((i) => i.end > now.getTime() - 30 * 60_000)
        .sort((a, b) => a.start - b.start),
    [occ, tasks, now, openEvent, openTask],
  );
  const allDay = occ.filter((o) => o.event.allDay || o.end - o.start >= 86_400_000);

  if (!items.length && !allDay.length)
    return <EmptyState compact icon={Clock3} title={t('Nothing else today')} body={t('Drag tasks onto your timeline in the planner to block time for them.')} action={<Button size="sm" variant="glass" iconRight={ArrowRight} onClick={() => setTab('tasks')}>{t('Open planner')}</Button>} />;

  return (
    <div className="flex flex-col gap-1">
      {allDay.map((o) => (
        <div key={o.event.id} className="mb-1 rounded-lg px-2 py-1 text-[12px] font-semibold" style={{ background: `color-mix(in srgb, ${EVENT_HEX[o.event.color]} 15%, transparent)` }}>
          {o.event.title}
        </div>
      ))}
      <ol className="relative flex flex-col">
        {items.slice(0, 7).map((i) => (
          <li key={i.key}>
            <button type="button" onClick={i.open} className="flex w-full gap-3 rounded-xl px-1.5 py-2 text-left hover:bg-fg/[0.04]">
              <span className="w-14 shrink-0 pt-0.5 text-[12px] font-semibold tabular-nums text-fg/50">{fmtTime(i.start)}</span>
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: i.color, outline: i.task ? `1.5px dashed ${i.color}` : undefined, outlineOffset: 2 }} />
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-[14px] font-semibold', i.done && 'text-fg/40 line-through')}>{i.title}</span>
                <NowBar start={i.start} end={i.end} />
              </span>
            </button>
          </li>
        ))}
      </ol>
      {items.length > 7 && <p className="px-2 text-[12px] text-fg/45">+{items.length - 7} {t('more')}</p>}
    </div>
  );
}

export function Top3Widget() {
  const t = useT();
  const all = useLiveQuery(() => db.tasks.where('done').equals(0).toArray(), []) ?? [];
  const goals = useLiveQuery(() => db.goals.toArray(), []) ?? [];
  const today = todayKey();
  const top = all.filter((x) => x.top).sort((a, b) => b.priority - a.priority).slice(0, 3);
  const candidates = all.filter((x) => !x.top && classify(x, today) === 'today').sort((a, b) => b.priority - a.priority).slice(0, 3);
  return (
    <div>
      {top.length > 0 && (
        <ul>
          <AnimatePresence initial={false}>
            {top.map((x) => <TaskRow key={x.id} task={x} goal={goals.find((g) => g.id === x.goalId)} draggable={false} />)}
          </AnimatePresence>
        </ul>
      )}
      {top.length < 3 && (
        <div className={cn(top.length > 0 && 'mt-2 border-t border-fg/[0.06] pt-2')}>
          {top.length === 0 && <p className="mb-2 px-1 text-[14px] text-fg/55">{t('Pick up to three things that would make today a win.')}</p>}
          {candidates.length ? (
            <ul>
              {candidates.slice(0, 3 - top.length).map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => void updateTask(x.id, { top: 1, status: 'today', due: x.due ?? today })} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-[14px] text-fg/70 hover:bg-fg/[0.04] hover:text-fg">
                    <Star size={16} className="shrink-0 text-fg/35" aria-hidden />
                    <span className="truncate">{x.title}</span>
                    <span className="ml-auto shrink-0 text-[12px] font-semibold text-blue">{t('Make it a top 3')}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            top.length === 0 && <EmptyState compact icon={ListTodo} title={t('No tasks for today')} body={t('Add some in the planner, or ask Afina to plan your day.')} />
          )}
        </div>
      )}
    </div>
  );
}

export function HabitsWidget() {
  const t = useT();
  const ws = useSettings((s) => s.weekStart);
  const { habits, logsFor } = useHabitsData();
  const today = todayKey();
  const daily = habits.filter((h) => h.period === 'day');
  const weekly = habits.filter((h) => h.period === 'week');
  const dailyDone = daily.filter((h) => logsFor(h.id).has(today)).length;
  const weeklyProgress = weekly.length
    ? weekly.reduce((a, h) => {
        const logs = logsFor(h.id);
        let n = 0;
        const start = startOfDay(new Date());
        start.setDate(start.getDate() - ((start.getDay() - ws + 7) % 7));
        for (let i = 0; i < 7; i++) if (logs.has(dayKey(addDays(start, i)))) n++;
        return a + Math.min(1, n / h.target);
      }, 0) / weekly.length
    : 0;
  const setTab = useTodayTab((s) => s.set);
  if (!habits.length) return <EmptyState compact icon={Repeat} title={t('No habits yet')} body={t('Track something small you want to do often.')} action={<Button size="sm" variant="glass" icon={Plus} onClick={() => setTab('habits')}>{t('Add a habit')}</Button>} />;
  return (
    <div className="flex items-center gap-4">
      <Rings
        size={108}
        stroke={12}
        rings={[
          { value: daily.length ? dailyDone / daily.length : 0, ...RING_PRESETS.blue, label: t('Daily habits') },
          { value: weeklyProgress, ...RING_PRESETS.pink, label: t('Weekly habits') },
        ]}
      />
      <ul className="min-w-0 flex-1">
        {habits.slice(0, 4).map((h) => {
          const on = logsFor(h.id).has(today);
          return (
            <li key={h.id}>
              <button type="button" onClick={() => void toggleHabit(h.id)} aria-pressed={on} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-[13px] font-medium hover:bg-fg/[0.04]">
                <motion.span animate={{ scale: on ? [1, 1.25, 1] : 1 }} className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] text-white', on ? (h.color === 'pink' ? 'bg-pink' : 'bg-blue') : 'bg-fg/[0.1]')}>
                  {on ? '✓' : ''}
                </motion.span>
                <span className="truncate">{h.emoji} {h.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function NutritionWidget() {
  const t = useT();
  const targets = useSettings((s) => s.targets);
  const today = todayKey();
  const water = useLiveQuery(() => db.water.where('date').equals(today).toArray(), [today]) ?? [];
  const meals = useLiveQuery(() => db.meals.where('date').equals(today).toArray(), [today]) ?? [];
  const go = useRouter((s) => s.go);
  const ml = water.reduce((a, w) => a + w.ml, 0);
  const kcal = meals.reduce((a, m) => a + m.kcal, 0);
  const glasses = Math.round(ml / 250);
  const target = Math.round(targets.waterMl / 250);
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-[28px] font-bold tabular-nums tracking-[-0.03em]">
          {glasses}
          <span className="ml-1 text-[14px] font-semibold text-fg/45">/ {target} {t('glasses')}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-1" aria-hidden>
          {Array.from({ length: target }, (_, i) => (
            <motion.span key={i} className="h-5 w-2.5 rounded-full" animate={{ background: i < glasses ? '#2F6BFF' : 'rgba(47,107,255,0.15)' }} transition={{ delay: i * 0.03 }} />
          ))}
        </div>
        <Button size="sm" variant="glass" icon={Droplets} className="mt-3" onClick={() => void addWater(250).then(() => toast(t('+1 glass of water')))}>
          +250 ml
        </Button>
      </div>
      <button type="button" onClick={() => go('health')} className="rounded-2xl text-left">
        <p className="flex items-baseline text-[28px] font-bold tabular-nums tracking-[-0.03em]">
          {Math.round(kcal)}
          <span className="ml-1 text-[14px] font-semibold text-fg/45">/ {targets.kcal} kcal</span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-pink/15">
          <motion.div className="h-full rounded-full bg-pink" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (kcal / targets.kcal) * 100)}%` }} transition={spring} />
        </div>
        <p className="mt-2 flex items-center gap-1 text-[12px] font-medium text-fg/50">
          <Flame size={12} aria-hidden /> {meals.length} {t(meals.length === 1 ? 'item logged' : 'items logged')} · {t('Log food')} →
        </p>
      </button>
    </div>
  );
}

export function FocusWidget() {
  const t = useT();
  const start = useFocusMode((s) => s.start);
  const d0 = startOfDay(new Date()).getTime();
  const focus = useLiveQuery(() => db.focus.where('start').aboveOrEqual(d0).toArray(), [d0]) ?? [];
  const top = useLiveQuery(async () => {
    const open = await db.tasks.where('done').equals(0).toArray();
    return open.filter((x) => classify(x, todayKey()) === 'today').sort((a, b) => (b.top ?? 0) - (a.top ?? 0) || b.priority - a.priority)[0];
  }, []);
  const minutes = focus.reduce((a, f) => a + f.minutes, 0);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[28px] font-bold tabular-nums tracking-[-0.03em]">
        {minutes}
        <span className="ml-1 text-[14px] font-semibold text-fg/45">{t('min focused today')}</span>
      </p>
      {top && <p className="truncate text-[14px] text-fg/60">{t('Up next')}: <span className="font-semibold text-fg">{top.title}</span></p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="brand" icon={Play} onClick={() => start(top?.id, 25)}>{t('Focus 25 min')}</Button>
        <Button size="sm" variant="glass" icon={Timer} onClick={() => start(top?.id, 2)}>{t('Just start · 2 min')}</Button>
      </div>
    </div>
  );
}

export function GoalsWidget() {
  const t = useT();
  const goals = useLiveQuery(() => db.goals.toArray(), []) ?? [];
  const tasks = useLiveQuery(() => db.tasks.filter((x) => !!x.goalId).toArray(), []) ?? [];
  const setTab = useTodayTab((s) => s.set);
  if (!goals.length) return <EmptyState compact icon={Target} title={t('No goals yet')} body={t('Set a goal and link tasks to it to see progress here.')} action={<Button size="sm" variant="glass" icon={Plus} onClick={() => setTab('goals')}>{t('Set a goal')}</Button>} />;
  return (
    <ul className="flex flex-col gap-3">
      {goals.slice(0, 3).map((g) => {
        const p = goalProgress(g, tasks);
        return (
          <li key={g.id}>
            <button type="button" onClick={() => setTab('goals')} className="w-full text-left">
              <div className="mb-1 flex items-center justify-between gap-2 text-[14px] font-semibold">
                <span className="truncate">{g.title}</span>
                <span className="shrink-0 tabular-nums text-fg/50">{Math.round(p.value * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-fg/[0.07]">
                <motion.div className="h-full rounded-full bg-brand" initial={{ width: 0 }} animate={{ width: `${p.value * 100}%` }} transition={spring} />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
