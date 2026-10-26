import { useState } from 'react';
import { motion } from 'framer-motion';
import { Brain } from 'lucide-react';
import { AfinaOrb } from './AfinaOrb';
import { PageHeader } from '@/ui/PageHeader';
import { PhaseBadge } from '@/ui/Widget';
import { Button } from '@/ui/Button';
import { useT } from '@/lib/i18n';
import { itemVariants } from '@/lib/motion';

export default function AfinaPage() {
  const t = useT();
  const [thinking, setThinking] = useState(false);
  return (
    <>
      <PageHeader title={t('nav.afina')} actions={<PhaseBadge phase={5} />} />
      <motion.div variants={itemVariants} className="flex flex-col items-center pt-2 text-center">
        <AfinaOrb size={280} thinking={thinking} />
        <h2 className="mt-4 text-[28px] font-bold tracking-[-0.03em]">
          Hi, I’m <span className="text-brand">Afina</span>.
        </h2>
        <p className="mt-2 max-w-[42ch] text-[17px] text-fg/60">
          I’ll live entirely on your device — no accounts, no cloud. Planning your day, breaking big tasks into tiny steps, and answering questions about your own data. In English or Russian.
        </p>
        <div className="mt-6 flex gap-2">
          <Button variant={thinking ? 'brand' : 'glass'} icon={Brain} onClick={() => setThinking((v) => !v)} aria-pressed={thinking}>
            {thinking ? 'Thinking…' : 'Watch me think'}
          </Button>
        </div>
        <p className="mt-6 text-[13px] text-fg/40">Chat, voice and on-device language model arrive in Phase 5.</p>
      </motion.div>
    </>
  );
}
