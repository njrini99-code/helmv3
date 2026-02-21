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
  IconChartBar,
  IconFilter,
} from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';

// ============================================================================
// TYPES
// ============================================================================

interface GameVsPracticePanelProps {
  players: BaseballRosterPlayer[];
}

interface PlayerPressure {
  id: string;
  name: string;
  avatarUrl: string | null;
  position: string | null;
  practiceAvg: number;
  gameAvg: number;
  gap: number; // Positive = better in games, Negative = struggles in games
  // Extended stats for breakdown
  practiceSessions: number;
  gameSessions: number;
}

type StatCategory = 'all' | 'batting' | 'pitching' | 'fielding';

interface StatCategoryOption {
  value: StatCategory;
  label: string;
  icon: React.ReactNode;
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

function getGapColor(gap: number): string {
  if (gap > 0.02) return 'text-primary-600';
  if (gap < -0.02) return 'text-red-500';
  return 'text-warm-500';
}

function getGapBgColor(gap: number): string {
  if (gap > 0.02) return 'bg-primary-50';
  if (gap < -0.02) return 'bg-red-50';
  return 'bg-warm-50';
}

// ============================================================================
// STAT TYPE FILTER COMPONENT
// ============================================================================

interface StatTypeFilterProps {
  value: StatCategory;
  onChange: (value: StatCategory) => void;
}

const STAT_CATEGORIES: StatCategoryOption[] = [
  { value: 'all', label: 'All Stats', icon: <IconChartBar size={14} /> },
  { value: 'batting', label: 'Batting', icon: <IconTarget size={14} /> },
  { value: 'pitching', label: 'Pitching', icon: <IconActivity size={14} /> },
  { value: 'fielding', label: 'Fielding', icon: <IconFilter size={14} /> },
];

function StatTypeFilter({ value, onChange }: StatTypeFilterProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {STAT_CATEGORIES.map((cat) => (
        <button
          key={cat.value}
          onClick={() => onChange(cat.value)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
            value === cat.value
              ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-200'
              : 'bg-warm-50 text-warm-600 hover:bg-warm-100'
          )}
        >
          {cat.icon}
          <span className="hidden sm:inline">{cat.label}</span>
          <span className="sm:hidden">{cat.label.split(' ')[0]}</span>
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// PRESSURE GAP INDICATOR COMPONENT
// ============================================================================

interface PressureGapIndicatorProps {
  gap: number;
  practiceAvg: number;
  gameAvg: number;
  compact?: boolean;
}

function PressureGapIndicator({
  gap,
  practiceAvg,
  gameAvg,
  compact = false,
}: PressureGapIndicatorProps) {
  // Calculate percentage for visual bar (capped at -100 to +100 points)
  const maxPoints = 100;
  const gapPoints = gap * 1000;
  const barPercentage = Math.min(Math.abs(gapPoints) / maxPoints, 1) * 50;
  const isPositive = gap >= 0;

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {gap > 0.01 ? (
          <IconTrendingUp size={14} className="text-primary-500" />
        ) : gap < -0.01 ? (
          <IconTrendingDown size={14} className="text-red-500" />
        ) : (
          <IconMinus size={14} className="text-warm-400" />
        )}
        <span className={cn('text-sm font-semibold tabular-nums', getGapColor(gap))}>
          {formatGap(gap)}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Labels */}
      <div className="flex items-center justify-between text-xs text-warm-500">
        <span>Practice: {formatAvg(practiceAvg)}</span>
        <span>Game: {formatAvg(gameAvg)}</span>
      </div>

      {/* Visual bar */}
      <div className="relative h-2 bg-warm-100 rounded-full overflow-hidden">
        {/* Center marker */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-warm-300 z-10" />

        {/* Gap fill */}
        <div
          className={cn(
            'absolute top-0 bottom-0 rounded-full transition-all duration-300',
            isPositive ? 'bg-primary-400' : 'bg-red-400',
            isPositive ? 'left-1/2' : 'right-1/2'
          )}
          style={{
            width: `${barPercentage}%`,
          }}
        />
      </div>

      {/* Gap value */}
      <div className="flex items-center justify-center gap-1">
        {gap > 0.01 ? (
          <IconTrendingUp size={14} className="text-primary-500" />
        ) : gap < -0.01 ? (
          <IconTrendingDown size={14} className="text-red-500" />
        ) : (
          <IconMinus size={14} className="text-warm-400" />
        )}
        <span className={cn('text-sm font-bold tabular-nums', getGapColor(gap))}>
          {formatGap(gap)}
        </span>
        <span className="text-xs text-warm-500">
          {gap > 0.02
            ? 'clutch performer'
            : gap < -0.02
            ? 'pressure struggles'
            : 'consistent'}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// STAT BREAKDOWN BY CATEGORY
// ============================================================================

interface StatBreakdownProps {
  players: PlayerPressure[];
  category: StatCategory;
}

function StatBreakdown({ players, category }: StatBreakdownProps) {
  // Group players by performance tier
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
        />
      </button>

      {/* Expanded details */}
      {showDetails && (
        <div className="ml-11 mr-2 p-3 bg-warm-50 rounded-lg animate-in slide-in-from-top-2 duration-200">
          <PressureGapIndicator
            gap={player.gap}
            practiceAvg={player.practiceAvg}
            gameAvg={player.gameAvg}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function GameVsPracticePanel({ players }: GameVsPracticePanelProps) {
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
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
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
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold text-warm-900">Practice vs Game</h3>
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

      {/* Stat Type Filter */}
      <div className="mb-4">
        <StatTypeFilter value={statCategory} onChange={setStatCategory} />
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
      <div className="flex gap-1 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-7 w-20 bg-warm-100 rounded-full animate-pulse"
          />
        ))}
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
      <div className="grid grid-cols-3 gap-2 mb-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-warm-50 rounded-lg animate-pulse" />
        ))}
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
