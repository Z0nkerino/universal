import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { motion } from 'framer-motion';
import { Lightbulb, ListPlus, NotebookPen, Plus } from 'lucide-react';
import { Sheet } from '@/ui/Sheet';
import { Button } from '@/ui/Button';
import { Segmented } from '@/ui/Segmented';
import { toast } from '@/ui/Toast';
import { createIdea, createNote, quickAdd } from '@/lib/actions';
import { useIsDesktop } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { springSnappy } from '@/lib/motion';
import { useRouter } from './router';

type Kind = 'idea' | 'task' | 'note';
export const useCapture = create<{ open: boolean; kind: Kind; show: (kind?: Kind) => void; hide: () => void }>((set) => ({
  open: false,
  kind: 'idea',
  show: (kind) => set((s) => ({ open: true, kind: kind ?? s.kind })),
  hide: () => set({ open: false }),
}));

/** Capture a thought from anywhere: Alt+N on desktop, the floating + on phones. */
export function QuickCapture() {
  const t = useT();
  const desktop = useIsDesktop();
  const { open, kind, show, hide } = useCapture();
  // Afina has her own input; the floating + would sit on top of its send button.
  const route = useRouter((r) => r.route);
  const [text, setText] = useState('');
  useEffect(() => {
    if (!open) setText('');
  }, [open]);

  const save = async () => {
    const value = text.trim();
    if (!value) return;
    const [first, ...rest] = value.split('\n');
    if (kind === 'idea') {
      await createIdea({ title: first.trim(), body: rest.join('\n').trim() });
      toast(`${t('Idea captured')} · ${first.trim()}`);
    } else if (kind === 'task') {
      const r = await quickAdd(value);
      toast(`${r.kind === 'event' ? t('Event added') : t('Task added')} · ${r.record.title}`);
    } else {
      await createNote({
        title: first.trim(),
        text: value,
        content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: first.trim() }] }, ...rest.filter(Boolean).map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] }))] },
      });
      toast(`${t('Note saved')} · ${first.trim()}`);
    }
    hide();
  };

  return (
    <>
      {!desktop && route !== 'afina' && (
        <motion.button
          type="button"
          aria-label={t('Quick capture')}
          whileTap={{ scale: 0.88 }}
          transition={springSnappy}
          onClick={() => show()}
          className="fixed bottom-[calc(92px+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-[0_10px_30px_-6px_rgb(47_107_255/.6)]"
        >
          <Plus size={26} strokeWidth={2.4} />
        </motion.button>
      )}
      <Sheet open={open} onClose={hide} label={t('Quick capture')} position="top" className="max-w-lg">
        <form
          className="p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Segmented<Kind>
            label={t('Capture as')}
            value={kind}
            onChange={(k) => useCapture.setState({ kind: k })}
            options={[
              { value: 'idea', label: t('Idea') },
              { value: 'task', label: t('Task / event') },
              { value: 'note', label: t('Note') },
            ]}
          />
          <div className="mt-3 flex gap-3 rounded-[16px] bg-fg/[0.05] p-3">
            {kind === 'idea' ? <Lightbulb size={20} className="mt-0.5 shrink-0 text-pink" /> : kind === 'task' ? <ListPlus size={20} className="mt-0.5 shrink-0 text-blue" /> : <NotebookPen size={20} className="mt-0.5 shrink-0 text-fg/60" />}
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void save();
                }
              }}
              rows={3}
              aria-label={t('What’s on your mind?')}
              placeholder={kind === 'task' ? t('“Call mom tomorrow 6pm” or “Gym every Monday 7am”') : t('What’s on your mind?')}
              className="min-w-0 flex-1 resize-none bg-transparent text-[16px] leading-relaxed placeholder:text-fg/40 focus-visible:outline-none"
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[12px] text-fg/40">{t('Enter to save · Shift+Enter for a new line')}</span>
            <Button type="submit" variant="brand" disabled={!text.trim()}>{t('Save')}</Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
