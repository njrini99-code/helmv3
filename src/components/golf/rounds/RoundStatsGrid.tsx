'use client';

import { cn } from '@/lib/utils';
import type { GolfRound } from '@/types/golf';
import { calculateFairwayPercentage, calculateGIRPercentage } from '@/types/golf';

interface RoundStatsGridProps {
  round: GolfRound;
}

interface StatCardProps {
  label: string;
  value: string | number | null;
  suffix?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  highlight?: boolean;
}

function StatCard({ label, value, suffix = '', trend, trendValue, highlight }: StatCardProps) {
  if (value === null || value === undefined) {
    return (
      <div className="bg-white border border-border-light rounded-xl p-4">
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className="text-lg text-gray-300">--</p>
      </div>
    );
  }

  return (
    <div className={cn(
      'bg-white border rounded-xl p-4',
      highlight ? 'border-brand-200 bg-brand-50/30' : 'border-border-light'
    )}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <p className={cn(
          'text-2xl font-semibold',
          highlight ? 'text-brand-700' : 'text-gray-900'
        )}>
          {value}
        </p>
        {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
      </div>
      {trend && trendValue && (
        <div className={cn(
          'flex items-center gap-1 mt-1 text-xs',
          trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500'
        )}>
          {trend === 'up' && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          )}
          {trend === 'down' && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          )}
          <span>{trendValue}</span>
        </div>
      )}
    </div>
  );
}

export function RoundStatsGrid({ round }: RoundStatsGridProps) {
  const fairwayPct = calculateFairwayPercentage(round.fairways_hit, round.fairways_total);
  const girPct = calculateGIRPercentage(round.greens_in_regulation, round.greens_total);

  // Calculate scramble percentage
  const missedGreens = round.greens_total - (round.greens_in_regulation || 0);
  const scramblePct = round.up_and_downs && missedGreens > 0
    ? Math.round((round.up_and_downs / missedGreens) * 100)
    : null;

  return (
    <div className="space-y-4">
      {/* Primary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Score"
          value={round.gross_score}
          suffix={`(${round.gross_score - round.par >= 0 ? '+' : ''}${round.gross_score - round.par})`}
          highlight
        />
        <StatCard
          label="Total Putts"
          value={round.total_putts}
        />
        <StatCard
          label="Fairways"
          value={fairwayPct}
          suffix="%"
        />
        <StatCard
          label="Greens in Reg"
          value={girPct}
          suffix="%"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Fairways Hit"
          value={round.fairways_hit !== null ? `${round.fairways_hit}/${round.fairways_total}` : null}
        />
        <StatCard
          label="GIR"
          value={round.greens_in_regulation !== null ? `${round.greens_in_regulation}/${round.greens_total}` : null}
        />
        <StatCard
          label="Scrambling"
          value={scramblePct}
          suffix="%"
        />
        <StatCard
          label="Penalties"
          value={round.total_penalties}
        />
      </div>

      {/* Putting Details */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="One-Putts"
          value={round.one_putts}
        />
        <StatCard
          label="Three-Putts"
          value={round.three_putts}
        />
        <StatCard
          label="Avg Driving"
          value={round.driving_distance_avg}
          suffix="yds"
        />
        <StatCard
          label="Longest Drive"
          value={round.longest_drive}
          suffix="yds"
        />
      </div>

      {/* Strokes Gained (if available) */}
      {round.strokes_gained_total !== null && (
        <div className="pt-4 border-t border-border-light">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Strokes Gained</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard
              label="Total"
              value={round.strokes_gained_total?.toFixed(2)}
              highlight
            />
            <StatCard
              label="Off the Tee"
              value={round.strokes_gained_off_tee?.toFixed(2)}
            />
            <StatCard
              label="Approach"
              value={round.strokes_gained_approach?.toFixed(2)}
            />
            <StatCard
              label="Around Green"
              value={round.strokes_gained_around_green?.toFixed(2)}
            />
            <StatCard
              label="Putting"
              value={round.strokes_gained_putting?.toFixed(2)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default RoundStatsGrid;
