import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { Droplets, GlassWater, Minus, Plus, Star, Trash2 } from 'lucide-react';
import { db, stamp } from '@/lib/db';
import { addWater } from '@/lib/actions';
import type { MealEntry, SavedMeal } from '@/lib/types';
import { useSettings } from '@/lib/settings';
import { useT } from '@/lib/i18n';
import { TiltCard } from '@/ui/TiltCard';
import { Glass } from '@/ui/Glass';
import { Button, IconButton } from '@/ui/Button';
import { Rings } from '@/ui/Rings';
import { toast } from '@/ui/Toast';
import { promptText } from '@/ui/Confirm';
import { itemVariants, spring } from '@/lib/motion';
import { SLOTS, useFoodPicker } from './FoodPicker';

const r0 = (n: number) => Math.round(n);

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = Math.min(1, value / Math.max(1, target));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[13px]">
        <span className="flex items-center gap-1.5 font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{label}</span>
        <span className="tabular-nums text-fg/60"><strong className="text-fg">{r0(value)}</strong> / {target} g</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-fg/[0.07]">
        <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={spring} />
      </div>
    </div>
  );
}

export function FoodLog({ date }: { date: string }) {
  const t = useT();
  const targets = useSettings((s) => s.targets);
  const meals = useLiveQuery(() => db.meals.where('date').equals(date).sortBy('createdAt'), [date]) ?? [];
  const water = useLiveQuery(() => db.water.where('date').equals(date).toArray(), [date]) ?? [];
  const showPicker = useFoodPicker((s) => s.show);
  const totals = useMemo(() => meals.reduce((a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 }), [meals]);
  const ml = water.reduce((a, w) => a + w.ml, 0);
  const left = targets.kcal - totals.kcal;

  const remove = async (m: MealEntry) => {
    await db.meals.delete(m.id);
    toast(`${t('Removed')} · ${m.name}`, { action: { label: t('Undo'), run: () => void db.meals.add(m) } });
  };
  const saveMeal = async (items: MealEntry[], slotLabel: string) => {
    const name = await promptText({ title: t('Save this meal'), label: t('Name'), initial: `${slotLabel}: ${items.map((i) => i.name).slice(0, 2).join(' + ')}`, confirmLabel: t('Save') });
    if (!name?.trim()) return;
    await db.savedMeals.add(stamp({ name: name.trim(), items: items.map(({ foodId, name, servings, kcal, protein, carbs, fat }) => ({ foodId, name, servings, kcal, protein, carbs, fat })) }) as SavedMeal);
    toast(`${t('Meal saved')} · ${name.trim()}`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <motion.div variants={itemVariants}>
          <TiltCard max={2} className="p-5">
            <div className="flex items-center gap-5">
              <div className="relative">
                <Rings
                  size={132}
                  stroke={12}
                  rings={[
                    { value: totals.kcal / targets.kcal, from: '#2F6BFF', to: '#FF4FA3', label: t('Calories') },
                    { value: totals.protein / targets.protein, from: '#2F6BFF', to: '#6E97FF', label: t('Protein') },
                    { value: totals.carbs / targets.carbs, from: '#8F5BFF', to: '#B08BFF', label: t('Carbs') },
                    { value: totals.fat / targets.fat, from: '#FF4FA3', to: '#FF8CC4', label: t('Fat') },
                  ]}
                />
              </div>
              <div>
                <p className="text-[34px] font-bold leading-none tabular-nums tracking-[-0.03em]">{r0(totals.kcal)}</p>
                <p className="mt-1 text-[13px] font-semibold text-fg/50">/ {targets.kcal} {t('kcal')}</p>
                <p className={`mt-2 text-[14px] font-semibold ${left < 0 ? 'text-pink' : 'text-blue'}`}>{left >= 0 ? `${r0(left)} ${t('left')}` : `${r0(-left)} ${t('over')}`}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3">
              <MacroBar label={t('Protein')} value={totals.protein} target={targets.protein} color="#2F6BFF" />
              <MacroBar label={t('Carbs')} value={totals.carbs} target={targets.carbs} color="#8F5BFF" />
              <MacroBar label={t('Fat')} value={totals.fat} target={targets.fat} color="#FF4FA3" />
            </div>
          </TiltCard>
        </motion.div>
        <motion.div variants={itemVariants}>
          <TiltCard max={2} className="p-5">
            <div className="flex items-center gap-2">
              <Droplets size={16} className="text-blue" aria-hidden />
              <h2 className="flex-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg/55">{t('Water')}</h2>
              <span className="text-[13px] font-semibold tabular-nums text-fg/60">{ml} / {targets.waterMl} {t('ml')}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5" role="img" aria-label={`${Math.round(ml / 250)} ${t('glasses')}`}>
              {Array.from({ length: Math.max(Math.ceil(targets.waterMl / 250), Math.ceil(ml / 250)) }, (_, i) => (
                <motion.span key={i} initial={false} animate={{ scale: i < ml / 250 ? [1, 1.15, 1] : 1 }} className={`flex h-11 w-8 items-end justify-center rounded-b-xl rounded-t-md ${i < ml / 250 ? 'bg-blue text-white' : 'bg-blue/10 text-blue/40'}`}>
                  <GlassWater size={14} className="mb-1.5" />
                </motion.span>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="glass" icon={Plus} onClick={() => void addWater(250, date)}>250 ml</Button>
              <Button size="sm" variant="glass" icon={Plus} onClick={() => void addWater(500, date)}>500 ml</Button>
              <IconButton
                icon={Minus}
                size={32}
                label={t('Remove last')}
                disabled={!water.length}
                onClick={async () => {
                  const last = [...water].sort((a, b) => b.at - a.at)[0];
                  if (last) await db.water.delete(last.id);
                }}
              />
            </div>
          </TiltCard>
        </motion.div>
      </div>

      <motion.div variants={itemVariants} className="flex flex-col gap-3">
        {SLOTS.map((s) => {
          const items = meals.filter((m) => m.slot === s.id);
          const kcal = items.reduce((a, m) => a + m.kcal, 0);
          return (
            <Glass key={s.id} shimmer={false} className="p-4">
              <header className="flex items-center gap-2">
                <h3 className="flex-1 text-[16px] font-bold tracking-[-0.01em]">{t(s.label)}</h3>
                {kcal > 0 && <span className="text-[13px] font-semibold tabular-nums text-fg/55">{r0(kcal)} {t('kcal')}</span>}
                {items.length > 0 && <IconButton icon={Star} size={32} label={t('Save this meal')} onClick={() => void saveMeal(items, t(s.label))} />}
                <Button size="sm" variant="glass" icon={Plus} onClick={() => showPicker(s.id, date)}>{t('Add')}</Button>
              </header>
              {items.length > 0 ? (
                <ul className="mt-2">
                  <AnimatePresence initial={false}>
                    {items.map((m) => (
                      <motion.li key={m.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring} className="group overflow-hidden">
                        <div className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-fg/[0.03]">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-semibold">{m.name}</span>
                            <span className="block text-[12px] tabular-nums text-fg/50">
                              {m.servings !== 1 && `${m.servings} × · `}P {r0(m.protein)} · C {r0(m.carbs)} · F {r0(m.fat)}
                            </span>
                          </span>
                          <span className="text-[14px] font-bold tabular-nums">{r0(m.kcal)}</span>
                          <IconButton icon={Trash2} size={30} label={`${t('Remove')} ${m.name}`} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-60" onClick={() => void remove(m)} />
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              ) : (
                <p className="mt-1 text-[13px] text-fg/45">{t('Nothing logged')}</p>
              )}
            </Glass>
          );
        })}
      </motion.div>
    </div>
  );
}
