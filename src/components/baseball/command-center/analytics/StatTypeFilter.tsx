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

interface StatCategoryOption {
  value: StatCategory;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  description: string;
}

interface StatTypeFilterProps {
  value: StatCategory;
  onChange: (value: StatCategory) => void;
  size?: 'sm' | 'md';
  showLabels?: boolean;
  className?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STAT_CATEGORIES: StatCategoryOption[] = [
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

