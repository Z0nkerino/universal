import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Bell,
  CalendarDays,
  Download,
  HeartPulse,
  Info,
  Keyboard,
  Languages,
  LayoutGrid,
  Lock,
  MonitorDown,
  Palette,
  Plug,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
  Upload,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/ui/PageHeader';
import { Glass } from '@/ui/Glass';
import { Segmented, Switch } from '@/ui/Segmented';
import { Button, IconButton } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Avatar } from '@/ui/Avatar';
import { AccentPicker } from '@/ui/AccentPicker';
import { AppIcon, EternalMark, PlannerMark } from '@/ui/Logo';
import { confirm } from '@/ui/Confirm';
import { toast } from '@/ui/Toast';
import { useSettings, type AfinaPrefs } from '@/lib/settings';
import { FONTS, type BackgroundId, type FontId, type GlassId } from '@/lib/appearance';
import { useT } from '@/lib/i18n';
import { downloadBackup, importBackup, wipeAllData } from '@/lib/backup';
import { useInstall, platform } from '@/lib/install';
import { appUpdater, useUpdates } from '@/lib/desktop';
import { useRouter } from '@/app/router';
import { hasDemoData, removeDemoData, seedDemoData } from '@/lib/demo';
import { requestNotificationPermission } from '@/lib/reminders';
import { deleteProfile, lockNow, pinSupported, removePin, switchProfile, updateProfile, useActiveProfile, useProfiles, checkPin } from '@/lib/profiles';
import { useIsDark } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { itemVariants } from '@/lib/motion';
import { EVENT_COLORS } from '@/lib/types';
import { EVENT_HEX, EVENT_LABEL } from '@/features/calendar/colors';
import { MODELS, checkSupport, removeModel, switchModel, useLlm } from '@/features/afina/llm';
import { AFINA_PALETTES, AfinaOrb, useAfinaLook } from '@/features/afina/AfinaOrb';
import { useProfileSheet } from '@/features/account/store';
import { PinSheet } from '@/features/account/PinSheet';
import { ConnectorsPanel } from '@/features/connectors/ConnectorsPanel';

// ---------- Layout and search ----------

const SECTIONS: { id: string; title: string; icon: LucideIcon }[] = [
  { id: 'account', title: 'Account', icon: UserRound },
  { id: 'appearance', title: 'Appearance', icon: Palette },
  { id: 'afina', title: 'Afina', icon: Sparkles },
  { id: 'today', title: 'Today & sections', icon: LayoutGrid },
  { id: 'calendar', title: 'Calendar', icon: CalendarDays },
  { id: 'focus', title: 'Planning & focus', icon: Timer },
  { id: 'notifications', title: 'Notifications', icon: Bell },
  { id: 'health', title: 'Health', icon: HeartPulse },
  { id: 'connectors', title: 'Connectors', icon: Plug },
  { id: 'language', title: 'Language & region', icon: Languages },
  { id: 'privacy', title: 'Privacy & data', icon: ShieldCheck },
  { id: 'shortcuts', title: 'Keyboard shortcuts', icon: Keyboard },
  { id: 'app', title: 'App', icon: Info },
];

const Query = createContext('');
const SectionHit = createContext(false);

/** Every word of the query appears in the text (either language). */
function matches(text: string, q: string) {
  const hay = text.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

function Section({ id, children }: { id: string; children: ReactNode }) {
  const t = useT();
  const q = useContext(Query);
  const meta = SECTIONS.find((s) => s.id === id)!;
  const hit = !!q && matches(`${t(meta.title)} ${meta.title}`, q);
  return (
    <SectionHit.Provider value={hit}>
      {/* Hidden while a search leaves it with no rows. */}
      <motion.section id={`s-${id}`} data-section={id} variants={itemVariants} className="mb-6 scroll-mt-28 [&:not(:has([data-row]))]:hidden">
        <h2 className="mb-2 flex items-center gap-2 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg/60">
          <meta.icon size={14} aria-hidden /> {t(meta.title)}
        </h2>
        <Glass shimmer={false} className="divide-y divide-fg/[0.06] overflow-hidden">
          {children}
        </Glass>
      </motion.section>
    </SectionHit.Provider>
  );
}

/** A setting: label and hint on the left, the control on the right (or below with `block`). */
function Row({ label, hint, keywords = '', block, children }: { label: string; hint?: string; keywords?: string; block?: boolean; children?: ReactNode }) {
  const t = useT();
  const q = useContext(Query);
  const sectionHit = useContext(SectionHit);
  if (q && !sectionHit && !matches(`${t(label)} ${label} ${hint ? `${t(hint)} ${hint}` : ''} ${keywords}`, q)) return null;
  return (
    <div data-row className={cn('flex gap-3 px-5 py-4', block ? 'flex-col' : 'flex-wrap items-center justify-between')}>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold">{t(label)}</p>
        {hint && <p className="mt-0.5 text-[13px] text-fg/60">{t(hint)}</p>}
      </div>
      {children}
    </div>
  );
}

function SmallSelect<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const t = useT();
  return (
    <select
      aria-label={t(label)}
      value={String(value)}
      onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)!.value)}
      className="h-9 rounded-xl bg-fg/[0.06] px-2 text-[14px] font-semibold"
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {t(o.label)}
        </option>
      ))}
    </select>
  );
}

const hourLabel = (h: number, clock: '12h' | '24h') => (clock === '24h' ? `${String(h % 24).padStart(2, '0')}:00` : `${h % 12 || 12} ${h % 24 < 12 ? 'AM' : 'PM'}`);

// ---------- Sections ----------

function AccountSection() {
  const t = useT();
  const me = useActiveProfile();
  const profiles = useProfiles((s) => s.profiles);
  const showSheet = useProfileSheet((s) => s.show);
  const [pinOpen, setPinOpen] = useState(false);

  return (
    <Section id="account">
      <Row label="Profile" hint="Everything in a profile — tasks, notes, health, settings — stays separate and on this device." keywords="account name avatar user">
        <div className="flex items-center gap-3">
          <Avatar profile={me} size={44} />
          <input
            aria-label={t('Your name')}
            value={me.name}
            maxLength={40}
            placeholder={t('Your name')}
            onChange={(e) => updateProfile(me.id, { name: e.target.value })}
            className="h-10 w-40 rounded-xl bg-fg/[0.06] px-3 text-[15px] font-semibold"
          />
          <Button variant="glass" size="sm" onClick={() => showSheet(me.id)}>
            {t('Edit')}
          </Button>
        </div>
      </Row>
      <Row label="PIN lock" hint={pinSupported() ? (me.lock ? 'The app asks for your PIN when it opens.' : 'Ask for a PIN when the app opens. Not encryption — it keeps casual eyes out.') : 'Needs a secure connection (HTTPS) to work.'} keywords="password lock security pin">
        <div className="flex items-center gap-2">
          {me.lock && (
            <Button variant="ghost" size="sm" onClick={() => setPinOpen(true)}>
              {t('Change PIN')}
            </Button>
          )}
          <Switch
            label="PIN lock"
            checked={!!me.lock}
            onChange={async (on) => {
              if (on) return setPinOpen(true);
              const { promptText } = await import('@/ui/Confirm');
              const entered = await promptText({ title: t('Turn off the PIN?'), label: t('Current PIN'), confirmLabel: t('Turn off'), password: true });
              if (entered === null) return;
              if (await checkPin(me.id, entered)) (removePin(me.id), toast(t('PIN lock is off')));
              else toast(t('The current PIN isn’t right.'), { tone: 'error' });
            }}
          />
        </div>
      </Row>
      {me.lock && (
        <Row label="Lock automatically" hint="After this long without a tap or key press." keywords="auto lock timeout idle">
          <div className="flex items-center gap-2">
            <SmallSelect
              label="Lock automatically"
              value={me.autoLockMin ?? 0}
              onChange={(v) => updateProfile(me.id, { autoLockMin: v })}
              options={[
                { value: 0, label: 'Only when the app opens' },
                { value: 1, label: 'After 1 minute' },
                { value: 5, label: 'After 5 minutes' },
                { value: 15, label: 'After 15 minutes' },
                { value: 60, label: 'After 1 hour' },
              ]}
            />
            <Button variant="glass" size="sm" icon={Lock} onClick={lockNow}>
              {t('Lock now')}
            </Button>
          </div>
        </Row>
      )}
      <Row label="Profiles on this device" hint="Switching reloads the app with that profile’s data." block keywords="accounts users switch family work">
        <ul className="flex flex-col gap-1.5">
          {profiles.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl bg-fg/[0.04] p-2">
              <Avatar profile={p} size={32} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                {p.name || t('Your profile')} {p.lock && <Lock size={12} className="inline text-fg/60" aria-label={t('PIN')} />}
              </span>
              {p.id === me.id ? (
                <span className="px-2 text-[13px] font-semibold text-blue">{t('Current')}</span>
              ) : (
                <>
                  <Button variant="glass" size="sm" onClick={() => switchProfile(p.id)}>
                    {t('Switch')}
                  </Button>
                  <IconButton
                    icon={Trash2}
                    size={34}
                    label={`${t('Delete')} ${p.name}`}
                    onClick={async () => {
                      if (await confirm({ title: `${t('Delete')} “${p.name}”?`, body: t('Every task, note, idea and log in this profile will be erased from this device. This can’t be undone.'), confirmLabel: t('Delete profile'), danger: true })) {
                        await deleteProfile(p.id);
                        toast(t('Profile deleted'));
                      }
                    }}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
        <Button variant="glass" size="sm" icon={Plus} className="self-start" onClick={() => showSheet()}>
          {t('New profile')}
        </Button>
      </Row>
      <PinSheet open={pinOpen} profileId={me.id} hasPin={!!me.lock} onClose={() => setPinOpen(false)} />
    </Section>
  );
}

function AppearanceSection() {
  const t = useT();
  const s = useSettings();
  // Load every font once so the choices preview in their own typeface.
  useEffect(() => Object.values(FONTS).forEach((f) => void f.load?.()), []);
  return (
    <Section id="appearance">
      <Row label="Theme" keywords="dark light mode">
        <Segmented label="Theme" value={s.theme} onChange={(theme) => s.set({ theme })} options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      </Row>
      <Row label="Accent color" hint="Buttons, links, rings and the glow behind the glass." block keywords="colour color palette theme custom">
        <AccentPicker />
      </Row>
      <Row label="Accent intensity" hint="How much colored glow shows behind the glass.">
        <input type="range" min={0} max={1} step={0.05} value={s.accent} onChange={(e) => s.set({ accent: Number(e.target.value) })} aria-label={t('Accent intensity')} className="w-40 accent-blue" />
      </Row>
      <Row label="Background" hint="The soft glow behind everything." keywords="wallpaper">
        <Segmented<BackgroundId> label="Background" value={s.background} onChange={(background) => s.set({ background })} options={[{ value: 'aurora', label: 'Aurora' }, { value: 'soft', label: 'Still' }, { value: 'plain', label: 'Plain' }]} />
      </Row>
      <Row label="Glass" hint="“Solid” turns off transparency, which some people find easier to read." keywords="transparency blur reduce transparency">
        <Segmented<GlassId> label="Glass" value={s.glass} onChange={(glass) => s.set({ glass })} options={[{ value: 'frosted', label: 'Frosted' }, { value: 'clear', label: 'Clear' }, { value: 'solid', label: 'Solid' }]} />
      </Row>
      <Row label="Font" hint="Hyperlegible is designed for low vision readers." block keywords="typeface text dyslexia">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('Font')}>
          {(Object.keys(FONTS) as FontId[]).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={s.font === f}
              onClick={() => s.set({ font: f })}
              className={cn('flex h-16 w-24 flex-col items-center justify-center rounded-2xl text-center transition-colors', s.font === f ? 'bg-blue text-white' : 'bg-fg/[0.05] hover:bg-fg/[0.08]')}
              style={{ fontFamily: FONTS[f].stack }}
            >
              <span className="text-[22px] font-semibold leading-none">Aa</span>
              <span className="mt-1 text-[12px] font-medium">{t(FONTS[f].name)}</span>
            </button>
          ))}
        </div>
      </Row>
      <Row label="Reduce motion" hint="Follows your system setting unless you override it." keywords="animation">
        <Segmented label="Motion" value={s.motion} onChange={(motion) => s.set({ motion })} options={[{ value: 'system', label: 'Auto' }, { value: 'reduced', label: 'Reduced' }, { value: 'full', label: 'Full' }]} />
      </Row>
    </Section>
  );
}

function AfinaSection() {
  const t = useT();
  const s = useSettings();
  const dark = useIsDark();
  const look = useAfinaLook();
  const llm = useLlm();
  const [thinking, setThinking] = useState(false);
  useEffect(() => void checkSupport(), []);
  const setA = (p: Partial<AfinaPrefs>) => s.set({ afina: { ...s.afina, ...p } });
  const palettes = [{ id: 'match' as const, name: 'Match app', colors: look.palette === 'match' ? look.colors : null }, ...Object.entries(AFINA_PALETTES).map(([id, p]) => ({ id: id as AfinaPrefs['palette'], name: p.name, colors: p.colors }))];

  return (
    <Section id="afina">
      <Row label="How Afina looks" hint="Changes show here right away." block keywords="assistant orb appearance colors style animation">
        <div className="flex flex-wrap items-center gap-5">
          <button type="button" onClick={() => setThinking((v) => !v)} className="rounded-full" aria-label={thinking ? t('Show Afina at rest') : t('Show Afina thinking')}>
            <AfinaOrb size={120} thinking={thinking} />
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('Afina’s colors')}>
              {palettes.map((p) => {
                const [a, b] = p.colors ?? (dark ? ['#3D74FF', '#F2468F'] : ['var(--blue)', 'var(--pink)']);
                const on = s.afina.palette === p.id;
                return (
                  <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => setA({ palette: p.id })} className="flex w-14 flex-col items-center gap-1">
                    <span className="h-9 w-9 rounded-full" style={{ background: `radial-gradient(circle at 35% 35%, ${a}, ${b})`, boxShadow: on ? `0 0 0 2px rgb(var(--bg)), 0 0 0 4px ${p.id === 'match' ? 'var(--blue)' : a}` : undefined }} />
                    <span className="text-[11px] font-medium text-fg/60">{t(p.name)}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Segmented<AfinaPrefs['style']> label="Style" value={s.afina.style} onChange={(style) => setA({ style })} options={[{ value: 'glass', label: 'Glass' }, { value: 'gradient', label: 'Soft' }, { value: 'minimal', label: 'Ring' }]} />
              <Segmented<AfinaPrefs['motion']> label="Animation" value={s.afina.motion} onChange={(motion) => setA({ motion })} options={[{ value: 'lively', label: 'Lively' }, { value: 'calm', label: 'Calm' }, { value: 'still', label: 'Still' }]} />
            </div>
            <p className="text-[12px] text-fg/60">{t('Tap the orb to see her thinking.')}</p>
          </div>
        </div>
      </Row>
      <Row label="Chat style" hint="How the on-device model replies." keywords="tone personality voice">
        <Segmented<AfinaPrefs['tone']> label="Chat style" value={s.afina.tone} onChange={(tone) => setA({ tone })} options={[{ value: 'warm', label: 'Warm' }, { value: 'brief', label: 'Brief' }, { value: 'cheerful', label: 'Cheerful' }]} />
      </Row>
      <Row label="Call me by my name" hint="Used in greetings and by Afina." keywords="greeting">
        <Switch label="Call me by my name" checked={s.afina.useName} onChange={(useName) => setA({ useName })} />
      </Row>
      <Row label="Briefing on Today" hint="Afina’s card at the top of Today.">
        <Switch label="Briefing on Today" checked={s.afina.briefing} onChange={(briefing) => setA({ briefing })} />
      </Row>
      <Row label="On-device model" hint={llm.status === 'unsupported' ? `${t(llm.reason ?? '')} ${t('Afina uses her built-in engine.')}` : llm.installed ? 'Downloaded to this device. Works offline.' : 'Not downloaded. Install it from the Afina screen for free-form chat.'} keywords="ai llm webgpu">
        <SmallSelect label="Afina model" value={(MODELS.find((m) => s.model.startsWith(m.id)) ?? MODELS[0]).id} onChange={(v) => void switchModel(v)} options={MODELS.map((m) => ({ value: m.id, label: `${m.label} · ${m.size}` }))} />
      </Row>
      <Row label="Remove downloaded model" hint="Frees the space it uses. You can download it again any time.">
        <Button
          variant="ghost"
          size="sm"
          icon={Trash2}
          disabled={!llm.installed}
          onClick={async () => {
            if (await confirm({ title: 'Remove Afina’s model?', body: 'Afina keeps working with her built-in engine.', confirmLabel: 'Remove', danger: true })) {
              await removeModel();
              toast(t('Model removed from this device.'));
            }
          }}
        >
          Remove
        </Button>
      </Row>
    </Section>
  );
}

function TodaySection() {
  const t = useT();
  const s = useSettings();
  return (
    <Section id="today">
      {(
        [
          ['calendar', 'Calendar'],
          ['notes', 'Notes'],
          ['ideas', 'Ideas'],
          ['health', 'Health'],
          ['insights', 'Insights'],
        ] as const
      ).map(([id, label]) => (
        <Row key={id} label={label} keywords="sections navigation tabs show hide">
          <Switch label={`${t('Show')} ${t(label)}`} checked={s.features.includes(id)} onChange={(on) => s.set({ features: on ? [...s.features, id] : s.features.filter((f) => f !== id) })} />
        </Row>
      ))}
      <Row label="Welcome screens" hint="See the introduction again." keywords="onboarding tour">
        <Button variant="glass" size="sm" icon={Sparkles} onClick={() => dispatchEvent(new Event('up:onboarding'))}>
          Show again
        </Button>
      </Row>
    </Section>
  );
}

function CalendarSection() {
  const t = useT();
  const s = useSettings();
  return (
    <Section id="calendar">
      <Row label="Default event length" keywords="duration">
        <SmallSelect label="Default event length" value={s.eventMinutes} onChange={(eventMinutes) => s.set({ eventMinutes })} options={[15, 30, 45, 60, 90, 120].map((m) => ({ value: m, label: m < 60 ? `${m} ${t('min')}` : `${m / 60} ${t('h')}` }))} />
      </Row>
      <Row label="Default reminder" hint="For new events. You can change it per event." keywords="alert notification">
        <SmallSelect
          label="Default reminder"
          value={s.eventReminder}
          onChange={(eventReminder) => s.set({ eventReminder })}
          options={[
            { value: -1, label: 'None' },
            { value: 0, label: 'At start time' },
            ...[5, 10, 15, 30, 60].map((m) => ({ value: m, label: m < 60 ? `${m} ${t('min')} ${t('before')}` : `1 ${t('h')} ${t('before')}` })),
          ]}
        />
      </Row>
      <Row label="Default event color" keywords="colour">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('Default event color')}>
          {EVENT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={s.eventColor === c}
              aria-label={t(EVENT_LABEL[c])}
              onClick={() => s.set({ eventColor: c })}
              className="h-7 w-7 rounded-full"
              style={{ background: EVENT_HEX[c], boxShadow: s.eventColor === c ? `0 0 0 2px rgb(var(--bg)), 0 0 0 4px ${EVENT_HEX[c]}` : undefined }}
            />
          ))}
        </div>
      </Row>
      <Row label="First day of week" keywords="monday sunday">
        <Segmented label="First day of week" value={String(s.weekStart) as '0' | '1'} onChange={(v) => s.set({ weekStart: Number(v) as 0 | 1 })} options={[{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }]} />
      </Row>
      <Row label="Subscribed calendars" hint="Google, Outlook, iCloud and holidays live in Connectors." keywords="google outlook icloud sync">
        <Button variant="glass" size="sm" icon={Plug} onClick={() => scrollToSection('connectors')}>
          {t('Connectors')}
        </Button>
      </Row>
    </Section>
  );
}

function FocusSection() {
  const t = useT();
  const s = useSettings();
  return (
    <Section id="focus">
      <Row label="Planning hours" hint="“Plan my day” only schedules tasks inside these hours." keywords="work day start end">
        <div className="flex items-center gap-2">
          <SmallSelect label="Day starts" value={s.dayStartH} onChange={(dayStartH) => s.set({ dayStartH })} options={Array.from({ length: 13 }, (_, h) => h + 5).map((h) => ({ value: h, label: hourLabel(h, s.clock) }))} />
          <span className="text-fg/60">–</span>
          <SmallSelect label="Day ends" value={s.dayEndH} onChange={(dayEndH) => s.set({ dayEndH })} options={Array.from({ length: 12 }, (_, h) => h + 13).map((h) => ({ value: h, label: hourLabel(h, s.clock) }))} />
        </div>
      </Row>
      <Row label="Focus length" hint="One focus session, Pomodoro-style." keywords="pomodoro timer">
        <SmallSelect label="Focus length" value={s.focusMin} onChange={(focusMin) => s.set({ focusMin })} options={[15, 20, 25, 30, 45, 50, 60, 90].map((m) => ({ value: m, label: `${m} ${t('min')}` }))} />
      </Row>
      <Row label="Break length" keywords="pomodoro rest">
        <SmallSelect label="Break length" value={s.breakMin} onChange={(breakMin) => s.set({ breakMin })} options={[3, 5, 10, 15, 20].map((m) => ({ value: m, label: `${m} ${t('min')}` }))} />
      </Row>
    </Section>
  );
}

function NotificationsSection() {
  const s = useSettings();
  const [perm, setPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const hint =
    perm === 'granted' ? 'Gentle nudges for events and timed tasks, as system notifications.' : perm === 'denied' ? 'Notifications are blocked in your browser settings, so reminders appear inside the app.' : perm === 'unsupported' ? 'This browser can’t show notifications, so reminders appear inside the app.' : 'Turn on to allow notifications for events and timed tasks.';
  const hours = (from: number, to: number) => [{ value: -1, label: 'Off' }, ...Array.from({ length: to - from + 1 }, (_, i) => ({ value: from + i, label: hourLabel(from + i, s.clock) }))];
  return (
    <Section id="notifications">
      <Row label="Reminders" hint={hint} keywords="notifications alerts">
        <Switch
          label="Reminders"
          checked={s.reminders}
          onChange={async (v) => {
            s.set({ reminders: v });
            if (v) setPerm(String(await requestNotificationPermission()) as NotificationPermission);
          }}
        />
      </Row>
      {s.reminders && (
        <>
          <Row label="Morning briefing" hint="Afina sends your day’s summary." keywords="daily notification">
            <SmallSelect label="Morning briefing" value={s.briefingAt} onChange={(briefingAt) => s.set({ briefingAt })} options={hours(5, 11)} />
          </Row>
          <Row label="Evening check-in" hint="What got done, and what moves to tomorrow." keywords="review notification">
            <SmallSelect label="Evening check-in" value={s.checkInAt} onChange={(checkInAt) => s.set({ checkInAt })} options={hours(17, 23)} />
          </Row>
        </>
      )}
    </Section>
  );
}

function HealthSection() {
  const t = useT();
  const s = useSettings();
  return (
    <Section id="health">
      {(
        [
          ['kcal', 'Calories', 'kcal', 800, 6000, 50],
          ['protein', 'Protein', 'g', 20, 400, 5],
          ['carbs', 'Carbs', 'g', 20, 800, 5],
          ['fat', 'Fat', 'g', 10, 300, 5],
          ['waterMl', 'Water', 'ml', 500, 6000, 250],
          ['sleepH', 'Sleep', 'h', 4, 12, 0.5],
        ] as const
      ).map(([key, label, unit, min, max, step]) => (
        <Row key={key} label={label} keywords="targets goals nutrition">
          <div className="flex items-center gap-2">
            <input
              type="number"
              aria-label={`${t(label)} · ${t('target')}`}
              min={min}
              max={max}
              step={step}
              value={s.targets[key]}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= min && v <= max) s.set({ targets: { ...s.targets, [key]: v } });
              }}
              className="h-9 w-24 rounded-xl bg-fg/[0.06] px-3 text-right text-[15px] font-semibold tabular-nums focus:shadow-[0_0_0_2px_rgb(var(--blue-rgb)/0.5)] focus-visible:outline-none"
            />
            <span className="w-9 text-[13px] text-fg/60">{t(unit)}</span>
          </div>
        </Row>
      ))}
      <Row label="Glass size" hint="What “+1 glass” adds." keywords="water cup">
        <SmallSelect label="Glass size" value={s.glassMl} onChange={(glassMl) => s.set({ glassMl })} options={[150, 200, 250, 300, 330, 400, 500].map((m) => ({ value: m, label: `${m} ${t('ml')}` }))} />
      </Row>
    </Section>
  );
}

function ConnectorsSection() {
  return (
    <Section id="connectors">
      <Row label="Connected services" block keywords="google outlook icloud calendar ics holidays weather webhook zapier make ifttt discord slack backup folder sync integrations">
        <div className="-mx-5 -mb-4 -mt-3">
          <ConnectorsPanel />
        </div>
      </Row>
    </Section>
  );
}

function LanguageSection() {
  const s = useSettings();
  return (
    <Section id="language">
      <Row label="Language" keywords="english russian русский">
        <Segmented label="Language" value={s.language} onChange={(language) => s.set({ language })} options={[{ value: 'auto', label: 'Auto' }, { value: 'en', label: 'English' }, { value: 'ru', label: 'Русский' }]} />
      </Row>
      <Row label="24-hour time" keywords="clock am pm">
        <Switch label="24-hour time" checked={s.clock === '24h'} onChange={(v) => s.set({ clock: v ? '24h' : '12h' })} />
      </Row>
    </Section>
  );
}

function PrivacySection() {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [demo, setDemo] = useState(false);
  const [wipe, setWipe] = useState(false);
  useEffect(() => void hasDemoData().then(setDemo), []);
  return (
    <Section id="privacy">
      <Row label="Stored only on this device" hint="No account on a server, no tracking. Back up to move between devices." keywords="export import backup json">
        <div className="flex gap-2">
          <Button variant="glass" size="sm" icon={Download} onClick={() => void downloadBackup()}>
            Export
          </Button>
          <Button variant="glass" size="sm" icon={Upload} onClick={() => fileRef.current?.click()}>
            Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                await importBackup(f);
                await useSettings.getState().hydrate();
                toast(t('Backup restored.'));
              } catch (err) {
                toast(t((err as Error).message), { tone: 'error' });
              }
            }}
          />
        </div>
      </Row>
      <Row label="Automatic backups" hint="Save a daily backup into a folder — handy with iCloud Drive, Dropbox or OneDrive." keywords="sync cloud">
        <Button variant="glass" size="sm" icon={Plug} onClick={() => scrollToSection('connectors')}>
          {t('Set up')}
        </Button>
      </Row>
      <Row label="Sample data" hint={demo ? 'The app is showing example tasks, events and logs. Remove them when you’re ready.' : 'Add example data to explore the app. You can remove it in one click.'} keywords="demo example">
        {demo ? (
          <Button variant="glass" size="sm" icon={Trash2} onClick={async () => (await removeDemoData(), setDemo(false), toast(t('Sample data removed. Everything you added is still here.')))}>
            Remove sample data
          </Button>
        ) : (
          <Button variant="glass" size="sm" icon={Sparkles} onClick={async () => (await seedDemoData(), setDemo(true), toast(t('Sample data added.')))}>
            Add sample data
          </Button>
        )}
      </Row>
      <Row label="Erase this profile’s data" hint="Deletes everything in this profile on this device. Other profiles stay. This can’t be undone." keywords="delete reset wipe">
        <Button variant="ghost" size="sm" icon={Trash2} className="text-[#E5484D] hover:text-[#E5484D]" onClick={() => setWipe(true)}>
          Erase…
        </Button>
      </Row>
      <Sheet open={wipe} onClose={() => setWipe(false)} label={t('Confirm erase')} className="max-w-md">
        <div className="p-6">
          <h2 className="text-[20px] font-bold tracking-[-0.02em]">{t('Erase this profile’s data?')}</h2>
          <p className="mt-2 text-[15px] text-fg/60">{t('Every task, event, note, idea and log on this device will be deleted. Export a backup first if you might want it back.')}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setWipe(false)}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} onClick={() => void wipeAllData()}>
              Erase everything
            </Button>
          </div>
        </div>
      </Sheet>
    </Section>
  );
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';
const alt = isMac ? '⌥' : 'Alt';

function ShortcutsSection() {
  const t = useT();
  const keys: [string, string][] = [
    [`${mod} K  ·  /`, 'Search or create anything'],
    [`${alt} N`, 'Capture an idea'],
    [`${alt} 1 … ${alt} 7`, 'Go to a section'],
    [`${mod} ,`, 'Settings'],
    ['← →  ·  T', 'Calendar: previous / next, today'],
    ['D  W  M  Y', 'Calendar: day, week, month, year'],
    ['Space  ·  Esc', 'Focus: pause, end'],
  ];
  return (
    <Section id="shortcuts">
      <Row label="Keyboard shortcuts" block keywords="keys hotkeys">
        <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-[14px]">
          {keys.map(([k, d]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded-md bg-fg/[0.07] px-2 py-0.5 font-sans text-[12px] font-semibold">{k}</kbd>
              </dt>
              <dd className="text-fg/70">{t(d)}</dd>
            </div>
          ))}
        </dl>
      </Row>
    </Section>
  );
}

const installHelp: Record<string, string> = {
  ios: 'In Safari, tap Share → “Add to Home Screen”.',
  android: 'In Chrome, open the ⋮ menu → “Install app”.',
  mac: 'In Chrome or Edge, click the install icon in the address bar. In Safari: File → “Add to Dock”.',
  windows: 'In Edge or Chrome, click the install icon in the address bar (or ⋯ → Apps → Install).',
  other: 'Use your browser’s “Install app” option.',
};

function updateHint(s: ReturnType<typeof useUpdates.getState>['status'], t: (k: string) => string) {
  switch (s.state) {
    case 'checking': return 'Checking…';
    case 'downloading': return `${t('Downloading version')} ${s.version}…`;
    case 'ready': return `${t('Version')} ${s.version}. ${t('Downloaded and ready.')}`;
    case 'installer': return `${t('Version')} ${s.version}. ${t('Needs a fresh download of the app.')}`;
    case 'current': return `${t('You’re on the newest version')} (${s.version}). ${t('Checks automatically every few hours.')}`;
    case 'unavailable': case 'error': return s.message;
    default: return 'Checks automatically when the app opens and every few hours.';
  }
}

function AppSection() {
  const t = useT();
  const go = useRouter((r) => r.go);
  const install = useInstall();
  const update = useUpdates((u) => u.status);
  return (
    <Section id="app">
      {appUpdater ? (
        <Row label="Updates" hint={updateHint(update, t)} keywords="version upgrade">
          {update.state === 'ready' ? (
            <Button variant="brand" size="sm" icon={RefreshCw} onClick={() => void appUpdater!.apply()}>
              Restart to update
            </Button>
          ) : update.state === 'installer' ? (
            <Button variant="brand" size="sm" icon={Download} onClick={() => void appUpdater!.download(update.url)}>
              Download
            </Button>
          ) : (
            <Button variant="glass" size="sm" icon={RefreshCw} disabled={update.state === 'checking' || update.state === 'downloading'} onClick={() => void appUpdater!.check()}>
              {t('Check now')}
            </Button>
          )}
        </Row>
      ) : (
        <Row label={install.installed ? 'Installed as an app' : 'Install as an app'} hint={install.installed ? 'You’re running the installed app. It works offline.' : installHelp[platform]} keywords="pwa home screen">
          {install.event && !install.installed && (
            <Button variant="brand" size="sm" icon={MonitorDown} onClick={() => void install.prompt()}>
              Install
            </Button>
          )}
        </Row>
      )}
      <Row label="Design system" hint="Colors, glass, motion and components.">
        <Button variant="glass" size="sm" icon={Palette} onClick={() => go('design')}>
          Open
        </Button>
      </Row>
      <Row label="About" block keywords="version eternal credits">
        <div className="flex flex-col items-center gap-5 py-2 text-center">
          <div className="flex flex-col items-center gap-3">
            <AppIcon size={64} />
            <div>
              <p className="text-[19px] font-bold tracking-[-0.02em]">Universal Planner</p>
              <p className="text-[13px] text-fg/60">
                {t('Version')} {__APP_VERSION__}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <EternalMark size={48} className="text-fg" title="Eternal Inc." />
            <p className="text-[14px] text-fg/60">
              {t('Designed and built by')} <span className="font-semibold text-fg">Eternal Inc.</span>
            </p>
            <p className="text-[12px] text-fg/60">
              © {new Date().getFullYear()} Eternal Inc. {t('All rights reserved.')}
            </p>
          </div>
          <PlannerMark size={18} gradient className="opacity-80" />
        </div>
      </Row>
    </Section>
  );
}

// ---------- Page ----------

function scrollToSection(id: string) {
  const el = document.getElementById(`s-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', `#/settings/${id}`);
}

export default function SettingsPage() {
  const t = useT();
  const [q, setQ] = useState('');
  const [active, setActive] = useState('account');

  // Deep links like #/settings/connectors.
  useEffect(() => {
    const jump = () => {
      const sub = location.hash.replace(/^#\/?/, '').split('/')[1];
      if (sub) requestAnimationFrame(() => document.getElementById(`s-${sub}`)?.scrollIntoView({ block: 'start' }));
    };
    jump();
    addEventListener('up:subroute', jump);
    return () => removeEventListener('up:subroute', jump);
  }, []);

  // Highlights the section being read.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive((top.target as HTMLElement).dataset.section!);
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    document.querySelectorAll('[data-section]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const nav = (
    <ul className="flex gap-1 lg:flex-col">
      {SECTIONS.map((s) => (
        <li key={s.id} className="shrink-0">
          <button
            type="button"
            aria-current={active === s.id ? 'true' : undefined}
            onClick={() => scrollToSection(s.id)}
            className={cn(
              'flex h-9 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 text-left text-[14px] font-semibold transition-colors lg:h-auto lg:min-h-9 lg:w-full lg:whitespace-normal lg:py-2',
              active === s.id ? 'bg-fg/[0.08] text-fg' : 'text-fg/60 hover:bg-fg/[0.04] hover:text-fg/85',
            )}
          >
            <s.icon size={16} className="shrink-0" aria-hidden /> {t(s.title)}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader title={t('nav.settings')} />
      <div className="lg:grid lg:grid-cols-[220px,minmax(0,42rem)] lg:gap-8">
        <aside className="hidden lg:block">
          <nav aria-label={t('Settings sections')} className="sticky top-6">
            {nav}
          </nav>
        </aside>
        <div className="min-w-0">
          <div className="sticky top-0 z-20 -mx-4 mb-5 flex flex-col gap-2 bg-bg/95 px-4 pb-2 pt-[max(8px,env(safe-area-inset-top))] backdrop-blur-xl sm:-mx-8 sm:px-8 lg:mx-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
            <label className="glass glass-strong flex h-11 items-center gap-2.5 rounded-2xl px-3.5">
              <Search size={17} className="text-fg/60" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search settings')} aria-label={t('Search settings')} className="h-full min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-fg/50" />
              {q && <IconButton icon={X} size={28} label="Clear search" onClick={() => setQ('')} />}
            </label>
            {!q && (
              <nav aria-label={t('Settings sections')} className="no-scrollbar -mx-4 overflow-x-auto px-4 lg:hidden">
                {nav}
              </nav>
            )}
          </div>
          <Query.Provider value={q.trim()}>
            <AccountSection />
            <AppearanceSection />
            <AfinaSection />
            <TodaySection />
            <CalendarSection />
            <FocusSection />
            <NotificationsSection />
            <HealthSection />
            <ConnectorsSection />
            <LanguageSection />
            <PrivacySection />
            <ShortcutsSection />
            <AppSection />
          </Query.Provider>
          {q && (
            <p className="py-10 text-center text-[15px] text-fg/60 [:has([data-row])~&]:hidden">
              {t('No settings match')} “{q}”
            </p>
          )}
        </div>
      </div>
    </>
  );
}
