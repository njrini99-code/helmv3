'use client';

/**
 * ============================================================================
 * RoundsDrill — `?area=rounds` (spec §5.1, "last-10 list")
 * ----------------------------------------------------------------------------
 * The last 10 logged rounds, each linking out to its own Round Review.
 * ========================================================================== */

import Link from 'next/link';
import { DrillPanel, useStage } from '@/components/fairway/modules';
import { EmptyState } from '@/components/fairway';
import type { TrendAnalysisResponse } from '@/app/golf/actions/stats-data-types';

export interface RoundsDrillProps {
  rounds: TrendAnalysisResponse['rounds'];
}

export function RoundsDrill({ rounds }: RoundsDrillProps) {
  const { home } = useStage();
  const recent = [...rounds].slice(-10).reverse();

  return (
    <DrillPanel title="Last 10 rounds" backLabel="All areas" onBack={home}>
      {recent.length === 0 ? (
        <EmptyState title="No rounds yet" description="Logged rounds will appear here." />
      ) : (
        <div className="flex flex-col gap-2">
          {recent.map((round) => {
            const toPar = round.toPar ?? 0;
            const toneClass = toPar < 0 ? 'text-accent-600' : toPar > 0 ? 'text-fw-warning' : 'text-text-secondary';
            const formattedDate = new Date(round.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return (
              <Link
                key={round.id}
                href={`/golf/dashboard/rounds/${round.id}`}
                className="group flex items-center gap-4 rounded-card border border-border-subtle bg-surface px-4 py-3 outline-none transition-colors [transition-duration:180ms] hover:bg-surface-tint focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
              >
                <span className={`grid h-11 w-11 flex-shrink-0 place-items-center rounded-fw-md bg-inset font-fw-mono text-body font-medium tabular-nums ${toneClass}`}>
                  {round.score ?? '--'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                      {round.courseName || 'Unknown course'}
                    </span>
                    {round.roundType ? (
                      <span className="rounded-full bg-inset px-1.5 py-0.5 font-fw-sans text-eyebrow font-medium capitalize text-text-tertiary">
                        {round.roundType.replace(/_/g, ' ')}
                      </span>
                    ) : null}
                  </span>
                  <span className="block font-fw-sans text-caption text-text-tertiary">{formattedDate}</span>
                </span>
                <span className={`font-fw-mono text-body-sm font-medium tabular-nums ${toneClass}`}>
                  {toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </DrillPanel>
  );
}
