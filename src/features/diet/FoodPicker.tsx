import { useMemo, useState } from 'react';
import { create } from 'zustand';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Clock, Minus, Plus, Search, Sparkles, Star, UtensilsCrossed, X } from 'lucide-react';
import { db, uid } from '@/lib/db';
import { guessMealSlot, logFood } from '@/lib/actions';
import type { Food, MealSlot, SavedMeal } from '@/lib/types';
import { Sheet } from '@/ui/Sheet';
import { Button, IconButton } from '@/ui/Button';
import { Field, Input } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { toast } from '@/ui/Toast';
import { useT } from '@/lib/i18n';
import { todayKey } from '@/lib/dates';
import { BUILTIN_FOODS, searchFoods } from './foods';

export const SLOTS: { id: MealSlot; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snack', label: 'Snacks' },
];

export const useFoodPicker = create<{ open: boolean; slot: MealSlot; date: string; show: (slot?: MealSlot, date?: string) => void; hide: () => void }>((set) => ({
  open: false,
  slot: 'breakfast',
  date: todayKey(),
  show: (slot, date) => set({ open: true, slot: slot ?? guessMealSlot(new Date()), date: date ?? todayKey() }),
  hide: () => set({ open: false }),
}));

function FoodRow({ f, onPick, lang }: { f: Food; onPick: () => void; lang: 'en' | 'ru' }) {
  return (
    <li>
      <button type="button" onClick={onPick} className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left hover:bg-fg/[0.05]">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{lang === 'ru' && f.nameRu ? f.nameRu : f.name}</span>
          <span className="block truncate text-[12px] text-fg/50">
            {f.serving} · P {f.protein} · C {f.carbs} · F {f.fat}
            {f.custom ? ' · custom' : ''}
          </span>
        </span>
        <span className="shrink-0 text-[14px] font-bold tabular-nums">{f.kcal}<span className="ml-0.5 text-[11px] font-semibold text-fg/45">kcal</span></span>
      </button>
    </li>
  );
}

function CustomFoodForm({ onDone }: { onDone: (f: Food) => void }) {
  const t = useT();
  const [f, setF] = useState({ name: '', serving: '1 serving', kcal: '', protein: '', carbs: '', fat: '' });
  const num = (v: string) => Math.max(0, Number(v.replace(',', '.')) || 0);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!f.name.trim()) return;
        const food: Food = { id: `custom:${uid()}`, name: f.name.trim(), serving: f.serving.trim() || '1 serving', kcal: Math.round(num(f.kcal)), protein: num(f.protein), carbs: num(f.carbs), fat: num(f.fat), category: 'Custom', custom: true };
        await db.foods.add(food);
        toast(`${t('Saved')} · ${food.name}`);
        onDone(food);
      }}
    >
      <Field label={t('Name')} htmlFor="cf-name"><Input id="cf-name" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('Grandma’s cabbage pie')} /></Field>
      <Field label={t('Serving')} htmlFor="cf-serving"><Input id="cf-serving" value={f.serving} onChange={(e) => setF({ ...f, serving: e.target.value })} /></Field>
      <div className="grid grid-cols-4 gap-2">
        {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
          <Field key={k} label={k === 'kcal' ? 'kcal' : t(k[0].toUpperCase() + k.slice(1)) + ' g'} htmlFor={`cf-${k}`}>
            <Input id={`cf-${k}`} inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder="0" />
          </Field>
        ))}
      </div>
      <Button type="submit" disabled={!f.name.trim()}>{t('Save food')}</Button>
    </form>
  );
}

export function FoodPicker() {
  const t = useT();
  const { open, slot, date, hide } = useFoodPicker();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'search' | 'recent' | 'saved' | 'custom'>('search');
  const [chosen, setChosen] = useState<Food | null>(null);
  const [servings, setServings] = useState(1);
  const [mealSlot, setMealSlot] = useState<MealSlot>(slot);
  const custom = useLiveQuery(() => db.foods.toArray(), []) ?? [];
  const recentEntries = useLiveQuery(() => db.meals.orderBy('createdAt').reverse().limit(80).toArray(), []) ?? [];
  const saved = useLiveQuery(() => db.savedMeals.toArray(), []) ?? [];
  const all = useMemo(() => [...custom, ...BUILTIN_FOODS], [custom]);
  const results = useMemo(() => searchFoods(q, all, 40), [q, all]);
  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: Food[] = [];
    for (const m of recentEntries) {
      const key = m.foodId ?? m.name;
      if (seen.has(key)) continue;
      seen.add(key);
      const f = all.find((x) => x.id === m.foodId) ?? { id: key, name: m.name, serving: '1 serving', kcal: Math.round(m.kcal / m.servings), protein: m.protein / m.servings, carbs: m.carbs / m.servings, fat: m.fat / m.servings, category: 'Recent' };
      out.push(f);
      if (out.length >= 15) break;
    }
    return out;
  }, [recentEntries, all]);

  const reset = () => {
    setChosen(null);
    setServings(1);
    setQ('');
  };
  const pick = (f: Food) => {
    setChosen(f);
    setServings(1);
    setMealSlot(slot);
  };
  const add = async () => {
    if (!chosen) return;
    await logFood(chosen, servings, mealSlot, date);
    toast(`${t('Logged')} · ${chosen.name} · ${Math.round(chosen.kcal * servings)} kcal`);
    reset();
    hide();
  };
  const addSaved = async (m: SavedMeal) => {
    for (const it of m.items) await logFood({ id: it.foodId, name: it.name, kcal: it.kcal / it.servings, protein: it.protein / it.servings, carbs: it.carbs / it.servings, fat: it.fat / it.servings }, it.servings, slot, date);
    toast(`${t('Logged')} · ${m.name}`);
    hide();
  };

  return (
    <Sheet open={open} onClose={() => (reset(), hide())} label={t('Add food')} className="max-w-xl">
      <div className="flex max-h-[86dvh] flex-col p-5">
        {chosen ? (
          <div>
            <div className="flex items-center gap-2">
              <IconButton icon={ChevronLeft} label={t('Back')} onClick={() => setChosen(null)} />
              <h2 className="min-w-0 flex-1 truncate text-[20px] font-bold tracking-[-0.02em]">{t.lang === 'ru' && chosen.nameRu ? chosen.nameRu : chosen.name}</h2>
            </div>
            <p className="mt-1 px-1 text-[13px] text-fg/55">{chosen.serving}</p>
            <div className="mt-5 flex items-center justify-center gap-4">
              <IconButton icon={Minus} label={t('Less')} size={44} className="bg-fg/[0.06]" onClick={() => setServings((s) => Math.max(0.25, Math.round((s - 0.25) * 100) / 100))} />
              <div className="text-center">
                <p className="text-[40px] font-bold tabular-nums tracking-[-0.03em]">{servings}</p>
                <p className="text-[12px] font-semibold text-fg/50">{t(servings === 1 ? 'serving' : 'servings')}</p>
              </div>
              <IconButton icon={Plus} label={t('More')} size={44} className="bg-fg/[0.06]" onClick={() => setServings((s) => Math.round((s + 0.25) * 100) / 100)} />
            </div>
            <div className="mt-5 grid grid-cols-4 gap-2 text-center">
              {[
                ['kcal', Math.round(chosen.kcal * servings)],
                [t('Protein'), `${Math.round(chosen.protein * servings)} g`],
                [t('Carbs'), `${Math.round(chosen.carbs * servings)} g`],
                [t('Fat'), `${Math.round(chosen.fat * servings)} g`],
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded-2xl bg-fg/[0.04] py-2.5">
                  <p className="text-[17px] font-bold tabular-nums">{v}</p>
                  <p className="text-[11px] font-semibold text-fg/50">{k}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-center">
              <Segmented label={t('Meal')} value={mealSlot} onChange={setMealSlot} options={SLOTS.map((s) => ({ value: s.id, label: t(s.label) }))} />
            </div>
            <Button variant="brand" size="lg" className="mt-6 w-full" onClick={() => void add()}>{t('Add to')} {t(SLOTS.find((s) => s.id === mealSlot)!.label)}</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <h2 className="flex-1 text-[20px] font-bold tracking-[-0.02em]">{t('Add food')} · {t(SLOTS.find((s) => s.id === slot)!.label)}</h2>
              <IconButton icon={X} label={t('Close')} onClick={hide} />
            </div>
            <div className="relative mt-3">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg/40" aria-hidden />
              <input
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setTab('search');
                }}
                placeholder={t('Search ~500 foods — “shawarma”, “борщ”, “latte”')}
                aria-label={t('Search foods')}
                className="h-12 w-full rounded-[14px] bg-fg/[0.05] pl-10 pr-3 text-[15px] placeholder:text-fg/40 focus:shadow-[0_0_0_2px_rgb(47_107_255/0.5)] focus-visible:outline-none"
              />
            </div>
            <div className="mt-3">
              <Segmented
                label={t('Food lists')}
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'search', label: t('All') },
                  { value: 'recent', label: t('Recent') },
                  { value: 'saved', label: t('Saved meals') },
                  { value: 'custom', label: t('Custom') },
                ]}
              />
            </div>
            <div className="thin-scrollbar -mx-2 mt-2 min-h-[260px] overflow-y-auto px-2">
              {tab === 'search' && (
                q.trim() ? (
                  results.length ? <ul>{results.map((f) => <FoodRow key={f.id} f={f} lang={t.lang} onPick={() => pick(f)} />)}</ul> : (
                    <div className="py-10 text-center text-[14px] text-fg/55">
                      {t('No food called')} “{q}”.{' '}
                      <button type="button" className="font-semibold text-blue" onClick={() => setTab('custom')}>{t('Add it as a custom food')}</button>
                    </div>
                  )
                ) : (
                  <ul>{(recent.length ? recent : BUILTIN_FOODS.slice(0, 15)).map((f) => <FoodRow key={f.id} f={f} lang={t.lang} onPick={() => pick(f)} />)}</ul>
                )
              )}
              {tab === 'recent' && (recent.length ? <ul>{recent.map((f) => <FoodRow key={f.id} f={f} lang={t.lang} onPick={() => pick(f)} />)}</ul> : <p className="flex items-center justify-center gap-2 py-10 text-[14px] text-fg/55"><Clock size={16} /> {t('Foods you log show up here for one-tap re-adding.')}</p>)}
              {tab === 'saved' &&
                (saved.length ? (
                  <ul>
                    {saved.map((m) => (
                      <li key={m.id}>
                        <button type="button" onClick={() => void addSaved(m)} className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left hover:bg-fg/[0.05]">
                          <Star size={16} className="shrink-0 text-pink" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold">{m.name}</span>
                            <span className="block truncate text-[12px] text-fg/50">{m.items.map((i) => i.name).join(', ')}</span>
                          </span>
                          <span className="text-[14px] font-bold tabular-nums">{Math.round(m.items.reduce((a, i) => a + i.kcal, 0))} kcal</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="flex items-center justify-center gap-2 py-10 text-center text-[14px] text-fg/55"><UtensilsCrossed size={16} /> {t('Save a meal from the food log with ★ to re-add it in one tap.')}</p>
                ))}
              {tab === 'custom' && (
                <div className="py-2">
                  {custom.length > 0 && <ul className="mb-4">{custom.map((f) => <FoodRow key={f.id} f={f} lang={t.lang} onPick={() => pick(f)} />)}</ul>}
                  <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-fg/60"><Sparkles size={14} /> {t('New custom food')}</p>
                  <CustomFoodForm onDone={(f) => pick(f)} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

