'use client';

/**
 * Availability Cell Component
 *
 * Individual cell in When2meet-style availability grid:
 * - Heat-based background color (6 levels)
 * - My response indicator (border overlay)
 * - Hover ring effect
 * - Click to toggle availability
 * - Tooltip with participant names
 *
 * Used in AvailabilityPollGrid for group scheduling.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getHeatLevel } from '@/lib/calendar/premium-utils';
import '@/styles/calendar-tokens.css';

export interface AvailabilityCellProps {
  timeSlot: {
    date: string; // ISO date string
    startTime: string; // HH:mm format
    endTime: string; // HH:mm format
  };
  availableCount: number;
  maybeCount: number;
  totalResponses: number;
  myResponse: 'available' | 'maybe' | 'unavailable' | null;
  availableUsers?: string[]; // Names of available users
  onToggle?: () => void;
  disabled?: boolean;
  className?: string;
}

export function AvailabilityCell({
  timeSlot: _timeSlot,
  availableCount,
  maybeCount,
  totalResponses,
  myResponse,
  availableUsers = [],
  onToggle,
  disabled = false,
  className,
}: AvailabilityCellProps) {
  void _timeSlot;

  const [showTooltip, setShowTooltip] = useState(false);

  // Calculate heat level
  const heatLevel = getHeatLevel(availableCount, maybeCount, totalResponses);

  const isMyResponse = myResponse === 'available' || myResponse === 'maybe';
  const isClickable = !!onToggle && !disabled;

  // Generate accessible label
  const accessibleLabel = myResponse
    ? `Your response: ${myResponse}. ${availableCount} of ${totalResponses} available.`
    : `${availableCount} of ${totalResponses} available. Click to toggle your availability.`;

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled || !onToggle}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        aria-label={accessibleLabel}
        aria-pressed={isMyResponse}
        className={cn(
          // Base styles
          'w-full aspect-square rounded-md transition-all duration-200',
          'touch-manipulation',
          // Focus visible
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
          // Heat level background
          heatLevel.className,
          // Border overlay for my response
          isMyResponse && 'ring-2 ring-warm-900 ring-inset',
          myResponse === 'maybe' && 'ring-dashed',
          // Hover effect
          isClickable && 'hover:ring-2 hover:ring-warm-400 hover:ring-inset',
          // Active state
          isClickable && 'active:scale-95',
          // Disabled state
          disabled && 'opacity-50 cursor-not-allowed',
          // Custom className
          className
        )}
        title={
          availableUsers.length > 0
            ? `${availableCount} available: ${availableUsers.slice(0, 3).join(', ')}${
                availableUsers.length > 3 ? `, +${availableUsers.length - 3} more` : ''
              }`
            : `${availableCount} / ${totalResponses} available`
        }
      >
        {/* Optional count display (for very high availability) */}
        {availableCount > 0 && heatLevel.level >= 4 && (
          <span className="text-xs font-semibold text-white/90">{availableCount}</span>
        )}
      </button>

      {/* Tooltip with participant names */}
      {showTooltip && availableUsers.length > 0 && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-warm-900 text-white text-xs rounded-lg whitespace-nowrap pointer-events-none z-20 shadow-xl">
          <div className="max-w-[200px]">
            <p className="font-semibold mb-1">
              {availableCount} available
              {maybeCount > 0 && `, ${maybeCount} maybe`}
            </p>
            <div className="space-y-0.5">
              {availableUsers.slice(0, 5).map((name, i) => (
                <p key={i} className="text-warm-300 truncate">
                  {name}
                </p>
              ))}
              {availableUsers.length > 5 && (
                <p className="text-warm-400">+{availableUsers.length - 5} more</p>
              )}
            </div>
          </div>
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-warm-900" />
        </div>
      )}
    </div>
  );
}

/**
 * Availability Cell Legend
 */
export function AvailabilityCellLegend({ className }: { className?: string }) {
  const levels = [
    { level: 0, label: 'None', className: 'heat-none' },
    { level: 1, label: 'Low', className: 'heat-low' },
    { level: 2, label: 'Medium Low', className: 'heat-medium-low' },
    { level: 3, label: 'Medium', className: 'heat-medium' },
    { level: 4, label: 'Medium High', className: 'heat-medium-high' },
    { level: 5, label: 'High', className: 'heat-high' },
  ];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-xs text-warm-500 font-medium">Availability:</span>
      <div className="flex items-center gap-1">
        {levels.map((level) => (
          <div key={level.level} className="flex flex-col items-center gap-1">
            <div className={cn('w-6 h-6 rounded', level.className)} />
            {level.level === 0 || level.level === 5 ? (
              <span className="text-xs text-warm-500">{level.label}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Compact Availability Indicator (for lists)
 */
export function CompactAvailabilityIndicator({
  availableCount,
  totalResponses,
  className,
}: {
  availableCount: number;
  totalResponses: number;
  className?: string;
}) {
  const percentage = totalResponses > 0 ? (availableCount / totalResponses) * 100 : 0;
  const heatLevel = getHeatLevel(availableCount, 0, totalResponses);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('w-3 h-3 rounded-full', heatLevel.className)} />
      <span className="text-sm text-warm-700 tabular-nums">
        {availableCount}/{totalResponses}
      </span>
      <span className="text-xs text-warm-500">({Math.round(percentage)}%)</span>
    </div>
  );
}

/**
 * Availability Bar (horizontal progress bar)
 */
export function AvailabilityBar({
  availableCount,
  maybeCount,
  totalResponses,
  showLabels = false,
  className,
}: {
  availableCount: number;
  maybeCount: number;
  totalResponses: number;
  showLabels?: boolean;
  className?: string;
}) {
  const availablePercentage = totalResponses > 0 ? (availableCount / totalResponses) * 100 : 0;
  const maybePercentage = totalResponses > 0 ? (maybeCount / totalResponses) * 100 : 0;

  return (
    <div className={cn('space-y-1', className)}>
      {showLabels && (
        <div className="flex items-center justify-between text-xs text-warm-600">
          <span>
            {availableCount} available
            {maybeCount > 0 && `, ${maybeCount} maybe`}
          </span>
          <span className="tabular-nums">{Math.round(availablePercentage)}%</span>
        </div>
      )}

      <div
        role="progressbar"
        aria-valuenow={availablePercentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${availableCount} of ${totalResponses} available${maybeCount > 0 ? `, ${maybeCount} maybe` : ''}`}
        className="h-2 bg-warm-100 rounded-full overflow-hidden flex"
      >
        {/* Available segment */}
        {availablePercentage > 0 && (
          <div
            className="bg-primary-500 transition-all duration-300"
            style={{ width: `${availablePercentage}%` }}
            aria-hidden="true"
          />
        )}

        {/* Maybe segment */}
        {maybePercentage > 0 && (
          <div
            className="bg-amber-400 transition-all duration-300"
            style={{ width: `${maybePercentage}%` }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}
