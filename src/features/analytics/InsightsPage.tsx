import { useMemo, useState } from 'react';
import { create } from 'zustand';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { addDays, isSunday, startOfDay } from 'date-fns';
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { BarChart3, CalendarCheck2, Flame, Lightbulb, Moon, Sparkles, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { db } from '@/lib/db';
import { dayKey, fmt } from '@/lib/dates';
import { useSettings } from '@/lib/settings';
import { useT } from '@/lib/i18n';
import { pearson, describeCorrelation, sum } from '@/lib/stats';
import { PageHeader } from '@/ui/PageHeader';
import { TiltCard } from '@/ui/TiltCard';
import { Segmented } from '@/ui/Segmented';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { EmptyState } from '@/ui/EmptyState';
import { ChartTooltip, DataTable, Legend, Stat, useAxisProps, useChartColors } from '@/ui/charts';
import { cn } from '@/lib/cn';
import { itemVariants } from '@/lib/motion';
import { buildDays, completionRate, crossInsights, habitStats, productiveHeatmap, sleepMoodPairs, weeklyReview, weightTrend, type Records } from './insights';

const useRange = create<{ days: 7 | 30 | 90; set: (d: 7 | 30 | 90) => void }>((set) => ({ days: 30, set: (days) => set({ days }) }));

function useRecords(): Records | undefined {
  return useLiveQuery(async () => {
    const since = dayKey(addDays(new Date(), -120));
    const sinceT = addDays(new Date(), -120).getTime();
    const [tasks, focus, habits, habitLogs, meals, water, weight, sleep, mood] = await Promise.all([
      db.tasks.toArray(),
      db.focus.where('start').above(sinceT).toArray(),
      db.habits.filter((h) => !h.archived).toArray(),
      db.habitLogs.where('date').aboveOrEqual(since).toArray(),
      db.meals.where('date').aboveOrEqual(since).toArray(),
      db.water.where('date').aboveOrEqual(since).toArray(),
      db.weight.where('date').aboveOrEqual(since).toArray(),
      db.sleep.where('date').aboveOrEqual(since).toArray(),
      db.mood.where('date').aboveOrEqual(since).toArray(),
    ]);
    return { tasks, focus, habits, habitLogs, meals, water, weight, sleep, mood };
  }, []);
}

function Section({ title, icon: Icon, children, className }: { title: string; icon: typeof BarChart3; children: React.ReactNode; className?: string }) {
  return (
    <motion.section variants={itemVariants} aria-label={title} className={className}>
      <TiltCard max={2} className="h-full p-5">
        <header className="mb-4 flex items-center gap-2">
          <Icon size={16} className="text-fg/60" aria-hidden />
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-fg/60">{title}</h2>
        </header>
        {children}
      </TiltCard>
    </motion.section>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Heatmap({ grid }: { grid: number[][] }) {
  const t = useT();
  const max = Math.max(1, ...grid.flat());
  const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 6:00–23:00
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] table-fixed border-separate border-spacing-[3px]" aria-label={t('When you get things done, by weekday and hour')}>
        <thead>
          <tr>
            <th className="w-10" />
            {hours.map((h) => (
              <th key={h} scope="col" className="text-[10px] font-medium text-fg/60">{h % 3 === 0 ? `${h}` : ''}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, d) => (
            <tr key={d}>
              <th scope="row" className="pr-1 text-left text-[11px] font-semibold text-fg/60">{t(WEEKDAYS[d])}</th>
              {hours.map((h) => {
                const v = row[h];
                return (
                  <td key={h} title={`${t(WEEKDAYS[d])} ${h}:00 · ${Math.round(v * 10) / 10}`} className="h-5 rounded-[5px]" style={{ background: v ? `rgb(47 107 255 / ${0.12 + (v / max) * 0.83})` : 'rgb(var(--fg) / 0.04)' }}>
                    <span className="sr-only">{Math.round(v * 10) / 10}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-fg/60">
        {t('Less')}
        {[0.12, 0.35, 0.6, 0.95].map((a) => <span key={a} className="h-3 w-5 rounded-[4px]" style={{ background: `rgb(47 107 255 / ${a})` }} />)}
        {t('More')}
      </div>
    </div>
  );
}

function WeeklyReviewSheet({ open, onClose, records }: { open: boolean; onClose: () => void; records: Records }) {
  const t = useT();
  const targets = useSettings((s) => s.targets);
  const end = isSunday(new Date()) ? new Date() : addDays(startOfDay(new Date()), -((new Date().getDay() + 7) % 7));
  const r = useMemo(() => weeklyReview(records, end, t.lang, targets), [records, end.getTime(), t.lang, targets]); // eslint-disable-line react-hooks/exhaustive-deps
  const delta = (v: number | null, unit = '') => (v === null ? null : <span className={v >= 0 ? 'text-blue' : 'text-pink'}>{v >= 0 ? '+' : ''}{v}{unit} {t('vs previous week')}</span>);
  return (
    <Sheet open={open} onClose={onClose} label={t('Weekly review')} className="max-w-xl">
      <div className="thin-scrollbar max-h-[86dvh] overflow-y-auto p-6">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-brand">{t('Weekly review')}</p>
        <h2 className="mt-1 text-[24px] font-bold tracking-[-0.02em]">{fmt(r.from, 'd MMM')} – {fmt(r.to, 'd MMM')}</h2>
        <div className="mt-5 grid grid-cols-2 gap-5">
          <Stat label={t('Tasks done')} value={r.tasksDone} sub={delta(r.tasksDelta)} />
          <Stat label={t('Focus')} value={r.focusMin} unit="min" sub={delta(r.focusDelta, ' min')} />
          <Stat label={t('Avg sleep')} value={r.avgSleep !== null ? r.avgSleep.toFixed(1) : '—'} unit="h" />
          <Stat label={t('Avg mood')} value={r.avgMood !== null ? r.avgMood.toFixed(1) : '—'} unit="/ 5" />
          <Stat label={t('Weight change')} value={r.weightChange !== null ? `${r.weightChange > 0 ? '+' : ''}${r.weightChange}` : '—'} unit="kg" />
          <Stat label={t('Avg calories')} value={r.avgKcal !== null ? Math.round(r.avgKcal) : '—'} unit="kcal" />
        </div>
        {r.bestDay && (
          <div className="mt-6 flex items-center gap-3 rounded-[18px] bg-brand-soft p-4">
            <Trophy size={22} className="shrink-0 text-pink" aria-hidden />
            <p className="text-[15px]"><strong>{t('Best day')}: {fmt(r.bestDay.date, 'EEEE')}</strong> — {r.bestDay.tasksDone} {t('tasks')}, {r.bestDay.focusMin} {t('min focused')}.</p>
          </div>
        )}
        <h3 className="mt-6 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg/60">{t('For next week')}</h3>
        <ul className="mt-2 flex flex-col gap-2">
          {r.suggestions.map((s) => (
            <li key={s} className="flex gap-2.5 text-[15px]"><Sparkles size={16} className="mt-1 shrink-0 text-blue" aria-hidden />{s}</li>
          ))}
        </ul>
        <div className="mt-6 flex justify-end"><Button onClick={onClose}>{t('Done')}</Button></div>
      </div>
    </Sheet>
  );
}

export default function InsightsPage() {
  const t = useT();
  const c = useChartColors();
  const axis = useAxisProps();
  const { days: range, set } = useRange();
  const ws = useSettings((s) => s.weekStart);
  const targets = useSettings((s) => s.targets);
  const records = useRecords();
  const [review, setReview] = useState(false);

  const view = useMemo(() => {
    if (!records) return null;
    const days = buildDays(records, range);
    const since = days[0].date.getTime();
    const grid = productiveHeatmap(records.tasks, records.focus, since);
    const done = sum(days.map((d) => d.tasksDone));
    const focus = sum(days.map((d) => d.focusMin));
    const rate = completionRate(records.tasks, days[0].key, days.at(-1)!.key);
    const habits = habitStats(records.habits, records.habitLogs, new Date(), ws).sort((a, b) => b.consistency - a.consistency);
    const wt = weightTrend(buildDays(records, Math.max(range, 30)));
    const pairs = sleepMoodPairs(days);
    const r = pearson(pairs.map((p) => p.sleep), pairs.map((p) => p.mood));
    const insights = crossInsights(buildDays(records, Math.max(range, 30)), grid, t.lang, targets);
    const label = (d: Date) => fmt(d, range === 7 ? 'EEE' : 'd MMM');
    const chart = days.map((d) => ({ day: label(d.date), full: fmt(d.date, 'EEE d MMM'), done: d.tasksDone, focus: d.focusMin, planned: Math.round(d.plannedMin), weight: d.weight }));
    const wDays = buildDays(records, Math.max(range, 30));
    const weightChart = wDays.map((d, i) => ({ day: label(d.date), full: fmt(d.date, 'EEE d MMM'), kg: d.weight, avg: wt.ma[i] === null ? null : Math.round(wt.ma[i]! * 10) / 10 }));
    return { days, grid, done, focus, rate, habits, wt, pairs, r, insights, chart, weightChart };
  }, [records, range, ws, t.lang, targets]);

  const full = (_: unknown, p: readonly { payload?: { full?: string } }[]) => p?.[0]?.payload?.full ?? '';
  const empty = view && view.done === 0 && view.focus === 0 && !view.pairs.length && !view.habits.length;

  return (
    <>
      <PageHeader
        title={t('nav.insights')}
        actions={<Button variant={isSunday(new Date()) ? 'brand' : 'glass'} icon={CalendarCheck2} onClick={() => setReview(true)} disabled={!records}>{t('Weekly review')}</Button>}
      />
      <motion.div variants={itemVariants} className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented label={t('Time range')} value={String(range) as '7' | '30' | '90'} onChange={(v) => set(Number(v) as 7 | 30 | 90)} options={[{ value: '7', label: t('7 days') }, { value: '30', label: t('30 days') }, { value: '90', label: t('90 days') }]} />
        {isSunday(new Date()) && <p className="text-[13px] font-semibold text-brand">{t('Your weekly review is ready')}</p>}
      </motion.div>

      {!view ? (
        <div className="h-[50vh]" />
      ) : empty ? (
        <TiltCard className="p-6"><EmptyState icon={BarChart3} title={t('Nothing to analyze yet')} body={t('Complete tasks, track habits and log sleep or mood for a few days — real patterns will show up here.')} /></TiltCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {view.insights.length > 0 && (
            <motion.section variants={itemVariants} className="lg:col-span-2" aria-label={t('What we noticed')}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {view.insights.map((i) => (
                  <TiltCard key={i.id} max={3} className="flex gap-3 p-4">
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', i.tone === 'pink' ? 'bg-pink/15 text-pink' : i.tone === 'blue' ? 'bg-blue/15 text-blue' : 'bg-fg/[0.07] text-fg/60')}>
                      <Lightbulb size={17} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold leading-snug">{i.title}</p>
                      <p className="mt-1 text-[12px] text-fg/60">{i.detail}</p>
                    </div>
                  </TiltCard>
                ))}
              </div>
            </motion.section>
          )}

          <Section title={t('Productivity')} icon={BarChart3} className="lg:col-span-2">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Stat label={t('Tasks done')} value={view.done} sub={`${(view.done / range).toFixed(1)} ${t('per day')}`} />
              <Stat label={t('Completion rate')} value={view.rate ? Math.round(view.rate.rate * 100) : '—'} unit={view.rate ? '%' : undefined} sub={view.rate ? `${t('of')} ${view.rate.n} ${t('tasks due')}` : t('No tasks were due')} />
              <Stat label={t('Focus time')} value={Math.round(view.focus / 6) / 10} unit={t('h')} sub={`${Math.round(view.focus / range)} ${t('min')} ${t('per day')}`} />
              <Stat label={t('Planned time')} value={Math.round(sum(view.days.map((d) => d.plannedMin)) / 6) / 10} unit="h" sub={t('time-blocked on your timeline')} />
            </div>
            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-[14px] font-semibold">{t('Tasks completed per day')}</h3>
                <div className="h-48" role="img" aria-label={t('Tasks completed per day')}>
                  <ResponsiveContainer>
                    <BarChart data={view.chart} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} stroke={c.grid} />
                      <XAxis dataKey="day" {...axis} interval="preserveStartEnd" minTickGap={18} />
                      <YAxis {...axis} allowDecimals={false} width={36} />
                      <Tooltip content={<ChartTooltip />} labelFormatter={full} cursor={{ fill: c.grid }} />
                      <Bar dataKey="done" name={t('Tasks done')} fill={c.blue} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-[14px] font-semibold">{t('Planned vs actual focus (minutes)')}</h3>
                <div className="h-48" role="img" aria-label={t('Planned minutes versus focused minutes per day')}>
                  <ResponsiveContainer>
                    <BarChart data={view.chart} margin={{ top: 6, right: 6, bottom: 0, left: 0 }} barGap={2}>
                      <CartesianGrid vertical={false} stroke={c.grid} />
                      <XAxis dataKey="day" {...axis} interval="preserveStartEnd" minTickGap={18} />
                      <YAxis {...axis} width={40} />
                      <Tooltip content={<ChartTooltip unit=" min" />} labelFormatter={full} cursor={{ fill: c.grid }} />
                      <Bar dataKey="planned" name={t('Planned')} fill={c.violet} radius={[4, 4, 0, 0]} maxBarSize={12} />
                      <Bar dataKey="focus" name={t('Focused')} fill={c.pink} radius={[4, 4, 0, 0]} maxBarSize={12} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2"><Legend items={[{ label: t('Planned'), color: c.violet }, { label: t('Focused'), color: c.pink }]} /></div>
              </div>
            </div>
            <DataTable caption={t('Daily productivity')} columns={[t('Day'), t('Tasks done'), t('Planned min'), t('Focus min')]} rows={[...view.chart].reverse().map((d) => [d.full, d.done, d.planned, d.focus])} />
          </Section>

          <Section title={t('Most productive hours')} icon={Flame} className="lg:col-span-2">
            <Heatmap grid={view.grid} />
          </Section>

          <Section title={t('Habits')} icon={Trophy}>
            {view.habits.length ? (
              <ul className="flex flex-col gap-3">
                {view.habits.map(({ habit, streak, best, consistency }) => (
                  <li key={habit.id}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-[14px]">
                      <span className="truncate font-semibold">{habit.emoji} {habit.name}</span>
                      <span className="shrink-0 text-[12px] text-fg/60">🔥 {streak} · {t('best')} {best}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-fg/[0.07]">
                        <motion.div className="h-full rounded-full" style={{ background: habit.color === 'pink' ? c.pink : c.blue }} initial={{ width: 0 }} animate={{ width: `${consistency * 100}%` }} />
                      </div>
                      <span className="w-10 text-right text-[12px] font-semibold tabular-nums">{Math.round(consistency * 100)}%</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={Trophy} title={t('No habits yet')} body={t('Add habits in Today → Habits.')} />
            )}
          </Section>

          <Section title={t('Sleep and mood')} icon={Moon}>
            {view.pairs.length >= 3 ? (
              <>
                <p className="text-[15px] font-semibold">{Number.isNaN(view.r) ? t('Not enough variation yet') : `${t(describeCorrelation(view.r))} · r = ${view.r.toFixed(2)}`}</p>
                <p className="text-[12px] text-fg/60">{view.pairs.length} {t('days with both logged')}</p>
                <div className="mt-3 h-44" role="img" aria-label={t('Hours slept against mood for each day')}>
                  <ResponsiveContainer>
                    <ScatterChart margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={c.grid} />
                      <XAxis type="number" dataKey="sleep" name={t('Sleep')} unit="h" domain={[4, 10]} {...axis} />
                      <YAxis type="number" dataKey="mood" name={t('Mood')} domain={[0.5, 5.5]} ticks={[1, 2, 3, 4, 5]} {...axis} width={36} />
                      <ZAxis range={[70, 70]} />
                      <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.grid }} />
                      <Scatter data={view.pairs} name={t('Day')} fill={c.violet} stroke={c.surface} strokeWidth={2} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-1 text-[11px] text-fg/60">{t('Each dot is one day: hours slept (across) and mood 1–5 (up).')}</p>
              </>
            ) : (
              <EmptyState compact icon={Moon} title={t('Log sleep and mood')} body={t('After a few days with both, you’ll see how they relate.')} />
            )}
          </Section>

          <Section title={t('Weight trend')} icon={view.wt.perWeek !== null && view.wt.perWeek > 0 ? TrendingUp : TrendingDown} className="lg:col-span-2">
            {view.wt.n >= 2 ? (
              <>
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
                  <Stat label={t('Latest')} value={view.wt.last ?? '—'} unit="kg" />
                  <Stat label={t('Trend')} value={view.wt.perWeek !== null ? `${view.wt.perWeek > 0 ? '+' : ''}${view.wt.perWeek.toFixed(2)}` : '—'} unit={t('kg / week')} sub={t('least-squares fit')} />
                  <Stat label={t('Weigh-ins')} value={view.wt.n} />
                </div>
                <div className="mt-4 h-52" role="img" aria-label={t('Weight with a 7-day moving average')}>
                  <ResponsiveContainer>
                    <ComposedChart data={view.weightChart} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} stroke={c.grid} />
                      <XAxis dataKey="day" {...axis} interval="preserveStartEnd" minTickGap={30} />
                      <YAxis {...axis} domain={['dataMin - 1', 'dataMax + 1']} width={44} tickFormatter={(v: number) => String(Math.round(v))} />
                      <Tooltip content={<ChartTooltip unit=" kg" />} labelFormatter={full} cursor={{ stroke: c.grid }} />
                      <Line dataKey="kg" name={t('Weigh-in')} stroke={c.blue} strokeWidth={0} dot={{ r: 3.5, fill: c.blue, stroke: c.surface, strokeWidth: 2 }} />
                      <Line dataKey="avg" name={t('7-day average')} stroke={c.pink} strokeWidth={2} dot={false} connectNulls type="monotone" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2"><Legend items={[{ label: t('Weigh-in'), color: c.blue }, { label: t('7-day average'), color: c.pink }]} /></div>
              </>
            ) : (
              <EmptyState compact icon={TrendingDown} title={t('No weight data')} body={t('Log your weight in Health → Body & mood.')} />
            )}
          </Section>
        </div>
      )}
      {records && <WeeklyReviewSheet open={review} onClose={() => setReview(false)} records={records} />}
    </>
  );
}
