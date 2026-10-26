import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '@/lib/db';
import { fmt, fromDayKey, lastNDays } from '@/lib/dates';
import { useSettings } from '@/lib/settings';
import { useT } from '@/lib/i18n';
import { TiltCard } from '@/ui/TiltCard';
import { ChartTooltip, DataTable, Legend, useAxisProps, useChartColors } from '@/ui/charts';
import { itemVariants } from '@/lib/motion';
import { mean } from '@/lib/stats';

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <motion.section variants={itemVariants} aria-label={title}>
      <TiltCard max={2} className="p-5">
        <h2 className="text-[17px] font-bold tracking-[-0.01em]">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-fg/60">{sub}</p>}
        <div className="mt-4">{children}</div>
      </TiltCard>
    </motion.section>
  );
}

export function Trends() {
  const t = useT();
  const c = useChartColors();
  const axis = useAxisProps();
  const targets = useSettings((s) => s.targets);
  const days = lastNDays(14);
  const meals = useLiveQuery(() => db.meals.where('date').aboveOrEqual(days[0]).toArray(), [days[0]]) ?? [];
  const water = useLiveQuery(() => db.water.where('date').aboveOrEqual(days[0]).toArray(), [days[0]]) ?? [];
  const data = useMemo(
    () =>
      days.map((d) => {
        const m = meals.filter((x) => x.date === d);
        const sum = (k: 'kcal' | 'protein' | 'carbs' | 'fat') => (m.length ? Math.round(m.reduce((a, x) => a + x[k], 0)) : null);
        const w = water.filter((x) => x.date === d).reduce((a, x) => a + x.ml, 0);
        return { day: fmt(fromDayKey(d), 'EEEEE'), full: fmt(fromDayKey(d), 'EEE d MMM'), kcal: sum('kcal'), protein: sum('protein'), carbs: sum('carbs'), fat: sum('fat'), water: w || null };
      }),
    [meals, water], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const logged = data.filter((d) => d.kcal !== null);
  const avg = logged.length ? Math.round(mean(logged.map((d) => d.kcal!))) : null;
  const full = (_: unknown, p: readonly { payload?: { full?: string } }[]) => p?.[0]?.payload?.full ?? '';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <ChartCard title={t('Calories')} sub={avg !== null ? `${t('Average')} ${avg} kcal · ${t('target')} ${targets.kcal} · ${logged.length} ${t('days logged')}` : t('Log food to see your trend')}>
          <div className="h-56" role="img" aria-label={t('Calories per day for the last two weeks against your target')}>
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="day" {...axis} />
                <YAxis {...axis} width={44} />
                <ReferenceLine y={targets.kcal} stroke={c.target} strokeDasharray="4 4" label={{ value: `${targets.kcal}`, position: 'insideTopRight', fill: c.axis, fontSize: 11 }} />
                <Tooltip content={<ChartTooltip unit=" kcal" />} labelFormatter={full} cursor={{ fill: c.grid }} />
                <Bar dataKey="kcal" name={t('Calories')} fill={c.blue} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2"><Legend items={[{ label: t('Calories eaten'), color: c.blue }, { label: t('Daily target'), color: c.target, dashed: true }]} /></div>
          <DataTable caption={t('Calories per day')} columns={[t('Day'), t('kcal'), t('Protein'), t('Carbs'), t('Fat')]} rows={data.filter((d) => d.kcal !== null).reverse().map((d) => [d.full, d.kcal!, `${d.protein} g`, `${d.carbs} g`, `${d.fat} g`])} />
        </ChartCard>
      </div>
      <ChartCard title={t('Macros')} sub={t('Grams per day')}>
        <div className="h-48" role="img" aria-label={t('Protein, carbs and fat per day')}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={c.grid} />
              <XAxis dataKey="day" {...axis} />
              <YAxis {...axis} width={40} />
              <Tooltip content={<ChartTooltip unit=" g" />} labelFormatter={full} cursor={{ fill: c.grid }} />
              <Bar dataKey="protein" stackId="m" name={t('Protein')} fill={c.blue} stroke={c.surface} strokeWidth={2} maxBarSize={24} />
              <Bar dataKey="carbs" stackId="m" name={t('Carbs')} fill={c.violet} stroke={c.surface} strokeWidth={2} maxBarSize={24} />
              <Bar dataKey="fat" stackId="m" name={t('Fat')} fill={c.pink} stroke={c.surface} strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2"><Legend items={[{ label: t('Protein'), color: c.blue }, { label: t('Carbs'), color: c.violet }, { label: t('Fat'), color: c.pink }]} /></div>
      </ChartCard>
      <ChartCard title={t('Water')} sub={`${t('Goal')} ${targets.waterMl} ${t('ml')}`}>
        <div className="h-48" role="img" aria-label={t('Water per day')}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={c.grid} />
              <XAxis dataKey="day" {...axis} />
              <YAxis {...axis} width={44} />
              <ReferenceLine y={targets.waterMl} stroke={c.target} strokeDasharray="4 4" />
              <Tooltip content={<ChartTooltip unit=" ml" />} labelFormatter={full} cursor={{ fill: c.grid }} />
              <Bar dataKey="water" name={t('Water')} fill={c.blue} radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2"><Legend items={[{ label: t('Water'), color: c.blue }, { label: t('Goal'), color: c.target, dashed: true }]} /></div>
      </ChartCard>
    </div>
  );
}
