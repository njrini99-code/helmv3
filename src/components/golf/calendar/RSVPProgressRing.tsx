'use client';

/**
 * RSVP Progress Ring Component
 *
 * SVG circular progress indicator showing RSVP breakdown:
 * - Accepted segment (primary)
 * - Declined segment (rose)
 * - Tentative segment (amber)
 * - Pending segment (slate)
 *
 * Features:
 * - Color-coded arc segments
 * - Center stat display (accepted/total)
 * - Responsive sizing
 * - Smooth animations
 */

import { cn } from '@/lib/utils';
import '@/styles/calendar-tokens.css';

export interface RSVPProgressRingProps {
  confirmed: number;
  maybe: number;
  declined: number;
  pending: number;
  total: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showLabel?: boolean;
  animated?: boolean;
}

const SIZE_CONFIGS = {
  sm: {
    diameter: 80,
    strokeWidth: 8,
    fontSize: 'text-lg',
    labelSize: 'text-xs',
  },
  md: {
    diameter: 120,
    strokeWidth: 12,
    fontSize: 'text-2xl',
    labelSize: 'text-sm',
  },
  lg: {
    diameter: 160,
    strokeWidth: 16,
    fontSize: 'text-3xl',
    labelSize: 'text-base',
  },
  xl: {
    diameter: 200,
    strokeWidth: 20,
    fontSize: 'text-4xl',
    labelSize: 'text-lg',
  },
};

export function RSVPProgressRing({
  confirmed,
  maybe,
  declined,
  pending,
  total,
  size = 'md',
  className,
  showLabel = true,
  animated = true,
}: RSVPProgressRingProps) {
  const config = SIZE_CONFIGS[size];
  const radius = (config.diameter - config.strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate percentages
  const confirmedPct = total > 0 ? (confirmed / total) * 100 : 0;
  const maybePct = total > 0 ? (maybe / total) * 100 : 0;
  const declinedPct = total > 0 ? (declined / total) * 100 : 0;
  const pendingPct = total > 0 ? (pending / total) * 100 : 0;

  // Calculate arc lengths
  const confirmedArc = (confirmedPct / 100) * circumference;
  const maybeArc = (maybePct / 100) * circumference;
  const declinedArc = (declinedPct / 100) * circumference;
  const pendingArc = (pendingPct / 100) * circumference;

  // Calculate cumulative offsets (for stacking arcs)
  const maybeOffset = confirmedArc;
  const declinedOffset = confirmedArc + maybeArc;
  const pendingOffset = confirmedArc + maybeArc + declinedArc;

  return (
    <div className={cn('inline-flex flex-col items-center gap-2', className)}>
      <svg
        width={config.diameter}
        height={config.diameter}
        className={cn('transform -rotate-90', animated && 'transition-transform duration-500')}
      >
        {/* Background circle */}
        <circle
          cx={config.diameter / 2}
          cy={config.diameter / 2}
          r={radius}
          fill="none"
          stroke="rgb(241, 245, 249)" // warm-100
          strokeWidth={config.strokeWidth}
        />

        {/* Pending arc */}
        {pendingPct > 0 && (
          <circle
            cx={config.diameter / 2}
            cy={config.diameter / 2}
            r={radius}
            fill="none"
            stroke="var(--rsvp-pending)"
            strokeWidth={config.strokeWidth}
            strokeDasharray={`${pendingArc} ${circumference - pendingArc}`}
            strokeDashoffset={-pendingOffset}
            strokeLinecap="round"
            className={animated ? 'transition-[stroke-dasharray,stroke-dashoffset] duration-500' : ''}
            style={animated ? { transitionDelay: '450ms' } : undefined}
          />
        )}

        {/* Declined arc */}
        {declinedPct > 0 && (
          <circle
            cx={config.diameter / 2}
            cy={config.diameter / 2}
            r={radius}
            fill="none"
            stroke="var(--rsvp-declined)"
            strokeWidth={config.strokeWidth}
            strokeDasharray={`${declinedArc} ${circumference - declinedArc}`}
            strokeDashoffset={-declinedOffset}
            strokeLinecap="round"
            className={animated ? 'transition-[stroke-dasharray,stroke-dashoffset] duration-500' : ''}
            style={animated ? { transitionDelay: '300ms' } : undefined}
          />
        )}

        {/* Maybe arc */}
        {maybePct > 0 && (
          <circle
            cx={config.diameter / 2}
            cy={config.diameter / 2}
            r={radius}
            fill="none"
            stroke="var(--rsvp-maybe)"
            strokeWidth={config.strokeWidth}
            strokeDasharray={`${maybeArc} ${circumference - maybeArc}`}
            strokeDashoffset={-maybeOffset}
            strokeLinecap="round"
            className={animated ? 'transition-[stroke-dasharray,stroke-dashoffset] duration-500' : ''}
            style={animated ? { transitionDelay: '150ms' } : undefined}
          />
        )}

        {/* Confirmed arc */}
        {confirmedPct > 0 && (
          <circle
            cx={config.diameter / 2}
            cy={config.diameter / 2}
            r={radius}
            fill="none"
            stroke="var(--rsvp-confirmed)"
            strokeWidth={config.strokeWidth}
            strokeDasharray={`${confirmedArc} ${circumference - confirmedArc}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            className={animated ? 'transition-[stroke-dasharray,stroke-dashoffset] duration-500' : ''}
          />
        )}

        {/* Center text */}
        <text
          x={config.diameter / 2}
          y={config.diameter / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className={cn('font-bold fill-warm-900', config.fontSize)}
          transform={`rotate(90 ${config.diameter / 2} ${config.diameter / 2})`}
        >
          {confirmed}
        </text>
        <text
          x={config.diameter / 2}
          y={config.diameter / 2 + (config.diameter * 0.15)}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-xs fill-warm-500"
          transform={`rotate(90 ${config.diameter / 2} ${config.diameter / 2 + config.diameter * 0.15})`}
        >
          of {total}
        </text>
      </svg>

      {/* Legend */}
      {showLabel && (
        <div className={cn('flex flex-wrap justify-center gap-3', config.labelSize)}>
          {confirmedPct > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary-500"></div>
              <span className="text-warm-700">
                {confirmed} Accepted
              </span>
            </div>
          )}
          {maybePct > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <span className="text-warm-700">
                {maybe} Tentative
              </span>
            </div>
          )}
          {declinedPct > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-rose-400"></div>
              <span className="text-warm-700">
                {declined} Declined
              </span>
            </div>
          )}
          {pendingPct > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-warm-300"></div>
              <span className="text-warm-700">
                {pending} Pending
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact RSVP Ring (for cards/lists)
 */
export function CompactRSVPRing({
  confirmed,
  total,
  size = 'sm',
}: {
  confirmed: number;
  total: number;
  size?: 'sm' | 'md';
}) {
  const config = SIZE_CONFIGS[size];
  const radius = (config.diameter - config.strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = total > 0 ? (confirmed / total) * 100 : 0;
  const arcLength = (percentage / 100) * circumference;

  return (
    <svg width={config.diameter} height={config.diameter} className="transform -rotate-90">
      {/* Background */}
      <circle
        cx={config.diameter / 2}
        cy={config.diameter / 2}
        r={radius}
        fill="none"
        stroke="var(--rsvp-pending)"
        strokeWidth={config.strokeWidth}
      />

      {/* Progress */}
      <circle
        cx={config.diameter / 2}
        cy={config.diameter / 2}
        r={radius}
        fill="none"
        stroke="var(--rsvp-confirmed)"
        strokeWidth={config.strokeWidth}
        strokeDasharray={`${arcLength} ${circumference - arcLength}`}
        strokeLinecap="round"
        className="transition-[stroke-dasharray,stroke-dashoffset] duration-500"
      />

      {/* Center text */}
      <text
        x={config.diameter / 2}
        y={config.diameter / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        className="text-xs font-semibold fill-warm-900"
        transform={`rotate(90 ${config.diameter / 2} ${config.diameter / 2})`}
      >
        {confirmed}/{total}
      </text>
    </svg>
  );
}
