'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { IconWarning, IconAlertCircle } from '@/components/icons';

interface NeedsAttentionProps {
  items: AdminDashboardData['needsAttention'];
  onNavigateTab?: (tab: string) => void;
}

/** Map generic labels to clearer human-readable descriptions */
function humanizeDetail(item: { label: string; detail: string; severity: string }): string {
  const d = item.detail;
  // Already descriptive enough — return as-is
  if (d && d.length > 10) return d;
  // Fallback: combine label + detail
  return `${item.label}${d ? ` — ${d}` : ''}`;
}

export function NeedsAttentionSection({ items, onNavigateTab }: NeedsAttentionProps) {
  // Only show warning or critical items
  const actionable = items.filter(
    (item) => item.severity === 'warning' || item.severity === 'critical'
  );

  if (actionable.length === 0) {
    return null;
  }

  return (
    <div className="bg-red-50/40 border border-red-200/30 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-semibold text-red-900">Needs Attention</h3>
        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold rounded-full bg-red-100 text-red-700">
          {actionable.length}
        </span>
      </div>

      <div className="space-y-3">
        {actionable.map((item, i) => (
          <div
            key={i}
            className={cn(
              'flex items-center justify-between gap-3 py-2',
              i < actionable.length - 1 && 'border-b border-red-100/50'
            )}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="mt-0.5 flex-shrink-0 text-current">
                {item.severity === 'critical' ? (
                  <IconAlertCircle size={16} className="text-red-500" />
                ) : (
                  <IconWarning size={16} className="text-amber-500" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-warm-900">{humanizeDetail(item)}</p>
                <p className="text-xs text-warm-500 mt-0.5">{item.label}</p>
              </div>
            </div>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab(item.tab)}
                className="min-h-[44px] flex-shrink-0 text-xs font-semibold text-red-700 hover:text-red-900 whitespace-nowrap transition-colors px-3 py-1.5 rounded-lg hover:bg-red-100/60"
              >
                View &rarr;
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
