/**
 * Stale-insight refresh selection for the nightly roster sweep (owner
 * decision 2026-09-25).
 *
 * The roster sweep skips a player whose most recent completed round is
 * already analyzed, so a player who stops logging rounds keeps showing the
 * insights of their last analysis indefinitely: nothing re-runs the
 * generators, so nothing refreshes, rechecks (`recent-recheck.ts`) or
 * retracts those rows. Measured 2026-09-25: 15 on-roster players (50 visible
 * v3 rows) whose NEWEST visible v3 row was last refreshed 22–88 days ago.
 *
 * The sweep now also re-analyzes, even without a new round, players whose
 * visible v3 insights were ALL last refreshed `STALE_REFRESH_DAYS`+ days ago.
 * The per-player anchor is the NEWEST refresh across the player's visible
 * rows (= when the player was last analyzed). A player analyzed recently
 * whose individual older rows are stale is NOT selected: re-running the same
 * generators would leave those rows exactly as they are (they come from exits
 * that neither refresh nor retract), so re-selecting them nightly would only
 * burn the budget.
 *
 * Budget: at most `STALE_REFRESH_CAP` players per run, oldest first, so a
 * backlog drains over several nights and each run stays well under the 300s
 * function limit. Re-analysis is the deterministic engine only — the same
 * `triggerPlayerInsightsAfterRound` path the sweep already uses; it makes no
 * AI model calls.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';

/** A player is stale when their newest visible v3 refresh is this old. */
export const STALE_REFRESH_DAYS = 14;
/** Max stale players re-analyzed per sweep run (oldest first). */
export const STALE_REFRESH_CAP = 6;

/** The liveness fields of one visible v3 insight row. */
export interface RefreshAnchorRow {
  player_id: string;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
}

function ms(value: unknown): number {
  if (typeof value !== 'string') return Number.NEGATIVE_INFINITY;
  const t = Date.parse(value);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** Same liveness anchor as the lifecycle cron's archive rules:
 *  max(created_at, metadata.last_refreshed_at, metadata.redetected_at). */
export function rowRefreshedAtMs(row: RefreshAnchorRow): number {
  return Math.max(
    ms(row.created_at),
    ms(row.metadata?.last_refreshed_at),
    ms(row.metadata?.redetected_at),
  );
}

export interface StaleRefreshPick {
  playerId: string;
  /** Days since the player's newest visible v3 refresh. */
  staleDays: number;
}

/**
 * Pure: pick up to `cap` players whose newest visible v3 refresh is at least
 * `staleDays` old, oldest first (player id breaks ties so the order is total).
 */
export function selectStaleRefreshPlayers(
  rows: readonly RefreshAnchorRow[],
  nowMs: number,
  opts: { staleDays?: number; cap?: number } = {},
): StaleRefreshPick[] {
  const staleDays = opts.staleDays ?? STALE_REFRESH_DAYS;
  const cap = opts.cap ?? STALE_REFRESH_CAP;
  const newest = new Map<string, number>();
  for (const row of rows) {
    if (!row.player_id) continue;
    const t = rowRefreshedAtMs(row);
    if (!Number.isFinite(t)) continue;
    newest.set(row.player_id, Math.max(newest.get(row.player_id) ?? Number.NEGATIVE_INFINITY, t));
  }
  const cutoff = nowMs - staleDays * 86_400_000;
  return [...newest.entries()]
    .filter(([, t]) => t <= cutoff)
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, Math.max(0, cap))
    .map(([playerId, t]) => ({ playerId, staleDays: Math.floor((nowMs - t) / 86_400_000) }));
}

const PLAYER_CHUNK = 100;

/**
 * Read-only: the liveness fields of every product-visible v3 insight
 * (`applyInsightVisibility`) for the given roster players.
 */
export async function loadVisibleRefreshAnchors(playerIds: readonly string[]): Promise<RefreshAnchorRow[]> {
  if (playerIds.length === 0) return [];
  const supabase = createAdminClient();
  const out: RefreshAnchorRow[] = [];
  for (let i = 0; i < playerIds.length; i += PLAYER_CHUNK) {
    const chunk = playerIds.slice(i, i + PLAYER_CHUNK);
    const { data, error } = await fetchAllRowsResult<RefreshAnchorRow>((from, to) =>
      applyInsightVisibility(
        supabase
          .from('golf_coach_insights')
          .select('player_id, created_at, metadata')
          .in('player_id', chunk),
      )
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
          data: RefreshAnchorRow[] | null;
          error: { message: string } | null;
        }>,
    );
    if (error) throw new Error(`stale-refresh anchors query failed: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}
