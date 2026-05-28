'use client';

/**
 * RoundStatsComparison - Compare round stats to player average and team average
 *
 * Features:
 * - Visual bars showing above/below average
 * - Stats: GIR, FIR, Putts, Penalties, Up-and-Down %
 * - Animated bars with Framer Motion
 * - Mobile-friendly responsive design
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconTarget,
  IconChart,
} from '@/components/icons';

// ============================================================================
// TYPES
// ============================================================================

interface StatComparisonItem {
  key: string;
  label: string;
  roundValue: number;
  playerAvg: number | null;
  teamAvg: number | null;
  unit?: string;
  higherIsBetter: boolean;
  formatValue?: (val: number) => string;
}

interface RoundStatsComparisonProps {
  roundStats: {
    girPct: number | null;
    firPct: number | null;
    putts: number | null;
    penalties: number | null;
    scramblePct: number | null;
  };
  playerAvg?: {
    avgGirPct?: number;
    avgFairwayPct?: number;
    avgPutts?: number;
    avgPenalties?: number;
    avgScramblePct?: number;
  } | null;
  teamAvg?: {
    avgGirPct?: number;
    avgFairwayPct?: number;
    avgPutts?: number;
    avgPenalties?: number;
    avgScramblePct?: number;
  } | null;
  className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function getComparisonStatus(
  value: number,
  comparison: number | null,
  higherIsBetter: boolean
): 'above' | 'below' | 'average' | 'unknown' {
  if (comparison === null) return 'unknown';

  const diff = value - comparison;
  const threshold = Math.abs(comparison) * 0.05; // 5% threshold for "average"

  if (Math.abs(diff) <= threshold) return 'average';

  if (higherIsBetter) {
    return diff > 0 ? 'above' : 'below';
  } else {
    return diff < 0 ? 'above' : 'below';
  }
}

function calculateBarWidth(
  value: number,
  comparison: number | null,
  higherIsBetter: boolean,
  maxDeviation: number = 30
): number {
  if (comparison === null) return 50;

  let diff: number;
  if (higherIsBetter) {
    // For percentages where higher is better
    diff = value - comparison;
  } else {
    // For values where lower is better (like putts, penalties)
    diff = comparison - value;
  }

  // Normalize to 0-100 range, where 50 is average
  const normalized = 50 + (diff / maxDeviation) * 50;
  return Math.max(10, Math.min(90, normalized));
}

// ============================================================================
// STAT BAR COMPONENT
// ============================================================================

interface StatBarProps {
  label: string;
  roundValue: number;
  playerAvg: number | null;
  teamAvg: number | null;
  higherIsBetter: boolean;
  unit?: string;
  formatValue?: (val: number) => string;
  index: number;
}

function StatBar({
  label,
  roundValue,
  playerAvg,
  teamAvg,
  higherIsBetter,
  unit = '',
  formatValue,
  index,
}: StatBarProps) {
  const playerStatus = getComparisonStatus(roundValue, playerAvg, higherIsBetter);
  // teamStatus available for future team comparison features
  const _teamStatus = getComparisonStatus(roundValue, teamAvg, higherIsBetter);
  void _teamStatus; // Suppress unused variable warning
  const barWidth = calculateBarWidth(roundValue, playerAvg, higherIsBetter);

  const statusConfig = {
    above: {
      color: 'bg-primary-500',
      bgColor: 'bg-primary-50',
      textColor: 'text-primary-600',
      icon: <IconTrendingUp size={12} />,
    },
    below: {
      color: 'bg-amber-500',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-600',
      icon: <IconTrendingDown size={12} />,
    },
    average: {
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
      icon: <IconTarget size={12} />,
    },
    unknown: {
      color: 'bg-warm-400',
      bgColor: 'bg-warm-50',
      textColor: 'text-warm-500',
      icon: null,
    },
  };

  const config = statusConfig[playerStatus];
  const displayValue = formatValue ? formatValue(roundValue) : `${roundValue}${unit}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
      className="space-y-2"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-warm-700">{label}</span>
        <div className="flex items-center gap-2">
          <span className={cn('text-body-sm font-medium', config.textColor)}>
            {displayValue}
          </span>
          {config.icon && (
            <span className={config.textColor}>{config.icon}</span>
          )}
        </div>
      </div>

      {/* Bar container */}
      <div className="relative h-3 rounded-full bg-warm-100 overflow-hidden">
        {/* Center line (average marker) */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-warm-300 z-10" />

        {/* Player avg marker */}
        {playerAvg !== null && (
          <div
            className="absolute top-0 bottom-0 w-1 bg-warm-400 z-20"
            style={{ left: '50%', transform: 'translateX(-50%)' }}
            title={`Your avg: ${formatValue ? formatValue(playerAvg) : playerAvg}${unit}`}
          />
        )}

        {/* Round value bar */}
        <motion.div
          initial={{ scaleX: 0.5 }}
          animate={{ scaleX: barWidth / 100 }}
          transition={{ delay: index * 0.1 + 0.2, duration: 0.5, ease: 'easeOut' }}
          className={cn(
            'absolute top-0 bottom-0 left-0 w-full rounded-full origin-left',
            config.color
          )}
        />
      </div>

      {/* Comparison labels */}
      <div className="flex items-center justify-between text-xs text-warm-500">
        <span>Below avg</span>
        <div className="flex items-center gap-3">
          {playerAvg !== null && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-warm-400" />
              You: {formatValue ? formatValue(playerAvg) : playerAvg}
              {unit}
            </span>
          )}
          {teamAvg !== null && (
            <span className="flex items-center gap-1 text-warm-400">
              Team: {formatValue ? formatValue(teamAvg) : teamAvg}
              {unit}
            </span>
          )}
        </div>
        <span>Above avg</span>
      </div>
    </motion.div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RoundStatsComparison({
  roundStats,
  playerAvg,
  teamAvg,
  className,
}: RoundStatsComparisonProps) {
  const stats: StatComparisonItem[] = [];

  // GIR
  if (roundStats.girPct !== null) {
    stats.push({
      key: 'gir',
      label: 'Greens in Regulation',
      roundValue: roundStats.girPct,
      playerAvg: playerAvg?.avgGirPct ?? null,
      teamAvg: teamAvg?.avgGirPct ?? null,
      unit: '%',
      higherIsBetter: true,
    });
  }

  // FIR
  if (roundStats.firPct !== null) {
    stats.push({
      key: 'fir',
      label: 'Fairways Hit',
      roundValue: roundStats.firPct,
      playerAvg: playerAvg?.avgFairwayPct ?? null,
      teamAvg: teamAvg?.avgFairwayPct ?? null,
      unit: '%',
      higherIsBetter: true,
    });
  }

  // Putts
  if (roundStats.putts !== null) {
    stats.push({
      key: 'putts',
      label: 'Total Putts',
      roundValue: roundStats.putts,
      playerAvg: playerAvg?.avgPutts ?? null,
      teamAvg: teamAvg?.avgPutts ?? null,
      higherIsBetter: false,
    });
  }

  // Scrambling
  if (roundStats.scramblePct !== null) {
    stats.push({
      key: 'scramble',
      label: 'Up-and-Down %',
      roundValue: roundStats.scramblePct,
      playerAvg: playerAvg?.avgScramblePct ?? null,
      teamAvg: teamAvg?.avgScramblePct ?? null,
      unit: '%',
      higherIsBetter: true,
    });
  }

  // Penalties
  if (roundStats.penalties !== null) {
    stats.push({
      key: 'penalties',
      label: 'Penalties',
      roundValue: roundStats.penalties,
      playerAvg: playerAvg?.avgPenalties ?? null,
      teamAvg: teamAvg?.avgPenalties ?? null,
      higherIsBetter: false,
    });
  }

  if (stats.length === 0) {
    return (
      <GlassCard className={className}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
            <IconChart size={20} className="text-primary-600" />
          </div>
          <div>
            <h3 className="font-medium text-warm-900">Stats Comparison</h3>
            <p className="text-xs text-warm-500">vs your average</p>
          </div>
        </div>
        <EmptyState
          variant="minimal"
          type="stats"
          description="No stats available for comparison yet."
        />
      </GlassCard>
    );
  }

  return (
    <GlassCard className={className}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
          <IconChart size={20} className="text-primary-600" />
        </div>
        <div>
          <h3 className="font-medium text-warm-900">Stats Comparison</h3>
          <p className="text-xs text-warm-500">
            How this round compares to your averages
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-6">
        {stats.map((stat, index) => (
          <StatBar
            key={stat.key}
            label={stat.label}
            roundValue={stat.roundValue}
            playerAvg={stat.playerAvg}
            teamAvg={stat.teamAvg}
            higherIsBetter={stat.higherIsBetter}
            unit={stat.unit}
            formatValue={stat.formatValue}
            index={index}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-white/20">
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-warm-500">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-primary-500" />
            Above average
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            On pace
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500" />
            Below average
          </span>
        </div>
      </div>
    </GlassCard>
  );
}

