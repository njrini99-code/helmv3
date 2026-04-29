'use client';

import { cn } from '@/lib/utils';
import { GoalImpact } from '@/lib/coachhelm/types';
import { IconTarget } from '@/components/icons';

interface GoalImpactCardProps {
  impacts: GoalImpact[];
}

export function GoalImpactCard({ impacts }: GoalImpactCardProps) {
  if (impacts.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-warm-200 bg-white p-5"
      style={{ animation: 'fadeInUp 0.5s ease-out 0.1s both' }}
    >
      <h3 className="text-sm font-semibold text-warm-900 mb-3 flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-primary-50 ring-1 ring-primary-100">
          <IconTarget size={14} className="text-primary-600" />
        </span>
        Goal Impact
      </h3>

      <div className="space-y-3">
        {impacts.map((impact) => (
          <div
            key={impact.goalId}
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg',
              impact.direction === 'positive' && 'bg-primary-50',
              impact.direction === 'negative' && 'bg-red-50',
              impact.direction === 'neutral' && 'bg-warm-50',
            )}
          >
            {/* Direction indicator */}
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm',
              impact.direction === 'positive' && 'bg-primary-100 text-primary-600',
              impact.direction === 'negative' && 'bg-red-100 text-red-600',
              impact.direction === 'neutral' && 'bg-warm-100 text-warm-600',
            )}>
              {impact.direction === 'positive' ? '↑' : impact.direction === 'negative' ? '↓' : '→'}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-warm-900">{impact.goalLabel}</div>
              <div className="text-xs text-warm-500">{impact.message}</div>
            </div>

            {/* Change value */}
            {impact.change !== 0 && (
              <div className={cn(
                'text-sm font-semibold tabular-nums',
                impact.direction === 'positive' ? 'text-primary-600' : 'text-red-500',
              )}>
                {impact.change > 0 ? '+' : ''}{impact.change.toFixed(1)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
