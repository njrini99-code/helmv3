'use client';

/**
 * Strokes Gained Radar Chart
 *
 * Visualizes strokes gained across all categories in a radar/spider chart format.
 * Shows player performance relative to scratch (0 line) with optional comparison overlay.
 */

import { useMemo } from 'react';
import {
  formatStrokesGained,
  getStrokesGainedColor,
  type StrokesGainedResult,
} from '@/lib/golf/strokes-gained';
import { cn } from '@/lib/utils';

interface StrokesGainedRadarProps {
  data: StrokesGainedResult;
  comparisonData?: StrokesGainedResult;
  size?: number;
  showLabels?: boolean;
  showValues?: boolean;
  showComparison?: boolean;
  comparisonLabel?: string;
  className?: string;
}

export function StrokesGainedRadar({
  data,
  comparisonData,
  size = 300,
  showLabels = true,
  showValues = true,
  showComparison = true,
  comparisonLabel = 'Comparison',
  className,
}: StrokesGainedRadarProps) {
  const categories = useMemo(() => [
    { key: 'sg_off_tee', label: 'Off the Tee', shortLabel: 'OTT' },
    { key: 'sg_approach', label: 'Approach', shortLabel: 'APP' },
    { key: 'sg_around_green', label: 'Around Green', shortLabel: 'ARG' },
    { key: 'sg_putting', label: 'Putting', shortLabel: 'PUT' },
  ] as const, []);

  const center = size / 2;
  const radius = (size / 2) - 40;
  const angleStep = (2 * Math.PI) / categories.length;
  const startAngle = -Math.PI / 2; // Start from top

  // Scale factor: 2 SG = full radius
  const scaleFactor = radius / 2;

  // Calculate points for polygon
  const getPolygonPoints = (sgData: StrokesGainedResult) => {
    return categories.map((cat, i) => {
      const value = sgData[cat.key];
      const angle = startAngle + i * angleStep;
      // Clamp value between -2 and 2 for display
      const clampedValue = Math.max(-2, Math.min(2, value));
      const r = radius / 2 + clampedValue * scaleFactor;
      return {
        x: center + r * Math.cos(angle),
        y: center + r * Math.sin(angle),
        value,
        category: cat,
      };
    });
  };

  const playerPoints = getPolygonPoints(data);
  const comparisonPoints = comparisonData ? getPolygonPoints(comparisonData) : null;

  // Generate grid circles
  const gridLevels = [-1, 0, 1, 2];
  const gridCircles = gridLevels.map(level => ({
    level,
    r: radius / 2 + level * scaleFactor,
    label: level > 0 ? `+${level}` : `${level}`,
  }));

  // Generate axis lines
  const axisLines = categories.map((cat, i) => {
    const angle = startAngle + i * angleStep;
    return {
      x1: center,
      y1: center,
      x2: center + radius * Math.cos(angle),
      y2: center + radius * Math.sin(angle),
      category: cat,
      labelX: center + (radius + 20) * Math.cos(angle),
      labelY: center + (radius + 20) * Math.sin(angle),
    };
  });

  const playerPolygonPath = `M ${playerPoints.map(p => `${p.x},${p.y}`).join(' L ')} Z`;
  const comparisonPolygonPath = comparisonPoints
    ? `M ${comparisonPoints.map(p => `${p.x},${p.y}`).join(' L ')} Z`
    : '';

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
      >
        {/* Grid circles */}
        {gridCircles.map((circle, i) => (
          <g key={i}>
            <circle
              cx={center}
              cy={center}
              r={circle.r}
              fill="none"
              stroke={circle.level === 0 ? '#94a3b8' : '#e7e5e4'}
              strokeWidth={circle.level === 0 ? 2 : 1}
              strokeDasharray={circle.level < 0 ? '4,4' : undefined}
            />
            <text
              x={center + 8}
              y={center - circle.r + 4}
              className="text-xs fill-warm-400"
            >
              {circle.label}
            </text>
          </g>
        ))}

        {/* Axis lines */}
        {axisLines.map((line, i) => (
          <line
            key={i}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="#e7e5e4"
            strokeWidth={1}
          />
        ))}

        {/* Comparison polygon */}
        {showComparison && comparisonPolygonPath && (
          <path
            d={comparisonPolygonPath}
            fill="rgba(148, 163, 184, 0.2)"
            stroke="#94a3b8"
            strokeWidth={2}
            strokeDasharray="4,4"
          />
        )}

        {/* Player polygon */}
        <path
          d={playerPolygonPath}
          fill="rgba(34, 197, 94, 0.2)"
          stroke="#22c55e"
          strokeWidth={2}
        />

        {/* Data points */}
        {playerPoints.map((point, i) => (
          <circle
            key={i}
            cx={point.x}
            cy={point.y}
            r={5}
            fill="#22c55e"
            stroke="white"
            strokeWidth={2}
          />
        ))}

        {/* Labels */}
        {showLabels &&
          axisLines.map((line, i) => {
            const isTop = i === 0;
            const isBottom = i === 2;
            const isLeft = i === 3;
            const isRight = i === 1;

            let textAnchor: 'start' | 'middle' | 'end' = 'middle';
            let dy = 0;

            if (isLeft) textAnchor = 'end';
            if (isRight) textAnchor = 'start';
            if (isTop) dy = -5;
            if (isBottom) dy = 15;

            return (
              <text
                key={i}
                x={line.labelX}
                y={line.labelY}
                dy={dy}
                textAnchor={textAnchor}
                className="text-sm font-medium fill-warm-700"
              >
                {line.category.label}
              </text>
            );
          })}
      </svg>

      {/* Values table */}
      {showValues && (
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2">
          {categories.map((cat) => {
            const value = data[cat.key];
            return (
              <div key={cat.key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-warm-600">{cat.shortLabel}:</span>
                <span
                  className={cn('text-sm font-semibold', getStrokesGainedColor(value))}
                >
                  {formatStrokesGained(value)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      {showComparison && comparisonData && (
        <div className="mt-4 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-primary-500" />
            <span className="text-warm-600">Your Performance</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-warm-400 border-dashed" style={{ borderTopWidth: 2, borderStyle: 'dashed' }} />
            <span className="text-warm-600">{comparisonLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Mini radar for compact views
export function StrokesGainedRadarMini({
  data,
  size = 120,
  className,
}: {
  data: StrokesGainedResult;
  size?: number;
  className?: string;
}) {
  return (
    <StrokesGainedRadar
      data={data}
      size={size}
      showLabels={false}
      showValues={false}
      showComparison={false}
      className={className}
    />
  );
}
