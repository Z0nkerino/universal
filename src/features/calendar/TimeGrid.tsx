import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { motion } from 'framer-motion';
import { Check, MapPin, Repeat } from 'lucide-react';
import { isSameDay, isToday } from 'date-fns';
import type { EventColor } from '@/lib/types';
import { fmt, fmtHour, fmtTime, MIN, minutesOfDay } from '@/lib/dates';
import { useNow } from '@/lib/hooks';
import { useDropZone } from '@/ui/dnd';
import { eventStyle } from './colors';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

export interface GridItem {
  key: string;
  kind: 'event' | 'task';
  id: string;
  title: string;
  start: number;
  end: number;
  color: EventColor;
  done?: boolean;
  recurring?: boolean;
  allDay?: boolean;
  sub?: string;
  /** For recurring events: the occurrence's own start. */
  occStart?: number;
}

interface Props {
  days: Date[];
  items: GridItem[];
  hourHeight?: number;
  onCreate?: (start: number, end: number) => void;
  onChange?: (item: GridItem, start: number, end: number) => void;
  onOpen?: (item: GridItem) => void;
  onToggleTask?: (item: GridItem) => void;
  onDropTask?: (taskId: string, start: number) => void;
  /** Height of the scroll viewport (CSS value). */
  height?: string;
  showDayHeaders?: boolean;
  onDayClick?: (d: Date) => void;
}

const SNAP = 15;
const snap = (m: number) => Math.round(m / SNAP) * SNAP;

type Drag =
  | { mode: 'create'; day: number; a: number; b: number }
  | { mode: 'move'; item: GridItem; day: number; offset: number; start: number; dur: number; moved: boolean }
  | { mode: 'resize'; item: GridItem; day: number; startMin: number; end: number };

/** Side-by-side columns for overlapping blocks within one day. */
function layoutDay(items: GridItem[]) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = new Map<string, { col: number; cols: number }>();
  let cluster: GridItem[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const colEnds: number[] = [];
    const assigned: [GridItem, number][] = [];
    for (const it of cluster) {
      let c = colEnds.findIndex((e) => e <= it.start);
      if (c < 0) c = colEnds.length;
      colEnds[c] = it.end;
      assigned.push([it, c]);
    }
    for (const [it, c] of assigned) out.set(it.key, { col: c, cols: colEnds.length });
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length && it.start >= clusterEnd) flush();
    clusterEnd = cluster.length ? Math.max(clusterEnd, it.end) : it.end;
    cluster.push(it);
  }
  if (cluster.length) flush();
  return out;
}

export function TimeGrid({ days, items, hourHeight = 56, onCreate, onChange, onOpen, onToggleTask, onDropTask, height = 'calc(100dvh - 260px)', showDayHeaders = true, onDayClick }: Props) {
  const t = useT();
  const now = useNow(60_000);
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dropHint, setDropHint] = useState<{ day: number; min: number; dur: number } | null>(null);
  const pxPerMin = hourHeight / 60;

  const dayStarts = useMemo(() => days.map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()), [days]);
  const timed = items.filter((i) => !i.allDay);
  const allDay = items.filter((i) => i.allDay);

  // Clip each block to the days it touches.
  const perDay = useMemo(
    () =>
      dayStarts.map((ds) =>
        timed
          .filter((i) => i.start < ds + 86_400_000 && i.end > ds)
          .map((i) => ({ ...i, start: Math.max(i.start, ds), end: Math.min(i.end, ds + 86_400_000), _orig: i })),
      ),
    [dayStarts, timed],
  );
  const layouts = useMemo(() => perDay.map((d) => layoutDay(d)), [perDay]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hasToday = days.some((d) => isToday(d));
    const firstItem = Math.min(...perDay.flat().map((i) => minutesOfDay(i.start)), 24 * 60);
    const target = hasToday ? Math.max(0, minutesOfDay(Date.now()) - 90) : Math.min(firstItem, 8 * 60) - 30;
    el.scrollTop = Math.max(0, target) * pxPerMin;
    // Only on mount / when the visible days change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayStarts.join(','), hourHeight]);

  const pointToSlot = (x: number, y: number) => {
    const r = colsRef.current!.getBoundingClientRect();
    const day = Math.max(0, Math.min(days.length - 1, Math.floor(((x - r.left) / r.width) * days.length)));
    const min = Math.max(0, Math.min(24 * 60, (y - r.top) / pxPerMin));
    return { day, min };
  };

  const dropProps = useDropZone(`timegrid-${dayStarts[0]}-${days.length}`, {
    accepts: ['task'],
    onHover: (item, x, y) => {
      const { day, min } = pointToSlot(x, y);
      setDropHint({ day, min: snap(min - 15), dur: item.durationMin ?? 30 });
    },
    onLeave: () => setDropHint(null),
    onDrop: (item, x, y) => {
      const { day, min } = pointToSlot(x, y);
      setDropHint(null);
      onDropTask?.(item.id, dayStarts[day] + snap(min - 15) * MIN);
    },
  });

  // Pointer interactions: create on empty space, move on a block, resize from its bottom edge.
  const onPointerDown = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-check]')) return;
    const block = target.closest<HTMLElement>('[data-key]');
    const { day, min } = pointToSlot(e.clientX, e.clientY);
    const touch = e.pointerType !== 'mouse';
    const item = block ? items.find((i) => i.key === block.dataset.key) : undefined;

    let d: Drag | null = null;
    if (item && target.closest('[data-resize]') && onChange) d = { mode: 'resize', item, day, startMin: minutesOfDay(item.start), end: snap(minutesOfDay(item.end) || 24 * 60) };
    else if (item) d = { mode: 'move', item, day, offset: min - (item.start - dayStarts[day]) / MIN, start: item.start, dur: (item.end - item.start) / MIN, moved: false };
    else if (onCreate) {
      if (touch) {
        // Tap to create a one-hour block on touch screens.
        const s = Math.floor(min / 30) * 30;
        const sx = e.clientX;
        const sy = e.clientY;
        const up = (ev: PointerEvent) => {
          removeEventListener('pointerup', up);
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) onCreate(dayStarts[day] + s * MIN, dayStarts[day] + (s + 60) * MIN);
        };
        addEventListener('pointerup', up);
        return;
      }
      d = { mode: 'create', day, a: snap(min), b: snap(min) };
    }
    if (!d) return;
    if (!touch) e.preventDefault();

    let current = d;
    let activated = !touch;
    const holdTimer = touch ? window.setTimeout(() => ((activated = true), navigator.vibrate?.(8)), 260) : 0;
    const sx = e.clientX;
    const sy = e.clientY;
    if (activated) setDrag(current);

    const move = (ev: PointerEvent) => {
      if (!activated) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) cleanup();
        return;
      }
      ev.preventDefault();
      const p = pointToSlot(ev.clientX, ev.clientY);
      if (current.mode === 'create') current = { ...current, b: snap(p.min), day: current.day };
      else if (current.mode === 'move') {
        const startMin = Math.max(0, Math.min(24 * 60 - current.dur, snap(p.min - current.offset)));
        const start = dayStarts[p.day] + startMin * MIN;
        current = { ...current, day: p.day, start, moved: current.moved || Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4 };
      } else if (current.mode === 'resize') current = { ...current, end: Math.max(current.startMin + SNAP, snap(p.min)) };
      setDrag(current);
    };
    const up = () => {
      const c = current;
      cleanup();
      if (!activated) {
        if (item) onOpen?.(item);
        return;
      }
      if (c.mode === 'create') {
        const a = Math.min(c.a, c.b);
        const b = Math.max(c.a, c.b);
        const s = dayStarts[c.day] + a * MIN;
        onCreate?.(s, dayStarts[c.day] + (b - a < SNAP ? a + 60 : b) * MIN);
      } else if (c.mode === 'move') {
        if (!c.moved) onOpen?.(c.item);
        else if (c.start !== c.item.start) onChange?.(c.item, c.start, c.start + c.dur * MIN);
      } else if (c.mode === 'resize') {
        const end = dayStarts[c.day] + c.end * MIN;
        if (end !== c.item.end) onChange?.(c.item, c.item.start, end);
      }
    };
    const cleanup = () => {
      clearTimeout(holdTimer);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cleanup);
      setDrag(null);
    };
    addEventListener('pointermove', move, { passive: false });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cleanup);
  };

  const ghost = (() => {
    if (!drag) return null;
    if (drag.mode === 'create') {
      const a = Math.min(drag.a, drag.b);
      const b = Math.max(drag.a, drag.b, a + SNAP);
      return { day: drag.day, top: a, h: b - a, label: `${fmtTime(dayStarts[drag.day] + a * MIN)} – ${fmtTime(dayStarts[drag.day] + b * MIN)}`, color: 'blue' as EventColor };
    }
    if (drag.mode === 'move' && drag.moved) return { day: drag.day, top: (drag.start - dayStarts[drag.day]) / MIN, h: drag.dur, label: `${drag.item.title} · ${fmtTime(drag.start)}`, color: drag.item.color };
    if (drag.mode === 'resize') return { day: drag.day, top: drag.startMin, h: drag.end - drag.startMin, label: `${drag.item.title} · ${t('until')} ${fmtTime(dayStarts[drag.day] + drag.end * MIN)}`, color: drag.item.color };
    return null;
  })();
  const draggingKey = drag && drag.mode !== 'create' && (drag.mode !== 'move' || drag.moved) ? drag.item.key : null;

  useEffect(() => {
    // Keep the time grid's drag state sane if the window loses focus mid-drag.
    const reset = () => setDrag(null);
    addEventListener('blur', reset);
    return () => removeEventListener('blur', reset);
  }, []);

  return (
    <div className="flex flex-col">
      {showDayHeaders && (
        <div className="flex border-b border-fg/[0.06] pb-2 pl-14">
          {days.map((d) => (
            <button
              key={d.getTime()}
              type="button"
              onClick={() => onDayClick?.(d)}
              className={cn('flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1 transition-colors', onDayClick && 'hover:bg-fg/[0.04]')}
            >
              <span className={cn('text-[11px] font-semibold uppercase tracking-[0.08em]', isToday(d) ? 'text-pink' : 'text-fg/55')}>{fmt(d, 'EEE')}</span>
              <span className={cn('flex h-8 w-8 items-center justify-center rounded-full text-[17px] font-bold', isToday(d) && 'bg-brand text-white')}>{fmt(d, 'd')}</span>
            </button>
          ))}
        </div>
      )}
      {allDay.length > 0 && (
        <div className="flex gap-0 border-b border-fg/[0.06] py-1.5 pl-14">
          {days.map((_, di) => (
            <div key={di} className="flex min-w-0 flex-1 flex-col gap-1 px-0.5">
              {allDay
                .filter((i) => i.start < dayStarts[di] + 86_400_000 && i.end > dayStarts[di])
                .map((i) => (
                  <button key={i.key} type="button" onClick={() => onOpen?.(i)} className="truncate rounded-md px-2 py-0.5 text-left text-[12px] font-semibold" style={eventStyle(i.color)}>
                    {i.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
      <div ref={scrollRef} className="thin-scrollbar relative overflow-y-auto" style={{ height }}>
        <div className="relative flex" style={{ height: 24 * hourHeight }}>
          <div className="relative w-14 shrink-0" aria-hidden>
            {Array.from({ length: 23 }, (_, h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] font-medium tabular-nums text-fg/40" style={{ top: (h + 1) * hourHeight }}>
                {fmtHour(h + 1)}
              </span>
            ))}
          </div>
          <div
            ref={colsRef}
            {...dropProps}
            onPointerDown={onPointerDown}
            className="relative flex flex-1 select-none"
            style={{ backgroundImage: `repeating-linear-gradient(to bottom, rgb(var(--fg) / 0.06) 0 1px, transparent 1px ${hourHeight}px)`, touchAction: 'pan-y' }}
            role="grid"
            aria-label={t('Time grid')}
          >
            {days.map((d, di) => (
              <div key={di} className={cn('relative flex-1 border-l border-fg/[0.05]', isToday(d) && 'bg-blue/[0.025]')} role="gridcell" aria-label={fmt(d, 'EEEE d MMMM')}>
                {perDay[di].map((it) => {
                  const l = layouts[di].get(it.key) ?? { col: 0, cols: 1 };
                  const top = minutesOfDay(it.start) * pxPerMin;
                  const h = Math.max(18, ((it.end - it.start) / MIN) * pxPerMin - 2);
                  const short = h < 40;
                  return (
                    <div
                      key={it.key}
                      data-key={it.key}
                      className={cn(
                        'group absolute cursor-pointer overflow-hidden rounded-[10px] px-2 text-[12px] leading-tight shadow-[0_1px_2px_rgb(0_0_0/.04)] transition-opacity',
                        draggingKey === it.key && 'opacity-30',
                        it.done && 'opacity-50',
                        short ? 'flex items-center gap-1 py-0' : 'py-1.5',
                      )}
                      style={{
                        top,
                        height: h,
                        left: `calc(${(l.col / l.cols) * 100}% + 2px)`,
                        width: `calc(${100 / l.cols}% - 4px)`,
                        touchAction: 'none',
                        ...eventStyle(it.color, it.kind === 'task'),
                        ...(it.kind === 'task' ? { background: 'rgb(var(--bg) / 0.7)', outline: '1px dashed currentColor', outlineOffset: -1 } : {}),
                      }}
                      title={`${it.title} · ${fmtTime(it.start)}–${fmtTime(it.end)}`}
                    >
                      <div className={cn('flex items-start gap-1.5', short && 'items-center')}>
                        {it.kind === 'task' && (
                          <button
                            type="button"
                            data-check
                            aria-label={it.done ? t('Mark not done') : t('Mark done')}
                            onClick={() => onToggleTask?.(it)}
                            className={cn('mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-current', it.done && 'bg-current')}
                          >
                            {it.done && <Check size={9} strokeWidth={4} className="text-bg" />}
                          </button>
                        )}
                        <span className={cn('min-w-0 flex-1 font-semibold', short ? 'truncate' : 'line-clamp-2', it.done && 'line-through')}>{it.title}</span>
                        {it.recurring && <Repeat size={10} className="mt-0.5 shrink-0 opacity-70" aria-label={t('Repeats')} />}
                      </div>
                      {!short && (
                        <p className="mt-0.5 truncate text-[11px] font-medium opacity-75">
                          {fmtTime(it.start)} – {fmtTime(it.end)}
                          {it.sub && (
                            <>
                              {' · '}
                              <MapPin size={9} className="inline" aria-hidden /> {it.sub}
                            </>
                          )}
                        </p>
                      )}
                      {onChange && <span data-resize className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100" style={{ background: 'linear-gradient(transparent, currentColor)' }} aria-hidden />}
                    </div>
                  );
                })}
                {isSameDay(d, now) && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: minutesOfDay(now.getTime()) * pxPerMin }} aria-label={t('Now')}>
                    <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-pink shadow-[0_0_0_3px_rgb(var(--bg))]" />
                    <span className="h-[2px] flex-1 bg-pink" />
                  </div>
                )}
                {ghost && ghost.day === di && (
                  <motion.div
                    layout
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    className="pointer-events-none absolute inset-x-1 z-20 overflow-hidden rounded-[10px] px-2 py-1 text-[12px] font-semibold shadow-lg ring-2 ring-white/50"
                    style={{ top: ghost.top * pxPerMin, height: Math.max(18, ghost.h * pxPerMin - 2), ...eventStyle(ghost.color), background: `color-mix(in srgb, ${'var(--blue)'} 22%, rgb(var(--bg)))` }}
                  >
                    {ghost.label}
                  </motion.div>
                )}
                {dropHint && dropHint.day === di && (
                  <div className="pointer-events-none absolute inset-x-1 z-20 rounded-[10px] border-2 border-dashed border-blue bg-blue/10 px-2 py-1 text-[12px] font-semibold text-blue" style={{ top: dropHint.min * pxPerMin, height: dropHint.dur * pxPerMin }}>
                    {fmtTime(dayStarts[di] + dropHint.min * MIN)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
