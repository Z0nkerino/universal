import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Moon, Scale, Smile } from 'lucide-react';
import { db } from '@/lib/db';
import { logMood, logSleep, logWeight } from '@/lib/actions';
import { dayKey, fmt, fromDayKey, lastNDays, todayKey } from '@/lib/dates';
import { movingAverage } from '@/lib/stats';
import { useSettings } from '@/lib/settings';
import { useT } from '@/lib/i18n';
import { TiltCard } from '@/ui/TiltCard';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Field';
import { toast } from '@/ui/Toast';
import { ChartTooltip, DataTable, Legend, Stat, useAxisProps, useChartColors } from '@/ui/charts';
import { cn } from '@/lib/cn';
import { itemVariants } from '@/lib/motion';
import type { MoodLog } from '@/lib/types';

export const MOODS: { score: MoodLog['score']; emoji: string; label: string }[] = [
  { score: 1, emoji: '😞', label: 'Rough' },
  { score: 2, emoji: '😕', label: 'Low' },
  { score: 3, emoji: '😐', label: 'Okay' },
  { score: 4, emoji: '🙂', label: 'Good' },
  { score: 5, emoji: '😄', label: 'Great' },
];

function Card({ icon: Icon, title, children }: { icon: typeof Scale; title: string; children: React.ReactNode }) {
  return (
    <motion.section variants={itemVariants} aria-label={title}>
      <TiltCard max={2} className="h-full p-5">
        <header className="mb-4 flex items-center gap-2">
          <Icon size={16} className="text-fg/50" aria-hidden />
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-fg/55">{title}</h2>
        </header>
        {children}
      </TiltCard>
    </motion.section>
  );
}

function WeightCard() {
  const t = useT();
  const c = useChartColors();
  const axis = useAxisProps();
  const days = lastNDays(60);
  const logs = useLiveQuery(() => db.weight.where('date').aboveOrEqual(days[0]).toArray(), [days[0]]) ?? [];
  const [kg, setKg] = useState('');
  const data = useMemo(() => {
    const by = new Map(logs.map((l) => [l.date, l.kg]));
    const vals = days.map((d) => by.get(d) ?? null);
    const ma = movingAverage(vals, 7);
    return days.map((d, i) => ({ day: fmt(fromDayKey(d), 'd MMM'), kg: vals[i], avg: vals.slice(0, i + 1).some((v) => v !== null) ? (ma[i] === null ? null : Math.round(ma[i]! * 10) / 10) : null }));
  }, [logs, days]);
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  const weekAgo = sorted.filter((l) => l.date <= dayKey(Date.now() - 7 * 86_400_000)).at(-1);
  const change = latest && weekAgo ? Math.round((latest.kg - weekAgo.kg) * 10) / 10 : null;
  const vals = logs.map((l) => l.kg);
  return (
    <Card icon={Scale} title={t('Weight')}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Stat label={t('Latest')} value={latest ? latest.kg : '—'} unit="kg" sub={change !== null ? `${change > 0 ? '+' : ''}${change} kg ${t('vs a week ago')}` : t('Log a few days to see your trend')} />
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = Number(kg.replace(',', '.'));
            if (!(v > 20 && v < 400)) return toast(t('Enter your weight in kg, e.g. 72.4'), { tone: 'error' });
            await logWeight(Math.round(v * 10) / 10);
            setKg('');
            toast(`${t('Weight logged')} · ${v} kg`);
          }}
        >
          <Input aria-label={t('Weight in kg')} inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder={latest ? String(latest.kg) : '72.4'} className="h-10 w-24" />
          <Button type="submit" size="md">{t('Log')}</Button>
        </form>
      </div>
      {logs.length >= 2 ? (
        <>
          <div className="mt-4 h-44" role="img" aria-label={t('Weight over the last 60 days with a 7-day average')}>
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="day" {...axis} interval="preserveStartEnd" minTickGap={40} />
                <YAxis {...axis} domain={[Math.floor(Math.min(...vals) - 1), Math.ceil(Math.max(...vals) + 1)]} width={44} />
                <Tooltip content={<ChartTooltip unit=" kg" />} cursor={{ stroke: c.grid, strokeWidth: 1 }} />
                <Line dataKey="kg" name={t('Weigh-in')} stroke={c.blue} strokeWidth={0} dot={{ r: 3.5, fill: c.blue, stroke: c.surface, strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive />
                <Line dataKey="avg" name={t('7-day average')} stroke={c.pink} strokeWidth={2} dot={false} connectNulls type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2"><Legend items={[{ label: t('Weigh-in'), color: c.blue }, { label: t('7-day average'), color: c.pink }]} /></div>
          <DataTable caption={t('Weight log')} columns={[t('Date'), 'kg']} rows={sorted.slice(-30).reverse().map((l) => [fmt(fromDayKey(l.date), 'EEE d MMM'), l.kg])} />
        </>
      ) : null}
    </Card>
  );
}

function SleepCard() {
  const t = useT();
  const c = useChartColors();
  const axis = useAxisProps();
  const target = useSettings((s) => s.targets.sleepH);
  const days = lastNDays(14);
  const logs = useLiveQuery(() => db.sleep.where('date').aboveOrEqual(days[0]).toArray(), [days[0]]) ?? [];
  const today = logs.find((l) => l.date === todayKey());
  const [hours, setHours] = useState(today?.hours ?? 7.5);
  const by = new Map(logs.map((l) => [l.date, l.hours]));
  const data = days.map((d) => ({ day: fmt(fromDayKey(d), 'EEEEE'), full: fmt(fromDayKey(d), 'EEE d MMM'), hours: by.get(d) ?? null }));
  const vals = logs.map((l) => l.hours);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  return (
    <Card icon={Moon} title={t('Sleep')}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Stat label={t('Last night')} value={today ? today.hours : '—'} unit={t('h')} sub={avg !== null ? `${t('2-week average')} ${avg.toFixed(1)} ${t('h')} · ${t('goal')} ${target} h` : undefined} />
        <div className="flex items-center gap-2">
          <input type="range" min={3} max={12} step={0.25} value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label={t('Hours slept')} className="w-28 accent-[#2F6BFF]" />
          <span className="w-12 text-right text-[15px] font-bold tabular-nums">{hours}h</span>
          <Button onClick={async () => (await logSleep(hours), toast(`${t('Sleep logged')} · ${hours} ${t('h')}`))}>{t('Log')}</Button>
        </div>
      </div>
      <div className="mt-4 h-36" role="img" aria-label={t('Hours of sleep over the last two weeks')}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="day" {...axis} />
            <YAxis {...axis} domain={[0, 12]} ticks={[0, 4, 8, 12]} width={36} />
            <ReferenceLine y={target} stroke={c.target} strokeDasharray="4 4" />
            <Tooltip content={<ChartTooltip unit=" h" />} labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ''} cursor={{ fill: c.grid }} />
            <Bar dataKey="hours" name={t('Sleep')} fill={c.blue} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2"><Legend items={[{ label: t('Hours slept'), color: c.blue }, { label: `${t('Goal')} ${target} ${t('h')}`, color: c.target, dashed: true }]} /></div>
    </Card>
  );
}

function MoodCard() {
  const t = useT();
  const days = lastNDays(14);
  const logs = useLiveQuery(() => db.mood.where('date').aboveOrEqual(days[0]).toArray(), [days[0]]) ?? [];
  const today = logs.find((l) => l.date === todayKey());
  const [note, setNote] = useState('');
  const by = new Map(logs.map((l) => [l.date, l]));
  return (
    <Card icon={Smile} title={t('Mood')}>
      <p className="text-[15px] font-semibold">{t('How are you feeling today?')}</p>
      <div className="mt-3 flex justify-between gap-1" role="radiogroup" aria-label={t('Mood')}>
        {MOODS.map((m) => (
          <motion.button
            key={m.score}
            type="button"
            role="radio"
            aria-checked={today?.score === m.score}
            whileTap={{ scale: 0.85 }}
            onClick={async () => {
              await logMood(m.score, note || today?.note);
              toast(`${t('Mood logged')} · ${t(m.label)}`);
            }}
            className={cn('flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 transition-colors', today?.score === m.score ? 'bg-brand-soft ring-2 ring-blue' : 'hover:bg-fg/[0.05]')}
          >
            <span className="text-[28px]">{m.emoji}</span>
            <span className="text-[11px] font-semibold text-fg/55">{t(m.label)}</span>
          </motion.button>
        ))}
      </div>
      <Input className="mt-3" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => today && note && void logMood(today.score, note)} placeholder={today?.note ?? t('Add a note (optional)')} aria-label={t('Mood note')} />
      <div className="mt-4 flex justify-between" aria-label={t('Last two weeks')}>
        {days.map((d) => {
          const l = by.get(d);
          return (
            <div key={d} className="flex flex-col items-center gap-1" title={l?.note}>
              <span className="text-[16px]" aria-label={l ? t(MOODS[l.score - 1].label) : t('No entry')}>{l ? MOODS[l.score - 1].emoji : '·'}</span>
              <span className="text-[10px] font-semibold text-fg/40">{fmt(fromDayKey(d), 'EEEEE')}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function BodyLogs() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2"><WeightCard /></div>
      <SleepCard />
      <MoodCard />
    </div>
  );
}
