// Understands "I ate shawarma and a Coke for lunch" / "съел две шаурмы и колу на обед".
import type { Food, MealSlot } from '@/lib/types';
import { searchFoods } from '@/features/diet/foods';

/** Everyday words → the database entry people usually mean. */
const ALIASES: [RegExp, string][] = [
  [/^(coke|coca[- ]?cola|cola|pepsi|кол[аыу]|кока[- ]?кол[аыу]|пепси)$/i, 'Coca-Cola'],
  [/^(diet coke|coke zero|кол[аыу] зеро|кол[аыу] без сахара)$/i, 'Coke Zero / Diet soda'],
  [/^(shawarma|shawerma|chicken shawarma|шаурма|шаурму|шаурмы|шаверма|шаверму)$/i, 'Chicken shawarma wrap'],
  [/^(beef shawarma|шаурма с говядиной)$/i, 'Beef shawarma wrap'],
  [/^(coffee|кофе)$/i, 'Coffee (black)'],
  [/^(tea|чай|чаю)$/i, 'Tea (unsweetened)'],
  [/^(eggs?|яйц[оаи]|яйцо)$/i, 'Egg (boiled)'],
  [/^(water|воды|вода)$/i, 'Water'],
  [/^(pizza|пицц[аыу])$/i, 'Pizza Margherita'],
  [/^(burger|бургер)$/i, 'Cheeseburger'],
  [/^(fries|картошку фри|картошка фри|фри)$/i, 'French fries'],
  [/^(oatmeal|porridge|овсянку|овсянка|овсяную кашу)$/i, 'Oatmeal (cooked with water)'],
  [/^(rice|рис)$/i, 'White rice (cooked)'],
  [/^(chicken|курицу|курица|куриную грудку)$/i, 'Chicken breast (grilled)'],
  [/^(salad|салат[аы]?)$/i, 'Mixed salad with olive oil'],
  [/^(beer|пиво)$/i, 'Beer'],
  [/^(wine|вино)$/i, 'Red wine'],
  [/^(apple|яблок[оаи])$/i, 'Apple'],
  [/^(banana|банан[аы]?)$/i, 'Banana'],
  [/^(bread|хлеб)$/i, 'White bread'],
  [/^(sandwich|бутерброд)$/i, 'Cheese sandwich'],
  [/^(latte|латте)$/i, 'Latte'],
  [/^(cappuccino|капучино)$/i, 'Cappuccino'],
  [/^(борщ|борща)$/i, 'Borscht'],
  [/^(пельмени|пельменей)$/i, 'Pelmeni'],
  [/^(блины|блинов|блинчики)$/i, 'Blini'],
  [/^(сырники|сырников)$/i, 'Syrniki'],
  [/^(плов|плова)$/i, 'Plov'],
  [/^(хумус)$/i, 'Hummus'],
  [/^(фалафель)$/i, 'Falafel'],
];

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, half: 0.5, 'a half': 0.5, couple: 2, 'a couple of': 2, few: 3, 'a few': 3,
  один: 1, одна: 1, одну: 1, одно: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, половину: 0.5, пол: 0.5, полтора: 1.5, полторы: 1.5, пару: 2,
};

const CONTAINERS = /^(?:(?:a |an )?(?:bowl|plate|glass|cup|can|bottle|slice|piece|portion|serving|handful|bar|mug)s? of |(?:тарелк[уаи]|стакан[аов]?|чашк[уаи]|банк[уаи]|бутылк[уаи]|кус(?:ок|ка|ков)|порци[юяи]|миск[уаи]) )/i;

const MEAL_WORDS: [RegExp, MealSlot][] = [
  [/\b(for|at|with)\s+breakfast\b|на завтрак|за завтраком|утром/i, 'breakfast'],
  [/\b(for|at|with)\s+lunch\b|на обед|за обедом|днём|днем/i, 'lunch'],
  [/\b(for|at|with)\s+dinner\b|\bfor supper\b|на ужин|за ужином|вечером/i, 'dinner'],
  [/\b(as a |for a )?snack\b|на перекус|перекусил[аи]?/i, 'snack'],
];

export interface ParsedFood {
  query: string;
  servings: number;
  food: Food | null;
}

export function mealSlotIn(text: string): MealSlot | undefined {
  return MEAL_WORDS.find(([re]) => re.test(text))?.[1];
}

/** Pulls food items out of a sentence and matches each one to the database. */
export function parseFoodSentence(text: string, foods: Food[]): { items: ParsedFood[]; slot?: MealSlot } {
  const slot = mealSlotIn(text);
  let body = text
    .replace(/^\s*(?:today\s+|just\s+)?(?:(?:i\s+)?(?:just\s+)?(?:ate|had|have eaten|'ve eaten|drank|drink|eat|grabbed)\b|(?:log|add)(?: food)?:?|я\s+)?\s*/i, '')
    .replace(/^(?:съел[аи]?|поел[аи]?|выпил[аи]?|ел[аи]?|пил[аи]?|скушал[аи]?)\s+/i, '');
  for (const [re] of MEAL_WORDS) body = body.replace(re, ' ');
  body = body.replace(/\b(today|this morning|tonight|just now|сегодня|только что)\b/gi, ' ').replace(/[.!?]+$/, '');
  const parts = body
    // JS \b only knows Latin letters, so Russian connectors are matched by surrounding spaces.
    .split(/\s*(?:,|\band\b|\bwith\b|\bplus\b|\s\+\s|\s+и\s+|\s+с\s+|\s+а также\s+)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const items = parts.map((raw) => {
    let q = raw.toLowerCase().trim();
    let servings = 1;
    const num = q.match(/^(\d+(?:[.,]\d+)?)\s*(?:x\s*)?/);
    if (num) {
      servings = parseFloat(num[1].replace(',', '.'));
      q = q.slice(num[0].length);
    } else {
      for (const [w, n] of Object.entries(NUMBER_WORDS).sort((a, b) => b[0].length - a[0].length)) {
        if (q.startsWith(w + ' ')) {
          servings = n;
          q = q.slice(w.length + 1);
          break;
        }
      }
    }
    q = q.replace(CONTAINERS, '').replace(/^(?:some|of|my|the)\s+/i, '').trim();
    const alias = ALIASES.find(([re]) => re.test(q))?.[1];
    const food = alias ? foods.find((f) => f.name === alias) ?? null : searchFoods(q, foods, 1)[0] ?? null;
    return { query: q, servings, food };
  });
  return { items: items.filter((i) => i.query), slot };
}
