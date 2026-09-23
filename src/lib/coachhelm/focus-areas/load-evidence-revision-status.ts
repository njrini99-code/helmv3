/**
 * ============================================================================
 * Evidence-revision status loader — A8 slice 3
 * ----------------------------------------------------------------------------
 * Batched read-time counterpart to slice 1's write path: given a page's
 * already-fetched focus areas (which may or may not carry a stamped
 * `evidence_revision`, depending on whether the
 * `coachhelm_focus_area_evidence_revision` flag was on at approval time),
 * fetch each distinct source insight ONCE, recompute its live fingerprint,
 * and compare it against the stored one.
 *
 * Callers (the intelligence/coachhelm page loaders) merge the returned
 * per-focus-area status into their existing mapped objects — this module
 * never writes anything back to `golf_player_focus_areas`; slice 1's stored
 * value and the focus area's `status` are both left exactly as they were,
 * per addendum A8's "preserve prior accepted versions" requirement.
 *
 * Gated on the same flag as the write path: while off, this makes zero
 * `golf_coach_insights` reads, matching "flag off leaves behavior
 * unchanged" for the read side too.
 * ========================================================================== */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { isFlagEnabled } from '@/lib/flags';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import {
  computeInsightEvidenceRevision,
  type InsightEvidenceSourceRow,
} from './evidence-revision-source';
import { compareEvidenceRevision, type EvidenceRevisionComparison } from './evidence-revision-status';

/** The subset of a mapped focus-area row this loader needs. */
export interface FocusAreaEvidenceRevisionRow {
  id: string;
  from_insight_id?: string | null;
  evidence_revision?: string | null;
}

/**
 * Returns a map of `focusArea.id` -> `'match' | 'changed'` for every focus
 * area whose comparison is actually verifiable (see `compareEvidenceRevision`
 * — an id is simply absent from the map, never present with `'unknown'`, so
 * callers can treat "not in the map" as "render nothing" uniformly).
 */
export async function computeEvidenceRevisionStatuses(
  client: SupabaseClient<Database>,
  focusAreas: FocusAreaEvidenceRevisionRow[],
): Promise<Record<string, EvidenceRevisionComparison>> {
  if (!isFlagEnabled('coachhelm_focus_area_evidence_revision')) return {};

  const candidates = focusAreas.filter(
    (fa): fa is FocusAreaEvidenceRevisionRow & { from_insight_id: string; evidence_revision: string } =>
      Boolean(fa.evidence_revision) && Boolean(fa.from_insight_id),
  );
  if (candidates.length === 0) return {};

  const insightIds = Array.from(new Set(candidates.map((fa) => fa.from_insight_id)));

  const { data, error } = await fromUntyped(client, 'golf_coach_insights')
    .select('id, lifecycle_state, evidence, engine_version')
    .in('id', insightIds);

  if (error) {
    await logServerError(
      `[evidence-revision] live insight read failed for ${insightIds.length} insight(s) — evidence-changed badges will not render this load: ${describeError(error)}`,
      { action: 'evidenceRevision.loadStatuses', featureArea: 'coachhelm' },
      'warning',
    );
    return {};
  }

  const liveRevisionById = new Map<string, string | null>();
  for (const row of (data ?? []) as (InsightEvidenceSourceRow & { id: string })[]) {
    liveRevisionById.set(row.id, computeInsightEvidenceRevision(row));
  }

  const result: Record<string, EvidenceRevisionComparison> = {};
  for (const fa of candidates) {
    const live = liveRevisionById.get(fa.from_insight_id) ?? null;
    const comparison = compareEvidenceRevision(fa.evidence_revision, live);
    if (comparison !== 'unknown') result[fa.id] = comparison;
  }
  return result;
}
