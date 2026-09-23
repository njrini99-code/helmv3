/**
 * Pure lifecycle evaluator for `upsertInsight` (Rule 3 of the design
 * contract). Both write branches — the <5% refresh and the >=5% movement —
 * and the insert path go through here so the state graph lives in ONE place.
 *
 * State graph:
 *
 *   insert ──(conf >= floor)──► detected ──(3 independent confirmations)──► matured ► addressed ► resolved
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
 * 2026-09-22 (R1/R2 leftovers): maturation used to advance on ANY >=5% write
 * (`movement_count`), including a swing counted while the row was still
 * `tentative` (invisible). A row could accumulate 3 movements pre-promotion
 * and jump straight to `matured` on its FIRST post-promotion write — "matured"
 * without ever having been seen. Maturation now requires `MATURATION_CONFIRMATIONS`
 * DISTINCT evidence revisions (`evidenceRevisionKey`, keyed off `sample_n` +
 * `window_end` by the caller) counted only while the row is `detected`, and the
 * confirmation list is reset to empty on every `promoted`/`resurrected`
 * transition — a movement recorded before the row became visible never counts
 * toward maturing it. `metadata.movement_count` (raw >=5% swing counter, used
 * by the cron's Rule 2 "never moved" archive check) is unaffected — it is a
 * different question ("did this ever move at all") from "how many independent
 * new-round confirmations has this had since becoming visible".
 *
 * Deliberately NOT done here:
 *  - No `status` handling: a coach dismissal (`status='dismissed'`) hides the
 *    row regardless of lifecycle and is never written by the engine.
 *  - No cron-side promotion: only a write carrying freshly recomputed
 *    evidence may promote. A maintenance scan over a stale stored confidence
 *    must not surface stale evidence as new.
 */
import type { InsightLifecycleState } from './types';

/** Confidence at or above which a row is coach-visible on insert / promotion. */
export const TENTATIVE_CONFIDENCE_FLOOR = 0.4;
/** Distinct new-evidence confirmations needed for detected → matured. */
export const MATURATION_CONFIRMATIONS = 3;

export type LifecycleTransition = 'none' | 'promoted' | 'matured' | 'resurrected';

export interface LifecycleWriteDecision {
  next: InsightLifecycleState;
  transition: LifecycleTransition;
  /** True when this write takes the row from invisible to coach-visible. */
  becomesVisible: boolean;
  /**
   * New value for `metadata.maturation_keys` when it changed this write
   * (a fresh confirmation was recorded, or the list was reset on
   * promotion/resurrection). `undefined` means "leave metadata alone" —
   * distinct from `[]`, which means "persist an explicit reset".
   */
  maturationKeys?: readonly string[];
}

export interface LifecycleWriteInput {
  existing: InsightLifecycleState | null;
  /** Freshly recomputed confidence for THIS write (never the stored value). */
  confidence: number;
  /** True only on the >=5% movement branch. */
  movedThisWrite: boolean;
  /**
   * Fingerprint of the evidence driving THIS write — e.g. `${sample_n}|
   * ${window_end}`. Two writes over the identical source rounds share a key;
   * a genuinely new completed round changes it. Only used when `existing`
   * is `detected` and `movedThisWrite` is true.
   */
  evidenceRevisionKey: string;
  /**
   * Distinct evidence-revision keys already counted toward maturation
   * (`metadata.maturation_keys`, empty when absent). Reset to `[]` by the
   * caller whenever the row (re)entered `detected` via `promoted` or
   * `resurrected` — see `maturationKeys` on the decision.
   */
  priorMaturationKeys: readonly string[];
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
    // sub-floor confidence. A fresh visibility period starts a fresh
    // maturation count: confirmations from before the archive must not carry
    // over and let a resurrected row mature on its very next movement.
    const next = resolveLifecycleOnInsert(input.confidence);
    return { next, transition: 'resurrected', becomesVisible: next === 'detected', maturationKeys: [] };
  }

  if (existing === 'tentative') {
    if (clearsFloor && input.promotionEnabled) {
      // Becoming visible for the first time: any movements counted while
      // invisible must not carry over (2026-09-22 gap — see header).
      return { next: 'detected', transition: 'promoted', becomesVisible: true, maturationKeys: [] };
    }
    return { next: 'tentative', transition: 'none', becomesVisible: false };
  }

  if (existing === 'detected') {
    let keys = input.priorMaturationKeys;
    if (input.movedThisWrite && !keys.includes(input.evidenceRevisionKey)) {
      keys = [...keys, input.evidenceRevisionKey];
    }
    if (keys.length >= MATURATION_CONFIRMATIONS) {
      return { next: 'matured', transition: 'matured', becomesVisible: false, maturationKeys: keys };
    }
    if (keys !== input.priorMaturationKeys) {
      return { next: 'detected', transition: 'none', becomesVisible: false, maturationKeys: keys };
    }
    return { next: 'detected', transition: 'none', becomesVisible: false };
  }

  return { next: existing, transition: 'none', becomesVisible: false };
}
