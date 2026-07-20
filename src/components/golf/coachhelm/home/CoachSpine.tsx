'use client';

/**
 * ============================================================================
 * CoachSpine — the Coach Intelligence spine (spec §5.4)
 * ----------------------------------------------------------------------------
 * Thin composition over the `Spine` module: the composite/health hero (falls
 * back to an honest em-dash pre-stats), the directive verdict ("Work on this
 * first"), the top-3 flagged-player `PriorityList`, the players/attention/
 * last-analyzed `SpineLedger`, and a trajectory row rendered via `Spine`'s
 * `children` escape hatch (the module kit has no dedicated trajectory field —
 * see `types.ts`'s documented "surface-specific rows" contract).
 * ========================================================================== */

import { Spine } from '@/components/fairway/modules';
import type { PriorityItem } from '@/components/fairway/modules';

const HAIRLINE_COLOR = 'oklch(1 0 0 / 0.14)';

export interface CoachSpineProps {
  hero: { value: string; unit?: string };
  verdict: string;
  trajectorySentence: string;
  priorities: PriorityItem[];
  ledger: Array<{ label: string; value: string }>;
  className?: string;
}

export function CoachSpine({ hero, verdict, trajectorySentence, priorities, ledger, className }: CoachSpineProps) {
  return (
    <Spine
      eyebrow="Team Read"
      hero={hero}
      verdict={verdict}
      priorities={priorities}
      ledger={ledger}
      cta={{ label: 'Scan team', href: '/golf/dashboard/intelligence?view=signals&filter=alerts' }}
      className={className}
    >
      <hr aria-hidden="true" className="my-5 border-t" style={{ borderTopColor: HAIRLINE_COLOR }} />
      <p className="font-fw-display text-eyebrow uppercase tracking-[0.13em] text-accent-300">Trajectory</p>
      <p className="mt-1.5 font-fw-sans text-body-sm text-accent-100">{trajectorySentence}</p>
    </Spine>
  );
}
