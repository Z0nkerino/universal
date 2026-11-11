import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CalendarPlus, CornerDownLeft, Flag, Hash, ListPlus, Mic, MicOff, Repeat, Timer } from 'lucide-react';
import { applyAlternative, loadDateParsers, parseQuickAdd, useDateParsers, type Alternative, type QuickAdd as Parsed } from '@/lib/nlp';
import { createFromParsed } from '@/lib/actions';
import { fmt, fmtTime } from '@/lib/dates';
import { useSettings } from '@/lib/settings';
import { useSpeech } from '@/lib/speech';
import { REPEAT_PRESETS, describeRepeat } from '@/lib/repeatLabel';
import { toast } from '@/ui/Toast';
import { useT, tNow } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';
import type { Recurrence, TaskStatus } from '@/lib/types';

/** One-tap corrections the user made on top of what the parser guessed. */
interface Edits {
  kind?: 'task' | 'event';
  /** null = no repeat. */
  rrule?: Recurrence | null;
  priority?: 0 | 1 | 2 | 3;
  /** null = no duration. */
  estimate?: number | null;
  /** Alternatives picked, applied in order. */
  picks?: Alternative[];
}

function withEdits(p: Parsed, e: Edits): Parsed {
  let q: Parsed = { ...p };
  for (const alt of e.picks ?? []) {
    const match = q.alternatives.find((a) => a.reason === alt.reason);
    if (match) q = applyAlternative(q, match);
  }
  if (e.kind) q.kind = e.kind;
  if (e.rrule !== undefined) q.rrule = e.rrule ?? undefined;
  if (e.priority !== undefined) q.priority = e.priority;
  if (e.estimate !== undefined) q.estimate = e.estimate ?? undefined;
  // An event needs a time slot; a dated event without one is all-day.
  if (q.kind === 'event' && q.start !== undefined && q.end === undefined) q.end = q.hasTime ? q.start + (q.estimate ?? 60) * 60_000 : q.start + 86_400_000;
  return q;
}

const ESTIMATES = [null, 15, 30, 45, 60, 90];
/** A meridiem or evening guess differs by time; "next Friday" by date. */
const altLabel = (a: Alternative, hasTime: boolean) =>
  a.start !== undefined
    ? a.reason === 'next-weekday'
      ? `${fmt(a.start, 'EEE d MMM')}${hasTime ? `, ${fmtTime(a.start)}` : ''}`
      : hasTime
        ? fmtTime(a.start)
        : fmt(a.start, 'EEE d MMM')
    : a.due
      ? fmt(new Date(`${a.due}T00:00`), 'EEE d MMM')
      : '';

/** The text with the parts the parser understood wrapped in gradient highlights. */
function Highlighted({ text, parsed }: { text: string; parsed: Parsed | null }) {
  if (!parsed?.spans.length) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const s of parsed.spans) {
    if (s.start < at || s.end > text.length) continue;
    out.push(text.slice(at, s.start));
    out.push(
      <mark key={s.start} className="qa-mark" data-kind={s.kind}>
        {text.slice(s.start, s.end)}
      </mark>,
    );
    at = s.end;
  }
  out.push(text.slice(at));
  return <>{out}</>;
}

/**
 * One input for everything: "Gym tomorrow 7pm", "Call mom every Sunday at 6", "Pay rent on the
 * 1st of every month". Highlights what it understood as you type, previews the result, and lets
 * you fix a guess with one tap. Saving is never blocked: anything unclear stays in the title.
 */
export function QuickAdd({ kind, status, placeholder, className, autoFocus, large, onSaved }: { kind?: 'task' | 'event'; status?: TaskStatus; placeholder?: string; className?: string; autoFocus?: boolean; large?: boolean; onSaved?: () => void }) {
  const t = useT();
  const eventMinutes = useSettings((s) => s.eventMinutes);
  const [text, setText] = useState('');
  const [edits, setEdits] = useState<Edits>({});
  const input = useRef<HTMLInputElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  // Date parsing loads once the user starts typing, keeping it off the startup path.
  const datesReady = useDateParsers(text.length > 0);
  const parsed = useMemo(() => (text.trim().length > 1 ? parseQuickAdd(text, new Date(), kind, eventMinutes) : null), [text, kind, eventMinutes, datesReady]);
  const result = parsed ? withEdits(parsed, edits) : null;

  // Corrections belong to the phrase they were made for.
  useEffect(() => setEdits({}), [text]);
  // Keep the highlight layer scrolled with the input.
  const sync = () => requestAnimationFrame(() => mirror.current && input.current && (mirror.current.scrollLeft = input.current.scrollLeft));
  useEffect(() => void sync(), [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const speech = useSpeech({
    lang: t.lang,
    onText: setText,
    onDone: (heard) => {
      if (heard) setText(heard);
      input.current?.focus();
    },
    onError: (e) => toast(e === 'denied' ? t('Microphone access was blocked.') : t('Voice input isn’t available here.'), { tone: 'error' }),
  });

  const submit = async () => {
    if (!text.trim()) return;
    let q = result;
    // Dates load in the background; if Enter came first, read the phrase again with them.
    if (!datesReady || !q) {
      await loadDateParsers();
      q = withEdits(parseQuickAdd(text, new Date(), kind, eventMinutes), edits);
    }
    const record = await createFromParsed(q, status);
    toast(q.kind === 'event' && q.start !== undefined ? `${t('Event added')} · ${record.title}` : `${t('Task added')} · ${record.title}`);
    setText('');
    input.current?.focus();
    onSaved?.();
  };

  const field = cn('w-full whitespace-pre bg-transparent font-medium', large ? 'h-14 text-[18px] leading-[56px]' : 'h-12 text-[15px] leading-[48px]');
  const chip = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors';
  const isEvent = result?.kind === 'event' && result.start !== undefined;

  return (
    <div className={cn('rounded-[18px] bg-fg/[0.05] transition-colors focus-within:bg-fg/[0.07] focus-within:shadow-[0_0_0_2px_rgb(var(--blue-rgb)/0.5)]', className)}>
      <form
        className="flex items-center gap-2.5 px-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {isEvent ? <CalendarPlus size={18} className="shrink-0 text-pink" aria-hidden /> : <ListPlus size={18} className="shrink-0 text-blue" aria-hidden />}
        <div className="relative min-w-0 flex-1">
          <div ref={mirror} aria-hidden className={cn(field, 'pointer-events-none absolute inset-0 overflow-hidden text-fg')}>
            <Highlighted text={text} parsed={parsed} />
          </div>
          <input
            ref={input}
            autoFocus={autoFocus}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onScroll={sync}
            onKeyUp={sync}
            onSelect={sync}
            placeholder={speech.listening ? t('Listening…') : (placeholder ?? t('Add a task — “Gym tomorrow 7pm”, “Call mom every Sunday at 6”'))}
            aria-label={t('Quick add')}
            aria-describedby={result ? 'qa-preview' : undefined}
            autoComplete="off"
            spellCheck={false}
            className={cn(field, 'relative text-transparent caret-[rgb(var(--fg))] placeholder:font-normal placeholder:text-fg/40 focus-visible:outline-none selection:bg-blue/25 selection:text-transparent')}
          />
        </div>
        {speech.supported && (
          <button
            type="button"
            onClick={speech.toggle}
            aria-label={speech.listening ? t('Stop listening') : t('Speak')}
            className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors', speech.listening ? 'bg-pink/15 text-pink' : 'text-fg/60 hover:bg-fg/[0.06]')}
          >
            {speech.listening ? <MicOff size={16} aria-hidden /> : <Mic size={16} aria-hidden />}
          </button>
        )}
        {text && (
          <button type="submit" className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-fg px-3 text-[13px] font-semibold text-bg">
            {t('Add')} <CornerDownLeft size={13} aria-hidden />
          </button>
        )}
      </form>
      <AnimatePresence initial={false}>
        {result && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
            <div id="qa-preview" aria-live="polite" className="flex flex-col gap-2 px-3.5 pb-3">
              {/* Preview of what will be saved. */}
              <p className="truncate text-[14px] font-semibold">
                <span className="text-spark">{isEvent ? t('Event') : t('Task')}</span> · {result.title}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  title={t('Switch between task and event')}
                  onClick={() => setEdits((e) => ({ ...e, kind: result.kind === 'event' ? 'task' : 'event' }))}
                  className={cn(chip, isEvent ? 'bg-pink/15 text-pink' : 'bg-blue/15 text-blue')}
                >
                  {isEvent ? <CalendarPlus size={12} aria-hidden /> : <ListPlus size={12} aria-hidden />}
                  {isEvent ? t('Event') : t('Task')}
                </button>
                {result.start !== undefined && (
                  <span className={cn(chip, 'bg-fg/[0.06] text-fg/75')}>
                    <CalendarPlus size={12} aria-hidden />
                    {fmt(result.start, 'EEE d MMM')}
                    {result.hasTime && `, ${fmtTime(result.start)}${isEvent && result.end ? `–${fmtTime(result.end)}` : ''}`}
                  </span>
                )}
                {result.alternatives.map((a) => (
                  <button key={a.reason} type="button" onClick={() => setEdits((e) => ({ ...e, picks: [...(e.picks ?? []), a] }))} className={cn(chip, 'bg-fg/[0.03] text-fg/60 ring-1 ring-inset ring-fg/10 hover:bg-fg/[0.06] hover:text-fg')}>
                    {t('or')} {altLabel(a, result.hasTime)}?
                  </button>
                ))}
                <button
                  type="button"
                  title={t('Change repeat')}
                  onClick={() => {
                    const order = REPEAT_PRESETS.map((p) => p.rule ?? null);
                    const i = order.findIndex((r) => (r ? JSON.stringify(r) === JSON.stringify(result.rrule) : !result.rrule));
                    setEdits((e) => ({ ...e, rrule: order[(i + 1) % order.length] }));
                  }}
                  className={cn(chip, result.rrule ? 'bg-fg/[0.06] text-fg/75' : 'bg-transparent text-fg/45 hover:text-fg/70')}
                >
                  <Repeat size={12} aria-hidden />
                  {result.rrule ? describeRepeat(result.rrule, t.lang, result.start) : t('Repeat')}
                </button>
                <button
                  type="button"
                  title={t('Change priority')}
                  onClick={() => setEdits((e) => ({ ...e, priority: ((result.priority + 1) % 4) as 0 | 1 | 2 | 3 }))}
                  className={cn(chip, result.priority === 3 ? 'bg-pink/15 text-pink' : result.priority ? 'bg-fg/[0.06] text-fg/75' : 'bg-transparent text-fg/45 hover:text-fg/70')}
                >
                  <Flag size={12} aria-hidden />
                  {t(['Priority', 'Low', 'Medium', 'High'][result.priority])}
                </button>
                <button
                  type="button"
                  title={t('Change duration')}
                  onClick={() => {
                    const i = ESTIMATES.indexOf(result.estimate ?? null);
                    setEdits((e) => ({ ...e, estimate: ESTIMATES[(i + 1) % ESTIMATES.length] }));
                  }}
                  className={cn(chip, result.estimate ? 'bg-fg/[0.06] text-fg/75' : 'bg-transparent text-fg/45 hover:text-fg/70')}
                >
                  <Timer size={12} aria-hidden />
                  {result.estimate ? (result.estimate >= 60 ? `${result.estimate / 60} ${tNow('h')}` : `${result.estimate} ${tNow('min')}`) : t('Duration')}
                </button>
                {result.tags.map((tag) => (
                  <span key={tag} className={cn(chip, 'bg-fg/[0.06] text-fg/70')}>
                    <Hash size={12} aria-hidden />
                    {tag}
                  </span>
                ))}
              </div>
              {result.past && (
                <p className="flex items-center gap-1.5 text-[12px] text-fg/60">
                  <AlertCircle size={13} aria-hidden /> {t('That time has already passed today — it’ll be saved as you typed it.')}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
