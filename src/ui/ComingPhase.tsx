import { motion } from 'framer-motion';
import { Check, type LucideIcon } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { TiltCard } from './TiltCard';
import { EmptyState } from './EmptyState';
import { PhaseBadge } from './Widget';
import { itemVariants } from '@/lib/motion';

/** Honest preview for a tab whose feature set lands in a later build phase. */
export function ComingPhase({ title, icon, phase, pitch, features }: { title: string; icon: LucideIcon; phase: number; pitch: string; features: string[] }) {
  return (
    <>
      <PageHeader title={title} actions={<PhaseBadge phase={phase} />} />
      <motion.div variants={itemVariants}>
        <TiltCard max={2} radius="xl" className="p-6 sm:p-10">
          <EmptyState icon={icon} title={`${title} arrives in Phase ${phase}`} body={pitch} />
          <ul className="mx-auto grid max-w-2xl gap-x-8 gap-y-3 sm:grid-cols-2">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-[15px] text-fg/70">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft">
                  <Check size={12} strokeWidth={3} className="text-blue" aria-hidden />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </TiltCard>
      </motion.div>
    </>
  );
}
