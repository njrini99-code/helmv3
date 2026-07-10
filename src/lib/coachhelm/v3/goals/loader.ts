/**
 * v3 Goals loader.
 *
 * Read-side queries against golf_goals + golf_goal_suggestions. RLS
 * (Pattern 1 — player owns rows; coach sees assigned+shared) handles
 * authz; this module just composes the queries.
 *
 * Server actions (createGoal, accept, dismiss, etc.) live in
 * src/app/golf/actions/v3/goals.ts.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { Goal, GoalSuggestion } from './types';

/**
 * Load every goal for a player. Ordered by state (active first), then
 * ends_at ascending so soonest-due bubbles to the top.
 */
async function loadPlayerGoals(playerId: string): Promise<Goal[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('golf_goals')
    .select('*')
    .eq('player_id', playerId)
    .order('state', { ascending: true })
    .order('ends_at', { ascending: true });
  if (error) {
    throw new Error(`loadPlayerGoals(${playerId}): ${error.message}`);
  }
  return (data ?? []) as unknown as Goal[];
}

/**
 * Convenience — just the active subset.
 */
export async function loadActiveGoals(playerId: string): Promise<Goal[]> {
  const all = await loadPlayerGoals(playerId);
  return all.filter((g) => g.state === 'active');
}

/**
 * Batched variant of {@link loadActiveGoals} for multi-player surfaces (e.g.
 * the coach development page) — resolves EVERY given player's active goals in
 * a single `.in('player_id', ...)` query instead of N per-player round trips,
 * then groups in memory. Filters to `state = 'active'` server-side (so the
 * per-player ordering below is equivalent to loadPlayerGoals' state-then-
 * ends_at order, since every row here already has state='active').
 *
 * Returns a Map keyed by player_id; players with no active goals get an empty
 * array, so callers can rely on `.get(id)` returning an array for every
 * requested id.
 */
export async function loadActiveGoalsForPlayers(
  playerIds: string[],
): Promise<Map<string, Goal[]>> {
  const result = new Map<string, Goal[]>();
  const ids = [...new Set(playerIds.filter(Boolean))];
  for (const id of ids) result.set(id, []);
  if (ids.length === 0) return result;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('golf_goals')
    .select('*')
    .in('player_id', ids)
    .eq('state', 'active')
    .order('ends_at', { ascending: true });
  if (error) {
    throw new Error(`loadActiveGoalsForPlayers: ${error.message}`);
  }
  for (const row of (data ?? []) as unknown as Goal[]) {
    const list = result.get(row.player_id);
    if (list) list.push(row);
    else result.set(row.player_id, [row]);
  }
  return result;
}

/**
 * Recently ACHIEVED goals — the validated-win surface. Goals whose terminal
 * outcome resolved to 'achieved' within the last `withinDays`, newest win
 * first. `loadActiveGoals` (active-only) drops these, so without this loader a
 * hit goal would silently vanish; this keeps the win visible for a while.
 */
export async function loadRecentlyAchievedGoals(
  playerId: string,
  withinDays = 30,
  limit = 6,
): Promise<Goal[]> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - withinDays * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('golf_goals')
    .select('*')
    .eq('player_id', playerId)
    .eq('state', 'achieved')
    .gte('outcome_evaluated_at', since)
    .order('outcome_evaluated_at', { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`loadRecentlyAchievedGoals(${playerId}): ${error.message}`);
  }
  return (data ?? []) as unknown as Goal[];
}

/**
 * Load pending suggestions for a player (state = 'pending' AND not expired).
 * Returns up to `limit` newest-first.
 */
export async function loadPendingGoalSuggestions(
  playerId: string,
  limit = 3,
): Promise<GoalSuggestion[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('golf_goal_suggestions')
    .select('*')
    .eq('player_id', playerId)
    .eq('state', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('suggested_at', { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`loadPendingGoalSuggestions(${playerId}): ${error.message}`);
  }
  return (data ?? []) as unknown as GoalSuggestion[];
}
