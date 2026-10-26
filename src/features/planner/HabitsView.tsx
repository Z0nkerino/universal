import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { addDays, isToday } from 'date-fns';
import { Flame, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { db } from '@/lib/db';
import { createHabit, deleteHabit, toggleHabit } from '@/lib/actions';
import type { Habit } from '@/lib/types';
import { dayKey, fmt, weekStart } from '@/lib/dates';
import { useSettings } from '@/lib/settings';
import { TiltCard } from '@/ui/TiltCard';
import { Button, IconButton } from '@/ui/Button';
import { Rings, RING_PRESETS } from '@/ui/Rings';
import { Sheet } from '@/ui/Sheet';
import { Field, Input, Select } from '@/ui/Field';
import { EmptyState } from '@/ui/EmptyState';
import { confirm } from '@/ui/Confirm';
import { toast } from '@/ui/Toast';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { itemVariants, spring, springSnappy } from '@/lib/motion';
import { consistency, currentStreak, periodProgress } from './habits';

const EMOJI = ['📖', '🏃', '🧘', '💧', '🥗', '😴', '✍️', '🎸', '🧹', '💊', '🌙', '🚶', '🏋️', '🇪🇸', '📵', '🙏'];

export function useHabitsData() {
  const habits = useLiveQuery(() => db.habits.orderBy('order').filter((h) => !h.archived).toArray(), []) ?? [];
  const logs = useLiveQuery(() => db.habitLogs.where('date').aboveOrEqual(dayKey(addDays(new Date(), -400))).toArray(), []) ?? [];
  const byHabit = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of logs) {
      if (!m.has(l.habitId)) m.set(l.habitId, new Set());
      m.get(l.habitId)!.add(l.date);
    }
    return m;
  }, [logs]);
  return { habits, logsFor: (id: string) => byHabit.get(id) ?? new Set<string>() };
}

export function habitTargetLabel(h: Habit, t: (s: string) => string) {
  if (h.period === 'day') return t('Every day');
  return `${h.target}× ${t('a week')}`;
}

function HabitEditor({ habit, open, onClose }: { habit?: Habit; open: boolean; onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState(habit?.name ?? '');
  const [emoji, setEmoji] = useState(habit?.emoji ?? '📖');
  const [period, setPeriod] = useState<Habit['period']>(habit?.period ?? 'day');
  const [target, setTarget] = useState(habit?.target ?? 1);
  return (
    <Sheet open={open} onClose={onClose} label={habit ? t('Edit habit') : t('New habit')} className="max-w-md">
      <form
        className="p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const fields = { name: name.trim(), emoji, period, target: period === 'day' ? 1 : target };
          if (habit) await db.habits.update(habit.id, { ...fields, updatedAt: Date.now() });
          else await createHabit(fields);
          toast(habit ? t('Habit updated') : `${t('Habit added')} · ${fields.name}`);
          onClose();
        }}
      >
        <h2 className="text-[20px] font-bold tracking-[-0.02em]">{habit ? t('Edit habit') : t('New habit')}</h2>
        <div className="mt-5 flex flex-col gap-4">
          <Field label={t('Name')} htmlFor="habit-name">
            <Input id="habit-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Read 20 minutes')} />
          </Field>
          <Field label={t('Icon')}>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('Icon')}>
              {EMOJI.map((em) => (
                <button key={em} type="button" role="radio" aria-checked={emoji === em} onClick={() => setEmoji(em)} className={cn('flex h-10 w-10 items-center justify-center rounded-xl text-[20px] transition-colors', emoji === em ? 'bg-brand-soft ring-2 ring-blue' : 'bg-fg/[0.05] hover:bg-fg/[0.09]')}>
                  {em}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('How often')} htmlFor="habit-period">
              <Select id="habit-period" value={period} onChange={(e) => setPeriod(e.target.value as Habit['period'])}>
                <option value="day">{t('Every day')}</option>
                <option value="week">{t('Times per week')}</option>
              </Select>
            </Field>
            {period === 'week' && (
              <Field label={t('Times')} htmlFor="habit-target">
                <Select id="habit-target" value={target} onChange={(e) => setTarget(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n}× {t('a week')}</option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" disabled={!name.trim()}>{habit ? t('Save') : t('Add habit')}</Button>
        </div>
      </form>
    </Sheet>
  );
}

function HabitCard({ habit, logs }: { habit: Habit; logs: Set<string> }) {
  const t = useT();
  const ws = useSettings((s) => s.weekStart);
  const [editing, setEditing] = useState(false);
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(today), i));
  const streak = currentStreak(habit, logs, today, ws);
  const cons = consistency(habit, logs, today, ws);
  const progress = periodProgress(habit, logs, today, ws);
  const preset = habit.color === 'pink' ? RING_PRESETS.pink : RING_PRESETS.blue;

  return (
    <motion.li variants={itemVariants} layout exit={{ opacity: 0, scale: 0.95 }}>
      <TiltCard max={3} className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <div className="relative flex h-14 w-14 items-center justify-center">
            <Rings size={56} stroke={6} rings={[{ value: Math.min(progress, 1), ...preset, label: habit.name }]} />
            <span className="absolute text-[22px]" aria-hidden>{habit.emoji}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[17px] font-bold tracking-[-0.01em]">{habit.name}</h3>
            <p className="flex items-center gap-1 text-[13px] text-fg/60">
              <Repeat size={12} aria-hidden /> {habitTargetLabel(habit, t)}
            </p>
          </div>
          <IconButton icon={Pencil} label={t('Edit habit')} size={34} onClick={() => setEditing(true)} />
          <IconButton
            icon={Trash2}
            label={t('Delete habit')}
            size={34}
            onClick={async () => {
              if (await confirm({ title: t('Delete this habit?'), body: t('Its history will be deleted too.'), confirmLabel: t('Delete'), danger: true })) {
                await deleteHabit(habit.id);
                toast(t('Habit deleted'));
              }
            }}
          />
        </div>
        <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={t('This week')}>
          {days.map((d) => {
            const k = dayKey(d);
            const on = logs.has(k);
            const future = d > today && !isToday(d);
            return (
              <motion.button
                key={k}
                type="button"
                disabled={future}
                whileTap={{ scale: 0.88 }}
                transition={springSnappy}
                aria-pressed={on}
                aria-label={`${fmt(d, 'EEEE')}: ${on ? t('done') : t('not done')}`}
                onClick={async () => {
                  const nowOn = await toggleHabit(habit.id, k);
                  if (nowOn && isToday(d)) navigator.vibrate?.(10);
                }}
                className={cn('flex flex-col items-center gap-1 rounded-[14px] py-2 text-[11px] font-semibold transition-colors', future ? 'opacity-30' : 'hover:bg-fg/[0.05]', isToday(d) && 'bg-fg/[0.04]')}
              >
                <span className={cn('uppercase', isToday(d) ? 'text-fg' : 'text-fg/60')}>{fmt(d, 'EEEEE')}</span>
                <motion.span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[13px] text-white"
                  animate={{ background: on ? (habit.color === 'pink' ? '#FF4FA3' : '#2F6BFF') : 'rgba(127,127,127,0.14)', scale: on ? [1, 1.15, 1] : 1 }}
                  transition={{ duration: 0.3 }}
                >
                  {on ? '✓' : ''}
                </motion.span>
              </motion.button>
            );
          })}
        </div>
        <div className="flex items-center gap-4 text-[13px] font-medium text-fg/60">
          <span className="flex items-center gap-1">
            <Flame size={14} className={streak ? 'text-pink' : 'text-fg/30'} aria-hidden />
            <strong className="text-fg">{streak}</strong> {habit.period === 'day' ? t('day streak') : t('week streak')}
          </span>
          <span>
            <strong className="text-fg">{Math.round(cons * 100)}%</strong> {t('consistent (4 weeks)')}
          </span>
        </div>
      </TiltCard>
      <HabitEditor key={editing ? 'open' : 'closed'} habit={habit} open={editing} onClose={() => setEditing(false)} />
    </motion.li>
  );
}

export function HabitsView() {
  const t = useT();
  const { habits, logsFor } = useHabitsData();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[15px] text-fg/60">{t('Small things, done often. Flexible targets like 3× a week still count.')}</p>
        <Button icon={Plus} onClick={() => setAdding(true)}>{t('New habit')}</Button>
      </div>
      {habits.length === 0 ? (
        <TiltCard className="p-6">
          <EmptyState icon={Repeat} title={t('No habits yet')} body={t('Start with one tiny habit you can do even on a bad day.')} action={<Button variant="brand" icon={Plus} onClick={() => setAdding(true)}>{t('Add your first habit')}</Button>} />
        </TiltCard>
      ) : (
        <motion.ul className="grid gap-4 md:grid-cols-2" initial="initial" animate="enter" variants={{ enter: { transition: { staggerChildren: 0.05 } } }} transition={spring}>
          <AnimatePresence>{habits.map((h) => <HabitCard key={h.id} habit={h} logs={logsFor(h.id)} />)}</AnimatePresence>
        </motion.ul>
      )}
      <HabitEditor key={adding ? 'add-open' : 'add-closed'} open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
