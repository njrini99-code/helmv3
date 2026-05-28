'use client';

import { IconCircleDot, IconCheckCircle2, IconWarning, IconChartBar } from '@/components/icons';
import { AdminStatCard } from '../AdminStatCard';

// ============================================================================
// TRACER KPI CARDS
// ============================================================================

interface TracerKPICardsProps {
  totalRounds: number;
  completedRounds: number;
  completionRate: number;
  errors7d: number;
  critical7d: number;
  statsMismatches: number;
  sparklineData?: {
    rounds: number[];
    errors: number[];
  };
}

export function TracerKPICards({
  totalRounds,
  completedRounds,
  completionRate,
  errors7d,
  critical7d,
  statsMismatches,
  sparklineData,
}: TracerKPICardsProps) {
  // Force remount of the cards when their numeric values change. AdminStatCard
  // wraps numbers in <AnimatedNumber>, which only animates from 0 to its value
  // on mount (the spring is set once when the element scrolls into view and
  // never updated thereafter). When this component first mounts with placeholder
  // zeros and then receives real data, the big number stays stuck at 0 even
  // though the subtitle (a plain string) reflects the new value. Keying each
  // card by its value forces React to remount the AnimatedNumber so the spring
  // re-runs from 0 to the latest value, keeping the big number in sync with the
  // subtitle.
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <AdminStatCard
        key={`total-rounds-${totalRounds}`}
        label="Total Rounds"
        value={totalRounds}
        icon={<IconCircleDot size={20} />}
        detail={`${completedRounds} completed`}
        accentColor="green"
        sparklineData={sparklineData?.rounds}
      />
      <AdminStatCard
        key={`completion-rate-${completionRate}`}
        label="Completion Rate"
        value={`${completionRate}%`}
        icon={<IconCheckCircle2 size={20} />}
        accentColor={completionRate >= 80 ? 'green' : completionRate >= 50 ? 'amber' : 'red'}
        detail={`${totalRounds - completedRounds} incomplete`}
      />
      <AdminStatCard
        key={`errors-7d-${errors7d}`}
        label="Errors (7d)"
        value={errors7d}
        icon={<IconWarning size={20} />}
        accentColor={critical7d > 0 ? 'red' : errors7d > 0 ? 'amber' : 'green'}
        detail={critical7d > 0 ? `${critical7d} critical` : 'No critical'}
        sparklineData={sparklineData?.errors}
        sparklineColor={critical7d > 0 ? '#EF4444' : errors7d > 0 ? '#F59E0B' : 'var(--color-primary-600)'}
      />
      <AdminStatCard
        key={`stats-mismatches-${statsMismatches}`}
        label="Stats Mismatches"
        value={statsMismatches}
        icon={<IconChartBar size={20} />}
        accentColor={statsMismatches > 0 ? 'amber' : 'green'}
        detail={statsMismatches > 0 ? 'Cache vs live differ' : 'All in sync'}
      />
    </div>
  );
}
