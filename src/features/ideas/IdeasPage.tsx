import { Lightbulb } from 'lucide-react';
import { ComingPhase } from '@/ui/ComingPhase';
import { useT } from '@/lib/i18n';

export default function IdeasPage() {
  const t = useT();
  return (
    <ComingPhase
      title={t('nav.ideas')}
      icon={Lightbulb}
      phase={3}
      pitch="Capture a thought in one tap, then shape it on an infinite canvas or a board."
      features={['Quick capture from anywhere', 'Infinite canvas with connectable glass cards', 'Board: Raw → Exploring → Doing → Done', 'Turn any idea into a task, note or goal']}
    />
  );
}
