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
import { Skeleton } from '@/components/ui/skeleton-loader';
import { ShineEffect } from '@/components/ui/shine-effect';
import {
  IconChart,
  IconChevronRight,
} from '@/components/icons';
import type { TeamStatsTrendPoint } from '@/app/baseball/actions/team-dashboard';

interface TeamStatsChartProps {
  data: TeamStatsTrendPoint[];
  loading?: boolean;
}

type MetricKey = 'teamAvg' | 'exitVelo' | 'obp';

const metrics: { key: MetricKey; label: string; color: string; format: (v: number | null) => string }[] = [
  { key: 'teamAvg', label: 'Team AVG', color: '#3b82f6', format: (v) => v ? `.${(v * 1000).toFixed(0).padStart(3, '0')}` : '—' },
  { key: 'exitVelo', label: 'Exit Velo', color: '#10b981', format: (v) => v ? `${v.toFixed(1)} mph` : '—' },
  { key: 'obp', label: 'OBP', color: '#f59e0b', format: (v) => v ? `.${(v * 1000).toFixed(0).padStart(3, '0')}` : '—' },
];

function CustomTooltip({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-cream-50/95 backdrop-blur-sm border border-warm-200 rounded-lg shadow-lg p-3">
      <p className="text-xs text-warm-500 mb-2">{label}</p>
      {payload.map((entry) => {
        const metric = metrics.find(m => m.key === entry.dataKey);
        return (
          <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
            <div 
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-warm-600">{metric?.label}:</span>
            <span className="font-medium text-warm-900">
              {metric?.format(entry.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TeamStatsChart({ data, loading }: TeamStatsChartProps) {
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
          <Skeleton variant="rectangular" className="w-full h-48 rounded-lg" />
          <div className="grid grid-cols-4 gap-4 mt-4">
            {[1, 2, 3, 4].map(i => (
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

  return (
    <div className="lg:col-span-2 relative glass-standard rounded-2xl overflow-clip">
      <ShineEffect />
      
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center">
            <IconChart size={18} className="text-primary-600" />
          </div>
          <h2 className="font-semibold text-warm-900 tracking-tight">Team Performance</h2>
        </div>
        <Link 
          href="/baseball/dashboard/roster" 
          className="text-xs text-warm-500 hover:text-warm-900 flex items-center gap-1 transition-colors group"
        >
          Player Stats <IconChevronRight size={12} className="group-hover:tranwarm-x-0.5 transition-transform" />
        </Link>
      </div>

      <div className="p-6">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-12 h-12 rounded-xl bg-warm-100 flex items-center justify-center mb-3">
              <IconChart size={20} className="text-warm-400" />
            </div>
            <h4 className="text-sm font-medium text-warm-900 mb-1">No stats data yet</h4>
            <p className="text-xs text-warm-500 max-w-[200px]">
              Upload player stats to see team performance trends
            </p>
            <Link href="/baseball/dashboard/stats/upload">
              <button className="mt-4 px-4 py-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors">
                Upload Stats →
              </button>
            </Link>
          </div>
        ) : (
          <>
            {/* Metric toggles */}
            <div className="flex items-center gap-2 mb-4">
              {metrics.map(metric => (
                <button
                  key={metric.key}
                  onClick={() => toggleMetric(metric.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    visibleMetrics.has(metric.key)
                      ? 'bg-warm-900 text-white'
                      : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                  }`}
                >
                  <div 
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: metric.color }}
                  />
                  {metric.label}
                </button>
              ))}
            </div>

            {/* Chart */}
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="dateLabel" 
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis 
                    tick={{ fontSize: 11, fill: '#64748b' }}
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
