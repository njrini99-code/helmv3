'use client';

import { cn } from '@/lib/utils';
import { StrokesGainedBreakdown } from '@/lib/coachhelm/types';

interface StrokesGainedSectionProps {
  strokesGained: StrokesGainedBreakdown;
}

const CATEGORIES = [
  { key: 'tee' as const, label: 'Off the Tee' },
  { key: 'approach' as const, label: 'Approach' },
  { key: 'aroundGreen' as const, label: 'Around Green' },
  { key: 'putting' as const, label: 'Putting' },
];

export function StrokesGainedSection({ strokesGained }: StrokesGainedSectionProps) {
  const maxAbsValue = Math.max(
    ...CATEGORIES.map(c => Math.abs(strokesGained[c.key])),
    1 // Minimum scale
  );

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-5"
      style={{ animation: 'fadeInUp 0.5s ease-out 0.5s both' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <span className="text-lg">📊</span>
          Strokes Gained
        </h3>
        <div className={cn(
          'text-lg font-bold tabular-nums',
          strokesGained.total >= 0 ? 'text-green-600' : 'text-red-500'
        )}>
          {strokesGained.total >= 0 ? '+' : ''}{strokesGained.total.toFixed(1)}
        </div>
      </div>

      <div className="space-y-3">
        {CATEGORIES.map((category, index) => {
          const value = strokesGained[category.key];
          const isPositive = value >= 0;
          const barWidth = (Math.abs(value) / maxAbsValue) * 50; // Max 50% of half

          return (
            <div key={category.key} className="flex items-center gap-3">
              <div className="w-24 text-sm text-slate-600">{category.label}</div>

              {/* Bar container */}
              <div className="flex-1 h-6 relative">
                {/* Center line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-200" />

                {/* Bar */}
                <div className="absolute inset-0 flex items-center">
                  {isPositive ? (
                    <div
                      className="absolute left-1/2 h-4 rounded-r bg-gradient-to-r from-green-400 to-green-500"
                      style={{
                        width: `${barWidth}%`,
                        animation: `barGrow 0.6s ease-out ${500 + index * 100}ms both`,
                        transformOrigin: 'left',
                      }}
                    />
                  ) : (
                    <div
                      className="absolute right-1/2 h-4 rounded-l bg-gradient-to-l from-red-400 to-red-500"
                      style={{
                        width: `${barWidth}%`,
                        animation: `barGrow 0.6s ease-out ${500 + index * 100}ms both`,
                        transformOrigin: 'right',
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Value */}
              <div className={cn(
                'w-12 text-right text-sm font-semibold tabular-nums',
                isPositive ? 'text-green-600' : 'text-red-500'
              )}>
                {isPositive ? '+' : ''}{value.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
