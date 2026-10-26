// Shared chart styling. Palette validated with the dataviz validator (CVD, lightness band,
// contrast) for both themes; pink sits just under 3:1 in light mode, so charts always
// carry direct labels or a legend + table rather than relying on color alone.
import type { ReactNode } from 'react';
import { useIsDark } from '@/lib/hooks';

export function useChartColors() {
  const dark = useIsDark();
  return dark
    ? { blue: '#3D74FF', pink: '#F2468F', violet: '#9461FF', grid: 'rgb(255 255 255 / 0.08)', axis: 'rgb(255 255 255 / 0.5)', text: 'rgb(255 255 255 / 0.85)', surface: '#121214', target: 'rgb(255 255 255 / 0.45)' }
    : { blue: '#2F6BFF', pink: '#FF4FA3', violet: '#8F5BFF', grid: 'rgb(10 10 10 / 0.07)', axis: 'rgb(10 10 10 / 0.5)', text: 'rgb(10 10 10 / 0.85)', surface: '#FFFFFF', target: 'rgb(10 10 10 / 0.4)' };
}

/** Recessive axes: no axis lines, small muted ticks. */
export function useAxisProps() {
  const c = useChartColors();
  return {
    tick: { fill: c.axis, fontSize: 11, fontWeight: 500 },
    axisLine: false,
    tickLine: false,
  } as const;
}

interface TipItem {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  payload?: Record<string, unknown>;
  dataKey?: string | number;
}

/** Glass tooltip; values in text ink, a colored dot carries series identity. */
export function ChartTooltip({ active, payload, label, unit = '', format }: { active?: boolean; payload?: TipItem[]; label?: ReactNode; unit?: string; format?: (v: number, key?: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass glass-strong min-w-[140px] rounded-2xl px-3 py-2 text-[12px] shadow-xl">
      {label !== undefined && label !== '' && <p className="mb-1 font-semibold text-fg/60">{label}</p>}
      {payload
        .filter((p) => p.value !== undefined && p.value !== null)
        .map((p, i) => (
          <p key={i} className="flex items-center gap-2 py-0.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="flex-1 text-fg/70">{p.name}</span>
            <span className="font-semibold tabular-nums text-fg">{typeof p.value === 'number' ? (format ? format(p.value, String(p.dataKey)) : `${Math.round(p.value * 10) / 10}${unit}`) : String(p.value)}</span>
          </p>
        ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-medium text-fg/65" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.dashed ? <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} /> : <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** A big headline number with context — used where a chart would be overkill. */
export function Stat({ label, value, unit, sub, tone }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: 'blue' | 'pink' }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg/50">{label}</p>
      <p className="mt-1 text-[30px] font-bold leading-none tracking-[-0.03em] tabular-nums">
        <span className={tone === 'blue' ? 'text-blue' : tone === 'pink' ? 'text-pink' : undefined}>{value}</span>
        {unit && <span className="ml-1 text-[15px] font-semibold text-fg/45">{unit}</span>}
      </p>
      {sub && <p className="mt-1 text-[13px] text-fg/55">{sub}</p>}
    </div>
  );
}

/** Accessible data table behind a chart, collapsed by default. */
export function DataTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-[13px]">
      <summary className="cursor-pointer select-none text-[12px] font-semibold text-fg/50 hover:text-fg/80">Show as table</summary>
      <div className="mt-2 max-h-56 overflow-auto rounded-xl ring-1 ring-fg/[0.08]">
        <table className="w-full tabular-nums">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-bg">
            <tr>{columns.map((c) => <th key={c} className="px-3 py-1.5 text-left font-semibold text-fg/60">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-fg/[0.06]">{r.map((v, j) => <td key={j} className="px-3 py-1.5">{v}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
