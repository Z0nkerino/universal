import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { CornerDownLeft, Download, Monitor, Moon, Palette, Search, Settings2, Sun, Wind, type LucideIcon } from 'lucide-react';
import { NAV } from './nav';
import { useRouter, type Route } from './router';
import { Sheet } from '@/ui/Sheet';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings';
import { downloadBackup } from '@/lib/backup';
import { cn } from '@/lib/cn';

export const useCommand = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

interface Command {
  id: string;
  group: string;
  title: string;
  hint?: string;
  keywords?: string;
  icon: LucideIcon;
  run: () => void;
}

/** Subsequence match with bonuses for word starts and contiguous runs. Returns -1 for no match. */
export function fuzzyScore(query: string, text: string) {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const s = text.toLowerCase();
  if (s.includes(q)) return 100 - s.indexOf(q);
  let score = 0;
  let last = -1;
  for (const ch of q) {
    if (ch === ' ') continue;
    const i = s.indexOf(ch, last + 1);
    if (i < 0) return -1;
    score += i === last + 1 ? 3 : 1;
    if (i === 0 || s[i - 1] === ' ') score += 2;
    last = i;
  }
  return score;
}

export function CommandBar() {
  const t = useT();
  const { open, hide } = useCommand();
  const go = useRouter((s) => s.go);
  const settings = useSettings();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const nav = (id: Route, icon: LucideIcon, keywords = ''): Command => ({ id: `go-${id}`, group: 'Go to', title: t(`nav.${id}`), keywords: `${id} ${keywords}`, icon, run: () => go(id) });
    return [
      ...NAV.map((n) => nav(n.id, n.icon)),
      nav('settings', Settings2, 'preferences options'),
      nav('design', Palette, 'components style tokens'),
      { id: 'theme-light', group: 'Appearance', title: 'Light mode', icon: Sun, keywords: 'theme white', run: () => settings.set({ theme: 'light' }) },
      { id: 'theme-dark', group: 'Appearance', title: 'Dark mode', icon: Moon, keywords: 'theme black night', run: () => settings.set({ theme: 'dark' }) },
      { id: 'theme-system', group: 'Appearance', title: 'Match system appearance', icon: Monitor, keywords: 'theme auto', run: () => settings.set({ theme: 'system' }) },
      {
        id: 'motion',
        group: 'Appearance',
        title: settings.motion === 'reduced' ? 'Turn on full motion' : 'Reduce motion',
        icon: Wind,
        keywords: 'animation accessibility',
        run: () => settings.set({ motion: settings.motion === 'reduced' ? 'system' : 'reduced' }),
      },
      { id: 'export', group: 'Data', title: 'Export backup (.json)', icon: Download, keywords: 'save download', run: () => void downloadBackup() },
    ];
  }, [t, go, settings]);

  const results = useMemo(() => {
    if (!q.trim()) return commands;
    return commands
      .map((c) => ({ c, s: Math.max(fuzzyScore(q, c.title), fuzzyScore(q, c.keywords ?? '') - 5) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.c);
  }, [q, commands]);

  useEffect(() => setSel(0), [q, open]);
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const run = (c?: Command) => {
    if (!c) return;
    hide();
    c.run();
  };

  let lastGroup = '';
  return (
    <Sheet open={open} onClose={hide} label="Command bar" position="top" className="max-w-[640px]">
      <div className="flex items-center gap-3 border-b border-fg/[0.07] px-5">
        <Search size={20} className="text-fg/40" aria-hidden />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(s + 1, results.length - 1)));
            if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
            if (e.key === 'Enter') (e.preventDefault(), run(results[sel]));
          }}
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          role="combobox"
          aria-expanded="true"
          aria-controls="cmd-list"
          aria-activedescendant={results[sel] ? `cmd-${results[sel].id}` : undefined}
          className="h-16 flex-1 bg-transparent focus-visible:outline-none text-[18px] font-medium tracking-[-0.01em] placeholder:text-fg/35"
        />
        <kbd className="rounded-md bg-fg/[0.07] px-1.5 py-0.5 text-[11px] font-semibold text-fg/50">esc</kbd>
      </div>
      <div ref={listRef} id="cmd-list" role="listbox" className="thin-scrollbar max-h-[min(420px,55vh)] overflow-y-auto p-2">
        {results.length === 0 && (
          <p className="px-4 py-10 text-center text-[15px] text-fg/50">
            Nothing matches “{q}”. Creating tasks and events from here arrives in Phase 2.
          </p>
        )}
          {results.map((c, i) => {
            const header = c.group !== lastGroup && !q.trim();
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {header && <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg/40">{c.group}</p>}
                <button
                  id={`cmd-${c.id}`}
                  data-i={i}
                  role="option"
                  aria-selected={i === sel}
                  type="button"
                  onMouseMove={() => setSel(i)}
                  onClick={() => run(c)}
                  className="relative flex h-12 w-full items-center gap-3 rounded-[14px] px-3 text-left text-[15px] font-medium"
                >
                  {i === sel && <span className="absolute inset-0 rounded-[14px] bg-fg/[0.07]" />}
                  <span className={cn('relative flex h-8 w-8 items-center justify-center rounded-[10px]', i === sel ? 'bg-brand text-white' : 'bg-fg/[0.06] text-fg/70')}>
                    <c.icon size={16} strokeWidth={2.2} aria-hidden />
                  </span>
                  <span className="relative flex-1">{c.title}</span>
                  {i === sel && <CornerDownLeft size={15} className="relative text-fg/40" aria-hidden />}
                </button>
              </div>
            );
          })}
      </div>
    </Sheet>
  );
}
