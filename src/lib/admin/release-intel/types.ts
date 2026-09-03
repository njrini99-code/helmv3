/**
 * Helm Bridge — Release Intelligence shared types.
 *
 * Phase F remainder (`docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md`
 * §4 F.4.1, F.4.3): change-risk scoring for a release/PR, and a read-only,
 * non-executing rollback recommendation. Canary (§F.4.4) is explicitly out
 * of scope — ADR 2026-09-03-control-plane-owner-decisions.md
 * (`CANARY_ROLLOUT_MECHANISM` = "Canary later").
 *
 * Plain types only — no I/O, no `server-only` — so both the pure scorers
 * and any UI reading their output can import this file directly.
 */

import type { RiskTier } from '@/lib/reliability/types';

export type { RiskTier };

// ---------------------------------------------------------------------------
// Change-risk scoring (F.4.1)
// ---------------------------------------------------------------------------

/**
 * Every field is nullable on purpose: a `null` means "this input was not
 * available", never "checked, found nothing" (that is `false`/`0`). The
 * scorer biases an unknown input toward the HIGHER tier (F.7: "a risk score
 * wrong in the low direction is dangerous; wrong in the high direction is
 * merely annoying" — the same philosophy `canClaimAllClear`
 * (`src/lib/admin/incidents/sources.ts`) already enforces for incident
 * read models) and always records which inputs were missing so a caller can
 * render "R2 floor, 3 inputs unread" rather than a bare confident tier.
 */
export interface ChangeRiskInput {
  /** `memory/registry.yml`'s per-feature `criticality`, for every feature
   *  this change touches. Empty array (not null) means "touches zero
   *  registry-owned features" — a real, checkable fact, distinct from
   *  "criticality could not be read" (represented by a `null` entry). */
  featureCriticalities: ReadonlyArray<'high' | 'medium' | 'low' | null>;
  /** Count of OTHER features reachable from the touched files via the World
   *  Model's blast-radius graph (`scripts/knowledge/world-model.mjs
   *  --impact`) — `null` when the graph could not be read. */
  impactedFeatureCount: number | null;
  /** Diff text contains a `supabase/migrations/**` path. */
  touchesMigration: boolean | null;
  /** Diff text contains an auth/RLS-adjacent signal — `.auth.getUser()`
   *  removed/changed, an `ALTER POLICY`/`CREATE POLICY`/`DROP POLICY`, or a
   *  `requireSuperAdmin`/`requireAuth`-shaped guard touched. */
  touchesAuthOrRls: boolean | null;
  /** Diff text contains a destructive write — `DELETE FROM`, `DROP TABLE`,
   *  `.delete()` against a Supabase table, `TRUNCATE`. */
  touchesDestructiveWrite: boolean | null;
  /** `memory/incidents/<feature>/INC-*.md` file count, summed across every
   *  touched feature — real historical incident density, not a guess. */
  incidentDensity: number | null;
  /** Coarse confidence that the change carries test coverage: `'covered'`
   *  when the diff includes a matching file under `**\/__tests__/**` or
   *  `*.test.ts`, `'partial'` when only SOME touched files have one,
   *  `'none'` when a checkable diff has zero, `null` when it could not be
   *  determined at all (e.g. no diff text available, only a feature id). */
  testCoverageConfidence: 'covered' | 'partial' | 'none' | null;
}

export interface ChangeRiskReason {
  /** Which `ChangeRiskInput` field this reason is grounded in. */
  input: keyof ChangeRiskInput;
  detail: string;
  /** Whether this reason pushed the tier up, or merely explains one that
   *  was already at that level from another reason. */
  raisedTier: boolean;
}

export interface ChangeRiskScore {
  tier: RiskTier;
  reasons: readonly ChangeRiskReason[];
  /** Which `ChangeRiskInput` fields came back `null` — the itemized "3
   *  inputs unread" a Bridge surface renders next to the tier so a
   *  confident-looking score is never presented as fully measured when it
   *  is not. Empty array means every input was read. */
  inputsMissing: ReadonlyArray<keyof ChangeRiskInput>;
}

// ---------------------------------------------------------------------------
// Rollback recommendation (F.4.3)
// ---------------------------------------------------------------------------

export type RollbackRecommendation =
  | 'KEEP'
  | 'WATCH'
  | 'PAUSE_ROLLOUT'
  | 'ROLLBACK_RECOMMENDED'
  | 'UNKNOWN';

/** A single reliability-snapshot window, already reduced from raw
 *  `ReliabilityRun` rows (`src/lib/reliability/types.ts`) down to the counts
 *  the verdict function needs. Kept separate from the raw rows so
 *  `evaluateRollback` stays pure and independently testable with synthetic
 *  fixtures, per F.5. */
export interface ReliabilityWindowSummary {
  /** Number of `background_job_logs` rows (job_type =
   *  `reliability-snapshot`) that fell inside this window. `0` is a real,
   *  checkable fact (the collector ran and found nothing OR the window
   *  genuinely had no runs) — a window with no rows AT ALL (the collector
   *  never ran, or the read failed) is represented by `null` in
   *  `RollbackInput`, not by a zero-row `ReliabilityWindowSummary`. */
  runCount: number;
  totalSignals: number;
  criticalSignals: number;
  errorSignals: number;
}

export interface RollbackInput {
  candidateSha: string | null;
  /** `null` when the collector produced no readable rows for the candidate
   *  window — this is the "we could not check" case and must never resolve
   *  to `KEEP`. */
  candidate: ReliabilityWindowSummary | null;
  /** `null` under the identical rule — an unreadable baseline is not the
   *  same fact as "the baseline was clean". */
  baseline: ReliabilityWindowSummary | null;
}

export interface RollbackEvidence {
  detail: string;
}

export interface RollbackVerdict {
  recommendation: RollbackRecommendation;
  evidence: readonly RollbackEvidence[];
}
