import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarPlus, CornerDownLeft, Flag, Hash, ListPlus, Repeat, Timer } from 'lucide-react';
import { parseQuickAdd } from '@/lib/nlp';
import { quickAdd } from '@/lib/actions';
import { fmt, fmtTime, todayKey } from '@/lib/dates';
import { toast } from '@/ui/Toast';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';
import type { Task, TaskStatus } from '@/lib/types';
import { db } from '@/lib/db';

/**
 * One input for everything: "Lunch with Sam Friday 1pm for 1h" becomes an event,
 * "call bank tomorrow #errands !!" a task. Shows what it understood as you type.
 */
export function QuickAdd({ kind, status, placeholder, className, autoFocus }: { kind?: 'task' | 'event'; status?: TaskStatus; placeholder?: string; className?: string; autoFocus?: boolean }) {
  const t = useT();
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => (text.trim().length > 1 ? parseQuickAdd(text, new Date(), kind) : null), [text, kind]);

  const submit = async () => {
    if (!text.trim()) return;
    const { kind: k, record } = await quickAdd(text, kind);
    // Typed into a specific list with no date: file it there (e.g. "Someday").
    if (k === 'task' && status && !(record as Task).due) await db.tasks.update(record.id, { status, ...(status === 'today' ? { due: todayKey() } : {}) });
    toast(k === 'event' ? `${t('Event added')} · ${record.title}` : `${t('Task added')} · ${record.title}`);
    setText('');
    ref.current?.focus();
  };

  const chips: { icon: typeof Flag; text: string; tone?: string }[] = [];
  if (parsed) {
    if (parsed.start !== undefined) {
      const date = fmt(parsed.start, 'EEE d MMM');
      chips.push({ icon: CalendarPlus, text: parsed.hasTime ? `${date}, ${fmtTime(parsed.start)}${parsed.end && parsed.kind === 'event' ? `–${fmtTime(parsed.end)}` : ''}` : date });
    }
    if (parsed.estimate) chips.push({ icon: Timer, text: `${parsed.estimate} min` });
    if (parsed.rrule) chips.push({ icon: Repeat, text: t(parsed.rrule.byDay?.length === 5 ? 'Weekdays' : parsed.rrule.freq === 'daily' ? 'Daily' : parsed.rrule.freq === 'weekly' ? 'Weekly' : parsed.rrule.freq === 'monthly' ? 'Monthly' : 'Yearly') });
    if (parsed.priority) chips.push({ icon: Flag, text: t(['', 'Low', 'Medium', 'High'][parsed.priority]), tone: parsed.priority === 3 ? 'text-pink' : 'text-blue' });
    for (const tag of parsed.tags) chips.push({ icon: Hash, text: tag });
  }

  return (
    <div className={cn('rounded-[18px] bg-fg/[0.05] transition-colors focus-within:bg-fg/[0.07] focus-within:shadow-[0_0_0_2px_rgb(47_107_255/0.5)]', className)}>
      <form
        className="flex items-center gap-2.5 px-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {parsed?.kind === 'event' ? <CalendarPlus size={18} className="shrink-0 text-pink" aria-hidden /> : <ListPlus size={18} className="shrink-0 text-blue" aria-hidden />}
        <input
          ref={ref}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder ?? t('Add a task or event — “Lunch with Sam Friday 1pm”')}
          aria-label={t('Quick add')}
          className="h-12 min-w-0 flex-1 bg-transparent text-[15px] font-medium placeholder:font-normal placeholder:text-fg/40 focus-visible:outline-none"
        />
        {text && (
          <button type="submit" className="flex h-8 items-center gap-1.5 rounded-full bg-fg px-3 text-[13px] font-semibold text-bg">
            {t('Add')} <CornerDownLeft size={13} aria-hidden />
          </button>
        )}
      </form>
      <AnimatePresence initial={false}>
        {parsed && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-3">
              <span className={cn('rounded-full px-2.5 py-1 text-[12px] font-semibold', parsed.kind === 'event' ? 'bg-pink/15 text-pink' : 'bg-blue/15 text-blue')}>
                {parsed.kind === 'event' ? t('Event') : t('Task')}: {parsed.title}
              </span>
              {chips.map((c, i) => (
                <span key={i} className={cn('inline-flex items-center gap-1 rounded-full bg-fg/[0.06] px-2.5 py-1 text-[12px] font-medium text-fg/70', c.tone)}>
                  <c.icon size={12} aria-hidden />
                  {c.text}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
