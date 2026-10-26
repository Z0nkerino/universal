import { useSettings } from './settings';

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

export function useT() {
  const lang = resolveLang(useSettings((s) => s.language));
  const t = (k: Key) => dicts[lang][k] ?? en[k];
  return Object.assign(t, { lang, locale: lang === 'ru' ? 'ru-RU' : undefined });
}
