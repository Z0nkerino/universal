import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, BarChart3, CalendarDays, Check, HeartPulse, Lightbulb, NotebookPen, Sparkles, type LucideIcon } from 'lucide-react';
import { db, setKV } from '@/lib/db';
import { createGoal } from '@/lib/actions';
import { seedDemoData } from '@/lib/demo';
import { useSettings } from '@/lib/settings';
import { useT } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/hooks';
import { Button } from '@/ui/Button';
import { Segmented, Switch } from '@/ui/Segmented';
import { AppIcon, EternalMark } from '@/ui/Logo';
import { AfinaOrb } from '@/features/afina/AfinaOrb';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';

const FEATURES: { id: string; icon: LucideIcon; title: string; body: string }[] = [
  { id: 'calendar', icon: CalendarDays, title: 'Calendar', body: 'Events, repeats, reminders, .ics import' },
  { id: 'notes', icon: NotebookPen, title: 'Notes', body: 'Rich notes with [[links]] and search' },
  { id: 'ideas', icon: Lightbulb, title: 'Ideas', body: 'Canvas and board for raw thoughts' },
  { id: 'health', icon: HeartPulse, title: 'Health', body: 'Food, water, sleep, weight and mood' },
  { id: 'insights', icon: BarChart3, title: 'Insights', body: 'Real patterns from your own data' },
];

/** Five drops of liquid glass drift in and merge into Afina's orb. */
function FormingOrb() {
  const reduced = useReducedMotion();
  const drops = [
    { x: -150, y: -90, s: 46, c: 'rgb(47 107 255 / .55)' },
    { x: 160, y: -60, s: 38, c: 'rgb(255 79 163 / .55)' },
    { x: -120, y: 110, s: 34, c: 'rgb(143 91 255 / .5)' },
    { x: 130, y: 120, s: 42, c: 'rgb(47 107 255 / .45)' },
    { x: 0, y: -160, s: 30, c: 'rgb(255 79 163 / .45)' },
  ];
  return (
    <div className="relative flex h-[260px] w-[260px] items-center justify-center">
      {!reduced &&
        drops.map((d, i) => (
          <motion.span
            key={i}
            className="glass absolute rounded-full"
            style={{ width: d.s, height: d.s, background: d.c }}
            initial={{ x: d.x, y: d.y, scale: 1, opacity: 0 }}
            animate={{ x: 0, y: 0, scale: [1, 1.2, 0.2], opacity: [0, 1, 0] }}
            transition={{ duration: 1.6, delay: 0.15 * i, ease: [0.3, 0.7, 0.2, 1] }}
          />
        ))}
      <motion.div initial={{ scale: reduced ? 1 : 0.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring, delay: reduced ? 0 : 1.1 }}>
        <AfinaOrb size={220} />
      </motion.div>
    </div>
  );
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const t = useT();
  const s = useSettings();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [features, setFeatures] = useState<string[]>(s.features);
  const [goal, setGoal] = useState('');
  const [sample, setSample] = useState(true);
  const [busy, setBusy] = useState(false);

  const finish = async (withSample: boolean) => {
    setBusy(true);
    s.set({ features });
    if (goal.trim()) await createGoal({ title: goal.trim() });
    if (withSample && (await db.tasks.count()) === 0) await seedDemoData();
    await setKV('onboarded', Date.now());
    onDone();
  };
  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
  };

  const screens = [
    // 1. Welcome
    <div key="w" className="flex flex-col items-center text-center">
      <FormingOrb />
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 1.3 }} className="flex flex-col items-center">
        <AppIcon size={56} className="mt-2" />
        <h1 className="mt-4 text-[34px] font-bold leading-tight tracking-[-0.035em] sm:text-[44px]">Universal Planner</h1>
        <p className="mt-2 max-w-[34ch] text-[17px] text-fg/60">{t('Your calendar, tasks, notes, ideas and health — in one calm place. Everything stays on this device.')}</p>
        <div className="mt-5">
          <Segmented label={t('Language')} value={s.language} onChange={(language) => s.set({ language })} options={[{ value: 'auto', label: 'Auto' }, { value: 'en', label: 'English' }, { value: 'ru', label: 'Русский' }]} />
        </div>
        <p className="mt-6 flex items-center gap-1.5 text-[12px] text-fg/45"><EternalMark size={14} className="text-fg/70" /> {t('A product of Eternal Inc.')}</p>
      </motion.div>
    </div>,
    // 2. Pick features
    <div key="f" className="w-full">
      <h2 className="text-center text-[28px] font-bold tracking-[-0.03em]">{t('What do you want to use?')}</h2>
      <p className="mt-1 text-center text-[15px] text-fg/55">{t('Today and Afina are always there. You can change this later in Settings.')}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((f, i) => {
          const on = features.includes(f.id);
          return (
            <motion.button
              key={f.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: i * 0.05 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setFeatures((x) => (on ? x.filter((y) => y !== f.id) : [...x, f.id]))}
              className={cn('glass flex items-center gap-3 rounded-[20px] p-4 text-left transition-shadow', on && 'ring-2 ring-blue')}
            >
              <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]', on ? 'bg-brand text-white' : 'bg-fg/[0.06] text-fg/50')}>
                <f.icon size={20} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold">{t(f.title)}</span>
                <span className="block text-[13px] text-fg/55">{t(f.body)}</span>
              </span>
              <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full', on ? 'bg-blue text-white' : 'ring-2 ring-fg/15')}>{on && <Check size={14} strokeWidth={3} />}</span>
            </motion.button>
          );
        })}
      </div>
    </div>,
    // 3. Goals & targets
    <div key="g" className="w-full">
      <h2 className="text-center text-[28px] font-bold tracking-[-0.03em]">{t('A few targets')}</h2>
      <p className="mt-1 text-center text-[15px] text-fg/55">{t('Rough is fine — Insights will show you how it really goes.')}</p>
      <div className="glass mt-6 flex flex-col divide-y divide-fg/[0.06] rounded-[24px]">
        <label className="flex flex-col gap-1.5 p-4">
          <span className="text-[15px] font-semibold">{t('One goal you’re working toward')} <span className="font-normal text-fg/45">({t('optional')})</span></span>
          <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={t('Run a 10K, launch my site, learn Spanish…')} className="h-11 rounded-[14px] bg-fg/[0.05] px-3.5 text-[15px] focus:shadow-[0_0_0_2px_rgb(47_107_255/0.5)] focus-visible:outline-none" />
        </label>
        <div className="flex items-center justify-between gap-3 p-4">
          <span className="text-[15px] font-semibold">{t('Plan my days between')}</span>
          <span className="flex items-center gap-2">
            <select aria-label={t('Day starts')} value={s.dayStartH} onChange={(e) => s.set({ dayStartH: Number(e.target.value) })} className="h-9 rounded-xl bg-fg/[0.06] px-2 font-semibold">{Array.from({ length: 13 }, (_, h) => h + 5).map((h) => <option key={h} value={h}>{h}:00</option>)}</select>
            –
            <select aria-label={t('Day ends')} value={s.dayEndH} onChange={(e) => s.set({ dayEndH: Number(e.target.value) })} className="h-9 rounded-xl bg-fg/[0.06] px-2 font-semibold">{Array.from({ length: 12 }, (_, h) => h + 13).map((h) => <option key={h} value={h}>{h % 24}:00</option>)}</select>
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <span className="text-[15px] font-semibold">{t('Sleep goal')}</span>
          <span className="flex items-center gap-3"><input type="range" min={5} max={10} step={0.5} value={s.targets.sleepH} onChange={(e) => s.set({ targets: { ...s.targets, sleepH: Number(e.target.value) } })} aria-label={t('Sleep goal')} className="w-28 accent-[#2F6BFF]" /><span className="w-10 text-right font-bold tabular-nums">{s.targets.sleepH} {t('h')}</span></span>
        </div>
        {features.includes('health') && (
          <>
            <div className="flex items-center justify-between gap-3 p-4">
              <span className="text-[15px] font-semibold">{t('Daily calories')}</span>
              <input type="number" min={800} max={6000} step={50} value={s.targets.kcal} onChange={(e) => Number(e.target.value) >= 800 && s.set({ targets: { ...s.targets, kcal: Number(e.target.value) } })} aria-label={t('Daily calories')} className="h-9 w-24 rounded-xl bg-fg/[0.06] px-3 text-right font-bold tabular-nums" />
            </div>
            <div className="flex items-center justify-between gap-3 p-4">
              <span className="text-[15px] font-semibold">{t('Water')}</span>
              <span className="flex items-center gap-3"><input type="range" min={1000} max={4000} step={250} value={s.targets.waterMl} onChange={(e) => s.set({ targets: { ...s.targets, waterMl: Number(e.target.value) } })} aria-label={t('Water goal')} className="w-28 accent-[#2F6BFF]" /><span className="w-16 text-right font-bold tabular-nums">{s.targets.waterMl} {t('ml')}</span></span>
            </div>
          </>
        )}
      </div>
    </div>,
    // 4. Meet Afina
    <div key="a" className="flex flex-col items-center text-center">
      <AfinaOrb size={180} thinking />
      <h2 className="mt-4 text-[30px] font-bold tracking-[-0.03em]">{t('Meet')} <span className="text-brand">Afina</span></h2>
      <p className="mt-2 max-w-[42ch] text-[16px] text-fg/60">{t('She lives on your device. Tell her things the way you’d say them:')}</p>
      <div className="mt-4 flex max-w-lg flex-wrap justify-center gap-2">
        {(t.lang === 'ru' ? ['«Съел шаурму и колу на обед»', '«Спланируй мой день»', '«Как я спал на этой неделе?»', '«Обед с Сашей в пятницу в 13:00»'] : ['“I ate shawarma and a Coke for lunch”', '“Plan my day”', '“How did I sleep this week?”', '“Lunch with Sam Friday 1pm”']).map((c) => (
          <span key={c} className="glass rounded-full px-3.5 py-1.5 text-[14px]">{c}</span>
        ))}
      </div>
      <label className="glass mt-6 flex w-full max-w-md items-center justify-between gap-3 rounded-[20px] p-4 text-left">
        <span>
          <span className="block text-[15px] font-semibold">{t('Start with sample data')}</span>
          <span className="block text-[13px] text-fg/55">{t('See the app alive right away. Remove it in Settings with one click.')}</span>
        </span>
        <Switch label={t('Start with sample data')} checked={sample} onChange={setSample} />
      </label>
    </div>,
  ];

  return (
    <motion.div className="fixed inset-0 z-[90] flex flex-col overflow-y-auto bg-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label={t('Welcome to Universal Planner')}>
      <div className="ambient" aria-hidden><i /><i /><i /></div>
      <div className="flex items-center justify-between px-5 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex gap-1.5" aria-label={`${t('Step')} ${step + 1} / 4`}>
          {screens.map((_, i) => (
            <motion.span key={i} className="h-1.5 rounded-full bg-fg/20" animate={{ width: i === step ? 28 : 8, background: i <= step ? '#2F6BFF' : 'rgba(127,127,127,0.25)' }} transition={spring} />
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void finish(true)} disabled={busy}>{t('Skip')}</Button>
      </div>
      <div className="flex flex-1 items-center justify-center px-5 py-6">
        <div className="w-full max-w-xl">
          <AnimatePresence mode="popLayout" custom={dir} initial={false}>
            <motion.div
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: dir * 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -60 }}
              transition={spring}
            >
              {screens[step]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        {step > 0 ? <Button variant="ghost" icon={ArrowLeft} onClick={() => go(step - 1)}>{t('Back')}</Button> : <span />}
        {step < screens.length - 1 ? (
          <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={() => go(step + 1)}>{step === 0 ? t('Get started') : t('Continue')}</Button>
        ) : (
          <Button variant="brand" size="lg" icon={Sparkles} disabled={busy} onClick={() => void finish(sample)}>{t('Let’s go')}</Button>
        )}
      </div>
    </motion.div>
  );
}
