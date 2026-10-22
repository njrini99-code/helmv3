/**
 * Idle-player stale refresh for the nightly roster sweep (flag
 * `coachhelm_stale_refresh_v1`, off).
 *
 * The sweep skips a player whose most recent completed round is already
 * analyzed, and the Slice 0b freshness rule (`sweep-freshness.ts`) only
 * catches a player whose newest round is newer than their newest read. A
 * player who stops logging rounds therefore keeps the reads of their last
 * analysis indefinitely: nothing re-runs the generators, so nothing
 * refreshes, rechecks or retracts those rows (review 2026-10-19 §5 item 1;
 * ported from PR #2073 `899adc9dc`, which never merged).
 *
 * Rule: re-analyze a player whose newest analysis is `STALE_REFRESH_DAYS`+
 * days old, at most `STALE_REFRESH_CAP` players a night, in a nightly
 * rotation through the stale players ordered oldest first.
 *
 *   - "Newest analysis" is the newer of the player's newest visible-read
 *     stamp (max of created_at, metadata.last_refreshed_at,
 *     metadata.redetected_at: the lifecycle cron's liveness anchor; every
 *     re-emit stamps last_refreshed_at) and their newest engine run
 *     (`golf_insight_generation_log` post_round_v2). The run log matters: a
 *     run that re-emits nothing leaves the row stamps old, and without it the
 *     same player would stay stale after a productive run.
 *   - Rotation (`rotateForNight`), write-free: the night's window starts at
 *     offset (dayIndex * cap) mod n of the oldest-first list and wraps, so
 *     with n stale players every one gets a turn within ceil(n / cap)
 *     nights. A pick whose run writes nothing (parked, failed or threw) stays
 *     stale but cannot hold a slot every night; a productive run anchors the
 *     player and drops them out of the list on its own. Nothing is written
 *     to mark a pick (a marker row in the run log would count as a failed
 *     run in the admin rollup).
 *   - The route skips a player the engine would park for its owner (no
 *     coach, CoachHelm off for the coach or team: `engine-owner.ts`, the
 *     engine's own check), so they never take a slot. It stops those checks
 *     once the cron's time budget is spent or after
 *     `STALE_REFRESH_OWNER_CHECK_CAP` checks a night.
 *   - Only players with at least one open (product-visible) read qualify:
 *     with no read there is nothing stale to refresh.
 *   - The route also requires a completed round inside
 *     `STALE_REFRESH_ROUND_WINDOW_DAYS`: the engine parks a player with no
 *     round in its 90-day window (`engine_no_recent_rounds`) without writing
 *     a run row, so such a player would otherwise pin a slot every night;
 *     the lifecycle cron's age rules already retire those reads.
 *
 * Pure: the route does the I/O. Deterministic engine only (the sweep's own
 * `triggerPlayerInsightsAfterRound`), no model calls.
 */

/** A player is stale when their newest analysis is at least this many days old. */
export const STALE_REFRESH_DAYS = 14;
/** Most stale players re-analyzed per night (see `rotateForNight`). */
export const STALE_REFRESH_CAP = 6;
/** Most engine-owner checks the route makes for stale candidates per night. */
export const STALE_REFRESH_OWNER_CHECK_CAP = 4 * STALE_REFRESH_CAP;
/** The engine's own round window: older-only players park, so they are not picked. */
export const STALE_REFRESH_ROUND_WINDOW_DAYS = 90;

const DAY_MS = 86_400_000;

/** The liveness fields of one visible read. */
export interface StaleAnchorRow {
  player_id: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
}

function ms(value: unknown): number {
  if (typeof value !== 'string') return Number.NEGATIVE_INFINITY;
  const t = Date.parse(value);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** max(created_at, metadata.last_refreshed_at, metadata.redetected_at). */
export function rowRefreshedAtMs(row: StaleAnchorRow): number {
  return Math.max(ms(row.created_at), ms(row.metadata?.last_refreshed_at), ms(row.metadata?.redetected_at));
}

export interface StaleRefreshPick {
  playerId: string;
  /** Whole days since the player's newest analysis. */
  staleDays: number;
}

/**
 * Tonight's order over every stale candidate: those whose newest analysis is
 * at least `staleDays` old, sorted oldest first (player id breaks ties so the
 * order is total), then rotated for the night by `rotateForNight`. The route
 * walks this list and keeps the first `cap` the engine would run.
 *
 * `reads` are the candidates' visible reads; `lastRunAt` maps a player to
 * their newest engine run (absent when none is known). A candidate with no
 * read, or whose reads carry no usable stamp, is never listed.
 */
export function orderStaleRefreshCandidates(
  candidateIds: readonly string[],
  reads: readonly StaleAnchorRow[],
  lastRunAt: ReadonlyMap<string, number>,
  nowMs: number,
  opts: { staleDays?: number; cap?: number } = {},
): StaleRefreshPick[] {
  const staleDays = opts.staleDays ?? STALE_REFRESH_DAYS;
  const cap = opts.cap ?? STALE_REFRESH_CAP;
  const candidates = new Set(candidateIds);
  const newestRead = new Map<string, number>();
  for (const row of reads) {
    if (!row.player_id || !candidates.has(row.player_id)) continue;
    const t = rowRefreshedAtMs(row);
    if (!Number.isFinite(t)) continue;
    newestRead.set(row.player_id, Math.max(newestRead.get(row.player_id) ?? Number.NEGATIVE_INFINITY, t));
  }
  const cutoff = nowMs - staleDays * DAY_MS;
  const anchored: Array<[string, number]> = [];
  for (const [playerId, readAt] of newestRead) {
    const anchor = Math.max(readAt, lastRunAt.get(playerId) ?? Number.NEGATIVE_INFINITY);
    if (anchor <= cutoff) anchored.push([playerId, anchor]);
  }
  const oldestFirst = anchored
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([playerId, t]) => ({ playerId, staleDays: Math.floor((nowMs - t) / DAY_MS) }));
  return rotateForNight(oldestFirst, nowMs, cap);
}

/**
 * Tonight's stale picks with no owner check: the first `cap` of
 * `orderStaleRefreshCandidates`.
 */
export function selectStaleRefreshPlayers(
  candidateIds: readonly string[],
  reads: readonly StaleAnchorRow[],
  lastRunAt: ReadonlyMap<string, number>,
  nowMs: number,
  opts: { staleDays?: number; cap?: number } = {},
): StaleRefreshPick[] {
  const cap = Math.max(0, Math.floor(opts.cap ?? STALE_REFRESH_CAP));
  return orderStaleRefreshCandidates(candidateIds, reads, lastRunAt, nowMs, { ...opts, cap }).slice(0, cap);
}

/**
 * Rotate an oldest-first list for the night of `nowMs`: start at offset
 * (dayIndex * cap) mod n, dayIndex = floor(nowMs / DAY_MS), and wrap. Taking
 * the first `cap` of the result on consecutive nights walks the whole list,
 * so each of n entries gets a turn within ceil(n / cap) nights while n
 * holds. Deterministic per UTC day; n <= cap (or cap < 1) keeps the order.
 */
export function rotateForNight<T>(oldestFirst: readonly T[], nowMs: number, cap: number = STALE_REFRESH_CAP): T[] {
  const n = oldestFirst.length;
  const step = Math.floor(cap);
  if (!Number.isFinite(step) || step < 1 || n <= step) return [...oldestFirst];
  const offset = (Math.floor(nowMs / DAY_MS) * step) % n;
  return [...oldestFirst.slice(offset), ...oldestFirst.slice(0, offset)];
}

/** True when `roundDate` (YYYY-MM-DD or ISO) is inside the engine's round window. */
export function roundInsideEngineWindow(roundDate: string | null | undefined, nowMs: number): boolean {
  const t = ms(roundDate);
  if (!Number.isFinite(t)) return false;
  return t >= nowMs - STALE_REFRESH_ROUND_WINDOW_DAYS * DAY_MS;
}

/** config/feature-flags.yml; read through the CoachHelm canary gate by the route. */
export const STALE_REFRESH_FLAG = 'coachhelm_stale_refresh_v1';

