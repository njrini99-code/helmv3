'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { BaseballRosterPlayer } from '@/lib/types';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
} from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';

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
}

function formatAvg(value: number | null | undefined): string {
  if (value == null) return '---';
  return value.toFixed(3).replace(/^0\./, '.');
}

function formatGap(gap: number): string {
  const points = Math.abs(gap * 1000).toFixed(0);
  return `${gap >= 0 ? '+' : '-'}${points} pts`;
}

export function GameVsPracticePanel({ players }: GameVsPracticePanelProps) {
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
    }));

    // Sort by gap magnitude (biggest gaps first)
    data.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

    return data;
  }, [players]);

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

  if (!pressureData || pressureData.length === 0) {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 mb-2">
          Practice vs Game Performance
        </h3>
        <p className="text-sm text-slate-500">
          Need both practice and game stats to compare performance. Upload more
          sessions to see this analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Practice vs Game</h3>
        <div className="flex items-center gap-3 text-xs">
          {teamSummary && (
            <>
              <span className="flex items-center gap-1 text-primary-600">
                <IconTrendingUp size={12} />
                {teamSummary.clutchPlayers} clutch
              </span>
              <span className="flex items-center gap-1 text-red-500">
                <IconTrendingDown size={12} />
                {teamSummary.strugglePlayers} struggle
              </span>
            </>
          )}
        </div>
      </div>

      {/* Team Average Gap */}
      {teamSummary && (
        <div
          className={cn(
            'mb-4 p-3 rounded-lg',
            teamSummary.avgGap >= 0 ? 'bg-primary-50' : 'bg-amber-50'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              Team Avg Pressure Gap
            </span>
            <span
              className={cn(
                'text-lg font-bold tabular-nums',
                teamSummary.avgGap >= 0 ? 'text-primary-600' : 'text-amber-600'
              )}
            >
              {formatGap(teamSummary.avgGap)}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {teamSummary.avgGap >= 0
              ? 'Team performs better in games than practice'
              : 'Team performs better in practice than games'}
          </p>
        </div>
      )}

      {/* Player List */}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {pressureData.slice(0, 8).map((player) => (
          <div
            key={player.id}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Avatar
              src={player.avatarUrl}
              name={player.name}
              size="sm"
            />

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {player.name}
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Practice: {formatAvg(player.practiceAvg)}</span>
                <span className="text-slate-300">→</span>
                <span>Game: {formatAvg(player.gameAvg)}</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {player.gap > 0.01 ? (
                <IconTrendingUp size={14} className="text-primary-500" />
              ) : player.gap < -0.01 ? (
                <IconTrendingDown size={14} className="text-red-500" />
              ) : (
                <IconMinus size={14} className="text-slate-400" />
              )}
              <span
                className={cn(
                  'text-sm font-semibold tabular-nums',
                  player.gap > 0.01
                    ? 'text-primary-600'
                    : player.gap < -0.01
                    ? 'text-red-500'
                    : 'text-slate-500'
                )}
              >
                {formatGap(player.gap)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {pressureData.length > 8 && (
        <p className="text-xs text-slate-400 text-center mt-3">
          +{pressureData.length - 8} more players
        </p>
      )}
    </div>
  );
}

export function GameVsPracticePanelSkeleton() {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 w-36 bg-slate-200 rounded animate-pulse" />
        <div className="flex items-center gap-3">
          <div className="h-4 w-16 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-16 bg-slate-200 rounded animate-pulse" />
        </div>
      </div>

      <div className="mb-4 p-3 bg-slate-50 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
          <div className="h-6 w-16 bg-slate-200 rounded animate-pulse" />
        </div>
      </div>

      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <div className="w-8 h-8 rounded-full bg-slate-200 animate-pulse" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
              <div className="h-3 w-40 bg-slate-200 rounded animate-pulse" />
            </div>
            <div className="h-5 w-16 bg-slate-200 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
