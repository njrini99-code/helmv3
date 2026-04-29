'use client';

import { cn } from '@/lib/utils';
import { IconFileText } from '@/components/icons';
import type { TemplatePerformanceRow } from '@/app/golf/actions/crm-insights';

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
  if (rate === null) return 'bg-warm-100';
  if (kind === 'open') {
    if (rate >= 0.4) return 'bg-emerald-500';
    if (rate >= 0.2) return 'bg-amber-400';
    return 'bg-red-400';
  }
  // click rates are typically much lower than open rates
  if (rate >= 0.1) return 'bg-emerald-500';
  if (rate >= 0.03) return 'bg-amber-400';
  return 'bg-red-400';
}

export function TemplatePerformanceTable({ rows, loading }: TemplatePerformanceTableProps) {
  if (loading) {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-5">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-warm-50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-12 text-center">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
          <IconFileText size={22} className="text-blue-400" />
        </div>
        <p className="text-sm font-semibold text-warm-700">No template sends yet</p>
        <p className="text-xs text-warm-500 mt-1 max-w-xs mx-auto">
          Per-template performance appears after you send a campaign whose subject
          matches one of your saved email templates.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass overflow-hidden">
      <div className="px-5 py-4 border-b border-warm-100/60 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-warm-900">Template Performance</h3>
        <span className="text-xs text-warm-500 tabular-nums">{rows.length} templates</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-warm-500 uppercase tracking-wider border-b border-warm-100/60">
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
                className="border-b border-warm-100/40 last:border-b-0 hover:bg-warm-50/40 transition-colors"
              >
                <td className="px-5 py-3 align-middle">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                      <IconFileText size={12} />
                    </span>
                    <span className="font-medium text-warm-800 truncate">{row.template_name}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-warm-700">
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
                    row.bounced_count > 0 ? 'text-red-600' : 'text-warm-400',
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
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-warm-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-300', color)}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <span className="text-xs text-warm-700 tabular-nums w-10 text-right">{label}</span>
    </div>
  );
}
