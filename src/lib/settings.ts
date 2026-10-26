import { create } from 'zustand';
import { getKV, setKV } from './db';

export type ThemePref = 'system' | 'light' | 'dark';
export type MotionPref = 'system' | 'reduced' | 'full';
export type LangPref = 'auto' | 'en' | 'ru';

export interface Settings {
  theme: ThemePref;
  motion: MotionPref;
  accent: number; // 0–1, intensity of the blue→pink accents
  weekStart: 0 | 1; // 0 = Sunday, 1 = Monday
  clock: '12h' | '24h';
  language: LangPref;
}

const defaults: Settings = {
  theme: 'system',
  motion: 'system',
  accent: 0.7,
  weekStart: 1,
  clock: typeof Intl !== 'undefined' && new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ? '12h' : '24h',
  language: 'auto',
};

interface SettingsState extends Settings {
  ready: boolean;
  set: (patch: Partial<Settings>) => void;
  hydrate: () => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...defaults,
  ready: false,
  set: (patch) => {
    set(patch);
    const { ready: _r, set: _s, hydrate: _h, ...rest } = { ...get(), ...patch };
    void setKV('settings', rest);
    if (patch.theme) {
      try {
        localStorage.setItem('up.theme', patch.theme);
      } catch {
        /* storage unavailable */
      }
    }
  },
  hydrate: async () => {
    try {
      const saved = await getKV<Partial<Settings>>('settings');
      set({ ...defaults, ...saved, ready: true });
    } catch {
      set({ ready: true });
    }
  },
}));
