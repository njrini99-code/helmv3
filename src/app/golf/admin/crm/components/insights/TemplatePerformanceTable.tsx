'use client';

import { cn } from '@/lib/utils';
import { IconFileText } from '@/components/icons';
import type { TemplatePerformanceRow } from '@/app/golf/actions/crm-insights';
import { EmptyState, Surface } from '@/components/fairway';

// ============================================================================
// TemplatePerformanceTable — sorted by send volume DESC.
// Shows Template, Sent, Open Rate, Click Rate, Bounces with color-graded bars
// for the rate columns. Glass surface mirroring CoachTable.
// ============================================================================

interface TemplatePerformanceTableProps {
  rows: TemplatePerformanceRow[];
  loading?: boolean;
}

function formatRate(rate: number | null): string {
  if (rate === null) return '—';
  return `${Math.round(rate * 100)}%`;
}

/** Map a 0..1 rate to a Tailwind color class, with a "no-data" fallback. */
function rateBarColor(rate: number | null, kind: 'open' | 'click'): string {
  if (rate === null) return 'bg-surface-sunken';
  if (kind === 'open') {
    if (rate >= 0.4) return 'bg-accent-500';
    if (rate >= 0.2) return 'bg-fw-warning/80';
    return 'bg-fw-danger/70';
  }
  // click rates are typically much lower than open rates
  if (rate >= 0.1) return 'bg-accent-500';
  if (rate >= 0.03) return 'bg-fw-warning/80';
  return 'bg-fw-danger/70';
}

export function TemplatePerformanceTable({ rows, loading }: TemplatePerformanceTableProps) {
  if (loading) {
    return (
      <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-5">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-surface-sunken rounded-fw-sm animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Surface padding="none">
        <EmptyState
          variant="subtle"
          icon={<IconFileText size={20} />}
          title="No template sends yet"
          description="Per-template performance appears after you send a campaign whose subject matches one of your saved email templates."
        />
      </Surface>
    );
  }

  return (
    <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] overflow-hidden">
      <div className="px-5 py-4 border-b border-border-subtle/60 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Template Performance</h3>
        <span className="text-xs text-text-tertiary tabular-nums">{rows.length} templates</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-text-tertiary uppercase tracking-wider border-b border-border-subtle/60">
              <th className="text-left font-medium px-5 py-2.5">Template</th>
              <th className="text-right font-medium px-3 py-2.5 tabular-nums">Sent</th>
              <th className="text-left font-medium px-3 py-2.5 min-w-[140px]">Open Rate</th>
              <th className="text-left font-medium px-3 py-2.5 min-w-[140px]">Click Rate</th>
              <th className="text-right font-medium px-5 py-2.5 tabular-nums">Bounces</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.template_id}
                className="border-b border-border-subtle last:border-b-0 hover:bg-surface-sunken/40 transition-colors"
              >
                <td className="px-5 py-3 align-middle">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 rounded-fw-sm bg-surface-sunken text-accent-700 flex items-center justify-center flex-shrink-0">
                      <IconFileText size={12} />
                    </span>
                    <span className="font-medium text-text-primary truncate">{row.template_name}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-text-secondary">
                  {row.sent_count.toLocaleString()}
                </td>
                <td className="px-3 py-3">
                  <RateBar
                    rate={row.open_rate}
                    label={formatRate(row.open_rate)}
                    color={rateBarColor(row.open_rate, 'open')}
                  />
                </td>
                <td className="px-3 py-3">
                  <RateBar
                    rate={row.click_rate}
                    label={formatRate(row.click_rate)}
                    color={rateBarColor(row.click_rate, 'click')}
                  />
                </td>
                <td
                  className={cn(
                    'px-5 py-3 text-right tabular-nums font-medium',
                    row.bounced_count > 0 ? 'text-fw-danger-ink' : 'text-text-tertiary',
                  )}
                >
                  {row.bounced_count.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// RateBar — small horizontal bar + label combo for the rate columns.
// ----------------------------------------------------------------------------
function RateBar({
  rate,
  label,
  color,
}: {
  rate: number | null;
  label: string;
  color: string;
}) {
  const widthPct = rate === null ? 0 : Math.max(2, Math.min(100, Math.round(rate * 100)));
  return (
    <div
      className="flex items-center gap-2"
      title={rate === null ? 'Pending delivery' : undefined}
    >
      <div className="flex-1 h-1.5 bg-surface-sunken rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-300', color)}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <span className="text-xs text-text-secondary tabular-nums w-10 text-right">{label}</span>
    </div>
  );
}
