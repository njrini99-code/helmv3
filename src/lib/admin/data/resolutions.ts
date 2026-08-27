import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { ok, failed, type AdminFetchResult } from '@/lib/admin/fetch-result';
import { getProductionDeployAt } from '@/lib/admin/auto-resolve';
import { shipStatus, type ShipStatus } from '@/lib/reliability/resolution';

/**
 * Helm Bridge — the Archive data layer.
 *
 * `admin_error_resolutions` is fingerprint-level memory of what was fixed:
 * PR, merge SHA, who decided (`auto` cron vs `manual` operator), and whether
 * it has regressed. This module is the one place that reads every row of it
 * for the Bridge archive surface — never a per-fingerprint lookup, which is
 * `fetchResolutionsFor` in `resolution-ledger.ts`'s job for the regression
 * pass.
 *
 * The archive answers three questions the row alone cannot: was the claim
 * automatic or human (`resolutionSource`), has the fix actually shipped to
 * production (`shipStatus`, three outcomes — never collapse `unknown` into
 * `pending`), and has it come back (`regressed` / `reopenedCount`). All
 * three are computed here so the panel only renders.
 */

/** PostgREST's server-side per-request row cap — see qualifier-logic.ts for
 *  the full explanation of why this is a hard ceiling, not a preference. */
const PAGE_SIZE = 1_000;

/**
 * How much of `admin_error_resolutions` this page is willing to read.
 * Production carries a few dozen fingerprint-level resolutions today
 * (measured 2026-08-27 against the same table this reads), so this ceiling
 * is generously above the working set while still keeping the read bounded
 * and the honesty contract enforceable — see `isTruncated` below.
 */
const RESOLUTION_ROW_CEILING = 5_000;

export interface ArchivedResolution {
  fingerprint: string;
  resolvedAt: string;
  resolvedBy: string | null;
  resolutionSource: 'auto' | 'manual';
  prNumber: number | null;
  prUrl: string | null;
  fixedInSha: string | null;
  note: string | null;
  lastSeenAtResolution: string | null;
  reopenedAt: string | null;
  /** Survives a re-resolve — "fixed three times already" cannot be lost. */
  reopenedCount: number;
  createdAt: string;
  updatedAt: string;
  /** Three outcomes, never two. Computed against the current production
   *  deploy at read time, not stored — a resolution recorded as "pending"
   *  yesterday must render "shipped" today without anyone touching the row. */
  shipStatus: ShipStatus;
  /** `reopenedAt` non-null. The single derived flag the panel needs to sort
   *  and render regressed rows first and loudest. */
  regressed: boolean;
}

export interface ResolutionArchiveSnapshot {
  /** Newest-resolved first. */
  resolutions: ArchivedResolution[];
  /** Rows actually fetched and returned above. */
  evaluated: number;
  /** Exact total from an independent `count`-only probe. Null when that
   *  probe itself failed — a real total was never disproven, only
   *  unconfirmed this refresh. */
  confirmedTotal: number | null;
}

interface RawResolutionRow {
  fingerprint: string;
  resolved_at: string;
  resolved_by: string | null;
  resolution_source: string;
  pr_number: number | null;
  pr_url: string | null;
  fixed_in_sha: string | null;
  note: string | null;
  last_seen_at_resolution: string | null;
  reopened_at: string | null;
  reopened_count: number;
  created_at: string;
  updated_at: string;
}

interface CountProbe {
  count: number | null;
  error: { message: string } | null;
}

interface BoundedPage<T> {
  rows: T[];
  error: { message: string } | null;
  /** True when accumulation stopped because the CEILING was reached rather
   *  than because the source was drained. Deliberately conservative at the
   *  exact boundary — see qualifier-logic.ts's fetchUpTo for the full
   *  rationale; the same shape is reused here rather than shared because
   *  neither module exports it. */
  hitCeiling: boolean;
}

/** Read up to `ceiling` rows, paging at PostgREST's real cap. The caller
 *  must apply a stable `.order(...)` with a unique tiebreak so page
 *  boundaries don't drift between requests. */
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
 * Honest truncation check. When the exact-count probe succeeded, the
 * comparison is exact. When the probe failed, this falls back to the only
 * conservative signal the read alone can offer — accumulation stopped at
 * our own ceiling rather than on a drained source. This fallback is
 * reachable: `hitCeiling` is set from real pagination state, never compared
 * against a bound the server has already clamped underneath it (the exact
 * bug this pattern replaced in `qualifier-logic.ts`).
 */
function isTruncated(fetchedLen: number, probe: CountProbe, hitCeiling: boolean): boolean {
  if (!probe.error && probe.count !== null) return probe.count > fetchedLen;
  return hitCeiling;
}

export async function fetchResolutionArchive(): Promise<AdminFetchResult<ResolutionArchiveSnapshot>> {
  const admin = createAdminClient();

  const [pageRes, countRes, deploy] = await Promise.all([
    fetchUpTo<RawResolutionRow>(RESOLUTION_ROW_CEILING, (from, to) =>
      admin
        .from('admin_error_resolutions')
        .select(
          'fingerprint, resolved_at, resolved_by, resolution_source, pr_number, pr_url, fixed_in_sha, note, last_seen_at_resolution, reopened_at, reopened_count, created_at, updated_at',
        )
        // Newest-resolved first for the panel; `fingerprint` (the table's own
        // PK) is the unique tiebreak that keeps page boundaries stable when
        // several rows share a `resolved_at` timestamp.
        .order('resolved_at', { ascending: false })
        .order('fingerprint', { ascending: true })
        .range(from, to),
    ),
    admin.from('admin_error_resolutions').select('fingerprint', { count: 'exact', head: true }),
    // `getProductionDeployAt` only turns a non-ok Vercel response into a
    // `reason`-carrying result — it does not guarantee the underlying fetch
    // never REJECTS. A rejection here must not take down the whole archive
    // read: the DB query can succeed independently of Vercel, and `unknown`
    // is exactly the ship-status outcome for "Vercel was unreachable" —
    // collapsing that into a thrown error (and therefore an `error` envelope
    // instead of `ok` with every row honestly `unknown`) defeats the reason
    // that third outcome exists.
    getProductionDeployAt().catch(() => ({ deployAt: null, deploySha: null }) as const),
  ]);

  if (pageRes.error) {
    return failed(`admin_error_resolutions query failed: ${pageRes.error.message}`);
  }

  const productionSha = deploy.deploySha;
  const productionDeployedAt = deploy.deployAt !== null ? new Date(deploy.deployAt).toISOString() : null;

  const resolutions: ArchivedResolution[] = pageRes.rows.map((row) => ({
    fingerprint: row.fingerprint,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    resolutionSource: row.resolution_source === 'auto' ? 'auto' : 'manual',
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    fixedInSha: row.fixed_in_sha,
    note: row.note,
    lastSeenAtResolution: row.last_seen_at_resolution,
    reopenedAt: row.reopened_at,
    reopenedCount: row.reopened_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    shipStatus: shipStatus({
      fixedInSha: row.fixed_in_sha,
      resolvedAt: row.resolved_at,
      productionSha,
      productionDeployedAt,
    }),
    regressed: row.reopened_at !== null,
  }));

  const truncated = isTruncated(pageRes.rows.length, countRes, pageRes.hitCeiling);

  return {
    ...ok<ResolutionArchiveSnapshot>({
      resolutions,
      evaluated: pageRes.rows.length,
      confirmedTotal: countRes.error ? null : (countRes.count ?? null),
    }),
    truncated,
  };
}
