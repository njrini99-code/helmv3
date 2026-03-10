'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { BaseballRosterPlayer } from '@/lib/types';
import {
  IconActivity,
  IconTarget,
  IconTrendingUp,
  IconChartBar,
} from '@/components/icons';

interface TeamBattingOverviewProps {
  players: BaseballRosterPlayer[];
}

interface TeamStats {
  teamAvg: number | null;
  teamOBP: number | null;
  teamSLG: number | null;
  teamOPS: number | null;
  playersWithData: number;
  totalAtBats: number;
}

function calculateTeamStats(players: BaseballRosterPlayer[]): TeamStats {
  const playersWithAggregates = players.filter((p) => p.aggregates?.career_avg != null);

  if (playersWithAggregates.length === 0) {
    return {
      teamAvg: null,
      teamOBP: null,
      teamSLG: null,
      teamOPS: null,
      playersWithData: 0,
      totalAtBats: 0,
    };
  }

  // Calculate weighted averages based on total sessions (as proxy for at-bats)
  let totalWeight = 0;
  let weightedAvg = 0;
  let weightedOBP = 0;
  let weightedSLG = 0;
  let totalAtBats = 0;

  for (const player of playersWithAggregates) {
    const agg = player.aggregates!;
    const weight = agg.total_sessions || 1;
    totalWeight += weight;
    totalAtBats += agg.total_sessions || 0;

    if (agg.career_avg != null) {
      weightedAvg += agg.career_avg * weight;
    }
    if (agg.career_obp != null) {
      weightedOBP += agg.career_obp * weight;
    }
    if (agg.career_slg != null) {
      weightedSLG += agg.career_slg * weight;
    }
  }

  const teamAvg = totalWeight > 0 ? weightedAvg / totalWeight : null;
  const teamOBP = totalWeight > 0 ? weightedOBP / totalWeight : null;
  const teamSLG = totalWeight > 0 ? weightedSLG / totalWeight : null;
  const teamOPS = teamOBP != null && teamSLG != null ? teamOBP + teamSLG : null;

  return {
    teamAvg,
    teamOBP,
    teamSLG,
    teamOPS,
    playersWithData: playersWithAggregates.length,
    totalAtBats,
  };
}

function formatAvg(value: number | null): string {
  if (value == null) return '---';
  return value.toFixed(3).replace(/^0\./, '.');
}

function formatOPS(value: number | null): string {
  if (value == null) return '---';
  return value.toFixed(3);
}

function getStatColor(value: number | null, type: 'avg' | 'obp' | 'slg' | 'ops'): string {
  if (value == null) return 'text-slate-400';

  // Thresholds for good/average/below average
  const thresholds: Record<string, { good: number; average: number }> = {
    avg: { good: 0.3, average: 0.25 },
    obp: { good: 0.38, average: 0.32 },
    slg: { good: 0.45, average: 0.38 },
    ops: { good: 0.8, average: 0.7 },
  };

  const t = thresholds[type];
  if (!t) return 'text-slate-900';
  if (value >= t.good) return 'text-primary-600';
  if (value >= t.average) return 'text-slate-900';
  return 'text-amber-600';
}

function TeamBattingOverview({ players }: TeamBattingOverviewProps) {
  const stats = useMemo(() => calculateTeamStats(players), [players]);

  const statCards = [
    {
      label: 'Team AVG',
      value: formatAvg(stats.teamAvg),
      icon: IconTarget,
      color: getStatColor(stats.teamAvg, 'avg'),
      description: 'Batting Average',
    },
    {
      label: 'Team OBP',
      value: formatAvg(stats.teamOBP),
      icon: IconActivity,
      color: getStatColor(stats.teamOBP, 'obp'),
      description: 'On-Base %',
    },
    {
      label: 'Team SLG',
      value: formatAvg(stats.teamSLG),
      icon: IconTrendingUp,
      color: getStatColor(stats.teamSLG, 'slg'),
      description: 'Slugging %',
    },
    {
      label: 'Team OPS',
      value: formatOPS(stats.teamOPS),
      icon: IconChartBar,
      color: getStatColor(stats.teamOPS, 'ops'),
      description: 'OBP + SLG',
    },
  ];

  if (stats.playersWithData === 0) {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 mb-2">Team Batting</h3>
        <p className="text-sm text-slate-500">
          No batting data available yet. Upload stats to see team performance.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Team Batting</h3>
        <span className="text-xs text-slate-500">
          {stats.playersWithData} players · {stats.totalAtBats} sessions
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="bg-slate-50/80 rounded-xl p-4 text-center"
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <stat.icon size={16} className="text-slate-400" />
              <span className="text-xs text-slate-500 font-medium">
                {stat.label}
              </span>
            </div>
            <p className={cn('text-2xl font-bold tabular-nums', stat.color)}>
              {stat.value}
            </p>
            <p className="text-xs text-slate-400 mt-1">{stat.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TeamBattingOverviewSkeleton() {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 w-28 bg-slate-200 rounded animate-pulse" />
        <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-slate-50/80 rounded-xl p-4 text-center"
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-4 h-4 bg-slate-200 rounded animate-pulse" />
              <div className="h-3 w-16 bg-slate-200 rounded animate-pulse" />
            </div>
            <div className="h-8 w-16 bg-slate-200 rounded animate-pulse mx-auto" />
            <div className="h-3 w-20 bg-slate-200 rounded animate-pulse mx-auto mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
