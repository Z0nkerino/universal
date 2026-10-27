import { describe, expect, it } from 'vitest';
import { accentPair, isHex, partnerOf } from './appearance';
import { checkPin, createProfile, dbNameFor, setPin, updateProfile, useProfiles } from './profiles';
import { weatherSentence, type WeatherData } from '@/features/connectors/weather';

describe('accent colors', () => {
  it('validates hex and derives a partner color', () => {
    expect(isHex('#2F6BFF')).toBe(true);
    expect(isHex('#abc')).toBe(true);
    expect(isHex('2F6BFF')).toBe(false);
    expect(partnerOf('#ff0000')).toBe('#ffd500'); // red turned 50° toward yellow
    expect(accentPair('custom', '#f00', false)).toEqual(['#ff0000', '#ffd500']);
    expect(accentPair('mono', '', true)[0]).toBe('#F2F2F7'); // light graphite on dark backgrounds
  });
});

describe('profiles', () => {
  it('keeps the first profile on the original database', () => {
    expect(dbNameFor('default')).toBe('universal-planner');
    expect(dbNameFor('abc')).toBe('universal-planner-abc');
  });

  it('creates, renames and locks a profile with a hashed PIN', async () => {
    const p = createProfile('  Work ', '💼', '#7C5CFF');
    expect(p.name).toBe('Work');
    updateProfile(p.id, { name: 'Office' });
    expect(useProfiles.getState().profiles.find((x) => x.id === p.id)?.name).toBe('Office');
    await setPin(p.id, '2468');
    const lock = useProfiles.getState().profiles.find((x) => x.id === p.id)!.lock!;
    expect(lock.hash).not.toContain('2468');
    expect(await checkPin(p.id, '2468')).toBe(true);
    expect(await checkPin(p.id, '1357')).toBe(false);
  });
});

describe('weather sentence', () => {
  const w: WeatherData = { place: 'Berlin', unit: 'c', at: 1_000, current: { temp: 14, code: 61, isDay: true }, daily: [{ date: '2026-10-27', max: 18, min: 9, code: 61, rain: 70 }] };
  it('describes the day in both languages and skips stale data', () => {
    expect(weatherSentence(w, 'en', 2_000)).toBe('It\'s 14° in Berlin (rain), up to 18°, 70% chance of rain — take an umbrella.');
    expect(weatherSentence(w, 'ru', 2_000)).toContain('Berlin: сейчас 14°, дождь');
    expect(weatherSentence(w, 'en', 1_000 + 7 * 3_600_000)).toBeNull();
  });
});
