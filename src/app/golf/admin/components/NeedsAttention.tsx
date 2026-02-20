'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';

interface Props {
  items: AdminDashboardData['needsAttention'];
}

const severityOrder: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const dotColors = {
  info: 'bg-primary-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
};

const itemGradients = {
  info: 'bg-gradient-to-r from-primary-50/30 to-transparent',
  warning: 'bg-gradient-to-r from-amber-50/30 to-transparent',
  critical: 'bg-gradient-to-r from-red-50/30 to-transparent',
};

export function NeedsAttention({ items }: Props) {
  const sorted = [...items].sort(
    (a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2)
  );

  const allClear = sorted.length > 0 && sorted.every((item) => item.severity === 'info');

  return (
    <div className="glass-standard rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-white/50 rounded-lg text-warm-500">
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-warm-900">Needs Attention</h3>
      </div>

      {/* All clear state */}
      {allClear ? (
        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-primary-50/50 to-primary-50/20 py-3 px-4">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-primary-500" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-primary-500 animate-ping opacity-75" />
          </div>
          <div>
            <p className="text-sm font-medium text-primary-700">All clear</p>
            <p className="text-xs text-primary-600/70">No issues detected — platform is running smoothly</p>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((item, i) => (
            <div
              key={i}
              className={cn(
                'flex items-start gap-2.5 rounded-xl py-2.5 px-3 transition-all duration-200',
                itemGradients[item.severity]
              )}
            >
              <div className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-1.5', dotColors[item.severity])} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-warm-900 leading-snug">{item.label}</p>
                <p className="text-xs text-warm-400 mt-0.5">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
