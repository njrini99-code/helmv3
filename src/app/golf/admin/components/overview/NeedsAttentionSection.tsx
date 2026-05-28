'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { IconWarning, IconAlertCircle } from '@/components/icons';
import { Button } from '@/components/ui/button';

interface NeedsAttentionProps {
  items: AdminDashboardData['needsAttention'];
  openIncidents: number;
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

/** Check if an item is error/incident-related by label content */
function isErrorRelatedItem(item: { label: string }): boolean {
  const l = item.label.toLowerCase();
  return (
    l.includes('error') ||
    l.includes('incident') ||
    l.includes('network') ||
    l.includes('server')
  );
}

export function NeedsAttentionSection({ items, openIncidents, onNavigateTab }: NeedsAttentionProps) {
  // Only show warning or critical items
  // Additionally, filter out error-related items when there are 0 open incidents
  const actionable = items.filter((item) => {
    if (item.severity !== 'warning' && item.severity !== 'critical') return false;
    // If no open incidents, suppress error/incident-related attention items
    if (openIncidents === 0 && isErrorRelatedItem(item)) return false;
    return true;
  });

  if (actionable.length === 0) {
    return null;
  }

  return (
    <div className="glass-premium rounded-2xl p-5 border border-amber-200/40">
      <div className="flex items-center gap-2 mb-4">
        <IconWarning size={16} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-warm-900">Needs Attention</h3>
        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">
          {actionable.length}
        </span>
      </div>

      <div className="space-y-3">
        {actionable.map((item, i) => (
          <div
            key={i}
            className={cn(
              'flex items-center justify-between gap-3 py-2',
              i < actionable.length - 1 && 'border-b border-warm-100/50'
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
              <Button variant="ghost"
                onClick={() => onNavigateTab(item.tab)}
                className="min-h-[44px] flex-shrink-0 text-xs font-semibold text-warm-600 hover:text-warm-900 whitespace-nowrap transition-colors px-3 py-1.5 rounded-lg hover:bg-warm-100/60"
              >
                View &rarr;
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
