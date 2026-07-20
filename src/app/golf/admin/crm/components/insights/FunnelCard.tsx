'use client';

import { cn } from '@/lib/utils';
import type { CrmFunnel } from '@/app/golf/actions/crm-insights';
import { widthPct, stepConversion } from './funnel-math';

// ============================================================================
// FunnelCard — outreach funnel (Sent → Delivered → Opened → Clicked →
// Replied) for the Insights dashboard. Full-width, sits between
// DeliverabilityCards and the chart/heatmap grid.
// ============================================================================

interface FunnelCardProps {
  funnel: CrmFunnel | null;
  loading: boolean;
}

interface FunnelStage {
  label: string;
  value: (f: CrmFunnel) => number;
  /** bg-primary-600 opacity for this stage's fill, stepped down per row. */
  fillOpacity: 100 | 85 | 70 | 55 | 40;
}

const STAGES: FunnelStage[] = [
  { label: 'Sent', value: (f) => f.sent, fillOpacity: 100 },
  { label: 'Delivered', value: (f) => f.delivered, fillOpacity: 85 },
  { label: 'Opened', value: (f) => f.opened, fillOpacity: 70 },
  { label: 'Clicked', value: (f) => f.clicked, fillOpacity: 55 },
  { label: 'Replied', value: (f) => f.replied, fillOpacity: 40 },
];

const FILL_OPACITY_CLASS: Record<FunnelStage['fillOpacity'], string> = {
  100: 'bg-primary-600/100',
  85: 'bg-primary-600/85',
  70: 'bg-primary-600/70',
  55: 'bg-primary-600/55',
  40: 'bg-primary-600/40',
};

export function FunnelCard({ funnel, loading }: FunnelCardProps) {
  if (loading) {
    return (
      <div className="glass-standard rounded-2xl shadow-glass p-6">
        <div className="h-48 bg-warm-50 rounded-xl animate-pulse" />
      </div>
    );
  }

  const sent = funnel?.sent ?? 0;
  const isEmpty = !funnel || sent === 0;

  return (
    <div className="glass-standard rounded-2xl shadow-glass p-6">
      <div className="mb-5">
        <h3 className="text-base font-bold text-warm-900 tracking-tight">Outreach funnel</h3>
        <p className="text-micro text-warm-500 mt-0.5">
          Emails sent → replies, this window
        </p>
      </div>

      {isEmpty ? (
        <div className="h-48 flex items-center justify-center">
          <p className="text-caption text-warm-400">No sends in this window.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {STAGES.map((stage, i) => {
              const value = stage.value(funnel);
              const previous = i === 0 ? null : STAGES[i - 1].value(funnel);
              const conversion = stepConversion(value, previous);
              return (
                <div key={stage.label} className="flex items-center gap-3">
                  <span className="w-24 text-caption text-warm-700 flex-shrink-0">
                    {stage.label}
                  </span>
                  <div className="flex-1 h-7 rounded-lg bg-cream-100 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-lg transition-[width] duration-300',
                        FILL_OPACITY_CLASS[stage.fillOpacity],
                      )}
                      style={{ width: `${widthPct(value, sent)}%` }}
                    />
                  </div>
                  <span className="w-16 text-caption tabular-nums text-warm-900 text-right flex-shrink-0">
                    {value.toLocaleString()}
                  </span>
                  <span className="w-14 text-micro tabular-nums text-warm-400 text-right flex-shrink-0">
                    {conversion === null ? '—' : `${conversion}%`}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-micro text-warm-500 mt-4">
            {funnel.coaches_emailed.toLocaleString()} coaches emailed{' '}
            · {funnel.coaches_opened.toLocaleString()} opened{' '}
            · {funnel.coaches_clicked.toLocaleString()} clicked{' '}
            · {funnel.coaches_replied.toLocaleString()} replied
          </p>
        </>
      )}
    </div>
  );
}
