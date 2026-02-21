'use client';

/**
 * TrendChart
 * 
 * Line chart showing performance trends over time.
 * Visualizes batting average with moving average overlay.
 */

import { useMemo, useState, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { BaseballPlayerStats } from '@/lib/types';

interface TrendChartProps {
  stats: BaseballPlayerStats[];
  className?: string;
}

type MetricKey = 'avg' | 'exitVelo' | 'obp';

interface ChartDataPoint {
  date: string;
  dateRaw: string;
  avg: number | null;
  exitVelo: number | null;
  obp: number | null;
  atBats: number;
  hits: number;
  walks: number;
  hbp: number;
  sf: number;
  type: string;
}

interface TooltipPayload {
  dataKey: string;
  value: number;
  color: string;
  name: string;
  payload: ChartDataPoint;
}

function CustomTooltip({ active, payload }: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="bg-white/90 backdrop-blur-xl border border-white/30 rounded-xl shadow-lg px-4 py-3 min-w-[160px]"
      >
        <p className="text-sm font-medium text-warm-900 mb-2">
          {new Date(data.dateRaw).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
        <div className="space-y-1.5">
          {payload.map((entry) => (
            <div key={entry.dataKey} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-xs text-warm-600">{entry.name}</span>
              </div>
              <span className="text-sm font-semibold text-warm-900">
                {entry.dataKey === 'exitVelo'
                  ? `${entry.value?.toFixed(1) ?? '—'} mph`
                  : entry.value?.toFixed(3) ?? '—'}
              </span>
            </div>
          ))}
          <div className="pt-1.5 mt-1.5 border-t border-warm-100">
            <p className="text-micro text-warm-400">
              {data.hits}/{data.atBats} ({data.type})
            </p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

const METRIC_CONFIG: Record<MetricKey, { label: string; color: string; format: (v: number) => string }> = {
  avg: { label: 'AVG', color: '#22c55e', format: (v) => v.toFixed(3) },
  exitVelo: { label: 'Exit Velo', color: '#3b82f6', format: (v) => `${v.toFixed(1)}` },
  obp: { label: 'OBP', color: '#f59e0b', format: (v) => v.toFixed(3) },
};

export function TrendChart({ stats, className }: TrendChartProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('avg');

  const chartData = useMemo(() => {
    // Sort by date ascending
    const sorted = [...stats].sort(
      (a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime()
    );

    return sorted.map(stat => {
      const plateAppearances = stat.at_bats + stat.walks + stat.hit_by_pitch + stat.sacrifice_flies;
      return {
        date: new Date(stat.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        dateRaw: stat.session_date,
        avg: stat.at_bats > 0 ? stat.hits / stat.at_bats : null,
        exitVelo: stat.exit_velocity,
        obp: plateAppearances > 0
          ? (stat.hits + stat.walks + stat.hit_by_pitch) / plateAppearances
          : null,
        atBats: stat.at_bats,
        hits: stat.hits,
        walks: stat.walks,
        hbp: stat.hit_by_pitch,
        sf: stat.sacrifice_flies,
        type: stat.stat_type,
      };
    });
  }, [stats]);

  // Calculate moving average (5-point)
  const dataWithMA = useMemo(() => {
    const windowSize = 5;
    return chartData.map((point, i) => {
      const start = Math.max(0, i - windowSize + 1);
      const slice = chartData.slice(start, i + 1);
      const values = slice
        .map(d => d[selectedMetric])
        .filter((v): v is number => v !== null);
      
      return {
        ...point,
        ma: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null,
      };
    });
  }, [chartData, selectedMetric]);

  const handleMetricChange = useCallback((metric: MetricKey) => {
    setSelectedMetric(metric);
  }, []);

  if (chartData.length === 0) {
    return (
      <div className={cn('glass-standard rounded-2xl p-8 text-center', className)}>
        <p className="text-warm-500">No trend data available yet.</p>
        <p className="text-sm text-warm-400 mt-1">
          Stats will appear here after sessions are logged.
        </p>
      </div>
    );
  }

  const config = METRIC_CONFIG[selectedMetric];

  return (
    <div className={cn('glass-standard rounded-2xl p-6', className)}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-warm-900">Performance Trend</h3>
          <p className="text-sm text-warm-500">Track progress over time</p>
        </div>
        <div className="flex gap-1 bg-warm-100 rounded-lg p-1" role="tablist" aria-label="Metric selection">
          {(Object.keys(METRIC_CONFIG) as MetricKey[]).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={selectedMetric === key}
              onClick={() => handleMetricChange(key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200',
                selectedMetric === key
                  ? 'bg-white text-warm-900 shadow-sm'
                  : 'text-warm-600 hover:text-warm-900'
              )}
            >
              {METRIC_CONFIG[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64" role="img" aria-label={`${config.label} trend chart`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={dataWithMA}
            margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e7e5e4"
              strokeOpacity={0.6}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#78716c' }}
              axisLine={{ stroke: '#d6d3d1' }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#78716c' }}
              axisLine={{ stroke: '#d6d3d1' }}
              tickLine={false}
              tickFormatter={(v: number) => config.format(v)}
              width={50}
              domain={selectedMetric === 'exitVelo' ? ['auto', 'auto'] : [0, 0.5]}
            />
            {selectedMetric !== 'exitVelo' && (
              <ReferenceLine
                y={0.300}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
            )}
            <Tooltip content={<CustomTooltip />} />
            {/* Moving average line */}
            <Line
              type="monotone"
              dataKey="ma"
              name={`${config.label} (5-MA)`}
              stroke={config.color}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              dot={false}
              connectNulls
            />
            {/* Main metric line */}
            <Line
              type="monotone"
              dataKey={selectedMetric}
              name={config.label}
              stroke={config.color}
              strokeWidth={2.5}
              dot={{
                r: 4,
                fill: config.color,
                stroke: '#fff',
                strokeWidth: 2,
              }}
              activeDot={{
                r: 6,
                fill: config.color,
                stroke: '#fff',
                strokeWidth: 2,
              }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: config.color }} />
          <span className="text-warm-600">{config.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="w-4 h-0.5 rounded-full"
            style={{ backgroundColor: config.color, opacity: 0.5 }}
          />
          <span className="text-warm-600">5-Session Moving Avg</span>
        </div>
        {selectedMetric !== 'exitVelo' && (
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-warm-400" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #94a3b8, #94a3b8 4px, transparent 4px, transparent 8px)' }} />
            <span className="text-warm-600">.300 Line</span>
          </div>
        )}
      </div>
    </div>
  );
}
