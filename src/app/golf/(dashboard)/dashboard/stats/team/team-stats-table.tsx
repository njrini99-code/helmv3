'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import {
  IconChevronUp,
  IconChevronDown,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconChevronRight,
} from '@/components/icons';
import { FormatToggle } from '@/components/golf/stats/sections/shared-primitives';
import type { HoleFormat } from '@/components/golf/stats/sections/shared-primitives';
import type { TeamPlayerStats } from './page';
import { Button } from '@/components/ui/button';

type SortKey =
  | 'name'
  | 'rounds_played'
  | 'scoring_average'
  | 'best_round'
  | 'handicap'
  | 'fairway_pct'
  | 'gir_pct'
  | 'putts_per_round'
  | 'scoring_trend'
  | 'ai_rating';

type SortDirection = 'asc' | 'desc';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

export interface PlayerIntelligenceSummary {
  composite: number | null;
  overall: number | null;
  topInsightTitle: string | null;
  topInsightPriority: 'low' | 'medium' | 'high' | 'urgent' | null;
  insightCount: number;
}

interface TeamStatsTableProps {
  players: TeamPlayerStats[];
  /** Engine-derived per-player summary, keyed by player_id. Shape lets the
   *  table stay agnostic about whether CoachHelm ran — empty map just means
   *  the AI column renders dashes. */
  intelligenceByPlayer?: Record<string, PlayerIntelligenceSummary>;
}

/**
 * Rounds-weighted mean: Σ(value_i × rounds_i) ÷ Σ rounds_i.
 *
 * The canonical team-average rule — per-player averages are weighted by the
 * round count they were computed over, so a 2-round walk-on never weighs the
 * same as a 40-round starter. Entries with a null/NaN value are skipped.
 * Falls back to the unweighted mean if no contributing entry carries a
 * positive round count (degenerate data); null when nothing contributes.
 *
 * Exported for unit tests.
 */
export function roundsWeightedMean(
  entries: ReadonlyArray<{ value: number | null; rounds: number }>,
): number | null {
  let weightedSum = 0;
  let totalRounds = 0;
  let unweightedSum = 0;
  let n = 0;
  for (const entry of entries) {
    if (entry.value === null || Number.isNaN(entry.value)) continue;
    n += 1;
    unweightedSum += entry.value;
    if (entry.rounds > 0 && !Number.isNaN(entry.rounds)) {
      weightedSum += entry.value * entry.rounds;
      totalRounds += entry.rounds;
    }
  }
  if (totalRounds > 0) return weightedSum / totalRounds;
  return n > 0 ? unweightedSum / n : null;
}

export function TeamStatsTable({
  players,
  intelligenceByPlayer = {},
}: TeamStatsTableProps) {
  const [holeFormat, setHoleFormat] = useState<HoleFormat>('all');
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'scoring_average',
    direction: 'asc', // Lower is better for scoring
  });

  // Compute team-wide format counts for the toggle
  const formatCounts = useMemo(() => {
    let h18 = 0;
    let h9 = 0;
    let all = 0;
    for (const p of players) {
      h18 += p.rounds_played_18;
      h9 += p.rounds_played_9;
      all += p.rounds_played;
    }
    return { all, h18, h9 };
  }, [players]);

  // Derive format-aware view of each player
  const formattedPlayers = useMemo(() => {
    if (holeFormat === 'all') return players;
    return players.map(p => ({
      ...p,
      rounds_played: holeFormat === '18' ? p.rounds_played_18 : p.rounds_played_9,
      scoring_average: holeFormat === '18' ? p.scoring_average_18 : p.scoring_average_9,
      best_round: holeFormat === '18' ? p.best_round_18 : p.best_round_9,
    }));
  }, [players, holeFormat]);

  // Team scoring average, weighted by each player's round count. The
  // formattedPlayers view already carries format-aware rounds_played /
  // scoring_average pairs, so the weights match the selected format.
  const teamScoringAverage = useMemo(
    () =>
      roundsWeightedMean(
        formattedPlayers.map(p => ({ value: p.scoring_average, rounds: p.rounds_played })),
      ),
    [formattedPlayers],
  );

  const sortedPlayers = useMemo(() => {
    const sorted = [...formattedPlayers].sort((a, b) => {
      let aVal: string | number | null;
      let bVal: string | number | null;

      switch (sortConfig.key) {
        case 'name':
          aVal = `${a.last_name} ${a.first_name}`.toLowerCase();
          bVal = `${b.last_name} ${b.first_name}`.toLowerCase();
          break;
        case 'rounds_played':
          aVal = a.rounds_played;
          bVal = b.rounds_played;
          break;
        case 'scoring_average':
          aVal = a.scoring_average;
          bVal = b.scoring_average;
          break;
        case 'best_round':
          aVal = a.best_round;
          bVal = b.best_round;
          break;
        case 'handicap':
          aVal = a.handicap;
          bVal = b.handicap;
          break;
        case 'fairway_pct':
          aVal = a.fairway_pct;
          bVal = b.fairway_pct;
          break;
        case 'gir_pct':
          aVal = a.gir_pct;
          bVal = b.gir_pct;
          break;
        case 'putts_per_round':
          aVal = a.putts_per_round;
          bVal = b.putts_per_round;
          break;
        case 'scoring_trend':
          aVal = a.scoring_trend;
          bVal = b.scoring_trend;
          break;
        case 'ai_rating':
          aVal = intelligenceByPlayer[a.id]?.composite ?? intelligenceByPlayer[a.id]?.overall ?? null;
          bVal = intelligenceByPlayer[b.id]?.composite ?? intelligenceByPlayer[b.id]?.overall ?? null;
          break;
        default:
          return 0;
      }

      // Handle nulls - put them at the end
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      // String comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      // Number comparison
      if (sortConfig.direction === 'asc') {
        return (aVal as number) - (bVal as number);
      } else {
        return (bVal as number) - (aVal as number);
      }
    });

    return sorted;
  }, [formattedPlayers, sortConfig, intelligenceByPlayer]);

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortConfig.key !== columnKey) {
      return <span className="w-4" />;
    }
    return sortConfig.direction === 'asc'
      ? <IconChevronUp size={14} className="text-primary-600" />
      : <IconChevronDown size={14} className="text-primary-600" />;
  };

  const formatPct = (val: number | null) => {
    if (val === null) return '—';
    return `${val.toFixed(1)}%`;
  };

  const formatScore = (val: number | null, decimals = 1) => {
    if (val === null) return '—';
    return val.toFixed(decimals);
  };

  const TrendIndicator = ({ trend }: { trend: number | null }) => {
    if (trend === null) return <span className="text-warm-400">—</span>;

    const isImproving = trend < 0; // Negative = lower scores = better
    const absValue = Math.abs(trend).toFixed(1);

    if (Math.abs(trend) < 0.3) {
      return (
        <span className="inline-flex items-center gap-1 text-warm-500">
          <IconMinus size={12} />
          <span className="text-xs">Steady</span>
        </span>
      );
    }

    return (
      <span className={cn(
        'inline-flex items-center gap-1',
        isImproving ? 'text-primary-600' : 'text-rose-500'
      )}>
        {isImproving ? <IconTrendingDown size={14} /> : <IconTrendingUp size={14} />}
        <span className="text-sm font-medium">{absValue}</span>
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Format Toggle */}
      <div className="flex items-center">
        <FormatToggle
          value={holeFormat}
          onChange={setHoleFormat}
          counts={formatCounts}
        />
      </div>

    <div className="relative surface-matte rounded-3xl overflow-clip">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-warm-200/60">
              <th className="text-left px-4 py-3">
                <Button variant="ghost"
                  onClick={() => handleSort('name')}
                  className="flex items-center gap-1 text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 hover:text-warm-700 transition-colors"
                >
                  Player
                  <SortIcon columnKey="name" />
                </Button>
              </th>
              <th className="text-center px-3 py-3">
                <Button variant="ghost"
                  onClick={() => handleSort('rounds_played')}
                  className="flex items-center justify-center gap-1 text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 hover:text-warm-700 transition-colors mx-auto"
                >
                  Rnds
                  <SortIcon columnKey="rounds_played" />
                </Button>
              </th>
              <th className="text-center px-3 py-3">
                <Button variant="ghost"
                  onClick={() => handleSort('scoring_average')}
                  className="flex items-center justify-center gap-1 text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 hover:text-warm-700 transition-colors mx-auto"
                >
                  Avg
                  <SortIcon columnKey="scoring_average" />
                </Button>
              </th>
              <th className="text-center px-3 py-3">
                <Button variant="ghost"
                  onClick={() => handleSort('ai_rating')}
                  className="flex items-center justify-center gap-1 text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 hover:text-warm-700 transition-colors mx-auto"
                  title="CoachHelm composite rating (engine-derived)"
                >
                  AI
                  <SortIcon columnKey="ai_rating" />
                </Button>
              </th>
              <th className="text-center px-3 py-3">
                <Button variant="ghost"
                  onClick={() => handleSort('best_round')}
                  className="flex items-center justify-center gap-1 text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 hover:text-warm-700 transition-colors mx-auto"
                >
                  Best
                  <SortIcon columnKey="best_round" />
                </Button>
              </th>
              <th className="text-center px-3 py-3 hidden md:table-cell">
                <Button variant="ghost"
                  onClick={() => handleSort('handicap')}
                  className="flex items-center justify-center gap-1 text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 hover:text-warm-700 transition-colors mx-auto"
                >
                  HCP
                  <SortIcon columnKey="handicap" />
                </Button>
              </th>
              <th className="text-center px-3 py-3 hidden lg:table-cell">
                <Button variant="ghost"
                  onClick={() => handleSort('fairway_pct')}
                  className="flex items-center justify-center gap-1 text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 hover:text-warm-700 transition-colors mx-auto"
                >
                  FW%
                  <SortIcon columnKey="fairway_pct" />
                </Button>
              </th>
              <th className="text-center px-3 py-3 hidden lg:table-cell">
                <Button variant="ghost"
                  onClick={() => handleSort('gir_pct')}
                  className="flex items-center justify-center gap-1 text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 hover:text-warm-700 transition-colors mx-auto"
                >
                  GIR%
                  <SortIcon columnKey="gir_pct" />
                </Button>
              </th>
              <th className="text-center px-3 py-3 hidden xl:table-cell">
                <Button variant="ghost"
                  onClick={() => handleSort('putts_per_round')}
                  className="flex items-center justify-center gap-1 text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 hover:text-warm-700 transition-colors mx-auto"
                >
                  Putts
                  <SortIcon columnKey="putts_per_round" />
                </Button>
              </th>
              <th className="text-center px-3 py-3 hidden sm:table-cell">
                <Button variant="ghost"
                  onClick={() => handleSort('scoring_trend')}
                  className="flex items-center justify-center gap-1 text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 hover:text-warm-700 transition-colors mx-auto"
                >
                  Trend
                  <SortIcon columnKey="scoring_trend" />
                </Button>
              </th>
              <th className="w-10 px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-100">
            {sortedPlayers.map((player, index) => (
              <tr
                key={player.id}
                className="group hover:bg-warm-50/50 transition-colors"
                style={{
                  animation: 'fadeIn 0.3s ease-out forwards',
                  animationDelay: `${index * 20}ms`,
                  opacity: 0,
                }}
              >
                {/* Player */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar
                      src={player.avatar_url}
                      name={`${player.first_name} ${player.last_name}`}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-warm-900 truncate">
                        {player.first_name} {player.last_name}
                      </p>
                      <p className="text-xs text-warm-500 capitalize">
                        {player.graduation_year ? `Class of ${player.graduation_year}` : 'Player'}
                      </p>
                    </div>
                  </div>
                </td>

                {/* Rounds */}
                <td className="text-center px-3 py-3">
                  <span className="font-medium text-warm-700 tabular-nums">
                    {player.rounds_played}
                  </span>
                </td>

                {/* Scoring Average */}
                <td className="text-center px-3 py-3">
                  <span className={cn(
                    'font-medium tabular-nums',
                    player.scoring_average !== null && player.scoring_average <= 72
                      ? 'text-primary-600'
                      : 'text-warm-900'
                  )}>
                    {formatScore(player.scoring_average)}
                  </span>
                </td>

                {/* CoachHelm AI rating */}
                <td className="text-center px-3 py-3">
                  <AiRatingCell
                    playerId={player.id}
                    summary={intelligenceByPlayer[player.id]}
                  />
                </td>

                {/* Best Round */}
                <td className="text-center px-3 py-3">
                  <span className="font-medium text-primary-600 tabular-nums">
                    {player.best_round ?? '—'}
                  </span>
                </td>

                {/* Handicap */}
                <td className="text-center px-3 py-3 hidden md:table-cell">
                  <span className={cn(
                    'font-medium tabular-nums',
                    player.handicap !== null && player.handicap <= 0
                      ? 'text-primary-600'
                      : 'text-warm-700'
                  )}>
                    {player.handicap !== null
                      ? player.handicap > 0
                        ? `+${player.handicap.toFixed(1)}`
                        : player.handicap.toFixed(1)
                      : '—'}
                  </span>
                </td>

                {/* Fairway % */}
                <td className="text-center px-3 py-3 hidden lg:table-cell">
                  <span className={cn(
                    'text-sm tabular-nums',
                    player.fairway_pct !== null && player.fairway_pct >= 60
                      ? 'text-primary-600 font-medium'
                      : 'text-warm-600'
                  )}>
                    {formatPct(player.fairway_pct)}
                  </span>
                </td>

                {/* GIR % */}
                <td className="text-center px-3 py-3 hidden lg:table-cell">
                  <span className={cn(
                    'text-sm tabular-nums',
                    player.gir_pct !== null && player.gir_pct >= 50
                      ? 'text-primary-600 font-medium'
                      : 'text-warm-600'
                  )}>
                    {formatPct(player.gir_pct)}
                  </span>
                </td>

                {/* Putts per Round */}
                <td className="text-center px-3 py-3 hidden xl:table-cell">
                  <span className={cn(
                    'text-sm tabular-nums',
                    player.putts_per_round !== null && player.putts_per_round <= 30
                      ? 'text-primary-600 font-medium'
                      : 'text-warm-600'
                  )}>
                    {formatScore(player.putts_per_round)}
                  </span>
                </td>

                {/* Trend */}
                <td className="text-center px-3 py-3 hidden sm:table-cell">
                  <TrendIndicator trend={player.scoring_trend} />
                </td>

                {/* View Details */}
                <td className="px-3 py-3">
                  <Link
                    href={`/golf/dashboard/stats?player=${player.id}`}
                    className="p-2 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-warm-100 active:bg-warm-200 transition-colors inline-flex sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <IconChevronRight size={16} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary Footer */}
      <div className="px-4 py-3 border-t border-warm-200/60 bg-warm-50/50">
        <div className="flex items-center justify-between text-sm">
          <span className="text-warm-500">
            Showing {players.length} player{players.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-4 text-warm-600">
            <span>
              Team Avg:{' '}
              <strong className="text-warm-900">
                {teamScoringAverage !== null ? teamScoringAverage.toFixed(1) : '—'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* style jsx used here because each row has a dynamic animationDelay
         that cannot be expressed with Tailwind utility classes */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI rating cell — links to the coach's player detail page where the
// Prescribed Practice Plan + Refresh Analysis live. Renders a dash when the
// engine hasn't run for this player yet (no stats cache or no insights).
// ---------------------------------------------------------------------------

function AiRatingCell({
  playerId,
  summary,
}: {
  playerId: string;
  summary: PlayerIntelligenceSummary | undefined;
}) {
  const value = summary?.composite ?? summary?.overall ?? null;
  if (value == null) {
    return <span className="text-warm-400 text-xs">—</span>;
  }
  const rating = Math.round(value);
  const color =
    rating >= 80
      ? 'text-emerald-600'
      : rating >= 60
        ? 'text-primary-600'
        : rating >= 40
          ? 'text-amber-500'
          : 'text-red-500';
  const priority = summary?.topInsightPriority ?? null;
  const priorityDot =
    priority === 'urgent'
      ? 'bg-red-500'
      : priority === 'high'
        ? 'bg-amber-500'
        : priority === 'medium'
          ? 'bg-primary-400'
          : priority === 'low'
            ? 'bg-warm-300'
            : null;

  return (
    <Link
      href={`/golf/dashboard/players/${playerId}`}
      className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity"
      title={summary?.topInsightTitle ?? 'Open player CoachHelm detail'}
    >
      <span className={cn('text-sm font-medium tabular-nums', color)}>{rating}</span>
      <span className="text-eyebrow font-medium text-warm-400">/100</span>
      {priorityDot && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full', priorityDot)}
          aria-label={`Top insight priority: ${priority}`}
        />
      )}
    </Link>
  );
}
