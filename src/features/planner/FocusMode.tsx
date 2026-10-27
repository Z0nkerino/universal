import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/lib/settings';
import { AnimatePresence, motion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { CloudRain, Coffee, Minus, Pause, Play, Plus, Volume2, VolumeX, Waves, Wind, X } from 'lucide-react';
import { db } from '@/lib/db';
import { logFocus, setTaskDone, updateTask } from '@/lib/actions';
import { useFocusMode } from './store';
import { playAmbient, stopAmbient, chime, type Ambient } from './ambient';
import { Button, IconButton } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { toast } from '@/ui/Toast';
import { useT } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/hooks';
import { cn } from '@/lib/cn';

type Phase = 'focus' | 'break' | 'done';

const pad = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0');

/** Full-screen, one-task focus timer. Each opening gets a fresh session. */
export function FocusMode() {
  const { open, taskId, minutes, close } = useFocusMode();
  const [session, setSession] = useState(0);
  useEffect(() => {
    if (open) setSession((n) => n + 1);
  }, [open, taskId, minutes]);
  return <AnimatePresence>{open && <FocusSession key={session} taskId={taskId} initialMin={minutes} close={close} />}</AnimatePresence>;
}

/** Timing is timestamp-based, so it stays correct even if the tab sleeps. */
function FocusSession({ taskId, initialMin, close }: { taskId?: string; initialMin: number; close: () => void }) {
  const t = useT();
  const focusMin = useSettings((s) => s.focusMin);
  const breakMin = useSettings((s) => s.breakMin);
  const task = useLiveQuery(() => (taskId ? db.tasks.get(taskId) : undefined), [taskId]);
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('focus');
  const [total, setTotal] = useState(initialMin * 60_000);
  const [endsAt, setEndsAt] = useState(() => Date.now() + initialMin * 60_000);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [ambient, setAmbient] = useState<Ambient>('off');
  const focusedMs = useRef(0);
  const runningSince = useRef<number | null>(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const left = pausedLeft ?? Math.max(0, endsAt - now);
  const progress = 1 - left / total;

  const accumulate = () => {
    if (phase === 'focus' && runningSince.current) focusedMs.current += Date.now() - runningSince.current;
    runningSince.current = null;
  };

  // Timer reached zero.
  useEffect(() => {
    if (pausedLeft !== null || phase === 'done' || left > 0) return;
    accumulate();
    void chime();
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) new Notification(phase === 'focus' ? t('Focus session complete') : t('Break’s over'), { body: task?.title, silent: true });
    if (phase === 'focus') setPhase('done');
    else {
      setPhase('focus');
      setTotal(focusMin * 60_000);
      setEndsAt(Date.now() + focusMin * 60_000);
      runningSince.current = Date.now();
    }
  }, [left, pausedLeft, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void playAmbient(ambient);
    return () => stopAmbient();
  }, [ambient]);

  const finish = async (markDone: boolean) => {
    accumulate();
    const mins = focusedMs.current / 60_000;
    if (mins >= 1) await logFocus(taskId, Date.now() - focusedMs.current, Date.now());
    if (markDone && taskId) await setTaskDone(taskId, true);
    stopAmbient();
    setAmbient('off');
    close();
    if (mins >= 1) toast(`${t('Focused for')} ${Math.round(mins)} ${t('min')}${markDone ? ` · ${t('task done')}` : ''}`);
  };

  const startPhase = (p: 'focus' | 'break', min: number) => {
    accumulate();
    setPhase(p);
    setTotal(min * 60_000);
    setEndsAt(Date.now() + min * 60_000);
    setPausedLeft(null);
    if (p === 'focus') runningSince.current = Date.now();
  };

  const togglePause = () => {
    if (pausedLeft !== null) {
      setEndsAt(Date.now() + pausedLeft);
      setPausedLeft(null);
      if (phase === 'focus') runningSince.current = Date.now();
    } else {
      accumulate();
      setPausedLeft(left);
    }
  };

  const adjust = (deltaMin: number) => {
    const d = deltaMin * 60_000;
    if (left + d < 60_000) return;
    setTotal((x) => x + d);
    if (pausedLeft !== null) setPausedLeft(pausedLeft + d);
    else setEndsAt((x) => x + d);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void finish(false);
      if (e.key === ' ' && !(e.target as HTMLElement).closest('button,input')) {
        e.preventDefault();
        togglePause();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const nextStep = task?.subtasks.find((s) => !s.done);
  const R = 132;
  const C = 2 * Math.PI * R;

  return (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={t('Focus mode')}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-bg px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Slow breathing backdrop. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[120vmax] w-[120vmax] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl"
            style={{ background: phase === 'break' ? 'radial-gradient(circle, rgb(var(--pink-rgb) / .35), transparent 60%)' : 'radial-gradient(circle, rgb(var(--blue-rgb) / .35), transparent 60%)' }}
            animate={reduced ? undefined : { scale: [1, 1.08, 1] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <IconButton icon={X} label={t('End focus')} className="absolute right-4 top-[max(16px,env(safe-area-inset-top))]" onClick={() => void finish(false)} />

          <p className="relative text-[13px] font-semibold uppercase tracking-[0.12em] text-fg/60">
            {phase === 'break' ? t('Break') : phase === 'done' ? t('Session complete') : initialMin <= 2 && total <= 2 * 60_000 ? t('Just two minutes') : t('Focus')}
          </p>
          <h2 className="relative mt-2 max-w-[22ch] text-center text-[26px] font-bold leading-tight tracking-[-0.02em] sm:text-[32px]">{task?.title ?? t('Deep work')}</h2>
          {nextStep && phase !== 'done' && (
            <div className="relative mt-4 flex items-center gap-2.5 rounded-full bg-fg/[0.05] py-1.5 pl-2 pr-4">
              <Checkbox size={22} checked={false} label={nextStep.title} onChange={() => void updateTask(task!.id, { subtasks: task!.subtasks.map((s) => (s.id === nextStep.id ? { ...s, done: true } : s)) })} />
              <span className="text-[14px] font-medium">{t('Next step')}: {nextStep.title}</span>
            </div>
          )}

          <div className="relative my-8 flex items-center justify-center sm:my-10">
            <svg width={300} height={300} viewBox="0 0 300 300" className="max-w-[72vw]" aria-hidden>
              <defs>
                <linearGradient id="focus-g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" style={{ stopColor: 'var(--blue)' }} />
                  <stop offset="1" style={{ stopColor: 'var(--pink)' }} />
                </linearGradient>
              </defs>
              <circle cx={150} cy={150} r={R} fill="none" stroke="rgb(var(--fg) / 0.07)" strokeWidth={10} />
              <circle
                cx={150}
                cy={150}
                r={R}
                fill="none"
                stroke="url(#focus-g)"
                strokeWidth={10}
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (phase === 'done' ? 0 : progress)}
                transform="rotate(-90 150 150)"
                style={{ transition: 'stroke-dashoffset 0.3s linear' }}
              />
            </svg>
            <div className="absolute flex flex-col items-center" aria-live="off">
              {phase === 'done' ? (
                <span className="text-[44px] font-bold tracking-[-0.03em]">🎉</span>
              ) : (
                <span className="text-[64px] font-bold tabular-nums tracking-[-0.04em]" role="timer" aria-label={`${Math.ceil(left / 60_000)} ${t('minutes left')}`}>
                  {pad(left / 60_000)}:{pad((left % 60_000) / 1000)}
                </span>
              )}
              {pausedLeft !== null && <span className="text-[13px] font-semibold text-fg/60">{t('Paused')}</span>}
            </div>
          </div>

          {phase === 'done' ? (
            <div className="relative flex flex-col items-center gap-3">
              <p className="text-[16px] text-fg/60">{total <= 2 * 60_000 ? t('You started — that’s the hardest part. Keep going?') : t('Nice work. Take a breather?')}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {total <= 2 * 60_000 ? (
                  <Button variant="brand" icon={Play} onClick={() => startPhase('focus', focusMin)}>{`${t('Keep going')} · ${focusMin} ${t('min')}`}</Button>
                ) : (
                  <Button variant="brand" icon={Coffee} onClick={() => startPhase('break', breakMin)}>{`${t('Break')} · ${breakMin} ${t('min')}`}</Button>
                )}
                <Button variant="glass" icon={Play} onClick={() => startPhase('focus', focusMin)}>{t('Another round')}</Button>
                {taskId && <Button variant="glass" onClick={() => void finish(true)}>{t('Mark task done')}</Button>}
                <Button variant="ghost" onClick={() => void finish(false)}>{t('Finish')}</Button>
              </div>
            </div>
          ) : (
            <div className="relative flex items-center gap-3">
              <IconButton icon={Minus} label={t('5 minutes less')} size={48} className="bg-fg/[0.05]" onClick={() => adjust(-5)} />
              <motion.button
                type="button"
                autoFocus
                whileTap={{ scale: 0.92 }}
                onClick={togglePause}
                aria-label={pausedLeft !== null ? t('Resume') : t('Pause')}
                className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-fg text-bg shadow-lg"
              >
                {pausedLeft !== null ? <Play size={28} fill="currentColor" /> : <Pause size={28} fill="currentColor" />}
              </motion.button>
              <IconButton icon={Plus} label={t('5 minutes more')} size={48} className="bg-fg/[0.05]" onClick={() => adjust(5)} />
            </div>
          )}

          <div className="relative mt-10 flex items-center gap-1 rounded-full bg-fg/[0.05] p-1" role="radiogroup" aria-label={t('Ambient sound')}>
            {(
              [
                ['off', VolumeX, 'Silence'],
                ['rain', CloudRain, 'Rain'],
                ['brown', Wind, 'Brown noise'],
                ['waves', Waves, 'Waves'],
              ] as const
            ).map(([k, Icon, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={ambient === k}
                title={t(label)}
                onClick={() => setAmbient(k)}
                className={cn('flex h-10 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold transition-colors', ambient === k ? 'bg-fg text-bg' : 'text-fg/60 hover:text-fg')}
              >
                <Icon size={16} aria-hidden />
                <span className="hidden sm:inline">{t(label)}</span>
              </button>
            ))}
            {ambient !== 'off' && <Volume2 size={14} className="mx-2 text-fg/60" aria-hidden />}
          </div>
          <p className="relative mt-4 text-[12px] text-fg/60">{t('Space to pause · Esc to end')}</p>
        </motion.div>
  );
}
