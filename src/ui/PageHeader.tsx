import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { itemVariants } from '@/lib/motion';

export function PageHeader({ eyebrow, title, actions }: { eyebrow?: ReactNode; title: ReactNode; actions?: ReactNode }) {
  return (
    <motion.header variants={itemVariants} className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg/70">{eyebrow}</p>}
        <h1 className="truncate text-[34px] font-bold leading-[1.05] tracking-[-0.035em] sm:text-[44px]">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </motion.header>
  );
}
