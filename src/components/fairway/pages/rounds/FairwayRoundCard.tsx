/**
 * ============================================================================
 * Fairway · Rounds · FairwayRoundCard — SHARED round-tile pure helpers
 * ----------------------------------------------------------------------------
 * This file used to also export a `FairwayRoundCard` component (a card tile
 * alternative to the ledger row). Audit finding (round-2 mustFix #4): that
 * component was NEVER rendered anywhere — `FairwayRoundsLibrary` renders only
 * `FairwayRoundRow` for its history list, so `FairwayRoundCard` was dead code.
 * Worse, an earlier round of work "fixed" bug #139 (date off-by-one) inside
 * that unreachable component's local `formatDate`, which gave false
 * confidence that the date bug was resolved on a surface nothing ever
 * mounted — `FairwayRoundRow` (the row that IS rendered) already had its own
 * correct fix via the shared `@/lib/golf/date-only` helpers, entirely
 * independent of this file's dead `formatDate`.
 *
 * Deleted: the `FairwayRoundCard` component, its Props interface, its local
 * `formatDate`, and the `MicroStat` sub-component — none reachable from any
 * route. Kept: the three PURE helpers `FairwayRoundRow` genuinely imports
 * from this file (`scoreToParTone`, `getRoundTypeLabel`, and the re-exported
 * `formatToPar`), so nothing importing THIS file breaks. If a card-grid view
 * is wanted again, build it against these helpers rather than resurrecting
 * dead code — and wire it into `FairwayRoundsLibrary`'s render path so a fix
 * here can never again ship unreachable.
 * ========================================================================== */

import { formatToPar } from '@/lib/golf/format-to-par';

// Re-exported so FairwayRoundRow (the ledger row that actually renders) keeps
// importing the score-to-par formatter from here — the shared implementation
// now lives in @/lib/golf/format-to-par so the round hero, the row, and any
// future card all render the same Unicode minus.
export { formatToPar };

/** Score-to-par tone: under par = accent, level = neutral, over par = amber. */
type ScoreTone = 'under' | 'par' | 'over';

export function scoreToParTone(stp: number): ScoreTone {
  if (stp < 0) return 'under';
  if (stp === 0) return 'par';
  return 'over';
}

export function getRoundTypeLabel(type: string | null): string {
  switch (type) {
    case 'tournament':
      return 'Tournament';
    case 'qualifier':
    case 'qualifying':
      return 'Qualifier';
    case 'practice':
      return 'Practice';
    case 'casual':
      return 'Casual';
    default:
      return type ? type.replace(/_/g, ' ') : 'Round';
  }
}
