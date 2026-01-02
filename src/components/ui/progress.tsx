import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
}

export function Progress({ className, value, max = 100, label, showPercentage = true, ...props }: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={cn('w-full', className)} {...props}>
      {(label || showPercentage) && (
        <div className="flex justify-between mb-1.5">
          {label && <span className="text-sm font-medium text-warm-700">{label}</span>}
          {showPercentage && <span className="text-sm text-warm-500">{Math.round(percentage)}%</span>}
        </div>
      )}
      <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
