import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { springSoft } from '@/lib/motion';

export function EmptyState({ icon: Icon, title, body, action, className, compact }: { icon: LucideIcon; title: string; body: ReactNode; action?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'gap-2 py-6' : 'gap-3 py-12', className)}>
      <motion.div
        initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={springSoft}
        className={cn('relative flex items-center justify-center rounded-[22px] bg-brand-soft', compact ? 'h-12 w-12' : 'h-16 w-16')}
      >
        <Icon size={compact ? 22 : 28} strokeWidth={1.8} className="text-blue dark:text-[#7DA2FF]" aria-hidden />
      </motion.div>
      <h3 className={cn('font-bold tracking-[-0.02em]', compact ? 'text-[15px]' : 'text-lg')}>{title}</h3>
      <p className={cn('max-w-[34ch] text-fg/55', compact ? 'text-[13px]' : 'text-[15px]')}>{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
