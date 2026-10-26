import type { Food } from '@/lib/types';
import { FOOD_SECTIONS } from './foods-data';
import { FOOD_SECTIONS_2 } from './foods-data-2';
import { FOOD_SECTIONS_3 } from './foods-data-3';
import { FOOD_SECTIONS_4 } from './foods-data-4';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The built-in database, flattened with stable ids ("builtin:<slug>"). */
export const BUILTIN_FOODS: Food[] = Object.entries({ ...FOOD_SECTIONS_2, ...FOOD_SECTIONS_4, ...FOOD_SECTIONS_3, ...FOOD_SECTIONS }).flatMap(([category, rows]) =>
  rows.map(([name, nameRu, serving, kcal, protein, carbs, fat]) => ({ id: `builtin:${slug(name)}`, name, nameRu, serving, kcal, protein, carbs, fat, category })),
);

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Ranks foods for a query in English or Russian: whole-word prefix > substring > all words present. */
export function searchFoods(query: string, foods: Food[], limit = 30): Food[] {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(' ');
  const scored: { f: Food; s: number }[] = [];
  for (const f of foods) {
    let best = 0;
    for (const field of [f.name, f.nameRu ?? '']) {
      const n = norm(field);
      if (!n) continue;
      let s = 0;
      if (n === q) s = 100;
      else if (n.startsWith(q)) s = 80;
      else if (n.includes(` ${q}`)) s = 70;
      else if (n.includes(q)) s = 55;
      else if (words.every((w) => n.includes(w))) s = 40;
      else if (words.length > 1 && words.some((w) => w.length > 3 && n.includes(w))) s = 15;
      if (s) s += Math.max(0, 10 - n.length / 6) + (f.custom ? 5 : 0);
      best = Math.max(best, s);
    }
    if (best) scored.push({ f, s: best });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.f);
}
