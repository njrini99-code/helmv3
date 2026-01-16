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

import { useMemo, useState } from 'react';
import type { TrendPoint, TrendAnalysis, TrendDirection } from '@/lib/types/golf';
import { cn } from '@/lib/utils';

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
  metric,
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

  if (sortedData.length === 0) {
    return (
      <div className={cn('flex items-center justify-center bg-gray-50 rounded-lg', className)} style={{ height }}>
        <p className="text-gray-500 text-sm">No data available</p>
      </div>
    );
  }

  // Calculate chart dimensions
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const width = 600;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate value range with padding
  const values = sortedData.map(d => d.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;
  const valuePadding = valueRange * 0.1;
  const yMin = minValue - valuePadding;
  const yMax = maxValue + valuePadding;

  // Scale functions
  const xScale = (i: number) => padding.left + (i / (sortedData.length - 1 || 1)) * chartWidth;
  const yScale = (v: number) => padding.top + chartHeight - ((v - yMin) / (yMax - yMin)) * chartHeight;

  // Generate line path
  const linePath = sortedData
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)},${yScale(d.value)}`)
    .join(' ');

  // Generate area path for fill
  const areaPath = `${linePath} L ${xScale(sortedData.length - 1)},${yScale(yMin)} L ${xScale(0)},${yScale(yMin)} Z`;

  // Calculate moving average (5-point)
  const movingAverages = useMemo(() => {
    const window = 5;
    return sortedData.map((_, i) => {
      const start = Math.max(0, i - window + 1);
      const slice = sortedData.slice(start, i + 1);
      return slice.reduce((sum, d) => sum + d.value, 0) / slice.length;
    });
  }, [sortedData]);

  const maLinePath = movingAverages
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)},${yScale(v)}`)
    .join(' ');

  // Generate prediction point
  const predictionPoint = analysis && showPrediction
    ? {
        x: xScale(sortedData.length),
        y: yScale(analysis.prediction),
        value: analysis.prediction,
      }
    : null;

  // Generate Y-axis ticks
  const yTicks = useMemo(() => {
    const tickCount = 5;
    const ticks = [];
    for (let i = 0; i <= tickCount; i++) {
      const value = yMin + (i / tickCount) * (yMax - yMin);
      ticks.push({ value, y: yScale(value) });
    }
    return ticks;
  }, [yMin, yMax, yScale]);

  // Get trend indicator
  const getTrendIndicator = (trend?: TrendDirection) => {
    if (!trend) return null;
    const isGood = isHigherBetter
      ? trend === 'improving'
      : trend === 'improving';

    return {
      icon: trend === 'improving' ? '↑' : trend === 'declining' ? '↓' : '→',
      color: trend === 'stable' ? 'text-gray-500' : isGood ? 'text-green-500' : 'text-red-500',
      label: trend.charAt(0).toUpperCase() + trend.slice(1),
    };
  };

  const trendIndicator = getTrendIndicator(analysis?.trend);

  return (
    <div className={cn('', className)}>
      {/* Header */}
      {title && (
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">{title}</h3>
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
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text
              x={padding.left - 8}
              y={tick.y}
              textAnchor="end"
              dominantBaseline="middle"
              className="text-xs fill-gray-500"
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
        {predictionPoint && (
          <g>
            <line
              x1={xScale(sortedData.length - 1)}
              y1={yScale(sortedData[sortedData.length - 1].value)}
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
              className="text-xs fill-gray-500"
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
              className="text-xs fill-gray-500"
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
              stroke="#e2e8f0"
              strokeWidth={1}
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
            />
            <text
              x={xScale(sortedData.indexOf(hoveredPoint))}
              y={yScale(hoveredPoint.value) - 30}
              textAnchor="middle"
              className="text-sm font-semibold fill-gray-900"
            >
              {formatValue(hoveredPoint.value)}
            </text>
            <text
              x={xScale(sortedData.indexOf(hoveredPoint))}
              y={yScale(hoveredPoint.value) - 14}
              textAnchor="middle"
              className="text-xs fill-gray-500"
            >
              {new Date(hoveredPoint.date).toLocaleDateString()}
            </text>
          </g>
        )}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5" style={{ backgroundColor: color }} />
          <span>Actual</span>
        </div>
        {showMovingAverage && sortedData.length >= 5 && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-gray-400" style={{ borderTop: '2px dashed #94a3b8' }} />
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
      {analysis && (
        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
          <div className="bg-gray-50 rounded p-2">
            <div className="text-gray-500">Current</div>
            <div className="font-semibold text-gray-900">{formatValue(analysis.current_value)}</div>
          </div>
          <div className="bg-gray-50 rounded p-2">
            <div className="text-gray-500">Best</div>
            <div className="font-semibold text-green-600">{formatValue(analysis.best_value)}</div>
          </div>
          <div className="bg-gray-50 rounded p-2">
            <div className="text-gray-500">Avg</div>
            <div className="font-semibold text-gray-900">{formatValue(analysis.moving_average)}</div>
          </div>
          <div className="bg-gray-50 rounded p-2">
            <div className="text-gray-500">Confidence</div>
            <div className="font-semibold text-gray-900">{Math.round(analysis.confidence * 100)}%</div>
          </div>
        </div>
      )}
    </div>
  );
}

// Multi-line chart for comparing multiple metrics
export function MultiTrendLineChart({
  metrics,
  height = 250,
  className,
}: {
  metrics: {
    key: string;
    label: string;
    data: TrendPoint[];
    color: string;
  }[];
  height?: number;
  className?: string;
}) {
  // Similar implementation but with multiple lines
  // Placeholder for now
  return (
    <div className={cn('', className)}>
      <div className="text-sm text-gray-500 mb-2">Multi-metric comparison</div>
      <div className="grid grid-cols-2 gap-4">
        {metrics.map((m) => (
          <TrendLineChart
            key={m.key}
            data={m.data}
            title={m.label}
            metric={m.key}
            color={m.color}
            height={height / 2}
          />
        ))}
      </div>
    </div>
  );
}
