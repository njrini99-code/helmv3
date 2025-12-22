'use client';

import { cn } from '@/lib/utils';
import { AnimatedNumber } from './animated-number';

interface StatBarProps {
  label: string;
  value: number;
  max: number;
  color?: 'brand' | 'amber' | 'red' | 'blue' | 'green';
  showPercentage?: boolean;
  className?: string;
}

const colorClasses = {
  brand: 'bg-brand-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
};

export function StatBar({ 
  label, 
  value, 
  max, 
  color = 'brand',
  showPercentage = true,
  className 
}: StatBarProps) {
  const percentage = Math.min((value / max) * 100, 100);

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        {showPercentage && (
          <span className="text-slate-500">
            <AnimatedNumber value={percentage} decimals={0} suffix="%" />
          </span>
        )}
      </div>
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-1000 ease-out',
            colorClasses[color]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
