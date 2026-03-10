'use client';

import { cn } from '@/lib/utils';
import { IconCalendar } from '@/components/icons';

// ============================================================================
// TYPES
// ============================================================================

export type TimeRange = '7d' | '30d' | 'season' | 'all';

interface TimeRangeOption {
  value: TimeRange;
  label: string;
  shortLabel: string;
}

interface TimeRangeFilterProps {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
  size?: 'sm' | 'md';
  className?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { value: '7d', label: 'Last 7 Days', shortLabel: '7D' },
  { value: '30d', label: 'Last 30 Days', shortLabel: '30D' },
  { value: 'season', label: 'This Season', shortLabel: 'Season' },
  { value: 'all', label: 'All Time', shortLabel: 'All' },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function TimeRangeFilter({
  value,
  onChange,
  size = 'sm',
  className,
}: TimeRangeFilterProps) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <IconCalendar
        size={size === 'sm' ? 14 : 16}
        className="text-warm-400 mr-1 hidden sm:block"
      />
      {TIME_RANGE_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-full font-medium transition-colors',
            size === 'sm'
              ? 'px-2.5 py-1 text-xs'
              : 'px-3 py-1.5 text-sm',
            value === option.value
              ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-200'
              : 'bg-warm-50 text-warm-600 hover:bg-warm-100'
          )}
        >
          <span className="hidden sm:inline">{option.label}</span>
          <span className="sm:hidden">{option.shortLabel}</span>
        </button>
      ))}
    </div>
  );
}
