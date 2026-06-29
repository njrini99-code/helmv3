'use client';

/**
 * MissPatternChart - Circular/Radar Visualization for Miss Patterns
 *
 * Premium visualization showing miss directions as segments in a circular chart.
 * Uses custom SVG for a distinctive, non-generic appearance.
 */

import { useMemo } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MissPatternData {
  direction: string;
  percentage: number;
  count?: number;
}

interface MissPatternChartProps {
  data: MissPatternData[];
  title?: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showLegend?: boolean;
  animated?: boolean;
}

// Direction positions for the circular chart (in degrees from top, clockwise)
const DIRECTION_ANGLES: Record<string, number> = {
  short: 180,
  long: 0,
  left: 270,
  right: 90,
  short_left: 225,
  short_right: 135,
  long_left: 315,
  long_right: 45,
};

// Friendly labels for directions
const DIRECTION_LABELS: Record<string, string> = {
  short: 'Short',
  long: 'Long',
  left: 'Left',
  right: 'Right',
  short_left: 'Short-Left',
  short_right: 'Short-Right',
  long_left: 'Long-Left',
  long_right: 'Long-Right',
};

// Colors based on severity/frequency
function getSegmentColor(percentage: number): string {
  if (percentage >= 50) return '#ef4444'; // Red - critical
  if (percentage >= 35) return '#f59e0b'; // Amber - warning
  if (percentage >= 20) return '#22c55e'; // Green - moderate
  return '#94a3b8'; // Slate - low
}

const sizes = {
  sm: { viewBox: 200, center: 100, radius: 75, labelRadius: 95 },
  md: { viewBox: 280, center: 140, radius: 105, labelRadius: 130 },
  lg: { viewBox: 360, center: 180, radius: 140, labelRadius: 170 },
};

export function MissPatternChart({
  data,
  title = 'Miss Pattern',
  subtitle,
  size = 'md',
  className,
  showLegend = true,
  animated = true,
}: MissPatternChartProps) {
  const prefersReducedMotion = useReducedMotion();
  const { viewBox, center, radius, labelRadius } = sizes[size];

  // Sort data by percentage for consistent rendering
  const sortedData = useMemo(() => {
    return [...data]
      .filter(d => d.percentage > 0)
      .sort((a, b) => b.percentage - a.percentage);
  }, [data]);

  // Calculate segment arc paths
  const segments = useMemo(() => {
    return sortedData.map((item) => {
      const angleDeg = DIRECTION_ANGLES[item.direction] ?? 0;
      const angleRad = (angleDeg - 90) * (Math.PI / 180);

      // Segment arc span (45 degrees for 8 directions)
      const arcSpan = 40;
      const startAngle = angleDeg - arcSpan / 2;
      const endAngle = angleDeg + arcSpan / 2;

      // Calculate segment radius based on percentage
      const segmentRadius = (radius * 0.4) + (radius * 0.6 * (item.percentage / 100));

      // Arc path
      const startRad = (startAngle - 90) * (Math.PI / 180);
      const endRad = (endAngle - 90) * (Math.PI / 180);

      const x1 = center + segmentRadius * Math.cos(startRad);
      const y1 = center + segmentRadius * Math.sin(startRad);
      const x2 = center + segmentRadius * Math.cos(endRad);
      const y2 = center + segmentRadius * Math.sin(endRad);

      const largeArc = arcSpan > 180 ? 1 : 0;

      const path = `
        M ${center} ${center}
        L ${x1} ${y1}
        A ${segmentRadius} ${segmentRadius} 0 ${largeArc} 1 ${x2} ${y2}
        Z
      `;

      // Label position
      const labelX = center + labelRadius * Math.cos(angleRad);
      const labelY = center + labelRadius * Math.sin(angleRad);

      return {
        ...item,
        path,
        color: getSegmentColor(item.percentage),
        labelX,
        labelY,
        angleDeg,
      };
    });
  }, [sortedData, center, radius, labelRadius]);

  // Determine primary miss (highest percentage)
  const primaryMiss = sortedData[0];

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-warm-700">{title}</h4>
        {subtitle && (
          <p className="text-xs text-warm-500 mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* Chart Container */}
      <div className="relative flex items-center justify-center">
        <svg
          viewBox={`0 0 ${viewBox} ${viewBox}`}
          className={cn(
            size === 'sm' && 'w-48 h-48',
            size === 'md' && 'w-64 h-64',
            size === 'lg' && 'w-80 h-80'
          )}
        >
          {/* Background circles for reference */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#e7e5e4"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <circle
            cx={center}
            cy={center}
            r={radius * 0.66}
            fill="none"
            stroke="#e7e5e4"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <circle
            cx={center}
            cy={center}
            r={radius * 0.33}
            fill="none"
            stroke="#e7e5e4"
            strokeWidth="1"
            strokeDasharray="4 4"
          />

          {/* Direction guide lines */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
            const rad = (angle - 90) * (Math.PI / 180);
            const x2 = center + radius * Math.cos(rad);
            const y2 = center + radius * Math.sin(rad);
            return (
              <line
                key={angle}
                x1={center}
                y1={center}
                x2={x2}
                y2={y2}
                stroke="#e7e5e4"
                strokeWidth="1"
              />
            );
          })}

          {/* Segments */}
          {segments.map((segment, index) => (
            <motion.path
              key={segment.direction}
              d={segment.path}
              fill={segment.color}
              fillOpacity={0.8}
              stroke={segment.color}
              strokeWidth={2}
              initial={animated ? { scale: 0, opacity: 0 } : undefined}
              animate={animated ? { scale: 1, opacity: 1 } : undefined}
              transition={prefersReducedMotion ? { duration: 0 } : (animated ? { delay: index * 0.1, duration: 0.4, ease: 'easeOut' } : undefined)}
              className="cursor-pointer hover:fill-opacity-100 transition-all"
            />
          ))}

          {/* Center circle (green/target) */}
          <circle
            cx={center}
            cy={center}
            r={radius * 0.15}
            fill="#16A34A"
            fillOpacity={0.3}
            stroke="#16A34A"
            strokeWidth={2}
          />
          <circle
            cx={center}
            cy={center}
            r={radius * 0.05}
            fill="#16A34A"
          />

          {/* Direction labels around the chart */}
          <text x={center} y={center - radius - 8} textAnchor="middle" className="fill-warm-500 text-xs font-medium">
            LONG
          </text>
          <text x={center} y={center + radius + 16} textAnchor="middle" className="fill-warm-500 text-xs font-medium">
            SHORT
          </text>
          <text x={center - radius - 8} y={center + 4} textAnchor="end" className="fill-warm-500 text-xs font-medium">
            LEFT
          </text>
          <text x={center + radius + 8} y={center + 4} textAnchor="start" className="fill-warm-500 text-xs font-medium">
            RIGHT
          </text>
        </svg>

        {/* Center stats overlay */}
        {primaryMiss && (
          <motion.div
            initial={animated ? { opacity: 0, scale: 0.8 } : undefined}
            animate={animated ? { opacity: 1, scale: 1 } : undefined}
            transition={prefersReducedMotion ? { duration: 0 } : (animated ? { delay: 0.5, duration: 0.3 } : undefined)}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="text-center bg-cream-50/92 backdrop-blur-sm rounded-full px-2 py-1 shadow-sm">
              <div className="text-body-sm font-medium text-warm-900 leading-tight tabular-nums">
                {primaryMiss.percentage}%
              </div>
              <div className="text-caption font-medium text-warm-500 uppercase tracking-wide leading-tight">
                {DIRECTION_LABELS[primaryMiss.direction] || primaryMiss.direction}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Legend */}
      {showLegend && sortedData.length > 0 && (
        <motion.div
          initial={animated ? { opacity: 0, y: 10 } : undefined}
          animate={animated ? { opacity: 1, y: 0 } : undefined}
          transition={prefersReducedMotion ? { duration: 0 } : (animated ? { delay: 0.6, duration: 0.3 } : undefined)}
          className="mt-4 flex flex-wrap gap-3 justify-center"
        >
          {sortedData.slice(0, 4).map((item) => (
            <div
              key={item.direction}
              className="flex items-center gap-2 px-2 py-1 rounded-lg bg-warm-50"
            >
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: getSegmentColor(item.percentage) }}
              />
              <span className="text-xs font-medium text-warm-600">
                {DIRECTION_LABELS[item.direction] || item.direction}
              </span>
              <span className="text-xs text-warm-400">
                {item.percentage}%
              </span>
            </div>
          ))}
        </motion.div>
      )}

      {/* Empty state */}
      {sortedData.length === 0 && (
        <EmptyState
          variant="minimal"
          type="stats"
          description="No miss pattern data yet. Track more rounds for insights."
        />
      )}
    </div>
  );
}

