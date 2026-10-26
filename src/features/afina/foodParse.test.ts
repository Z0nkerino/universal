import { describe, expect, it } from 'vitest';
import { parseFoodSentence } from './foodParse';
import { BUILTIN_FOODS } from '@/features/diet/foods';

const names = (t: string) => parseFoodSentence(t, BUILTIN_FOODS);

describe('parseFoodSentence', () => {
  it('handles the brief example', () => {
    const r = names('I ate shawarma and a Coke for lunch');
    expect(r.slot).toBe('lunch');
    expect(r.items.map((i) => [i.food?.name, i.servings])).toEqual([['Chicken shawarma wrap', 1], ['Coca-Cola', 1]]);
  });
  it('reads quantities and containers', () => {
    const r = names('had 2 eggs, a slice of sourdough bread and a cup of coffee for breakfast');
    expect(r.slot).toBe('breakfast');
    expect(r.items.map((i) => [i.food?.name, i.servings])).toEqual([['Egg (boiled)', 2], ['Sourdough bread', 1], ['Coffee (black)', 1]]);
  });
  it('understands Russian', () => {
    const r = names('съел две шаурмы и колу на обед');
    expect(r.slot).toBe('lunch');
    expect(r.items.map((i) => [i.food?.name, i.servings])).toEqual([['Chicken shawarma wrap', 2], ['Coca-Cola', 1]]);
    expect(names('я съел тарелку борща на ужин').items[0].food?.name).toBe('Borscht');
  });
  it('returns null for unknown foods instead of guessing wildly', () => {
    expect(names('I ate a quokka sandwich').items[0].food?.name).toMatch(/sandwich/i);
    expect(names('ate zzzz').items[0].food).toBeNull();
  });
});
