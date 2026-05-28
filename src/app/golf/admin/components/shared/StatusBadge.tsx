'use client';

import { cn } from '@/lib/utils';

type StatusType = 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';

interface StatusBadgeProps {
  status: StatusType;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

const statusColors: Record<StatusType, string> = {
  healthy: 'bg-primary-50 text-primary-700 border-primary-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  neutral: 'bg-warm-100 text-warm-600 border-warm-200',
};

const dotColors: Record<StatusType, string> = {
  healthy: 'bg-primary-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  info: 'bg-blue-500',
  neutral: 'bg-warm-400',
};

const sizeClasses = {
  sm: 'text-eyebrow px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
};

export function StatusBadge({
  status,
  label,
  size = 'md',
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        statusColors[status],
        sizeClasses[size],
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColors[status])} />
      {label}
    </span>
  );
}
