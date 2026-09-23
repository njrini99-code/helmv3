/**
 * ============================================================================
 * Evidence-revision comparison — A8 slice 3
 * ----------------------------------------------------------------------------
 * The pure half of the read-time "evidence has changed since this was
 * approved" check: given the fingerprint stored at approval time
 * (`golf_player_focus_areas.evidence_revision`) and the fingerprint
 * recomputed from the LIVE source insight right now
 * (`computeInsightEvidenceRevision`, `evidence-revision-source.ts`), decide
 * whether to render nothing, "match", or "changed".
 *
 * No Supabase import here on purpose, same split as `evidence-revision-
 * source.ts` — the batched live-fingerprint fetch lives in
 * `load-evidence-revision-status.ts`, which calls this.
 * ========================================================================== */

export type EvidenceRevisionComparison = 'match' | 'changed' | 'unknown';

/**
 * `'unknown'` — never render a badge — covers every case where the
 * comparison can't be trusted: no revision was ever stamped (`stored` is
 * null/undefined, e.g. pre-slice-1 row, flag was off, or no source insight),
 * or the live insight's fingerprint couldn't be recomputed (`live` is null,
 * e.g. the insight row is gone or has become malformed since approval — an
 * unverifiable state must never be reported as a confirmed "changed").
 *
 * `'match'`/`'changed'` are a plain string-equality check: the fingerprint
 * is already a stable, order-independent hash, so any real difference in
 * the fields that matter to a coach necessarily changes it.
 */
export function compareEvidenceRevision(
  stored: string | null | undefined,
  live: string | null | undefined,
): EvidenceRevisionComparison {
  if (!stored || !live) return 'unknown';
  return stored === live ? 'match' : 'changed';
}
