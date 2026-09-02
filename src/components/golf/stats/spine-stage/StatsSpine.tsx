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
import { surfaceHref } from '@/lib/golf/surface-registry';
import { formatSgSigned } from './buildStatsViewModel';

export interface StatsSpineProps {
  sgTotal: number | null;
  scoringAverage: number | null;
  verdict: string;
  track?: StandingTrackProps;
  priorities: PriorityItem[];
  ledger: Array<{ label: string; value: string }>;
  /**
   * Who is reading this spine. Selects the Ask CTA's destination — this
   * surface renders both on a player's own stats and on a coach's view of
   * that player, and the two roles have different CoachHelm front doors.
   */
  viewerContext?: 'self' | 'coach';
  /** Coach path only — seeds the Ask composer with the player in question. */
  playerName?: string | null;
  className?: string;
}

export function StatsSpine({
  sgTotal,
  scoringAverage,
  verdict,
  track,
  priorities,
  ledger,
  viewerContext = 'self',
  playerName,
  className,
}: StatsSpineProps) {
  const hero =
    sgTotal !== null
      ? { value: formatSgSigned(sgTotal), unit: 'SG / rd' }
      : scoringAverage !== null
        ? { value: scoringAverage.toFixed(1), unit: 'scoring avg' }
        : { value: '—' };

  // Role-aware Ask destination. This used to be a hardcoded
  // `/golf/dashboard/coachhelm` — the PLAYER-only front door — so a coach who
  // tapped Ask CoachHelm on a player's page landed on "This CoachHelm
  // dashboard is the player view" with nothing but a button back to Brief
  // (owner report, 2026-08-26; the player-route page itself says to fix this
  // by never linking a coach there). Hrefs come from the surface registry, the
  // single source of truth for CoachHelm surfaces — never hand-written here.
  const askHref =
    viewerContext === 'coach'
      ? playerName
        ? `${surfaceHref('ask')}?q=${encodeURIComponent(`What should I work on with ${playerName}?`)}`
        : surfaceHref('ask')
      : surfaceHref('overview');

  return (
    <Spine
      eyebrow="Strokes Gained"
      hero={hero}
      verdict={verdict}
      track={track}
      priorities={priorities}
      ledger={ledger}
      cta={{ label: 'Ask CoachHelm', href: askHref }}
      className={className}
    />
  );
}
