import { create } from 'zustand';
import { motion } from 'framer-motion';
import { addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { PageHeader } from '@/ui/PageHeader';
import { Button, IconButton } from '@/ui/Button';
import { Segmented } from '@/ui/Segmented';
import { useT } from '@/lib/i18n';
import { dayKey, fmt, fromDayKey, todayKey } from '@/lib/dates';
import { itemVariants } from '@/lib/motion';
import { FoodLog } from './FoodLog';
import { BodyLogs } from './BodyLogs';
import { Trends } from './Trends';
import { useFoodPicker } from './FoodPicker';

type Tab = 'food' | 'body' | 'trends';
const useHealthState = create<{ tab: Tab; date: string; set: (p: Partial<{ tab: Tab; date: string }>) => void }>((set) => ({ tab: 'food', date: todayKey(), set: (p) => set(p) }));

export default function HealthPage() {
  const t = useT();
  const { tab, date, set } = useHealthState();
  const showPicker = useFoodPicker((s) => s.show);
  const isToday = date === todayKey();
  return (
    <>
      <PageHeader title={t('nav.health')} actions={tab === 'food' && <Button variant="brand" icon={Plus} onClick={() => showPicker(undefined, date)}>{t('Log food')}</Button>} />
      <motion.div variants={itemVariants} className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented label={t('Health sections')} value={tab} onChange={(v) => set({ tab: v })} options={[{ value: 'food', label: t('Food & water') }, { value: 'body', label: t('Body & mood') }, { value: 'trends', label: t('Trends') }]} />
        {tab === 'food' && (
          <div className="flex items-center gap-1">
            <IconButton icon={ChevronLeft} label={t('Previous day')} onClick={() => set({ date: dayKey(addDays(fromDayKey(date), -1)) })} />
            <button type="button" onClick={() => set({ date: todayKey() })} className="min-w-[120px] rounded-xl px-2 py-1 text-center text-[15px] font-semibold hover:bg-fg/[0.05]">
              {isToday ? t('Today') : fmt(fromDayKey(date), 'EEE d MMM')}
            </button>
            <IconButton icon={ChevronRight} label={t('Next day')} disabled={isToday} onClick={() => set({ date: dayKey(addDays(fromDayKey(date), 1)) })} />
          </div>
        )}
      </motion.div>
      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
        <motion.div initial="initial" animate="enter" variants={{ enter: { transition: { staggerChildren: 0.05 } } }}>
          {tab === 'food' && <FoodLog date={date} />}
          {tab === 'body' && <BodyLogs />}
          {tab === 'trends' && <Trends />}
        </motion.div>
      </motion.div>
    </>
  );
}
