'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { BaseballRosterPlayer } from '@/lib/types';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconActivity,
  IconTarget,
  IconMaximize,
} from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import { TimeRangeFilter, type TimeRange } from './TimeRangeFilter';
import { StatTypeFilter, type StatCategory } from './StatTypeFilter';
import {
  PressureGapIndicator,
  getGapColor,
  getGapBgColor,
} from './PressureGapIndicator';

// ============================================================================
// TYPES
// ============================================================================

interface GameVsPracticePanelProps {
  players: BaseballRosterPlayer[];
  onExpandClick?: () => void;
  className?: string;
}

interface PlayerPressure {
  id: string;
  name: string;
  avatarUrl: string | null;
  position: string | null;
  practiceAvg: number;
  gameAvg: number;
  gap: number; // Positive = better in games, Negative = struggles in games
  practiceSessions: number;
  gameSessions: number;
  trend: 'up' | 'down' | 'stable' | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatAvg(value: number | null | undefined): string {
  if (value == null) return '---';
  return value.toFixed(3).replace(/^0\./, '.');
}

function formatGap(gap: number): string {
  const points = Math.abs(gap * 1000).toFixed(0);
  return `${gap >= 0 ? '+' : '-'}${points} pts`;
}

// ============================================================================
// STAT BREAKDOWN BY TIER
// ============================================================================

interface StatBreakdownProps {
  players: PlayerPressure[];
  category: StatCategory;
}

function StatBreakdown({ players, category }: StatBreakdownProps) {
  const tiers = useMemo(() => {
    const clutch = players.filter((p) => p.gap > 0.02);
    const consistent = players.filter((p) => p.gap >= -0.02 && p.gap <= 0.02);
    const struggling = players.filter((p) => p.gap < -0.02);

    return { clutch, consistent, struggling };
  }, [players]);

  const categoryLabel =
    category === 'all'
      ? 'Overall'
      : category.charAt(0).toUpperCase() + category.slice(1);

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-warm-700">
        {categoryLabel} Performance Breakdown
      </h4>

      <div className="grid grid-cols-3 gap-2">
        {/* Clutch */}
        <div className="bg-primary-50 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-primary-600 mb-1">
            <IconTrendingUp size={14} />
            <span className="text-lg font-bold">{tiers.clutch.length}</span>
          </div>
          <span className="text-xs text-primary-700">Clutch</span>
        </div>

        {/* Consistent */}
        <div className="bg-warm-50 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-warm-600 mb-1">
            <IconMinus size={14} />
            <span className="text-lg font-bold">{tiers.consistent.length}</span>
          </div>
          <span className="text-xs text-warm-700">Consistent</span>
        </div>

        {/* Struggling */}
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-red-600 mb-1">
            <IconTrendingDown size={14} />
            <span className="text-lg font-bold">{tiers.struggling.length}</span>
          </div>
          <span className="text-xs text-red-700">Struggling</span>
        </div>
      </div>

      {/* Session count summary */}
      <div className="flex items-center justify-between text-xs text-warm-500 px-1">
        <span>
          Avg Practice Sessions:{' '}
          {players.length > 0
            ? (
                players.reduce((sum, p) => sum + p.practiceSessions, 0) / players.length
              ).toFixed(1)
            : 0}
        </span>
        <span>
          Avg Game Sessions:{' '}
          {players.length > 0
            ? (
                players.reduce((sum, p) => sum + p.gameSessions, 0) / players.length
              ).toFixed(1)
            : 0}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// PLAYER ROW COMPONENT
// ============================================================================

interface PlayerRowProps {
  player: PlayerPressure;
  showDetails: boolean;
  onToggleDetails: () => void;
}

function PlayerRow({ player, showDetails, onToggleDetails }: PlayerRowProps) {
  return (
    <div className="space-y-2">
      <button
        onClick={onToggleDetails}
        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-warm-50 active:bg-warm-100 transition-colors text-left"
      >
        <Avatar src={player.avatarUrl} name={player.name} size="sm" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-warm-900 truncate">{player.name}</p>
          <div className="flex items-center gap-2 text-xs text-warm-500">
            {player.position && (
              <span className="px-1.5 py-0.5 bg-warm-100 rounded text-warm-600">
                {player.position}
              </span>
            )}
            <span>
              {player.practiceSessions}P / {player.gameSessions}G
            </span>
          </div>
        </div>

        <PressureGapIndicator
          gap={player.gap}
          practiceAvg={player.practiceAvg}
          gameAvg={player.gameAvg}
          compact
          size="sm"
        />
      </button>

      {/* Expanded details */}
      {showDetails && (
        <div className="ml-11 mr-2 p-3 bg-warm-50 rounded-lg animate-in slide-in-from-top-2 duration-200">
          {/* Side-by-side comparison */}
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-warm-500 mb-1">
                <IconTarget size={12} />
                <span className="text-xs font-medium">Practice</span>
              </div>
              <span className="text-lg font-bold tabular-nums text-warm-900">
                {formatAvg(player.practiceAvg)}
              </span>
              <p className="text-xs text-warm-500 mt-0.5">
                {player.practiceSessions} sessions
              </p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-warm-500 mb-1">
                <IconActivity size={12} />
                <span className="text-xs font-medium">Game</span>
              </div>
              <span className="text-lg font-bold tabular-nums text-warm-900">
                {formatAvg(player.gameAvg)}
              </span>
              <p className="text-xs text-warm-500 mt-0.5">
                {player.gameSessions} sessions
              </p>
            </div>
          </div>

          {/* Pressure gap indicator */}
          <PressureGapIndicator
            gap={player.gap}
            practiceAvg={player.practiceAvg}
            gameAvg={player.gameAvg}
            showLabels={false}
            size="sm"
          />

          {/* Trend indicator */}
          {player.trend && (
            <div className="mt-3 pt-2 border-t border-warm-200 flex items-center justify-center gap-2 text-xs">
              {player.trend === 'up' && (
                <>
                  <IconTrendingUp size={12} className="text-primary-500" />
                  <span className="text-primary-600">Game performance trending up</span>
                </>
              )}
              {player.trend === 'down' && (
                <>
                  <IconTrendingDown size={12} className="text-red-500" />
                  <span className="text-red-600">Game performance trending down</span>
                </>
              )}
              {player.trend === 'stable' && (
                <>
                  <IconMinus size={12} className="text-warm-400" />
                  <span className="text-warm-600">Stable game performance</span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function GameVsPracticePanel({
  players,
  onExpandClick,
  className,
}: GameVsPracticePanelProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [statCategory, setStatCategory] = useState<StatCategory>('all');
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [showAllPlayers, setShowAllPlayers] = useState(false);

  // Process player data
  const pressureData = useMemo(() => {
    const playersWithBothTypes = players.filter(
      (p) =>
        p.aggregates?.practice_avg != null &&
        p.aggregates?.game_avg != null &&
        p.aggregates?.pressure_gap != null
    );

    if (playersWithBothTypes.length === 0) return null;

    const data: PlayerPressure[] = playersWithBothTypes.map((p) => ({
      id: p.id,
      name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      avatarUrl: p.avatar_url,
      position: p.primary_position,
      practiceAvg: p.aggregates!.practice_avg!,
      gameAvg: p.aggregates!.game_avg!,
      gap: p.aggregates!.pressure_gap!,
      practiceSessions: p.aggregates!.practice_sessions || 0,
      gameSessions: p.aggregates!.game_sessions || 0,
      trend: p.aggregates!.recent_trend as 'up' | 'down' | 'stable' | null,
    }));

    // Sort by gap magnitude (biggest gaps first)
    data.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

    return data;
  }, [players]);

  // Team summary stats
  const teamSummary = useMemo(() => {
    if (!pressureData || pressureData.length === 0) return null;

    const clutchPlayers = pressureData.filter((p) => p.gap > 0.02).length;
    const strugglePlayers = pressureData.filter((p) => p.gap < -0.02).length;
    const avgGap =
      pressureData.reduce((sum, p) => sum + p.gap, 0) / pressureData.length;

    return {
      clutchPlayers,
      strugglePlayers,
      avgGap,
      totalTracked: pressureData.length,
    };
  }, [pressureData]);

  // Displayed players (limited or all)
  const displayedPlayers = useMemo(() => {
    if (!pressureData) return [];
    return showAllPlayers ? pressureData : pressureData.slice(0, 6);
  }, [pressureData, showAllPlayers]);

  // Empty state
  if (!pressureData || pressureData.length === 0) {
    return (
      <div className={cn('bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6', className)}>
        <h3 className="font-semibold text-warm-900 mb-2">
          Practice vs Game Performance
        </h3>
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-warm-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <IconActivity size={24} className="text-warm-400" />
          </div>
          <p className="text-sm text-warm-600 mb-2">
            No comparison data available yet
          </p>
          <p className="text-xs text-warm-500 max-w-xs mx-auto">
            Upload both practice and game stats to see how your players perform under
            pressure.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-4 sm:p-6', className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-warm-900">Practice vs Game</h3>
            {onExpandClick && (
              <button
                onClick={onExpandClick}
                className="p-1 rounded hover:bg-warm-100 transition-colors"
                title="Expand comparison view"
              >
                <IconMaximize size={14} className="text-warm-400" />
              </button>
            )}
          </div>
          <p className="text-xs text-warm-500 mt-0.5">
            {teamSummary?.totalTracked} players with comparison data
          </p>
        </div>
        <div className="flex items-center gap-2">
          {teamSummary && (
            <div className="hidden sm:flex items-center gap-3 text-xs mr-2">
              <span className="flex items-center gap-1 text-primary-600">
                <IconTrendingUp size={12} />
                {teamSummary.clutchPlayers} clutch
              </span>
              <span className="flex items-center gap-1 text-red-500">
                <IconTrendingDown size={12} />
                {teamSummary.strugglePlayers} struggle
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <TimeRangeFilter value={timeRange} onChange={setTimeRange} size="sm" />
        <StatTypeFilter value={statCategory} onChange={setStatCategory} size="sm" />
      </div>

      {/* Team Average Gap Card */}
      {teamSummary && (
        <div
          className={cn(
            'mb-4 p-4 rounded-xl',
            getGapBgColor(teamSummary.avgGap)
          )}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <span className="text-sm font-medium text-warm-700">
                Team Pressure Gap
              </span>
              <p className="text-xs text-warm-500 mt-0.5">
                {teamSummary.avgGap >= 0
                  ? 'Team rises to the occasion in games'
                  : 'Team needs to work on game-day execution'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {teamSummary.avgGap > 0.01 ? (
                <IconTrendingUp size={20} className="text-primary-500" />
              ) : teamSummary.avgGap < -0.01 ? (
                <IconTrendingDown size={20} className="text-red-500" />
              ) : (
                <IconMinus size={20} className="text-warm-400" />
              )}
              <span
                className={cn(
                  'text-2xl font-bold tabular-nums',
                  getGapColor(teamSummary.avgGap)
                )}
              >
                {formatGap(teamSummary.avgGap)}
              </span>
            </div>
          </div>

          {/* Mobile summary */}
          <div className="flex sm:hidden items-center gap-4 mt-3 pt-3 border-t border-warm-200">
            <span className="flex items-center gap-1 text-xs text-primary-600">
              <IconTrendingUp size={12} />
              {teamSummary.clutchPlayers} clutch
            </span>
            <span className="flex items-center gap-1 text-xs text-red-500">
              <IconTrendingDown size={12} />
              {teamSummary.strugglePlayers} struggle
            </span>
          </div>
        </div>
      )}

      {/* Stat Breakdown */}
      <div className="mb-4">
        <StatBreakdown players={pressureData} category={statCategory} />
      </div>

      {/* Player List */}
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {displayedPlayers.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            showDetails={expandedPlayerId === player.id}
            onToggleDetails={() =>
              setExpandedPlayerId(expandedPlayerId === player.id ? null : player.id)
            }
          />
        ))}
      </div>

      {/* Show more/less button */}
      {pressureData.length > 6 && (
        <button
          onClick={() => setShowAllPlayers(!showAllPlayers)}
          className="w-full mt-3 py-2 text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
        >
          {showAllPlayers
            ? 'Show less'
            : `Show all ${pressureData.length} players`}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// SKELETON COMPONENT
// ============================================================================

export function GameVsPracticePanelSkeleton() {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-4 sm:p-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-1">
          <div className="h-5 w-32 bg-warm-200 rounded animate-pulse" />
          <div className="h-3 w-24 bg-warm-100 rounded animate-pulse" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-4 w-16 bg-warm-200 rounded animate-pulse" />
          <div className="h-4 w-16 bg-warm-200 rounded animate-pulse" />
        </div>
      </div>

      {/* Filter skeleton */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-7 w-16 bg-warm-100 rounded-full animate-pulse"
            />
          ))}
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-7 w-14 bg-warm-100 rounded-full animate-pulse"
            />
          ))}
        </div>
      </div>

      {/* Summary card skeleton */}
      <div className="mb-4 p-4 bg-warm-50 rounded-xl">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="h-4 w-28 bg-warm-200 rounded animate-pulse" />
            <div className="h-3 w-40 bg-warm-100 rounded animate-pulse" />
          </div>
          <div className="h-8 w-20 bg-warm-200 rounded animate-pulse" />
        </div>
      </div>

      {/* Breakdown skeleton */}
      <div className="space-y-4 mb-4">
        <div className="h-4 w-40 bg-warm-200 rounded animate-pulse" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-warm-50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>

      {/* Player list skeleton */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <div className="w-8 h-8 rounded-full bg-warm-200 animate-pulse" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-24 bg-warm-200 rounded animate-pulse" />
              <div className="h-3 w-16 bg-warm-100 rounded animate-pulse" />
            </div>
            <div className="h-5 w-14 bg-warm-200 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
