import { motion } from 'framer-motion';
import { Clock3, Droplets, Flame, ListTodo, Repeat, Search, Settings2, Target, Timer } from 'lucide-react';
import { PageHeader } from '@/ui/PageHeader';
import { Widget, PhaseBadge } from '@/ui/Widget';
import { EmptyState } from '@/ui/EmptyState';
import { Rings, RING_PRESETS } from '@/ui/Rings';
import { IconButton } from '@/ui/Button';
import { TiltCard } from '@/ui/TiltCard';
import { AfinaOrb } from '@/features/afina/AfinaOrb';
import { useCommand } from '@/app/CommandBar';
import { useRouter } from '@/app/router';
import { useIsDesktop, useNow } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { itemVariants } from '@/lib/motion';

export function greetingKey(h: number) {
  if (h < 5) return 'greet.night' as const;
  if (h < 12) return 'greet.morning' as const;
  if (h < 18) return 'greet.afternoon' as const;
  return 'greet.evening' as const;
}

export default function TodayPage() {
  const t = useT();
  const now = useNow();
  const desktop = useIsDesktop();
  const go = useRouter((s) => s.go);
  const showCommand = useCommand((s) => s.show);
  const date = now.toLocaleDateString(t.locale, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <>
      <PageHeader
        eyebrow={date}
        title={t(greetingKey(now.getHours()))}
        actions={
          !desktop && (
            <>
              <IconButton icon={Search} label="Search" onClick={showCommand} />
              <IconButton icon={Settings2} label="Settings" onClick={() => go('settings')} />
            </>
          )
        }
      />

      <motion.div variants={itemVariants}>
        <TiltCard max={2} radius="xl" className="mb-4 flex items-center gap-4 overflow-hidden p-4 sm:gap-6 sm:p-5">
          <button type="button" onClick={() => go('afina')} aria-label="Open Afina" className="rounded-full">
            <AfinaOrb size={desktop ? 104 : 76} />
          </button>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-brand">Afina</p>
            <p className="mt-1 text-[17px] font-medium leading-snug tracking-[-0.01em] sm:text-[19px]">
              Your day is a clean slate. Once your calendar and tasks move in, I’ll brief you here every morning.
            </p>
          </div>
        </TiltCard>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Widget title="Timeline" icon={Clock3} action={<PhaseBadge phase={2} />} className="sm:row-span-2">
          <EmptyState compact icon={Clock3} title="Nothing scheduled" body="Events and time-blocked tasks for today will line up here, hour by hour." />
        </Widget>
        <Widget title="Top 3" icon={Target} action={<PhaseBadge phase={2} />}>
          <EmptyState compact icon={ListTodo} title="No priorities yet" body="Pick the three things that would make today a win." />
        </Widget>
        <Widget title="Habits" icon={Repeat} action={<PhaseBadge phase={2} />}>
          <div className="flex items-center gap-5 py-2">
            <Rings
              size={104}
              stroke={12}
              rings={[
                { value: 0, ...RING_PRESETS.blue, label: 'Habits' },
                { value: 0, ...RING_PRESETS.pink, label: 'Focus' },
              ]}
            />
            <div className="text-[14px] leading-relaxed text-fg/55">
              <p><span className="font-semibold text-blue">Habits</span> — none yet</p>
              <p><span className="font-semibold text-pink">Focus</span> — 0 min</p>
            </div>
          </div>
        </Widget>
        <Widget title="Focus" icon={Timer} action={<PhaseBadge phase={2} />}>
          <p className="text-[15px] text-fg/55">A calm, full-screen timer for one task at a time — with a “just start for 2 minutes” button.</p>
        </Widget>
        <Widget title="Water & food" icon={Droplets} action={<PhaseBadge phase={4} />}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[28px] font-bold tracking-[-0.03em]">0<span className="ml-1 text-[14px] font-semibold text-fg/40">glasses</span></p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue/15"><div className="h-full w-0 rounded-full bg-blue" /></div>
            </div>
            <div>
              <p className="flex items-baseline text-[28px] font-bold tracking-[-0.03em]">0<span className="ml-1 text-[14px] font-semibold text-fg/40">kcal</span><Flame size={14} className="ml-1 text-pink" aria-hidden /></p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-pink/15"><div className="h-full w-0 rounded-full bg-pink" /></div>
            </div>
          </div>
        </Widget>
      </div>
    </>
  );
}
