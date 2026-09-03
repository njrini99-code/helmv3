/**
 * Earned Autonomy — what the self-heal loop may do unattended, per
 * feature × repair class, decided from RECORDED OUTCOMES.
 *
 * `docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §6 J.4.4:
 * "an extension of `selfheal-capability.ts`'s existing three-state model,
 * not a new trust system." This module reuses `CapabilityState`
 * (`'proven' | 'unproven' | 'unknown'`) as one input and adds the
 * `feature_id × repair_class` granularity the plan asks for, computed from
 * the recurrence/rollback signal `memory/operations/release-queue.yml`
 * already carries (a re-opened incident against the same
 * `feature_id`+root-cause, or a `status: verification_failed` entry).
 *
 * TWO STRUCTURAL GUARANTEES, both enforced by construction rather than by
 * instruction:
 *
 * 1. **This module can never widen its own permissions.** `AUTONOMY_CEILING`
 *    below is a hardcoded TS constant — never computed, never read from a
 *    config file a runbook or an agent could edit. `computeFeatureAutonomy`
 *    takes `ceiling` as a parameter defaulting to that constant SOLELY so a
 *    test can probe the clamp; production call sites always take the
 *    default. Every tier this function can return is
 *    `min(evidenceTier, ceiling)` — the evidence can only pull the result
 *    DOWN from the ceiling, never past it.
 * 2. **Missing or unknown evidence resolves to the most restrictive tier**
 *    (`'observe_only'`), never to an optimistic default. A feature this
 *    module has never evaluated, or cannot currently evaluate (a failed
 *    read), gets the least autonomy — the identical "unread input never
 *    yields the calm case" stance `risk-score.ts` and
 *    `canClaimAllClear` (`src/lib/admin/incidents/sources.ts`) already take.
 *
 * PURE. No I/O — `computeFeatureAutonomy` takes already-gathered evidence.
 */

import type { CapabilityState } from '@/lib/admin/selfheal-capability';

/**
 * Ordered least to most permissive. Vocabulary reused from
 * `config/release-policy.yml`'s `daily_reliability` block
 * (`may_prepare_repairs` / `may_open_or_update_repair_prs` /
 * `may_merge_verified_low_risk_repairs`) rather than inventing a parallel
 * taxonomy — this module answers "which of those may THIS feature's loop
 * exercise unattended", never whether to grant a permission that block does
 * not already grant globally. `may_deploy_production` never appears here:
 * `release-policy.yml` sets it `false` unconditionally and this module has
 * no tier that could override that.
 */
export const AUTONOMY_TIERS = [
  'observe_only',
  'may_prepare_repairs',
  'may_open_prs',
  'may_merge_low_risk',
] as const;
export type AutonomyTier = (typeof AUTONOMY_TIERS)[number];

/**
 * The hard ceiling. A human edit is the only way this changes — see the
 * module header. Set to match `config/release-policy.yml`'s CURRENT global
 * grant (`may_merge_verified_low_risk_repairs: true` is already the top
 * permission the loop holds today); this module only ever narrows that
 * per-feature, never widens it.
 */
export const AUTONOMY_CEILING: AutonomyTier = 'may_merge_low_risk';

function tierRank(tier: AutonomyTier): number {
  return AUTONOMY_TIERS.indexOf(tier);
}

function minTier(a: AutonomyTier, b: AutonomyTier): AutonomyTier {
  return tierRank(a) <= tierRank(b) ? a : b;
}

export interface FeatureAutonomyEvidence {
  featureId: string;
  repairClass: string;
  capabilityState: CapabilityState;
  /** `true` when a repair for this feature+repair_class was verified/
   *  released and then a new incident with the same root cause reopened —
   *  a real demotion signal. `null` when this could not be checked (never
   *  treated as `false`). */
  recentRecurrence: boolean | null;
  /** `true` when `memory/operations/release-queue.yml` carries a
   *  `status: verification_failed` entry for this feature+repair_class
   *  within the lookback window. `null` when unchecked. */
  recentVerificationFailure: boolean | null;
}

export interface FeatureAutonomyResult {
  featureId: string;
  repairClass: string;
  tier: AutonomyTier;
  reasons: readonly string[];
}

export function computeFeatureAutonomy(
  evidence: FeatureAutonomyEvidence,
  ceiling: AutonomyTier = AUTONOMY_CEILING,
): FeatureAutonomyResult {
  const reasons: string[] = [];

  // Hard demotion: recurrence or a verification failure overrides
  // everything else and returns the floor immediately — this is the "must
  // never require a human to notice" guarantee (J.5). Unknown (`null`) does
  // NOT trigger this branch (that would conflate "we don't know" with "it
  // recurred"), but unknown also never earns anything ABOVE the floor,
  // per the branch below.
  if (evidence.recentRecurrence === true) {
    return {
      featureId: evidence.featureId,
      repairClass: evidence.repairClass,
      tier: 'observe_only',
      reasons: ['A prior repair for this feature/repair class recurred — demoted to observe-only.'],
    };
  }
  if (evidence.recentVerificationFailure === true) {
    return {
      featureId: evidence.featureId,
      repairClass: evidence.repairClass,
      tier: 'observe_only',
      reasons: ['A recent verification failure is recorded for this feature/repair class — demoted to observe-only.'],
    };
  }

  if (evidence.capabilityState !== 'proven') {
    reasons.push(
      evidence.capabilityState === 'unknown'
        ? 'Capability could not be read for this stage — defaulting to observe-only.'
        : 'This stage has never demonstrably produced its output — defaulting to observe-only.',
    );
    return { featureId: evidence.featureId, repairClass: evidence.repairClass, tier: 'observe_only', reasons };
  }

  if (evidence.recentRecurrence === null || evidence.recentVerificationFailure === null) {
    reasons.push('Recurrence/verification-failure history could not be fully read — capped at observe-only until it can be.');
    return { featureId: evidence.featureId, repairClass: evidence.repairClass, tier: 'observe_only', reasons };
  }

  // Capability proven, no recurrence, no verification failure, both reads
  // succeeded — this feature/repair_class has earned the full ceiling.
  reasons.push('Capability proven; no recurrence or verification failure on record.');
  const tier = minTier(AUTONOMY_CEILING, ceiling);
  if (tier !== AUTONOMY_CEILING) {
    reasons.push(`Capped below the ceiling by an explicitly lower override (${ceiling}).`);
  }
  return { featureId: evidence.featureId, repairClass: evidence.repairClass, tier, reasons };
}
