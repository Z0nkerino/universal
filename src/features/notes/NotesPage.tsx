import { NotebookPen } from 'lucide-react';
import { ComingPhase } from '@/ui/ComingPhase';
import { useT } from '@/lib/i18n';

export default function NotesPage() {
  const t = useT();
  return (
    <ComingPhase
      title={t('nav.notes')}
      icon={NotebookPen}
      phase={3}
      pitch="A fast block editor with markdown shortcuts, folders, tags and [[backlinks]]."
      features={['Headings, checklists, tables, code, images, quotes', 'Markdown shortcuts as you type', 'Folders, tags and pinning', '[[Backlinks]] between notes', 'Instant full-text search']}
    />
  );
}
