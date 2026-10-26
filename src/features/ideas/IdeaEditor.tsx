import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckSquare, NotebookPen, Target, Trash2, X } from 'lucide-react';
import { db } from '@/lib/db';
import { convertIdea, deleteIdea, updateIdea } from '@/lib/actions';
import type { Idea, IdeaColumn } from '@/lib/types';
import { Sheet } from '@/ui/Sheet';
import { Button, IconButton } from '@/ui/Button';
import { Field, TextArea } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { confirm } from '@/ui/Confirm';
import { toast } from '@/ui/Toast';
import { useT } from '@/lib/i18n';
import { useRouter } from '@/app/router';
import { useTaskEditor } from '@/features/planner/store';
import { useTodayTab } from '@/features/today/store';
import { useNotesState } from '@/features/notes/store';
import { useIdeaEditor } from './editorStore';
import { cn } from '@/lib/cn';

export const COLUMNS: { id: IdeaColumn; label: string }[] = [
  { id: 'raw', label: 'Raw' },
  { id: 'exploring', label: 'Exploring' },
  { id: 'doing', label: 'Doing' },
  { id: 'done', label: 'Done' },
];


/** Turns an idea into a task / note / goal and jumps to it. */
export async function convertAndOpen(idea: Idea, to: 'task' | 'note' | 'goal', tr: (s: string) => string) {
  const created = await convertIdea(idea.id, to);
  if (!created) return;
  useIdeaEditor.getState().close();
  if (to === 'task') useTaskEditor.getState().open(created.id);
  if (to === 'note') {
    useNotesState.getState().set({ openId: created.id });
    useRouter.getState().go('notes');
  }
  if (to === 'goal') {
    useTodayTab.getState().set('goals');
    useRouter.getState().go('today');
  }
  toast(`${tr(to === 'task' ? 'Turned into a task' : to === 'note' ? 'Turned into a note' : 'Turned into a goal')} · ${idea.title}`);
}

export function IdeaEditor() {
  const t = useT();
  const { id, close } = useIdeaEditor();
  const idea = useLiveQuery(() => (id ? db.ideas.get(id) : undefined), [id]);
  const [d, setD] = useState<Idea | null>(null);
  useEffect(() => {
    if (idea && idea.id !== d?.id) setD(idea);
    if (!id) setD(null);
  }, [idea, id, d?.id]);
  const patch = (p: Partial<Idea>) => {
    if (!d) return;
    setD({ ...d, ...p });
    void updateIdea(d.id, p);
  };
  return (
    <Sheet open={!!id && !!d} onClose={close} label={t('Idea')} className="max-w-lg">
      {d && (
        <div className="p-6">
          <div className="flex items-start gap-2">
            <input value={d.title} onChange={(e) => patch({ title: e.target.value })} aria-label={t('Title')} placeholder={t('Idea')} className="min-w-0 flex-1 bg-transparent text-[24px] font-bold tracking-[-0.02em] focus-visible:outline-none" />
            <IconButton icon={X} label={t('Close')} onClick={close} />
          </div>
          <Field label={t('Details')} htmlFor="idea-body" className="mt-4">
            <TextArea id="idea-body" value={d.body} onChange={(e) => patch({ body: e.target.value })} placeholder={t('What is it? Why might it matter?')} />
          </Field>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Segmented label={t('Stage')} value={d.column} onChange={(column) => patch({ column })} options={COLUMNS.map((c) => ({ value: c.id, label: t(c.label) }))} />
            <div className="flex gap-1.5" role="radiogroup" aria-label={t('Color')}>
              {(['none', 'blue', 'pink'] as const).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={d.color === c} aria-label={t(c === 'none' ? 'No color' : c === 'blue' ? 'Blue' : 'Pink')} onClick={() => patch({ color: c })} className={cn('h-7 w-7 rounded-full ring-offset-2 ring-offset-bg', c === 'none' ? 'bg-fg/10' : c === 'blue' ? 'bg-blue' : 'bg-pink', d.color === c && 'ring-2 ring-fg/60')} />
              ))}
            </div>
          </div>
          <div className="mt-6 rounded-[18px] bg-fg/[0.04] p-3">
            <p className="mb-2 px-1 text-[13px] font-semibold text-fg/60">{t('Turn this idea into…')}</p>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="glass" icon={CheckSquare} onClick={() => void convertAndOpen(d, 'task', t)}>{t('Task')}</Button>
              <Button variant="glass" icon={NotebookPen} onClick={() => void convertAndOpen(d, 'note', t)}>{t('Note')}</Button>
              <Button variant="glass" icon={Target} onClick={() => void convertAndOpen(d, 'goal', t)}>{t('Goal')}</Button>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              className="text-[#E5484D] hover:text-[#E5484D]"
              onClick={async () => {
                if (await confirm({ title: t('Delete this idea?'), body: `“${d.title}”`, confirmLabel: t('Delete'), danger: true })) {
                  close();
                  await deleteIdea(d.id);
                  toast(t('Idea deleted'));
                }
              }}
            >
              {t('Delete')}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
