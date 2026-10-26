import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { addDays, addMonths, addWeeks, addYears, startOfDay, startOfMonth, startOfYear } from 'date-fns';
import { ChevronLeft, ChevronRight, Download, Plus, Upload } from 'lucide-react';
import { PageHeader } from '@/ui/PageHeader';
import { Glass } from '@/ui/Glass';
import { Button, IconButton } from '@/ui/Button';
import { Segmented } from '@/ui/Segmented';
import { toast } from '@/ui/Toast';
import { useT } from '@/lib/i18n';
import { fmt, weekStart } from '@/lib/dates';
import { db, stamp } from '@/lib/db';
import { scheduleTask, setTaskDone } from '@/lib/actions';
import type { CalEvent } from '@/lib/types';
import { moveOccurrence, useCalendarState, ORDER, type CalView } from './calendarState';
import { useIsDesktop } from '@/lib/hooks';
import { useTaskEditor } from '@/features/planner/store';
import { QuickAdd } from '@/features/planner/QuickAdd';
import { TimeGrid, type GridItem } from './TimeGrid';
import { MonthView, YearView, monthGridDays } from './MonthView';
import { toGridItems, useBlockedTasks, useOccurrences } from './data';
import { useEventEditor } from './editorStore';
import { parseIcs, toIcs } from './ics';
import { itemVariants } from '@/lib/motion';

function rangeFor(view: CalView, cursor: Date) {
  if (view === 'day') return { from: startOfDay(cursor), to: addDays(startOfDay(cursor), 1) };
  if (view === 'week') {
    const s = weekStart(cursor);
    return { from: s, to: addDays(s, 7) };
  }
  if (view === 'month') {
    const days = monthGridDays(cursor);
    return { from: days[0], to: addDays(days[41], 1) };
  }
  return { from: startOfYear(cursor), to: addYears(startOfYear(cursor), 1) };
}

export default function CalendarPage() {
  const t = useT();
  const desktop = useIsDesktop();
  const { view, cursor: cursorMs, set } = useCalendarState();
  const cursor = new Date(cursorMs);
  const openTask = useTaskEditor((s) => s.open);
  const { openNew, openExisting } = useEventEditor();
  const fileRef = useRef<HTMLInputElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);

  const { from, to } = useMemo(() => rangeFor(view, cursor), [view, cursorMs]); // eslint-disable-line react-hooks/exhaustive-deps
  const occ = useOccurrences(from.getTime(), to.getTime());
  const blocked = useBlockedTasks(from.getTime(), to.getTime());
  const items = useMemo(() => toGridItems(occ, blocked), [occ, blocked]);

  const step = (dir: 1 | -1) => {
    const fn = { day: addDays, week: addWeeks, month: addMonths, year: addYears }[view];
    set({ cursor: fn(cursor, dir).getTime() });
  };

  // Pinch on a trackpad (ctrl+wheel) or Ctrl/⌘+scroll zooms between day ↔ week ↔ month ↔ year.
  useEffect(() => {
    const el = zoomRef.current;
    if (!el) return;
    let acc = 0;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      acc += e.deltaY;
      const now = Date.now();
      if (Math.abs(acc) < 40 || now - last < 450) return;
      const v = useCalendarState.getState().view;
      const i = ORDER.indexOf(v) + (acc > 0 ? 1 : -1);
      acc = 0;
      last = now;
      if (i >= 0 && i < ORDER.length) set({ view: ORDER[i] });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [set]);

  // Keyboard: ←/→ to page, T for today, D/W/M/Y for views.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (/input|textarea|select/i.test(el.tagName) || el.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role=dialog]')) return;
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 't') set({ cursor: startOfDay(new Date()).getTime() });
      else if (e.key === 'd') set({ view: 'day' });
      else if (e.key === 'w') set({ view: 'week' });
      else if (e.key === 'm') set({ view: 'month' });
      else if (e.key === 'y') set({ view: 'year' });
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const title =
    view === 'day' ? fmt(cursor, 'EEEE, d MMMM') : view === 'week' ? `${fmt(from, 'd MMM')} – ${fmt(addDays(to, -1), 'd MMM yyyy')}` : view === 'month' ? fmt(cursor, 'LLLL yyyy') : fmt(cursor, 'yyyy');

  const onGridChange = async (it: GridItem, start: number, end: number) => {
    if (it.kind === 'task') return scheduleTask(it.id, start, (end - start) / 60_000);
    const o = occ.find((x) => x.event.id === it.id && x.start === it.occStart);
    if (o) await moveOccurrence(o, start, end, t);
  };

  const exportIcs = async () => {
    const events = await db.events.toArray();
    const blob = new Blob([toIcs(events)], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'universal-planner.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`${t('Exported')} ${events.length} ${t('events')}`);
  };

  const importIcs = async (file: File) => {
    try {
      const parsed = parseIcs(await file.text());
      const existing = new Set((await db.events.toArray()).map((e) => e.uid).filter(Boolean));
      const fresh = parsed.filter((e) => !e.uid || !existing.has(e.uid));
      await db.events.bulkAdd(fresh.map((e) => stamp({ ...e, color: 'blue' as const }) as CalEvent));
      toast(`${t('Imported')} ${fresh.length} ${t('events')}${parsed.length > fresh.length ? ` · ${parsed.length - fresh.length} ${t('already there')}` : ''}`);
    } catch (err) {
      toast(`${t('Couldn’t read that calendar file')}: ${(err as Error).message}`, { tone: 'error' });
    }
  };

  const gridDays = view === 'day' ? [cursor] : view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(from, i)) : [];

  return (
    <>
      <PageHeader
        title={t('nav.calendar')}
        actions={
          <>
            <IconButton icon={Upload} label={t('Import .ics')} onClick={() => fileRef.current?.click()} />
            <IconButton icon={Download} label={t('Export .ics')} onClick={() => void exportIcs()} />
            <Button icon={Plus} variant="primary" onClick={() => {
              const s = new Date(view === 'day' ? cursor : new Date());
              s.setMinutes(0, 0, 0);
              s.setHours(Math.min(22, new Date().getHours() + 1));
              openNew(s.getTime(), s.getTime() + 3_600_000);
            }}>
              {desktop ? t('New event') : ''}
            </Button>
            <input ref={fileRef} type="file" accept=".ics,text/calendar" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importIcs(f);
            }} />
          </>
        }
      />

      <motion.div variants={itemVariants} className="mb-4">
        <QuickAdd placeholder={t('Add an event — “Dinner with Lina Saturday 8pm for 2h”')} />
      </motion.div>

      <motion.div variants={itemVariants}>
        <Glass shimmer={false} radius="xl" className="p-3 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <IconButton icon={ChevronLeft} label={t('Previous')} onClick={() => step(-1)} />
              <IconButton icon={ChevronRight} label={t('Next')} onClick={() => step(1)} />
              <Button size="sm" variant="ghost" onClick={() => set({ cursor: startOfDay(new Date()).getTime() })}>{t('Today')}</Button>
              <h2 className="ml-1 text-[19px] font-bold capitalize tracking-[-0.02em] sm:text-[22px]" aria-live="polite">{title}</h2>
            </div>
            <Segmented
              label={t('Calendar view')}
              value={view}
              onChange={(v) => set({ view: v })}
              options={[
                { value: 'day', label: t('Day') },
                { value: 'week', label: t('Week') },
                { value: 'month', label: t('Month') },
                { value: 'year', label: t('Year') },
              ]}
            />
          </div>
          <div ref={zoomRef}>
            {/* Zoom-in feel between views; enter-only so page transitions never stall. */}
              <motion.div
                key={view}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              >
                {(view === 'day' || view === 'week') && (
                  <div className={view === 'week' ? '-mx-1 overflow-x-auto' : ''}>
                    <div className={view === 'week' ? 'min-w-[640px]' : ''}>
                      <TimeGrid
                        days={gridDays}
                        items={items}
                        onCreate={(s, e) => openNew(s, e)}
                        onOpen={(it) => (it.kind === 'task' ? openTask(it.id) : void openExisting(it.id, it.occStart))}
                        onChange={(it, s, e) => void onGridChange(it, s, e)}
                        onToggleTask={(it) => void setTaskDone(it.id, !it.done)}
                        onDropTask={(id, s) => void scheduleTask(id, s)}
                        onDayClick={(d) => set({ view: 'day', cursor: d.getTime() })}
                      />
                    </div>
                  </div>
                )}
                {view === 'month' && (
                  <MonthView
                    month={startOfMonth(cursor)}
                    occurrences={occ}
                    onOpenDay={(d) => set({ view: 'day', cursor: d.getTime() })}
                    onCreate={(d) => {
                      const s = new Date(d);
                      s.setHours(9, 0, 0, 0);
                      openNew(s.getTime(), s.getTime() + 3_600_000);
                    }}
                    onOpen={(o) => void openExisting(o.event.id, o.start)}
                    onMove={(o, d) => {
                      const s = new Date(o.start);
                      const target = new Date(d);
                      target.setHours(s.getHours(), s.getMinutes(), 0, 0);
                      if (target.getTime() !== o.start) void moveOccurrence(o, target.getTime(), target.getTime() + (o.end - o.start), t);
                    }}
                  />
                )}
                {view === 'year' && (
                  <YearView
                    year={cursor.getFullYear()}
                    occurrences={occ}
                    onOpenMonth={(m) => set({ view: 'month', cursor: m.getTime() })}
                    onOpenDay={(d) => set({ view: 'day', cursor: d.getTime() })}
                  />
                )}
              </motion.div>
          </div>
          <p className="mt-3 hidden text-[12px] text-fg/60 lg:block">
            {t('Drag to create · drag events to move · drag the bottom edge to resize · pinch or Ctrl+scroll to zoom · ← → to page')}
          </p>
        </Glass>
      </motion.div>
    </>
  );
}
