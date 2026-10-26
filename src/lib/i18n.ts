import { useSettings } from './settings';
import { RU_STRINGS } from './i18n-ru';

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
  const t = (k: Key | (string & {})) => translate(lang, k);
  return Object.assign(t, { lang, locale: lang === 'ru' ? 'ru-RU' : undefined });
}

/** Non-hook version for code outside components. */
export function tNow(k: Key | (string & {})) {
  return translate(resolveLang(useSettings.getState().language), k);
}
