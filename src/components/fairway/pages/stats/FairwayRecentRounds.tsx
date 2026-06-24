'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { StatsSection, StatsStaggerGrid, StatsStaggerItem } from './StatsSection';
import { MotionDiv, useStatsMotion } from './fairway-stats-motion';
import type { TrendAnalysisResponse } from '@/app/golf/actions/stats-data-types';

function fmtPct(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return `${Math.round(v)}%`;
}

export function FairwayRecentRounds({
  rounds,
  showDetail = false,
}: {
  rounds: TrendAnalysisResponse['rounds'];
  showDetail?: boolean;
}) {
  const motion = useStatsMotion();
  const recent = [...rounds].slice(-8).reverse();
  if (recent.length === 0) return null;

  return (
    <StatsSection title="Recent rounds" description="Tap a round to open the full review." accent="accent">
      <StatsStaggerGrid className="flex flex-col gap-2">
        {recent.map((round) => {
          const toPar = round.toPar ?? 0;
          const toneClass =
            toPar < 0 ? 'text-accent-700 bg-accent-600/10' : toPar > 0 ? 'text-fw-warning bg-fw-warning-bg/50' : 'text-text-secondary bg-surface-sunken';
          const formattedDate = new Date(round.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
          const gir = fmtPct(round.girPct);
          const fw = fmtPct(round.fairwayPct);
          const scramble = fmtPct(round.scrambling);

          return (
            <StatsStaggerItem key={round.id}>
              <MotionDiv {...motion.tile}>
                <Link
                  href={`/golf/dashboard/rounds/${round.id}/review`}
                  className="group flex items-center gap-4 rounded-card border border-border-subtle bg-surface px-4 py-3 outline-none transition-colors [transition-duration:180ms] hover:border-accent-600/30 hover:bg-accent-600/5 focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <span
                    className={cn(
                      'grid h-11 w-11 shrink-0 place-items-center rounded-fw-md font-fw-mono text-body font-semibold tabular-nums',
                      toneClass,
                    )}
                  >
                    {round.score ?? '—'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-fw-sans text-body-sm font-medium text-text-primary group-hover:text-accent-800">
                      {round.courseName || 'Unknown course'}
                    </span>
                    <span className="font-fw-sans text-caption text-text-tertiary">{formattedDate}</span>
                    {showDetail ? (
                      <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-fw-sans text-caption text-text-tertiary">
                        {gir ? <span>GIR {gir}</span> : null}
                        {fw ? <span>FW {fw}</span> : null}
                        {scramble ? <span>Scramble {scramble}</span> : null}
                        {round.putts != null ? <span>{round.putts} putts</span> : null}
                      </span>
                    ) : null}
                  </span>
                  <span className={cn('font-fw-mono text-body-sm font-medium tabular-nums', toneClass.split(' ')[0])}>
                    {toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar}
                  </span>
                </Link>
              </MotionDiv>
            </StatsStaggerItem>
          );
        })}
      </StatsStaggerGrid>
    </StatsSection>
  );
}
