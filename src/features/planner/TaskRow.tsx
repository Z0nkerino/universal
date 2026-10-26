import { forwardRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, Clock3, Flag, GripVertical, ListChecks, Target, Zap } from 'lucide-react';
import type { Goal, Task } from '@/lib/types';
import { Checkbox } from '@/ui/Checkbox';
import { beginDrag } from '@/ui/dnd';
import { setTaskDone } from '@/lib/actions';
import { fmt, fmtTime, todayKey, fromDayKey } from '@/lib/dates';
import { useTaskEditor } from './store';
import { toast } from '@/ui/Toast';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';

export const PRIORITY_COLORS = ['', 'text-fg/45', 'text-blue', 'text-pink'];
export const PRIORITY_LABELS = ['None', 'Low', 'Medium', 'High'];

export function dueLabel(t: Pick<Task, 'due' | 'start'>, tr: (s: string) => string) {
  if (t.start) return `${t.due === todayKey() ? '' : fmt(t.start, 'EEE d MMM') + ', '}${fmtTime(t.start)}`;
  if (!t.due) return null;
  const today = todayKey();
  if (t.due === today) return tr('Today');
  const d = fromDayKey(t.due);
  const diff = Math.round((d.getTime() - fromDayKey(today).getTime()) / 86_400_000);
  if (diff === 1) return tr('Tomorrow');
  if (diff === -1) return tr('Yesterday');
  return fmt(d, diff > -7 && diff < 7 ? 'EEEE' : 'd MMM');
}

/** Completes a task with the check animation first, then offers Undo. */
export async function completeWithUndo(task: Task, tr: (s: string) => string) {
  await setTaskDone(task.id, true);
  toast(tr('Done') + ` · ${task.title}`, { action: { label: tr('Undo'), run: () => void setTaskDone(task.id, false) } });
}

export const TaskRow = forwardRef<HTMLLIElement, { task: Task; goal?: Goal; draggable?: boolean; compact?: boolean }>(function TaskRow({ task, goal, draggable = true, compact }, ref) {
  const t = useT();
  const open = useTaskEditor((s) => s.open);
  // Local "checked" so the tick animates before the row leaves the list.
  const [checking, setChecking] = useState(false);
  const done = !!task.done || checking;
  const overdue = !task.done && task.due && task.due < todayKey();
  const subDone = task.subtasks.filter((s) => s.done).length;
  const due = dueLabel(task, t);

  return (
    <motion.li
      ref={ref}
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0, transition: { ...spring, opacity: { duration: 0.15 } } }}
      transition={spring}
      className="overflow-hidden"
    >
      <div
        className={cn('group flex cursor-pointer select-none items-start gap-3 rounded-[16px] px-2.5 transition-colors hover:bg-fg/[0.04]', compact ? 'py-2' : 'py-2.5')}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('[role=checkbox]')) return;
          if (draggable) beginDrag(e, { kind: 'task', id: task.id, label: task.title, durationMin: task.estimate ?? 30 }, () => open(task.id));
        }}
        onClick={(e) => {
          if (!draggable && !(e.target as HTMLElement).closest('[role=checkbox]')) open(task.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open(task.id);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`${task.title}${due ? `, ${due}` : ''}`}
      >
        <span className="pt-0.5">
          <Checkbox
            checked={done}
            label={task.title}
            onChange={(v) => {
              if (v) {
                setChecking(true);
                setTimeout(() => void completeWithUndo(task, t).finally(() => setChecking(false)), 420);
              } else void setTaskDone(task.id, false);
            }}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('text-[15px] font-medium leading-snug transition-colors', done && 'text-fg/40 line-through decoration-fg/40')}>{task.title}</p>
          {!compact && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-fg/50">
              {due && (
                <span className={cn('inline-flex items-center gap-1', overdue && 'text-pink')}>
                  {task.start ? <Clock3 size={12} aria-hidden /> : <CalendarClock size={12} aria-hidden />}
                  {due}
                </span>
              )}
              {task.estimate && <span>{task.estimate >= 60 ? `${Math.round((task.estimate / 60) * 10) / 10} h` : `${task.estimate} min`}</span>}
              {task.energy && (
                <span className="inline-flex items-center gap-0.5" title={`${t('Energy')}: ${task.energy}`}>
                  <Zap size={12} aria-hidden className={task.energy === 'high' ? 'text-pink' : task.energy === 'med' ? 'text-blue' : 'text-fg/40'} />
                  {t(task.energy === 'med' ? 'Medium' : task.energy === 'high' ? 'High' : 'Low')}
                </span>
              )}
              {task.subtasks.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <ListChecks size={12} aria-hidden />
                  {subDone}/{task.subtasks.length}
                </span>
              )}
              {goal && (
                <span className="inline-flex items-center gap-1 text-blue">
                  <Target size={12} aria-hidden />
                  {goal.title}
                </span>
              )}
              {task.tags.map((tag) => (
                <span key={tag} className="text-fg/45">#{tag}</span>
              ))}
            </div>
          )}
        </div>
        {task.priority > 0 && <Flag size={15} className={cn('mt-1 shrink-0', PRIORITY_COLORS[task.priority])} fill="currentColor" aria-label={`${t(PRIORITY_LABELS[task.priority])} priority`} />}
        {draggable && <GripVertical size={16} className="mt-1 shrink-0 text-fg/20 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
      </div>
    </motion.li>
  );
});
