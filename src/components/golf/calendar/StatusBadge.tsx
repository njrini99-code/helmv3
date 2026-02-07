'use client';

/**
 * Status Badge Component
 *
 * Universal status indicator for calendar events.
 * Supports:
 * - Draft, Confirmed, Cancelled, Completed states
 * - Icon + label combinations
 * - Compact and full modes
 * - Consistent color coding per design tokens
 */

import { cn } from '@/lib/utils';
import {
  CheckCircle,
  XCircle,
  Clock,
  Edit3,
  type LucideIcon,
} from 'lucide-react';

export interface StatusBadgeProps {
  status: 'draft' | 'confirmed' | 'cancelled' | 'completed' | 'pending';
  className?: string;
  compact?: boolean;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

interface StatusConfig {
  icon: LucideIcon;
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
}

const STATUS_CONFIGS: Record<StatusBadgeProps['status'], StatusConfig> = {
  draft: {
    icon: Edit3,
    label: 'Draft',
    colorClass: 'text-slate-600',
    bgClass: 'bg-slate-100',
    borderClass: 'border-slate-200',
  },
  confirmed: {
    icon: CheckCircle,
    label: 'Confirmed',
    colorClass: 'text-emerald-700',
    bgClass: 'bg-emerald-100',
    borderClass: 'border-emerald-200',
  },
  cancelled: {
    icon: XCircle,
    label: 'Cancelled',
    colorClass: 'text-rose-700',
    bgClass: 'bg-rose-100',
    borderClass: 'border-rose-200',
  },
  completed: {
    icon: CheckCircle,
    label: 'Completed',
    colorClass: 'text-slate-600',
    bgClass: 'bg-slate-100',
    borderClass: 'border-slate-200',
  },
  pending: {
    icon: Clock,
    label: 'Pending',
    colorClass: 'text-amber-700',
    bgClass: 'bg-amber-100',
    borderClass: 'border-amber-200',
  },
};

const SIZE_CONFIGS = {
  sm: {
    container: 'px-1.5 py-0.5 text-xs gap-0.5',
    icon: 'w-2.5 h-2.5',
  },
  md: {
    container: 'px-2 py-1 text-xs gap-1',
    icon: 'w-3 h-3',
  },
  lg: {
    container: 'px-2.5 py-1.5 text-sm gap-1.5',
    icon: 'w-3.5 h-3.5',
  },
};

export function StatusBadge({
  status,
  className,
  compact = false,
  showIcon = true,
  size = 'md',
}: StatusBadgeProps) {
  const config = STATUS_CONFIGS[status];
  const sizeConfig = SIZE_CONFIGS[size];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        // Base styles
        'inline-flex items-center rounded-full border font-medium uppercase tracking-wide',
        'transition-all duration-200',
        // Size-specific spacing
        sizeConfig.container,
        // Color scheme
        config.colorClass,
        config.bgClass,
        config.borderClass,
        // Custom className
        className
      )}
    >
      {showIcon && <Icon className={sizeConfig.icon} />}
      {!compact && <span>{config.label}</span>}
    </span>
  );
}

/**
 * Status Badge with Tooltip (for compact mode)
 */
export function StatusBadgeWithTooltip({
  status,
  className,
  size = 'md',
}: Omit<StatusBadgeProps, 'compact' | 'showIcon'>) {
  const config = STATUS_CONFIGS[status];

  return (
    <div className="relative group">
      <StatusBadge status={status} compact={true} size={size} className={className} />

      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1
                      bg-slate-900 text-white text-xs rounded whitespace-nowrap
                      opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none
                      z-10">
        {config.label}
        <div className="absolute top-full left-1/2 -translate-x-1/2
                        border-4 border-transparent border-t-slate-900"></div>
      </div>
    </div>
  );
}
