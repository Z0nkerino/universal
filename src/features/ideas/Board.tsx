import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { createIdea, updateIdea } from '@/lib/actions';
import type { Idea, IdeaColumn } from '@/lib/types';
import { Glass } from '@/ui/Glass';
import { beginDrag, useDnd, useDropZone } from '@/ui/dnd';
import { toast } from '@/ui/Toast';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';
import { COLUMNS, useIdeaEditor } from './IdeaEditor';

const ACCENT: Record<IdeaColumn, string> = { raw: 'bg-fg/30', exploring: 'bg-blue', doing: 'bg-pink', done: 'bg-brand' };

function Column({ id, label, ideas }: { id: IdeaColumn; label: string; ideas: Idea[] }) {
  const t = useT();
  const open = useIdeaEditor((s) => s.open);
  const over = useDnd((s) => s.over);
  const [text, setText] = useState('');
  const zone = `ideas-col-${id}`;
  const drop = useDropZone(zone, {
    accepts: ['idea'],
    onDrop: async (item) => {
      await updateIdea(item.id, { column: id, order: Date.now() });
      toast(`${t('Moved to')} ${t(label)}`);
    },
  });
  return (
    <section {...drop} aria-label={t(label)} className={cn('flex min-w-[260px] flex-1 flex-col rounded-[24px] p-2 transition-colors', over === zone ? 'bg-blue/10' : 'bg-fg/[0.03]')}>
      <header className="flex items-center gap-2 px-2 py-2">
        <span className={cn('h-2.5 w-2.5 rounded-full', ACCENT[id])} />
        <h2 className="text-[14px] font-bold">{t(label)}</h2>
        <span className="text-[12px] font-semibold text-fg/40">{ideas.length}</span>
      </header>
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {ideas.map((i) => (
            <motion.li key={i.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={spring}>
              <Glass
                className="cursor-grab touch-none p-3.5 active:cursor-grabbing"
                onPointerDown={(e) => beginDrag(e, { kind: 'idea', id: i.id, label: i.title }, () => open(i.id))}
                role="button"
                tabIndex={0}
                aria-label={i.title}
                onKeyDown={(e) => e.key === 'Enter' && open(i.id)}
              >
                <div className="flex items-start gap-2">
                  {i.color !== 'none' && <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', i.color === 'blue' ? 'bg-blue' : 'bg-pink')} />}
                  <p className="text-[14px] font-semibold leading-snug">{i.title}</p>
                </div>
                {i.body && <p className="mt-1 line-clamp-2 text-[13px] text-fg/55">{i.body}</p>}
              </Glass>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <form
        className="mt-2 flex items-center gap-2 rounded-xl px-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await createIdea({ title: text.trim(), column: id });
          setText('');
        }}
      >
        <Plus size={15} className="text-fg/40" aria-hidden />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Add an idea')} aria-label={`${t('Add an idea to')} ${t(label)}`} className="h-9 flex-1 bg-transparent text-[14px] placeholder:text-fg/35 focus-visible:outline-none" />
      </form>
    </section>
  );
}

export function IdeaBoard() {
  const ideas = useLiveQuery(() => db.ideas.orderBy('order').toArray(), []) ?? [];
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-4 lg:overflow-visible">
      {COLUMNS.map((c) => (
        <Column key={c.id} id={c.id} label={c.label} ideas={ideas.filter((i) => i.column === c.id)} />
      ))}
    </div>
  );
}
