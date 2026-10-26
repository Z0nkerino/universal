import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, FileText, Folder, FolderPlus, Hash, Link2, NotebookPen, Pin, PinOff, Plus, Search, Trash2, X } from 'lucide-react';
import { db } from '@/lib/db';
import { createNote, deleteNote, updateNote } from '@/lib/actions';
import type { Note } from '@/lib/types';
import { PageHeader } from '@/ui/PageHeader';
import { Glass } from '@/ui/Glass';
import { Button, IconButton } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { confirm, promptText } from '@/ui/Confirm';
import { toast } from '@/ui/Toast';
import { useIsDesktop } from '@/lib/hooks';
import { useT, tNow } from '@/lib/i18n';
import { fmt } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { itemVariants, spring } from '@/lib/motion';
import { NoteEditor } from './NoteEditor';
import { searchNotes } from './search';

import { useNotesState, type Filter } from './store';

function relTime(t: number, tr: (s: string) => string) {
  const diff = Date.now() - t;
  if (diff < 60_000) return tr('just now');
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} ${tNow('min')}`;
  if (diff < 86_400_000) return fmt(t, 'p');
  if (diff < 7 * 86_400_000) return fmt(t, 'EEE');
  return fmt(t, 'd MMM');
}

function Sidebar({ notes, filter, onFilter, folders }: { notes: Note[]; filter: Filter; onFilter: (f: Filter) => void; folders: string[] }) {
  const t = useT();
  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) for (const tag of n.tags) m.set(tag, (m.get(tag) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [notes]);
  const item = (key: string, active: boolean, onClick: () => void, icon: typeof Folder, label: string, count?: number) => {
    const Icon = icon;
    return (
      <button key={key} type="button" onClick={onClick} aria-current={active ? 'true' : undefined} className={cn('flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-[14px] font-semibold transition-colors', active ? 'bg-fg/[0.08] text-fg' : 'text-fg/60 hover:bg-fg/[0.04] hover:text-fg')}>
        <Icon size={16} aria-hidden className="shrink-0" />
        <span className="flex-1 truncate text-left">{label}</span>
        {count !== undefined && <span className="text-[12px] tabular-nums text-fg/40">{count}</span>}
      </button>
    );
  };
  return (
    <nav aria-label={t('Note folders')} className="flex flex-col gap-0.5">
      {item('all', filter.kind === 'all', () => onFilter({ kind: 'all' }), FileText, t('All notes'), notes.length)}
      {item('pinned', filter.kind === 'pinned', () => onFilter({ kind: 'pinned' }), Pin, t('Pinned'), notes.filter((n) => n.pinned).length)}
      <p className="mt-3 flex items-center justify-between px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg/45">
        {t('Folders')}
        <button
          type="button"
          aria-label={t('New folder')}
          className="rounded-md p-0.5 hover:bg-fg/[0.06]"
          onClick={async () => {
            const name = await promptText({ title: t('New folder'), label: t('Folder name'), placeholder: t('Projects'), confirmLabel: t('Create') });
            if (name?.trim()) {
              const n = await createNote({ title: '', folder: name.trim() });
              useNotesState.getState().set({ filter: { kind: 'folder', name: name.trim() }, openId: n.id });
            }
          }}
        >
          <FolderPlus size={14} aria-hidden />
        </button>
      </p>
      {folders.map((f) => item(`f:${f}`, filter.kind === 'folder' && filter.name === f, () => onFilter({ kind: 'folder', name: f }), Folder, f, notes.filter((n) => n.folder === f).length))}
      {tags.length > 0 && <p className="mt-3 px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg/45">{t('Tags')}</p>}
      {tags.slice(0, 12).map(([tag, n]) => item(`t:${tag}`, filter.kind === 'tag' && filter.name === tag, () => onFilter({ kind: 'tag', name: tag }), Hash, tag, n))}
    </nav>
  );
}

function NoteHeader({ note, folders, onBack, shared }: { note: Note; folders: string[]; onBack?: () => void; shared?: boolean }) {
  const t = useT();
  const [title, setTitle] = useState(note.title);
  const [tags, setTags] = useState(note.tags.join(', '));
  useEffect(() => {
    setTitle(note.title);
    setTags(note.tags.join(', '));
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1">
        {onBack && <IconButton icon={ArrowLeft} label={t('Back to notes')} onClick={onBack} />}
        <select
          aria-label={t('Folder')}
          value={note.folder}
          onChange={(e) => void updateNote(note.id, { folder: e.target.value })}
          className="h-8 max-w-[45%] truncate rounded-lg bg-transparent px-1.5 text-[13px] font-semibold text-fg/55 hover:bg-fg/[0.05]"
        >
          {[...new Set([...folders, note.folder])].map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <span className="ml-auto text-[12px] text-fg/40">{t('Edited')} {relTime(note.updatedAt, t)}</span>
        <IconButton icon={note.pinned ? PinOff : Pin} size={34} label={note.pinned ? t('Unpin') : t('Pin')} onClick={() => void updateNote(note.id, { pinned: note.pinned ? 0 : 1 })} />
        <IconButton
          icon={Trash2}
          size={34}
          label={t('Delete note')}
          onClick={async () => {
            if (await confirm({ title: t('Delete this note?'), body: note.title ? `“${note.title}”` : undefined, confirmLabel: t('Delete'), danger: true })) {
              await deleteNote(note.id);
              useNotesState.getState().set({ openId: null });
              toast(t('Note deleted'));
            }
          }}
        />
      </div>
      <motion.div layoutId={shared ? `note-title-${note.id}` : undefined} transition={spring}>
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          void updateNote(note.id, { title: e.target.value });
        }}
        placeholder={t('Untitled')}
        aria-label={t('Note title')}
        className="mt-2 w-full bg-transparent text-[30px] font-bold leading-tight tracking-[-0.03em] placeholder:text-fg/25 focus-visible:outline-none sm:text-[34px]"
      />
      </motion.div>
      <div className="mt-1 flex items-center gap-1.5 text-[13px] text-fg/50">
        <Hash size={13} aria-hidden />
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          onBlur={() => void updateNote(note.id, { tags: [...new Set(tags.split(',').map((x) => x.trim().replace(/^#/, '').toLowerCase()).filter(Boolean))] })}
          placeholder={t('Add tags, separated by commas')}
          aria-label={t('Tags')}
          className="flex-1 bg-transparent placeholder:text-fg/30 focus-visible:outline-none"
        />
      </div>
    </div>
  );
}

function Backlinks({ note, onOpen }: { note: Note; onOpen: (n: Note) => void }) {
  const t = useT();
  const back = useLiveQuery(() => (note.title ? db.notes.where('links').equals(note.title).toArray() : []), [note.title]) ?? [];
  if (!back.length) return null;
  return (
    <section className="mt-8 border-t border-fg/[0.06] pt-4" aria-label={t('Linked from')}>
      <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg/50">
        <Link2 size={13} aria-hidden /> {t('Linked from')} · {back.length}
      </h3>
      <div className="flex flex-wrap gap-2">
        {back.map((b) => (
          <button key={b.id} type="button" onClick={() => onOpen(b)} className="rounded-xl bg-blue/10 px-3 py-1.5 text-[13px] font-semibold text-blue hover:bg-blue/15">
            {b.title || t('Untitled')}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function NotesPage() {
  const t = useT();
  const desktop = useIsDesktop();
  const { openId, filter, set } = useNotesState();
  const [query, setQuery] = useState('');
  const notes = useLiveQuery(() => db.notes.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const open = notes.find((n) => n.id === openId) ?? null;
  const folders = useMemo(() => [...new Set(['Notes', ...notes.map((n) => n.folder)])].sort((a, b) => (a === 'Notes' ? -1 : b === 'Notes' ? 1 : a.localeCompare(b))), [notes]);
  const titles = useMemo(() => notes.map((n) => n.title).filter(Boolean), [notes]);

  const filtered = useMemo(() => {
    const base = notes.filter((n) => (filter.kind === 'pinned' ? n.pinned : filter.kind === 'folder' ? n.folder === filter.name : filter.kind === 'tag' ? n.tags.includes(filter.name) : true));
    if (query.trim()) return searchNotes(base, query);
    return [...base].sort((a, b) => b.pinned - a.pinned || b.updatedAt - a.updatedAt).map((note) => ({ note, score: 0, snippet: note.text.replace(note.title, '').trim().slice(0, 140) }));
  }, [notes, filter, query]);

  // Desktop opens the most recent note so the editor is never blank.
  useEffect(() => {
    if (desktop && !openId && filtered[0]) set({ openId: filtered[0].note.id });
  }, [desktop, openId, filtered, set]);

  const newNote = async () => {
    const n = await createNote({ folder: filter.kind === 'folder' ? filter.name : 'Notes', tags: filter.kind === 'tag' ? [filter.name] : [] });
    setQuery('');
    set({ openId: n.id });
  };

  const openByTitle = async (title: string) => {
    const existing = notes.find((n) => n.title.toLowerCase() === title.toLowerCase());
    if (existing) return set({ openId: existing.id });
    const n = await createNote({ title, content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] }, { type: 'paragraph' }] }, text: title });
    toast(`${t('Created')} “${title}”`);
    set({ openId: n.id });
  };

  const list = (
    <div className="flex min-h-0 flex-col">
      <div className="relative mb-2">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg/40" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Search notes')}
          aria-label={t('Search notes')}
          className="h-11 w-full rounded-[14px] bg-fg/[0.05] pl-10 pr-9 text-[15px] placeholder:text-fg/40 focus:shadow-[0_0_0_2px_rgb(47_107_255/0.5)] focus-visible:outline-none"
        />
        {query && <button type="button" aria-label={t('Clear search')} onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg/40 hover:text-fg"><X size={16} /></button>}
      </div>
      {filtered.length === 0 ? (
        query ? (
          <EmptyState compact icon={Search} title={t('No matches')} body={`${t('Nothing contains')} “${query}”.`} />
        ) : (
          <EmptyState compact icon={NotebookPen} title={t('No notes here yet')} body={t('Write something down — ideas, plans, meeting notes.')} action={<Button size="sm" variant="brand" icon={Plus} onClick={() => void newNote()}>{t('New note')}</Button>} />
        )
      ) : (
        <ul className="thin-scrollbar -mx-1 flex flex-col gap-0.5 overflow-y-auto px-1 lg:max-h-[calc(100dvh-300px)]" aria-label={t('Notes')}>
          <AnimatePresence initial={false}>
            {filtered.map(({ note, snippet }) => (
              <motion.li key={note.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={spring}>
                <button
                  type="button"
                  onClick={() => set({ openId: note.id })}
                  aria-current={note.id === openId ? 'true' : undefined}
                  className={cn('w-full rounded-[16px] px-3 py-2.5 text-left transition-colors', note.id === openId ? 'bg-fg/[0.08]' : 'hover:bg-fg/[0.04]')}
                >
                  <span className="flex items-center gap-1.5">
                    {note.pinned ? <Pin size={12} className="shrink-0 text-pink" aria-label={t('Pinned')} /> : null}
                    {/* On phones the title morphs into the open note's heading. */}
                    <motion.span layoutId={desktop ? undefined : `note-title-${note.id}`} transition={spring} className="truncate text-[15px] font-semibold">
                      {note.title || t('Untitled')}
                    </motion.span>
                    <span className="ml-auto shrink-0 text-[11px] text-fg/40">{relTime(note.updatedAt, t)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-fg/50">{snippet || t('No additional text')}</span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );

  const editorPane = open ? (
    <motion.div key={open.id} initial={{ opacity: 0, y: desktop ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="flex min-h-0 flex-col">
      <NoteHeader note={open} folders={folders} shared={!desktop} onBack={desktop ? undefined : () => set({ openId: null })} />
      <NoteEditor key={open.id} note={open} titles={titles.filter((x) => x !== open.title)} onOpenLink={(title) => void openByTitle(title)} />
      <Backlinks note={open} onOpen={(n) => set({ openId: n.id })} />
    </motion.div>
  ) : (
    <EmptyState icon={NotebookPen} title={t('Pick a note')} body={t('Or start a fresh one.')} action={<Button variant="brand" icon={Plus} onClick={() => void newNote()}>{t('New note')}</Button>} />
  );

  if (!desktop) {
    return (
      <>
        {!open && <PageHeader title={t('nav.notes')} actions={<Button icon={Plus} onClick={() => void newNote()} aria-label={t('New note')} />} />}
        <motion.div variants={itemVariants}>
          <Glass shimmer={false} radius="xl" className="p-3">
            {open ? (
              editorPane
            ) : (
              <>
                <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1">
                  {[{ kind: 'all' } as Filter, { kind: 'pinned' } as Filter, ...folders.map((f) => ({ kind: 'folder', name: f }) as Filter)].map((f, i) => {
                    const active = JSON.stringify(f) === JSON.stringify(filter);
                    const label = f.kind === 'all' ? t('All notes') : f.kind === 'pinned' ? t('Pinned') : f.kind === 'folder' ? f.name : '';
                    return (
                      <button key={i} type="button" onClick={() => set({ filter: f })} className={cn('h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold', active ? 'bg-fg text-bg' : 'bg-fg/[0.06] text-fg/65')}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                {list}
              </>
            )}
          </Glass>
        </motion.div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('nav.notes')} actions={<Button icon={Plus} onClick={() => void newNote()}>{t('New note')}</Button>} />
      <motion.div variants={itemVariants} className="grid grid-cols-[200px_300px_minmax(0,1fr)] gap-4 xl:grid-cols-[220px_340px_minmax(0,1fr)]">
        <Glass shimmer={false} radius="xl" className="p-2.5">
          <Sidebar notes={notes} filter={filter} onFilter={(f) => set({ filter: f })} folders={folders} />
        </Glass>
        <Glass shimmer={false} radius="xl" className="p-2.5">
          {list}
        </Glass>
        <Glass shimmer={false} radius="xl" className="min-h-[70vh] p-5 xl:p-7">
          {editorPane}
        </Glass>
      </motion.div>
    </>
  );
}
