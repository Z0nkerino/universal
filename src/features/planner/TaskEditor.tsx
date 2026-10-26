import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { Flag, Play, Plus, Sparkles, Timer, Trash2, X, Zap } from 'lucide-react';
import { db, uid } from '@/lib/db';
import { deleteTask, updateTask } from '@/lib/actions';
import type { Energy, Priority, Task, TaskStatus } from '@/lib/types';
import { Sheet } from '@/ui/Sheet';
import { Button, IconButton } from '@/ui/Button';
import { Chip, Field, Input, Select, TextArea } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Checkbox } from '@/ui/Checkbox';
import { confirm } from '@/ui/Confirm';
import { toast } from '@/ui/Toast';
import { useT, tNow } from '@/lib/i18n';
import { fromDayKey, todayKey } from '@/lib/dates';
import { breakDownTask } from './breakdown';
import { useFocusMode, useTaskEditor } from './store';
import { PRIORITY_COLORS, PRIORITY_LABELS } from './TaskRow';
import { spring } from '@/lib/motion';

const ESTIMATES = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240];

const toTimeInput = (t?: number) => (t ? new Date(t).toTimeString().slice(0, 5) : '');

export function TaskEditor() {
  const t = useT();
  const { id, close } = useTaskEditor();
  const task = useLiveQuery(() => (id ? db.tasks.get(id) : undefined), [id]);
  const goals = useLiveQuery(() => db.goals.toArray(), []) ?? [];
  const startFocus = useFocusMode((s) => s.start);
  const [draft, setDraft] = useState<Task | null>(null);
  const [newSub, setNewSub] = useState('');
  const [tagText, setTagText] = useState('');

  useEffect(() => {
    if (task && task.id !== draft?.id) {
      setDraft(task);
      setTagText(task.tags.join(', '));
    }
    if (!id) setDraft(null);
  }, [task, id, draft?.id]);

  // Saves each change immediately; the sheet has no Save button to forget.
  const patch = (p: Partial<Task>) => {
    if (!draft) return;
    setDraft({ ...draft, ...p });
    void updateTask(draft.id, p);
  };

  const setWhen = (date: string, time: string) => {
    if (!draft) return;
    if (!date) return patch({ due: undefined, start: undefined, end: undefined, status: draft.status === 'scheduled' || draft.status === 'today' ? 'inbox' : draft.status });
    const status: TaskStatus = date === todayKey() ? 'today' : date > todayKey() ? 'scheduled' : draft.status === 'inbox' || draft.status === 'someday' ? 'today' : draft.status;
    if (!time) return patch({ due: date, start: undefined, end: undefined, status });
    const [h, m] = time.split(':').map(Number);
    const d = fromDayKey(date);
    d.setHours(h, m, 0, 0);
    const start = d.getTime();
    patch({ due: date, start, end: start + (draft.estimate ?? 30) * 60_000, status, remindAt: start });
  };

  const addSubtasks = (titles: string[]) => {
    if (!draft) return;
    patch({ subtasks: [...draft.subtasks, ...titles.map((title) => ({ id: uid(), title, done: false }))] });
  };

  return (
    <Sheet open={!!id && !!draft} onClose={close} label={t('Edit task')} className="max-w-2xl">
      {draft && (
        <div className="thin-scrollbar max-h-[86dvh] overflow-y-auto p-5 sm:p-6">
          <div className="flex items-start gap-2">
            <input
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              aria-label={t('Title')}
              className="min-w-0 flex-1 bg-transparent text-[24px] font-bold tracking-[-0.02em] placeholder:text-fg/30 focus-visible:outline-none"
              placeholder={t('Task name')}
            />
            <IconButton icon={X} label={t('Close')} onClick={close} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="brand" icon={Play} onClick={() => (close(), startFocus(draft.id, 25))}>{t('Focus')}</Button>
            <Button size="sm" variant="glass" icon={Timer} onClick={() => (close(), startFocus(draft.id, 2))}>{t('Just start · 2 min')}</Button>
            <Button
              size="sm"
              variant="glass"
              icon={Sparkles}
              onClick={() => {
                const steps = breakDownTask(draft.title).filter((s) => !draft.subtasks.some((x) => x.title === s));
                addSubtasks(steps);
                toast(t('Broken into small steps'));
              }}
            >
              {t('Break into steps')}
            </Button>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Field label={t('List')} className="sm:col-span-2">
              <Segmented
                label={t('List')}
                value={draft.status}
                onChange={(status) => patch({ status, ...(status === 'today' && !draft.due ? { due: todayKey() } : {}), ...(status === 'someday' || status === 'inbox' ? { start: undefined, end: undefined } : {}) })}
                options={[
                  { value: 'inbox', label: t('Inbox') },
                  { value: 'today', label: t('Today') },
                  { value: 'scheduled', label: t('Scheduled') },
                  { value: 'someday', label: t('Someday') },
                ]}
              />
            </Field>
            <Field label={t('Date')} htmlFor="task-date">
              <Input id="task-date" type="date" value={draft.due ?? ''} onChange={(e) => setWhen(e.target.value, toTimeInput(draft.start))} />
            </Field>
            <Field label={t('Time')} htmlFor="task-time" hint={draft.start ? t('Time-blocked on your timeline') : t('Optional — blocks time on your timeline')}>
              <Input id="task-time" type="time" value={toTimeInput(draft.start)} onChange={(e) => setWhen(draft.due ?? todayKey(), e.target.value)} />
            </Field>
            <Field label={t('Estimate')} htmlFor="task-est">
              <Select
                id="task-est"
                value={draft.estimate ?? ''}
                onChange={(e) => {
                  const estimate = e.target.value ? Number(e.target.value) : undefined;
                  patch({ estimate, ...(draft.start && estimate ? { end: draft.start + estimate * 60_000 } : {}) });
                }}
              >
                <option value="">{t('No estimate')}</option>
                {ESTIMATES.map((m) => (
                  <option key={m} value={m}>{m >= 60 ? `${m / 60} ${tNow('h')}` : `${m} ${tNow('min')}`}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('Goal')} htmlFor="task-goal">
              <Select id="task-goal" value={draft.goalId ?? ''} onChange={(e) => patch({ goalId: e.target.value || undefined })}>
                <option value="">{t('None')}</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('Priority')}>
              <div className="flex flex-wrap gap-1.5">
                {([0, 1, 2, 3] as Priority[]).map((p) => (
                  <Chip key={p} active={draft.priority === p} onClick={() => patch({ priority: p })}>
                    {p > 0 && <Flag size={12} className={draft.priority === p ? '' : PRIORITY_COLORS[p]} fill="currentColor" aria-hidden />}
                    {t(PRIORITY_LABELS[p])}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label={t('Energy needed')}>
              <div className="flex flex-wrap gap-1.5">
                {(['low', 'med', 'high'] as Energy[]).map((e) => (
                  <Chip key={e} active={draft.energy === e} tone={e === 'high' ? 'pink' : 'blue'} onClick={() => patch({ energy: draft.energy === e ? undefined : e })}>
                    <Zap size={12} aria-hidden />
                    {t(e === 'med' ? 'Medium' : e === 'high' ? 'High' : 'Low')}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label={t('Tags')} htmlFor="task-tags" hint={t('Separate with commas')} className="sm:col-span-2">
              <Input
                id="task-tags"
                value={tagText}
                placeholder="work, errands"
                onChange={(e) => setTagText(e.target.value)}
                onBlur={() => patch({ tags: [...new Set(tagText.split(',').map((s) => s.trim().replace(/^#/, '').toLowerCase()).filter(Boolean))] })}
              />
            </Field>
          </div>

          <section className="mt-6" aria-label={t('Steps')}>
            <h3 className="mb-2 px-1 text-[13px] font-semibold text-fg/60">
              {t('Steps')} {draft.subtasks.length > 0 && <span className="text-fg/60">· {draft.subtasks.filter((s) => s.done).length}/{draft.subtasks.length}</span>}
            </h3>
            <ul className="flex flex-col">
              <AnimatePresence initial={false}>
                {draft.subtasks.map((s) => (
                  <motion.li key={s.id} layout exit={{ opacity: 0, height: 0 }} transition={spring} className="group flex items-center gap-3 rounded-xl px-1 py-1.5">
                    <Checkbox size={20} checked={s.done} label={s.title} onChange={(done) => patch({ subtasks: draft.subtasks.map((x) => (x.id === s.id ? { ...x, done } : x)) })} />
                    <input
                      value={s.title}
                      aria-label={t('Step')}
                      onChange={(e) => patch({ subtasks: draft.subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)) })}
                      className={`min-w-0 flex-1 bg-transparent text-[15px] focus-visible:outline-none ${s.done ? 'text-fg/60 line-through' : ''}`}
                    />
                    <IconButton icon={X} size={28} label={t('Remove step')} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => patch({ subtasks: draft.subtasks.filter((x) => x.id !== s.id) })} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            <form
              className="mt-1 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newSub.trim()) addSubtasks([newSub.trim()]);
                setNewSub('');
              }}
            >
              <Plus size={18} className="ml-1 text-fg/60" aria-hidden />
              <input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder={t('Add a step')} aria-label={t('Add a step')} className="h-9 flex-1 bg-transparent text-[15px] placeholder:text-fg/35 focus-visible:outline-none" />
            </form>
          </section>

          <Field label={t('Notes')} htmlFor="task-notes" className="mt-6">
            <TextArea id="task-notes" value={draft.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} placeholder={t('Anything to remember')} />
          </Field>

          <div className="mt-6 flex items-center justify-between border-t border-fg/[0.06] pt-4">
            <p className="text-[12px] text-fg/60">
              {t('Created')} {new Date(draft.createdAt).toLocaleDateString(t.locale)}
              {draft.doneAt ? ` · ${t('Done')} ${new Date(draft.doneAt).toLocaleDateString(t.locale)}` : ''}
            </p>
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              className="text-[#E5484D] hover:text-[#E5484D]"
              onClick={async () => {
                if (await confirm({ title: t('Delete this task?'), body: `“${draft.title}”`, confirmLabel: t('Delete'), danger: true })) {
                  close();
                  await deleteTask(draft.id);
                  toast(t('Task deleted'));
                }
              }}
            >
              {t('Delete')}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

