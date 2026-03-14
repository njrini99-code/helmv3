'use client';

import { cn } from '@/lib/utils';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';

interface Props {
  funnel: AdminDashboardData['playerFunnel']['funnel'];
}

export function UserFunnelViz({ funnel }: Props) {
  if (funnel.length === 0) return null;
  const maxCount = funnel[0]?.count ?? 1;

  return (
    <div className={cn(
      'bg-white/70 backdrop-blur-xl',
      'border border-white/20 rounded-2xl',
      'shadow-glass',
      'p-4 sm:p-5 md:p-6',
      'h-full'
    )}>
      <div className="flex items-center gap-2 mb-5">
        <h3 className="text-sm font-semibold text-warm-900">User Funnel</h3>
        <span className="text-xs text-warm-400">Signup → Active</span>
      </div>

      <div className="space-y-3">
        {funnel.map((step, i) => {
          const widthPercent = maxCount > 0 ? (step.count / maxCount) * 100 : 0;
          const isDropoff = i > 0 && step.dropoffPct > 30;

          return (
            <div key={step.stage} className="flex items-center gap-2 sm:gap-3">
              {/* Label — narrower on mobile, fixed on sm+ */}
              <div className="w-[90px] sm:w-[130px] text-right flex-shrink-0">
                <p className="text-[11px] sm:text-xs font-medium text-warm-700 leading-tight">
                  {step.stage}
                </p>
              </div>

              {/* Bar */}
              <div className="flex-1 relative min-w-0">
                <div className="h-7 rounded-lg bg-warm-50 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-lg transition-all duration-700 flex items-center justify-end pr-2',
                      i === 0
                        ? 'bg-gradient-to-r from-primary-500 to-primary-400'
                        : widthPercent >= 50
                          ? 'bg-gradient-to-r from-primary-500 to-primary-400'
                          : widthPercent >= 25
                            ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                            : 'bg-gradient-to-r from-red-500 to-red-400',
                    )}
                    style={{ width: `${Math.max(widthPercent, 8)}%` }}
                  >
                    {widthPercent > 20 && (
                      <span className="text-[10px] sm:text-micro font-bold text-white tabular-nums">
                        {step.count}
                      </span>
                    )}
                  </div>
                </div>
                {/* Dropoff indicator */}
                {i > 0 && step.dropoffPct > 0 && (
                  <div className={cn(
                    'absolute -top-1 right-0 text-[9px] font-semibold tabular-nums px-1 py-0.5 rounded',
                    isDropoff ? 'text-red-600 bg-red-50' : 'text-warm-400'
                  )}>
                    −{step.dropoffPct}%
                  </div>
                )}
              </div>

              {/* Count — abbreviated on mobile to save space */}
              <div className="w-12 sm:w-16 text-right flex-shrink-0">
                <span className="text-sm font-bold text-warm-900 tabular-nums">{step.count}</span>
                <span className="hidden sm:inline text-micro text-warm-400 ml-1">
                  ({step.percentage}%)
                </span>
                {/* Percentage on its own line on mobile */}
                <span className="block sm:hidden text-[10px] text-warm-400 tabular-nums">
                  {step.percentage}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Conversion rate summary */}
      {funnel.length >= 2 && (
        <div className="mt-4 pt-3 border-t border-warm-100">
          <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
            <span className="text-warm-400 leading-snug">
              Overall: {funnel[0]?.stage} → {funnel[funnel.length - 1]?.stage}
            </span>
            <span className={cn(
              'font-semibold tabular-nums',
              (funnel[funnel.length - 1]?.percentage ?? 0) > 30 ? 'text-primary-600' : 'text-amber-600'
            )}>
              {funnel[funnel.length - 1]?.percentage ?? 0}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
