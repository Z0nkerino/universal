import { create } from 'zustand';
import { motion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';
import { PageHeader } from '@/ui/PageHeader';
import { Button } from '@/ui/Button';
import { Segmented } from '@/ui/Segmented';
import { useT } from '@/lib/i18n';
import { itemVariants } from '@/lib/motion';
import { useCapture } from '@/app/QuickCapture';
import { IdeaCanvas } from './Canvas';
import { IdeaBoard } from './Board';

const useIdeasMode = create<{ mode: 'canvas' | 'board'; set: (m: 'canvas' | 'board') => void }>((set) => ({ mode: 'canvas', set: (mode) => set({ mode }) }));

export default function IdeasPage() {
  const t = useT();
  const { mode, set } = useIdeasMode();
  const capture = useCapture((s) => s.show);
  return (
    <>
      <PageHeader
        title={t('nav.ideas')}
        actions={
          <Button variant="brand" icon={Lightbulb} onClick={() => capture('idea')} title="Alt+N">
            {t('Capture')}
          </Button>
        }
      />
      <motion.div variants={itemVariants} className="mb-4 flex items-center justify-between gap-3">
        <Segmented label={t('Ideas view')} value={mode} onChange={set} options={[{ value: 'canvas', label: t('Canvas') }, { value: 'board', label: t('Board') }]} />
        <p className="hidden text-[13px] text-fg/50 sm:block">{t('Alt+N captures an idea from anywhere')}</p>
      </motion.div>
      <motion.div key={mode} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
        {mode === 'canvas' ? <IdeaCanvas /> : <IdeaBoard />}
      </motion.div>
    </>
  );
}
