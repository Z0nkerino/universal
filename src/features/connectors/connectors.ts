import { create } from 'zustand';
import { db, getKV, setKV, uid } from '@/lib/db';
import { nativeRequest, type HttpRequest, type HttpResponse } from '@/lib/desktop';
import { onAppEvent, type AppEvent, type AppEventType } from '@/lib/events';
import { exportBackup } from '@/lib/backup';
import { activeProfile } from '@/lib/profiles';
import { resolveLang, tNow } from '@/lib/i18n';
import { useSettings } from '@/lib/settings';
import type { CalEvent, EventColor } from '@/lib/types';
import { parseIcs } from '@/features/calendar/ics';
import { weatherLabel, type WeatherData } from './weather';

export { getWeather, weatherLabel, type WeatherData } from './weather';

/**
 * Connectors link the planner to outside services. Requests go straight from this device to
 * the service; there is no Universal Planner server in between.
 */
export type ConnectorType = 'calendar' | 'holidays' | 'weather' | 'webhook' | 'backup';

export interface CalendarConfig {
  provider: 'google' | 'outlook' | 'icloud' | 'ics';
  url: string;
  color: EventColor;
}
export interface HolidaysConfig {
  country: string;
  color: EventColor;
}
export interface WeatherConfig {
  place: string;
  lat: number;
  lon: number;
  unit: 'c' | 'f';
}
export interface WebhookConfig {
  url: string;
  service: 'zapier' | 'make' | 'ifttt' | 'discord' | 'slack' | 'custom';
  events: AppEventType[];
}
export interface BackupConfig {
  folder: string;
  /** Days of daily backups to keep. */
  keep: number;
}
interface Configs {
  calendar: CalendarConfig;
  holidays: HolidaysConfig;
  weather: WeatherConfig;
  webhook: WebhookConfig;
  backup: BackupConfig;
}

export interface Connector<T extends ConnectorType = ConnectorType> {
  id: string;
  type: T;
  name: string;
  enabled: boolean;
  createdAt: number;
  config: Configs[T];
  lastSync?: number;
  lastError?: string;
  /** A short status after the last sync, e.g. "128 events". */
  note?: string;
}

/** How often each kind refreshes on its own. Webhooks send as things happen instead. */
const EVERY: Record<ConnectorType, number> = {
  calendar: 30 * 60_000,
  holidays: 7 * 86_400_000,
  weather: 30 * 60_000,
  webhook: Infinity,
  backup: 24 * 3_600_000,
};

// ---------- Networking ----------

export class BlockedError extends Error {}

/** Native HTTP where available (desktop, Android); otherwise the browser's fetch. */
export async function http(r: HttpRequest): Promise<HttpResponse> {
  const native = await nativeRequest(r);
  if (native) return native;
  try {
    const res = await fetch(r.url, { method: r.method ?? 'GET', headers: r.headers, body: r.body });
    return { status: res.status, text: await res.text() };
  } catch {
    throw new BlockedError(tNow('This service doesn’t allow requests from a web browser. It works in the desktop and Android apps.'));
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await http({ url });
  if (res.status >= 400) throw new Error(`${tNow('The service answered with an error')} (${res.status}).`);
  return JSON.parse(res.text) as T;
}

// ---------- Calendar feeds and holidays ----------

const sourceOf = (c: Connector) => `connector:${c.id}`;

async function replaceEvents(c: Connector, rows: Omit<CalEvent, 'id' | 'createdAt' | 'updatedAt' | 'source'>[]) {
  const now = Date.now();
  const source = sourceOf(c);
  await db.transaction('rw', db.events, async () => {
    await db.events.where('source').equals(source).delete();
    await db.events.bulkAdd(rows.map((r) => ({ ...r, id: uid(), source, createdAt: now, updatedAt: now })));
  });
}

/** webcal:// links are plain https underneath. */
export const normalizeFeedUrl = (url: string) => url.trim().replace(/^webcal:\/\//i, 'https://');

async function syncCalendar(c: Connector<'calendar'>) {
  const res = await http({ url: normalizeFeedUrl(c.config.url) });
  if (res.status >= 400) throw new Error(`${tNow('The calendar answered with an error')} (${res.status}). ${tNow('Check the address.')}`);
  if (!/BEGIN:VCALENDAR/.test(res.text)) throw new Error(tNow('That address didn’t return a calendar. Use the secret iCal (.ics) address.'));
  // Keep repeating events and anything from the last six months on.
  const since = Date.now() - 180 * 86_400_000;
  const events = parseIcs(res.text)
    .filter((e) => e.rrule || e.end >= since)
    .slice(0, 5000)
    .map((e) => ({ ...e, color: c.config.color }));
  await replaceEvents(c, events);
  return `${events.length} ${tNow('events')}`;
}

interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
}

async function syncHolidays(c: Connector<'holidays'>) {
  const y = new Date().getFullYear();
  const lists = await Promise.all([y, y + 1].map((year) => getJson<NagerHoliday[]>(`https://date.nager.at/api/v3/PublicHolidays/${year}/${c.config.country}`)));
  // Russian speakers get local names ("Новый год"); everyone else gets the English ones.
  const useLocal = resolveLang(useSettings.getState().language) === 'ru';
  const seen = new Set<string>();
  const rows = lists.flat().filter((h) => !seen.has(h.date + h.name) && seen.add(h.date + h.name)).map((h) => {
    const [yy, mm, dd] = h.date.split('-').map(Number);
    const start = new Date(yy, mm - 1, dd).getTime();
    return { title: useLocal ? h.localName : h.name, start, end: new Date(yy, mm - 1, dd + 1).getTime(), allDay: true, color: c.config.color };
  });
  await replaceEvents(c, rows);
  return `${rows.length} ${tNow('holidays')}`;
}

export interface Country {
  countryCode: string;
  name: string;
}
export const listCountries = () => getJson<Country[]>('https://date.nager.at/api/v3/AvailableCountries');

// ---------- Weather (Open-Meteo, no key needed) ----------

export interface Place {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export async function searchPlaces(q: string, lang: string): Promise<Place[]> {
  const r = await getJson<{ results?: Place[] }>(`https://geocoding-api.open-meteo.com/v1/search?count=6&format=json&language=${lang}&name=${encodeURIComponent(q)}`);
  return r.results ?? [];
}

async function syncWeather(c: Connector<'weather'>) {
  const { lat, lon, unit, place } = c.config;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=4` +
    '&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    (unit === 'f' ? '&temperature_unit=fahrenheit' : '');
  const r = await getJson<{
    current: { temperature_2m: number; weather_code: number; is_day: number };
    daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[] };
  }>(url);
  const data: WeatherData = {
    place,
    unit,
    at: Date.now(),
    current: { temp: Math.round(r.current.temperature_2m), code: r.current.weather_code, isDay: r.current.is_day === 1 },
    daily: r.daily.time.map((date, i) => ({
      date,
      max: Math.round(r.daily.temperature_2m_max[i]),
      min: Math.round(r.daily.temperature_2m_min[i]),
      code: r.daily.weather_code[i],
      rain: r.daily.precipitation_probability_max[i] ?? 0,
    })),
  };
  await setKV('weather', data);
  return `${data.current.temp}° · ${tNow(weatherLabel(data.current.code))}`;
}

// ---------- Webhooks ----------

export const EVENT_LABELS: Record<AppEventType, string> = {
  'task.created': 'Task added',
  'task.completed': 'Task completed',
  'event.created': 'Event added',
  'habit.done': 'Habit done',
  'focus.finished': 'Focus session finished',
  'idea.created': 'Idea captured',
};

function payload(service: WebhookConfig['service'], e: AppEvent) {
  const text = `${tNow(EVENT_LABELS[e.type])}${e.title ? `: ${e.title}` : ''}`;
  if (service === 'discord') return { content: text };
  if (service === 'slack') return { text };
  // Zapier, Make, IFTTT and custom endpoints get structured JSON.
  return { event: e.type, text, title: e.title, at: new Date(e.at).toISOString(), app: 'Universal Planner', profile: activeProfile()?.name || undefined, data: e.data ?? {} };
}

/** Sends one event. Returns false when the browser could send but couldn't confirm delivery. */
export async function sendWebhook(c: Connector<'webhook'>, e: AppEvent): Promise<boolean> {
  const body = JSON.stringify(payload(c.config.service, e));
  try {
    const res = await http({ url: c.config.url, method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (res.status >= 400) throw new Error(`${tNow('The service answered with an error')} (${res.status}).`);
    return true;
  } catch (err) {
    if (!(err instanceof BlockedError)) throw err;
    // Many webhook services don't allow browser requests (CORS). A "simple" request still reaches
    // them, but the browser hides the answer, so delivery can't be confirmed.
    await fetch(c.config.url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body });
    return false;
  }
}

// ---------- Backup folder (File System Access API) ----------

type PermissionMode = { mode: 'readwrite' };
interface Dir extends FileSystemDirectoryHandle {
  queryPermission(o: PermissionMode): Promise<PermissionState>;
  requestPermission(o: PermissionMode): Promise<PermissionState>;
  values(): AsyncIterable<FileSystemHandle>;
}

export const folderPickerSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export async function pickFolder() {
  return (await (window as unknown as { showDirectoryPicker: (o: object) => Promise<Dir> }).showDirectoryPicker({ id: 'universal-planner-backups', mode: 'readwrite' })) as Dir;
}

async function syncBackup(c: Connector<'backup'>, manual: boolean) {
  const row = await db.handles.get(c.id);
  const dir = row?.handle as Dir | undefined;
  if (!dir || typeof dir.getFileHandle !== 'function') throw new Error(tNow('Choose the folder again.'));
  let perm = await dir.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted' && manual) perm = await dir.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') throw new Error(tNow('Needs permission to write to the folder. Press “Sync now”.'));

  const slug = (activeProfile()?.name || 'profile').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '') || 'profile';
  const prefix = `universal-planner-${slug}-`;
  const today = new Date().toISOString().slice(0, 10);
  const file = await dir.getFileHandle(`${prefix}${today}.json`, { create: true });
  const w = await file.createWritable();
  await w.write(JSON.stringify(await exportBackup()));
  await w.close();

  // Keep the last `keep` days of backups for this profile.
  const cutoff = new Date(Date.now() - c.config.keep * 86_400_000).toISOString().slice(0, 10);
  for await (const h of dir.values()) {
    const m = h.kind === 'file' && h.name.startsWith(prefix) && h.name.slice(prefix.length, prefix.length + 10);
    if (m && /^\d{4}-\d{2}-\d{2}$/.test(m) && m < cutoff) await dir.removeEntry(h.name);
  }
  return `${tNow('Saved')} ${prefix}${today}.json`;
}

// ---------- Store ----------

interface ConnectorsState {
  list: Connector[];
  loaded: boolean;
  syncing: Record<string, boolean>;
}

export const useConnectors = create<ConnectorsState>(() => ({ list: [], loaded: false, syncing: {} }));

async function persist(list: Connector[]) {
  useConnectors.setState({ list });
  await setKV('connectors', list);
}

export async function loadConnectors() {
  const list = (await getKV<Connector[]>('connectors')) ?? [];
  useConnectors.setState({ list, loaded: true });
  return list;
}

export async function updateConnector(id: string, patch: Partial<Connector>) {
  await persist(useConnectors.getState().list.map((c) => (c.id === id ? ({ ...c, ...patch } as Connector) : c)));
}

export async function addConnector<T extends ConnectorType>(type: T, name: string, config: Configs[T], handle?: FileSystemDirectoryHandle) {
  const c = { id: uid(), type, name, enabled: true, createdAt: Date.now(), config } as Connector<T>;
  if (handle) await db.handles.put({ key: c.id, handle });
  await persist([...useConnectors.getState().list, c]);
  await syncConnector(c.id, true);
  return c;
}

export async function removeConnector(id: string) {
  const c = useConnectors.getState().list.find((x) => x.id === id);
  if (!c) return;
  if (c.type === 'calendar' || c.type === 'holidays') await db.events.where('source').equals(sourceOf(c)).delete();
  if (c.type === 'weather') await db.kv.delete('weather');
  if (c.type === 'backup') await db.handles.delete(id);
  await persist(useConnectors.getState().list.filter((x) => x.id !== id));
}

/** Refreshes one connector now. `manual` means the user asked, so it may prompt for permission. */
export async function syncConnector(id: string, manual = false) {
  const c = useConnectors.getState().list.find((x) => x.id === id);
  if (!c || c.type === 'webhook') return;
  useConnectors.setState((s) => ({ syncing: { ...s.syncing, [id]: true } }));
  try {
    const note =
      c.type === 'calendar'
        ? await syncCalendar(c as Connector<'calendar'>)
        : c.type === 'holidays'
          ? await syncHolidays(c as Connector<'holidays'>)
          : c.type === 'weather'
            ? await syncWeather(c as Connector<'weather'>)
            : await syncBackup(c as Connector<'backup'>, manual);
    await updateConnector(id, { lastSync: Date.now(), lastError: undefined, note });
  } catch (e) {
    await updateConnector(id, { lastError: (e as Error).message || tNow('Something went wrong.') });
  } finally {
    useConnectors.setState((s) => ({ syncing: { ...s.syncing, [id]: false } }));
  }
}

/** Starts background refreshes and webhook delivery. Returns a cleanup function. */
export function startConnectors() {
  let stopped = false;
  const due = () => {
    if (stopped || !navigator.onLine) return;
    for (const c of useConnectors.getState().list) {
      if (c.enabled && !useConnectors.getState().syncing[c.id] && Date.now() - (c.lastSync ?? 0) > EVERY[c.type]) void syncConnector(c.id);
    }
  };
  void loadConnectors().then(() => setTimeout(due, 4000));
  const timer = setInterval(due, 5 * 60_000);
  addEventListener('online', due);
  const off = onAppEvent((e) => {
    for (const c of useConnectors.getState().list) {
      if (c.type !== 'webhook' || !c.enabled || !(c as Connector<'webhook'>).config.events.includes(e.type)) continue;
      sendWebhook(c as Connector<'webhook'>, e)
        .then(() => updateConnector(c.id, { lastSync: Date.now(), lastError: undefined, note: tNow(EVENT_LABELS[e.type]) }))
        .catch((err: Error) => updateConnector(c.id, { lastError: err.message }));
    }
  });
  return () => {
    stopped = true;
    clearInterval(timer);
    removeEventListener('online', due);
    off();
  };
}
