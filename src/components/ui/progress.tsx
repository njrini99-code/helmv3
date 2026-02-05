import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  value?: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md' | 'lg';
  indeterminate?: boolean;
  animated?: boolean;
}

const colorClasses = {
  primary: 'from-primary-500 to-primary-600',
  success: 'from-primary-500 to-primary-600',
  warning: 'from-amber-400 to-amber-500',
  danger: 'from-red-500 to-red-600',
  info: 'from-blue-500 to-blue-600',
};

const trackColorClasses = {
  primary: 'bg-primary-100',
  success: 'bg-primary-100',
  warning: 'bg-amber-100',
  danger: 'bg-red-100',
  info: 'bg-blue-100',
};

const sizeClasses = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

export function Progress({
  className,
  value = 0,
  max = 100,
  label,
  showPercentage = true,
  color = 'primary',
  size = 'md',
  indeterminate = false,
  animated = true,
  ...props
}: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={cn('w-full', className)} {...props}>
      {(label || showPercentage) && (
        <div className="flex justify-between mb-1.5">
          {label && <span className="text-sm font-medium text-warm-700">{label}</span>}
          {showPercentage && !indeterminate && (
            <span className="text-sm text-warm-500 tabular-nums">{Math.round(percentage)}%</span>
          )}
        </div>
      )}
      <div
        className={cn(
          'rounded-full overflow-hidden',
          sizeClasses[size],
          indeterminate ? 'bg-warm-100' : trackColorClasses[color],
        )}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        {indeterminate ? (
          <div
            className={cn(
              'h-full w-1/4 rounded-full bg-gradient-to-r animate-progress-indeterminate',
              colorClasses[color],
            )}
          />
        ) : (
          <div
            className={cn(
              'h-full rounded-full bg-gradient-to-r',
              colorClasses[color],
              animated && 'transition-all duration-500 ease-out',
            )}
            style={{
              width: `${percentage}%`,
              ['--progress-width' as string]: `${percentage}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}

// Segmented progress for multi-step flows
interface SegmentedProgressProps {
  steps: number;
  currentStep: number;
  className?: string;
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
}

export function SegmentedProgress({
  steps,
  currentStep,
  className,
  color = 'primary',
}: SegmentedProgressProps) {
  return (
    <div className={cn('flex gap-1.5', className)}>
      {Array.from({ length: steps }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 flex-1 rounded-full transition-all duration-300 ease-out',
            i < currentStep
              ? cn('bg-gradient-to-r', colorClasses[color])
              : i === currentStep
              ? 'bg-warm-300'
              : 'bg-warm-100',
          )}
        />
      ))}
    </div>
  );
}
