'use client';

import { cn, formatNumber } from '@/lib/utils';
import { Card } from './card';
import { AnimatedNumber } from './animated-number';
import { Sparkline } from './sparkline';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  };
  sparklineData?: number[];
  animated?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon,
  trend,
  sparklineData,
  animated = false,
  className
}: StatCardProps) {
  const numericValue = typeof value === 'number' ? value : parseFloat(value);
  const canAnimate = !isNaN(numericValue) && animated;

  return (
    <Card
      className={cn('group', className)}
      padding="none"
    >
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900 tabular-nums tracking-tight">
              {canAnimate ? (
                <AnimatedNumber
                  value={numericValue}
                  duration={1500}
                  decimals={0}
                />
              ) : typeof value === 'number' ? (
                formatNumber(value)
              ) : (
                value
              )}
            </p>
            {(trend || sparklineData) && (
              <div className="flex items-center gap-3 mt-2">
                {trend && (
                  <span
                    className={cn(
                      'text-sm font-medium inline-flex items-center gap-0.5',
                      trend.direction === 'up' && 'text-green-600',
                      trend.direction === 'down' && 'text-red-500',
                      trend.direction === 'neutral' && 'text-slate-400'
                    )}
                  >
                    {trend.direction === 'up' && '↑'}
                    {trend.direction === 'down' && '↓'}
                    {trend.direction === 'neutral' && '→'}
                    {' '}{Math.abs(trend.value)}%
                  </span>
                )}
                {sparklineData && (
                  <div className="flex-1 max-w-[100px]">
                    <Sparkline
                      data={sparklineData}
                      color={trend?.direction === 'down' ? '#ef4444' : '#64748b'}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          {icon && (
            <div className="flex-shrink-0 p-2.5 bg-slate-100 rounded-lg text-slate-600 group-hover:scale-105 transition-transform duration-200">
              {icon}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
