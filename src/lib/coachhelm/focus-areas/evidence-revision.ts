/**
 * ============================================================================
 * Evidence-revision fingerprint — addendum A8, slice 1/3 shared core
 * ----------------------------------------------------------------------------
 * When a coach or player approves an insight into a focus area
 * (`createFocusAreaFromInsight[V2]`, `src/app/golf/actions/development.ts`),
 * nothing today records WHICH state of that insight's evidence justified the
 * approval. `golf_coach_insights` rows are updated in place on every
 * regeneration run (`upsert.ts`'s `ON CONFLICT (signature, player_id,
 * coach_id, team_id)` — see `docs/architecture/coachhelm-evidence-contract.md`),
 * so `from_insight_id` is a live FK to a row whose confidence/evidence can
 * silently change underneath an already-approved focus area.
 *
 * This module is the PURE fingerprint core both slices need:
 *   - Slice 1 stamps `computeEvidenceRevision(...)`'s output onto
 *     `golf_player_focus_areas.evidence_revision` at approval time (behind a
 *     feature flag, gated on the migration landing — see the slice-1 PR).
 *   - Slice 3 recomputes the fingerprint from the LIVE insight at read time
 *     and compares it against the stored one; a mismatch renders a
 *     read-time-only "evidence has changed since this was approved" badge,
 *     never rewriting the stored value or the focus area's status — the
 *     prior accepted version is preserved exactly (same "derive at read
 *     time, never persist a re-check" contract Pkg 9 slice 4's
 *     `due-for-review.ts` already established for this codebase).
 *
 * No Supabase/'use server' import here on purpose — this module only turns a
 * plain object into a stable string. Callers resolve the real row (either
 * live from `golf_coach_insights`, or the `InsightEvidence` shape already
 * computed by the v2 insight pipeline, see `src/lib/coachhelm/v2/insights/
 * types.ts`) into `EvidenceRevisionInput` themselves.
 * ========================================================================== */

import { createHash } from 'node:crypto';

/**
 * The subset of an insight's state that changes what a coach approved.
 *
 * Deliberately excludes anything that is regen noise rather than a real
 * evidence change: the insight's own `id`, `created_at`/`updated_at`,
 * `acknowledged_at`/`dismissed_at`/`resolved_at`, and any other bookkeeping
 * timestamp. Two regeneration runs over the IDENTICAL underlying rounds must
 * fingerprint identically; a run that changes the measured evidence, the
 * data window, the confidence, the insight's lifecycle status, or the
 * generator build must fingerprint differently.
 */
export interface EvidenceRevisionInput {
  /**
   * The insight's lifecycle/status at the moment of approval — e.g.
   * `golf_coach_insights.lifecycle_state` (`'detected' | 'matured' |
   * 'tentative' | 'archived'`, see `lifecycle-policy.ts`) or `.status`,
   * whichever the caller resolves as canonical for its read path. A
   * promotion/demotion between these IS a real evidence change, not
   * cosmetic — an insight that later gets archived and resurrected under
   * the same signature is not the same accepted state.
   */
  status: string;
  /** `InsightEvidence.confidence` (0..1, `types.ts:176`). */
  confidence: number;
  /** `InsightEvidence.your_value` (`types.ts:150`) — the measured number. */
  yourValue: number;
  /** `InsightEvidence.comparison_value` (`types.ts:154`) — the baseline it's compared to. */
  comparisonValue: number;
  /** `InsightEvidence.secondary_value` (`types.ts:159`), when present (e.g. a Tour-benchmark tick). */
  secondaryValue?: number | null;
  /** `InsightEvidence.sample_n` (`types.ts:167`) — shots/rounds backing the number. */
  sampleN: number;
  /** `InsightEvidence.window_days` (`types.ts:168`). */
  windowDays: number;
  /**
   * `InsightEvidence.window_start` / `window_end` (`types.ts:169-170`, ISO).
   * This is the DATA window the evidence was computed over, not a run
   * timestamp — two runs over the identical window must produce the same
   * value here, and that's exactly what makes it safe to include.
   */
  windowStart: string;
  windowEnd: string;
  /** `golf_coach_insights.engine_version` — which generator build produced this evidence. */
  engineVersion: string | null;
}

/**
 * Recursively sorts object keys (and, defensively, arrays of primitives/
 * sorted objects) into a single canonical order, so two logically-identical
 * inputs that merely differ in key order or array order stringify
 * identically. None of `EvidenceRevisionInput`'s current fields are arrays
 * or nested objects, but the fingerprint core is kept generic and this
 * canonicalization is tested directly (not just indirectly through
 * `computeEvidenceRevision`) so it stays correct if the input ever grows one.
 */
export function canonicalizeForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) {
    const canonicalized = value.map(canonicalizeForFingerprint);
    // Order-independent: two arrays with the same elements in a different
    // order must canonicalize identically. Sorting by each element's own
    // canonical JSON form is stable regardless of element type.
    return canonicalized
      .map((v) => ({ v, key: JSON.stringify(v) }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((entry) => entry.v);
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [k, canonicalizeForFingerprint(v)] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries);
  }
  return value;
}

/**
 * Numbers computed by different code paths (a live re-derivation vs. a
 * stored aggregate) can differ by float noise well below any meaningful
 * precision (e.g. `0.7000000000000001` vs `0.7`). Rounding before hashing
 * treats that noise as "the same evidence" rather than a spurious
 * revision change; 6 decimal places is far finer than anything the UI or the
 * underlying stats (percentages, per-round rates) ever actually carry.
 */
function roundStable(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * A stable, order-independent SHA-256 hex digest over the fields of
 * `input` that define "the evidence a coach approved" — see
 * `EvidenceRevisionInput`'s own field docs for what's included and why.
 *
 * Stability: the same logical evidence state always produces the same
 * digest, regardless of the caller's own object-literal key order and
 * regardless of harmless float noise in the numeric fields.
 *
 * Sensitivity: a change to any included field (confidence/status,
 * your_value/comparison_value/secondary_value, the sample/window, or
 * engine_version) produces a different digest.
 */
export function computeEvidenceRevision(input: EvidenceRevisionInput): string {
  const normalized = {
    status: input.status,
    confidence: roundStable(input.confidence),
    yourValue: roundStable(input.yourValue),
    comparisonValue: roundStable(input.comparisonValue),
    secondaryValue: input.secondaryValue == null ? null : roundStable(input.secondaryValue),
    sampleN: input.sampleN,
    windowDays: input.windowDays,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    engineVersion: input.engineVersion,
  };
  const canonical = canonicalizeForFingerprint(normalized);
  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json).digest('hex');
}
