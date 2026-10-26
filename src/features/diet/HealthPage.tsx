import { HeartPulse } from 'lucide-react';
import { ComingPhase } from '@/ui/ComingPhase';
import { useT } from '@/lib/i18n';

export default function HealthPage() {
  const t = useT();
  return (
    <ComingPhase
      title={t('nav.health')}
      icon={HeartPulse}
      phase={4}
      pitch="Food, water, weight, sleep and mood — logged in seconds, tracked against your own targets."
      features={['~500-food local database incl. Middle Eastern & Russian dishes', 'Custom foods, saved meals, quick re-add', 'Water, weight, sleep and mood logs', 'Macro rings and weekly trends']}
    />
  );
}
