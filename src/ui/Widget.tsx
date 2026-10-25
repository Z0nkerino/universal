import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { TiltCard } from './TiltCard';
import { cn } from '@/lib/cn';
import { itemVariants } from '@/lib/motion';

export function Widget({ title, icon: Icon, action, children, className }: { title: string; icon?: LucideIcon; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <motion.section variants={itemVariants} className={className} aria-label={title}>
      <TiltCard max={3} className="flex h-full flex-col p-5">
        <header className="mb-3 flex items-center gap-2">
          {Icon && <Icon size={16} strokeWidth={2.3} className="text-fg/55" aria-hidden />}
          <h2 className="flex-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg/50">{title}</h2>
          {action}
        </header>
        <div className="flex-1">{children}</div>
      </TiltCard>
    </motion.section>
  );
}

export function PhaseBadge({ phase, className }: { phase: number; className?: string }) {
  return <span className={cn('rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-blue dark:text-[#8DAEFF]', className)}>Phase {phase}</span>;
}
