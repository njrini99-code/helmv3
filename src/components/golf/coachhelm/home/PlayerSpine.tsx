'use client';

/**
 * ============================================================================
 * PlayerSpine — the Player CoachHelm spine (spec §5.3)
 * ----------------------------------------------------------------------------
 * Thin composition over the `Spine` module: the predicted-score hero (falls
 * back to an honest em-dash pre-forecast), the prediction verdict, the
 * you/team/Tour `StandingTrack` (anchored on SG: Total — same rail idiom as
 * the Stats spine), the top-3 focus-area `PriorityList`, and the
 * rounds/fairways/greens/putts `SpineLedger`.
 * ========================================================================== */

import { Spine } from '@/components/fairway/modules';
import type { PriorityItem, StandingTrackProps } from '@/components/fairway/modules';

export interface PlayerSpineProps {
  hero: { value: string; unit?: string };
  verdict: string;
  track?: StandingTrackProps;
  priorities: PriorityItem[];
  ledger: Array<{ label: string; value: string }>;
  className?: string;
}

export function PlayerSpine({ hero, verdict, track, priorities, ledger, className }: PlayerSpineProps) {
  return (
    <Spine
      eyebrow="CoachHelm AI"
      hero={hero}
      verdict={verdict}
      track={track}
      priorities={priorities}
      ledger={ledger}
      cta={{ label: 'Log a round', href: '/golf/dashboard/rounds/new' }}
      className={className}
    />
  );
}
