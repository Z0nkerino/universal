import { useEffect, useState, useSyncExternalStore } from 'react';
import { useSettings } from './settings';

function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

export function useIsDark() {
  const theme = useSettings((s) => s.theme);
  const systemDark = useMedia('(prefers-color-scheme: dark)');
  return theme === 'dark' || (theme === 'system' && systemDark);
}

export function useReducedMotion() {
  const pref = useSettings((s) => s.motion);
  const system = useMedia('(prefers-reduced-motion: reduce)');
  return pref === 'reduced' || (pref === 'system' && system);
}

export const useIsDesktop = () => useMedia('(min-width: 1024px)');
export const useFinePointer = () => useMedia('(hover: hover) and (pointer: fine)');

/** Re-renders every `ms` so clocks and greetings stay current. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
