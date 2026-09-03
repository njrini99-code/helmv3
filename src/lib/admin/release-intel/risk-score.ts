/**
 * Change-risk scoring — pure function over already-available inputs.
 *
 * `docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §4 F.4.1.
 * No I/O, no `server-only`, no clock — every fact this function reasons over
 * arrives as a `ChangeRiskInput` the caller already gathered (from a real
 * `git diff` in `scripts/release-intel/score-change.ts`, or from whatever a
 * Bridge read model could statically read for a queued release-queue item).
 * That split is what makes this file unit-testable with fixed synthetic
 * diffs, per F.5.
 *
 * PHILOSOPHY (F.7): "A risk score wrong in the LOW direction is dangerous
 * (under-verifies a real R3 change); wrong in the HIGH direction is merely
 * annoying." Every branch below is written to prefer escalating the tier
 * over defaulting an unknown input to the calm case — the identical stance
 * `canClaimAllClear` (`src/lib/admin/incidents/sources.ts`) already takes
 * for incident read models: a blind input never yields the optimistic
 * verdict.
 */

import type { ChangeRiskInput, ChangeRiskReason, ChangeRiskScore, RiskTier } from './types';

const TIER_ORDER: readonly RiskTier[] = ['R0', 'R1', 'R2', 'R3'];

function maxTier(a: RiskTier, b: RiskTier): RiskTier {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b;
}

/** Every field this function ever asked of `input`, in read order — reused
 *  to build `inputsMissing` without repeating the field list a second time
 *  and risking the two lists drifting apart. */
const INPUT_FIELDS: ReadonlyArray<keyof ChangeRiskInput> = [
  'featureCriticalities',
  'impactedFeatureCount',
  'touchesMigration',
  'touchesAuthOrRls',
  'touchesDestructiveWrite',
  'incidentDensity',
  'testCoverageConfidence',
];

function isMissing(input: ChangeRiskInput, field: keyof ChangeRiskInput): boolean {
  const value = input[field];
  if (field === 'featureCriticalities') {
    // Missing only when the array itself carries no readable entries — an
    // empty array (zero touched features) is a real fact, not a gap.
    return (value as ChangeRiskInput['featureCriticalities']).length > 0 &&
      (value as ChangeRiskInput['featureCriticalities']).every((c) => c === null);
  }
  return value === null;
}

export function scoreChange(input: ChangeRiskInput): ChangeRiskScore {
  const reasons: ChangeRiskReason[] = [];
  let tier: RiskTier = 'R0';

  const raise = (next: RiskTier, field: keyof ChangeRiskInput, detail: string) => {
    const before = tier;
    tier = maxTier(tier, next);
    reasons.push({ input: field, detail, raisedTier: tier !== before });
  };

  // --- Destructive writes and migrations: the two signals this repo's own
  // risk vocabulary (`memory/system/golfhelm-engineering-os.md` "Risk
  // tiers") already treats as an automatic floor. Unknown escalates exactly
  // like "yes" — F.7's stated bias. ---
  if (input.touchesMigration === true) {
    raise('R2', 'touchesMigration', 'Diff touches supabase/migrations/** — schema changes are never below R2.');
  } else if (input.touchesMigration === null) {
    raise('R2', 'touchesMigration', 'Migration involvement could not be determined — treated as touching a migration.');
  }

  if (input.touchesDestructiveWrite === true) {
    raise('R2', 'touchesDestructiveWrite', 'Diff contains a destructive write (DELETE/DROP/TRUNCATE or a table .delete()).');
  } else if (input.touchesDestructiveWrite === null) {
    raise('R2', 'touchesDestructiveWrite', 'Destructive-write involvement could not be determined — treated as present.');
  }

  if (input.touchesAuthOrRls === true) {
    raise('R3', 'touchesAuthOrRls', 'Diff touches an auth/RLS-adjacent surface (policy DDL or an auth guard).');
  } else if (input.touchesAuthOrRls === null) {
    raise('R2', 'touchesAuthOrRls', 'Auth/RLS involvement could not be determined — treated as at least R2.');
  }

  // --- Feature criticality: the highest criticality among touched
  // features sets a floor. A `null` entry inside a non-empty array (a
  // feature id that could not be resolved to a registry criticality) is
  // treated as `high` — the same escalate-on-unknown stance. ---
  if (input.featureCriticalities.length > 0) {
    const hasUnknownCriticality = input.featureCriticalities.some((c) => c === null);
    const worst = input.featureCriticalities.some((c) => c === 'high' || c === null)
      ? 'high'
      : input.featureCriticalities.some((c) => c === 'medium')
        ? 'medium'
        : 'low';
    if (worst === 'high') {
      raise(
        'R2',
        'featureCriticalities',
        hasUnknownCriticality
          ? 'At least one touched feature’s criticality could not be read — treated as high.'
          : 'Touches at least one high-criticality feature.',
      );
    } else if (worst === 'medium') {
      raise('R1', 'featureCriticalities', 'Touches at least one medium-criticality feature, none higher.');
    }
  }

  // --- Blast radius: a wide impact from the World Model graph raises the
  // floor even when nothing else does — a large, otherwise-quiet diff is
  // exactly the case a single-feature-scoped signal would miss. ---
  if (input.impactedFeatureCount === null) {
    raise('R2', 'impactedFeatureCount', 'Blast-radius impact could not be read from the World Model — treated as wide.');
  } else if (input.impactedFeatureCount >= 5) {
    raise('R2', 'impactedFeatureCount', `Blast radius reaches ${input.impactedFeatureCount} other features.`);
  } else if (input.impactedFeatureCount >= 1) {
    raise('R1', 'impactedFeatureCount', `Blast radius reaches ${input.impactedFeatureCount} other feature(s).`);
  }

  // --- Historical incident density: a feature with a real incident history
  // is not scored the same as a quiet one, even for a small diff. ---
  if (input.incidentDensity === null) {
    reasons.push({
      input: 'incidentDensity',
      detail: 'Historical incident count could not be read.',
      raisedTier: false,
    });
  } else if (input.incidentDensity >= 3) {
    raise('R2', 'incidentDensity', `${input.incidentDensity} prior incidents recorded for the touched feature(s).`);
  } else if (input.incidentDensity >= 1) {
    raise('R1', 'incidentDensity', `${input.incidentDensity} prior incident(s) recorded for the touched feature(s).`);
  }

  // --- Test coverage confidence: never RAISES the floor on its own (a
  // well-tested destructive migration is still R2+) — it can only add a
  // reason at whatever floor the other signals already set, and an unknown
  // read is recorded as a missing input rather than silently ignored. ---
  if (input.testCoverageConfidence === 'none') {
    reasons.push({
      input: 'testCoverageConfidence',
      detail: 'Diff carries zero matching test coverage.',
      raisedTier: false,
    });
  } else if (input.testCoverageConfidence === 'partial') {
    reasons.push({
      input: 'testCoverageConfidence',
      detail: 'Diff carries test coverage for only some of the touched files.',
      raisedTier: false,
    });
  }

  if (reasons.length === 0) {
    reasons.push({
      input: 'touchesMigration',
      detail: 'No risk signal detected in any readable input — R0.',
      raisedTier: false,
    });
  }

  const inputsMissing = INPUT_FIELDS.filter((field) => isMissing(input, field));

  return { tier, reasons, inputsMissing };
}
