import { create } from 'zustand';
import { getKV, setKV } from './db';
import type { BackgroundId, FontId, GlassId, PaletteId } from './appearance';

export type ThemePref = 'system' | 'light' | 'dark';
export type MotionPref = 'system' | 'reduced' | 'full';
export type LangPref = 'auto' | 'en' | 'ru';

/** How Afina looks and talks. */
export interface AfinaPrefs {
  /** 'match' follows the app's accent colors. */
  palette: 'match' | 'ocean' | 'aurora' | 'sunset' | 'forest' | 'mono';
  /** glass = 3D glass orb where the device can render it; gradient = soft 2D orb; minimal = a calm ring. */
  style: 'glass' | 'gradient' | 'minimal';
  motion: 'lively' | 'calm' | 'still';
  /** Reply style for the on-device model. */
  tone: 'warm' | 'brief' | 'cheerful';
  /** Greets you by your profile name. */
  useName: boolean;
  /** Shows Afina's briefing card on Today. */
  briefing: boolean;
}

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
  /** Sections the user chose to use; hidden ones leave the navigation. */
  features: string[];

  // Look
  palette: PaletteId;
  customAccent: string;
  font: FontId;
  background: BackgroundId;
  glass: GlassId;
  afina: AfinaPrefs;

  // Calendar
  eventMinutes: number;
  /** Minutes before an event; -1 = no reminder. */
  eventReminder: number;
  eventColor: 'blue' | 'pink' | 'violet' | 'sky' | 'rose' | 'gray';

  // Focus
  focusMin: number;
  breakMin: number;

  // Notifications
  /** Hour for a daily "your day" notification; -1 = off. */
  briefingAt: number;
  /** Hour for an evening check-in notification; -1 = off. */
  checkInAt: number;

  // Health
  glassMl: number;
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
  features: ['calendar', 'notes', 'ideas', 'health', 'insights'],
  palette: 'ocean',
  customAccent: '#2F6BFF',
  font: 'system',
  background: 'aurora',
  glass: 'frosted',
  afina: { palette: 'match', style: 'glass', motion: 'lively', tone: 'warm', useName: true, briefing: true },
  eventMinutes: 60,
  eventReminder: 10,
  eventColor: 'blue',
  focusMin: 25,
  breakMin: 5,
  briefingAt: -1,
  checkInAt: -1,
  glassMl: 250,
};

export const DEFAULT_SETTINGS = defaults;

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
      set({ ...defaults, ...saved, targets: { ...defaults.targets, ...saved?.targets }, afina: { ...defaults.afina, ...saved?.afina }, ready: true });
      try {
        localStorage.setItem('up.theme', get().theme);
      } catch {
        /* storage unavailable */
      }
    } catch {
      set({ ready: true });
    }
  },
}));
