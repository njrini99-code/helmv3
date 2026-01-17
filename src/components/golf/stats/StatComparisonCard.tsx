'use client';

import { memo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { IconTrendingUp, IconTrendingDown, IconMinus, IconUsers, IconClock } from '@/components/icons';

// Dynamic imports for recharts
const BarChart = dynamic(() => import('recharts').then(mod => mod.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then(mod => mod.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(mod => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(mod => mod.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(mod => mod.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(mod => mod.ResponsiveContainer), { ssr: false });
const Cell = dynamic(() => import('recharts').then(mod => mod.Cell), { ssr: false });
// ReferenceLine removed - not used in this component

// ============================================================================
// TYPES
// ============================================================================

export interface StatValue {
  label: string;
  value: number | null;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
  target?: number;
}

export interface ComparisonData {
  player: StatValue;
  teamAverage?: StatValue;
  previousPeriod?: StatValue;
  tourAverage?: StatValue;
}

interface StatComparisonCardProps {
  title: string;
  data: ComparisonData;
  showPercentile?: boolean;
  percentile?: number;
  rank?: string;
  className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function ChartSkeleton() {
  return (
    <div className="h-24 bg-slate-100/50 rounded-xl animate-pulse flex items-center justify-center">
      <span className="text-slate-400 text-sm">Loading...</span>
    </div>
  );
}

function getComparisonColor(
  playerValue: number,
  compareValue: number,
  lowerIsBetter: boolean
): 'better' | 'worse' | 'same' {
  const diff = playerValue - compareValue;
  const threshold = Math.abs(compareValue) * 0.02; // 2% threshold for "same"

  if (Math.abs(diff) < threshold) return 'same';

  if (lowerIsBetter) {
    return diff < 0 ? 'better' : 'worse';
  }
  return diff > 0 ? 'better' : 'worse';
}

function getColorClass(comparison: 'better' | 'worse' | 'same'): string {
  switch (comparison) {
    case 'better':
      return 'text-green-600';
    case 'worse':
      return 'text-red-500';
    default:
      return 'text-slate-600';
  }
}

function getBgClass(comparison: 'better' | 'worse' | 'same'): string {
  switch (comparison) {
    case 'better':
      return 'bg-green-50';
    case 'worse':
      return 'bg-red-50';
    default:
      return 'bg-slate-50';
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const StatComparisonCard = memo(function StatComparisonCard({
  title,
  data,
  showPercentile = false,
  percentile,
  rank,
  className = '',
}: StatComparisonCardProps) {
  const { player, teamAverage, previousPeriod, tourAverage } = data;
  const lowerIsBetter = player.lowerIsBetter ?? false;

  // Skip if no player value
  if (player.value === null) {
    return null;
  }

  // Calculate comparisons
  const teamComparison =
    teamAverage?.value !== null && teamAverage?.value !== undefined
      ? getComparisonColor(player.value, teamAverage.value, lowerIsBetter)
      : null;

  const prevComparison =
    previousPeriod?.value !== null && previousPeriod?.value !== undefined
      ? getComparisonColor(player.value, previousPeriod.value, lowerIsBetter)
      : null;

  const tourComparison =
    tourAverage?.value !== null && tourAverage?.value !== undefined
      ? getComparisonColor(player.value, tourAverage.value, lowerIsBetter)
      : null;

  // Prepare bar chart data
  const barData = [
    player.value !== null && { name: 'You', value: player.value, color: '#16a34a' },
    teamAverage?.value !== null && teamAverage?.value !== undefined && { name: 'Team', value: teamAverage.value, color: '#3b82f6' },
    previousPeriod?.value !== null && previousPeriod?.value !== undefined && { name: 'Prev', value: previousPeriod.value, color: '#94a3b8' },
    tourAverage?.value !== null && tourAverage?.value !== undefined && { name: 'Tour', value: tourAverage.value, color: '#f59e0b' },
  ].filter(Boolean) as Array<{ name: string; value: number; color: string }>;

  return (
    <div className={`relative bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass overflow-hidden ${className}`}>
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
      />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
          {showPercentile && percentile !== undefined && (
            <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              {percentile}th %ile
            </div>
          )}
        </div>

        {/* Main stat */}
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-3xl font-bold text-slate-900 tabular-nums">
            {player.format(player.value)}
          </span>
          {rank && (
            <span className="text-sm text-slate-500">
              ({rank})
            </span>
          )}
        </div>

        {/* Comparison bars */}
        {barData.length > 1 && (
          <Suspense fallback={<ChartSkeleton />}>
            <div className="h-20 -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 40, left: 40, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    formatter={(value) => [player.format(value as number), '']}
                    contentStyle={{
                      backgroundColor: 'rgba(255,255,255,0.95)',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16}>
                    {barData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Suspense>
        )}

        {/* Comparison details */}
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100">
          {/* vs Team */}
          {teamAverage?.value !== null && teamAverage?.value !== undefined && teamComparison && (
            <div className={`flex flex-col items-center p-2 rounded-lg ${getBgClass(teamComparison)}`}>
              <IconUsers size={14} className="text-slate-400 mb-1" />
              <span className="text-[10px] text-slate-500 mb-0.5">vs Team</span>
              <span className={`text-xs font-semibold ${getColorClass(teamComparison)}`}>
                {teamComparison === 'better' && (lowerIsBetter ? '-' : '+')}
                {teamComparison === 'worse' && (lowerIsBetter ? '+' : '-')}
                {Math.abs(player.value - teamAverage.value).toFixed(1)}
              </span>
            </div>
          )}

          {/* vs Previous */}
          {previousPeriod?.value !== null && previousPeriod?.value !== undefined && prevComparison && (
            <div className={`flex flex-col items-center p-2 rounded-lg ${getBgClass(prevComparison)}`}>
              <IconClock size={14} className="text-slate-400 mb-1" />
              <span className="text-[10px] text-slate-500 mb-0.5">vs Prev</span>
              <span className={`text-xs font-semibold ${getColorClass(prevComparison)}`}>
                {prevComparison === 'better' && (lowerIsBetter ? '-' : '+')}
                {prevComparison === 'worse' && (lowerIsBetter ? '+' : '-')}
                {Math.abs(player.value - previousPeriod.value).toFixed(1)}
              </span>
            </div>
          )}

          {/* vs Tour */}
          {tourAverage?.value !== null && tourAverage?.value !== undefined && tourComparison && (
            <div className={`flex flex-col items-center p-2 rounded-lg ${getBgClass(tourComparison)}`}>
              <IconTrendingUp size={14} className="text-slate-400 mb-1" />
              <span className="text-[10px] text-slate-500 mb-0.5">vs Tour</span>
              <span className={`text-xs font-semibold ${getColorClass(tourComparison)}`}>
                {tourComparison === 'better' && (lowerIsBetter ? '-' : '+')}
                {tourComparison === 'worse' && (lowerIsBetter ? '+' : '-')}
                {Math.abs(player.value - tourAverage.value).toFixed(1)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default StatComparisonCard;

// ============================================================================
// STAT COMPARISON GRID
// ============================================================================

export interface StatComparisonItem {
  key: string;
  label: string;
  playerValue: number | null;
  teamAverage: number | null;
  previousPeriod: number | null;
  format: (v: number) => string;
  lowerIsBetter: boolean;
  percentile?: number;
  rank?: string;
}

interface StatComparisonGridProps {
  stats: StatComparisonItem[];
  className?: string;
}

export const StatComparisonGrid = memo(function StatComparisonGrid({
  stats,
  className = '',
}: StatComparisonGridProps) {
  const validStats = stats.filter((s) => s.playerValue !== null);

  if (validStats.length === 0) {
    return null;
  }

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      {validStats.map((stat) => (
        <StatComparisonCard
          key={stat.key}
          title={stat.label}
          data={{
            player: {
              label: 'You',
              value: stat.playerValue,
              format: stat.format,
              lowerIsBetter: stat.lowerIsBetter,
            },
            teamAverage: stat.teamAverage !== null ? {
              label: 'Team',
              value: stat.teamAverage,
              format: stat.format,
            } : undefined,
            previousPeriod: stat.previousPeriod !== null ? {
              label: 'Previous',
              value: stat.previousPeriod,
              format: stat.format,
            } : undefined,
          }}
          showPercentile={stat.percentile !== undefined}
          percentile={stat.percentile}
          rank={stat.rank}
        />
      ))}
    </div>
  );
});

// ============================================================================
// PERIOD COMPARISON CARD
// ============================================================================

interface PeriodComparisonData {
  current: {
    label: string;
    roundCount: number;
    scoringAverage: number | null;
    girPct: number | null;
    fairwayPct: number | null;
    puttsPerRound: number | null;
  };
  previous: {
    label: string;
    roundCount: number;
    scoringAverage: number | null;
    girPct: number | null;
    fairwayPct: number | null;
    puttsPerRound: number | null;
  };
}

interface PeriodComparisonCardProps {
  data: PeriodComparisonData;
  className?: string;
}

export const PeriodComparisonCard = memo(function PeriodComparisonCard({
  data,
  className = '',
}: PeriodComparisonCardProps) {
  const { current, previous } = data;

  const stats = [
    {
      key: 'scoring',
      label: 'Scoring Avg',
      current: current.scoringAverage,
      previous: previous.scoringAverage,
      format: (v: number) => v.toFixed(1),
      lowerIsBetter: true,
    },
    {
      key: 'gir',
      label: 'GIR %',
      current: current.girPct,
      previous: previous.girPct,
      format: (v: number) => `${v.toFixed(0)}%`,
      lowerIsBetter: false,
    },
    {
      key: 'fairway',
      label: 'Fairway %',
      current: current.fairwayPct,
      previous: previous.fairwayPct,
      format: (v: number) => `${v.toFixed(0)}%`,
      lowerIsBetter: false,
    },
    {
      key: 'putts',
      label: 'Putts/Rnd',
      current: current.puttsPerRound,
      previous: previous.puttsPerRound,
      format: (v: number) => v.toFixed(1),
      lowerIsBetter: true,
    },
  ];

  return (
    <div className={`relative bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass overflow-hidden ${className}`}>
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
      />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-slate-900">Period Comparison</h4>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              {current.label} ({current.roundCount})
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-slate-400" />
              {previous.label} ({previous.roundCount})
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((stat) => {
            const currentVal = stat.current;
            const prevVal = stat.previous;

            if (currentVal === null) return null;

            let comparison: 'better' | 'worse' | 'same' = 'same';
            if (prevVal !== null) {
              comparison = getComparisonColor(currentVal, prevVal, stat.lowerIsBetter);
            }

            const diff = prevVal !== null ? currentVal - prevVal : null;

            return (
              <div key={stat.key} className="text-center p-3 rounded-xl bg-slate-50">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                  {stat.label}
                </p>
                <p className="text-lg font-bold text-slate-900 tabular-nums">
                  {stat.format(currentVal)}
                </p>
                {diff !== null && Math.abs(diff) > 0.1 && (
                  <div
                    className={`flex items-center justify-center gap-0.5 text-xs font-medium mt-1 ${getColorClass(
                      comparison
                    )}`}
                  >
                    {comparison === 'better' ? (
                      <IconTrendingUp size={12} />
                    ) : comparison === 'worse' ? (
                      <IconTrendingDown size={12} />
                    ) : (
                      <IconMinus size={12} />
                    )}
                    {Math.abs(diff).toFixed(1)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
