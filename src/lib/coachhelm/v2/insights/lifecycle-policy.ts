/**
 * Pure lifecycle evaluator for `upsertInsight` (Rule 3 of the design
 * contract). Both write branches — the <5% refresh and the >=5% movement —
 * and the insert path go through here so the state graph lives in ONE place.
 *
 * State graph:
 *
 *   insert ──(conf >= floor)──► detected ──(3 movements)──► matured ► addressed ► resolved
 *     │                            ▲
 *     └──(conf < floor)──► tentative ──(conf >= floor, team gate open)──┘
 *
 *   archived ──(re-emitted)──► tentative | detected   (same confidence gate)
 *
 * 2026-09-12 (RC0): the `tentative → detected` edge did not exist. A row
 * first written on a thin sample (e.g. 6 approaches → sample adequacy 0.24)
 * was inserted invisible and every later run refreshed its evidence — to
 * confidence 1.0 on 45+ shots — without re-evaluating lifecycle. Production
 * held 326 tentative v3 rows, 167 with real sample support. Only the cron's
 * demotion edge (detected → tentative on decayed confidence) existed.
 *
 * Deliberately NOT done here:
 *  - No promotion straight to `matured`: `movement_count` tracks >=5% value
 *    swings, not independent confirmations, so an old counter reaching 3 says
 *    nothing about a row that was never visible.
 *  - No `status` handling: a coach dismissal (`status='dismissed'`) hides the
 *    row regardless of lifecycle and is never written by the engine.
 *  - No cron-side promotion: only a write carrying freshly recomputed
 *    evidence may promote. A maintenance scan over a stale stored confidence
 *    must not surface stale evidence as new.
 */
import type { InsightLifecycleState } from './types';

/** Confidence at or above which a row is coach-visible on insert / promotion. */
export const TENTATIVE_CONFIDENCE_FLOOR = 0.4;
/** >=5% value movements needed for detected → matured. */
export const MATURATION_MOVEMENTS = 3;

export type LifecycleTransition = 'none' | 'promoted' | 'matured' | 'resurrected';

export interface LifecycleWriteDecision {
  next: InsightLifecycleState;
  transition: LifecycleTransition;
  /** True when this write takes the row from invisible to coach-visible. */
  becomesVisible: boolean;
}

export interface LifecycleWriteInput {
  existing: InsightLifecycleState | null;
  /** Freshly recomputed confidence for THIS write (never the stored value). */
  confidence: number;
  /** `metadata.movement_count` after this write (unchanged on a refresh). */
  nextMovementCount: number;
  /** True only on the >=5% movement branch. */
  movedThisWrite: boolean;
  /** Team gate (`golf_team_coachhelm_settings.preferences.tentative_promotion_enabled`). */
  promotionEnabled: boolean;
}

export function resolveLifecycleOnInsert(confidence: number): InsightLifecycleState {
  return confidence < TENTATIVE_CONFIDENCE_FLOOR ? 'tentative' : 'detected';
}

export function resolveLifecycleOnWrite(input: LifecycleWriteInput): LifecycleWriteDecision {
  const existing = input.existing ?? 'detected';
  const clearsFloor = input.confidence >= TENTATIVE_CONFIDENCE_FLOOR;

  if (existing === 'archived') {
    // RESURRECTION (to-95 audit P2): a re-emitted signature whose row was
    // archived must return to a visible state through the SAME confidence
    // gate as a fresh insert (regrade NEW-P2) — never straight to visible on
    // sub-floor confidence.
    const next = resolveLifecycleOnInsert(input.confidence);
    return { next, transition: 'resurrected', becomesVisible: next === 'detected' };
  }

  if (existing === 'tentative') {
    if (clearsFloor && input.promotionEnabled) {
      return { next: 'detected', transition: 'promoted', becomesVisible: true };
    }
    return { next: 'tentative', transition: 'none', becomesVisible: false };
  }

  if (
    existing === 'detected' &&
    input.movedThisWrite &&
    input.nextMovementCount >= MATURATION_MOVEMENTS
  ) {
    return { next: 'matured', transition: 'matured', becomesVisible: false };
  }

  return { next: existing, transition: 'none', becomesVisible: false };
}
