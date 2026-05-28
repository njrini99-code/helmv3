'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { BaseballRosterPlayer } from '@/lib/types';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconTarget,
  IconActivity,
  IconX,
  IconChevronDown,
  IconChevronUp,
  IconUsers,
} from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import { TimeRangeFilter, type TimeRange } from './TimeRangeFilter';
import { PressureGapIndicator } from './PressureGapIndicator';
import { StatTypeFilter, type StatCategory } from './StatTypeFilter';
import { Button, IconButton } from '@/components/ui/button';

// ============================================================================
// TYPES
// ============================================================================

interface GameVsPracticeComparisonProps {
  players: BaseballRosterPlayer[];
  selectedPlayerId?: string | null;
  onPlayerSelect?: (playerId: string | null) => void;
  onClose?: () => void;
  className?: string;
}

interface PlayerComparisonData {
  id: string;
  name: string;
  avatarUrl: string | null;
  position: string | null;
  practiceAvg: number;
  gameAvg: number;
  gap: number;
  practiceSessions: number;
  gameSessions: number;
  practiceOBP: number | null;
  gameOBP: number | null;
  practiceSLG: number | null;
  gameSLG: number | null;
  recentTrend: 'up' | 'down' | 'stable' | null;
}

type SortField = 'name' | 'gap' | 'practiceAvg' | 'gameAvg';
type SortDirection = 'asc' | 'desc';

// ============================================================================
// HELPERS
// ============================================================================

function formatAvg(value: number | null | undefined): string {
  if (value == null) return '---';
  return value.toFixed(3).replace(/^0\./, '.');
}

function formatGap(gap: number): string {
  const points = Math.abs(gap * 1000).toFixed(0);
  return `${gap >= 0 ? '+' : '-'}${points}`;
}

function getGapColor(gap: number): string {
  if (gap > 0.02) return 'text-primary-600';
  if (gap < -0.02) return 'text-red-500';
  return 'text-warm-500';
}

function getGapBg(gap: number): string {
  if (gap > 0.02) return 'bg-primary-50';
  if (gap < -0.02) return 'bg-red-50';
  return 'bg-warm-50';
}

// ============================================================================
// COMPARISON STAT ROW
// ============================================================================

interface ComparisonStatRowProps {
  label: string;
  practiceValue: number | null;
  gameValue: number | null;
  format?: 'avg' | 'number' | 'percent';
  higherIsBetter?: boolean;
}

function ComparisonStatRow({
  label,
  practiceValue,
  gameValue,
  format = 'avg',
  higherIsBetter = true,
}: ComparisonStatRowProps) {
  const formatValue = (val: number | null) => {
    if (val == null) return '---';
    if (format === 'avg') return formatAvg(val);
    if (format === 'percent') return `${(val * 100).toFixed(1)}%`;
    return val.toFixed(1);
  };

  const practiceBetter =
    practiceValue != null &&
    gameValue != null &&
    (higherIsBetter ? practiceValue > gameValue : practiceValue < gameValue);

  const gameBetter =
    practiceValue != null &&
    gameValue != null &&
    (higherIsBetter ? gameValue > practiceValue : gameValue < practiceValue);

  return (
    <div className="grid grid-cols-3 gap-2 items-center py-2 border-b border-warm-100 last:border-b-0">
      <span className="text-xs font-medium text-warm-600">{label}</span>
      <span
        className={cn(
          'text-sm font-semibold tabular-nums text-center',
          practiceBetter ? 'text-warm-900' : 'text-warm-500'
        )}
      >
        {formatValue(practiceValue)}
        {practiceBetter && (
          <span className="text-xs text-primary-500 ml-1">★</span>
        )}
      </span>
      <span
        className={cn(
          'text-sm font-semibold tabular-nums text-center',
          gameBetter ? 'text-warm-900' : 'text-warm-500'
        )}
      >
        {formatValue(gameValue)}
        {gameBetter && (
          <span className="text-xs text-primary-500 ml-1">★</span>
        )}
      </span>
    </div>
  );
}

// ============================================================================
// PLAYER DETAIL CARD
// ============================================================================

interface PlayerDetailCardProps {
  player: PlayerComparisonData;
  onClose: () => void;
}

function PlayerDetailCard({ player, onClose }: PlayerDetailCardProps) {
  return (
    <div className="bg-white rounded-xl border border-warm-200 shadow-lg p-4 animate-in slide-in-from-top-2 duration-200">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <Avatar src={player.avatarUrl} name={player.name} size="md" />
          <div>
            <h4 className="font-semibold text-warm-900">{player.name}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              {player.position && (
                <span className="text-xs px-1.5 py-0.5 bg-warm-100 rounded text-warm-600">
                  {player.position}
                </span>
              )}
              <span className="text-xs text-warm-500">
                {player.practiceSessions} practice • {player.gameSessions} games
              </span>
            </div>
          </div>
        </div>
        <IconButton variant="default" aria-label="Close"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-warm-100 transition-colors"
        >
          <IconX size={16} className="text-warm-500" />
        </IconButton>
      </div>

      {/* Pressure Gap Visualization */}
      <div className="mb-4">
        <PressureGapIndicator
          gap={player.gap}
          practiceAvg={player.practiceAvg}
          gameAvg={player.gameAvg}
          showLabels
        />
      </div>

      {/* Side-by-side comparison table */}
      <div className="bg-warm-50 rounded-lg p-3">
        <div className="grid grid-cols-3 gap-2 mb-2 pb-2 border-b border-warm-200">
          <span className="text-xs font-medium text-warm-500">Metric</span>
          <span className="text-xs font-medium text-warm-500 text-center flex items-center justify-center gap-1">
            <IconTarget size={12} />
            Practice
          </span>
          <span className="text-xs font-medium text-warm-500 text-center flex items-center justify-center gap-1">
            <IconActivity size={12} />
            Game
          </span>
        </div>

        <ComparisonStatRow
          label="AVG"
          practiceValue={player.practiceAvg}
          gameValue={player.gameAvg}
        />
        <ComparisonStatRow
          label="OBP"
          practiceValue={player.practiceOBP}
          gameValue={player.gameOBP}
        />
        <ComparisonStatRow
          label="SLG"
          practiceValue={player.practiceSLG}
          gameValue={player.gameSLG}
        />
      </div>

      {/* Trend indicator */}
      {player.recentTrend && (
        <div className="mt-3 flex items-center justify-center gap-2 text-xs">
          {player.recentTrend === 'up' && (
            <>
              <IconTrendingUp size={14} className="text-primary-500" />
              <span className="text-primary-600">Trending up recently</span>
            </>
          )}
          {player.recentTrend === 'down' && (
            <>
              <IconTrendingDown size={14} className="text-red-500" />
              <span className="text-red-600">Trending down recently</span>
            </>
          )}
          {player.recentTrend === 'stable' && (
            <>
              <IconMinus size={14} className="text-warm-400" />
              <span className="text-warm-600">Stable performance</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PLAYER ROW (COMPACT)
// ============================================================================

interface PlayerComparisonRowProps {
  player: PlayerComparisonData;
  isSelected: boolean;
  onClick: () => void;
}

function PlayerComparisonRow({
  player,
  isSelected,
  onClick,
}: PlayerComparisonRowProps) {
  return (
    <Button variant="primary"
      onClick={onClick}
      className={cn(
        'w-full grid grid-cols-12 gap-2 items-center p-2 rounded-lg transition-colors text-left',
        isSelected
          ? 'bg-primary-50 ring-1 ring-primary-200'
          : 'hover:bg-warm-50 active:bg-warm-100'
      )}
    >
      {/* Player info - 5 cols */}
      <div className="col-span-5 flex items-center gap-2 min-w-0">
        <Avatar src={player.avatarUrl} name={player.name} size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-warm-900 truncate">
            {player.name}
          </p>
          {player.position && (
            <span className="text-xs text-warm-500">{player.position}</span>
          )}
        </div>
      </div>

      {/* Practice AVG - 2 cols */}
      <div className="col-span-2 text-center">
        <span className="text-sm font-semibold tabular-nums text-warm-700">
          {formatAvg(player.practiceAvg)}
        </span>
      </div>

      {/* Game AVG - 2 cols */}
      <div className="col-span-2 text-center">
        <span className="text-sm font-semibold tabular-nums text-warm-700">
          {formatAvg(player.gameAvg)}
        </span>
      </div>

      {/* Gap - 3 cols */}
      <div className="col-span-3 flex items-center justify-end gap-1">
        <span
          className={cn(
            'text-sm font-bold tabular-nums',
            getGapColor(player.gap)
          )}
        >
          {formatGap(player.gap)}
        </span>
        <span
          className={cn(
            'w-6 h-6 rounded-full flex items-center justify-center',
            getGapBg(player.gap)
          )}
        >
          {player.gap > 0.01 ? (
            <IconTrendingUp size={12} className="text-primary-500" />
          ) : player.gap < -0.01 ? (
            <IconTrendingDown size={12} className="text-red-500" />
          ) : (
            <IconMinus size={12} className="text-warm-400" />
          )}
        </span>
      </div>
    </Button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function GameVsPracticeComparison({
  players,
  selectedPlayerId: externalSelectedId,
  onPlayerSelect,
  onClose,
  className,
}: GameVsPracticeComparisonProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [statCategory, setStatCategory] = useState<StatCategory>('all');
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('gap');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const selectedPlayerId = externalSelectedId ?? internalSelectedId;

  const handlePlayerSelect = (playerId: string | null) => {
    if (onPlayerSelect) {
      onPlayerSelect(playerId);
    } else {
      setInternalSelectedId(playerId);
    }
  };

  // Process player data with time filtering
  const comparisonData = useMemo(() => {
    // Note: Time filtering would be done server-side via API params
    // The timeRange state is passed to filters but actual filtering happens server-side
    const playersWithData = players.filter(
      (p) =>
        p.aggregates?.practice_avg != null &&
        p.aggregates?.game_avg != null &&
        p.aggregates?.pressure_gap != null
    );

    if (playersWithData.length === 0) return [];

    const data: PlayerComparisonData[] = playersWithData.map((p) => ({
      id: p.id,
      name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      avatarUrl: p.avatar_url,
      position: p.primary_position,
      practiceAvg: p.aggregates!.practice_avg!,
      gameAvg: p.aggregates!.game_avg!,
      gap: p.aggregates!.pressure_gap!,
      practiceSessions: p.aggregates!.practice_sessions || 0,
      gameSessions: p.aggregates!.game_sessions || 0,
      practiceOBP: p.aggregates!.career_obp, // Would need separate practice/game OBP
      gameOBP: p.aggregates!.career_obp,
      practiceSLG: p.aggregates!.career_slg,
      gameSLG: p.aggregates!.career_slg,
      recentTrend: p.aggregates!.recent_trend as 'up' | 'down' | 'stable' | null,
    }));

    // Sort data
    data.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'gap':
          comparison = Math.abs(b.gap) - Math.abs(a.gap);
          break;
        case 'practiceAvg':
          comparison = b.practiceAvg - a.practiceAvg;
          break;
        case 'gameAvg':
          comparison = b.gameAvg - a.gameAvg;
          break;
      }
      return sortDirection === 'asc' ? -comparison : comparison;
    });

    return data;
  }, [players, sortField, sortDirection]);

  // Team summary
  const teamSummary = useMemo(() => {
    if (comparisonData.length === 0) return null;

    const clutchCount = comparisonData.filter((p) => p.gap > 0.02).length;
    const struggleCount = comparisonData.filter((p) => p.gap < -0.02).length;
    const consistentCount = comparisonData.length - clutchCount - struggleCount;
    const avgGap =
      comparisonData.reduce((sum, p) => sum + p.gap, 0) / comparisonData.length;
    const avgPractice =
      comparisonData.reduce((sum, p) => sum + p.practiceAvg, 0) /
      comparisonData.length;
    const avgGame =
      comparisonData.reduce((sum, p) => sum + p.gameAvg, 0) /
      comparisonData.length;

    return {
      clutchCount,
      struggleCount,
      consistentCount,
      avgGap,
      avgPractice,
      avgGame,
      total: comparisonData.length,
    };
  }, [comparisonData]);

  const selectedPlayer = comparisonData.find((p) => p.id === selectedPlayerId);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Empty state
  if (comparisonData.length === 0) {
    return (
      <div className={cn('bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl p-6', className)}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-warm-900">Game vs Practice Comparison</h3>
          {onClose && (
            <IconButton variant="default" aria-label="Close"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-warm-100 transition-colors"
            >
              <IconX size={16} className="text-warm-500" />
            </IconButton>
          )}
        </div>
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-warm-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <IconUsers size={24} className="text-warm-400" />
          </div>
          <p className="text-sm text-warm-600 mb-2">No comparison data available</p>
          <p className="text-xs text-warm-500 max-w-xs mx-auto">
            Upload both practice and game stats to compare player performance under pressure.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl', className)}>
      {/* Header */}
      <div className="p-4 border-b border-warm-100">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="font-semibold text-warm-900">Game vs Practice Comparison</h3>
            <p className="text-xs text-warm-500 mt-0.5">
              {teamSummary?.total} players with comparison data
            </p>
          </div>
          {onClose && (
            <IconButton variant="default" aria-label="Close"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-warm-100 transition-colors"
            >
              <IconX size={16} className="text-warm-500" />
            </IconButton>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
          <StatTypeFilter value={statCategory} onChange={setStatCategory} />
        </div>
      </div>

      {/* Team Summary */}
      {teamSummary && (
        <div className="p-4 border-b border-warm-100 bg-warm-50/50">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Team Practice Avg */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <IconTarget size={14} className="text-warm-500" />
                <span className="text-lg font-bold tabular-nums text-warm-900">
                  {formatAvg(teamSummary.avgPractice)}
                </span>
              </div>
              <span className="text-xs text-warm-500">Practice Avg</span>
            </div>

            {/* Team Game Avg */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <IconActivity size={14} className="text-warm-500" />
                <span className="text-lg font-bold tabular-nums text-warm-900">
                  {formatAvg(teamSummary.avgGame)}
                </span>
              </div>
              <span className="text-xs text-warm-500">Game Avg</span>
            </div>

            {/* Clutch Players */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <IconTrendingUp size={14} className="text-primary-500" />
                <span className="text-lg font-bold tabular-nums text-primary-600">
                  {teamSummary.clutchCount}
                </span>
              </div>
              <span className="text-xs text-warm-500">Clutch</span>
            </div>

            {/* Struggling Players */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <IconTrendingDown size={14} className="text-red-500" />
                <span className="text-lg font-bold tabular-nums text-red-500">
                  {teamSummary.struggleCount}
                </span>
              </div>
              <span className="text-xs text-warm-500">Struggling</span>
            </div>
          </div>
        </div>
      )}

      {/* Selected Player Detail */}
      {selectedPlayer && (
        <div className="p-4 border-b border-warm-100">
          <PlayerDetailCard
            player={selectedPlayer}
            onClose={() => handlePlayerSelect(null)}
          />
        </div>
      )}

      {/* Column Headers */}
      <div className="px-4 py-2 border-b border-warm-100 bg-warm-50">
        <div className="grid grid-cols-12 gap-2 items-center">
          <Button variant="ghost"
            onClick={() => toggleSort('name')}
            className="col-span-5 flex items-center gap-1 text-xs font-medium text-warm-500 hover:text-warm-700"
          >
            Player
            {sortField === 'name' &&
              (sortDirection === 'asc' ? (
                <IconChevronUp size={12} />
              ) : (
                <IconChevronDown size={12} />
              ))}
          </Button>
          <Button variant="ghost"
            onClick={() => toggleSort('practiceAvg')}
            className="col-span-2 flex items-center justify-center gap-1 text-xs font-medium text-warm-500 hover:text-warm-700"
          >
            Practice
            {sortField === 'practiceAvg' &&
              (sortDirection === 'asc' ? (
                <IconChevronUp size={12} />
              ) : (
                <IconChevronDown size={12} />
              ))}
          </Button>
          <Button variant="ghost"
            onClick={() => toggleSort('gameAvg')}
            className="col-span-2 flex items-center justify-center gap-1 text-xs font-medium text-warm-500 hover:text-warm-700"
          >
            Game
            {sortField === 'gameAvg' &&
              (sortDirection === 'asc' ? (
                <IconChevronUp size={12} />
              ) : (
                <IconChevronDown size={12} />
              ))}
          </Button>
          <Button variant="ghost"
            onClick={() => toggleSort('gap')}
            className="col-span-3 flex items-center justify-end gap-1 text-xs font-medium text-warm-500 hover:text-warm-700"
          >
            Gap
            {sortField === 'gap' &&
              (sortDirection === 'asc' ? (
                <IconChevronUp size={12} />
              ) : (
                <IconChevronDown size={12} />
              ))}
          </Button>
        </div>
      </div>

      {/* Player List */}
      <div className="p-2 max-h-96 overflow-y-auto">
        <div className="space-y-1">
          {comparisonData.map((player) => (
            <PlayerComparisonRow
              key={player.id}
              player={player}
              isSelected={selectedPlayerId === player.id}
              onClick={() =>
                handlePlayerSelect(
                  selectedPlayerId === player.id ? null : player.id
                )
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SKELETON
// ============================================================================

export function GameVsPracticeComparisonSkeleton() {
  return (
    <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl">
      {/* Header skeleton */}
      <div className="p-4 border-b border-warm-100">
        <div className="flex items-center justify-between mb-4">
          <div className="space-y-1">
            <div className="h-5 w-48 bg-warm-200 rounded animate-pulse" />
            <div className="h-3 w-32 bg-warm-100 rounded animate-pulse" />
          </div>
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-7 w-20 bg-warm-100 rounded-full animate-pulse"
            />
          ))}
        </div>
      </div>

      {/* Summary skeleton */}
      <div className="p-4 border-b border-warm-100 bg-warm-50/50">
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="text-center space-y-1">
              <div className="h-6 w-12 bg-warm-200 rounded animate-pulse mx-auto" />
              <div className="h-3 w-16 bg-warm-100 rounded animate-pulse mx-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* List skeleton */}
      <div className="p-4">
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <div className="w-8 h-8 rounded-full bg-warm-200 animate-pulse" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-24 bg-warm-200 rounded animate-pulse" />
                <div className="h-3 w-16 bg-warm-100 rounded animate-pulse" />
              </div>
              <div className="h-5 w-12 bg-warm-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
