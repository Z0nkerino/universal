import { BarChart3 } from 'lucide-react';
import { ComingPhase } from '@/ui/ComingPhase';
import { useT } from '@/lib/i18n';

export default function InsightsPage() {
  const t = useT();
  return (
    <ComingPhase
      title={t('nav.insights')}
      icon={BarChart3}
      phase={4}
      pitch="Real statistics computed on your device from your own data — never invented."
      features={['Tasks done, completion rate, planned vs actual', 'Most-productive-hours heatmap', 'Habit streaks and consistency', 'Weight trend with moving average', 'Sleep ↔ mood ↔ productivity correlations', 'A weekly review every Sunday']}
    />
  );
}
