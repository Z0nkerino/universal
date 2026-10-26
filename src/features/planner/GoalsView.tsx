import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Plus, Target, Trash2, X } from 'lucide-react';
import { db, uid } from '@/lib/db';
import { createGoal, createTask, deleteGoal, updateGoal } from '@/lib/actions';
import type { Goal, Task } from '@/lib/types';
import { fmt, fromDayKey, todayKey } from '@/lib/dates';
import { TiltCard } from '@/ui/TiltCard';
import { Button, IconButton } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Sheet } from '@/ui/Sheet';
import { Field, Input, TextArea } from '@/ui/Field';
import { EmptyState } from '@/ui/EmptyState';
import { confirm } from '@/ui/Confirm';
import { toast } from '@/ui/Toast';
import { useT } from '@/lib/i18n';
import { itemVariants, spring } from '@/lib/motion';
import { TaskRow } from './TaskRow';

/** Progress = finished milestones + finished linked tasks, over all of them. */
export function goalProgress(g: Goal, tasks: Task[]) {
  const linked = tasks.filter((t) => t.goalId === g.id);
  const total = g.milestones.length + linked.length;
  const done = g.milestones.filter((m) => m.done).length + linked.filter((t) => t.done).length;
  return { total, done, value: total ? done / total : g.done ? 1 : 0, linked };
}

function GoalCard({ goal, tasks }: { goal: Goal; tasks: Task[] }) {
  const t = useT();
  const [milestone, setMilestone] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const p = goalProgress(goal, tasks);
  const openTasks = p.linked.filter((x) => !x.done);
  const daysLeft = goal.targetDate ? Math.round((fromDayKey(goal.targetDate).getTime() - fromDayKey(todayKey()).getTime()) / 86_400_000) : null;

  return (
    <motion.li variants={itemVariants} layout exit={{ opacity: 0, scale: 0.96 }}>
      <TiltCard max={2} className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-brand-soft">
            <Target size={20} className="text-blue" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[18px] font-bold leading-tight tracking-[-0.02em]">{goal.title}</h3>
            {goal.why && <p className="mt-0.5 text-[14px] text-fg/55">{goal.why}</p>}
          </div>
          <IconButton
            icon={Trash2}
            size={34}
            label={t('Delete goal')}
            onClick={async () => {
              if (await confirm({ title: t('Delete this goal?'), body: t('Linked tasks stay, they just won’t belong to a goal.'), confirmLabel: t('Delete'), danger: true })) {
                await deleteGoal(goal.id);
                toast(t('Goal deleted'));
              }
            }}
          />
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[13px] font-semibold">
            <span>{Math.round(p.value * 100)}%</span>
            <span className="flex items-center gap-1 text-fg/50">
              {goal.targetDate && (
                <>
                  <CalendarDays size={12} aria-hidden />
                  {fmt(fromDayKey(goal.targetDate), 'd MMM')}
                  {daysLeft !== null && <span className={daysLeft < 0 ? 'text-pink' : ''}> · {daysLeft >= 0 ? `${daysLeft} ${t('days left')}` : t('past due')}</span>}
                </>
              )}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-fg/[0.07]" role="progressbar" aria-valuenow={Math.round(p.value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={t('Goal progress')}>
            <motion.div className="h-full rounded-full bg-brand" initial={{ width: 0 }} animate={{ width: `${p.value * 100}%` }} transition={spring} />
          </div>
        </div>

        <section className="mt-4" aria-label={t('Milestones')}>
          <h4 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg/50">{t('Milestones')}</h4>
          <ul>
            {goal.milestones.map((m) => (
              <li key={m.id} className="group flex items-center gap-3 rounded-xl px-1 py-1.5">
                <Checkbox size={20} checked={m.done} label={m.title} onChange={(done) => void updateGoal(goal.id, { milestones: goal.milestones.map((x) => (x.id === m.id ? { ...x, done } : x)) })} />
                <span className={`flex-1 text-[15px] ${m.done ? 'text-fg/40 line-through' : ''}`}>{m.title}</span>
                <IconButton icon={X} size={28} label={t('Remove milestone')} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => void updateGoal(goal.id, { milestones: goal.milestones.filter((x) => x.id !== m.id) })} />
              </li>
            ))}
          </ul>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!milestone.trim()) return;
              void updateGoal(goal.id, { milestones: [...goal.milestones, { id: uid(), title: milestone.trim(), done: false }] });
              setMilestone('');
            }}
          >
            <Plus size={16} className="ml-1 text-fg/40" aria-hidden />
            <input value={milestone} onChange={(e) => setMilestone(e.target.value)} placeholder={t('Add a milestone')} aria-label={t('Add a milestone')} className="h-9 flex-1 bg-transparent text-[14px] placeholder:text-fg/35 focus-visible:outline-none" />
          </form>
        </section>

        <section className="mt-3" aria-label={t('Linked tasks')}>
          <h4 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg/50">
            {t('Tasks')} {p.linked.length > 0 && <span className="text-fg/35">· {p.linked.length - openTasks.length}/{p.linked.length}</span>}
          </h4>
          <ul>
            <AnimatePresence initial={false}>{openTasks.map((x) => <TaskRow key={x.id} task={x} compact draggable={false} />)}</AnimatePresence>
          </ul>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!taskTitle.trim()) return;
              void createTask({ title: taskTitle.trim(), goalId: goal.id, status: 'inbox' });
              setTaskTitle('');
            }}
          >
            <Plus size={16} className="ml-1 text-fg/40" aria-hidden />
            <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder={t('Add a task for this goal')} aria-label={t('Add a task for this goal')} className="h-9 flex-1 bg-transparent text-[14px] placeholder:text-fg/35 focus-visible:outline-none" />
          </form>
        </section>
      </TiltCard>
    </motion.li>
  );
}

function NewGoal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [date, setDate] = useState('');
  const [ms, setMs] = useState('');
  return (
    <Sheet open={open} onClose={onClose} label={t('New goal')} className="max-w-lg">
      <form
        className="p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          await createGoal({
            title: title.trim(),
            why: why.trim() || undefined,
            targetDate: date || undefined,
            milestones: ms.split('\n').map((s) => s.trim()).filter(Boolean).map((s) => ({ id: uid(), title: s, done: false })),
          });
          toast(`${t('Goal added')} · ${title.trim()}`);
          setTitle(''); setWhy(''); setDate(''); setMs('');
          onClose();
        }}
      >
        <h2 className="text-[20px] font-bold tracking-[-0.02em]">{t('New goal')}</h2>
        <div className="mt-5 flex flex-col gap-4">
          <Field label={t('Goal')} htmlFor="goal-title"><Input id="goal-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('Run a 10K')} /></Field>
          <Field label={t('Why it matters')} htmlFor="goal-why"><Input id="goal-why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder={t('Optional, but it helps on hard days')} /></Field>
          <Field label={t('Target date')} htmlFor="goal-date"><Input id="goal-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={t('Milestones')} htmlFor="goal-ms" hint={t('One per line')}><TextArea id="goal-ms" value={ms} onChange={(e) => setMs(e.target.value)} placeholder={'Run 3K\nRun 5K\nRace day'} /></Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" disabled={!title.trim()}>{t('Add goal')}</Button>
        </div>
      </form>
    </Sheet>
  );
}

export function GoalsView() {
  const t = useT();
  const goals = useLiveQuery(() => db.goals.orderBy('createdAt').toArray(), []) ?? [];
  const tasks = useLiveQuery(() => db.tasks.filter((x) => !!x.goalId).toArray(), []) ?? [];
  const [adding, setAdding] = useState(false);
  const sorted = useMemo(() => [...goals].sort((a, b) => (a.targetDate ?? '9').localeCompare(b.targetDate ?? '9')), [goals]);
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[15px] text-fg/55">{t('Goals → milestones → tasks. Progress fills in as you finish things.')}</p>
        <Button icon={Plus} onClick={() => setAdding(true)}>{t('New goal')}</Button>
      </div>
      {sorted.length === 0 ? (
        <TiltCard className="p-6">
          <EmptyState icon={Target} title={t('No goals yet')} body={t('Pick one thing you want to be true in a few months. We’ll break it down together.')} action={<Button variant="brand" icon={Plus} onClick={() => setAdding(true)}>{t('Set a goal')}</Button>} />
        </TiltCard>
      ) : (
        <motion.ul className="grid gap-4 lg:grid-cols-2" initial="initial" animate="enter" variants={{ enter: { transition: { staggerChildren: 0.05 } } }}>
          <AnimatePresence>{sorted.map((g) => <GoalCard key={g.id} goal={g} tasks={tasks} />)}</AnimatePresence>
        </motion.ul>
      )}
      <NewGoal open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
