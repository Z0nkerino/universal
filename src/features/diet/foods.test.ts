import { describe, expect, it } from 'vitest';
import { BUILTIN_FOODS, searchFoods } from './foods';

describe('food database', () => {
  it('has ~500 foods with unique ids and sane macros', () => {
    expect(BUILTIN_FOODS.length).toBeGreaterThanOrEqual(490);
    expect(new Set(BUILTIN_FOODS.map((f) => f.id)).size).toBe(BUILTIN_FOODS.length);
    for (const f of BUILTIN_FOODS) {
      // Energy from macros should roughly match the stated calories (alcohol drinks excepted).
      const fromMacros = f.protein * 4 + f.carbs * 4 + f.fat * 9;
      if (f.kcal > 60 && !/beer|wine|vodka/i.test(f.name)) {
        expect(Math.abs(fromMacros - f.kcal) / f.kcal, `${f.name}: ${f.kcal} kcal vs ${Math.round(fromMacros)} from macros`).toBeLessThan(0.25);
      }
      expect(f.nameRu).toBeTruthy();
    }
  });
  it('finds foods in English and Russian', () => {
    expect(searchFoods('shawarma', BUILTIN_FOODS)[0].name).toMatch(/shawarma/i);
    expect(searchFoods('шаурма', BUILTIN_FOODS)[0].name).toMatch(/shawarma/i);
    expect(searchFoods('coke', BUILTIN_FOODS).map((f) => f.name)).toContain('Coke Zero / Diet soda');
    expect(searchFoods('борщ', BUILTIN_FOODS)[0].name).toBe('Borscht');
    expect(searchFoods('пельмени', BUILTIN_FOODS)[0].name).toBe('Pelmeni');
  });
});
