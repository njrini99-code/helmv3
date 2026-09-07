/**
 * Pure Top-25-by-total / Top-25-by-mean ranking + once-per-day Sentry
 * paging gate for the Database Tab's "Slow statements" section (D5, task 1
 * + task 5). No I/O — same "pure, fixture-tested" shape as
 * query-regression.ts and table-health.ts in this directory.
 *
 * INPUT IS ALREADY THE Top-K-by-total_exec_time SNAPSHOT `db-stat-delta`
 * fetches for `db_stat_deltas` — this module does not make a second read
 * of `pg_stat_statements`. Re-sorting that same snapshot by mean_exec_ms
 * gives the "top 25 by mean" slice without a second RPC round trip; the
 * only cost is that a query with a very high mean but low total (so it
 * never entered the Top-K-by-total snapshot) cannot appear in "top by
 * mean" here — a bounded, documented gap, not a silent one (see
 * docs/observability/DATABASE_TAB.md).
 */

export const STATEMENT_RANK_LIMIT = 25;

/** Brief §D5-5: a statement whose mean exceeds this becomes a Sentry
 *  performance issue, gated to once per UTC day per queryid. */
export const SLOW_STATEMENT_MEAN_THRESHOLD_MS = 500;

export interface RankableStatement {
  queryid: string;
  safeQueryClass: string;
  sourceClass: string;
  calls: number;
  rows: number;
  totalExecMs: number;
  meanExecMs: number;
  maxExecMs: number;
  minExecMs?: number | null;
}

export interface StatementRanking {
  topByTotal: RankableStatement[];
  topByMean: RankableStatement[];
}

export function rankStatements(rows: readonly RankableStatement[]): StatementRanking {
  const topByTotal = [...rows].sort((a, b) => b.totalExecMs - a.totalExecMs).slice(0, STATEMENT_RANK_LIMIT);
  const topByMean = [...rows].sort((a, b) => b.meanExecMs - a.meanExecMs).slice(0, STATEMENT_RANK_LIMIT);
  return { topByTotal, topByMean };
}

/** Start of the UTC day containing `now` — "once per day" is defined in UTC
 *  so the gate does not depend on a cron's deploy region. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export interface SlowStatementCandidate {
  queryid: string;
  meanExecMs: number;
}

/**
 * Which queryids should page Sentry THIS run: mean over threshold, and
 * either never paged before or last paged before today (UTC). Dedup is
 * by queryid only — a statement whose mean stays over threshold all day
 * pages exactly once regardless of how many 15-minute windows observe it.
 */
export function selectStatementsToPage(
  ranked: StatementRanking,
  alertState: Readonly<Record<string, string | null | undefined>>,
  now: Date,
  thresholdMs: number = SLOW_STATEMENT_MEAN_THRESHOLD_MS,
): SlowStatementCandidate[] {
  const todayStart = startOfUtcDay(now).getTime();
  const seen = new Set<string>();
  const candidates: SlowStatementCandidate[] = [];

  for (const row of [...ranked.topByTotal, ...ranked.topByMean]) {
    if (row.meanExecMs < thresholdMs) continue;
    if (seen.has(row.queryid)) continue;
    const lastPagedAtIso = alertState[row.queryid];
    const lastPagedAtMs = lastPagedAtIso ? Date.parse(lastPagedAtIso) : NaN;
    const alreadyPagedToday = Number.isFinite(lastPagedAtMs) && lastPagedAtMs >= todayStart;
    if (alreadyPagedToday) continue;
    seen.add(row.queryid);
    candidates.push({ queryid: row.queryid, meanExecMs: row.meanExecMs });
  }

  return candidates;
}

/** `db:slow:<queryid>` fingerprint (brief §D5-5) so repeated captures of
 *  the same slow statement dedupe into one Sentry issue. */
export function slowStatementFingerprint(queryid: string): string {
  return `db:slow:${queryid}`;
}
