'use client';

import { cn } from '@/lib/utils';

type ActivityStatus = 'active_today' | 'active_week' | 'active_month' | 'inactive' | 'never' | 'online';

interface ActivityDotProps {
  status: ActivityStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  labelOverride?: string;
  className?: string;
}

const dotColors: Record<ActivityStatus, string> = {
  online: 'bg-primary-500',
  active_today: 'bg-primary-500',
  active_week: 'bg-amber-500',
  active_month: 'bg-warm-300',
  inactive: 'bg-red-500',
  never: 'bg-warm-200',
};

const labelColors: Record<ActivityStatus, string> = {
  online: 'text-primary-600',
  active_today: 'text-primary-600',
  active_week: 'text-amber-600',
  active_month: 'text-warm-400',
  inactive: 'text-red-500',
  never: 'text-warm-300',
};

const defaultLabels: Record<ActivityStatus, string> = {
  online: 'Online',
  active_today: 'Today',
  active_week: 'This week',
  active_month: 'This month',
  inactive: '30d+ inactive',
  never: 'Never',
};

const sizeClasses = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2.5 h-2.5',
};

export function ActivityDot({ status, size = 'md', showLabel = false, labelOverride, className }: ActivityDotProps) {
  const shouldPulse = status === 'online' || status === 'active_today';

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="relative flex-shrink-0">
        <span className={cn('block rounded-full', sizeClasses[size], dotColors[status])} />
        {shouldPulse && (
          <span
            className={cn(
              'absolute inset-0 rounded-full animate-ping opacity-75',
              dotColors[status]
            )}
          />
        )}
      </span>
      {showLabel && (
        <span className={cn('text-xs font-medium', labelColors[status])}>
          {labelOverride ?? defaultLabels[status]}
        </span>
      )}
    </span>
  );
}

export function getActivityStatus(
  lastSeen: string | null,
  daysInactive: number | null
): ActivityStatus {
  if (!lastSeen) return 'never';
  if (daysInactive === null) return 'never';
  if (daysInactive === 0) return 'active_today';
  if (daysInactive <= 7) return 'active_week';
  if (daysInactive <= 30) return 'active_month';
  return 'inactive';
}
