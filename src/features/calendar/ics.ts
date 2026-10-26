import type { CalEvent, Freq, Recurrence } from '@/lib/types';

// Minimal RFC 5545 support: VEVENTs with DTSTART/DTEND/DURATION, SUMMARY, LOCATION,
// DESCRIPTION, UID, RRULE (FREQ/INTERVAL/BYDAY/UNTIL/COUNT), EXDATE and VALARM triggers.

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function unfold(text: string) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

const unescape = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** Parses 20250314, 20250314T090000 (local / TZID treated as local) or 20250314T090000Z. */
export function parseIcsDate(value: string): { t: number; allDay: boolean } {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) throw new Error(`Unrecognized date: ${value}`);
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) return { t: new Date(+y, +mo - 1, +d).getTime(), allDay: true };
  const args = [+y, +mo - 1, +d, +h, +mi, +(s ?? 0)] as const;
  return { t: z ? Date.UTC(...args) : new Date(...args).getTime(), allDay: false };
}

function parseDuration(v: string) {
  const m = v.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [, sign, w, d, h, mi, s] = m;
  const ms = ((+(w ?? 0) * 7 + +(d ?? 0)) * 86400 + +(h ?? 0) * 3600 + +(mi ?? 0) * 60 + +(s ?? 0)) * 1000;
  return sign === '-' ? -ms : ms;
}

function parseRRule(v: string): Recurrence | undefined {
  const parts = Object.fromEntries(v.split(';').map((p) => p.split('=') as [string, string]));
  const freq = (parts.FREQ ?? '').toLowerCase() as Freq;
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(freq)) return undefined;
  const r: Recurrence = { freq, interval: Number(parts.INTERVAL) || 1 };
  if (parts.BYDAY && freq === 'weekly') {
    const days = parts.BYDAY.split(',').map((d) => DAYS.indexOf(d.replace(/^[+-]?\d+/, ''))).filter((d) => d >= 0);
    if (days.length) r.byDay = days;
  }
  if (parts.UNTIL) r.until = parseIcsDate(parts.UNTIL).t;
  if (parts.COUNT) r.count = Number(parts.COUNT);
  return r;
}

export type ImportedEvent = Omit<CalEvent, 'id' | 'createdAt' | 'updatedAt' | 'color'>;

export function parseIcs(text: string): ImportedEvent[] {
  const out: ImportedEvent[] = [];
  let cur: Record<string, { value: string; params: string }[]> | null = null;
  let inAlarm = false;
  let alarm: number | undefined;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      cur = {};
      alarm = undefined;
      continue;
    }
    if (line === 'BEGIN:VALARM') inAlarm = true;
    if (line === 'END:VALARM') inAlarm = false;
    if (!cur) continue;
    if (line === 'END:VEVENT') {
      const get = (k: string) => cur![k]?.[0];
      const ds = get('DTSTART');
      if (ds) {
        const start = parseIcsDate(ds.value);
        let end: number;
        const de = get('DTEND');
        const du = get('DURATION');
        if (de) end = parseIcsDate(de.value).t;
        else if (du) end = start.t + parseDuration(du.value);
        else end = start.t + (start.allDay ? 86_400_000 : 3_600_000);
        const ex = (cur.EXDATE ?? []).flatMap((e) => e.value.split(',')).map((v) => parseIcsDate(v).t);
        out.push({
          title: unescape(get('SUMMARY')?.value ?? 'Untitled'),
          start: start.t,
          end: Math.max(end, start.t + 15 * 60_000),
          allDay: start.allDay || undefined,
          location: get('LOCATION') ? unescape(get('LOCATION')!.value) : undefined,
          notes: get('DESCRIPTION') ? unescape(get('DESCRIPTION')!.value) : undefined,
          uid: get('UID')?.value,
          rrule: get('RRULE') ? parseRRule(get('RRULE')!.value) : undefined,
          exdates: ex.length ? ex : undefined,
          reminder: alarm,
        });
      }
      cur = null;
      continue;
    }
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const [name, ...params] = line.slice(0, idx).split(';');
    const value = line.slice(idx + 1);
    if (inAlarm) {
      if (name === 'TRIGGER') {
        const ms = parseDuration(value);
        if (ms <= 0) alarm = Math.round(-ms / 60_000);
      }
      continue;
    }
    (cur[name] ??= []).push({ value, params: params.join(';') });
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');
function utc(t: number) {
  const d = new Date(t);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function dateOnly(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** Folds content lines at 75 octets as the spec requires. */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 74;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}

export function toIcs(events: CalEvent[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Eternal Inc.//Universal Planner//EN', 'CALSCALE:GREGORIAN'];
  for (const ev of events) {
    lines.push('BEGIN:VEVENT', `UID:${ev.uid ?? `${ev.id}@universal-planner`}`, `DTSTAMP:${utc(ev.updatedAt)}`);
    if (ev.allDay) lines.push(`DTSTART;VALUE=DATE:${dateOnly(ev.start)}`, `DTEND;VALUE=DATE:${dateOnly(ev.end)}`);
    else lines.push(`DTSTART:${utc(ev.start)}`, `DTEND:${utc(ev.end)}`);
    lines.push(`SUMMARY:${escape(ev.title)}`);
    if (ev.location) lines.push(`LOCATION:${escape(ev.location)}`);
    if (ev.notes) lines.push(`DESCRIPTION:${escape(ev.notes)}`);
    if (ev.rrule) {
      const r = ev.rrule;
      let rule = `RRULE:FREQ=${r.freq.toUpperCase()};INTERVAL=${r.interval}`;
      if (r.byDay?.length) rule += `;BYDAY=${r.byDay.map((d) => DAYS[d]).join(',')}`;
      if (r.until) rule += `;UNTIL=${utc(r.until)}`;
      if (r.count) rule += `;COUNT=${r.count}`;
      lines.push(rule);
    }
    for (const x of ev.exdates ?? []) lines.push(`EXDATE:${utc(x)}`);
    if (ev.reminder !== undefined) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escape(ev.title)}`, `TRIGGER:-PT${ev.reminder}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
