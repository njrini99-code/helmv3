'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { BaseballRosterPlayer } from '@/lib/types';
import { IconChevronDown, IconChevronUp } from '@/components/icons';

interface PlayerPerformanceGridProps {
  players: BaseballRosterPlayer[];
}

type MetricKey = 'avg' | 'obp' | 'slg' | 'ops' | 'exitVelo' | 'sessions';

interface MetricConfig {
  key: MetricKey;
  label: string;
  shortLabel: string;
  getValue: (p: BaseballRosterPlayer) => number | null;
  format: (v: number) => string;
  thresholds: { excellent: number; good: number; average: number };
  higherIsBetter: boolean;
}

const METRICS: MetricConfig[] = [
  {
    key: 'avg',
    label: 'Batting Average',
    shortLabel: 'AVG',
    getValue: (p) => p.aggregates?.career_avg ?? null,
    format: (v) => v.toFixed(3).replace(/^0\./, '.'),
    thresholds: { excellent: 0.32, good: 0.28, average: 0.24 },
    higherIsBetter: true,
  },
  {
    key: 'obp',
    label: 'On-Base Percentage',
    shortLabel: 'OBP',
    getValue: (p) => p.aggregates?.career_obp ?? null,
    format: (v) => v.toFixed(3).replace(/^0\./, '.'),
    thresholds: { excellent: 0.4, good: 0.35, average: 0.3 },
    higherIsBetter: true,
  },
  {
    key: 'slg',
    label: 'Slugging Percentage',
    shortLabel: 'SLG',
    getValue: (p) => p.aggregates?.career_slg ?? null,
    format: (v) => v.toFixed(3).replace(/^0\./, '.'),
    thresholds: { excellent: 0.5, good: 0.42, average: 0.35 },
    higherIsBetter: true,
  },
  {
    key: 'ops',
    label: 'OPS',
    shortLabel: 'OPS',
    getValue: (p) => {
      const obp = p.aggregates?.career_obp;
      const slg = p.aggregates?.career_slg;
      return obp != null && slg != null ? obp + slg : null;
    },
    format: (v) => v.toFixed(3),
    thresholds: { excellent: 0.9, good: 0.77, average: 0.65 },
    higherIsBetter: true,
  },
  {
    key: 'exitVelo',
    label: 'Avg Exit Velocity',
    shortLabel: 'EV',
    getValue: (p) => p.aggregates?.avg_exit_velocity ?? null,
    format: (v) => `${v.toFixed(1)}`,
    thresholds: { excellent: 88, good: 82, average: 75 },
    higherIsBetter: true,
  },
  {
    key: 'sessions',
    label: 'Total Sessions',
    shortLabel: 'GP',
    getValue: (p) => p.aggregates?.total_sessions ?? null,
    format: (v) => v.toString(),
    thresholds: { excellent: 20, good: 10, average: 5 },
    higherIsBetter: true,
  },
];

function getHeatmapColor(
  value: number | null,
  config: MetricConfig
): string {
  if (value == null) return 'bg-slate-100 text-slate-400';

  const { thresholds, higherIsBetter } = config;

  // Determine performance level
  let level: 'excellent' | 'good' | 'average' | 'below';
  if (higherIsBetter) {
    if (value >= thresholds.excellent) level = 'excellent';
    else if (value >= thresholds.good) level = 'good';
    else if (value >= thresholds.average) level = 'average';
    else level = 'below';
  } else {
    if (value <= thresholds.excellent) level = 'excellent';
    else if (value <= thresholds.good) level = 'good';
    else if (value <= thresholds.average) level = 'average';
    else level = 'below';
  }

  // Return Tailwind classes for heat map colors
  const colors: Record<string, string> = {
    excellent: 'bg-primary-500 text-white',
    good: 'bg-primary-200 text-primary-900',
    average: 'bg-amber-100 text-amber-800',
    below: 'bg-red-100 text-red-700',
  };

  return colors[level] ?? 'bg-slate-100 text-slate-600';
}

export function PlayerPerformanceGrid({ players }: PlayerPerformanceGridProps) {
  const [sortMetric, setSortMetric] = useState<MetricKey>('avg');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const sortedPlayers = useMemo(() => {
    const metric = METRICS.find((m) => m.key === sortMetric);
    if (!metric) return players;

    return [...players].sort((a, b) => {
      const aVal = metric.getValue(a) ?? (sortDirection === 'desc' ? -Infinity : Infinity);
      const bVal = metric.getValue(b) ?? (sortDirection === 'desc' ? -Infinity : Infinity);
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [players, sortMetric, sortDirection]);

  const handleSort = (key: MetricKey) => {
    if (sortMetric === key) {
      setSortDirection((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortMetric(key);
      setSortDirection('desc');
    }
  };

  if (players.length === 0) {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 mb-2">Performance Grid</h3>
        <p className="text-sm text-slate-500">
          No player data available.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl overflow-clip">
      <div className="p-4 border-b border-white/20">
        <h3 className="font-semibold text-slate-900">Performance Grid</h3>
        <p className="text-xs text-slate-500 mt-1">
          Click column headers to sort · Colors indicate performance level
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-4 py-3 text-left font-medium text-slate-600 sticky left-0 bg-slate-50/50">
                Player
              </th>
              {METRICS.map((metric) => (
                <th
                  key={metric.key}
                  className="px-3 py-3 text-center font-medium text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap"
                  onClick={() => handleSort(metric.key)}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>{metric.shortLabel}</span>
                    {sortMetric === metric.key && (
                      sortDirection === 'desc' ? (
                        <IconChevronDown size={14} />
                      ) : (
                        <IconChevronUp size={14} />
                      )
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.slice(0, 15).map((player) => {
              const name = `${player.first_name || ''} ${player.last_name || ''}`.trim();
              return (
                <tr
                  key={player.id}
                  className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors"
                >
                  <td className="px-4 py-2 sticky left-0 bg-white/50 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 truncate max-w-32">
                        {name}
                      </span>
                      {player.primary_position && (
                        <span className="text-xs text-slate-400">
                          {player.primary_position}
                        </span>
                      )}
                    </div>
                  </td>
                  {METRICS.map((metric) => {
                    const value = metric.getValue(player);
                    return (
                      <td key={metric.key} className="px-1 py-1 text-center">
                        <div
                          className={cn(
                            'px-2 py-1.5 rounded-md font-medium tabular-nums text-xs',
                            getHeatmapColor(value, metric)
                          )}
                        >
                          {value != null ? metric.format(value) : '—'}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {players.length > 15 && (
        <div className="p-3 text-center border-t border-slate-100">
          <p className="text-xs text-slate-400">
            Showing top 15 of {players.length} players
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/30">
        <div className="flex items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-primary-500" />
            <span className="text-slate-600">Excellent</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-primary-200" />
            <span className="text-slate-600">Good</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-amber-100" />
            <span className="text-slate-600">Average</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-red-100" />
            <span className="text-slate-600">Below Avg</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlayerPerformanceGridSkeleton() {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl overflow-clip">
      <div className="p-4 border-b border-white/20">
        <div className="h-5 w-32 bg-slate-200 rounded animate-pulse" />
        <div className="h-3 w-48 bg-slate-200 rounded animate-pulse mt-2" />
      </div>

      <div className="p-4">
        <div className="space-y-2">
          {/* Header */}
          <div className="flex gap-3">
            <div className="w-32 h-6 bg-slate-200 rounded animate-pulse" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-12 h-6 bg-slate-200 rounded animate-pulse" />
            ))}
          </div>
          {/* Rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-32 h-8 bg-slate-100 rounded animate-pulse" />
              {Array.from({ length: 6 }).map((_, j) => (
                <div key={j} className="w-12 h-8 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
