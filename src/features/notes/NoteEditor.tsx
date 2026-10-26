import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Code, CodeSquare, Heading1, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered, Minus, Quote, Redo2, Strikethrough, Table2, Undo2,
  Columns3, Rows3, Trash2, type LucideIcon,
} from 'lucide-react';
import type { Note } from '@/lib/types';
import { updateNote } from '@/lib/actions';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { toast } from '@/ui/Toast';
import { promptText } from '@/ui/Confirm';
import { WikiLink, extractLinks } from './wikilink';

/** Shrinks pasted/inserted images so notes stay small in local storage. */
async function imageToDataUrl(file: File, max = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new window.Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ToolButton({ icon: Icon, label, active, onClick, disabled }: { icon: LucideIcon; label: string; active?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-30', active ? 'bg-fg text-bg' : 'text-fg/65 hover:bg-fg/[0.07] hover:text-fg')}
    >
      <Icon size={16} strokeWidth={2.2} aria-hidden />
    </button>
  );
}

function Toolbar({ editor, onImage }: { editor: Editor; onImage: () => void }) {
  const t = useT();
  const inTable = editor.isActive('table');
  const sep = <span className="mx-1 h-5 w-px shrink-0 bg-fg/10" aria-hidden />;
  return (
    <div className="no-scrollbar flex items-center gap-0.5 overflow-x-auto" role="toolbar" aria-label={t('Formatting')}>
      <ToolButton icon={Heading1} label={t('Heading 1')} active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
      <ToolButton icon={Heading2} label={t('Heading 2')} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <ToolButton icon={Heading3} label={t('Heading 3')} active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
      {sep}
      <ToolButton icon={Bold} label={t('Bold')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolButton icon={Italic} label={t('Italic')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolButton icon={Strikethrough} label={t('Strikethrough')} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <ToolButton icon={Code} label={t('Inline code')} active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />
      <ToolButton
        icon={Link2}
        label={t('Link')}
        active={editor.isActive('link')}
        onClick={async () => {
          if (editor.isActive('link')) return void editor.chain().focus().unsetLink().run();
          const { from, to } = editor.state.selection;
          const url = await promptText({ title: t('Add a link'), label: t('Web address'), placeholder: 'https://example.com', confirmLabel: t('Add link') });
          if (!url?.trim()) return;
          const href = /^[a-z]+:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
          editor.chain().focus().setTextSelection({ from, to }).extendMarkRange('link').setLink({ href }).run();
        }}
      />
      {sep}
      <ToolButton icon={List} label={t('Bullet list')} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolButton icon={ListOrdered} label={t('Numbered list')} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <ToolButton icon={ListChecks} label={t('Checklist')} active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} />
      <ToolButton icon={Quote} label={t('Quote')} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <ToolButton icon={CodeSquare} label={t('Code block')} active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
      <ToolButton icon={Minus} label={t('Divider')} onClick={() => editor.chain().focus().setHorizontalRule().run()} />
      {sep}
      <ToolButton icon={Table2} label={t('Insert table')} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
      {inTable && (
        <>
          <ToolButton icon={Rows3} label={t('Add row')} onClick={() => editor.chain().focus().addRowAfter().run()} />
          <ToolButton icon={Columns3} label={t('Add column')} onClick={() => editor.chain().focus().addColumnAfter().run()} />
          <ToolButton icon={Trash2} label={t('Delete table')} onClick={() => editor.chain().focus().deleteTable().run()} />
        </>
      )}
      <ToolButton icon={ImagePlus} label={t('Insert image')} onClick={onImage} />
      {sep}
      <ToolButton icon={Undo2} label={t('Undo')} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
      <ToolButton icon={Redo2} label={t('Redo')} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
    </div>
  );
}

/** Popup suggesting note titles after typing "[[". */
function LinkSuggest({ editor, titles }: { editor: Editor; titles: string[] }) {
  const [state, setState] = useState<{ query: string; from: number; x: number; y: number } | null>(null);
  const [sel, setSel] = useState(0);
  useEffect(() => {
    const update = () => {
      const { from, empty } = editor.state.selection;
      if (!empty) return setState(null);
      const before = editor.state.doc.textBetween(Math.max(0, from - 60), from, '\n', '\n');
      const m = before.match(/\[\[([^\]\n]*)$/);
      if (!m) return setState(null);
      const coords = editor.view.coordsAtPos(from);
      setState({ query: m[1], from: from - m[1].length - 2, x: coords.left, y: coords.bottom });
      setSel(0);
    };
    editor.on('selectionUpdate', update);
    editor.on('update', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('update', update);
    };
  }, [editor]);

  const matches = useMemo(() => {
    if (!state) return [];
    const q = state.query.toLowerCase();
    const list = titles.filter((t) => t.toLowerCase().includes(q)).slice(0, 6);
    if (state.query.trim() && !titles.some((t) => t.toLowerCase() === q)) list.push(state.query.trim());
    return list;
  }, [state, titles]);

  const pick = (title: string) => {
    if (!state) return;
    const to = editor.state.selection.from;
    editor
      .chain()
      .focus()
      .deleteRange({ from: state.from, to })
      .insertContent([{ type: 'text', text: title, marks: [{ type: 'wikilink', attrs: { title } }] }, { type: 'text', text: ' ' }])
      .run();
    setState(null);
  };

  useEffect(() => {
    if (!state || !matches.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => (s + 1) % matches.length));
      else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => (s - 1 + matches.length) % matches.length));
      else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        pick(matches[sel]);
      } else if (e.key === 'Escape') setState(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!state || !matches.length) return null;
  return (
    <div className="glass glass-strong fixed z-50 w-64 rounded-2xl p-1.5" style={{ left: Math.min(state.x, innerWidth - 270), top: state.y + 6 }} role="listbox" aria-label="Link to note">
      {matches.map((m, i) => (
        <button
          key={m + i}
          type="button"
          role="option"
          aria-selected={i === sel}
          onMouseDown={(e) => (e.preventDefault(), pick(m))}
          className={cn('flex w-full items-center gap-2 truncate rounded-xl px-3 py-2 text-left text-[14px] font-medium', i === sel && 'bg-fg/[0.07]')}
        >
          {i === matches.length - 1 && !titles.includes(m) ? <span className="text-blue">+ “{m}”</span> : m}
        </button>
      ))}
    </div>
  );
}

export function NoteEditor({ note, titles, onOpenLink }: { note: Note; titles: string[]; onOpenLink: (title: string) => void }) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef(0);
  const latest = useRef<{ content: JSONContent; text: string } | null>(null);

  const flush = () => {
    clearTimeout(saveTimer.current);
    const l = latest.current;
    if (!l) return;
    latest.current = null;
    void updateNote(note.id, { content: l.content, text: l.text, links: extractLinks(l.content) });
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ allowBase64: true }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Placeholder.configure({ placeholder: ({ node }) => (node.type.name === 'heading' ? t('Heading') : t('Start writing — use # for headings, [] for checklists, [[ to link a note')) }),
      WikiLink,
    ],
    content: (note.content as JSONContent) ?? '',
    editorProps: {
      attributes: { class: 'prose-up focus:outline-none', 'aria-label': t('Note body') },
      handleClick: (_view, _pos, event) => {
        const el = (event.target as HTMLElement).closest<HTMLElement>('[data-wikilink]');
        if (el) {
          onOpenLink(el.dataset.title ?? el.textContent ?? '');
          return true;
        }
        const a = (event.target as HTMLElement).closest('a');
        if (a && (event.metaKey || event.ctrlKey)) window.open(a.href, '_blank', 'noopener');
        return false;
      },
      handlePaste: (_view, event) => {
        const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
        if (!file) return false;
        void imageToDataUrl(file).then((src) => editorRef.current?.chain().focus().setImage({ src }).run());
        return true;
      },
      handleDrop: (_view, event) => {
        const file = [...(event.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
        if (!file) return false;
        event.preventDefault();
        void imageToDataUrl(file).then((src) => editorRef.current?.chain().focus().setImage({ src }).run());
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      latest.current = { content: editor.getJSON(), text: editor.getText({ blockSeparator: '\n' }) };
      clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(flush, 400);
    },
  });
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  // Save pending edits when switching notes or leaving the page.
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 -mx-1 mb-3 rounded-[14px] bg-fg/[0.03] px-1 py-1">
        <Toolbar editor={editor} onImage={() => fileRef.current?.click()} />
      </div>
      <EditorContent editor={editor} className="min-h-[50vh] flex-1 cursor-text" onClick={(e) => e.target === e.currentTarget && editor.commands.focus('end')} />
      <LinkSuggest editor={editor} titles={titles} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            editor.chain().focus().setImage({ src: await imageToDataUrl(f) }).run();
          } catch {
            toast(t('That image couldn’t be read.'), { tone: 'error' });
          }
        }}
      />
    </div>
  );
}
