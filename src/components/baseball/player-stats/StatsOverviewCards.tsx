'use client';

/**
 * StatsOverviewCards — the career slash-line + supplementary measurables.
 *
 * Living Annual migration (design-system-living-annual.md §7; execution plan
 * §3.1 my-stats). PRESENTATION ONLY — same `BaseballPlayerAggregates` shape
 * the caller already fetched via `getMyAggregates()`, no new reads.
 *
 * AVG/OBP/SLG render as one `<SlashLine>` (AVG leads — the headline figure a
 * scorekeeper reads first), OPS rides its own `<StatReadout>`, and Last-5 AVG
 * / exit velocity / sessions ride a `<KPIContentsStrip>` row. Every rate
 * figure is pre-formatted via the kit's `formatRate` (leading zero dropped
 * below 1, kept at/above 1 for OPS) before it reaches a `<StatReadout>` —
 * replacing the old hand-rolled `.toFixed(3)` display. No aggregates at all
 * → the honest `stats` `<EmptyIssue>`, never a fabricated `---` card.
 */
import {
  PaperCard,
  Eyebrow,
  SlashLine,
  StatReadout,
  KPIContentsStrip,
  EmptyIssue,
  formatRate,
} from '@/components/baseball/living-annual';
import { cn } from '@/lib/utils';
import type { BaseballPlayerAggregates } from '@/lib/types';

interface StatsOverviewCardsProps {
  aggregates: BaseballPlayerAggregates | null;
  className?: string;
}

export function StatsOverviewCards({ aggregates, className }: StatsOverviewCardsProps) {
  if (!aggregates) {
    return <EmptyIssue variant="stats" className={className} />;
  }

  return (
    <PaperCard registrationTick className={cn('p-6', className)}>
      <Eyebrow ink="team">Career slash line</Eyebrow>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
        <SlashLine
          avg={aggregates.career_avg ?? NaN}
          obp={aggregates.career_obp ?? NaN}
          slg={aggregates.career_slg ?? NaN}
          leader="avg"
          size="lg"
        />
        <div className="flex flex-col items-end gap-1">
          <span className="text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">OPS</span>
          <StatReadout value={formatRate(aggregates.career_ops ?? NaN, 3)} ariaLabel="OPS" className="text-h1" />
        </div>
      </div>

      <div className="mt-8">
        <KPIContentsStrip
          columns={2}
          items={[
            {
              label: 'Last 5',
              value: aggregates.last_5_avg != null ? formatRate(aggregates.last_5_avg, 3) : '—',
            },
            { label: 'Sessions', value: aggregates.total_sessions },
          ]}
        />
      </div>
    </PaperCard>
  );
}
