'use client';

/**
 * Trend Line Chart
 *
 * Visualizes metric trends over time with:
 * - Line graph with data points
 * - Moving average overlay
 * - Prediction visualization
 * - Interactive tooltips
 */

import { useMemo, useState, useCallback } from 'react';
import type { TrendPoint, TrendAnalysis, TrendDirection } from '@/lib/types/golf';
import { cn } from '@/lib/utils';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

interface TrendLineChartProps {
  data: TrendPoint[];
  analysis?: TrendAnalysis;
  title?: string;
  metric: string;
  color?: string;
  height?: number;
  showPrediction?: boolean;
  showMovingAverage?: boolean;
  isHigherBetter?: boolean;
  formatValue?: (value: number) => string;
  className?: string;
}

export function TrendLineChart({
  data,
  analysis,
  title,
   
  metric: _metric, // prefixed to indicate intentionally unused
  color = '#22c55e',
  height = 200,
  showPrediction = true,
  showMovingAverage = true,
  isHigherBetter = false,
  formatValue = (v) => v.toFixed(1),
  className,
}: TrendLineChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<TrendPoint | null>(null);

  // Sort data by date
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data]);

  // Calculate moving average (5-point)
  const movingAverages = useMemo(() => {
    const window = 5;
    return sortedData.map((_, i) => {
      const start = Math.max(0, i - window + 1);
      const slice = sortedData.slice(start, i + 1);
      return slice.reduce((sum, d) => sum + d.value, 0) / slice.length;
    });
  }, [sortedData]);

  // Calculate chart dimensions
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const width = 600;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate value range with padding
  const values = sortedData.map(d => d.value);
  const minValue = sortedData.length > 0 ? Math.min(...values) : 0;
  const maxValue = sortedData.length > 0 ? Math.max(...values) : 1;
  const valueRange = maxValue - minValue || 1;
  const valuePadding = valueRange * 0.1;
  const yMin = minValue - valuePadding;
  const yMax = maxValue + valuePadding;

  // Generate Y-axis ticks
  const yTicks = useMemo(() => {
    const tickCount = 5;
    const ticks = [];
    for (let i = 0; i <= tickCount; i++) {
      const value = yMin + (i / tickCount) * (yMax - yMin);
      const y = padding.top + chartHeight - ((value - yMin) / (yMax - yMin)) * chartHeight;
      ticks.push({ value, y });
    }
    return ticks;
  }, [yMin, yMax, padding.top, chartHeight]);

  if (sortedData.length === 0) {
    return (
      <div className={cn('flex items-center justify-center bg-warm-50 rounded-lg', className)} style={{ height }}>
        <p className="text-warm-500 text-sm">No data available</p>
      </div>
    );
  }

  // Scale functions
  const xScale = (i: number) => padding.left + (i / (sortedData.length - 1 || 1)) * chartWidth;
  const yScale = (v: number) => padding.top + chartHeight - ((v - yMin) / (yMax - yMin)) * chartHeight;

  // Generate line path
  const linePath = sortedData
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)},${yScale(d.value)}`)
    .join(' ');

  // Generate area path for fill
  const areaPath = `${linePath} L ${xScale(sortedData.length - 1)},${yScale(yMin)} L ${xScale(0)},${yScale(yMin)} Z`;

  const maLinePath = movingAverages
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)},${yScale(v)}`)
    .join(' ');

  // Generate prediction point (using last data point's value as fallback since TrendAnalysis doesn't have prediction)
  const lastDataPoint = sortedData.length > 0 ? sortedData[sortedData.length - 1] : null;
  const predictionValue = analysis && lastDataPoint
    ? lastDataPoint.value + (analysis.changePercent / 100 * lastDataPoint.value)
    : null;
  const predictionPoint = analysis && showPrediction && predictionValue !== null
    ? {
        x: xScale(sortedData.length),
        y: yScale(predictionValue),
        value: predictionValue,
      }
    : null;

  // Get trend indicator
  const getTrendIndicator = (trend?: TrendDirection) => {
    if (!trend) return null;
    const isGood = isHigherBetter
      ? trend === 'improving'
      : trend === 'improving';

    return {
      icon: trend === 'improving' ? '↑' : trend === 'declining' ? '↓' : '→',
      color: trend === 'stable' ? 'text-warm-500' : isGood ? 'text-primary-500' : 'text-red-500',
      label: trend.charAt(0).toUpperCase() + trend.slice(1),
    };
  };

  const trendIndicator = getTrendIndicator(analysis?.direction);

  return (
    <div className={cn('', className)}>
      {/* Header */}
      {title && (
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-warm-900">{title}</h3>
          {trendIndicator && (
            <div className={cn('flex items-center gap-1 text-sm', trendIndicator.color)}>
              <span>{trendIndicator.icon}</span>
              <span>{trendIndicator.label}</span>
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="overflow-visible"
      >
        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              y1={tick.y}
              x2={width - padding.right}
              y2={tick.y}
              stroke="#e7e5e4"
              strokeWidth={1}
            />
            <text
              x={padding.left - 8}
              y={tick.y}
              textAnchor="end"
              dominantBaseline="middle"
              className="text-xs fill-warm-500"
            >
              {formatValue(tick.value)}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path
          d={areaPath}
          fill={color}
          fillOpacity={0.1}
        />

        {/* Moving average line */}
        {showMovingAverage && sortedData.length >= 5 && (
          <path
            d={maLinePath}
            fill="none"
            stroke="#94a3b8"
            strokeWidth={2}
            strokeDasharray="4,4"
            opacity={0.8}
          />
        )}

        {/* Main line */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {sortedData.map((point, i) => (
          <g key={i}>
            <circle
              cx={xScale(i)}
              cy={yScale(point.value)}
              r={hoveredPoint === point ? 6 : 4}
              fill={color}
              stroke="white"
              strokeWidth={2}
              className="cursor-pointer transition-all duration-150"
              onMouseEnter={() => setHoveredPoint(point)}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          </g>
        ))}

        {/* Prediction point */}
        {predictionPoint && sortedData.length > 0 && (
          <g>
            <line
              x1={xScale(sortedData.length - 1)}
              y1={yScale(sortedData[sortedData.length - 1]!.value)}
              x2={predictionPoint.x}
              y2={predictionPoint.y}
              stroke={color}
              strokeWidth={2}
              strokeDasharray="4,4"
              opacity={0.5}
            />
            <circle
              cx={predictionPoint.x}
              cy={predictionPoint.y}
              r={5}
              fill="white"
              stroke={color}
              strokeWidth={2}
              strokeDasharray="2,2"
            />
            <text
              x={predictionPoint.x + 8}
              y={predictionPoint.y}
              className="text-xs fill-warm-500"
              dominantBaseline="middle"
            >
              Predicted
            </text>
          </g>
        )}

        {/* X-axis labels */}
        {sortedData.map((point, i) => {
          // Only show every few labels to prevent crowding
          const showLabel = sortedData.length <= 10 || i % Math.ceil(sortedData.length / 8) === 0;
          if (!showLabel) return null;

          const date = new Date(point.date);
          const label = `${date.getMonth() + 1}/${date.getDate()}`;

          return (
            <text
              key={i}
              x={xScale(i)}
              y={height - padding.bottom + 20}
              textAnchor="middle"
              className="text-xs fill-warm-500"
            >
              {label}
            </text>
          );
        })}

        {/* Tooltip */}
        {hoveredPoint && (
          <g>
            <rect
              x={xScale(sortedData.indexOf(hoveredPoint)) - 60}
              y={yScale(hoveredPoint.value) - 45}
              width={120}
              height={40}
              rx={4}
              fill="white"
              stroke="#e7e5e4"
              strokeWidth={1}
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
            />
            <text
              x={xScale(sortedData.indexOf(hoveredPoint))}
              y={yScale(hoveredPoint.value) - 30}
              textAnchor="middle"
              className="text-sm font-semibold fill-warm-900"
            >
              {formatValue(hoveredPoint.value)}
            </text>
            <text
              x={xScale(sortedData.indexOf(hoveredPoint))}
              y={yScale(hoveredPoint.value) - 14}
              textAnchor="middle"
              className="text-xs fill-warm-500"
            >
              {new Date(hoveredPoint.date).toLocaleDateString()}
            </text>
          </g>
        )}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-xs text-warm-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5" style={{ backgroundColor: color }} />
          <span>Actual</span>
        </div>
        {showMovingAverage && sortedData.length >= 5 && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-warm-400" style={{ borderTop: '2px dashed #94a3b8' }} />
            <span>5-Round Moving Avg</span>
          </div>
        )}
        {showPrediction && analysis && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full border-2" style={{ borderColor: color }} />
            <span>Predicted</span>
          </div>
        )}
      </div>

      {/* Analysis summary */}
      {analysis && sortedData.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-warm-50 rounded p-2">
            <div className="text-warm-500">Current</div>
            <div className="font-semibold text-warm-900">{formatValue(sortedData[sortedData.length - 1]!.value)}</div>
          </div>
          <div className="bg-warm-50 rounded p-2">
            <div className="text-warm-500">Best</div>
            <div className="font-semibold text-primary-600">{formatValue(Math.min(...sortedData.map(d => d.value)))}</div>
          </div>
          <div className="bg-warm-50 rounded p-2">
            <div className="text-warm-500">Change</div>
            <div className="font-semibold text-warm-900">{analysis.changePercent >= 0 ? '+' : ''}{analysis.changePercent.toFixed(1)}%</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scale Group Detection ──────────────────────────────────────────────────
// Metrics are grouped into separate Y-axes when their value ranges differ
// significantly. This avoids squishing percentage lines (0-100) against
// stroke-count lines (60-90) on the same axis.

interface MetricConfig {
  key: string;
  label: string;
  data: TrendPoint[];
  color: string;
  formatValue?: (value: number) => string;
  yAxisId?: string;
}

interface MultiTrendLineChartProps {
  metrics: MetricConfig[];
  height?: number;
  title?: string;
  showMovingAverage?: boolean;
  className?: string;
}

/**
 * Determines whether two value ranges are similar enough to share an axis.
 * Returns true if the ranges overlap substantially or are within 3x of each other.
 */
function rangesAreCompatible(
  minA: number, maxA: number,
  minB: number, maxB: number,
): boolean {
  const rangeA = maxA - minA || 1;
  const rangeB = maxB - minB || 1;
  const ratio = rangeA > rangeB ? rangeA / rangeB : rangeB / rangeA;

  // If scales differ by more than 3x, they need separate axes
  if (ratio > 3) return false;

  // If value magnitudes are wildly different, separate them
  const midA = (minA + maxA) / 2;
  const midB = (minB + maxB) / 2;
  const midRatio = Math.abs(midA) > Math.abs(midB)
    ? Math.abs(midA) / (Math.abs(midB) || 1)
    : Math.abs(midB) / (Math.abs(midA) || 1);
  if (midRatio > 5) return false;

  return true;
}

/**
 * Groups metrics into axis groups based on value range compatibility.
 * Returns a map of axisId -> metric keys.
 */
function assignAxisGroups(
  metrics: MetricConfig[],
): Map<string, { keys: string[]; min: number; max: number }> {
  const groups = new Map<string, { keys: string[]; min: number; max: number }>();

  for (const metric of metrics) {
    if (metric.data.length === 0) continue;

    const values = metric.data.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);

    // If metric has an explicit yAxisId, use that
    if (metric.yAxisId) {
      const existing = groups.get(metric.yAxisId);
      if (existing) {
        existing.keys.push(metric.key);
        existing.min = Math.min(existing.min, min);
        existing.max = Math.max(existing.max, max);
      } else {
        groups.set(metric.yAxisId, { keys: [metric.key], min, max });
      }
      continue;
    }

    // Try to find a compatible group
    let assigned = false;
    for (const [, group] of groups) {
      if (rangesAreCompatible(group.min, group.max, min, max)) {
        group.keys.push(metric.key);
        group.min = Math.min(group.min, min);
        group.max = Math.max(group.max, max);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      const newId = `y-axis-${groups.size}`;
      groups.set(newId, { keys: [metric.key], min, max });
    }
  }

  return groups;
}

// ─── Unified Tooltip ────────────────────────────────────────────────────────

interface MultiTooltipPayloadEntry {
  color: string;
  name: string;
  value: number;
  dataKey: string;
}

function MultiChartTooltip({
  active,
  payload,
  label,
  formatters,
}: {
  active?: boolean;
  payload?: MultiTooltipPayloadEntry[];
  label?: string;
  formatters: Record<string, (v: number) => string>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const dateStr = label
    ? new Date(label).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="bg-white/90 backdrop-blur-xl border border-white/30 rounded-xl shadow-lg px-3 py-2.5 min-w-[160px]"
    >
      <p className="text-xs text-warm-500 font-medium mb-1.5">{dateStr}</p>
      <div className="space-y-1">
        {payload.map((entry) => {
          const formatter = formatters[entry.dataKey] ?? ((v: number) => v.toFixed(1));
          return (
            <div key={entry.dataKey} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-xs text-warm-700">{entry.name}</span>
              </div>
              <span className="text-xs font-semibold text-warm-900">
                {formatter(entry.value)}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Interactive Legend ──────────────────────────────────────────────────────

function MultiChartLegend({
  items,
  hiddenKeys,
  onToggle,
}: {
  items: { key: string; label: string; color: string }[];
  hiddenKeys: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-3">
      {items.map((item) => {
        const isHidden = hiddenKeys.has(item.key);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onToggle(item.key)}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all duration-200',
              isHidden
                ? 'opacity-40 hover:opacity-60'
                : 'opacity-100 hover:bg-warm-50 active:bg-warm-100'
            )}
          >
            <span
              className="w-3 h-[3px] rounded-full flex-shrink-0 transition-opacity duration-200"
              style={{
                backgroundColor: item.color,
                opacity: isHidden ? 0.3 : 1,
              }}
            />
            <span className={cn(
              'text-warm-700 select-none',
              isHidden && 'line-through text-warm-400'
            )}>
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Multi-Line Chart ───────────────────────────────────────────────────────

/**
 * MultiTrendLineChart
 *
 * Full multi-line chart with:
 * - Shared X-axis (dates/rounds)
 * - Multiple Y-axes when metrics have different scales (auto-detected)
 * - Unified tooltip showing all metrics at the hovered point
 * - Color-coded lines matching the design system
 * - Interactive legend with toggle visibility
 * - Smooth animations via framer-motion
 */
export function MultiTrendLineChart({
  metrics,
  height = 250,
  title,
  showMovingAverage = false,
  className,
}: MultiTrendLineChartProps) {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  const toggleMetric = useCallback((key: string) => {
    setHiddenKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        // Don't allow hiding all metrics
        const visibleCount = metrics.length - next.size;
        if (visibleCount > 1) {
          next.add(key);
        }
      }
      return next;
    });
  }, [metrics.length]);

  // Sort each metric's data and build unified date-keyed dataset
  const { chartData, sortedMetrics } = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>();
    const sorted: typeof metrics = [];

    for (const m of metrics) {
      const mSorted = [...m.data].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      sorted.push({ ...m, data: mSorted });

      for (const point of mSorted) {
        const existing = dateMap.get(point.date) ?? {};
        existing[m.key] = point.value;
        dateMap.set(point.date, existing);
      }
    }

    // Sort dates chronologically
    const dates = Array.from(dateMap.keys()).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    // Build chart rows with moving averages if requested
    const rows = dates.map(date => {
      const row: Record<string, number | string> = { date };
      const values = dateMap.get(date)!;
      for (const key of Object.keys(values)) {
        row[key] = values[key]!;
      }
      return row;
    });

    // Calculate moving averages per metric
    if (showMovingAverage) {
      const windowSize = 5;
      for (const m of sorted) {
        const maKey = `${m.key}_ma`;
        // For each date, compute MA from that metric's values up to this date
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]!;
          if (row[m.key] === undefined) continue;

          // Collect the last windowSize values of this metric
          const lookback: number[] = [];
          let count = 0;
          for (let j = i; j >= 0 && count < windowSize; j--) {
            const val = rows[j]![m.key];
            if (val !== undefined && typeof val === 'number') {
              lookback.push(val);
              count++;
            }
          }
          if (lookback.length >= 3) {
            row[maKey] = lookback.reduce((a, b) => a + b, 0) / lookback.length;
          }
        }
      }
    }

    return { chartData: rows, sortedMetrics: sorted, allDates: dates };
  }, [metrics, showMovingAverage]);

  // Determine axis groups
  const axisGroups = useMemo(() => assignAxisGroups(sortedMetrics), [sortedMetrics]);

  // Build a map from metric key -> axisId
  const metricToAxis = useMemo(() => {
    const map = new Map<string, string>();
    for (const [axisId, group] of axisGroups) {
      for (const key of group.keys) {
        map.set(key, axisId);
      }
    }
    return map;
  }, [axisGroups]);

  // Build formatters map for tooltip
  const formatters = useMemo(() => {
    const fmap: Record<string, (v: number) => string> = {};
    for (const m of sortedMetrics) {
      fmap[m.key] = m.formatValue ?? ((v: number) => v.toFixed(1));
    }
    return fmap;
  }, [sortedMetrics]);

  // Axis IDs sorted for consistent ordering (left first, then right)
  const axisIds = useMemo(() => Array.from(axisGroups.keys()), [axisGroups]);
  const hasMultipleAxes = axisIds.length > 1;

  // Empty state
  if (chartData.length === 0 || sortedMetrics.length === 0) {
    return (
      <div
        className={cn('flex items-center justify-center bg-warm-50 rounded-xl', className)}
        style={{ height }}
      >
        <p className="text-warm-500 text-sm">No data available for comparison</p>
      </div>
    );
  }

  // Format X-axis date labels
  const formatXAxis = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn('', className)}
    >
      {/* Header */}
      {title && (
        <h3 className="font-semibold text-warm-900 mb-3">{title}</h3>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={chartData}
          margin={{ top: 8, right: hasMultipleAxes ? 60 : 20, bottom: 4, left: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#e7e5e4"
            strokeOpacity={0.6}
            vertical={false}
          />

          {/* Shared X axis */}
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxis}
            tick={{ fontSize: 11, fill: '#78716c' }}
            axisLine={{ stroke: '#d6d3d1' }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={40}
          />

          {/* Y axes */}
          {axisIds.map((axisId, idx) => {
            const group = axisGroups.get(axisId)!;
            // Find the first visible metric in this group for formatting
            const representativeMetric = sortedMetrics.find(
              m => group.keys.includes(m.key) && !hiddenKeys.has(m.key)
            ) ?? sortedMetrics.find(m => group.keys.includes(m.key));
            const formatter = representativeMetric?.formatValue ?? ((v: number) => v.toFixed(1));

            return (
              <YAxis
                key={axisId}
                yAxisId={axisId}
                orientation={idx === 0 ? 'left' : 'right'}
                tick={{ fontSize: 11, fill: '#78716c' }}
                axisLine={{ stroke: '#d6d3d1' }}
                tickLine={false}
                tickFormatter={(v: number) => formatter(v)}
                domain={['auto', 'auto']}
                width={50}
              />
            );
          })}

          {/* Zero reference line for strokes-gained-like data */}
          {axisIds.map((axisId) => {
            const group = axisGroups.get(axisId)!;
            const crossesZero = group.min < 0 && group.max > 0;
            if (!crossesZero) return null;
            return (
              <ReferenceLine
                key={`ref-${axisId}`}
                yAxisId={axisId}
                y={0}
                stroke="#a8a29e"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
            );
          })}

          {/* Unified tooltip */}
          <RechartsTooltip
            content={({ active, payload, label }) => (
              <AnimatePresence>
                {active && (
                  <MultiChartTooltip
                    active={active}
                    payload={payload as MultiTooltipPayloadEntry[]}
                    label={label as string}
                    formatters={formatters}
                  />
                )}
              </AnimatePresence>
            )}
            cursor={{
              stroke: '#a8a29e',
              strokeWidth: 1,
              strokeDasharray: '4 4',
            }}
          />

          {/* Metric lines */}
          {sortedMetrics.map((m) => {
            const axisId = metricToAxis.get(m.key) ?? axisIds[0]!;
            const isHidden = hiddenKeys.has(m.key);
            return (
              <Line
                key={m.key}
                type="monotone"
                dataKey={m.key}
                yAxisId={axisId}
                name={m.label}
                stroke={m.color}
                strokeWidth={2.5}
                dot={{
                  r: 3,
                  fill: m.color,
                  stroke: '#fff',
                  strokeWidth: 2,
                }}
                activeDot={{
                  r: 5,
                  fill: m.color,
                  stroke: '#fff',
                  strokeWidth: 2,
                }}
                hide={isHidden}
                connectNulls
                animationDuration={600}
                animationEasing="ease-out"
              />
            );
          })}

          {/* Moving average lines */}
          {showMovingAverage && sortedMetrics.map((m) => {
            const maKey = `${m.key}_ma`;
            const axisId = metricToAxis.get(m.key) ?? axisIds[0]!;
            const isHidden = hiddenKeys.has(m.key);
            // Only render if we have MA data
            const hasMA = chartData.some(row => row[maKey] !== undefined);
            if (!hasMA) return null;
            return (
              <Line
                key={maKey}
                type="monotone"
                dataKey={maKey}
                yAxisId={axisId}
                name={`${m.label} (MA)`}
                stroke={m.color}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                dot={false}
                activeDot={false}
                hide={isHidden}
                connectNulls
                animationDuration={600}
                legendType="none"
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      {/* Interactive Legend */}
      <MultiChartLegend
        items={sortedMetrics.map(m => ({
          key: m.key,
          label: m.label,
          color: m.color,
        }))}
        hiddenKeys={hiddenKeys}
        onToggle={toggleMetric}
      />

      {/* Axis labels when multiple axes are present */}
      {hasMultipleAxes && (
        <div className="flex items-center justify-between mt-1 px-2">
          {axisIds.map((axisId, idx) => {
            const group = axisGroups.get(axisId)!;
            const labels = group.keys
              .map(k => sortedMetrics.find(m => m.key === k)?.label)
              .filter(Boolean);
            return (
              <span
                key={axisId}
                className={cn(
                  'text-[10px] text-warm-400',
                  idx === 0 ? 'text-left' : 'text-right'
                )}
              >
                {idx === 0 ? 'Left' : 'Right'}: {labels.join(', ')}
              </span>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
