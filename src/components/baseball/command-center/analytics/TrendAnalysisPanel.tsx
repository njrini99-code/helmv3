'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { BaseballRosterPlayer } from '@/lib/types';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconChevronRight,
  IconBolt,
  IconAlertCircle,
} from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';

interface TrendAnalysisPanelProps {
  players: BaseballRosterPlayer[];
}

interface TrendPlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
  position: string | null;
  trend: 'improving' | 'stable' | 'declining';
  trendMagnitude: number;
  careerAvg: number | null;
  last5Avg: number | null;
  last10Avg: number | null;
  sessions: number;
}

function formatAvg(value: number | null): string {
  if (value == null) return '—';
  return value.toFixed(3).replace(/^0\./, '.');
}

function formatChange(current: number | null, previous: number | null): string {
  if (current == null || previous == null) return '';
  const diff = (current - previous) * 1000;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(0)} pts`;
}

export function TrendAnalysisPanel({ players }: TrendAnalysisPanelProps) {
  const trendData = useMemo(() => {
    const playersWithTrends = players.filter(
      (p) => p.aggregates?.recent_trend != null
    );

    const data: TrendPlayer[] = playersWithTrends.map((p) => ({
      id: p.id,
      name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      avatarUrl: p.avatar_url,
      position: p.primary_position,
      trend: p.aggregates!.recent_trend!,
      trendMagnitude: p.aggregates!.trend_magnitude ?? 0,
      careerAvg: p.aggregates!.career_avg,
      last5Avg: p.aggregates!.last_5_avg,
      last10Avg: p.aggregates!.last_10_avg,
      sessions: p.aggregates!.total_sessions || 0,
    }));

    // Sort by magnitude (biggest changes first)
    data.sort((a, b) => Math.abs(b.trendMagnitude) - Math.abs(a.trendMagnitude));

    return {
      all: data,
      improving: data.filter((p) => p.trend === 'improving'),
      declining: data.filter((p) => p.trend === 'declining'),
      stable: data.filter((p) => p.trend === 'stable'),
    };
  }, [players]);

  const summary = useMemo(() => {
    return {
      improvingCount: trendData.improving.length,
      decliningCount: trendData.declining.length,
      stableCount: trendData.stable.length,
      hottest: trendData.improving[0],
      coldest: trendData.declining[0],
    };
  }, [trendData]);

  if (trendData.all.length === 0) {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 mb-2">Trend Analysis</h3>
        <p className="text-sm text-slate-500">
          Need more session data to analyze player trends. Keep tracking
          performance!
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
      <h3 className="font-semibold text-slate-900 mb-4">Trend Analysis</h3>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-primary-50 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <IconTrendingUp size={16} className="text-primary-600" />
            <span className="text-xs font-medium text-primary-700">Rising</span>
          </div>
          <p className="text-2xl font-bold text-primary-600">
            {summary.improvingCount}
          </p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <IconMinus size={16} className="text-slate-500" />
            <span className="text-xs font-medium text-slate-600">Steady</span>
          </div>
          <p className="text-2xl font-bold text-slate-600">
            {summary.stableCount}
          </p>
        </div>
        <div className="bg-red-50 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <IconTrendingDown size={16} className="text-red-500" />
            <span className="text-xs font-medium text-red-600">Falling</span>
          </div>
          <p className="text-2xl font-bold text-red-500">
            {summary.decliningCount}
          </p>
        </div>
      </div>

      {/* Hottest & Coldest Highlights */}
      {(summary.hottest || summary.coldest) && (
        <div className="space-y-3 mb-6">
          {summary.hottest && (
            <div className="flex items-center gap-3 p-3 bg-primary-50 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                <IconBolt size={20} className="text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-primary-600 uppercase">
                    Hottest
                  </span>
                </div>
                <p className="font-medium text-slate-900 truncate">
                  {summary.hottest.name}
                </p>
                <p className="text-xs text-slate-500">
                  {formatAvg(summary.hottest.last5Avg)} last 5 games
                  <span className="text-primary-600 ml-1">
                    {formatChange(
                      summary.hottest.last5Avg,
                      summary.hottest.careerAvg
                    )}
                  </span>
                </p>
              </div>
              <Link
                href={`/baseball/dashboard/players/${summary.hottest.id}`}
                className="text-primary-600 hover:text-primary-700"
              >
                <IconChevronRight size={20} />
              </Link>
            </div>
          )}

          {summary.coldest && (
            <div className="flex items-center gap-3 p-3 bg-red-50 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <IconAlertCircle size={20} className="text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-red-500 uppercase">
                    Needs Attention
                  </span>
                </div>
                <p className="font-medium text-slate-900 truncate">
                  {summary.coldest.name}
                </p>
                <p className="text-xs text-slate-500">
                  {formatAvg(summary.coldest.last5Avg)} last 5 games
                  <span className="text-red-500 ml-1">
                    {formatChange(
                      summary.coldest.last5Avg,
                      summary.coldest.careerAvg
                    )}
                  </span>
                </p>
              </div>
              <Link
                href={`/baseball/dashboard/players/${summary.coldest.id}`}
                className="text-red-500 hover:text-red-600"
              >
                <IconChevronRight size={20} />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Player Trend List */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          All Players by Trend
        </h4>

        <div className="max-h-64 overflow-y-auto space-y-1.5">
          {trendData.all.slice(0, 10).map((player) => (
            <Link
              key={player.id}
              href={`/baseball/dashboard/players/${player.id}`}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors group"
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
                <p className="text-xs text-slate-500">
                  {formatAvg(player.careerAvg)} career · {player.sessions} games
                </p>
              </div>

              <div className="flex items-center gap-2">
                {player.trend === 'improving' ? (
                  <div className="flex items-center gap-1 text-primary-600">
                    <IconTrendingUp size={14} />
                    <span className="text-xs font-medium">
                      +{(player.trendMagnitude * 100).toFixed(1)}%
                    </span>
                  </div>
                ) : player.trend === 'declining' ? (
                  <div className="flex items-center gap-1 text-red-500">
                    <IconTrendingDown size={14} />
                    <span className="text-xs font-medium">
                      {(player.trendMagnitude * 100).toFixed(1)}%
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-slate-400">
                    <IconMinus size={14} />
                    <span className="text-xs font-medium">Stable</span>
                  </div>
                )}

                <IconChevronRight
                  size={16}
                  className="text-slate-300 group-hover:text-slate-500 transition-colors"
                />
              </div>
            </Link>
          ))}
        </div>

        {trendData.all.length > 10 && (
          <p className="text-xs text-slate-400 text-center pt-2">
            +{trendData.all.length - 10} more players
          </p>
        )}
      </div>
    </div>
  );
}

export function TrendAnalysisPanelSkeleton() {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
      <div className="h-5 w-32 bg-slate-200 rounded animate-pulse mb-4" />

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-slate-50 rounded-xl p-3 text-center">
            <div className="h-4 w-12 bg-slate-200 rounded animate-pulse mx-auto mb-2" />
            <div className="h-8 w-8 bg-slate-200 rounded animate-pulse mx-auto" />
          </div>
        ))}
      </div>

      {/* Highlights */}
      <div className="space-y-3 mb-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-slate-200 animate-pulse" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-16 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
              <div className="h-3 w-32 bg-slate-200 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <div className="w-8 h-8 rounded-full bg-slate-200 animate-pulse" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
              <div className="h-3 w-32 bg-slate-200 rounded animate-pulse" />
            </div>
            <div className="h-4 w-16 bg-slate-200 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
