import { create } from 'zustand';
import { useSettings } from './settings';

// The Russian dictionary loads only for people who use Russian (it's ~50 KB).
let RU_STRINGS: Record<string, string> = {};
const useDict = create<{ ru: boolean }>(() => ({ ru: false }));
let loading: Promise<void> | null = null;

/** Loads the Russian dictionary; components using useT() re-render once it's in. */
export function loadRussian() {
  return (loading ??= import('./i18n-ru').then((m) => {
    RU_STRINGS = m.RU_STRINGS;
    useDict.setState({ ru: true });
  }));
}

/** Best guess before settings load: the last language used on this device, else the system's. */
export function likelyRussian() {
  try {
    const last = localStorage.getItem('up.lang');
    if (last) return last === 'ru';
  } catch {
    /* storage unavailable */
  }
  return resolveLang('auto') === 'ru';
}

useSettings.subscribe((s) => {
  const lang = resolveLang(s.language);
  try {
    if (s.ready) localStorage.setItem('up.lang', lang);
  } catch {
    /* storage unavailable */
  }
  if (lang === 'ru') void loadRussian();
});

const en = {
  'nav.today': 'Today',
  'nav.calendar': 'Calendar',
  'nav.notes': 'Notes',
  'nav.ideas': 'Ideas',
  'nav.health': 'Health',
  'nav.insights': 'Insights',
  'nav.afina': 'Afina',
  'nav.settings': 'Settings',
  'nav.design': 'Design System',
  'search.placeholder': 'Search or type a command…',
  'search.button': 'Search',
  'greet.morning': 'Good morning',
  'greet.afternoon': 'Good afternoon',
  'greet.evening': 'Good evening',
  'greet.night': 'Still up?',
};
type Key = keyof typeof en;

const ru: Record<Key, string> = {
  'nav.today': 'Сегодня',
  'nav.calendar': 'Календарь',
  'nav.notes': 'Заметки',
  'nav.ideas': 'Идеи',
  'nav.health': 'Здоровье',
  'nav.insights': 'Аналитика',
  'nav.afina': 'Афина',
  'nav.settings': 'Настройки',
  'nav.design': 'Дизайн-система',
  'search.placeholder': 'Поиск или команда…',
  'search.button': 'Поиск',
  'greet.morning': 'Доброе утро',
  'greet.afternoon': 'Добрый день',
  'greet.evening': 'Добрый вечер',
  'greet.night': 'Ещё не спите?',
};

const dicts = { en, ru };

export function resolveLang(pref: 'auto' | 'en' | 'ru'): 'en' | 'ru' {
  if (pref !== 'auto') return pref;
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

/** Translates a known key, or any English UI string via the Russian dictionary (falls back to English). */
export function translate(lang: 'en' | 'ru', k: Key | (string & {})): string {
  if (k in en) return dicts[lang][k as Key] ?? en[k as Key];
  return lang === 'ru' ? RU_STRINGS[k] ?? k : k;
}

export function useT() {
  const lang = resolveLang(useSettings((s) => s.language));
  useDict((d) => d.ru);
  const t = (k: Key | (string & {})) => translate(lang, k);
  return Object.assign(t, { lang, locale: lang === 'ru' ? 'ru-RU' : undefined });
}

/** Non-hook version for code outside components. */
export function tNow(k: Key | (string & {})) {
  return translate(resolveLang(useSettings.getState().language), k);
}
