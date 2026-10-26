import { useEffect, useState, type ComponentType } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { Check, Clock3, Droplets, GripVertical, LayoutGrid, Maximize2, Minimize2, MoveRight, Repeat, Search, Settings2, Target, Timer, Star, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/ui/PageHeader';
import { Glass } from '@/ui/Glass';
import { TiltCard } from '@/ui/TiltCard';
import { Button, IconButton } from '@/ui/Button';
import { Segmented } from '@/ui/Segmented';
import { beginDrag, useDnd, useDropZone } from '@/ui/dnd';
import { toast } from '@/ui/Toast';
import { AfinaOrb } from '@/features/afina/AfinaOrb';
import { eveningReflection, morningBriefing, rollOverToTomorrow } from '@/features/afina/briefing';
import { TasksView } from '@/features/planner/TasksView';
import { HabitsView } from '@/features/planner/HabitsView';
import { GoalsView } from '@/features/planner/GoalsView';
import { useCommand } from '@/app/CommandBar';
import { useRouter } from '@/app/router';
import { getKV, setKV } from '@/lib/db';
import { useIsDesktop, useNow } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { itemVariants, spring } from '@/lib/motion';
import { FocusWidget, GoalsWidget, HabitsWidget, NutritionWidget, TimelineWidget, Top3Widget } from './widgets';
import { useTodayTab, type TodayTab } from './store';

export function greetingKey(h: number) {
  if (h < 5) return 'greet.night' as const;
  if (h < 12) return 'greet.morning' as const;
  if (h < 18) return 'greet.afternoon' as const;
  return 'greet.evening' as const;
}

type WidgetId = 'timeline' | 'top3' | 'habits' | 'focus' | 'nutrition' | 'goals';
interface LayoutItem {
  id: WidgetId;
  size: 's' | 'l';
}
const WIDGETS: Record<WidgetId, { title: string; icon: LucideIcon; C: ComponentType }> = {
  timeline: { title: 'Up next', icon: Clock3, C: TimelineWidget },
  top3: { title: 'Top 3', icon: Star, C: Top3Widget },
  habits: { title: 'Habits', icon: Repeat, C: HabitsWidget },
  focus: { title: 'Focus', icon: Timer, C: FocusWidget },
  nutrition: { title: 'Water & food', icon: Droplets, C: NutritionWidget },
  goals: { title: 'Goals', icon: Target, C: GoalsWidget },
};
const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: 'timeline', size: 's' },
  { id: 'top3', size: 'l' },
  { id: 'habits', size: 's' },
  { id: 'focus', size: 's' },
  { id: 'nutrition', size: 's' },
  { id: 'goals', size: 's' },
];

function Briefing() {
  const t = useT();
  const go = useRouter((s) => s.go);
  const now = useNow(5 * 60_000);
  const evening = now.getHours() >= 18;
  const text = useLiveQuery(() => (evening ? eveningReflection(t.lang) : morningBriefing(t.lang)), [evening, t.lang, now.getHours()]);
  const desktop = useIsDesktop();
  return (
    <TiltCard max={2} radius="xl" className="mb-4 flex items-center gap-4 overflow-hidden p-4 sm:gap-6 sm:p-5">
      <button type="button" onClick={() => go('afina')} aria-label={t('Open Afina')} className="shrink-0 rounded-full">
        <AfinaOrb size={desktop ? 104 : 72} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-brand">{evening ? t('Afina · evening check-in') : t('Afina · your day')}</p>
        <p className="mt-1 text-[16px] font-medium leading-snug tracking-[-0.01em] sm:text-[18px]" aria-live="polite">
          {text ?? '…'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {evening && (
            <Button
              size="sm"
              variant="glass"
              icon={MoveRight}
              onClick={async () => {
                const n = await rollOverToTomorrow();
                toast(n ? `${n} ${t(n === 1 ? 'task moved to tomorrow' : 'tasks moved to tomorrow')}` : t('Nothing to move'));
              }}
            >
              {t('Move unfinished to tomorrow')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => go('afina')}>{t('Ask Afina')}</Button>
        </div>
      </div>
    </TiltCard>
  );
}

function WidgetCard({ item, editing, onResize, onSwap }: { item: LayoutItem; editing: boolean; onResize: () => void; onSwap: (from: WidgetId, to: WidgetId) => void }) {
  const t = useT();
  const w = WIDGETS[item.id];
  const over = useDnd((s) => s.over);
  const zone = `widget-${item.id}`;
  const drop = useDropZone(zone, { accepts: ['widget'], onDrop: (it) => it.id !== item.id && onSwap(it.id as WidgetId, item.id) });
  return (
    <motion.section layout transition={spring} variants={itemVariants} className={cn(item.size === 'l' && 'sm:col-span-2')} aria-label={t(w.title)} {...drop}>
      <motion.div animate={editing ? { rotate: [-0.4, 0.4, -0.4] } : { rotate: 0 }} transition={editing ? { duration: 0.35, repeat: Infinity } : spring} className="h-full">
        <TiltCard max={editing ? 0 : 3} className={cn('flex h-full flex-col p-5', over === zone && 'ring-2 ring-blue')}>
          <header className="mb-3 flex items-center gap-2">
            {editing && (
              <button type="button" aria-label={`${t('Move')} ${t(w.title)}`} onPointerDown={(e) => beginDrag(e, { kind: 'widget', id: item.id, label: t(w.title) })} className="-ml-1 cursor-grab touch-none rounded-lg p-1 text-fg/50 hover:bg-fg/[0.06]">
                <GripVertical size={16} aria-hidden />
              </button>
            )}
            <w.icon size={16} strokeWidth={2.3} className="text-fg/45" aria-hidden />
            <h2 className="flex-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg/55">{t(w.title)}</h2>
            {editing && <IconButton icon={item.size === 'l' ? Minimize2 : Maximize2} size={30} label={item.size === 'l' ? t('Make smaller') : t('Make wider')} onClick={onResize} />}
          </header>
          <div className={cn('flex-1', editing && 'pointer-events-none opacity-60')}>
            <w.C />
          </div>
        </TiltCard>
      </motion.div>
    </motion.section>
  );
}

function Overview() {
  const t = useT();
  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    void getKV<LayoutItem[]>('todayLayout').then((l) => {
      if (l?.length) setLayout([...l.filter((x) => WIDGETS[x.id]), ...DEFAULT_LAYOUT.filter((d) => !l.some((x) => x.id === d.id))]);
    });
  }, []);
  const save = (l: LayoutItem[]) => {
    setLayout(l);
    void setKV('todayLayout', l);
  };
  return (
    <>
      <motion.div variants={itemVariants}>
        <Briefing />
      </motion.div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" variant={editing ? 'primary' : 'ghost'} icon={editing ? Check : LayoutGrid} onClick={() => setEditing((v) => !v)}>
          {editing ? t('Done') : t('Customize')}
        </Button>
      </div>
      {editing && <p className="mb-3 text-[13px] text-fg/55">{t('Drag a widget by its handle onto another to swap them. Use the arrows to make it wider or smaller.')}</p>}
      <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {layout.map((item) => (
          <WidgetCard
            key={item.id}
            item={item}
            editing={editing}
            onResize={() => save(layout.map((x) => (x.id === item.id ? { ...x, size: x.size === 'l' ? 's' : 'l' } : x)))}
            onSwap={(from, to) => {
              const a = layout.findIndex((x) => x.id === from);
              const b = layout.findIndex((x) => x.id === to);
              const next = [...layout];
              [next[a], next[b]] = [next[b], next[a]];
              save(next);
            }}
          />
        ))}
      </motion.div>
    </>
  );
}

export default function TodayPage() {
  const t = useT();
  const now = useNow();
  const desktop = useIsDesktop();
  const go = useRouter((s) => s.go);
  const showCommand = useCommand((s) => s.show);
  const { tab, set } = useTodayTab();
  const date = now.toLocaleDateString(t.locale, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <>
      <PageHeader
        eyebrow={date}
        title={t(greetingKey(now.getHours()))}
        actions={
          !desktop && (
            <>
              <IconButton icon={Search} label={t('Search')} onClick={showCommand} />
              <IconButton icon={Settings2} label={t('nav.settings')} onClick={() => go('settings')} />
            </>
          )
        }
      />
      <motion.div variants={itemVariants} className="mb-5">
        <Glass shimmer={false} className="inline-flex max-w-full overflow-x-auto rounded-[16px] p-0 no-scrollbar">
          <Segmented<TodayTab>
            label={t('Today sections')}
            value={tab}
            onChange={set}
            className="bg-transparent"
            options={[
              { value: 'overview', label: t('Overview') },
              { value: 'tasks', label: t('Tasks') },
              { value: 'habits', label: t('Habits') },
              { value: 'goals', label: t('Goals') },
            ]}
          />
        </Glass>
      </motion.div>
      {/* Enter-only transition: nested exit animations inside the page transition can stall it. */}
      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <motion.div initial="initial" animate="enter" variants={{ enter: { transition: { staggerChildren: 0.04 } } }}>
          {tab === 'overview' && <Overview />}
          {tab === 'tasks' && <TasksView />}
          {tab === 'habits' && <HabitsView />}
          {tab === 'goals' && <GoalsView />}
        </motion.div>
      </motion.div>
    </>
  );
}
