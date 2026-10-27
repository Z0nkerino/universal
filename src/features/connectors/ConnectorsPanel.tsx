import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertCircle, CalendarDays, CalendarHeart, CloudSun, FolderDown, Globe, LoaderCircle, LocateFixed, Plus, RefreshCw, Send, Trash2, Webhook, type LucideIcon } from 'lucide-react';
import { Sheet } from '@/ui/Sheet';
import { Button, IconButton } from '@/ui/Button';
import { Chip, Field, Input, Select } from '@/ui/Field';
import { Segmented, Switch } from '@/ui/Segmented';
import { confirm } from '@/ui/Confirm';
import { toast } from '@/ui/Toast';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings';
import { resolveLang } from '@/lib/i18n';
import { EVENT_COLORS, type EventColor } from '@/lib/types';
import { db } from '@/lib/db';
import { desktop, android } from '@/lib/desktop';
import type { AppEventType } from '@/lib/events';
import { EVENT_HEX, EVENT_LABEL } from '@/features/calendar/colors';
import {
  EVENT_LABELS,
  addConnector,
  folderPickerSupported,
  listCountries,
  normalizeFeedUrl,
  pickFolder,
  removeConnector,
  searchPlaces,
  sendWebhook,
  syncConnector,
  updateConnector,
  useConnectors,
  type CalendarConfig,
  type Connector,
  type ConnectorType,
  type Country,
  type Place,
  type WebhookConfig,
} from './connectors';

type Kind = { type: ConnectorType; preset?: string };

interface Entry {
  kind: Kind;
  name: string;
  body: string;
  icon: LucideIcon;
  color: string;
}

const GALLERY: Entry[] = [
  { kind: { type: 'calendar', preset: 'google' }, name: 'Google Calendar', body: 'See your Google events next to your plans.', icon: CalendarDays, color: '#4285F4' },
  { kind: { type: 'calendar', preset: 'outlook' }, name: 'Outlook Calendar', body: 'Microsoft 365 and Outlook.com calendars.', icon: CalendarDays, color: '#0F6CBD' },
  { kind: { type: 'calendar', preset: 'icloud' }, name: 'iCloud Calendar', body: 'Calendars from your Apple devices.', icon: CalendarDays, color: '#8E8E93' },
  { kind: { type: 'calendar', preset: 'ics' }, name: 'Any calendar (.ics)', body: 'Subscribe to any calendar address.', icon: Globe, color: '#0EA5A0' },
  { kind: { type: 'holidays' }, name: 'Public holidays', body: 'Holidays for your country, every year.', icon: CalendarHeart, color: '#E8436E' },
  { kind: { type: 'weather' }, name: 'Weather', body: 'Forecast on Today and in Afina’s briefing.', icon: CloudSun, color: '#F59F00' },
  { kind: { type: 'webhook' }, name: 'Webhooks', body: 'Zapier, Make, IFTTT, Discord, Slack and more.', icon: Webhook, color: '#7C5CFF' },
  { kind: { type: 'backup' }, name: 'Backup folder', body: 'A daily backup in a folder you choose — iCloud Drive, Dropbox, OneDrive…', icon: FolderDown, color: '#0F9D58' },
];

const iconFor = (c: Connector): Entry => GALLERY.find((g) => g.kind.type === c.type && (c.type !== 'calendar' || g.kind.preset === (c.config as CalendarConfig).provider)) ?? GALLERY[0];

function Tile({ icon: Icon, color, size = 40 }: { icon: LucideIcon; color: string; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-xl text-white" style={{ width: size, height: size, background: color }} aria-hidden>
      <Icon size={size * 0.5} strokeWidth={2.1} />
    </span>
  );
}

function ago(t: number, tr: (s: string) => string) {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return tr('just now');
  if (m < 60) return `${m} ${tr('min ago')}`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} ${tr('h ago')}` : new Date(t).toLocaleDateString();
}

/** Where browser limits (CORS) may block a connector, say so up front. */
const inBrowser = !desktop && !android;

export function ConnectorsPanel() {
  const t = useT();
  const { list, loaded, syncing } = useConnectors();
  const [adding, setAdding] = useState<Entry | null>(null);

  useEffect(() => {
    if (!loaded) void import('./connectors').then((m) => m.loadConnectors());
  }, [loaded]);

  return (
    <div className="flex flex-col gap-5 p-5">
      <p className="text-[14px] text-fg/60">{t('Connectors talk to these services straight from this device. Nothing goes through an Eternal Inc. server.')}</p>

      {list.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t('Connected')}>
          {list.map((c) => {
            const g = iconFor(c);
            const busy = !!syncing[c.id];
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-fg/[0.04] p-3">
                <Tile icon={g.icon} color={g.color} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{c.name}</p>
                  {c.lastError ? (
                    <p className="flex items-start gap-1 text-[13px] text-[#E5484D]">
                      <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden /> {c.lastError}
                    </p>
                  ) : (
                    <p className="truncate text-[13px] text-fg/60">
                      {c.type === 'webhook'
                        ? `${(c.config as WebhookConfig).events.length} ${t('triggers')}${c.lastSync ? ` · ${t('last sent')} ${ago(c.lastSync, t)}` : ''}`
                        : c.lastSync
                          ? `${c.note ?? ''} · ${ago(c.lastSync, t)}`
                          : t('Not synced yet')}
                    </p>
                  )}
                </div>
                <Switch checked={c.enabled} label={`${c.name}: ${t('on')}`} onChange={(enabled) => void updateConnector(c.id, { enabled })} />
                {c.type === 'webhook' ? (
                  <IconButton
                    icon={Send}
                    size={36}
                    label="Send test"
                    onClick={async () => {
                      try {
                        const confirmed = await sendWebhook(c as Connector<'webhook'>, { type: 'task.completed', title: t('Test from Universal Planner'), at: Date.now() });
                        await updateConnector(c.id, { lastSync: Date.now(), lastError: undefined });
                        toast(confirmed ? t('Test sent') : t('Test sent — the browser can’t confirm delivery, so check the service.'));
                      } catch (e) {
                        await updateConnector(c.id, { lastError: (e as Error).message });
                      }
                    }}
                  />
                ) : (
                  <IconButton icon={busy ? LoaderCircle : RefreshCw} size={36} label="Sync now" className={busy ? 'animate-spin' : undefined} disabled={busy} onClick={() => void syncConnector(c.id, true)} />
                )}
                <IconButton
                  icon={Trash2}
                  size={36}
                  label="Remove"
                  onClick={async () => {
                    if (await confirm({ title: `${t('Remove')} ${c.name}?`, body: t('Anything it brought in (events, weather) is removed too. Your own data stays.'), confirmLabel: t('Remove'), danger: true })) await removeConnector(c.id);
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg/60">{t('Add a connector')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {GALLERY.map((g) => {
            const unavailable = g.kind.type === 'backup' && !folderPickerSupported();
            return (
              <button
                key={g.name}
                type="button"
                disabled={unavailable}
                onClick={() => setAdding(g)}
                className="flex items-start gap-3 rounded-2xl bg-fg/[0.04] p-3 text-left transition-colors hover:bg-fg/[0.07] disabled:opacity-50"
              >
                <Tile icon={g.icon} color={g.color} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                    {t(g.name)} <Plus size={14} className="text-fg/60" aria-hidden />
                  </span>
                  <span className="block text-[13px] text-fg/60">{unavailable ? t('Needs Chrome or Edge on a computer, or the desktop app.') : t(g.body)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <AddSheet entry={adding} onClose={() => setAdding(null)} />
    </div>
  );
}

// ---------- Add sheets ----------

const CAL_HELP: Record<CalendarConfig['provider'], string[]> = {
  google: ['On a computer, open Google Calendar → Settings.', 'Pick the calendar on the left, then “Integrate calendar”.', 'Copy “Secret address in iCal format” and paste it here.'],
  outlook: ['Open Outlook on the web → Settings → Calendar → Shared calendars.', 'Under “Publish a calendar”, choose the calendar and “Can view all details”, then Publish.', 'Copy the ICS link and paste it here.'],
  icloud: ['On iPhone: Calendar → Calendars → (i) next to a calendar → turn on “Public Calendar”.', 'Share the link, copy it and paste it here (webcal:// links work).'],
  ics: ['Paste the address of any calendar feed (it usually ends in .ics).'],
};

function ColorPicker({ value, onChange }: { value: EventColor; onChange: (c: EventColor) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('Color')}>
      {EVENT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={t(EVENT_LABEL[c])}
          onClick={() => onChange(c)}
          className="h-7 w-7 rounded-full"
          style={{ background: EVENT_HEX[c], boxShadow: value === c ? `0 0 0 2px rgb(var(--bg)), 0 0 0 4px ${EVENT_HEX[c]}` : undefined }}
        />
      ))}
    </div>
  );
}

function SheetBody({ entry, children, error }: { entry: Entry; children: ReactNode; error?: string }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Tile icon={entry.icon} color={entry.color} size={44} />
        <div>
          <h2 className="text-[20px] font-bold tracking-[-0.02em]">{t(entry.name)}</h2>
          <p className="text-[14px] text-fg/60">{t(entry.body)}</p>
        </div>
      </div>
      {children}
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-[#E5484D]/10 px-3 py-2.5 text-[14px] text-[#E5484D]">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

function AddSheet({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  return (
    <Sheet open={!!entry} onClose={onClose} label={entry?.name ?? ''} className="max-w-lg">
      {entry?.kind.type === 'calendar' && <AddCalendar entry={entry} onClose={onClose} />}
      {entry?.kind.type === 'holidays' && <AddHolidays entry={entry} onClose={onClose} />}
      {entry?.kind.type === 'weather' && <AddWeather entry={entry} onClose={onClose} />}
      {entry?.kind.type === 'webhook' && <AddWebhook entry={entry} onClose={onClose} />}
      {entry?.kind.type === 'backup' && <AddBackup entry={entry} onClose={onClose} />}
    </Sheet>
  );
}

/** Adds the connector, runs its first sync, and keeps it only if that worked. */
async function addAndCheck<T extends ConnectorType>(...args: Parameters<typeof addConnector<T>>) {
  const c = await addConnector(...args);
  const after = useConnectors.getState().list.find((x) => x.id === c.id);
  if (after?.lastError) {
    await removeConnector(c.id);
    return after.lastError;
  }
  return null;
}

function Actions({ busy, disabled, onClose, onAdd, label = 'Add' }: { busy: boolean; disabled?: boolean; onClose: () => void; onAdd: () => void; label?: string }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button icon={busy ? LoaderCircle : undefined} className={busy ? '[&>svg]:animate-spin' : undefined} disabled={disabled || busy} onClick={onAdd}>
        {label}
      </Button>
    </div>
  );
}

function AddCalendar({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const t = useT();
  const provider = (entry.kind.preset ?? 'ics') as CalendarConfig['provider'];
  const [url, setUrl] = useState('');
  const [name, setName] = useState(t(entry.name));
  const [color, setColor] = useState<EventColor>(provider === 'google' ? 'blue' : provider === 'outlook' ? 'sky' : 'violet');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const valid = /^(https?|webcal):\/\/\S+$/i.test(url.trim());
  return (
    <SheetBody entry={entry} error={error}>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-[14px] text-fg/70">
        {CAL_HELP[provider].map((s) => (
          <li key={s}>{t(s)}</li>
        ))}
      </ol>
      <Field label="Calendar address" htmlFor="cal-url" hint={inBrowser ? 'Some calendars block web browsers. If yours does, connect it in the desktop or Android app.' : undefined}>
        <Input id="cal-url" autoFocus value={url} onChange={(e) => (setUrl(e.target.value), setError(undefined))} placeholder="https://… .ics" inputMode="url" autoComplete="off" />
      </Field>
      <Field label="Name" htmlFor="cal-name">
        <Input id="cal-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Color">
        <ColorPicker value={color} onChange={setColor} />
      </Field>
      <p className="text-[13px] text-fg/60">{t('The address works like a password: anyone with it can read the calendar. It stays on this device.')}</p>
      <Actions
        busy={busy}
        disabled={!valid}
        onClose={onClose}
        onAdd={async () => {
          setBusy(true);
          const err = await addAndCheck('calendar', name.trim() || t(entry.name), { provider, url: normalizeFeedUrl(url), color });
          setBusy(false);
          if (err) setError(err);
          else (toast(`${t('Connected')} · ${name}`), onClose());
        }}
      />
    </SheetBody>
  );
}

const FALLBACK_COUNTRIES: Country[] = [
  ['US', 'United States'], ['GB', 'United Kingdom'], ['CA', 'Canada'], ['AU', 'Australia'], ['DE', 'Germany'], ['FR', 'France'], ['ES', 'Spain'], ['IT', 'Italy'],
  ['NL', 'Netherlands'], ['PL', 'Poland'], ['UA', 'Ukraine'], ['KZ', 'Kazakhstan'], ['BY', 'Belarus'], ['GE', 'Georgia'], ['AM', 'Armenia'], ['TR', 'Türkiye'],
  ['IN', 'India'], ['JP', 'Japan'], ['BR', 'Brazil'], ['MX', 'Mexico'], ['SE', 'Sweden'], ['NO', 'Norway'], ['FI', 'Finland'], ['IE', 'Ireland'], ['NZ', 'New Zealand'],
].map(([countryCode, name]) => ({ countryCode, name }));

function AddHolidays({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const t = useT();
  const [countries, setCountries] = useState<Country[]>(FALLBACK_COUNTRIES);
  const guess = (navigator.language.split('-')[1] ?? '').toUpperCase();
  const [country, setCountry] = useState(FALLBACK_COUNTRIES.some((c) => c.countryCode === guess) ? guess : 'US');
  const [color, setColor] = useState<EventColor>('rose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    listCountries()
      .then((l) => l.length && setCountries([...l].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {});
  }, []);
  return (
    <SheetBody entry={entry} error={error}>
      <Field label="Country" htmlFor="hol-country">
        <Select id="hol-country" value={country} onChange={(e) => setCountry(e.target.value)}>
          {countries.map((c) => (
            <option key={c.countryCode} value={c.countryCode}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Color">
        <ColorPicker value={color} onChange={setColor} />
      </Field>
      <Actions
        busy={busy}
        onClose={onClose}
        onAdd={async () => {
          setBusy(true);
          const name = `${t('Holidays')} · ${countries.find((c) => c.countryCode === country)?.name ?? country}`;
          const err = await addAndCheck('holidays', name, { country, color });
          setBusy(false);
          if (err) setError(err);
          else (toast(`${t('Connected')} · ${name}`), onClose());
        }}
      />
    </SheetBody>
  );
}

function AddWeather({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const t = useT();
  const lang = resolveLang(useSettings((s) => s.language));
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [place, setPlace] = useState<{ name: string; lat: number; lon: number } | null>(null);
  const [unit, setUnit] = useState<'c' | 'f'>(/^en-US/.test(navigator.language) ? 'f' : 'c');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const exists = useConnectors((s) => s.list.some((c) => c.type === 'weather'));

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const id = setTimeout(() => {
      searchPlaces(q.trim(), lang)
        .then(setResults)
        .catch((e: Error) => setError(e.message));
    }, 300);
    return () => clearTimeout(id);
  }, [q, lang]);

  return (
    <SheetBody entry={entry} error={error ?? (exists ? t('Weather is already connected. Remove it first to pick another place.') : undefined)}>
      <Field label="City" htmlFor="wx-q">
        <Input id="wx-q" autoFocus value={q} onChange={(e) => (setQ(e.target.value), setPlace(null), setError(undefined))} placeholder={t('Search a city')} autoComplete="off" />
      </Field>
      {results.length > 0 && !place && (
        <ul className="flex flex-col gap-1" aria-label={t('Places')}>
          {results.map((r) => (
            <li key={`${r.latitude},${r.longitude}`}>
              <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-[14px] hover:bg-fg/[0.06]" onClick={() => (setPlace({ name: r.name, lat: r.latitude, lon: r.longitude }), setQ(r.name))}>
                <span className="font-semibold">{r.name}</span>
                <span className="text-fg/60"> · {[r.admin1, r.country].filter(Boolean).join(', ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {'geolocation' in navigator && (
        <Button
          variant="glass"
          size="sm"
          icon={LocateFixed}
          className="self-start"
          onClick={() =>
            navigator.geolocation.getCurrentPosition(
              (p) => (setPlace({ name: t('My location'), lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }), setQ(t('My location'))),
              () => setError(t('Couldn’t get your location. Search for your city instead.')),
              { timeout: 10_000 },
            )
          }
        >
          {t('Use my location')}
        </Button>
      )}
      <Field label="Units">
        <Segmented label="Units" value={unit} onChange={setUnit} options={[{ value: 'c', label: '°C' }, { value: 'f', label: '°F' }]} />
      </Field>
      <Actions
        busy={busy}
        disabled={!place || exists}
        onClose={onClose}
        onAdd={async () => {
          if (!place) return;
          setBusy(true);
          const err = await addAndCheck('weather', `${t('Weather')} · ${place.name}`, { place: place.name, lat: place.lat, lon: place.lon, unit });
          setBusy(false);
          if (err) setError(err);
          else (toast(t('Weather connected')), onClose());
        }}
      />
    </SheetBody>
  );
}

const SERVICES: { id: WebhookConfig['service']; name: string; help: string }[] = [
  { id: 'zapier', name: 'Zapier', help: 'Create a Zap with “Webhooks by Zapier → Catch Hook” and paste its URL.' },
  { id: 'make', name: 'Make', help: 'Add a “Webhooks → Custom webhook” module and paste its address.' },
  { id: 'ifttt', name: 'IFTTT', help: 'Use the Webhooks service: https://maker.ifttt.com/trigger/{event}/json/with/key/{your key}' },
  { id: 'discord', name: 'Discord', help: 'Channel settings → Integrations → Webhooks → New webhook → Copy URL.' },
  { id: 'slack', name: 'Slack', help: 'Create an Incoming Webhook in your Slack app and paste its URL.' },
  { id: 'custom', name: 'Custom', help: 'Any address that accepts a JSON POST.' },
];

function AddWebhook({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const t = useT();
  const [service, setService] = useState<WebhookConfig['service']>('zapier');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<AppEventType[]>(['task.completed', 'event.created']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const s = SERVICES.find((x) => x.id === service)!;
  const valid = /^https:\/\/\S+$/i.test(url.trim()) && events.length > 0;
  return (
    <SheetBody entry={entry} error={error}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Service')}>
        {SERVICES.map((x) => (
          <Chip key={x.id} active={service === x.id} tone="blue" onClick={() => setService(x.id)}>
            {t(x.name)}
          </Chip>
        ))}
      </div>
      <p className="text-[14px] text-fg/70">{t(s.help)}</p>
      <Field label="Webhook URL" htmlFor="wh-url" hint={inBrowser && service === 'slack' ? 'Slack doesn’t answer web browsers, so delivery can’t be confirmed here. The desktop and Android apps confirm it.' : undefined}>
        <Input id="wh-url" autoFocus value={url} onChange={(e) => (setUrl(e.target.value), setError(undefined))} placeholder="https://…" inputMode="url" autoComplete="off" />
      </Field>
      <fieldset>
        <legend className="mb-2 px-1 text-[13px] font-semibold text-fg/60">{t('Send when')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(EVENT_LABELS) as AppEventType[]).map((e) => (
            <Chip key={e} active={events.includes(e)} onClick={() => setEvents((v) => (v.includes(e) ? v.filter((x) => x !== e) : [...v, e]))}>
              {t(EVENT_LABELS[e])}
            </Chip>
          ))}
        </div>
      </fieldset>
      <Actions
        busy={busy}
        disabled={!valid}
        onClose={onClose}
        onAdd={async () => {
          setBusy(true);
          const c = await addConnector('webhook', `${t(s.name)} ${t('webhook')}`, { url: url.trim(), service, events });
          try {
            const confirmed = await sendWebhook(c, { type: 'task.completed', title: t('Universal Planner is connected'), at: Date.now() });
            await updateConnector(c.id, { lastSync: Date.now() });
            toast(confirmed ? t('Connected — we sent a test message') : t('Connected. The browser can’t confirm delivery, so check the service for the test message.'));
            onClose();
          } catch (e) {
            await removeConnector(c.id);
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </SheetBody>
  );
}

function AddBackup({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const t = useT();
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [keep, setKeep] = useState('14');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const count = useLiveQuery(() => db.handles.count(), [], 0);
  return (
    <SheetBody entry={entry} error={error}>
      <p className="text-[14px] text-fg/70">{t('Once a day the app saves a full backup file into this folder. Pick a folder your cloud drive syncs, and you’ll have copies on your other devices too.')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="glass"
          icon={FolderDown}
          onClick={async () => {
            try {
              setDir(await pickFolder());
              setError(undefined);
            } catch (e) {
              if ((e as Error).name !== 'AbortError') setError((e as Error).message);
            }
          }}
        >
          {dir ? t('Choose another folder') : t('Choose folder')}
        </Button>
        {dir && <span className="text-[14px] font-semibold">📁 {dir.name}</span>}
      </div>
      <Field label="Keep backups for" htmlFor="bk-keep">
        <Select id="bk-keep" value={keep} onChange={(e) => setKeep(e.target.value)}>
          {['7', '14', '30', '90'].map((d) => (
            <option key={d} value={d}>
              {d} {t('days')}
            </option>
          ))}
        </Select>
      </Field>
      {count > 0 && <p className="text-[13px] text-fg/60">{t('You already have a backup folder. Adding another keeps both.')}</p>}
      <Actions
        busy={busy}
        disabled={!dir}
        onClose={onClose}
        onAdd={async () => {
          if (!dir) return;
          setBusy(true);
          const err = await addAndCheck('backup', `${t('Backups')} · ${dir.name}`, { folder: dir.name, keep: Number(keep) }, dir);
          setBusy(false);
          if (err) setError(err);
          else (toast(t('First backup saved')), onClose());
        }}
      />
    </SheetBody>
  );
}
