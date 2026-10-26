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
  targets: { kcal: number; protein: number; carbs: number; fat: number; waterMl: number; sleepH: number };
  /** Hours the planner may schedule tasks in. */
  dayStartH: number;
  dayEndH: number;
  reminders: boolean;
  /** Afina's on-device model; '' = local engine only. */
  model: string;
}

const defaults: Settings = {
  theme: 'system',
  motion: 'system',
  accent: 0.7,
  weekStart: 1,
  clock: typeof Intl !== 'undefined' && new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ? '12h' : '24h',
  language: 'auto',
  targets: { kcal: 2000, protein: 120, carbs: 230, fat: 70, waterMl: 2000, sleepH: 8 },
  dayStartH: 9,
  dayEndH: 21,
  reminders: true,
  model: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
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
      set({ ...defaults, ...saved, targets: { ...defaults.targets, ...saved?.targets }, ready: true });
    } catch {
      set({ ready: true });
    }
  },
}));
