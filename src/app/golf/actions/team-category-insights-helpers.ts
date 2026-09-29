/**
 * Pure helpers for team-category-insights.
 *
 * Kept in a non-`'use server'` module so they can be exported synchronously
 * (a `'use server'` file may only export async server actions) and unit-tested
 * in isolation.
 */

/**
 * Cap a flat list of rounds to the N most-recent PER player.
 *
 * The team trend window must be per-player, not global: a single global
 * `.limit(playerIds.length * 10)` lets the most-active players consume every
 * slot, so a less-active player gets zero rounds and their trend silently
 * reads "stable" — under-reporting decline precisely for the players a coach
 * most needs flagged (P448 / P2-17). Mirrors a SQL
 * `row_number() over (partition by player_id order by round_date desc)` with
 * `rn <= perPlayer`.
 *
 * `rounds` MUST already be ordered most-recent-first (round_date desc) so the
 * first `perPlayer` rows kept for each player are their most recent.
 */
export function samplePerPlayerRounds<T extends { player_id: unknown }>(
  rounds: T[],
  perPlayer: number,
): T[] {
  if (perPlayer <= 0) return [];
  const counts = new Map<string, number>();
  const kept: T[] = [];
  for (const r of rounds) {
    const pid = String(r.player_id);
    const n = counts.get(pid) ?? 0;
    if (n >= perPlayer) continue;
    counts.set(pid, n + 1);
    kept.push(r);
  }
  return kept;
}

/**
 * Compute team health (0–100) from per-category attention counts.
 *
 * Only categories that actually have player data count toward the average. An
 * empty category (no players with that metric) is "insufficient data", NOT a
 * perfect score, so it is excluded rather than inflating team health to a false
 * 100 (P2-17). With no scorable categories, health is 0 (no signal).
 */
export function computeTeamHealth(
  categories: Array<{ players: { length: number }; attentionCount: number }>,
): number {
  const healthScores = categories
    .filter((c) => c.players.length > 0)
    .map((c) => 1 - c.attentionCount / c.players.length);
  if (healthScores.length === 0) return 0;
  return Math.round(
    (healthScores.reduce((a, b) => a + b, 0) / healthScores.length) * 100,
  );
}

/**
 * Fairway % or GIR % over a player's countable rounds: summed hits over
 * summed opportunities (not a mean of per-round percentages), from the
 * `golf_rounds` totals the action already reads. Returns `undefined` for any
 * other metric (the caller keeps its own source) and `null` when no round
 * carries the totals. Replaces the stats cache for these two, which counted
 * non-countable rounds and ran a median 11 days stale (2026-09 audit row 2).
 */
export function countableRatioPct(
  rows: readonly Record<string, unknown>[],
  metric: string,
): number | null | undefined {
  const cols =
    metric === 'driving_accuracy_percentage'
      ? (['total_fairways_hit', 'total_fairways'] as const)
      : metric === 'gir_percentage'
        ? (['total_gir', 'total_gir_possible'] as const)
        : null;
  if (!cols) return undefined;
  let made = 0;
  let total = 0;
  for (const r of rows) {
    const m = r[cols[0]];
    const t = r[cols[1]];
    if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) continue;
    made += typeof m === 'number' && Number.isFinite(m) ? m : 0;
    total += t;
  }
  return total > 0 ? (made / total) * 100 : null;
}
