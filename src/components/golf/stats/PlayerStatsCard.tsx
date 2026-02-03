'use client';

/**
 * Player Stats Card
 *
 * Compact stats view for player roster lists and quick overviews.
 * Shows key metrics with trend indicators.
 */

import type {
  PlayerStats,
  TrendDirection,
  PlayerStrokesGained,
} from '@/lib/types/golf';
import { formatStrokesGained, getStrokesGainedColor } from '@/lib/golf/strokes-gained';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PlayerStatsCardProps {
  stats: PlayerStats;
  playerName: string;
  avatarUrl?: string;
  trends?: {
    scoring?: TrendDirection;
    sg?: TrendDirection;
  };
  rank?: number;
  showExpandedView?: boolean;
  onExpandClick?: () => void;
  className?: string;
}

export function PlayerStatsCard({
  stats,
  playerName,
  avatarUrl,
  trends,
  rank,
  showExpandedView = false,
  onExpandClick,
  className,
}: PlayerStatsCardProps) {
  const getTrendIcon = (trend?: TrendDirection) => {
    if (!trend) return null;
    return trend === 'improving' ? '↑' : trend === 'declining' ? '↓' : '→';
  };

  const getTrendColor = (trend?: TrendDirection, isHigherBetter: boolean = false) => {
    if (!trend || trend === 'stable') return 'text-gray-500';
    const isGood = isHigherBetter
      ? trend === 'improving'   // Higher is better (GIR%, fairway%, SG)
      : trend === 'declining';  // Lower is better (scoring avg, putts)
    return isGood ? 'text-green-500' : 'text-red-500';
  };

  // Get initials for avatar fallback
  const initials = playerName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card
      className={cn(
        'transition-all hover:shadow-md',
        onExpandClick && 'cursor-pointer',
        className
      )}
      onClick={onExpandClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="relative">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={playerName}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-medium">
                {initials}
              </div>
            )}
            {rank && (
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center font-semibold">
                {rank}
              </div>
            )}
          </div>

          {/* Name and basic info */}
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-gray-900 truncate">{playerName}</h4>
            <p className="text-sm text-gray-500">
              {stats.total_rounds} round{stats.total_rounds !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Key stats */}
          <div className="flex items-center gap-4">
            {/* Scoring Average */}
            <div className="text-center">
              <div className="flex items-center gap-1">
                <span className="text-lg font-bold text-gray-900">
                  {stats.scoring_avg > 0 ? stats.scoring_avg.toFixed(1) : '-'}
                </span>
                {trends?.scoring && (
                  <span className={cn('text-sm', getTrendColor(trends.scoring, false))}>
                    {getTrendIcon(trends.scoring)}
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-500">Avg Score</span>
            </div>

            {/* GIR % */}
            <div className="text-center">
              <span className="text-lg font-bold text-gray-900">
                {stats.gir_percentage > 0 ? `${stats.gir_percentage.toFixed(0)}%` : '-'}
              </span>
              <span className="text-xs text-gray-500 block">GIR</span>
            </div>

            {/* Strokes Gained */}
            <div className="text-center">
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    'text-lg font-bold',
                    getStrokesGainedColor(stats.strokes_gained.sg_total)
                  )}
                >
                  {formatStrokesGained(stats.strokes_gained.sg_total)}
                </span>
                {trends?.sg && (
                  <span className={cn('text-sm', getTrendColor(trends.sg, true))}>
                    {getTrendIcon(trends.sg)}
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-500">SG Total</span>
            </div>
          </div>

          {/* Expand indicator */}
          {onExpandClick && (
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          )}
        </div>

        {/* Expanded view */}
        {showExpandedView && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500 block">Best Round</span>
                <span className="font-semibold">{stats.best_round || '-'}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Putts/Rnd</span>
                <span className="font-semibold">{stats.avg_putts > 0 ? stats.avg_putts.toFixed(1) : '-'}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Fairways</span>
                <span className="font-semibold">{stats.fairway_percentage > 0 ? `${stats.fairway_percentage.toFixed(0)}%` : '-'}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Up & Down</span>
                <span className="font-semibold">{stats.up_and_down_percentage > 0 ? `${stats.up_and_down_percentage.toFixed(0)}%` : '-'}</span>
              </div>
            </div>

            {/* Mini SG breakdown */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-gray-500">SG:</span>
              {[
                { key: 'sg_off_tee', label: 'OTT' },
                { key: 'sg_approach', label: 'APP' },
                { key: 'sg_around_green', label: 'ARG' },
                { key: 'sg_putting', label: 'PUT' },
              ].map((cat) => {
                const value = stats.strokes_gained[cat.key as keyof PlayerStrokesGained];
                return (
                  <Badge
                    key={cat.key}
                    variant="outline"
                    className={cn('text-xs', getStrokesGainedColor(value))}
                  >
                    {cat.label}: {formatStrokesGained(value)}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// List of player stat cards
export function PlayerStatsCardList({
  players,
  sortBy = 'scoring_avg',
  className,
}: {
  players: {
    stats: PlayerStats;
    playerName: string;
    avatarUrl?: string;
    trends?: { scoring?: TrendDirection; sg?: TrendDirection };
  }[];
  sortBy?: 'scoring_avg' | 'sg_total' | 'rounds';
  className?: string;
}) {
  // Sort players
  const sortedPlayers = [...players].sort((a, b) => {
    switch (sortBy) {
      case 'scoring_avg':
        return a.stats.scoring_avg - b.stats.scoring_avg;
      case 'sg_total':
        return b.stats.strokes_gained.sg_total - a.stats.strokes_gained.sg_total;
      case 'rounds':
        return b.stats.total_rounds - a.stats.total_rounds;
      default:
        return 0;
    }
  });

  return (
    <div className={cn('space-y-3', className)}>
      {sortedPlayers.map((player, index) => (
        <PlayerStatsCard
          key={player.stats.player_id}
          stats={player.stats}
          playerName={player.playerName}
          avatarUrl={player.avatarUrl}
          trends={player.trends}
          rank={index + 1}
        />
      ))}
    </div>
  );
}

// Mini version for sidebar/compact views
export function PlayerStatsMini({
  stats,
  playerName,
  className,
}: {
  stats: PlayerStats;
  playerName: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <span className="text-sm font-medium text-gray-700 truncate">{playerName}</span>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-gray-900 font-semibold">{stats.scoring_avg.toFixed(1)}</span>
        <span className={cn('font-medium', getStrokesGainedColor(stats.strokes_gained.sg_total))}>
          {formatStrokesGained(stats.strokes_gained.sg_total)}
        </span>
      </div>
    </div>
  );
}
