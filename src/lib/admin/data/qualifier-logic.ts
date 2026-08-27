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
 * 2026-08-27), so a generous ceiling still comfortably covers real growth
 * while keeping the read bounded and the honesty contract enforceable: a
 * separate exact `count` query tells the page whether the bounded read still
 * holds every row, so "12 qualifiers" is never silently a lie if that ever
 * stops being true.
 */

/**
 * PostgREST's server-side per-request row cap.
 *
 * This is a hard ceiling on what ONE request can return, not a preference:
 * `.limit(20_000)` returns 1,000 rows, not 20,000. That matters here beyond
 * the missing rows, because it also disables the fallback truncation check —
 * `fetched.length >= 20_000` can never be true when the server stops at
 * 1,000, so a read that WAS clipped reported `truncated: false` whenever the
 * exact-count probe was unavailable to contradict it. Enforced repo-wide by
 * `scripts/check-row-cap-limits.mjs`, which is what caught this.
 */
const PAGE_SIZE = 1_000;

/**
 * How much of each table this page is willing to read. Enforced by stopping
 * page accumulation — a real ceiling — rather than by a `.limit()` the server
 * would ignore.
 */
const QUALIFIER_ROW_CEILING = 2_000;
const LINKED_ROUND_ROW_CEILING = 20_000;

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

interface BoundedPage<T> {
  rows: T[];
  error: { message: string } | null;
  /**
   * True when accumulation stopped because the CEILING was reached rather
   * than because the source was drained — the only case in which rows may
   * exist that this read never saw.
   *
   * Deliberately conservative at the exact boundary: a source holding
   * precisely `ceiling` rows reports true, because the read cannot tell that
   * apart from one holding more without another round-trip. Over-reporting
   * "there may be more" is the safe direction; under-reporting it is the
   * defect this replaced.
   */
  hitCeiling: boolean;
}

/**
 * Read up to `ceiling` rows, paging at PostgREST's real cap.
 *
 * The caller must apply a stable `.order(...)` on a unique column so page
 * boundaries don't drift between requests. Mirrors the repo's existing
 * `fetchAllRowsResult` idiom, but with an explicit ceiling and a report of
 * whether that ceiling was what stopped it — which is the fact the honesty
 * contract below is built on and which an unbounded drain cannot provide.
 */
async function fetchUpTo<T>(
  ceiling: number,
  makeQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<BoundedPage<T>> {
  const rows: T[] = [];

  while (rows.length < ceiling) {
    const want = Math.min(PAGE_SIZE, ceiling - rows.length);
    const { data, error } = await makeQuery(rows.length, rows.length + want - 1);
    if (error) return { rows, error, hitCeiling: false };

    const page = data ?? [];
    rows.push(...page);
    // A SHORT page means the source is drained. A full one only means there
    // may be more — never that there is.
    if (page.length < want) return { rows, error: null, hitCeiling: false };
  }

  return { rows, error: null, hitCeiling: true };
}

/**
 * Honest truncation check. When the exact-count probe itself succeeded, the
 * comparison is exact. When the probe query failed (rare — it is a second,
 * independent round-trip), rather than silently reporting `truncated: false`
 * on data we could not actually confirm complete, this falls back to the
 * conservative signal available from the read alone: accumulation stopped at
 * our own ceiling rather than on a drained source, which is the one case a
 * row could have been cut off.
 */
function isTruncated(fetchedLen: number, probe: CountProbe, hitCeiling: boolean): boolean {
  if (!probe.error && probe.count !== null) return probe.count > fetchedLen;
  return hitCeiling;
}

export async function fetchQualifierLogic(): Promise<AdminFetchResult<QualifierLogicSnapshot>> {
  const admin = createAdminClient();

  const [qualifiersRes, qualifiersCountRes, roundsRes, roundsCountRes] = await Promise.all([
    fetchUpTo<QualifierRow>(QUALIFIER_ROW_CEILING, (from, to) =>
      admin
        .from('golf_qualifiers')
        .select('id, team_id, num_rounds, status, name')
        .order('id', { ascending: true })
        .range(from, to),
    ),
    admin.from('golf_qualifiers').select('id', { count: 'exact', head: true }),
    fetchUpTo<QualifierLinkedRound>(LINKED_ROUND_ROW_CEILING, (from, to) =>
      admin
        .from('golf_rounds')
        .select('id, team_id, player_id, qualifier_id, qualifier_round_number')
        .not('qualifier_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    admin.from('golf_rounds').select('id', { count: 'exact', head: true }).not('qualifier_id', 'is', null),
  ]);

  if (qualifiersRes.error) {
    return failed(`golf_qualifiers query failed: ${qualifiersRes.error.message}`);
  }
  if (roundsRes.error) {
    return failed(`golf_rounds query failed: ${roundsRes.error.message}`);
  }

  const qualifiers: QualifierRow[] = qualifiersRes.rows;
  const linkedRounds: QualifierLinkedRound[] = roundsRes.rows;

  const invariants = evaluateQualifierInvariants(qualifiers, linkedRounds);
  const lifecycle = summarizeQualifierLifecycle(qualifiers, linkedRounds);
  const worstSeverity = worstQualifierSeverity(invariants);

  const qualifiersFetch: BoundedFetch = {
    evaluated: qualifiers.length,
    confirmedTotal: qualifiersCountRes.error ? null : (qualifiersCountRes.count ?? null),
    truncated: isTruncated(qualifiers.length, qualifiersCountRes, qualifiersRes.hitCeiling),
  };
  const linkedRoundsFetch: BoundedFetch = {
    evaluated: linkedRounds.length,
    confirmedTotal: roundsCountRes.error ? null : (roundsCountRes.count ?? null),
    truncated: isTruncated(linkedRounds.length, roundsCountRes, roundsRes.hitCeiling),
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
