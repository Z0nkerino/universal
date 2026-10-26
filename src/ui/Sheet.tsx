import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Glass } from './Glass';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';

/** Centered glass dialog on desktop, bottom sheet on mobile. Escape / backdrop closes. */
export function Sheet({ open, onClose, label, children, className, position = 'auto' }: { open: boolean; onClose: () => void; label: string; children: ReactNode; className?: string; position?: 'auto' | 'top' }) {
  const ref = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement as HTMLElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
        else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
      }
    };
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('keydown', onKey);
      lastFocus.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className={cn('fixed inset-0 z-50 flex justify-center', position === 'top' ? 'items-start pt-[12vh] max-sm:items-end max-sm:pt-0' : 'items-end sm:items-center')}>
          <motion.div
            className="absolute inset-0 bg-ink/25 backdrop-blur-[2px] dark:bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <Glass
            ref={ref}
            strong
            radius="xl"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97, transition: { duration: 0.18 } }}
            transition={spring}
            className={cn('relative m-2 w-full max-w-xl overflow-hidden max-sm:mb-[max(8px,env(safe-area-inset-bottom))]', className)}
          >
            {children}
          </Glass>
        </div>
      )}
    </AnimatePresence>
  );
}
