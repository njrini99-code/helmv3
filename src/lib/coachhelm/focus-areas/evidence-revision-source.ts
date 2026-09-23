/**
 * ============================================================================
 * Evidence-revision source mapping — A8 slice 1
 * ----------------------------------------------------------------------------
 * Bridges a live `golf_coach_insights` row (its `evidence` column is `Json`,
 * i.e. untyped at the TypeScript level — see `InsightEvidence` in
 * `src/lib/coachhelm/v2/insights/types.ts` for the shape it's ACTUALLY
 * written with) into the strict `EvidenceRevisionInput` shape
 * `computeEvidenceRevision` (`evidence-revision.ts`) requires.
 *
 * Kept separate from `development.ts` ('use server', async-exports-only) so
 * this defensive-parsing logic is unit-testable without mocking Supabase —
 * it takes a plain row object, not a client.
 * ========================================================================== */

import { type EvidenceRevisionInput, computeEvidenceRevision } from './evidence-revision';

/** The subset of a `golf_coach_insights` row this module needs. */
export interface InsightEvidenceSourceRow {
  lifecycle_state: string | null;
  /** `Json` at the DB-client level; validated defensively below since a
   *  malformed or legacy row must degrade to "no revision", never throw. */
  evidence: unknown;
  engine_version: string | null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validates and maps `row.evidence` (raw `Json`) into `EvidenceRevisionInput`.
 * Returns `null` when the row's evidence is missing any field the
 * fingerprint needs — a legacy/malformed row degrades to "no revision
 * recorded" rather than fingerprinting a partial or fabricated shape.
 */
export function buildEvidenceRevisionInput(
  row: InsightEvidenceSourceRow,
): EvidenceRevisionInput | null {
  if (!row.lifecycle_state) return null;
  const evidence = row.evidence;
  if (typeof evidence !== 'object' || evidence === null || Array.isArray(evidence)) {
    return null;
  }
  const e = evidence as Record<string, unknown>;

  if (
    !isFiniteNumber(e.confidence) ||
    !isFiniteNumber(e.your_value) ||
    !isFiniteNumber(e.comparison_value) ||
    !isFiniteNumber(e.sample_n) ||
    !isFiniteNumber(e.window_days) ||
    typeof e.window_start !== 'string' ||
    typeof e.window_end !== 'string'
  ) {
    return null;
  }

  const secondaryValue = isFiniteNumber(e.secondary_value) ? e.secondary_value : null;

  return {
    status: row.lifecycle_state,
    confidence: e.confidence,
    yourValue: e.your_value,
    comparisonValue: e.comparison_value,
    secondaryValue,
    sampleN: e.sample_n,
    windowDays: e.window_days,
    windowStart: e.window_start,
    windowEnd: e.window_end,
    engineVersion: row.engine_version,
  };
}

/**
 * Convenience wrapper: validate + fingerprint in one call. Returns `null`
 * for anything `buildEvidenceRevisionInput` would reject — callers treat
 * `null` as "don't stamp `evidence_revision`", never as an error.
 */
export function computeInsightEvidenceRevision(row: InsightEvidenceSourceRow): string | null {
  const input = buildEvidenceRevisionInput(row);
  return input ? computeEvidenceRevision(input) : null;
}
