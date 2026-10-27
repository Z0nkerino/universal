import { useEffect, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { Lock } from 'lucide-react';
import { Button } from '@/ui/Button';
import { Avatar } from '@/ui/Avatar';
import { confirm } from '@/ui/Confirm';
import { resetProfile, switchProfile, unlock, useActiveProfile, useProfiles } from '@/lib/profiles';
import { useT } from '@/lib/i18n';

/** Shown instead of the app while a profile with a PIN is locked. */
export function LockScreen() {
  const t = useT();
  const profile = useActiveProfile();
  const all = useProfiles((s) => s.profiles);
  const others = all.filter((p) => p.id !== profile.id);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [fails, setFails] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const shake = useAnimationControls();

  useEffect(() => {
    if (waitUntil <= now) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [waitUntil, now]);
  const wait = Math.max(0, Math.ceil((waitUntil - now) / 1000));

  const submit = async () => {
    if (!pin || wait) return;
    if (await unlock(pin)) return;
    const n = fails + 1;
    setFails(n);
    setPin('');
    // After five wrong tries, each further try waits 30 seconds.
    if (n >= 5) {
      setWaitUntil(Date.now() + 30_000);
      setNow(Date.now());
    }
    setError(t('Wrong PIN. Try again.'));
    void shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.4 } });
  };

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 px-6 py-10">
      <div className="ambient" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar profile={profile} size={84} />
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">{profile.name || t('Welcome back')}</h1>
        <p className="flex items-center gap-1.5 text-[14px] text-fg/60">
          <Lock size={14} aria-hidden /> {t('Enter your PIN to open your planner')}
        </p>
      </div>
      <motion.form
        animate={shake}
        className="flex w-full max-w-[280px] flex-col items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={8}
          aria-label={t('PIN')}
          value={pin}
          onChange={(e) => (setPin(e.target.value.replace(/\D/g, '')), setError(''))}
          className="h-14 w-full rounded-2xl bg-fg/[0.06] text-center text-[28px] font-semibold tracking-[0.5em] focus:shadow-[0_0_0_2px_rgb(var(--blue-rgb)/0.55)]"
        />
        <p role="alert" className="min-h-5 text-[13px] font-medium text-[#E5484D]">
          {wait ? `${t('Too many tries. Wait')} ${wait} ${t('s')}` : error}
        </p>
        <Button type="submit" className="w-full" disabled={pin.length < 4 || !!wait}>
          {t('Unlock')}
        </Button>
      </motion.form>
      {others.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg/60">{t('Other profiles')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {others.map((p) => (
              <button key={p.id} type="button" onClick={() => switchProfile(p.id)} className="flex items-center gap-2 rounded-full bg-fg/[0.06] py-1 pl-1 pr-3 text-[14px] font-semibold hover:bg-fg/[0.1]">
                <Avatar profile={p} size={28} />
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        className="text-[13px] font-medium text-fg/60 underline-offset-4 hover:underline"
        onClick={async () => {
          if (
            await confirm({
              title: t('Forgot your PIN?'),
              body: t('The PIN can’t be recovered. You can erase this profile and start it fresh; other profiles stay untouched. If you exported a backup, you can import it afterwards.'),
              confirmLabel: t('Erase this profile'),
              danger: true,
            })
          )
            await resetProfile(profile.id);
        }}
      >
        {t('Forgot PIN?')}
      </button>
    </main>
  );
}
