import { useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Plus, RotateCcw, Sparkles } from 'lucide-react';
import { PageHeader } from '@/ui/PageHeader';
import { Glass } from '@/ui/Glass';
import { TiltCard } from '@/ui/TiltCard';
import { Button, IconButton } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Rings, RING_PRESETS } from '@/ui/Rings';
import { Segmented, Switch } from '@/ui/Segmented';
import { LiquidIndicator, useActiveRect } from '@/ui/LiquidIndicator';
import { AppIcon, EternalMark, PlannerMark } from '@/ui/Logo';
import { AfinaOrb } from '@/features/afina/AfinaOrb';
import { itemVariants, spring } from '@/lib/motion';

function Block({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <motion.section variants={itemVariants} className={className}>
      <h2 className="mb-3 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg/60">{title}</h2>
      {children}
    </motion.section>
  );
}

const SWATCHES = [
  { name: 'White', hex: '#FFFFFF', cls: 'bg-white ring-1 ring-inset ring-black/10' },
  { name: 'Black', hex: '#0A0A0A', cls: 'bg-ink ring-1 ring-inset ring-white/10' },
  { name: 'Blue', hex: '#2F6BFF', cls: 'bg-blue' },
  { name: 'Pink', hex: '#FF4FA3', cls: 'bg-pink' },
];

const DEMO_TASKS = ['Reply to Sam about Friday', 'Stretch for 5 minutes', 'Draft the Q4 plan outline', 'Buy oat milk'];

function TaskDemo() {
  const [tasks, setTasks] = useState(DEMO_TASKS.map((title, i) => ({ id: i, title, done: false })));
  const toggle = (id: number) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    // Completed rows soften, then collapse away.
    setTimeout(() => setTasks((ts) => ts.filter((t) => !(t.id === id && t.done))), 700);
  };
  return (
    <Glass className="p-2">
      <ul>
        <AnimatePresence initial={false}>
          {tasks.map((t) => (
            <motion.li
              key={t.id}
              layout
              exit={{ opacity: 0, height: 0, scale: 0.96, transition: spring }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 rounded-[16px] px-3 py-3">
                <Checkbox checked={t.done} onChange={() => toggle(t.id)} label={t.title} />
                <motion.span animate={{ opacity: t.done ? 0.4 : 1 }} className="relative text-[15px] font-medium">
                  {t.title}
                  <motion.span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-[1.5px] origin-left bg-fg/60"
                    style={{ width: '100%' }}
                    initial={false}
                    animate={{ scaleX: t.done ? 1 : 0 }}
                    transition={spring}
                  />
                </motion.span>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {tasks.length === 0 && <p className="px-4 py-6 text-center text-[15px] text-fg/60">All done. Nicely handled.</p>}
      <div className="flex justify-end px-2 pb-1">
        <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setTasks(DEMO_TASKS.map((title, i) => ({ id: i + Date.now(), title, done: false })))}>
          Reset
        </Button>
      </div>
    </Glass>
  );
}

function LiquidTabsDemo() {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const rect = useActiveRect(ref, i);
  const tabs = ['Day', 'Week', 'Month', 'Year'];
  return (
    <div ref={ref} className="relative inline-grid grid-cols-4 rounded-[18px] bg-fg/[0.05] p-1" role="tablist" aria-label="Calendar range">
      <LiquidIndicator rect={rect} axis="x" className="rounded-[14px] bg-brand shadow-[0_6px_18px_-6px_rgb(47_107_255/.6)]" />
      {tabs.map((t, idx) => (
        <button
          key={t}
          data-index={idx}
          role="tab"
          aria-selected={i === idx}
          type="button"
          onClick={() => setI(idx)}
          className={`relative h-10 w-[76px] rounded-[14px] text-[14px] font-semibold transition-colors ${i === idx ? 'text-white' : 'text-fg/60'}`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export default function DesignPage() {
  const [ring, setRing] = useState(0.68);
  const [seg, setSeg] = useState<'a' | 'b' | 'c'>('a');
  const [sw, setSw] = useState(true);
  const [thinking, setThinking] = useState(false);

  return (
    <>
      <PageHeader eyebrow="Phase 1" title="Design System" />
      <div className="grid gap-8">
        <Block title="Brand">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-[24px] bg-white text-ink ring-1 ring-inset ring-black/[0.06]">
              <PlannerMark size={88} />
              <p className="text-[13px] font-semibold">Universal Planner</p>
            </div>
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-[24px] bg-ink text-white ring-1 ring-inset ring-white/[0.08]">
              <EternalMark size={96} title="Eternal Inc." />
              <p className="text-[13px] font-semibold">Eternal Inc.</p>
            </div>
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-[24px] bg-brand-soft">
              <AppIcon size={96} />
              <p className="text-[13px] font-semibold">App icon</p>
            </div>
          </div>
        </Block>

        <Block title="Color">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {SWATCHES.map((s) => (
              <div key={s.name}>
                <div className={`h-20 rounded-[20px] ${s.cls}`} />
                <p className="mt-2 text-[14px] font-semibold">{s.name}</p>
                <p className="text-[12px] font-medium text-fg/60">{s.hex}</p>
              </div>
            ))}
            <div className="col-span-2 sm:col-span-1">
              <div className="h-20 rounded-[20px] bg-brand" />
              <p className="mt-2 text-[14px] font-semibold">Accent gradient</p>
              <p className="text-[12px] font-medium text-fg/60">Use sparingly</p>
            </div>
          </div>
        </Block>

        <Block title="Typography">
          <Glass shimmer={false} className="space-y-3 p-6">
            <p className="text-[44px] font-bold leading-none tracking-[-0.035em]">Large Title</p>
            <p className="text-[28px] font-bold tracking-[-0.03em]">Title — <span className="text-brand">with accent</span></p>
            <p className="text-[19px] font-semibold tracking-[-0.015em]">Headline for cards and sections</p>
            <p className="text-[15px] text-fg/70">Body text is calm and readable, set on an 8pt grid with generous whitespace.</p>
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-fg/60">Section label</p>
          </Glass>
        </Block>

        <Block title="Liquid glass">
          <div className="relative overflow-hidden rounded-[28px] p-6 sm:p-10">
            <div aria-hidden className="absolute inset-0">
              <div className="absolute -left-10 top-6 h-48 w-48 rounded-full bg-blue" />
              <div className="absolute bottom-0 right-6 h-56 w-56 rounded-full bg-pink" />
              <div className="absolute left-1/3 top-1/3 h-24 w-72 rotate-12 rounded-full bg-ink dark:bg-white" />
            </div>
            <div className="relative grid gap-4 sm:grid-cols-3">
              {['Hover me', 'Tilt me', 'Blur 24 · Saturate 180%'].map((t, i) => (
                <TiltCard key={t} className="flex h-40 flex-col justify-between p-5" strong={i === 2}>
                  <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-fg/60">{i === 2 ? 'Strong' : 'Regular'}</span>
                  <span className="text-[19px] font-bold tracking-[-0.02em]">{t}</span>
                </TiltCard>
              ))}
            </div>
          </div>
        </Block>

        <div className="grid gap-8 lg:grid-cols-2">
          <Block title="Completing a task">
            <TaskDemo />
          </Block>

          <Block title="Rings">
            <Glass className="flex items-center gap-6 p-6">
              <Rings
                size={140}
                stroke={14}
                rings={[
                  { value: ring, ...RING_PRESETS.blue, label: 'Habits' },
                  { value: Math.min(1, ring * 0.7 + 0.1), ...RING_PRESETS.pink, label: 'Focus' },
                  { value: Math.min(1, ring * 1.2), ...RING_PRESETS.brand, label: 'Water' },
                ]}
              />
              <div className="flex-1">
                <label htmlFor="ring" className="text-[15px] font-semibold">Progress</label>
                <input id="ring" type="range" min={0} max={1} step={0.01} value={ring} onChange={(e) => setRing(Number(e.target.value))} className="mt-3 w-full accent-[#2F6BFF]" />
                <p className="mt-1 text-[13px] text-fg/60">{Math.round(ring * 100)}%</p>
              </div>
            </Glass>
          </Block>

          <Block title="Controls">
            <Glass className="flex flex-wrap items-center gap-3 p-6">
              <Button icon={Plus}>Primary</Button>
              <Button variant="brand" icon={Sparkles}>Brand</Button>
              <Button variant="glass" iconRight={ArrowRight}>Glass</Button>
              <Button variant="ghost">Ghost</Button>
              <IconButton icon={Plus} label="Add" />
              <Segmented label="Demo" value={seg} onChange={setSeg} options={[{ value: 'a', label: 'Inbox' }, { value: 'b', label: 'Today' }, { value: 'c', label: 'Someday' }]} />
              <Switch label="Demo switch" checked={sw} onChange={setSw} />
            </Glass>
          </Block>

          <Block title="Liquid indicator">
            <Glass className="flex flex-col items-start gap-3 p-6">
              <LiquidTabsDemo />
              <p className="text-[13px] text-fg/60">Jump between distant tabs — the blob stretches with its speed, then settles.</p>
            </Glass>
          </Block>
        </div>

        <Block title="Afina orb">
          <Glass className="flex flex-col items-center gap-4 p-8 sm:flex-row sm:gap-10">
            <AfinaOrb size={200} thinking={thinking} />
            <div>
              <p className="text-[19px] font-bold tracking-[-0.02em]">Refractive, breathing, responsive</p>
              <p className="mt-1 max-w-[44ch] text-[15px] text-fg/60">Three.js transmission material with chromatic aberration. Leans toward your pointer, swirls while thinking, falls back to a CSS orb without WebGL or with reduced motion.</p>
              <Button className="mt-4" variant={thinking ? 'brand' : 'glass'} icon={Sparkles} onClick={() => setThinking((v) => !v)} aria-pressed={thinking}>
                {thinking ? 'Stop thinking' : 'Think'}
              </Button>
            </div>
          </Glass>
        </Block>
      </div>
    </>
  );
}
