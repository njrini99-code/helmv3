import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { ok, failed, type AdminFetchResult } from '@/lib/admin/fetch-result';
import {
  evaluateQualifierInvariants,
  summarizeQualifierLifecycle,
  worstQualifierSeverity,
  type QualifierRow,
  type QualifierLinkedRound,
  type QualifierInvariantResult,
  type QualifierLifecycleSummary,
  type QualifierInvariantSeverity,
} from '@/lib/admin/qualifier-invariants';

/**
 * Helm Bridge — Qualifier Logic data layer.
 *
 * Thin I/O only: fetch the two row sets `qualifier-invariants.ts` needs, then
 * hand them to its PURE evaluators unchanged. Every rule and every violation
 * count on the page comes from that module — nothing here re-derives or
 * duplicates a business rule.
 *
 * Production today is ~12 qualifiers / ~121 linked rounds (measured
 * 2026-08-27), so a generous cap still comfortably covers real growth while
 * keeping the read bounded and the honesty contract enforceable: a separate
 * exact `count` query tells the page whether the bounded page still holds
 * every row, so "12 qualifiers" is never silently a lie if that ever stops
 * being true.
 */

const QUALIFIER_ROW_LIMIT = 2_000;
const LINKED_ROUND_ROW_LIMIT = 20_000;

/**
 * One bounded read's own honesty bookkeeping. `evaluated` is what the
 * invariants below actually saw — the page must describe violation counts
 * against THIS number, never against `confirmedTotal`, because a confirmed
 * total does not mean it was checked, only that it exists.
 */
export interface BoundedFetch {
  /** Rows actually fetched and passed to the invariant evaluators. */
  evaluated: number;
  /** Exact total from an independent `count`-only probe. Null when that
   *  probe itself failed — a real total was never disproven, it just could
   *  not be confirmed this refresh. */
  confirmedTotal: number | null;
  /** True when `evaluated` may fall short of the true total: either the
   *  probe confirmed more rows exist than were fetched, or the probe failed
   *  and the page came back exactly at its cap (the one shape that could
   *  mean a row was cut off). */
  truncated: boolean;
}

export interface QualifierLogicSnapshot {
  lifecycle: QualifierLifecycleSummary;
  invariants: QualifierInvariantResult[];
  worstSeverity: QualifierInvariantSeverity | null;
  qualifiers: BoundedFetch;
  linkedRounds: BoundedFetch;
}

interface CountProbe {
  count: number | null;
  error: { message: string } | null;
}

/**
 * Honest truncation check. When the exact-count probe itself succeeded, the
 * comparison is exact. When the probe query failed (rare — it is a second,
 * independent round-trip), rather than silently reporting `truncated: false`
 * on data we could not actually confirm complete, this falls back to the
 * conservative signal available from the page fetch alone: the page came
 * back exactly full, which is the one case a row could have been cut off.
 */
function isTruncated(fetchedLen: number, limit: number, probe: CountProbe): boolean {
  if (!probe.error && probe.count !== null) return probe.count > fetchedLen;
  return fetchedLen >= limit;
}

export async function fetchQualifierLogic(): Promise<AdminFetchResult<QualifierLogicSnapshot>> {
  const admin = createAdminClient();

  const [qualifiersRes, qualifiersCountRes, roundsRes, roundsCountRes] = await Promise.all([
    admin
      .from('golf_qualifiers')
      .select('id, team_id, num_rounds, status, name')
      .order('id', { ascending: true })
      .limit(QUALIFIER_ROW_LIMIT),
    admin.from('golf_qualifiers').select('id', { count: 'exact', head: true }),
    admin
      .from('golf_rounds')
      .select('id, team_id, player_id, qualifier_id, qualifier_round_number')
      .not('qualifier_id', 'is', null)
      .order('id', { ascending: true })
      .limit(LINKED_ROUND_ROW_LIMIT),
    admin.from('golf_rounds').select('id', { count: 'exact', head: true }).not('qualifier_id', 'is', null),
  ]);

  if (qualifiersRes.error) {
    return failed(`golf_qualifiers query failed: ${qualifiersRes.error.message}`);
  }
  if (roundsRes.error) {
    return failed(`golf_rounds query failed: ${roundsRes.error.message}`);
  }

  const qualifiers: QualifierRow[] = qualifiersRes.data ?? [];
  const linkedRounds: QualifierLinkedRound[] = roundsRes.data ?? [];

  const invariants = evaluateQualifierInvariants(qualifiers, linkedRounds);
  const lifecycle = summarizeQualifierLifecycle(qualifiers, linkedRounds);
  const worstSeverity = worstQualifierSeverity(invariants);

  const qualifiersFetch: BoundedFetch = {
    evaluated: qualifiers.length,
    confirmedTotal: qualifiersCountRes.error ? null : (qualifiersCountRes.count ?? null),
    truncated: isTruncated(qualifiers.length, QUALIFIER_ROW_LIMIT, qualifiersCountRes),
  };
  const linkedRoundsFetch: BoundedFetch = {
    evaluated: linkedRounds.length,
    confirmedTotal: roundsCountRes.error ? null : (roundsCountRes.count ?? null),
    truncated: isTruncated(linkedRounds.length, LINKED_ROUND_ROW_LIMIT, roundsCountRes),
  };

  // `ok()` sets status/data/fetchedAt; the envelope's own `truncated` flag
  // (distinct from either BoundedFetch's own) is the coarse "was ANYTHING
  // clipped" signal a generic caller of AdminFetchResult would look for.
  return {
    ...ok({
      lifecycle,
      invariants,
      worstSeverity,
      qualifiers: qualifiersFetch,
      linkedRounds: linkedRoundsFetch,
    }),
    truncated: qualifiersFetch.truncated || linkedRoundsFetch.truncated,
  };
}
