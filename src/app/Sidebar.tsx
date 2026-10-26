import { useRef } from 'react';
import { Search, Settings2 } from 'lucide-react';
import { visibleNav } from './nav';
import { useSettings } from '@/lib/settings';
import { useRouter } from './router';
import { useCommand } from './CommandBar';
import { Glass } from '@/ui/Glass';
import { LiquidIndicator, useActiveRect } from '@/ui/LiquidIndicator';
import { EternalCredit, Wordmark } from '@/ui/Logo';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function Sidebar() {
  const t = useT();
  const { route, go } = useRouter();
  const NAV = visibleNav(useSettings((s) => s.features));
  const openCommand = useCommand((s) => s.show);
  const listRef = useRef<HTMLUListElement>(null);
  const items = [...NAV.map((n) => n.id), 'settings' as const];
  const rect = useActiveRect(listRef, items.indexOf(route as never));

  return (
    <Glass shimmer={false} radius="xl" role="navigation" aria-label={t('Main navigation')} className="sidebar sticky top-4 m-4 mr-0 flex h-[calc(100dvh-2rem)] w-[248px] shrink-0 flex-col p-3">
      <a href="#/today" onClick={(e) => (e.preventDefault(), go('today'))} className="mb-5 mt-1 rounded-2xl px-2 py-1">
        <Wordmark />
      </a>
      <button
        type="button"
        onClick={openCommand}
        className="mb-4 flex h-10 items-center gap-2.5 rounded-[14px] bg-fg/[0.05] px-3 text-[14px] text-fg/50 transition-colors hover:bg-fg/[0.08] hover:text-fg/70"
      >
        <Search size={16} strokeWidth={2.2} aria-hidden />
        <span className="flex-1 text-left">{t('search.button')}</span>
        <kbd className="rounded-md bg-fg/[0.07] px-1.5 py-0.5 font-sans text-[11px] font-semibold">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>

      <ul ref={listRef} className="relative flex flex-1 flex-col gap-0.5">
        <LiquidIndicator rect={rect} axis="y" className="rounded-[14px] bg-fg/[0.07] shadow-[inset_0_0_0_1px_rgb(var(--fg)/0.04)] dark:bg-white/[0.09]" />
        {NAV.map((n, i) => {
          const active = route === n.id;
          return (
            <li key={n.id} data-index={i}>
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => go(n.id)}
                className={cn('relative flex h-11 w-full items-center gap-3 rounded-[14px] px-3 text-[15px] font-semibold tracking-[-0.01em] transition-colors', active ? 'text-fg' : 'text-fg/55 hover:text-fg/85')}
              >
                <n.icon size={20} strokeWidth={active ? 2.3 : 2} className={cn(active && n.id === 'afina' && 'text-pink')} aria-hidden />
                <span className="flex-1 text-left">{t(`nav.${n.id}`)}</span>
                <span className="text-[11px] font-medium text-fg/25">{isMac ? '⌥' : 'Alt '}{n.shortcut}</span>
              </button>
            </li>
          );
        })}
        <li className="mt-auto" data-index={NAV.length}>
          <button
            type="button"
            aria-current={route === 'settings' ? 'page' : undefined}
            onClick={() => go('settings')}
            className={cn('relative flex h-11 w-full items-center gap-3 rounded-[14px] px-3 text-[15px] font-semibold transition-colors', route === 'settings' ? 'text-fg' : 'text-fg/55 hover:text-fg/85')}
          >
            <Settings2 size={20} strokeWidth={2} aria-hidden />
            {t('nav.settings')}
          </button>
        </li>
      </ul>
      <div className="mt-3 border-t border-fg/[0.06] px-2 pt-3">
        <EternalCredit />
      </div>
    </Glass>
  );
}
