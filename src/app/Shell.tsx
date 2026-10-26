import { lazy, Suspense, useEffect } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { CommandBar, useCommand } from './CommandBar';
import { UpdateToast } from './UpdateToast';
import { useRouter, type Route } from './router';
import { NAV } from './nav';
import { useIsDark, useIsDesktop, useReducedMotion } from '@/lib/hooks';
import { useSettings } from '@/lib/settings';
import { pageVariants } from '@/lib/motion';
import TodayPage from '@/features/today/TodayPage';

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
      } else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        useRouter.getState().go('settings');
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  return reduced;
}

export function Shell() {
  const reduced = useGlobalEffects();
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
        Skip to content
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
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={route} variants={pageVariants} initial="initial" animate="enter" exit="exit">
                <Suspense fallback={<div className="h-[60vh]" />}>
                  <Page />
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
      {!desktop && <TabBar />}
      <CommandBar />
      <UpdateToast />
    </MotionConfig>
  );
}
