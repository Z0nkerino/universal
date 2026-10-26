import { create } from 'zustand';
import { tNow } from '@/lib/i18n';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';

interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
  tone?: 'default' | 'error';
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, opts?: { action?: Toast['action']; tone?: Toast['tone']; ms?: number }) => void;
  dismiss: (id: number) => void;
}

let next = 1;
export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, opts) => {
    const id = next++;
    set({ toasts: [...get().toasts.slice(-2), { id, message, action: opts?.action, tone: opts?.tone }] });
    setTimeout(() => get().dismiss(id), opts?.ms ?? (opts?.action ? 5000 : 2800));
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (message: string, opts?: Parameters<ToastState['show']>[1]) => useToast.getState().show(message, opts);

export function Toaster() {
  const { toasts, dismiss } = useToast();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.15 } }}
            transition={spring}
            className={cn(
              'pointer-events-auto flex min-h-11 max-w-[min(440px,100%)] items-center gap-3 rounded-full py-1.5 pl-5 pr-1.5 text-[14px] font-medium shadow-[0_10px_30px_-8px_rgb(0_0_0/.35)]',
              t.tone === 'error' ? 'bg-[#E5484D] text-white' : 'bg-ink text-white dark:bg-white dark:text-ink',
            )}
          >
            <span className="py-1.5">{tNow(t.message)}</span>
            {t.action ? (
              <button
                type="button"
                className="h-8 rounded-full bg-white/15 px-3.5 text-[13px] font-semibold hover:bg-white/25 dark:bg-ink/10 dark:hover:bg-ink/20"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            ) : (
              <span className="w-3" />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
