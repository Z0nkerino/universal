import { useMemo } from 'react';
import { addDays, isSameMonth, isToday, startOfMonth } from 'date-fns';
import type { Occurrence } from '@/lib/types';
import { dayKey, fmt, fmtTime, weekStart } from '@/lib/dates';
import { beginDrag, useDnd, useDropZone } from '@/ui/dnd';
import { EVENT_HEX } from './colors';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

interface Props {
  month: Date;
  occurrences: Occurrence[];
  onOpenDay: (d: Date) => void;
  onCreate: (d: Date) => void;
  onOpen: (o: Occurrence) => void;
  onMove: (o: Occurrence, toDay: Date) => void;
}

export function monthGridDays(month: Date) {
  const first = weekStart(startOfMonth(month));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

function Cell({ d, month, occ, props }: { d: Date; month: Date; occ: Occurrence[]; props: Props }) {
  const t = useT();
  const over = useDnd((s) => s.over);
  const zone = `month-${dayKey(d)}`;
  const drop = useDropZone(zone, {
    accepts: ['event'],
    onDrop: (item) => {
      const [id, start] = item.id.split('|');
      const o = props.occurrences.find((x) => x.event.id === id && x.start === Number(start));
      if (o) props.onMove(o, d);
    },
  });
  const shown = occ.slice(0, 3);
  return (
    <div
      {...drop}
      role="gridcell"
      aria-label={fmt(d, 'EEEE d MMMM')}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onCreate(d);
      }}
      className={cn('relative flex min-h-[92px] min-w-0 flex-col gap-0.5 border-l border-t border-fg/[0.06] p-1 transition-colors sm:min-h-[112px]', !isSameMonth(d, month) && 'bg-fg/[0.02]', over === zone && 'bg-blue/10')}
    >
      <button type="button" onClick={() => props.onOpenDay(d)} className={cn('mb-0.5 flex h-7 w-7 items-center justify-center self-start rounded-full text-[13px] font-semibold tabular-nums', isToday(d) ? 'bg-brand text-white' : isSameMonth(d, month) ? 'text-fg/80 hover:bg-fg/[0.06]' : 'text-fg/30')}>
        {fmt(d, 'd')}
      </button>
      {shown.map((o) => (
        <button
          key={`${o.event.id}:${o.start}`}
          type="button"
          onPointerDown={(e) => beginDrag(e, { kind: 'event', id: `${o.event.id}|${o.start}`, label: o.event.title }, () => props.onOpen(o))}
          onKeyDown={(e) => e.key === 'Enter' && props.onOpen(o)}
          className="flex min-w-0 items-center gap-1 rounded-md px-1 py-[1px] text-left text-[11px] font-semibold hover:bg-fg/[0.05] sm:text-[12px]"
          style={{ touchAction: 'none' }}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: EVENT_HEX[o.event.color] }} />
          {!o.event.allDay && <span className="hidden shrink-0 font-medium text-fg/60 sm:inline">{fmtTime(o.start)}</span>}
          <span className="truncate">{o.event.title}</span>
        </button>
      ))}
      {occ.length > 3 && (
        <button type="button" onClick={() => props.onOpenDay(d)} className="px-1 text-left text-[11px] font-semibold text-fg/60 hover:text-fg">
          +{occ.length - 3} {t('more')}
        </button>
      )}
    </div>
  );
}

export function MonthView(props: Props) {
  const days = useMemo(() => monthGridDays(props.month), [props.month]);
  const byDay = useMemo(() => {
    const m = new Map<string, Occurrence[]>();
    for (const o of props.occurrences) {
      // Multi-day events appear on each day they cover.
      for (let d = new Date(o.start); d.getTime() < o.end; d = addDays(d, 1)) {
        const k = dayKey(d);
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(o);
        if (o.end - o.start < 86_400_000) break;
      }
    }
    return m;
  }, [props.occurrences]);
  return (
    <div>
      <div className="grid grid-cols-7 pb-2">
        {days.slice(0, 7).map((d) => (
          <span key={d.getTime()} className="text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-fg/60">{fmt(d, 'EEE')}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-[18px] border-b border-r border-fg/[0.06]" role="grid">
        {days.map((d) => (
          <Cell key={d.getTime()} d={d} month={props.month} occ={byDay.get(dayKey(d)) ?? []} props={props} />
        ))}
      </div>
    </div>
  );
}

export function YearView({ year, occurrences, onOpenMonth, onOpenDay }: { year: number; occurrences: Occurrence[]; onOpenMonth: (m: Date) => void; onOpenDay: (d: Date) => void }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of occurrences) m.set(dayKey(o.start), (m.get(dayKey(o.start)) ?? 0) + 1);
    return m;
  }, [occurrences]);
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, mi) => {
        const month = new Date(year, mi, 1);
        const days = monthGridDays(month);
        return (
          <section key={mi} aria-label={fmt(month, 'MMMM yyyy')}>
            <button type="button" onClick={() => onOpenMonth(month)} className="mb-2 px-1 text-[15px] font-bold tracking-[-0.01em] hover:text-blue">
              {fmt(month, 'LLLL')}
            </button>
            <div className="grid grid-cols-7 gap-0.5">
              {days.slice(0, 7).map((d) => (
                <span key={d.getTime()} className="text-center text-[10px] font-semibold text-fg/60">{fmt(d, 'EEEEE')}</span>
              ))}
              {days.map((d) => {
                const n = isSameMonth(d, month) ? counts.get(dayKey(d)) ?? 0 : 0;
                return (
                  <button
                    key={d.getTime()}
                    type="button"
                    disabled={!isSameMonth(d, month)}
                    onClick={() => onOpenDay(d)}
                    aria-label={`${fmt(d, 'd MMMM')}${n ? `, ${n}` : ''}`}
                    className={cn('flex aspect-square items-center justify-center rounded-md text-[11px] font-medium tabular-nums transition-colors', !isSameMonth(d, month) ? 'invisible' : isToday(d) ? 'bg-brand font-bold text-white' : 'hover:bg-fg/[0.08]')}
                    style={n && !isToday(d) ? { background: `rgb(47 107 255 / ${Math.min(0.12 + n * 0.12, 0.55)})` } : undefined}
                  >
                    {fmt(d, 'd')}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
