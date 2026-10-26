import { useRef } from 'react';
import { motion } from 'framer-motion';
import { visibleNav } from './nav';
import { useSettings } from '@/lib/settings';
import { useRouter } from './router';
import { Glass } from '@/ui/Glass';
import { LiquidIndicator, useActiveRect } from '@/ui/LiquidIndicator';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { springSnappy } from '@/lib/motion';

export function TabBar() {
  const t = useT();
  const { route, go } = useRouter();
  const NAV = visibleNav(useSettings((s) => s.features));
  const ref = useRef<HTMLDivElement>(null);
  const rect = useActiveRect(ref, NAV.findIndex((n) => n.id === route));

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-2 pb-[max(8px,env(safe-area-inset-bottom))]">
      <Glass shimmer={false} radius="xl" role="navigation" aria-label={t('Main navigation')} className="pointer-events-auto mx-auto max-w-[560px] p-1.5">
        <div ref={ref} className="relative grid" style={{ gridTemplateColumns: `repeat(${NAV.length}, minmax(0, 1fr))` }}>
          <LiquidIndicator rect={rect} axis="x" className="rounded-[20px] bg-fg/[0.08] dark:bg-white/[0.12]" />
          {NAV.map((n, i) => {
            const active = route === n.id;
            return (
              <motion.button
                key={n.id}
                data-index={i}
                type="button"
                whileTap={{ scale: 0.88 }}
                transition={springSnappy}
                aria-current={active ? 'page' : undefined}
                aria-label={t(`nav.${n.id}`)}
                onClick={() => go(n.id)}
                className={cn('relative flex h-[54px] flex-col items-center justify-center gap-[3px] rounded-[20px] transition-colors', active ? 'text-fg' : 'text-fg/60')}
              >
                <n.icon size={22} strokeWidth={active ? 2.3 : 1.9} className={cn(active && n.id === 'afina' && 'text-pink')} aria-hidden />
                <span className="max-w-full truncate px-0.5 text-[10px] font-semibold tracking-[-0.01em]">{t(`nav.${n.id}`)}</span>
              </motion.button>
            );
          })}
        </div>
      </Glass>
    </div>
  );
}
