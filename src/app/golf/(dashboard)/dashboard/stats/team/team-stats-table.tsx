'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ShineEffect } from '@/components/ui/shine-effect';
import { Avatar } from '@/components/ui/avatar';
import {
  IconChevronUp,
  IconChevronDown,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconChevronRight,
} from '@/components/icons';
import type { TeamPlayerStats } from './page';

type SortKey =
  | 'name'
  | 'rounds_played'
  | 'scoring_average'
  | 'best_round'
  | 'handicap'
  | 'fairway_pct'
  | 'gir_pct'
  | 'putts_per_round'
  | 'scoring_trend';

type SortDirection = 'asc' | 'desc';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

interface TeamStatsTableProps {
  players: TeamPlayerStats[];
}

export function TeamStatsTable({ players }: TeamStatsTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'scoring_average',
    direction: 'asc', // Lower is better for scoring
  });

  const sortedPlayers = useMemo(() => {
    const sorted = [...players].sort((a, b) => {
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
  }, [players, sortConfig]);

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
    <div className="relative glass-standard rounded-2xl overflow-hidden">
      <ShineEffect />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-warm-200/60">
              <th className="text-left px-4 py-3">
                <button
                  onClick={() => handleSort('name')}
                  className="flex items-center gap-1 text-xs font-semibold text-warm-500 uppercase tracking-wider hover:text-warm-700 transition-colors"
                >
                  Player
                  <SortIcon columnKey="name" />
                </button>
              </th>
              <th className="text-center px-3 py-3">
                <button
                  onClick={() => handleSort('rounds_played')}
                  className="flex items-center justify-center gap-1 text-xs font-semibold text-warm-500 uppercase tracking-wider hover:text-warm-700 transition-colors mx-auto"
                >
                  Rnds
                  <SortIcon columnKey="rounds_played" />
                </button>
              </th>
              <th className="text-center px-3 py-3">
                <button
                  onClick={() => handleSort('scoring_average')}
                  className="flex items-center justify-center gap-1 text-xs font-semibold text-warm-500 uppercase tracking-wider hover:text-warm-700 transition-colors mx-auto"
                >
                  Avg
                  <SortIcon columnKey="scoring_average" />
                </button>
              </th>
              <th className="text-center px-3 py-3">
                <button
                  onClick={() => handleSort('best_round')}
                  className="flex items-center justify-center gap-1 text-xs font-semibold text-warm-500 uppercase tracking-wider hover:text-warm-700 transition-colors mx-auto"
                >
                  Best
                  <SortIcon columnKey="best_round" />
                </button>
              </th>
              <th className="text-center px-3 py-3 hidden md:table-cell">
                <button
                  onClick={() => handleSort('handicap')}
                  className="flex items-center justify-center gap-1 text-xs font-semibold text-warm-500 uppercase tracking-wider hover:text-warm-700 transition-colors mx-auto"
                >
                  HCP
                  <SortIcon columnKey="handicap" />
                </button>
              </th>
              <th className="text-center px-3 py-3 hidden lg:table-cell">
                <button
                  onClick={() => handleSort('fairway_pct')}
                  className="flex items-center justify-center gap-1 text-xs font-semibold text-warm-500 uppercase tracking-wider hover:text-warm-700 transition-colors mx-auto"
                >
                  FW%
                  <SortIcon columnKey="fairway_pct" />
                </button>
              </th>
              <th className="text-center px-3 py-3 hidden lg:table-cell">
                <button
                  onClick={() => handleSort('gir_pct')}
                  className="flex items-center justify-center gap-1 text-xs font-semibold text-warm-500 uppercase tracking-wider hover:text-warm-700 transition-colors mx-auto"
                >
                  GIR%
                  <SortIcon columnKey="gir_pct" />
                </button>
              </th>
              <th className="text-center px-3 py-3 hidden xl:table-cell">
                <button
                  onClick={() => handleSort('putts_per_round')}
                  className="flex items-center justify-center gap-1 text-xs font-semibold text-warm-500 uppercase tracking-wider hover:text-warm-700 transition-colors mx-auto"
                >
                  Putts
                  <SortIcon columnKey="putts_per_round" />
                </button>
              </th>
              <th className="text-center px-3 py-3 hidden sm:table-cell">
                <button
                  onClick={() => handleSort('scoring_trend')}
                  className="flex items-center justify-center gap-1 text-xs font-semibold text-warm-500 uppercase tracking-wider hover:text-warm-700 transition-colors mx-auto"
                >
                  Trend
                  <SortIcon columnKey="scoring_trend" />
                </button>
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
                    'font-semibold tabular-nums',
                    player.scoring_average !== null && player.scoring_average <= 72
                      ? 'text-primary-600'
                      : 'text-warm-900'
                  )}>
                    {formatScore(player.scoring_average)}
                  </span>
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
                {players.filter(p => p.scoring_average !== null).length > 0
                  ? (
                      players
                        .filter(p => p.scoring_average !== null)
                        .reduce((sum, p) => sum + (p.scoring_average || 0), 0) /
                      players.filter(p => p.scoring_average !== null).length
                    ).toFixed(1)
                  : '—'}
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
  );
}
