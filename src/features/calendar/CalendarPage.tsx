import { CalendarDays } from 'lucide-react';
import { ComingPhase } from '@/ui/ComingPhase';
import { useT } from '@/lib/i18n';

export default function CalendarPage() {
  const t = useT();
  return (
    <ComingPhase
      title={t('nav.calendar')}
      icon={CalendarDays}
      phase={2}
      pitch="Day, week, month and year views with drag-to-create, drag-to-move and natural-language entry."
      features={['Day / week / month / year with smooth zoom', 'Drag to create, move and resize events', 'Recurring events, colors and reminders', '“Lunch with Sam Friday 1pm for 1h”', 'Import and export .ics files', 'Time-block tasks from your inbox']}
    />
  );
}
