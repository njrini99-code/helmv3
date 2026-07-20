'use client';

/**
 * ============================================================================
 * StatsSpine — the Player Stats spine (spec §5.1)
 * ----------------------------------------------------------------------------
 * Thin composition over the `Spine` module: SG: Total as the hero (falls back
 * to scoring average when SG hasn't computed yet), the synthesized verdict,
 * the you/team/Tour `StandingTrack`, the top-3 weakness `PriorityList`, and
 * the Rounds/Fairways/Greens/Putts `SpineLedger` — the ONLY place the 30d
 * ledger numbers render on this surface (see `buildStatsViewModel`).
 * ========================================================================== */

import { Spine } from '@/components/fairway/modules';
import type { PriorityItem, StandingTrackProps } from '@/components/fairway/modules';
import { formatSgSigned } from './buildStatsViewModel';

export interface StatsSpineProps {
  sgTotal: number | null;
  scoringAverage: number | null;
  verdict: string;
  track?: StandingTrackProps;
  priorities: PriorityItem[];
  ledger: Array<{ label: string; value: string }>;
  className?: string;
}

export function StatsSpine({
  sgTotal,
  scoringAverage,
  verdict,
  track,
  priorities,
  ledger,
  className,
}: StatsSpineProps) {
  const hero =
    sgTotal !== null
      ? { value: formatSgSigned(sgTotal), unit: 'SG / rd' }
      : scoringAverage !== null
        ? { value: scoringAverage.toFixed(1), unit: 'scoring avg' }
        : { value: '—' };

  return (
    <Spine
      eyebrow="Strokes Gained"
      hero={hero}
      verdict={verdict}
      track={track}
      priorities={priorities}
      ledger={ledger}
      cta={{ label: 'Ask CoachHelm', href: '/golf/dashboard/coachhelm' }}
      className={className}
    />
  );
}
