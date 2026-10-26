import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Download, MonitorDown, Palette, RefreshCw, Sparkles, Trash2, Upload } from 'lucide-react';
import { PageHeader } from '@/ui/PageHeader';
import { Glass } from '@/ui/Glass';
import { Segmented, Switch } from '@/ui/Segmented';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { AppIcon, EternalMark, PlannerMark } from '@/ui/Logo';
import { useSettings } from '@/lib/settings';
import { useT } from '@/lib/i18n';
import { downloadBackup, importBackup, wipeAllData } from '@/lib/backup';
import { useInstall, platform } from '@/lib/install';
import { desktop, useUpdates } from '@/lib/desktop';
import { useRouter } from '@/app/router';
import { hasDemoData, removeDemoData, seedDemoData } from '@/lib/demo';
import { requestNotificationPermission } from '@/lib/reminders';
import { itemVariants } from '@/lib/motion';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <motion.section variants={itemVariants} className="mb-6">
      <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg/55">{title}</h2>
      <Glass shimmer={false} className="divide-y divide-fg/[0.06] overflow-hidden">
        {children}
      </Glass>
    </motion.section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold">{label}</p>
        {hint && <p className="mt-0.5 text-[13px] text-fg/50">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

const installHelp: Record<string, string> = {
  ios: 'In Safari, tap Share → “Add to Home Screen”.',
  android: 'In Chrome, open the ⋮ menu → “Install app”.',
  mac: 'In Chrome or Edge, click the install icon in the address bar. In Safari: File → “Add to Dock”.',
  windows: 'In Edge or Chrome, click the install icon in the address bar (or ⋯ → Apps → Install).',
  other: 'Use your browser’s “Install app” option.',
};

function updateHint(s: ReturnType<typeof useUpdates.getState>['status']) {
  switch (s.state) {
    case 'checking': return 'Checking…';
    case 'downloading': return `Downloading version ${s.version}…`;
    case 'ready': return `Version ${s.version} is downloaded and ready.`;
    case 'installer': return `Version ${s.version} needs a fresh download of the app.`;
    case 'current': return `You’re on the newest version (${s.version}). Checks automatically every few hours.`;
    case 'unavailable': case 'error': return s.message;
    default: return 'Checks automatically when the app opens and every few hours.';
  }
}

export default function SettingsPage() {
  const t = useT();
  const s = useSettings();
  const go = useRouter((r) => r.go);
  const install = useInstall();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const update = useUpdates((u) => u.status);
  const [demo, setDemo] = useState(false);
  const [perm, setPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  useEffect(() => void hasDemoData().then(setDemo), []);
  const notifHint =
    perm === 'granted' ? 'Gentle nudges for events and timed tasks, as system notifications.' : perm === 'denied' ? 'Notifications are blocked in your browser settings, so reminders appear inside the app.' : perm === 'unsupported' ? 'This browser can’t show notifications, so reminders appear inside the app.' : 'Turn on to allow notifications for events and timed tasks.';

  return (
    <>
      <PageHeader title={t('nav.settings')} />
      <div className="max-w-2xl">
        <Section title="Appearance">
          <Row label="Theme">
            <Segmented label="Theme" value={s.theme} onChange={(theme) => s.set({ theme })} options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </Row>
          <Row label="Accent intensity" hint="How much blue→pink glow shows behind the glass.">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.accent}
              onChange={(e) => s.set({ accent: Number(e.target.value) })}
              aria-label="Accent intensity"
              className="w-40 accent-[#2F6BFF]"
            />
          </Row>
          <Row label="Reduce motion" hint="Follows your system setting unless you override it.">
            <Segmented label="Motion" value={s.motion} onChange={(motion) => s.set({ motion })} options={[{ value: 'system', label: 'Auto' }, { value: 'reduced', label: 'Reduced' }, { value: 'full', label: 'Full' }]} />
          </Row>
        </Section>

        <Section title="Language & time">
          <Row label="Language">
            <Segmented label="Language" value={s.language} onChange={(language) => s.set({ language })} options={[{ value: 'auto', label: 'Auto' }, { value: 'en', label: 'English' }, { value: 'ru', label: 'Русский' }]} />
          </Row>
          <Row label="First day of week">
            <Segmented label="First day of week" value={String(s.weekStart) as '0' | '1'} onChange={(v) => s.set({ weekStart: Number(v) as 0 | 1 })} options={[{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }]} />
          </Row>
          <Row label="24-hour time">
            <Switch label="24-hour time" checked={s.clock === '24h'} onChange={(v) => s.set({ clock: v ? '24h' : '12h' })} />
          </Row>
        </Section>

        <Section title="Planning & reminders">
          <Row label="Planning hours" hint="“Plan my day” only schedules tasks inside these hours.">
            <div className="flex items-center gap-2">
              <select aria-label="Day starts" value={s.dayStartH} onChange={(e) => s.set({ dayStartH: Number(e.target.value) })} className="h-9 rounded-xl bg-fg/[0.06] px-2 text-[14px] font-semibold">
                {Array.from({ length: 13 }, (_, h) => h + 5).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
              <span className="text-fg/40">–</span>
              <select aria-label="Day ends" value={s.dayEndH} onChange={(e) => s.set({ dayEndH: Number(e.target.value) })} className="h-9 rounded-xl bg-fg/[0.06] px-2 text-[14px] font-semibold">
                {Array.from({ length: 12 }, (_, h) => h + 13).map((h) => <option key={h} value={h}>{String(h % 24).padStart(2, '0')}:00</option>)}
              </select>
            </div>
          </Row>
          <Row label="Reminders" hint={notifHint}>
            <Switch
              label="Reminders"
              checked={s.reminders}
              onChange={async (v) => {
                s.set({ reminders: v });
                if (v) setPerm(String(await requestNotificationPermission()));
              }}
            />
          </Row>
        </Section>

        <Section title="Your data">
          <Row label="Sample data" hint={demo ? 'The app is showing example tasks, events and logs. Remove them when you’re ready.' : 'Add example data to explore the app. You can remove it in one click.'}>
            {demo ? (
              <Button variant="glass" size="sm" icon={Trash2} onClick={async () => { await removeDemoData(); setDemo(false); setMsg('Sample data removed. Everything you added is still here.'); }}>Remove sample data</Button>
            ) : (
              <Button variant="glass" size="sm" icon={Sparkles} onClick={async () => { await seedDemoData(); setDemo(true); setMsg('Sample data added.'); }}>Add sample data</Button>
            )}
          </Row>
          <Row label="Stored only on this device" hint="No account, no server, no tracking. Back up to move between devices.">
            <div className="flex gap-2">
              <Button variant="glass" size="sm" icon={Download} onClick={() => void downloadBackup()}>Export</Button>
              <Button variant="glass" size="sm" icon={Upload} onClick={() => fileRef.current?.click()}>Import</Button>
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
                    setMsg('Backup restored.');
                  } catch (err) {
                    setMsg((err as Error).message);
                  }
                }}
              />
            </div>
          </Row>
          {msg && <p role="status" className="px-5 py-3 text-[14px] text-blue">{msg}</p>}
          <Row label="Erase everything" hint="Deletes all local data. This can’t be undone.">
            <Button variant="ghost" size="sm" icon={Trash2} className="text-[#E5484D] hover:text-[#E5484D]" onClick={() => setConfirmWipe(true)}>Erase…</Button>
          </Row>
        </Section>

        <Section title="App">
          {desktop && (
            <Row label="Updates" hint={updateHint(update)}>
              {update.state === 'ready' ? (
                <Button variant="brand" size="sm" icon={RefreshCw} onClick={() => void desktop!.updates.apply()}>Restart to update</Button>
              ) : update.state === 'installer' ? (
                <Button variant="brand" size="sm" icon={Download} onClick={() => void desktop!.updates.download(update.url)}>Download</Button>
              ) : (
                <Button variant="glass" size="sm" icon={RefreshCw} disabled={update.state === 'checking' || update.state === 'downloading'} onClick={() => void desktop!.updates.check()}>
                  Check now
                </Button>
              )}
            </Row>
          )}
          {!desktop && <Row label={install.installed ? 'Installed as an app' : 'Install as an app'} hint={install.installed ? 'You’re running the installed app. It works offline.' : installHelp[platform]}>
            {install.event && !install.installed && (
              <Button variant="brand" size="sm" icon={MonitorDown} onClick={() => void install.prompt()}>Install</Button>
            )}
          </Row>}
          <Row label="Design system" hint="Colors, glass, motion and components.">
            <Button variant="glass" size="sm" icon={Palette} onClick={() => go('design')}>Open</Button>
          </Row>
        </Section>

        <motion.section variants={itemVariants} className="mt-10 flex flex-col items-center gap-6 pb-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <AppIcon size={72} />
            <div>
              <p className="text-[19px] font-bold tracking-[-0.02em]">Universal Planner</p>
              <p className="text-[13px] text-fg/55">Version {__APP_VERSION__}</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <EternalMark size={56} className="text-fg" title="Eternal Inc." />
            <p className="text-[14px] text-fg/60">
              Designed and built by <span className="font-semibold text-fg">Eternal Inc.</span>
            </p>
            <p className="text-[12px] text-fg/40">© {new Date().getFullYear()} Eternal Inc. All rights reserved.</p>
          </div>
          <PlannerMark size={18} gradient className="opacity-80" />
        </motion.section>
      </div>

      <Sheet open={confirmWipe} onClose={() => setConfirmWipe(false)} label="Confirm erase" className="max-w-md">
        <div className="p-6">
          <h2 className="text-[20px] font-bold tracking-[-0.02em]">Erase all data?</h2>
          <p className="mt-2 text-[15px] text-fg/60">Every task, event, note, idea and log on this device will be deleted. Export a backup first if you might want it back.</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmWipe(false)}>Cancel</Button>
            <Button variant="danger" icon={Trash2} onClick={() => void wipeAllData()}>Erase everything</Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
