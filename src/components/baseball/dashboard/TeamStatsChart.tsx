'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TooltipContentProps } from 'recharts/types/component/Tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { ShineEffect } from '@/components/ui/shine-effect';
import {
  IconChart,
  IconChevronRight,
  IconAlertCircle,
  IconRefresh,
} from '@/components/icons';
import type { TeamStatsTrendPoint } from './dashboard-types';
import { Button } from '@/components/ui/button';

interface TeamStatsChartProps {
  data: TeamStatsTrendPoint[];
  loading?: boolean;
  /** Truthy when the dashboard hook failed. Renders the recoverable error face. */
  error?: boolean;
  /** Retry handler — typically the hook's `refetch`. */
  onRetry?: () => void;
}

/** Shared header so loading / error / empty / content read identically. */
function ChartHeader() {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100/50">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center">
          <IconChart size={18} className="text-primary-600" />
        </div>
        <h2 className="font-semibold text-warm-900 tracking-tight">Team Performance</h2>
      </div>
      <Link
        href="/baseball/dashboard/roster"
        className="text-xs text-warm-500 hover:text-warm-900 flex items-center gap-1 transition-colors group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        Player Stats
        <IconChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform motion-reduce:transition-none" />
      </Link>
    </div>
  );
}

type MetricKey = 'teamAvg' | 'exitVelo' | 'obp';

// Restricted, brand-aligned line palette — primary green is the lead metric,
// amber is the secondary accent, warm-stone is the tertiary. Keeps the chart on
// the same disciplined accent set as the Signals / Command Center surfaces
// (no arbitrary blue/teal categorical hues on the daily home).
const metrics: { key: MetricKey; label: string; color: string; format: (v: number | null) => string }[] = [
  { key: 'teamAvg', label: 'Team AVG', color: '#16A34A', format: (v) => v ? `.${(v * 1000).toFixed(0).padStart(3, '0')}` : '—' },
  { key: 'exitVelo', label: 'Exit Velo', color: '#f59e0b', format: (v) => v ? `${v.toFixed(1)} mph` : '—' },
  { key: 'obp', label: 'OBP', color: '#a8a29e', format: (v) => v ? `.${(v * 1000).toFixed(0).padStart(3, '0')}` : '—' },
];

function CustomTooltip({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-cream-50/95 backdrop-blur-sm border border-warm-200 rounded-xl shadow-glass p-3">
      <p className="text-xs text-warm-500 mb-2">{label}</p>
      {payload.map((entry) => {
        const metric = metrics.find(m => m.key === entry.dataKey);
        return (
          <div key={String(entry.dataKey)} className="flex items-center gap-2 text-sm">
            <div 
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-warm-600">{metric?.label}:</span>
            <span className="font-medium text-warm-900">
              {metric?.format(entry.value as number)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TeamStatsChart({ data, loading, error, onRetry }: TeamStatsChartProps) {
  const [visibleMetrics, setVisibleMetrics] = useState<Set<MetricKey>>(
    new Set(['teamAvg', 'exitVelo'])
  );

  const toggleMetric = (key: MetricKey) => {
    setVisibleMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Format dates for display
  const chartData = data.map(point => ({
    ...point,
    dateLabel: new Date(point.date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    }),
  }));

  // Calculate summary stats
  const latestStats = data.length > 0 ? data[data.length - 1] : null;
  // avgTeamAvg could be used for additional stats display
  const _avgTeamAvg = data.length > 0
    ? data.reduce((sum, p) => sum + (p.teamAvg || 0), 0) / data.filter(p => p.teamAvg).length
    : null;
  void _avgTeamAvg; // Intentionally unused for now

  if (loading) {
    return (
      <div className="lg:col-span-2 relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100/50">
          <div className="flex items-center gap-3">
            <Skeleton variant="rectangular" width={36} height={36} className="rounded-lg" />
            <Skeleton variant="text" width={180} height={20} />
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            {[0, 1, 2].map(i => (
              <Skeleton key={i} variant="rectangular" width={88} height={30} className="rounded-full" />
            ))}
          </div>
          <Skeleton variant="rectangular" className="w-full h-48 rounded-lg" />
          <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-warm-100">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="text-center">
                <Skeleton variant="text" width={40} height={24} className="mx-auto mb-1" />
                <Skeleton variant="text" width={50} height={12} className="mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lg:col-span-2 relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <ChartHeader />
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col items-center justify-center h-64 px-6 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mb-3">
            <IconAlertCircle size={22} className="text-destructive" />
          </div>
          <h4 className="text-sm font-medium text-warm-900 mb-1">Couldn&apos;t load performance trends</h4>
          <p className="text-xs text-warm-500 max-w-[260px] mb-3">
            This is usually temporary — your stats are safe. Try again in a moment.
          </p>
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry} leftIcon={<IconRefresh size={14} />}>
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="lg:col-span-2 relative glass-standard rounded-2xl overflow-clip">
      <ShineEffect />

      {/* Header */}
      <ChartHeader />

      <div className="p-6">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-12 h-12 rounded-xl bg-warm-100 flex items-center justify-center mb-3">
              <IconChart size={20} className="text-warm-400" aria-hidden="true" />
            </div>
            <h4 className="text-sm font-medium text-warm-900 mb-1">No stats data yet</h4>
            <p className="text-xs text-warm-500 max-w-[220px] mb-4">
              Upload player stats to see team performance trends.
            </p>
            <Link href="/baseball/dashboard/stats/upload">
              <Button variant="secondary" size="sm">
                Upload Stats
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Metric toggles — true pill filter chips. Native <button> (not the
                Button primitive, whose 44px min-height would balloon the chips),
                with aria-pressed for toggle semantics + a real focus ring. */}
            <div className="flex flex-wrap items-center gap-2 mb-4" role="group" aria-label="Toggle chart metrics">
              {metrics.map(metric => {
                const active = visibleMetrics.has(metric.key);
                return (
                  // eslint-disable-next-line helm/no-raw-button -- compact filter chip: the Button primitive's 44px min-height would balloon the pill; native button keeps aria-pressed + focus-ring.
                  <button
                    type="button"
                    key={metric.key}
                    onClick={() => toggleMetric(metric.key)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                      active
                        ? 'bg-warm-900 text-white'
                        : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: metric.color }}
                      aria-hidden="true"
                    />
                    {metric.label}
                  </button>
                );
              })}
            </div>

            {/* Chart */}
            <div
              className="h-48"
              role="img"
              aria-label={`Team performance trend across ${data.length} session${data.length === 1 ? '' : 's'}, showing ${metrics
                .filter(mt => visibleMetrics.has(mt.key))
                .map(mt => mt.label)
                .join(', ')}.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  {/* Warm-stone grid + axis tokens (warm-200 / warm-500) so the
                      chart never drops a cool-slate gray onto the cream surface. */}
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 11, fill: '#78716c' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e7e5e4' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#78716c' }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  {metrics.map(metric => (
                    visibleMetrics.has(metric.key) && (
                      <Line
                        key={metric.key}
                        type="monotone"
                        dataKey={metric.key}
                        stroke={metric.color}
                        strokeWidth={2}
                        dot={{ r: 3, fill: metric.color }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                    )
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-warm-100">
              <div className="text-center">
                <p className="text-lg font-semibold text-warm-900 tabular-nums">
                  {latestStats?.teamAvg ? `.${(latestStats.teamAvg * 1000).toFixed(0).padStart(3, '0')}` : '—'}
                </p>
                <p className="text-xs text-warm-500">Team AVG</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-warm-900 tabular-nums">
                  {latestStats?.exitVelo?.toFixed(1) || '—'}
                </p>
                <p className="text-xs text-warm-500">Exit Velo</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-warm-900 tabular-nums">
                  {latestStats?.obp ? `.${(latestStats.obp * 1000).toFixed(0).padStart(3, '0')}` : '—'}
                </p>
                <p className="text-xs text-warm-500">OBP</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-warm-900 tabular-nums">{data.length}</p>
                <p className="text-xs text-warm-500">Sessions</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
