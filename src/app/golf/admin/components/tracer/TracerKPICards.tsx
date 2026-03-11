'use client';

import { CircleDot, CheckCircle2, AlertTriangle, BarChart3 } from 'lucide-react';
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
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <AdminStatCard
        label="Total Rounds"
        value={totalRounds}
        icon={<CircleDot size={20} />}
        detail={`${completedRounds} completed`}
        accentColor="green"
        sparklineData={sparklineData?.rounds}
      />
      <AdminStatCard
        label="Completion Rate"
        value={`${completionRate}%`}
        icon={<CheckCircle2 size={20} />}
        accentColor={completionRate >= 80 ? 'green' : completionRate >= 50 ? 'amber' : 'red'}
        detail={`${totalRounds - completedRounds} incomplete`}
      />
      <AdminStatCard
        label="Errors (7d)"
        value={errors7d}
        icon={<AlertTriangle size={20} />}
        accentColor={critical7d > 0 ? 'red' : errors7d > 0 ? 'amber' : 'green'}
        detail={critical7d > 0 ? `${critical7d} critical` : 'No critical'}
        sparklineData={sparklineData?.errors}
        sparklineColor={critical7d > 0 ? '#EF4444' : errors7d > 0 ? '#F59E0B' : '#16A34A'}
      />
      <AdminStatCard
        label="Stats Mismatches"
        value={statsMismatches}
        icon={<BarChart3 size={20} />}
        accentColor={statsMismatches > 0 ? 'amber' : 'green'}
        detail={statsMismatches > 0 ? 'Cache vs live differ' : 'All in sync'}
      />
    </div>
  );
}
