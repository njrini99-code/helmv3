'use client';

import { cn } from '@/lib/utils';
import {
  IconChartBar,
  IconTarget,
  IconActivity,
  IconShield,
} from '@/components/icons';

// ============================================================================
// TYPES
// ============================================================================

export type StatCategory = 'all' | 'batting' | 'pitching' | 'fielding';

export interface StatCategoryOption {
  value: StatCategory;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  description: string;
}

export interface StatTypeFilterProps {
  value: StatCategory;
  onChange: (value: StatCategory) => void;
  size?: 'sm' | 'md';
  showLabels?: boolean;
  className?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const STAT_CATEGORIES: StatCategoryOption[] = [
  {
    value: 'all',
    label: 'All Stats',
    shortLabel: 'All',
    icon: <IconChartBar size={14} />,
    description: 'View all stat types combined',
  },
  {
    value: 'batting',
    label: 'Batting',
    shortLabel: 'Bat',
    icon: <IconTarget size={14} />,
    description: 'AVG, OBP, SLG, OPS, K%, BB%',
  },
  {
    value: 'pitching',
    label: 'Pitching',
    shortLabel: 'Pitch',
    icon: <IconActivity size={14} />,
    description: 'ERA, WHIP, K/9, BB/9, velo',
  },
  {
    value: 'fielding',
    label: 'Fielding',
    shortLabel: 'Field',
    icon: <IconShield size={14} />,
    description: 'FLD%, errors, putouts, assists',
  },
];

// ============================================================================
// HELPERS
// ============================================================================

export function getStatCategoryLabel(category: StatCategory): string {
  const found = STAT_CATEGORIES.find((c) => c.value === category);
  return found?.label ?? 'All Stats';
}

export function getStatCategoryDescription(category: StatCategory): string {
  const found = STAT_CATEGORIES.find((c) => c.value === category);
  return found?.description ?? '';
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StatTypeFilter({
  value,
  onChange,
  size = 'sm',
  showLabels = true,
  className,
}: StatTypeFilterProps) {
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {STAT_CATEGORIES.map((cat) => (
        <button
          key={cat.value}
          onClick={() => onChange(cat.value)}
          title={cat.description}
          className={cn(
            'flex items-center gap-1.5 rounded-full font-medium transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            value === cat.value
              ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-200'
              : 'bg-warm-50 text-warm-600 hover:bg-warm-100'
          )}
        >
          {cat.icon}
          {showLabels && (
            <>
              <span className="hidden sm:inline">{cat.label}</span>
              <span className="sm:hidden">{cat.shortLabel}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// DROPDOWN VARIANT (for tighter spaces)
// ============================================================================

interface StatTypeDropdownProps {
  value: StatCategory;
  onChange: (value: StatCategory) => void;
  className?: string;
}

export function StatTypeDropdown({
  value,
  onChange,
  className,
}: StatTypeDropdownProps) {
  const current = STAT_CATEGORIES.find((c) => c.value === value) ?? STAT_CATEGORIES[0]!;

  return (
    <div className={cn('relative', className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as StatCategory)}
        className="appearance-none bg-warm-50 border border-warm-200 rounded-lg px-3 py-1.5 pr-8 text-sm font-medium text-warm-700 hover:bg-warm-100 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-300 cursor-pointer"
      >
        {STAT_CATEGORIES.map((cat) => (
          <option key={cat.value} value={cat.value}>
            {cat.label}
          </option>
        ))}
      </select>
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-warm-400">
        {current?.icon}
      </div>
    </div>
  );
}

// ============================================================================
// INLINE VARIANT (single row, no wrapping)
// ============================================================================

interface StatTypeInlineFilterProps {
  value: StatCategory;
  onChange: (value: StatCategory) => void;
  className?: string;
}

export function StatTypeInlineFilter({
  value,
  onChange,
  className,
}: StatTypeInlineFilterProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center bg-warm-50 rounded-lg p-0.5',
        className
      )}
    >
      {STAT_CATEGORIES.map((cat) => (
        <button
          key={cat.value}
          onClick={() => onChange(cat.value)}
          title={cat.description}
          className={cn(
            'flex items-center justify-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
            value === cat.value
              ? 'bg-white text-warm-900 shadow-sm'
              : 'text-warm-500 hover:text-warm-700'
          )}
        >
          {cat.icon}
          <span className="hidden lg:inline">{cat.shortLabel}</span>
        </button>
      ))}
    </div>
  );
}
