import { getKV } from '@/lib/db';
import { translate } from '@/lib/i18n';
import type { Lang } from '@/lib/nlp';

/** Cached by the weather connector (kv 'weather'); kept light so Today can import it. */
export interface WeatherData {
  place: string;
  unit: 'c' | 'f';
  at: number;
  current: { temp: number; code: number; isDay: boolean };
  daily: { date: string; max: number; min: number; code: number; rain: number }[];
}

export const getWeather = () => getKV<WeatherData>('weather');

/** WMO weather codes in plain words. */
export function weatherLabel(code: number) {
  if (code === 0) return 'Clear sky';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Cloudy';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code <= 86) return 'Snow showers';
  return 'Thunderstorm';
}

/** "It's 14° in Berlin (cloudy), up to 18°, 60% chance of rain…" — or null if the data is stale. */
export function weatherSentence(w: WeatherData | undefined, lang: Lang, now = Date.now()) {
  if (!w || now - w.at > 6 * 3_600_000) return null;
  const today = w.daily[0];
  const label = translate(lang, weatherLabel(w.current.code)).toLowerCase();
  if (lang === 'ru') {
    return `${w.place}: сейчас ${w.current.temp}°, ${label}${today ? `, днём до ${today.max}°` : ''}${today && today.rain >= 40 ? `, вероятность дождя ${today.rain}% — возьми зонт` : ''}.`;
  }
  return `It's ${w.current.temp}° in ${w.place} (${label})${today ? `, up to ${today.max}°` : ''}${today && today.rain >= 40 ? `, ${today.rain}% chance of rain — take an umbrella` : ''}.`;
}
