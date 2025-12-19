'use client';

import { Card } from '@/components/ui/card';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { cn, formatNumber } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: React.ComponentType<{ size?: number; className?: string }>;
  animated?: boolean;
}

export function StatCard({ label, value, change, changeType = 'neutral', icon: Icon, animated = true }: StatCardProps) {
  const numericValue = typeof value === 'number' ? value : parseFloat(value.toString());
  const canAnimate = !isNaN(numericValue) && animated;

  return (
    <Card className="group" padding="none">
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
            <p className="text-2xl font-semibold text-slate-900 tabular-nums tracking-tight">
              {canAnimate ? (
                <AnimatedNumber value={numericValue} duration={1500} decimals={0} />
              ) : typeof value === 'number' ? (
                formatNumber(value)
              ) : (
                value
              )}
            </p>
            {change && (
              <p className={cn('text-xs mt-1.5',
                changeType === 'positive' && 'text-green-600',
                changeType === 'negative' && 'text-red-500',
                changeType === 'neutral' && 'text-slate-400'
              )}>{change}</p>
            )}
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
            <Icon size={20} className="text-slate-600" />
          </div>
        </div>
      </div>
    </Card>
  );
}
