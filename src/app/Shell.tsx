import { lazy, Suspense, useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { CommandBar, useCommand } from './CommandBar';
import { UpdateToast } from './UpdateToast';
import { useRouter, type Route } from './router';
import { NAV } from './nav';
import { tNow } from '@/lib/i18n';
import { useIsDark, useIsDesktop, useReducedMotion } from '@/lib/hooks';
import { useSettings } from '@/lib/settings';
import { pageVariants } from '@/lib/motion';
import TodayPage from '@/features/today/TodayPage';
import { TaskEditor } from '@/features/planner/TaskEditor';
import { EventEditor } from '@/features/calendar/EventEditor';
import { FocusMode } from '@/features/planner/FocusMode';
import { IdeaEditor } from '@/features/ideas/IdeaEditor';
import { FoodPicker } from '@/features/diet/FoodPicker';
import { QuickCapture, useCapture } from './QuickCapture';
import { Toaster } from '@/ui/Toast';
import { ChoiceHost, ConfirmHost, PromptHost } from '@/ui/Confirm';
import { DragGhost } from '@/ui/dnd';
import { startReminders } from '@/lib/reminders';
const Onboarding = lazy(() => import('@/features/onboarding/Onboarding').then((m) => ({ default: m.Onboarding })));
import { db, getKV, setKV } from '@/lib/db';

/**
 * Decides whether to show onboarding. Installs from before onboarding existed (they have
 * 'initialized') skip it. Runs once per page load even if effects run twice.
 */
let firstRunPromise: Promise<boolean> | null = null;
function needsOnboarding() {
  firstRunPromise ??= db.transaction('rw', db.kv, async () => {
    if (await getKV('onboarded')) return false;
    if (await getKV('initialized')) {
      await setKV('onboarded', Date.now());
      return false;
    }
    await setKV('initialized', Date.now());
    return true;
  });
  return firstRunPromise;
}

const pages: Record<Route, React.ComponentType> = {
  today: TodayPage,
  calendar: lazy(() => import('@/features/calendar/CalendarPage')),
  notes: lazy(() => import('@/features/notes/NotesPage')),
  ideas: lazy(() => import('@/features/ideas/IdeasPage')),
  health: lazy(() => import('@/features/diet/HealthPage')),
  insights: lazy(() => import('@/features/analytics/InsightsPage')),
  afina: lazy(() => import('@/features/afina/AfinaPage')),
  settings: lazy(() => import('@/features/settings/SettingsPage')),
  design: lazy(() => import('@/features/design/DesignPage')),
};

function useGlobalEffects() {
  const dark = useIsDark();
  const reduced = useReducedMotion();
  const accent = useSettings((s) => s.accent);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0A0A0A' : '#FFFFFF'));
  }, [dark]);
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduced);
  }, [reduced]);
  useEffect(() => document.documentElement.style.setProperty('--accent', String(accent)), [accent]);

  // Device tilt drives the glass sheen angle on phones and tablets.
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const onTilt = (e: DeviceOrientationEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 45));
        const y = Math.max(-1, Math.min(1, ((e.beta ?? 45) - 45) / 45));
        document.documentElement.style.setProperty('--tilt-x', x.toFixed(3));
        document.documentElement.style.setProperty('--tilt-y', y.toFixed(3));
      });
    };
    addEventListener('deviceorientation', onTilt);
    return () => removeEventListener('deviceorientation', onTilt);
  }, [reduced]);

  // Keyboard: ⌘K / Ctrl+K or "/" for the command bar, Alt+1…7 for tabs, ⌘, for settings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const c = useCommand.getState();
        c.open ? c.hide() : c.show();
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        useCommand.getState().show();
      } else if (e.altKey && /^Digit[1-7]$/.test(e.code)) {
        e.preventDefault();
        useRouter.getState().go(NAV[Number(e.code.slice(5)) - 1].id);
      } else if (e.altKey && e.code === 'KeyN') {
        e.preventDefault();
        useCapture.getState().show();
      } else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        useRouter.getState().go('settings');
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => startReminders(), []);

  return reduced;
}

export function Shell() {
  const reduced = useGlobalEffects();
  const [onboarding, setOnboarding] = useState(false);
  useEffect(() => void needsOnboarding().then(setOnboarding), []);
  useEffect(() => {
    const replay = () => setOnboarding(true);
    addEventListener('up:onboarding', replay);
    return () => removeEventListener('up:onboarding', replay);
  }, []);
  const desktop = useIsDesktop();
  const route = useRouter((s) => s.route);
  const Page = pages[route];

  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [route]);

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
      <a href="#main" className="sr-only-focusable fixed left-4 top-4 z-[60] rounded-xl bg-fg px-4 py-2 text-bg">
        {tNow('Skip to content')}
      </a>
      <div className="titlebar-drag" aria-hidden />
      <div className="ambient" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <div className="flex min-h-[100dvh]">
        {desktop && <Sidebar />}
        <main id="main" className="min-w-0 flex-1 px-4 pb-32 pt-[max(20px,env(safe-area-inset-top))] sm:px-8 lg:px-10 lg:pb-12 lg:pt-10">
          <div className="mx-auto w-full max-w-[1200px]">
            {/* Enter-only page transition: the new page springs in, the old one leaves at once.
                (Exit animations here could be held open by shared-layout elements inside pages.) */}
            <motion.div key={route} variants={pageVariants} initial="initial" animate="enter">
              <Suspense fallback={<div className="h-[60vh]" />}>
                <Page />
              </Suspense>
            </motion.div>
          </div>
        </main>
      </div>
      {!desktop && <TabBar />}
      <CommandBar />
      <UpdateToast />
      <TaskEditor />
      <EventEditor />
      <FocusMode />
      <IdeaEditor />
      <FoodPicker />
      <QuickCapture />
      <ConfirmHost />
      <ChoiceHost />
      <PromptHost />
      <DragGhost />
      <Toaster />
      <Suspense fallback={null}>
        <AnimatePresence>{onboarding && <Onboarding onDone={() => setOnboarding(false)} />}</AnimatePresence>
      </Suspense>
    </MotionConfig>
  );
}
