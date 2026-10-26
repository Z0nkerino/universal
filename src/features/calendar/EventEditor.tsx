import { useEffect, useState } from 'react';
import { Bell, MapPin, Repeat, Trash2, X } from 'lucide-react';
import { createEvent, deleteEvent, skipOccurrence, updateEvent } from '@/lib/actions';
import { EVENT_COLORS, type EventColor, type Freq, type Recurrence } from '@/lib/types';
import { Sheet } from '@/ui/Sheet';
import { Button, IconButton } from '@/ui/Button';
import { Field, Input, Select, TextArea } from '@/ui/Field';
import { Switch } from '@/ui/Segmented';
import { choose } from '@/ui/Confirm';
import { toast } from '@/ui/Toast';
import { useT } from '@/lib/i18n';
import { dayKey, fromDayKey } from '@/lib/dates';
import { EVENT_HEX, EVENT_LABEL } from './colors';
import { cn } from '@/lib/cn';
import { useEventEditor, type Draft } from './editorStore';

const REPEATS: { value: string; label: string; rule?: Recurrence }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day', rule: { freq: 'daily', interval: 1 } },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)', rule: { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] } },
  { value: 'weekly', label: 'Every week', rule: { freq: 'weekly', interval: 1 } },
  { value: 'biweekly', label: 'Every 2 weeks', rule: { freq: 'weekly', interval: 2 } },
  { value: 'monthly', label: 'Every month', rule: { freq: 'monthly', interval: 1 } },
  { value: 'yearly', label: 'Every year', rule: { freq: 'yearly', interval: 1 } },
];
function repeatValue(r?: Recurrence) {
  if (!r) return 'none';
  if (r.freq === 'weekly' && r.byDay?.length === 5 && !r.byDay.includes(0) && !r.byDay.includes(6)) return 'weekdays';
  if (r.freq === 'weekly' && r.interval === 2) return 'biweekly';
  return r.freq as Freq;
}
const REMINDERS = [undefined, 0, 5, 10, 15, 30, 60, 120, 1440];

const timeOf = (t: number) => new Date(t).toTimeString().slice(0, 5);
function combine(day: string, time: string) {
  const d = fromDayKey(day);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

export function EventEditor() {
  const t = useT();
  const { draft: initial, occStart, close } = useEventEditor();
  const [d, setD] = useState<Draft | null>(null);
  useEffect(() => setD(initial ? { ...initial } : null), [initial]);
  if (!d && !initial) return <Sheet open={false} onClose={close} label="">{null}</Sheet>;

  const set = (p: Partial<Draft>) => setD((x) => (x ? { ...x, ...p } : x));
  const isNew = !d?.id;
  const durMs = d ? d.end - d.start : 0;

  const save = async () => {
    if (!d) return;
    const title = d.title.trim() || t('New event');
    if (d.end <= d.start) return toast(t('The event must end after it starts'), { tone: 'error' });
    if (isNew) {
      await createEvent({ ...d, title });
      toast(`${t('Event added')} · ${title}`);
    } else {
      const { id, ...rest } = d;
      await updateEvent(id!, { ...rest, title });
      toast(t('Event updated'));
    }
    close();
  };

  const remove = async () => {
    if (!d?.id) return;
    if (d.rrule && occStart !== undefined) {
      const which = await choose({ title: t('Delete repeating event'), options: [{ label: t('Only this event'), value: 'one' }, { label: t('All events in the series'), value: 'all', primary: true }] });
      if (!which) return;
      if (which === 'one') await skipOccurrence(d.id, occStart);
      else await deleteEvent(d.id);
    } else {
      const which = await choose({ title: t('Delete this event?'), body: `“${d.title}”`, options: [{ label: t('Delete'), value: 'all', primary: true }] });
      if (!which) return;
      await deleteEvent(d.id);
    }
    toast(t('Event deleted'));
    close();
  };

  return (
    <Sheet open={!!initial} onClose={close} label={isNew ? t('New event') : t('Edit event')} className="max-w-xl">
      {d && (
        <form
          className="thin-scrollbar max-h-[86dvh] overflow-y-auto p-5 sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="flex items-start gap-2">
            <input
              autoFocus={isNew}
              value={d.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={t('Event name')}
              aria-label={t('Title')}
              className="min-w-0 flex-1 bg-transparent text-[24px] font-bold tracking-[-0.02em] placeholder:text-fg/30 focus-visible:outline-none"
            />
            <IconButton icon={X} label={t('Close')} onClick={close} />
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-[14px] bg-fg/[0.04] px-3.5 py-2 sm:col-span-2">
              <span className="text-[15px] font-semibold">{t('All day')}</span>
              <Switch
                label={t('All day')}
                checked={!!d.allDay}
                onChange={(allDay) => {
                  const day = fromDayKey(dayKey(d.start)).getTime();
                  set(allDay ? { allDay, start: day, end: day + 86_400_000, reminder: undefined } : { allDay: false, start: day + 9 * 3_600_000, end: day + 10 * 3_600_000 });
                }}
              />
            </div>
            <Field label={t('Date')} htmlFor="ev-date">
              <Input id="ev-date" type="date" value={dayKey(d.start)} onChange={(e) => e.target.value && set({ start: combine(e.target.value, timeOf(d.start)), end: combine(e.target.value, timeOf(d.start)) + durMs })} />
            </Field>
            {!d.allDay ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('Starts')} htmlFor="ev-start">
                  <Input id="ev-start" type="time" value={timeOf(d.start)} onChange={(e) => e.target.value && set({ start: combine(dayKey(d.start), e.target.value), end: combine(dayKey(d.start), e.target.value) + durMs })} />
                </Field>
                <Field label={t('Ends')} htmlFor="ev-end">
                  <Input
                    id="ev-end"
                    type="time"
                    value={timeOf(d.end)}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      let end = combine(dayKey(d.start), e.target.value);
                      if (end <= d.start) end += 86_400_000; // crosses midnight
                      set({ end });
                    }}
                  />
                </Field>
              </div>
            ) : (
              <Field label={t('Days')} htmlFor="ev-days">
                <Select id="ev-days" value={Math.max(1, Math.round(durMs / 86_400_000))} onChange={(e) => set({ end: d.start + Number(e.target.value) * 86_400_000 })}>
                  {[1, 2, 3, 4, 5, 6, 7, 14].map((n) => (
                    <option key={n} value={n}>{n} {n === 1 ? t('day') : t('days')}</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label={t('Repeat')} htmlFor="ev-repeat">
              <div className="relative">
                <Repeat size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg/60" aria-hidden />
                <Select id="ev-repeat" className="pl-10" value={repeatValue(d.rrule)} onChange={(e) => set({ rrule: REPEATS.find((r) => r.value === e.target.value)?.rule })}>
                  {REPEATS.map((r) => (
                    <option key={r.value} value={r.value}>{t(r.label)}</option>
                  ))}
                </Select>
              </div>
            </Field>
            <Field label={t('Reminder')} htmlFor="ev-rem">
              <div className="relative">
                <Bell size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg/60" aria-hidden />
                <Select id="ev-rem" className="pl-10" value={d.reminder ?? ''} onChange={(e) => set({ reminder: e.target.value === '' ? undefined : Number(e.target.value) })}>
                  {REMINDERS.map((m) => (
                    <option key={String(m)} value={m ?? ''}>
                      {m === undefined ? t('None') : m === 0 ? t('At start time') : m >= 1440 ? t('1 day before') : m >= 60 ? `${m / 60} ${t('h')} ${t('before')}` : `${m} min ${t('before')}`}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
            <Field label={t('Location')} htmlFor="ev-loc" className="sm:col-span-2">
              <div className="relative">
                <MapPin size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg/60" aria-hidden />
                <Input id="ev-loc" className="pl-10" value={d.location ?? ''} onChange={(e) => set({ location: e.target.value || undefined })} placeholder={t('Add a place')} />
              </div>
            </Field>
            <Field label={t('Category')} className="sm:col-span-2">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('Category')}>
                {EVENT_COLORS.map((c: EventColor) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={d.color === c}
                    onClick={() => set({ color: c })}
                    className={cn('flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-semibold transition-colors', d.color === c ? 'bg-fg/[0.1] text-fg' : 'text-fg/60 hover:bg-fg/[0.05]')}
                  >
                    <span className="h-3 w-3 rounded-full" style={{ background: EVENT_HEX[c], boxShadow: d.color === c ? `0 0 0 3px color-mix(in srgb, ${EVENT_HEX[c]} 30%, transparent)` : undefined }} />
                    {t(EVENT_LABEL[c])}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t('Notes')} htmlFor="ev-notes" className="sm:col-span-2">
              <TextArea id="ev-notes" value={d.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} />
            </Field>
          </div>
          {!isNew && d.rrule && <p className="mt-3 px-1 text-[12px] text-fg/60">{t('Changes apply to every event in this series.')}</p>}
          <div className="mt-6 flex items-center justify-between gap-2 border-t border-fg/[0.06] pt-4">
            {!isNew ? (
              <Button variant="ghost" size="sm" icon={Trash2} className="text-[#E5484D] hover:text-[#E5484D]" onClick={() => void remove()}>
                {t('Delete')}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={close}>{t('Cancel')}</Button>
              <Button type="submit" variant="primary">{isNew ? t('Add event') : t('Save')}</Button>
            </div>
          </div>
        </form>
      )}
    </Sheet>
  );
}
