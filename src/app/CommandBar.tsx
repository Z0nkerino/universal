import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CalendarPlus, CheckSquare, CornerDownLeft, Download, Lightbulb, ListPlus, Monitor, Moon, NotebookPen, Palette, Repeat, Search, Settings2, Sparkles, Sun, Target, Wind, CalendarDays, type LucideIcon,
} from 'lucide-react';
import { NAV } from './nav';
import { useRouter, type Route } from './router';
import { Sheet } from '@/ui/Sheet';
import { toast } from '@/ui/Toast';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings';
import { downloadBackup } from '@/lib/backup';
import { db } from '@/lib/db';
import { createIdea, createNote, quickAdd } from '@/lib/actions';
import { parseQuickAdd } from '@/lib/nlp';
import { fmt, fmtTime } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { useTaskEditor } from '@/features/planner/store';
import { useEventEditor } from '@/features/calendar/EventEditor';
import { useIdeaEditor } from '@/features/ideas/IdeaEditor';
import { useNotesState } from '@/features/notes/store';
import { useTodayTab } from '@/features/today/store';

export const useCommand = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

interface Command {
  id: string;
  group: string;
  title: string;
  sub?: string;
  keywords?: string;
  icon: LucideIcon;
  tone?: 'blue' | 'pink';
  run: () => void | Promise<void>;
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

/** Word-based match for searching records (every word must appear). */
function wordsMatch(q: string, text: string) {
  const t = text.toLowerCase().replace(/ё/g, 'е');
  const words = q.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
  if (!words.length || !words.every((w) => t.includes(w))) return -1;
  return 50 + (t.startsWith(words[0]) ? 20 : 0) - Math.min(30, t.length / 4);
}

export function CommandBar() {
  const t = useT();
  const { open, hide } = useCommand();
  const go = useRouter((s) => s.go);
  const settings = useSettings();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Only read records while the bar is open.
  const records = useLiveQuery(
    async () =>
      open
        ? {
            tasks: await db.tasks.toArray(),
            events: await db.events.toArray(),
            notes: await db.notes.toArray(),
            ideas: await db.ideas.toArray(),
            goals: await db.goals.toArray(),
            habits: await db.habits.toArray(),
          }
        : null,
    [open],
  );

  const commands = useMemo<Command[]>(() => {
    const nav = (id: Route, icon: LucideIcon, keywords = ''): Command => ({ id: `go-${id}`, group: t('Go to'), title: t(`nav.${id}`), keywords: `${id} ${keywords}`, icon, run: () => go(id) });
    return [
      ...NAV.map((n) => nav(n.id, n.icon)),
      nav('settings', Settings2, 'preferences options настройки'),
      nav('design', Palette, 'components style tokens'),
      { id: 'tasks', group: t('Go to'), title: t('Tasks & timeline'), keywords: 'planner inbox задачи', icon: CheckSquare, run: () => (useTodayTab.getState().set('tasks'), go('today')) },
      { id: 'habits', group: t('Go to'), title: t('Habits'), keywords: 'streak привычки', icon: Repeat, run: () => (useTodayTab.getState().set('habits'), go('today')) },
      { id: 'goals', group: t('Go to'), title: t('Goals'), keywords: 'milestones цели', icon: Target, run: () => (useTodayTab.getState().set('goals'), go('today')) },
      { id: 'theme-light', group: t('Appearance'), title: t('Light mode'), icon: Sun, keywords: 'theme white', run: () => settings.set({ theme: 'light' }) },
      { id: 'theme-dark', group: t('Appearance'), title: t('Dark mode'), icon: Moon, keywords: 'theme black night', run: () => settings.set({ theme: 'dark' }) },
      { id: 'theme-system', group: t('Appearance'), title: t('Match system appearance'), icon: Monitor, keywords: 'theme auto', run: () => settings.set({ theme: 'system' }) },
      { id: 'motion', group: t('Appearance'), title: settings.motion === 'reduced' ? t('Turn on full motion') : t('Reduce motion'), icon: Wind, keywords: 'animation accessibility', run: () => settings.set({ motion: settings.motion === 'reduced' ? 'system' : 'reduced' }) },
      { id: 'export', group: t('Data'), title: t('Export backup (.json)'), icon: Download, keywords: 'save download', run: () => void downloadBackup() },
    ];
  }, [t, go, settings]);

  const results = useMemo(() => {
    const text = q.trim();
    if (!text) return commands;
    const out: (Command & { score: number })[] = [];

    // Create anything from a sentence.
    const p = parseQuickAdd(text);
    const when = p.start !== undefined ? ` · ${fmt(p.start, 'EEE d MMM')}${p.hasTime ? `, ${fmtTime(p.start)}` : ''}` : '';
    out.push({
      id: 'create',
      group: t('Create'),
      title: `${p.kind === 'event' ? t('Add event') : t('Add task')}: ${p.title}`,
      sub: when ? when.slice(3) : undefined,
      icon: p.kind === 'event' ? CalendarPlus : ListPlus,
      tone: p.kind === 'event' ? 'pink' : 'blue',
      score: 1000,
      run: async () => {
        const r = await quickAdd(text);
        toast(`${r.kind === 'event' ? t('Event added') : t('Task added')} · ${r.record.title}`);
      },
    });
    out.push({ id: 'ask', group: t('Create'), title: `${t('Ask Afina')}: “${text}”`, icon: Sparkles, tone: 'pink', score: 999, run: async () => {
      go('afina');
      const { sendToAfina } = await import('@/features/afina/chat');
      await sendToAfina(text);
    } });
    out.push({ id: 'idea', group: t('Create'), title: `${t('Capture idea')}: ${text}`, icon: Lightbulb, score: 998, run: async () => {
      await createIdea({ title: text });
      toast(`${t('Idea captured')} · ${text}`);
    } });
    out.push({ id: 'note', group: t('Create'), title: `${t('New note')}: ${text}`, icon: NotebookPen, score: 997, run: async () => {
      const n = await createNote({ title: text, text, content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text }] }, { type: 'paragraph' }] } });
      useNotesState.getState().set({ openId: n.id });
      go('notes');
    } });

    // Search everything.
    if (records) {
      const add = (c: Omit<Command, 'group'>, score: number) => score >= 0 && out.push({ ...c, group: t('Found'), score });
      for (const x of records.tasks) add({ id: `t-${x.id}`, title: x.title, sub: x.done ? t('Done') : x.due ? x.due : t('Inbox'), icon: CheckSquare, run: () => useTaskEditor.getState().open(x.id) }, wordsMatch(text, `${x.title} ${x.tags.join(' ')} ${x.notes ?? ''}`) - (x.done ? 15 : 0));
      for (const x of records.events) add({ id: `e-${x.id}`, title: x.title, sub: `${fmt(x.start, 'EEE d MMM')}${x.allDay ? '' : `, ${fmtTime(x.start)}`}${x.rrule ? ` · ${t('repeats')}` : ''}`, icon: CalendarDays, run: () => void useEventEditor.getState().openExisting(x.id) }, wordsMatch(text, `${x.title} ${x.location ?? ''} ${x.notes ?? ''}`));
      for (const x of records.notes) add({ id: `n-${x.id}`, title: x.title || t('Untitled'), sub: x.folder, icon: NotebookPen, run: () => (useNotesState.getState().set({ openId: x.id }), go('notes')) }, Math.max(wordsMatch(text, x.title) + 10, wordsMatch(text, x.text) - 10));
      for (const x of records.ideas) add({ id: `i-${x.id}`, title: x.title, sub: t('Idea'), icon: Lightbulb, run: () => (go('ideas'), useIdeaEditor.getState().open(x.id)) }, wordsMatch(text, `${x.title} ${x.body}`));
      for (const x of records.goals) add({ id: `g-${x.id}`, title: x.title, sub: t('Goal'), icon: Target, run: () => (useTodayTab.getState().set('goals'), go('today')) }, wordsMatch(text, `${x.title} ${x.why ?? ''}`));
      for (const x of records.habits) add({ id: `h-${x.id}`, title: `${x.emoji} ${x.name}`, sub: t('Habit'), icon: Repeat, run: () => (useTodayTab.getState().set('habits'), go('today')) }, wordsMatch(text, x.name));
    }
    for (const c of commands) {
      const s = Math.max(fuzzyScore(text, c.title), fuzzyScore(text, c.keywords ?? '') - 5);
      if (s >= 0) out.push({ ...c, score: s });
    }
    // A sentence with a time or a creation verb is something to add; anything else is a search.
    const create = out.filter((c) => c.group === t('Create'));
    const found = out.filter((c) => c.group === t('Found')).sort((a, b) => b.score - a.score).slice(0, 8);
    const other = out.filter((c) => c.group !== t('Create') && c.group !== t('Found')).sort((a, b) => b.score - a.score).slice(0, 6);
    const looksLikeCreate = p.start !== undefined || /^(add|new|create|make|remind|schedule|book|task|event|добавь|создай|новая|новое|напомни|запланируй)\b/i.test(text) || /^(добавь|создай|напомни|запланируй)/i.test(text);
    return looksLikeCreate || (!found.length && !other.length) ? [...create, ...found, ...other] : [...found, ...other, ...create];
  }, [q, commands, records, t, go]);

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
    void c.run();
  };

  let lastGroup = '';
  return (
    <Sheet open={open} onClose={hide} label={t('Command bar')} position="top" className="max-w-[640px]">
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
          placeholder={t('Search everything, or type “new task tomorrow 5pm gym”')}
          aria-label={t('Search or create')}
          role="combobox"
          aria-expanded="true"
          aria-controls="cmd-list"
          aria-activedescendant={results[sel] ? `cmd-${results[sel].id}` : undefined}
          className="h-16 flex-1 bg-transparent text-[17px] font-medium tracking-[-0.01em] placeholder:text-fg/35 focus-visible:outline-none"
        />
        <kbd className="rounded-md bg-fg/[0.07] px-1.5 py-0.5 text-[11px] font-semibold text-fg/50">esc</kbd>
      </div>
      <div ref={listRef} id="cmd-list" role="listbox" className="thin-scrollbar max-h-[min(460px,58vh)] overflow-y-auto p-2">
        {results.map((c, i) => {
          const header = c.group !== lastGroup;
          lastGroup = c.group;
          return (
            <div key={c.id}>
              {header && <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg/45">{c.group}</p>}
              <button
                id={`cmd-${c.id}`}
                data-i={i}
                role="option"
                aria-selected={i === sel}
                type="button"
                onMouseMove={() => setSel(i)}
                onClick={() => run(c)}
                className="relative flex min-h-12 w-full items-center gap-3 rounded-[14px] px-3 py-1.5 text-left text-[15px] font-medium"
              >
                {i === sel && <span className="absolute inset-0 rounded-[14px] bg-fg/[0.07]" />}
                <span className={cn('relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]', i === sel ? 'bg-brand text-white' : c.tone === 'pink' ? 'bg-pink/12 text-pink' : c.tone === 'blue' ? 'bg-blue/12 text-blue' : 'bg-fg/[0.06] text-fg/70')}>
                  <c.icon size={16} strokeWidth={2.2} aria-hidden />
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate">{c.title}</span>
                  {c.sub && <span className="block truncate text-[12px] font-normal text-fg/50">{c.sub}</span>}
                </span>
                {i === sel && <CornerDownLeft size={15} className="relative shrink-0 text-fg/40" aria-hidden />}
              </button>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
